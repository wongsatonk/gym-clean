import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FocusCueId, SetLog } from '../core/types';
import {
  FOCUS_CUE_LABEL,
  FOCUS_EXPLAINER,
  createFocusSummary,
  cueCountText,
  cueLabelFromText,
  focusRows,
  partialsText,
} from './focusSummary';

const NAMES: Record<string, string> = { curl: 'Dumbbell Bicep Curl', raise: 'Side Lateral Raise' };
const name = (id: string) => NAMES[id] ?? id;

function log(
  exerciseId: string,
  setIndex: number,
  extra: { focusScore?: number; cues?: FocusCueId[]; partials?: number } = {},
): SetLog {
  return {
    sessionId: 's1',
    exerciseId,
    setIndex,
    reps: 10,
    weightKg: 10,
    restTakenSec: 60,
    startedAt: 0,
    endedAt: 1,
    ...extra,
  };
}

describe('cue label helpers', () => {
  it('takes the first sentence of a cue text, without the period', () => {
    expect(cueLabelFromText('Slow the lowering.')).toBe('Slow the lowering');
    expect(cueLabelFromText('Stay with it. {N} to go.')).toBe('Stay with it');
    expect(cueLabelFromText('Full range')).toBe('Full range');
  });
  it('has a short label for every cue id, no trailing period', () => {
    const ids: FocusCueId[] = [
      'rushedLowering',
      'shrinkingRange',
      'stalled',
      'outOfFrame',
      'lowFps',
      'armsOutOfSync',
      'raiseTooHigh',
      'elbowDrift',
      'bodySwing',
      'hipSag',
    ];
    for (const id of ids) {
      expect(FOCUS_CUE_LABEL[id]).toMatch(/^[A-Z][^.]*$/);
      expect(FOCUS_CUE_LABEL[id].split(' ').length).toBeLessThanOrEqual(6);
    }
  });
  it('counts and partials read naturally', () => {
    expect(cueCountText('Slow the lowering', 2)).toBe('Slow the lowering ×2');
    expect(cueCountText('Full range', 1)).toBe('Full range');
    expect(partialsText(1)).toBe('1 partial');
    expect(partialsText(3)).toBe('3 partials');
  });
  it('explainer has no medical wording', () => {
    expect(FOCUS_EXPLAINER).toBe('Start 100 · −10 per cue · −5 per partial or stall');
    const all = [FOCUS_EXPLAINER, ...Object.values(FOCUS_CUE_LABEL)].join(' ').toLowerCase();
    for (const w of ['injur', 'pain', 'danger', 'damage', 'diagnos', 'risk', 'unsafe']) {
      expect(all).not.toContain(w);
    }
  });
});

describe('focusRows', () => {
  it('is empty with only manual sets (no focusScore)', () => {
    expect(focusRows([log('curl', 0), log('curl', 1, { partials: 2 })], name)).toEqual([]);
    expect(focusRows([], name)).toEqual([]);
  });

  it('groups camera sets by exercise in day order, counts cues in first-seen order', () => {
    const rows = focusRows(
      [
        log('raise', 0, { focusScore: 100, cues: [] }),
        log('curl', 0), // manual: skipped
        log('curl', 1, {
          focusScore: 65,
          cues: ['rushedLowering', 'stalled', 'rushedLowering', 'outOfFrame'],
          partials: 1,
        }),
        log('raise', 1, { focusScore: 95, partials: 1 }),
      ],
      name,
    );
    expect(rows).toEqual([
      {
        exerciseId: 'raise',
        name: 'Side Lateral Raise',
        sets: [
          { setNumber: 1, score: 100, cues: [], partials: 0 },
          { setNumber: 2, score: 95, cues: [], partials: 1 },
        ],
      },
      {
        exerciseId: 'curl',
        name: 'Dumbbell Bicep Curl',
        sets: [
          {
            setNumber: 2,
            score: 65,
            cues: [
              { id: 'rushedLowering', label: 'Slow the lowering', count: 2 },
              { id: 'stalled', label: 'Stay with it', count: 1 },
              { id: 'outOfFrame', label: 'Step back into frame', count: 1 },
            ],
            partials: 1,
          },
        ],
      },
    ]);
  });

  it('rounds and clamps the shown score; ignores non-finite scores', () => {
    const rows = focusRows(
      [
        log('curl', 0, { focusScore: 84.6 }),
        log('curl', 1, { focusScore: -5 }),
        log('curl', 2, { focusScore: Number.NaN }),
      ],
      name,
    );
    expect(rows[0]?.sets.map((s) => s.score)).toEqual([85, 0]);
  });

  it('uses label overrides (e.g. core CUE_TEXT) when given', () => {
    const rows = focusRows([log('curl', 0, { focusScore: 90, cues: ['shrinkingRange'] })], name, {
      shrinkingRange: 'Go all the way.',
    });
    expect(rows[0]?.sets[0]?.cues[0]?.label).toBe('Go all the way');
  });
});

// ---------- render with a tiny DOM stub (vitest runs in node) ----------

class FakeEl {
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  text = '';
  classList = { add: (c: string) => this.attrs.set('class', c) };
  constructor(public tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  addEventListener() {}
  append(...nodes: (FakeEl | string)[]) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const t = new FakeEl('#text');
        t.text = n;
        this.children.push(t);
      } else this.children.push(n);
    }
  }
  get textContent(): string {
    return this.tag === '#text' ? this.text : this.children.map((c) => c.textContent).join('');
  }
  all(attr: string): FakeEl[] {
    const out: FakeEl[] = [];
    for (const c of this.children) {
      if (c.attrs.has(attr)) out.push(c);
      out.push(...c.all(attr));
    }
    return out;
  }
}

describe('createFocusSummary', () => {
  const g = globalThis as { document?: unknown };
  let saved: unknown;
  beforeEach(() => {
    saved = g.document;
    g.document = {
      createElement: (tag: string) => new FakeEl(tag),
      createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    };
  });
  afterEach(() => {
    g.document = saved;
  });

  it('omits the section when there are only manual sets', () => {
    expect(createFocusSummary([log('curl', 0), log('curl', 1)], name)).toBeNull();
  });

  it('renders set rows, scores, cues, partials and the explainer', () => {
    const el = createFocusSummary(
      [
        log('curl', 0),
        log('curl', 1, {
          focusScore: 75,
          cues: ['rushedLowering', 'rushedLowering'],
          partials: 1,
        }),
        log('curl', 2, { focusScore: 100, cues: [] }),
      ],
      name,
    ) as unknown as FakeEl;
    expect(el).not.toBeNull();
    expect(el.getAttribute('data-focus-summary')).toBe('');
    const text = el.textContent;
    expect(text).toContain('Focus');
    expect(text).toContain('Dumbbell Bicep Curl');
    expect(text).toContain('Slow the lowering ×2');
    expect(text).toContain('1 partial');
    expect(text).toContain('Clean set');
    expect(text).toContain(FOCUS_EXPLAINER);

    const sets = el.all('data-focus-set');
    expect(sets.map((s) => s.getAttribute('data-focus-set'))).toEqual(['2', '3']);
    expect(sets.map((s) => s.getAttribute('data-focus-score'))).toEqual(['75', '100']);
    expect(sets[0]?.textContent).toContain('Set 2');
    expect(sets[0]?.textContent).toContain('75');
    expect(el.all('data-focus-cue').map((c) => c.getAttribute('data-focus-cue'))).toEqual([
      'rushedLowering',
    ]);
    expect(el.all('data-focus-partials').map((c) => c.getAttribute('data-focus-partials'))).toEqual(
      ['1'],
    );
  });
});
