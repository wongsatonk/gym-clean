// node --test scripts/sync-ios-version.test.mjs
// The iOS app version follows package.json (M12 slice 1b task 3). Made-up project text only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { nextBuild, readIosVersion, syncIosVersion } from './sync-ios-version.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/sync-ios-version.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'sync-ios-version-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const pbx = (marketing, build) => `// !$*UTF8*$!
		AAA /* Debug */ = {
			buildSettings = {
				CURRENT_PROJECT_VERSION = ${build};
				INFOPLIST_FILE = App/Info.plist;
				MARKETING_VERSION = ${marketing};
			};
			name = Debug;
		};
		BBB /* Release */ = {
			buildSettings = {
				CURRENT_PROJECT_VERSION = ${build};
				MARKETING_VERSION = ${marketing};
			};
			name = Release;
		};
`;

describe('readIosVersion', () => {
  it('reads the marketing version and build number', () => {
    assert.deepEqual(readIosVersion(pbx('1.0', 1)), { marketing: ['1.0'], builds: [1] });
  });
  it('reports configurations that disagree', () => {
    const text = pbx('1.0', 1).replace('MARKETING_VERSION = 1.0;', 'MARKETING_VERSION = 2.0;');
    assert.deepEqual(readIosVersion(text).marketing, ['2.0', '1.0']);
  });
});

describe('nextBuild', () => {
  it('keeps the build number when the version did not change', () => {
    assert.equal(nextBuild({ current: 40, commitCount: 300, versionChanged: false }), 40);
  });
  it('takes the commit count on a version change', () => {
    assert.equal(nextBuild({ current: 1, commitCount: 218, versionChanged: true }), 218);
  });
  it('never goes down or stands still on a version change', () => {
    assert.equal(nextBuild({ current: 500, commitCount: 218, versionChanged: true }), 501);
    assert.equal(nextBuild({ current: 218, commitCount: 218, versionChanged: true }), 219);
  });
  it('works without git (no commit count)', () => {
    assert.equal(nextBuild({ current: 7, commitCount: undefined, versionChanged: true }), 8);
  });
  it('--build forces a higher number for the same version', () => {
    assert.equal(
      nextBuild({ current: 40, commitCount: 300, versionChanged: false, force: true }),
      300,
    );
    assert.equal(
      nextBuild({ current: 400, commitCount: 300, versionChanged: false, force: true }),
      401,
    );
  });
});

describe('syncIosVersion', () => {
  it('sets every configuration to the package version and a higher build', () => {
    const r = syncIosVersion(pbx('1.0', 1), { version: '1.12.0', commitCount: 218 });
    assert.equal(r.changed, true);
    assert.deepEqual(readIosVersion(r.text), { marketing: ['1.12.0'], builds: [218] });
    assert.equal(r.text, pbx('1.12.0', 218));
  });
  it('is idempotent: a second run changes nothing, even after more commits', () => {
    const once = syncIosVersion(pbx('1.0', 1), { version: '1.12.0', commitCount: 218 });
    const twice = syncIosVersion(once.text, { version: '1.12.0', commitCount: 230 });
    assert.equal(twice.changed, false);
    assert.equal(twice.text, once.text);
  });
  it('repairs configurations that disagree, without lowering the build', () => {
    const mixed = pbx('1.12.0', 218).replace(
      'CURRENT_PROJECT_VERSION = 218;',
      'CURRENT_PROJECT_VERSION = 90;',
    );
    const r = syncIosVersion(mixed, { version: '1.12.0', commitCount: 100 });
    assert.deepEqual(readIosVersion(r.text), { marketing: ['1.12.0'], builds: [218] });
  });
  it('rejects a version that is not plain x.y.z', () => {
    for (const bad of ['1.12', '1.12.0-beta', 'v1.12.0', '', '1.12.0; rm']) {
      assert.throws(
        () => syncIosVersion(pbx('1.0', 1), { version: bad, commitCount: 1 }),
        /version/,
      );
    }
  });
  it('fails when the project has no version settings', () => {
    assert.throws(
      () => syncIosVersion('nothing here', { version: '1.0.0', commitCount: 1 }),
      /MARKETING_VERSION/,
    );
  });
});

describe('CLI', () => {
  const root = join(tmp, 'repo');
  const file = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
  mkdirSync(join(root, 'ios/App/App.xcodeproj'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.3.4' }));
  writeFileSync(file, pbx('1.0', 1));
  const run = (...args) =>
    spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

  it('--check fails while the versions differ and writes nothing', () => {
    const r = run('--check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /1\.0.*2\.3\.4|2\.3\.4.*1\.0/s);
    assert.equal(readFileSync(file, 'utf8'), pbx('1.0', 1));
  });
  it('writes the version, then is a no-op', () => {
    assert.equal(run().status, 0);
    const first = readFileSync(file, 'utf8');
    assert.deepEqual(readIosVersion(first).marketing, ['2.3.4']);
    assert.ok(readIosVersion(first).builds[0] >= 2);
    const again = run();
    assert.equal(again.status, 0);
    assert.match(again.stdout, /already/);
    assert.equal(readFileSync(file, 'utf8'), first);
    assert.equal(run('--check').status, 0);
  });
});
