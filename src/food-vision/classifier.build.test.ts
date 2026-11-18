// M7b task 11: the e2e fake seam must not reach a production build. Builds classifier.ts alone
// with Vite (MediaPipe left external) as production and as development, and greps the output.
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

const entry = fileURLToPath(new URL('./classifier.ts', import.meta.url));
const SEAM = '__gymCleanFake';
const savedEnv = process.env.NODE_ENV;

async function bundle(nodeEnv: 'production' | 'development'): Promise<string> {
  process.env.NODE_ENV = nodeEnv; // Vite's import.meta.env.DEV follows NODE_ENV, not the mode
  const out = (await build({
    configFile: false,
    logLevel: 'silent',
    mode: nodeEnv,
    build: {
      write: false,
      minify: true,
      lib: { entry, formats: ['es'], fileName: 'classifier' },
      rollupOptions: { external: [/^@mediapipe\//] },
    },
  })) as Rollup.RollupOutput[] | Rollup.RollupOutput;
  const outputs = Array.isArray(out) ? out : [out];
  return outputs
    .flatMap((o) => o.output)
    .map((c) => (c.type === 'chunk' ? c.code : ''))
    .join('\n');
}

afterEach(() => {
  process.env.NODE_ENV = savedEnv;
});

describe('classifier build', () => {
  it('production: no fake seam, MediaPipe still a lazy import, wasm path same-origin', async () => {
    const code = await bundle('production');
    expect(code).not.toContain(SEAM);
    expect(code).toMatch(/import\(\s*["']@mediapipe\/tasks-vision["']\s*\)/);
    expect(code).toContain('mediapipe/wasm');
    expect(code).not.toMatch(/https?:\/\//);
  }, 30_000);

  it('development keeps the seam (proves the check can fail)', async () => {
    expect(await bundle('development')).toContain(SEAM);
  }, 30_000);
});
