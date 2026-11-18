#!/usr/bin/env node
// M12 slice 1b task 3: the iOS app version follows package.json.
//
//   node scripts/sync-ios-version.mjs            write MARKETING_VERSION (+ build number) if needed
//   node scripts/sync-ios-version.mjs --check    exit 1 if the project differs; writes nothing
//   node scripts/sync-ios-version.mjs --build    also raise the build number for the same version
//
// - MARKETING_VERSION (Info.plist CFBundleShortVersionString) = package.json "version".
// - CURRENT_PROJECT_VERSION (Info.plist CFBundleVersion) = a build number that only grows. It moves
//   when the version changes (or with --build): the git commit count, or the old number + 1 if that
//   is higher. It is left alone otherwise, so running this before every `cap sync` is a no-op and
//   never leaves project.pbxproj dirty after a commit.
// - Touches nothing else in project.pbxproj: no team id, no bundle id (those stay in the
//   gitignored ios/App/Signing.local.xcconfig).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PBXPROJ = 'ios/App/App.xcodeproj/project.pbxproj';
const MARKETING = /(\bMARKETING_VERSION = )([^;]+)(;)/g;
const BUILD = /(\bCURRENT_PROJECT_VERSION = )([^;]+)(;)/g;
const SEMVER = /^\d+\.\d+\.\d+$/;

const unique = (list) => [...new Set(list)];

/** Distinct values across the build configurations (one each when they agree). */
export function readIosVersion(text) {
  return {
    marketing: unique([...text.matchAll(MARKETING)].map((m) => m[2].trim())),
    builds: unique([...text.matchAll(BUILD)].map((m) => Number(m[2].trim()))),
  };
}

/** The build number to write. Never lower than `current`. */
export function nextBuild({ current, commitCount, versionChanged, force = false }) {
  if (!versionChanged && !force) return current;
  return Math.max(current + 1, commitCount ?? 0);
}

/** Pure: project.pbxproj text in, synced text out. */
export function syncIosVersion(text, { version, commitCount, force = false }) {
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error(`package.json version must be x.y.z, got "${version}"`);
  }
  const before = readIosVersion(text);
  if (before.marketing.length === 0 || before.builds.length === 0) {
    throw new Error('MARKETING_VERSION / CURRENT_PROJECT_VERSION not found in project.pbxproj');
  }
  if (before.builds.some((b) => !Number.isInteger(b) || b < 0)) {
    throw new Error('CURRENT_PROJECT_VERSION must be a whole number');
  }
  const current = Math.max(...before.builds);
  const versionChanged = before.marketing.some((v) => v !== version);
  const build = nextBuild({ current, commitCount, versionChanged, force });
  const out = text
    .replace(MARKETING, (_, a, __, c) => `${a}${version}${c}`)
    .replace(BUILD, (_, a, __, c) => `${a}${build}${c}`);
  return { text: out, changed: out !== text, version, build, before };
}

/** `git rev-list --count HEAD`, or undefined outside a git checkout. */
export function gitCommitCount(root) {
  try {
    const out = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const n = Number(out.trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function main(argv) {
  const flag = (name) => argv.includes(name);
  const rootArg = argv.indexOf('--root');
  const root =
    rootArg >= 0 ? resolve(argv[rootArg + 1]) : fileURLToPath(new URL('..', import.meta.url));
  const file = join(root, PBXPROJ);
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const text = readFileSync(file, 'utf8');

  if (flag('--check')) {
    const { marketing } = readIosVersion(text);
    if (marketing.length === 1 && marketing[0] === version) return 0;
    console.error(
      `iOS MARKETING_VERSION is ${marketing.join(', ') || 'missing'} but package.json is ${version}. ` +
        'Run: node scripts/sync-ios-version.mjs',
    );
    return 1;
  }

  const r = syncIosVersion(text, {
    version,
    commitCount: gitCommitCount(root),
    force: flag('--build'),
  });
  if (!r.changed) {
    console.log(`iOS version already ${r.version} (build ${r.build}).`);
    return 0;
  }
  writeFileSync(file, r.text);
  console.log(`iOS version ${r.before.marketing.join(', ')} -> ${r.version} (build ${r.build}).`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
