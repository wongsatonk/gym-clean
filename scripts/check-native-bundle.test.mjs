// node --test scripts/check-native-bundle.test.mjs
// The native bundle gate (check-native-bundle.mjs). Every test builds a small made-up checkout in a
// temp folder: a good bundle passes, and each way 1.14.0-style breakage can happen fails by name.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import {
  checkNativeBundle,
  npmPlugins,
  readPlist,
  requiredUsageKeys,
} from './check-native-bundle.mjs';

const SCRIPT = fileURLToPath(new URL('./check-native-bundle.mjs', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'check-native-bundle-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const VERSION = '2.3.4';
const MODEL = Buffer.alloc(4096, 7);

function put(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const plist = (entries) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${Object.entries(entries)
  .map(([k, v]) => `\t<key>${k}</key>\n\t<string>${v}</string>`)
  .join('\n')}
</dict>
</plist>
`;

const USAGE = {
  NSCameraUsageDescription: 'Counts your reps on this phone.',
  NSMicrophoneUsageDescription: 'Lets you talk to the coach.',
  NSSpeechRecognitionUsageDescription: 'Turns speech into text on this phone.',
  NSHealthShareUsageDescription: 'Reads workouts. Stays on this phone.',
};

const pbx = (v) =>
  `MARKETING_VERSION = ${v};\nCURRENT_PROJECT_VERSION = 9;\nMARKETING_VERSION = ${v};\n`;

/** A complete, healthy checkout + synced bundle. */
let n = 0;
function makeRoot() {
  const root = join(tmp, `root-${n++}`);
  put(
    root,
    'package.json',
    JSON.stringify({
      version: VERSION,
      dependencies: {
        '@capacitor/core': '8',
        '@capacitor/haptics': '8',
        '@capacitor/local-notifications': '8',
      },
    }),
  );
  put(
    root,
    'capacitor.config.ts',
    "const config = { appId: 'com.example.test', webDir: 'dist' };\n",
  );
  put(root, 'public/models/pose_landmarker_lite.task', MODEL);
  put(root, 'ios/App/App.xcodeproj/project.pbxproj', pbx(VERSION));
  // Code that asks for permissions (the usage-string rules key off these).
  put(
    root,
    'src/pose/camera.ts',
    'await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });\n',
  );
  put(
    root,
    'src/pose/camera.test.ts',
    'navigator.geolocation.getCurrentPosition(); // tests are ignored\n',
  );
  put(
    root,
    'ios/App/App/Plugins/GymSpeech/Engine.swift',
    'await AVAudioApplication.requestRecordPermission()\nlet a = SpeechAnalyzer(modules: [])\n',
  );
  put(
    root,
    'ios/App/App/Plugins/GymHealth/Health.swift',
    'let store = HKHealthStore()\ntry await store.requestAuthorization(toShare: [], read: types)\n',
  );
  put(
    root,
    'ios/App/App/Plugins/GymBrain/Brain.swift',
    '// CMHeadphoneMotionManager only in a comment\n',
  );
  put(
    root,
    'ios/App/App/AppViewController.swift',
    [
      'class AppViewController: CAPBridgeViewController {',
      '  override open func capacitorDidLoad() {',
      '    bridge?.registerPluginInstance(GymHealthPlugin())',
      '    bridge?.registerPluginInstance(GymSpeechPlugin())',
      '    bridge?.registerPluginInstance(GymBrainPlugin())',
      '  }',
      '}',
    ].join('\n'),
  );
  put(
    root,
    'ios/App/App/Base.lproj/Main.storyboard',
    '<viewController customClass="AppViewController"/>',
  );
  put(
    root,
    'ios/App/CapApp-SPM/Package.swift',
    '.product(name: "Capacitor", package: "x"),\n.product(name: "CapacitorHaptics", package: "CapacitorHaptics"),\n.product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications")\n',
  );
  put(
    root,
    'ios/App/App/Info.plist',
    plist({ CFBundleShortVersionString: '$(MARKETING_VERSION)', ...USAGE }),
  );
  put(
    root,
    'ios/App/App/capacitor.config.json',
    JSON.stringify({
      appId: 'com.example.test',
      packageClassList: ['HapticsPlugin', 'LocalNotificationsPlugin'],
    }),
  );
  // The synced web bundle (native mode).
  const pub = 'ios/App/App/public';
  put(
    root,
    `${pub}/index.html`,
    '<script type="module" src="/assets/index-abc.js"></script><link href="/assets/index.css"><a href="https://example.org">x</a>',
  );
  put(root, `${pub}/assets/index-abc.js`, `const r="${VERSION}";`);
  put(root, `${pub}/assets/index.css`, 'body{}');
  put(root, `${pub}/mediapipe/wasm/vision_wasm_internal.js`, Buffer.alloc(150_000, 1));
  put(root, `${pub}/mediapipe/wasm/vision_wasm_internal.wasm`, Buffer.alloc(1_200_000, 2));
  put(root, `${pub}/${'models/pose_landmarker_lite.task'}`, MODEL);
  return root;
}

const problems = (root, app) => checkNativeBundle({ root, app }).problems;
const PUB = 'ios/App/App/public';

describe('checkNativeBundle on a cap-synced checkout', () => {
  it('passes a complete native bundle', () => {
    assert.deepEqual(problems(makeRoot()), []);
  });

  it('fails without the MediaPipe wasm runtime (the 1.14.0 bug)', () => {
    const root = makeRoot();
    rmSync(join(root, PUB, 'mediapipe'), { recursive: true });
    const p = problems(root);
    assert.equal(
      p.filter((x) => /mediapipe\/wasm\/vision_wasm_internal\.(js|wasm) is missing/.test(x)).length,
      2,
    );
  });

  it('fails on a tiny (truncated) wasm file', () => {
    const root = makeRoot();
    put(root, `${PUB}/mediapipe/wasm/vision_wasm_internal.wasm`, 'x');
    assert.match(problems(root).join('\n'), /vision_wasm_internal\.wasm is only 1 bytes/);
  });

  it('fails when the wasm differs from node_modules', () => {
    const root = makeRoot();
    put(
      root,
      'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js',
      Buffer.alloc(150_001, 1),
    );
    assert.match(
      problems(root).join('\n'),
      /vision_wasm_internal\.js is 150000 bytes but node_modules has 150001/,
    );
  });

  it('fails on a web (PWA) build', () => {
    const root = makeRoot();
    put(root, `${PUB}/sw.js`, '');
    put(root, `${PUB}/registerSW.js`, '');
    put(root, `${PUB}/workbox-1234.js`, '');
    put(root, `${PUB}/manifest.webmanifest`, '{}');
    const p = problems(root).join('\n');
    assert.match(p, /web \(PWA\) build synced instead of the native one/);
    for (const f of ['sw.js', 'registerSW.js', 'workbox-1234.js', 'manifest.webmanifest'])
      assert.ok(p.includes(f), f);
  });

  it('fails when index.html registers a service worker', () => {
    const root = makeRoot();
    put(
      root,
      `${PUB}/index.html`,
      '<script src="/assets/index-abc.js"></script><script id="vite-plugin-pwa:register-sw" src="/registerSW.js"></script>',
    );
    const p = problems(root).join('\n');
    assert.match(p, /registers a service worker/);
    assert.match(p, /index\.html loads \/registerSW\.js, which is not in the bundle/);
  });

  it('fails without index.html', () => {
    const root = makeRoot();
    rmSync(join(root, PUB, 'index.html'));
    assert.match(problems(root).join('\n'), /index\.html is missing/);
  });

  it('fails when the pose model is missing or differs from the repo', () => {
    const missing = makeRoot();
    rmSync(join(missing, PUB, 'models'), { recursive: true });
    assert.match(problems(missing).join('\n'), /models\/pose_landmarker_lite\.task is missing/);
    const sameSize = makeRoot();
    put(sameSize, `${PUB}/models/pose_landmarker_lite.task`, Buffer.alloc(4096, 8));
    assert.match(problems(sameSize).join('\n'), /sha256 mismatch/);
    const otherSize = makeRoot();
    put(otherSize, `${PUB}/models/pose_landmarker_lite.task`, Buffer.alloc(10, 7));
    assert.match(
      problems(otherSize).join('\n'),
      /pose_landmarker_lite\.task is .* but the repo copy is/,
    );
  });

  it('fails when the bundled JS is from another version', () => {
    const root = makeRoot();
    put(root, `${PUB}/assets/index-abc.js`, 'const r="2.3.3";');
    assert.match(problems(root).join('\n'), /does not contain version 2\.3\.4/);
  });

  it('fails when MARKETING_VERSION differs from package.json', () => {
    const root = makeRoot();
    put(root, 'ios/App/App.xcodeproj/project.pbxproj', pbx('2.3.3'));
    assert.match(
      problems(root).join('\n'),
      /MARKETING_VERSION is 2\.3\.3 but package\.json is 2\.3\.4/,
    );
  });

  it('fails when a usage string the code needs is missing or empty', () => {
    const root = makeRoot();
    const rest = { ...USAGE };
    delete rest.NSCameraUsageDescription;
    put(root, 'ios/App/App/Info.plist', plist({ ...rest, NSMicrophoneUsageDescription: ' ' }));
    const p = problems(root).join('\n');
    assert.match(p, /no NSCameraUsageDescription \(needed by src\/pose\/camera\.ts\)/);
    assert.match(p, /NSMicrophoneUsageDescription is empty/);
  });

  it('fails when Info.plist is missing', () => {
    const root = makeRoot();
    rmSync(join(root, 'ios/App/App/Info.plist'));
    assert.match(problems(root).join('\n'), /Info\.plist is missing/);
  });

  it('fails on a wrong appId, a server.url or a missing plugin class', () => {
    const root = makeRoot();
    put(
      root,
      'ios/App/App/capacitor.config.json',
      JSON.stringify({
        appId: 'com.other',
        server: { url: 'http://192.168.1.2:5173' },
        packageClassList: ['HapticsPlugin'],
      }),
    );
    const p = problems(root).join('\n');
    assert.match(p, /appId is com\.other, expected com\.example\.test/);
    assert.match(p, /server\.url/);
    assert.match(p, /lacks LocalNotificationsPlugin/);
  });

  it('fails when a local plugin is not registered, or a Plugins/ folder has no registration', () => {
    const root = makeRoot();
    put(
      root,
      'ios/App/App/AppViewController.swift',
      'bridge?.registerPluginInstance(GymHealthPlugin())\n// bridge?.registerPluginInstance(GymSpeechPlugin())\nbridge?.registerPluginInstance(GymBrainPlugin())\n',
    );
    put(root, 'ios/App/App/Plugins/GymMotion/Motion.swift', '');
    const p = problems(root).join('\n');
    assert.match(p, /does not register GymSpeechPlugin\(\)/);
    assert.match(p, /does not register GymMotionPlugin\(\)/);
    assert.doesNotMatch(p, /GymHealthPlugin/);
  });

  it('fails when the storyboard does not use AppViewController', () => {
    const root = makeRoot();
    put(
      root,
      'ios/App/App/Base.lproj/Main.storyboard',
      '<viewController customClass="CAPBridgeViewController"/>',
    );
    assert.match(problems(root).join('\n'), /Main\.storyboard does not use AppViewController/);
  });

  it('fails when an npm plugin is missing from CapApp-SPM/Package.swift', () => {
    const root = makeRoot();
    put(
      root,
      'ios/App/CapApp-SPM/Package.swift',
      '.product(name: "CapacitorHaptics", package: "CapacitorHaptics")\n',
    );
    assert.match(
      problems(root).join('\n'),
      /Package\.swift does not include CapacitorLocalNotifications/,
    );
  });

  it('the CLI exits 1 with a plain list, and 0 when all is well', () => {
    const bad = makeRoot();
    rmSync(join(bad, PUB, 'mediapipe/wasm/vision_wasm_internal.wasm'));
    const r = spawnSync(process.execPath, [SCRIPT, '--root', bad], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(
      r.stderr,
      /FAILED.*\n {2}- mediapipe\/wasm\/vision_wasm_internal\.wasm is missing/,
    );
    const good = spawnSync(process.execPath, [SCRIPT, '--root', makeRoot()], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /passed.*version 2\.3\.4/);
  });
});

describe('checkNativeBundle --app (a built App.app)', () => {
  // Mach-O 64-bit magic, then the class names the linker would leave in the binary.
  const binary = (names) =>
    Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(names.join('\0'))]);
  const ALL = [
    'GymBrainPlugin',
    'GymSpeechPlugin',
    'GymHealthPlugin',
    'HapticsPlugin',
    'LocalNotificationsPlugin',
  ];

  function makeApp(root) {
    const app = join(root, 'build/App.app');
    cpSync(join(root, PUB), join(app, 'public'), { recursive: true });
    cpSync(join(root, 'ios/App/App/capacitor.config.json'), join(app, 'capacitor.config.json'));
    put(
      app,
      'Info.plist',
      plist({ CFBundleShortVersionString: VERSION, CFBundleVersion: '9', ...USAGE }),
    );
    put(app, 'App', binary(ALL.slice(0, 3)));
    put(app, 'App.debug.dylib', binary(ALL.slice(3)));
    return app;
  }

  it('passes a complete built app and reports its build number', () => {
    const root = makeRoot();
    const r = checkNativeBundle({ root, app: makeApp(root) });
    assert.deepEqual(r.problems, []);
    assert.equal(r.info.build, '9');
  });

  it('reads public/ and Info.plist from inside the app, not from ios/App/App', () => {
    const root = makeRoot();
    const app = makeApp(root);
    rmSync(join(app, 'public/mediapipe'), { recursive: true });
    put(
      app,
      'Info.plist',
      plist({ CFBundleShortVersionString: '2.3.3', ...USAGE, NSCameraUsageDescription: '' }),
    );
    const p = problems(root, app).join('\n');
    assert.match(p, /vision_wasm_internal\.wasm is missing/);
    assert.match(p, /the built app is version 2\.3\.3/);
    assert.match(p, /built Info\.plist NSCameraUsageDescription is empty/);
    assert.deepEqual(problems(root), [], 'the synced folder itself is still fine');
  });

  it('fails when a plugin was not compiled into the app', () => {
    const root = makeRoot();
    const app = makeApp(root);
    put(app, 'App.debug.dylib', binary(['HapticsPlugin']));
    assert.match(problems(root, app).join('\n'), /does not contain LocalNotificationsPlugin/);
  });

  it('fails on a web build inside the app', () => {
    const root = makeRoot();
    const app = makeApp(root);
    put(app, 'public/sw.js', '');
    assert.match(problems(root, app).join('\n'), /web \(PWA\) build synced/);
  });

  it('fails when the app path does not exist', () => {
    const root = makeRoot();
    assert.match(problems(root, join(root, 'nope.app')).join('\n'), /does not exist/);
  });
});

describe('helpers', () => {
  it('npmPlugins maps @capacitor packages to SPM products and plugin classes', () => {
    assert.deepEqual(
      npmPlugins({
        dependencies: {
          '@capacitor/core': '1',
          '@capacitor/ios': '1',
          '@capacitor/local-notifications': '1',
          dexie: '1',
        },
      }),
      [
        {
          name: '@capacitor/local-notifications',
          product: 'CapacitorLocalNotifications',
          className: 'LocalNotificationsPlugin',
        },
      ],
    );
  });

  it('requiredUsageKeys follows the code, ignoring tests and comments', () => {
    const root = makeRoot();
    const keys = requiredUsageKeys(root).map((k) => k.key);
    assert.deepEqual(keys, [
      'NSCameraUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSSpeechRecognitionUsageDescription',
      'NSHealthShareUsageDescription',
    ]);
    // toShare: [] is read-only; geolocation only appears in a test; CoreMotion only in a comment.
    put(root, 'ios/App/App/Plugins/GymMotion/Motion.swift', 'let m = CMHeadphoneMotionManager()\n');
    put(
      root,
      'ios/App/App/Plugins/GymHealth/Write.swift',
      'try await store.requestAuthorization(toShare: writeTypes, read: [])\n',
    );
    const more = requiredUsageKeys(root).map((k) => k.key);
    assert.ok(more.includes('NSMotionUsageDescription'));
    assert.ok(more.includes('NSHealthUpdateUsageDescription'));
  });

  it('readPlist reads string values and unescapes them', () => {
    const p = join(tmp, 'x.plist');
    writeFileSync(p, plist({ A: 'Tom &amp; Jerry', B: '' }));
    assert.deepEqual(readPlist(p), { A: 'Tom & Jerry', B: '' });
  });

  it(
    'readPlist reads binary plists (macOS plutil)',
    { skip: process.platform !== 'darwin' },
    () => {
      const p = join(tmp, 'bin.plist');
      writeFileSync(p, plist({ NSCameraUsageDescription: 'cam' }));
      spawnSync('plutil', ['-convert', 'binary1', p]);
      assert.deepEqual(readPlist(p), { NSCameraUsageDescription: 'cam' });
    },
  );
});
