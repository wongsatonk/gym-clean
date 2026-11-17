#!/usr/bin/env node
// Hard gate before an iPhone install: is the native bundle complete?
//
//   node scripts/check-native-bundle.mjs                 check ios/App/App/public after `cap sync`
//   node scripts/check-native-bundle.mjs --app <App.app> check a built app (its Info.plist + public/)
//   node scripts/check-native-bundle.mjs --root <dir>    check another checkout (tests use this)
//
// Exits 1 with a plain list of what is wrong. Why it exists: 1.14.0 went onto the iPhone without
// the MediaPipe wasm runtime (public/mediapipe/ is gitignored and filled by postinstall, which never
// ran in a scratch worktree), so the camera's pose model failed on the phone and nothing caught it.
//
// Checks (each reads files only; nothing is changed):
//   - index.html present, and every local file it loads is in the bundle
//   - built in native mode: no service worker, workbox, registerSW.js or web manifest
//   - MediaPipe wasm runtime (.js + .wasm) present, not tiny, same size as node_modules' copy
//   - pose model present, same size and sha256 as public/models/ in the repo
//   - the bundled JS carries the package.json version
//   - the app version (project MARKETING_VERSION, or the built Info.plist) = package.json version
//   - Info.plist has a usage string for every permission the code asks for (found by searching
//     the Swift and TypeScript sources, not a fixed list)
//   - capacitor.config.json: expected appId, no server.url, npm plugin classes listed
//   - plugins: every ios/App/App/Plugins/<Name> is registered in AppViewController, the storyboard
//     uses AppViewController, the npm Capacitor plugins are in CapApp-SPM/Package.swift; with --app
//     the built binary also contains each plugin
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PBXPROJ, readIosVersion } from './sync-ios-version.mjs';

export const IOS_APP = 'ios/App/App';
export const WASM_FILES = [
  // [file, smallest believable size in bytes]
  ['vision_wasm_internal.js', 100_000],
  ['vision_wasm_internal.wasm', 1_000_000],
];
export const MODEL = 'models/pose_landmarker_lite.task';
/** Local plugins that must exist and be registered (more are picked up from Plugins/). */
export const REQUIRED_LOCAL_PLUGINS = ['GymBrain', 'GymSpeech', 'GymHealth'];
/** Files that only the web (PWA) build makes. Any of them means the wrong build was synced. */
const WEB_ONLY = [/^sw\.js$/, /^registerSW\.js$/, /^workbox-.*\.js$/, /^manifest\.webmanifest$/];

/**
 * Info.plist usage strings, keyed to the code that needs them. A key is required when one of its
 * patterns matches a source file (Swift under ios/App/App, TypeScript under src/, tests excluded).
 */
export const USAGE_RULES = [
  {
    key: 'NSCameraUsageDescription',
    patterns: [/getUserMedia\(\s*\{[^}]*video\s*:\s*(?!false)/s, /\bcapture=/, /AVCaptureDevice/],
  },
  {
    key: 'NSMicrophoneUsageDescription',
    patterns: [
      /getUserMedia\(\s*\{[^}]*audio\s*:\s*(?!false)/s,
      /AVAudioApplication\b.*recordPermission|requestRecordPermission/,
      /AVAudioRecorder|AVAudioEngine\(\)/,
    ],
  },
  {
    key: 'NSSpeechRecognitionUsageDescription',
    patterns: [/SFSpeechRecognizer|SpeechAnalyzer|SpeechTranscriber/],
  },
  { key: 'NSHealthShareUsageDescription', patterns: [/HKHealthStore/] },
  // Writing to Health needs its own string; `toShare: []` (read only) does not.
  { key: 'NSHealthUpdateUsageDescription', patterns: [/toShare:\s*(?!\[\])[^\s,)]/] },
  {
    key: 'NSMotionUsageDescription',
    patterns: [/CMHeadphoneMotionManager|CMMotionActivityManager|CMPedometer|CMMotionManager/],
  },
  {
    key: 'NSLocationWhenInUseUsageDescription',
    patterns: [/CLLocationManager|navigator\.geolocation/],
  },
  { key: 'NSPhotoLibraryUsageDescription', patterns: [/PHPhotoLibrary/] },
  { key: 'NSPhotoLibraryAddUsageDescription', patterns: [/UIImageWriteToSavedPhotosAlbum/] },
  { key: 'NSBluetoothAlwaysUsageDescription', patterns: [/CBCentralManager|CBPeripheralManager/] },
  { key: 'NSContactsUsageDescription', patterns: [/CNContactStore/] },
  { key: 'NSCalendarsFullAccessUsageDescription', patterns: [/EKEventStore/] },
  { key: 'NSFaceIDUsageDescription', patterns: [/LAContext/] },
];

// ---------------------------------------------------------------------------------------------
// Small helpers

const exists = (p) => existsSync(p);
const sizeOf = (p) => statSync(p).size;
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

function walk(dir, { skip = () => false } = {}) {
  const out = [];
  if (!exists(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (skip(p, entry)) continue;
    if (entry.isDirectory()) out.push(...walk(p, { skip }));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

/** Top-level string values of a plist (XML or binary). Binary plists go through macOS plutil. */
export function readPlist(path) {
  const buf = readFileSync(path);
  let xml = buf.toString('utf8');
  if (buf.subarray(0, 6).toString('latin1') === 'bplist') {
    xml = execFileSync('plutil', ['-convert', 'xml1', '-o', '-', path], { encoding: 'utf8' });
  }
  const unescape = (s) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  const values = {};
  for (const m of xml.matchAll(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g)) {
    values[m[1]] ??= unescape(m[2]);
  }
  return values;
}

/** The appId in capacitor.config.ts (or .json). */
export function expectedAppId(root) {
  const ts = join(root, 'capacitor.config.ts');
  if (exists(ts)) return /\bappId\s*:\s*['"]([^'"]+)['"]/.exec(readFileSync(ts, 'utf8'))?.[1];
  const json = join(root, 'capacitor.config.json');
  if (exists(json)) return JSON.parse(readFileSync(json, 'utf8')).appId;
  return undefined;
}

/** npm Capacitor plugins from package.json, e.g. haptics -> { product, className }. */
export function npmPlugins(pkg) {
  const notPlugins = new Set(['core', 'ios', 'android', 'cli']);
  return Object.keys(pkg.dependencies ?? {})
    .filter((n) => n.startsWith('@capacitor/') && !notPlugins.has(n.slice('@capacitor/'.length)))
    .map((name) => {
      const pascal = name
        .slice('@capacitor/'.length)
        .split('-')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join('');
      return { name, product: `Capacitor${pascal}`, className: `${pascal}Plugin` };
    });
}

/** Which usage strings the code needs: { key, evidence }[] (first matching file per key). */
export function requiredUsageKeys(root) {
  const isTest = (p) => /\.test\.|\/Tests?\//.test(p) || /\/e2e\//.test(p);
  const files = [
    ...walk(join(root, IOS_APP), {
      skip: (p, e) =>
        (e.isDirectory() && (basename(p) === 'public' || basename(p) === '.build')) || isTest(p),
    }).filter((p) => p.endsWith('.swift')),
    ...walk(join(root, 'src')).filter((p) => /\.(ts|js)$/.test(p) && !isTest(p)),
  ];
  // Whole-line comments don't ask for anything.
  const code = (p) =>
    readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
  const texts = files.map((p) => [relative(root, p), code(p)]);
  const found = [];
  for (const rule of USAGE_RULES) {
    const hit = texts.find(([, text]) => rule.patterns.some((re) => re.test(text)));
    if (hit) found.push({ key: rule.key, evidence: hit[0] });
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Checks. Each returns a list of problems (plain sentences); empty = fine.

export function checkIndex(pub) {
  const index = join(pub, 'index.html');
  if (!exists(index)) return [`index.html is missing from ${pub} (did cap sync run?)`];
  const html = readFileSync(index, 'utf8');
  const problems = [];
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
    const local = ref.replace(/[?#].*$/, '').replace(/^\.?\//, '');
    if (local && !exists(join(pub, local)))
      problems.push(`index.html loads ${ref}, which is not in the bundle`);
  }
  return problems;
}

export function checkNativeMode(pub) {
  if (!exists(pub)) return [];
  const problems = [];
  const webFiles = readdirSync(pub).filter((f) => WEB_ONLY.some((re) => re.test(f)));
  if (webFiles.length) {
    problems.push(
      `web (PWA) build synced instead of the native one: ${webFiles.join(', ')} found. Run npm run ios:sync (it builds with --mode native).`,
    );
  }
  const index = join(pub, 'index.html');
  if (exists(index) && /registerSW|manifest\.webmanifest/.test(readFileSync(index, 'utf8'))) {
    problems.push('index.html registers a service worker or web manifest (web build, not native)');
  }
  return problems;
}

export function checkWasm(pub, root) {
  const problems = [];
  for (const [file, min] of WASM_FILES) {
    const p = join(pub, 'mediapipe/wasm', file);
    if (!exists(p)) {
      problems.push(
        `mediapipe/wasm/${file} is missing: the camera's pose model cannot load. Run node scripts/copy-mediapipe-wasm.mjs --strict, then npm run ios:sync.`,
      );
      continue;
    }
    const size = sizeOf(p);
    if (size < min) {
      problems.push(`mediapipe/wasm/${file} is only ${size} bytes (expected at least ${min})`);
      continue;
    }
    const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm', file);
    if (exists(src) && sizeOf(src) !== size) {
      problems.push(
        `mediapipe/wasm/${file} is ${size} bytes but node_modules has ${sizeOf(src)} (stale copy; rerun npm run ios:sync)`,
      );
    }
  }
  return problems;
}

export function checkModel(pub, root) {
  const p = join(pub, MODEL);
  if (!exists(p)) return [`${MODEL} is missing: the camera's pose model cannot load`];
  const repo = join(root, 'public', MODEL);
  if (!exists(repo))
    return [`public/${MODEL} is missing from the repo, so the bundled model can't be compared`];
  if (sizeOf(p) !== sizeOf(repo)) {
    return [`${MODEL} is ${mb(sizeOf(p))} but the repo copy is ${mb(sizeOf(repo))}`];
  }
  if (sha256(p) !== sha256(repo)) return [`${MODEL} differs from the repo copy (sha256 mismatch)`];
  return [];
}

export function checkJsVersion(pub, version) {
  const js = walk(join(pub, 'assets')).filter((p) => p.endsWith('.js'));
  if (!js.length) return ['no JavaScript in assets/: the web build is missing'];
  const needle = new RegExp(`["'\`]${version.replace(/\./g, '\\.')}["'\`]`);
  if (js.some((p) => needle.test(readFileSync(p, 'utf8')))) return [];
  return [
    `the bundled JavaScript does not contain version ${version} (built from an older checkout?)`,
  ];
}

export function checkProjectVersion(root, version) {
  const file = join(root, PBXPROJ);
  if (!exists(file)) return [`${PBXPROJ} is missing`];
  const { marketing } = readIosVersion(readFileSync(file, 'utf8'));
  if (marketing.length === 1 && marketing[0] === version) return [];
  return [
    `Xcode MARKETING_VERSION is ${marketing.join(', ') || 'missing'} but package.json is ${version}. Run npm run ios:version.`,
  ];
}

export function checkUsageStrings(plist, required, where) {
  const problems = [];
  for (const { key, evidence } of required) {
    const v = plist[key];
    if (v === undefined) problems.push(`${where} has no ${key} (needed by ${evidence})`);
    else if (!v.trim() || /\$\(/.test(v)) problems.push(`${where} ${key} is empty or unexpanded`);
  }
  return problems;
}

export function checkCapacitorConfig(path, { appId, plugins }) {
  if (!exists(path)) return [`${basename(path)} is missing next to public/ (did cap sync run?)`];
  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return [`${basename(path)} is not valid JSON`];
  }
  const problems = [];
  if (appId && config.appId !== appId) {
    problems.push(`capacitor.config.json appId is ${config.appId}, expected ${appId}`);
  }
  if (config.server?.url) {
    problems.push(
      `capacitor.config.json has server.url (${config.server.url}): the app would load from the network`,
    );
  }
  const listed = config.packageClassList ?? [];
  for (const p of plugins) {
    if (!listed.includes(p.className)) {
      problems.push(`capacitor.config.json packageClassList lacks ${p.className} (${p.name})`);
    }
  }
  return problems;
}

export function localPlugins(root) {
  const dir = join(root, IOS_APP, 'Plugins');
  const found = exists(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
  return [...new Set([...REQUIRED_LOCAL_PLUGINS, ...found])];
}

export function checkPluginSources(root, { plugins }) {
  const problems = [];
  const vcPath = join(root, IOS_APP, 'AppViewController.swift');
  const vc = exists(vcPath) ? readFileSync(vcPath, 'utf8') : '';
  if (!vc) problems.push(`${IOS_APP}/AppViewController.swift is missing`);
  // Ignore commented-out lines.
  const code = vc
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
  for (const name of localPlugins(root)) {
    if (!exists(join(root, IOS_APP, 'Plugins', name))) {
      problems.push(`${IOS_APP}/Plugins/${name} is missing`);
    }
    if (vc && !new RegExp(`registerPluginInstance\\(\\s*${name}Plugin\\(\\)\\s*\\)`).test(code)) {
      problems.push(`AppViewController does not register ${name}Plugin()`);
    }
  }
  const board = join(root, IOS_APP, 'Base.lproj/Main.storyboard');
  if (exists(board) && !/customClass="AppViewController"/.test(readFileSync(board, 'utf8'))) {
    problems.push(
      'Main.storyboard does not use AppViewController, so no local plugin is registered',
    );
  }
  const spmPath = join(root, 'ios/App/CapApp-SPM/Package.swift');
  const spm = exists(spmPath) ? readFileSync(spmPath, 'utf8') : '';
  if (!spm) problems.push('ios/App/CapApp-SPM/Package.swift is missing (did cap sync run?)');
  for (const p of plugins) {
    if (spm && !spm.includes(`.product(name: "${p.product}"`)) {
      problems.push(`CapApp-SPM/Package.swift does not include ${p.product} (${p.name})`);
    }
  }
  return problems;
}

/** --app: every plugin's class name must be in the compiled code (App, App.debug.dylib, …). */
export function checkPluginBinaries(appDir, names) {
  const bins = walk(appDir, {
    skip: (p, e) => e.isDirectory() && (basename(p) === 'public' || p.endsWith('.bundle')),
  }).filter((p) => {
    const head = readFileSync(p).subarray(0, 4).readUInt32LE(0);
    return head === 0xfeedfacf || head === 0xbebafeca; // Mach-O 64 / fat
  });
  if (!bins.length) return [`no executable found in ${appDir}`];
  const blobs = bins.map((p) => readFileSync(p));
  return names
    .filter((n) => !blobs.some((b) => b.includes(n)))
    .map((n) => `the built app does not contain ${n} (plugin not compiled in)`);
}

// ---------------------------------------------------------------------------------------------

/**
 * Run every check. `app` = path to a built App.app (optional).
 * Returns { problems, info } where info has version/build for the caller to print.
 */
export function checkNativeBundle({ root, app } = {}) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const version = pkg.version;
  const plugins = npmPlugins(pkg);
  const appId = expectedAppId(root);
  const base = app ?? join(root, IOS_APP);
  const pub = join(base, 'public');
  const plistPath = join(app ?? join(root, IOS_APP), 'Info.plist');
  const problems = [];
  const info = { version, target: app ? 'built app' : relative(root, pub) || pub };

  if (app && !exists(app)) return { problems: [`${app} does not exist`], info };
  if (!exists(pub)) {
    problems.push(`${pub} is missing (run npm run ios:sync)`);
  } else {
    problems.push(...checkIndex(pub));
  }
  problems.push(...checkNativeMode(pub));
  problems.push(...checkWasm(pub, root));
  problems.push(...checkModel(pub, root));
  problems.push(...checkJsVersion(pub, version));
  problems.push(...checkProjectVersion(root, version));

  if (!exists(plistPath)) {
    problems.push(`${plistPath} is missing`);
  } else {
    const plist = readPlist(plistPath);
    if (app) {
      info.build = plist.CFBundleVersion;
      info.bundleId = plist.CFBundleIdentifier;
      if (plist.CFBundleShortVersionString !== version) {
        problems.push(
          `the built app is version ${plist.CFBundleShortVersionString}, package.json is ${version}`,
        );
      }
    }
    problems.push(
      ...checkUsageStrings(plist, requiredUsageKeys(root), app ? 'built Info.plist' : 'Info.plist'),
    );
  }

  problems.push(...checkCapacitorConfig(join(base, 'capacitor.config.json'), { appId, plugins }));
  problems.push(...checkPluginSources(root, { plugins }));
  if (app) {
    const names = [
      ...localPlugins(root).map((n) => `${n}Plugin`),
      ...plugins.map((p) => p.className),
    ];
    problems.push(...checkPluginBinaries(app, names));
  }
  return { problems, info };
}

function main(argv) {
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const root = resolve(opt('--root') ?? fileURLToPath(new URL('..', import.meta.url)));
  const appArg = opt('--app');
  if (argv.includes('--app') && !appArg) {
    console.error('usage: check-native-bundle.mjs [--root <dir>] [--app <path to App.app>]');
    return 2;
  }
  const app = appArg ? resolve(appArg) : undefined;
  const { problems, info } = checkNativeBundle({ root, app });
  const what = app ? `built app ${app}` : `${IOS_APP}/public`;
  if (problems.length) {
    console.error(`Native bundle check FAILED for ${what} (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Do not install this build.');
    return 1;
  }
  const build = info.build ? ` (build ${info.build})` : '';
  console.log(`Native bundle check passed for ${what}: version ${info.version}${build}.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(
      `Native bundle check could not run: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exitCode = 1;
  }
}
