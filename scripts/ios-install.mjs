#!/usr/bin/env node
// One command from a clean checkout to Gym Clean on the iPhone, with the bundle gate on both sides
// of the Xcode build. Used by `npm run ios:install`.
//
//   npm run ios:install                         sync, check, build, check the .app, install
//   npm run ios:install -- --device <id|name>   pick the iPhone (else: first paired physical iPhone)
//   npm run ios:install -- --dry-run            everything up to the install; builds unsigned, so it
//                                               needs no signing file and touches no Apple account
//   npm run ios:install -- --allow-dirty        install from uncommitted changes (not recommended)
//   npm run ios:install -- --release            Release configuration (default: Debug, like Xcode Run)
//
// Steps:
//   1. refuse if the git tree is dirty (the installed build must be a commit you can find again)
//   2. npm run ios:sync (version, native web build, cap sync, then check-native-bundle.mjs)
//   3. signing from ios/App/Signing.local.xcconfig (copied in from another checkout of this repo if
//      this one has none; it is gitignored)
//   4. xcodebuild for the device, -allowProvisioningUpdates
//   5. check-native-bundle.mjs --app on the built App.app
//   6. xcrun devicectl device install app
// Nothing here prints the team id or bundle id from the signing file.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPlist } from './check-native-bundle.mjs';

export const SIGNING = 'ios/App/Signing.local.xcconfig';
const PROJECT = 'ios/App/App.xcodeproj';
const DERIVED = 'ios/DerivedData/ios-install';
const PLACEHOLDER_TEAMS = new Set(['ABCDE12345']);
const PLACEHOLDER_IDS = new Set(['com.yourname.gymclean', 'com.example.gymclean']);

export function parseArgs(argv) {
  const opts = { device: undefined, dryRun: false, allowDirty: false, configuration: 'Debug' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--allow-dirty') opts.allowDirty = true;
    else if (a === '--release') opts.configuration = 'Release';
    else if (a === '--device') {
      opts.device = argv[++i];
      if (!opts.device) throw new Error('--device needs an id or name');
    } else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

/**
 * Pick the iPhone from `devicectl list devices --json-output` data. `wanted` matches the CoreDevice
 * id, the hardware UDID or the name. Without it: the first paired physical iPhone, preferring one
 * that is connected right now.
 */
export function pickDevice(json, wanted) {
  const devices = (json?.result?.devices ?? []).map((d) => ({
    id: d.identifier,
    udid: d.hardwareProperties?.udid,
    name: d.deviceProperties?.name ?? d.identifier,
    physical: d.hardwareProperties?.reality === 'physical',
    iphone: d.hardwareProperties?.deviceType === 'iPhone',
    paired: d.connectionProperties?.pairingState === 'paired',
    connected:
      d.connectionProperties?.tunnelState === 'connected' ||
      d.connectionProperties?.transportType === 'wired',
  }));
  if (wanted) {
    return devices.find((d) => [d.id, d.udid, d.name].includes(wanted)) ?? null;
  }
  const phones = devices.filter((d) => d.physical && d.iphone && d.paired);
  return phones.find((d) => d.connected) ?? phones[0] ?? null;
}

/** Problems with Signing.local.xcconfig text (values are never echoed). */
export function signingProblems(text) {
  const value = (key) =>
    new RegExp(`^\\s*${key}\\s*=\\s*([^\\s/]+)`, 'm').exec(text.replace(/\/\/.*$/gm, ''))?.[1];
  const problems = [];
  const team = value('DEVELOPMENT_TEAM');
  const id = value('PRODUCT_BUNDLE_IDENTIFIER');
  if (!team) problems.push('DEVELOPMENT_TEAM is not set');
  else if (PLACEHOLDER_TEAMS.has(team) || !/^[A-Z0-9]{10}$/.test(team)) {
    problems.push('DEVELOPMENT_TEAM is still the example value or not a 10-character team id');
  }
  if (!id) problems.push('PRODUCT_BUNDLE_IDENTIFIER is not set');
  else if (PLACEHOLDER_IDS.has(id))
    problems.push('PRODUCT_BUNDLE_IDENTIFIER is still the example value');
  return problems;
}

// ---------------------------------------------------------------------------------------------

class Stop extends Error {}

function run(cmd, args, { root, capture = false } = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (r.error) throw new Stop(`${cmd} could not start: ${r.error.message}`);
  if (r.status !== 0) throw new Stop(`${cmd} ${args[0] ?? ''} failed (exit ${r.status})`);
  return r.stdout;
}

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function dirtyFiles(root) {
  return git(root, ['status', '--porcelain']).split('\n').filter(Boolean);
}

function refuseIfDirty(root, when) {
  const files = dirtyFiles(root);
  if (!files.length) return;
  const list = files
    .slice(0, 10)
    .map((f) => `    ${f}`)
    .join('\n');
  const more = files.length > 10 ? `\n    … and ${files.length - 10} more` : '';
  throw new Stop(
    `${when}, the git tree has uncommitted changes:\n${list}${more}\n` +
      'Commit them first, so the installed build matches a commit (or pass --allow-dirty).',
  );
}

/** Use ios/App/Signing.local.xcconfig, copying it in from another worktree of this repo if needed. */
function ensureSigning(root) {
  const here = join(root, SIGNING);
  if (!existsSync(here)) {
    const others = git(root, ['worktree', 'list', '--porcelain'])
      .split('\n')
      .filter((l) => l.startsWith('worktree '))
      .map((l) => join(l.slice('worktree '.length), SIGNING))
      .filter((p) => resolve(p) !== resolve(here) && existsSync(p));
    if (!others.length) {
      throw new Stop(
        `${SIGNING} is missing. Make it once (docs/ios-setup.md, "4. Your bundle id and team").`,
      );
    }
    copyFileSync(others[0], here);
    console.log(`Signing: copied ${SIGNING} from ${others[0]} (gitignored).`);
  }
  const problems = signingProblems(readFileSync(here, 'utf8'));
  if (problems.length) throw new Stop(`${SIGNING}: ${problems.join('; ')}.`);
}

function listDevices(root) {
  const dir = mkdtempSync(join(tmpdir(), 'gym-clean-devices-'));
  const out = join(dir, 'devices.json');
  try {
    const r = spawnSync('xcrun', ['devicectl', 'list', 'devices', '--json-output', out], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'pipe'],
      encoding: 'utf8',
    });
    if (r.status !== 0 || !existsSync(out)) {
      throw new Stop(
        `xcrun devicectl list devices failed: ${(r.stderr ?? '').trim() || r.error?.message}`,
      );
    }
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function main(argv, root = fileURLToPath(new URL('..', import.meta.url))) {
  const opts = parseArgs(argv);
  const sha = git(root, ['rev-parse', '--short', 'HEAD']) || 'unknown';
  if (!opts.allowDirty) refuseIfDirty(root, 'Before syncing');

  // 2. sync + bundle gate (ios:sync ends with ios:check)
  run('npm', ['run', 'ios:sync'], { root });
  if (!opts.allowDirty) refuseIfDirty(root, 'After npm run ios:sync (it changed tracked files)');
  const dirty = dirtyFiles(root).length > 0;

  // 3. device
  let device = null;
  try {
    device = pickDevice(listDevices(root), opts.device);
  } catch (e) {
    if (!opts.dryRun) throw e;
    console.log(`(dry run) ${e.message}`);
  }
  if (!device && !opts.dryRun) {
    throw new Stop(
      opts.device
        ? `No device matches "${opts.device}" in xcrun devicectl list devices.`
        : 'No paired iPhone found. Plug it in, unlock it, tap Trust (docs/ios-setup.md step 5).',
    );
  }
  if (device)
    console.log(`\nDevice: ${device.name}${device.connected ? '' : ' (not connected right now)'}`);

  // 4. signing + build
  const xcodeArgs = [
    '-project',
    PROJECT,
    '-scheme',
    'App',
    '-configuration',
    opts.configuration,
    '-derivedDataPath',
    DERIVED,
    '-quiet',
  ];
  if (opts.dryRun) {
    // Unsigned: no signing file needed and no profile created on the Apple account.
    xcodeArgs.push('-destination', 'generic/platform=iOS', 'CODE_SIGNING_ALLOWED=NO');
  } else {
    ensureSigning(root);
    xcodeArgs.push('-destination', `id=${device.udid ?? device.id}`, '-allowProvisioningUpdates');
  }
  const app = join(root, DERIVED, `Build/Products/${opts.configuration}-iphoneos/App.app`);
  // A fresh product, so files from an earlier build (e.g. a web-mode sw.js) can't linger in it.
  rmSync(app, { recursive: true, force: true });
  run('xcodebuild', [...xcodeArgs, 'build'], { root });
  if (!existsSync(app)) throw new Stop(`xcodebuild finished but ${app} is missing`);

  // 5. the same gate on the built app
  run(process.execPath, [join(root, 'scripts/check-native-bundle.mjs'), '--app', app], { root });

  const plist = readPlist(join(app, 'Info.plist'));
  const what =
    `Gym Clean ${plist.CFBundleShortVersionString} (build ${plist.CFBundleVersion}), ` +
    `git ${sha}${dirty ? ' + uncommitted changes' : ''}, ${opts.configuration}`;

  // 6. install
  if (opts.dryRun) {
    console.log(`\nDry run: built and checked ${what}. Not installed.\n  ${app}`);
    return 0;
  }
  run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.id, app], { root });
  console.log(`\nInstalled ${what} on ${device.name}.`);
  console.log('On the iPhone: open Gym Clean → Settings → Self-check, and expect every line ✓.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`\nios:install stopped: ${e instanceof Error ? e.message : String(e)}`);
    console.error('Nothing was installed.');
    process.exitCode = 1;
  }
}
