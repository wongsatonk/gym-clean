// Regenerates gym-clean-food-photos-fixture.zip with the app's own export writer, so the Python
// reader is tested against real output. The 5 JPEGs are made-up solid colours (see conftest.make_jpeg).
// Run from the repo root (rolldown ships with Vite):
//   ml/.venv/bin/python -c "import sys; sys.path.insert(0,'ml/tests'); from conftest import make_jpeg; \
//     [open(f'/tmp/fix{i}.jpg','wb').write(make_jpeg(c,size=(32,24),mark=i)) for i,c in enumerate( \
//     [(230,170,60),(225,160,70),(200,60,30),(190,70,40),(245,245,240)])]"
//   node node_modules/rolldown/bin/cli.mjs ml/tests/fixtures/gen-photo-zip.ts --format esm --platform node -o /tmp/gen.mjs
//   node /tmp/gen.mjs /tmp ml/tests/fixtures/gym-clean-food-photos-fixture.zip
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPhotoExport } from '../../../src/core/nutrition/photoExport';

const [jpegDir, out] = process.argv.slice(2);
if (!jpegDir || !out) throw new Error('usage: gen.mjs <jpegDir> <out.zip>');
const dishes = [
  'thai:pad-thai-goong',
  'thai:pad-thai-goong',
  'thai:tom-yum-goong',
  'thai:tom-yum-goong',
  'thai:khao-suay', // not in classMap: prepare.py drops and reports it
];
const items = dishes.map((dishId, i) => ({
  dishId,
  createdAt: 1763200000000 + i * 60000,
  jpeg: new Uint8Array(readFileSync(`${jpegDir}/fix${i}.jpg`)),
}));
const zip = buildPhotoExport(items, 1763300000000);
if (!zip) throw new Error('no zip');
writeFileSync(out, zip.bytes);
