// node --test scripts/gen-licenses.test.mjs
// Open-source credits list (M13 task 6). Made-up packages in a temp project; the last block checks
// the real repo's committed list against a fresh generation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { formatLicenses, generateLicenses, licenseOf, packageEntry } from './gen-licenses.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/gen-licenses.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'gen-licenses-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

/** A made-up project: three runtime deps, one dev dep, an extras file. */
function project(name, { extras, deps } = {}) {
  const root = join(tmp, name);
  const runtime = deps ?? { 'pkg-a': '^1.0.0', '@scope/pkg-b': '2.0.0', 'pkg-c': '^3.0.0' };
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'demo',
      dependencies: runtime,
      devDependencies: { 'dev-only': '1.0.0' },
    }),
  );
  const mod = (pkg, json, files = {}) => {
    write(join(root, 'node_modules', pkg, 'package.json'), JSON.stringify({ name: pkg, ...json }));
    for (const [f, text] of Object.entries(files)) write(join(root, 'node_modules', pkg, f), text);
  };
  mod(
    'pkg-a',
    { version: '1.2.3', license: 'MIT' },
    { LICENSE: 'MIT License\r\n\r\nCopyright (c) Demo A\r\n' },
  );
  mod(
    '@scope/pkg-b',
    { version: '2.0.0', license: { type: 'Apache-2.0' } },
    { 'LICENSE.txt': 'Apache License\n', NOTICE: 'Demo B\nCopyright Demo B authors\n' },
  );
  mod('pkg-c', { version: '3.1.0', licenses: [{ type: 'MIT' }, { type: 'GPL-2.0' }] });
  mod('dev-only', { version: '1.0.0', license: 'WTFPL' });
  write(join(root, 'third_party/OFL.txt'), 'SIL Open Font License\n');
  write(
    join(root, 'src/data/licenses.extra.json'),
    JSON.stringify(
      extras ?? {
        entries: [
          { name: 'Demo data', license: 'Unlicense', source: 'data', text: 'Public domain.' },
          {
            name: 'Demo font',
            version: '1',
            license: 'OFL-1.1',
            source: 'font',
            textFile: 'third_party/OFL.txt',
          },
        ],
      },
    ),
  );
  return root;
}

describe('licenseOf', () => {
  it('reads the SPDX string, the object form and the old array form', () => {
    assert.equal(licenseOf({ license: 'MIT' }), 'MIT');
    assert.equal(licenseOf({ license: { type: 'ISC' } }), 'ISC');
    assert.equal(
      licenseOf({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] }),
      '(MIT OR Apache-2.0)',
    );
  });
  it('is undefined when nothing usable is declared', () => {
    assert.equal(licenseOf({}), undefined);
    assert.equal(licenseOf({ license: '' }), undefined);
    assert.equal(licenseOf({ license: 'UNLICENSED' }), undefined);
  });
});

describe('packageEntry', () => {
  const root = project('entry');
  it('takes version, licence and the licence file (line endings normalised)', () => {
    assert.deepEqual(packageEntry(root, 'pkg-a'), {
      name: 'pkg-a',
      version: '1.2.3',
      license: 'MIT',
      source: 'npm',
      text: 'MIT License\n\nCopyright (c) Demo A',
    });
  });
  it('appends a NOTICE file after the licence', () => {
    assert.equal(
      packageEntry(root, '@scope/pkg-b').text,
      'Apache License\n\nDemo B\nCopyright Demo B authors',
    );
  });
  it('has no text when the package ships no licence file', () => {
    const e = packageEntry(root, 'pkg-c');
    assert.equal(e.license, '(MIT OR GPL-2.0)');
    assert.equal('text' in e, false);
  });
  it('fails for a package that is not installed', () => {
    assert.throws(() => packageEntry(root, 'missing-pkg'), /missing-pkg.*not installed/);
  });
});

describe('generateLicenses', () => {
  it('lists every runtime dependency (sorted) then the extras, dev deps left out', () => {
    const entries = generateLicenses(project('gen'));
    assert.deepEqual(
      entries.map((e) => `${e.source}:${e.name}`),
      ['npm:@scope/pkg-b', 'npm:pkg-a', 'npm:pkg-c', 'data:Demo data', 'font:Demo font'],
    );
    const font = entries.find((e) => e.name === 'Demo font');
    assert.deepEqual(font, {
      name: 'Demo font',
      version: '1',
      license: 'OFL-1.1',
      source: 'font',
      text: 'SIL Open Font License',
    });
  });
  it('fails when a runtime dependency declares no licence', () => {
    const root = project('nolicence', { deps: { 'pkg-a': '1', 'no-licence': '1' } });
    write(
      join(root, 'node_modules/no-licence/package.json'),
      JSON.stringify({ name: 'no-licence', version: '1.0.0' }),
    );
    assert.throws(() => generateLicenses(root), /no-licence.*no licence/);
  });
  it('fails on a bad extra (source, licence, missing text file)', () => {
    const bad = (entry) =>
      assert.throws(
        () => generateLicenses(project(`bad-${Math.random()}`, { extras: { entries: [entry] } })),
        /extra/,
      );
    bad({ name: 'X', license: 'MIT', source: 'other' });
    bad({ name: 'X', license: '', source: 'data' });
    bad({ name: '', license: 'MIT', source: 'data' });
    bad({ name: 'X', license: 'MIT', source: 'model', textFile: 'nope.txt' });
  });
  it('fills a runtime dependency without a licence file from npmTexts (note first)', () => {
    const root = project('fallback', {
      extras: {
        npmTexts: {
          'pkg-c': { text: 'pkg-c ships no LICENSE file.', textFile: 'third_party/OFL.txt' },
        },
        entries: [],
      },
    });
    const c = generateLicenses(root).find((e) => e.name === 'pkg-c');
    assert.equal(c.text, 'pkg-c ships no LICENSE file.\n\nSIL Open Font License');
  });
  it("keeps a package's own licence file over npmTexts", () => {
    const root = project('own', {
      extras: { npmTexts: { 'pkg-a': { textFile: 'third_party/OFL.txt' } }, entries: [] },
    });
    const a = generateLicenses(root).find((e) => e.name === 'pkg-a');
    assert.equal(a.text, 'MIT License\n\nCopyright (c) Demo A');
  });
  it('fails on an npmTexts entry for an unknown package or a missing file', () => {
    const bad = (npmTexts) =>
      assert.throws(
        () =>
          generateLicenses(
            project(`badnpm-${Math.random()}`, { extras: { npmTexts, entries: [] } }),
          ),
        /npmTexts/,
      );
    bad({ 'not-a-dep': { textFile: 'third_party/OFL.txt' } });
    bad({ 'pkg-c': { textFile: 'nope.txt' } });
    bad({ 'pkg-c': {} });
  });
  it('formats as stable JSON with a trailing newline', () => {
    const root = project('fmt');
    const text = formatLicenses(generateLicenses(root));
    assert.equal(text, formatLicenses(generateLicenses(root)));
    assert.ok(text.endsWith('}\n'));
    const parsed = JSON.parse(text);
    assert.equal(parsed.format, 'gym-clean-licenses');
    assert.equal(parsed.entries.length, 5);
  });
});

describe('CLI', () => {
  const run = (root, ...args) =>
    spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

  it('writes src/data/licenses.generated.json, then --check passes', () => {
    const root = project('cli');
    const r = run(root);
    assert.equal(r.status, 0, r.stderr);
    const out = readFileSync(join(root, 'src/data/licenses.generated.json'), 'utf8');
    assert.equal(out, formatLicenses(generateLicenses(root)));
    assert.equal(run(root, '--check').status, 0);
  });

  it('--check fails when the committed list is stale and writes nothing', () => {
    const root = project('stale');
    run(root);
    const path = join(root, 'src/data/licenses.generated.json');
    write(
      join(root, 'node_modules/pkg-a/package.json'),
      JSON.stringify({ name: 'pkg-a', version: '1.2.4', license: 'MIT' }),
    );
    const before = readFileSync(path, 'utf8');
    const r = run(root, '--check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /out of date/);
    assert.equal(readFileSync(path, 'utf8'), before);
  });

  it('the committed list in this repo equals a fresh generation', () => {
    const r = run(ROOT, '--check');
    assert.equal(r.status, 0, r.stderr);
  });
});
