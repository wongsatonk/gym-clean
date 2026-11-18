/**
 * M13c task 6c: the Claude lists and the offer rule ship in 1.16.0 with **no request code**
 * (Decision "M13c answers": "explain first, ask, never send by itself"). This walks the static
 * and dynamic import graph of offer.ts and sends.ts (type-only imports are erased at build time)
 * and fails if it reaches a network call, the native bridge or the brain request code.
 * The walker is checked against files that do reach those first, so a clean result means something.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const rel = (p: string): string => relative(SRC, p).split(sep).join('/');

/** Comments removed (a doc comment may name fetch); `://` in strings is kept. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

const STATIC =
  /(?:^|[\n;])\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolve(from: string, spec: string): string | null {
  const base = join(dirname(from), spec);
  for (const p of [base, `${base}.ts`, join(base, 'index.ts')])
    if (existsSync(p) && /\.(ts|json)$/.test(p)) return p;
  return null;
}

type Graph = { files: string[]; packages: string[]; unresolved: string[] };

function graph(entries: readonly string[]): Graph {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const unresolved: string[] = [];
  const todo = entries.map((e) => join(SRC, e));
  while (todo.length > 0) {
    const file = todo.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith('.json')) continue;
    const text = code(readFileSync(file, 'utf8'));
    const specs: string[] = [];
    for (const m of text.matchAll(STATIC)) if (!m[1]) specs.push(m[2] as string);
    for (const m of text.matchAll(DYNAMIC)) specs.push(m[1] as string);
    for (const spec of specs) {
      if (!spec.startsWith('.')) {
        packages.add(spec);
        continue;
      }
      const hit = resolve(file, spec);
      if (hit) todo.push(hit);
      else unresolved.push(`${rel(file)} → ${spec}`);
    }
  }
  return { files: [...seen].map(rel).sort(), packages: [...packages].sort(), unresolved };
}

/** Network or native calls in the code of the graph's files (comments ignored). */
const NETWORK =
  /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\bEventSource\b|\bCapacitor\b|api\.anthropic\.com/;

function problems(g: Graph): string[] {
  const out: string[] = [];
  for (const f of g.files) {
    if (f.startsWith('native/')) out.push(`native bridge: ${f}`);
    if (f.startsWith('data/brain/')) out.push(`brain request code: ${f}`);
    if (f.startsWith('ui/') || f.startsWith('pose/') || f.startsWith('food-vision/'))
      out.push(`app code: ${f}`);
    if (f.endsWith('.ts') && NETWORK.test(code(readFileSync(join(SRC, f), 'utf8'))))
      out.push(`network call in ${f}`);
  }
  for (const p of g.packages) out.push(`package: ${p}`);
  return out;
}

describe('the walker (checked first)', () => {
  it('follows relative imports, skips type-only ones and finds JSON', () => {
    const g = graph(['core/trainer/claude/offer.ts']);
    expect(g.files).toContain('core/trainer/claude/offer.ts');
    expect(g.files).toContain('core/trainer/replies.ts');
    expect(g.files).toContain('core/trainer/phrases.json');
    // `import type { CoachPhase } from '../coach'` is erased: coach.ts is not reached through it.
    expect(g.files).not.toContain('core/trainer/coach.ts');
    expect(g.unresolved).toEqual([]);
  });

  it('flags a graph that reaches the brain request code', () => {
    const p = problems(graph(['data/brain/apple.ts']));
    expect(p).toContain('brain request code: data/brain/apple.ts');
    expect(p).toContain('brain request code: data/brain/notes.ts');
  });

  it('flags a graph that reaches the native bridge', () => {
    const p = problems(graph(['ui/selfCheckRuns.ts']));
    expect(p).toContain('native bridge: native/gymBrain.ts');
    expect(p).toContain('app code: ui/selfCheckRuns.ts');
  });

  it('flags a fetch call', () => {
    const p = problems(graph(['data/nutrition/offClient.ts']));
    expect(p).toContain('network call in data/nutrition/offClient.ts');
  });
});

describe('offer.ts and sends.ts reach no request code (M13c: no Claude request)', () => {
  for (const entry of ['core/trainer/claude/offer.ts', 'core/trainer/claude/sends.ts'])
    it(entry, () => {
      const g = graph([entry]);
      expect(g.unresolved).toEqual([]);
      expect(problems(g)).toEqual([]);
      // Pure core code, plus bundled JSON data (core may read src/data JSON, never its code).
      for (const f of g.files) expect(f, f).toMatch(/^core\/|^data\/.*\.json$/);
    });
});
