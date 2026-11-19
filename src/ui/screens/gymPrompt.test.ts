/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProgramDay } from '../../core/types';
import { checkCopy } from '../../core/trainer/replies';
import { exerciseName, program } from '../../data/catalog';
import { gymPrompt, gymPromptText, type MissingKit } from './gymPrompt';
import { previewScreen, type PreviewActions, type PreviewProps } from './preview';
import { asFake, useFakeDom, type FakeEl } from './testDom';
import { todayScreen, type TodayActions, type TodayProps } from './today';

useFakeDom();

const LEG_PRESS = 'Leg_Press';
const LEGS_B = program.days.find((d) =>
  d.exercises.some((e) => e.exerciseId === LEG_PRESS),
) as ProgramDay;
const MISSING: MissingKit = { exerciseId: LEG_PRESS, name: exerciseName(LEG_PRESS) };
const NOW = new Date(2026, 10, 13, 18, 0).getTime();

function todayProps(over: Partial<TodayProps> = {}): TodayProps {
  return {
    now: NOW,
    days: program.days,
    upNextDayId: LEGS_B.id,
    streakWeeks: 1,
    weekDots: [],
    last: null,
    unit: 'kg',
    ...over,
  };
}

function wired(calls: { swap: string[]; keep: string[] }) {
  return {
    onSeeGymSwap: (id: string) => calls.swap.push(id),
    onKeepExercise: (id: string) => calls.keep.push(id),
  };
}

function renderToday(over: Partial<TodayProps>, extra: Partial<TodayActions> = {}) {
  return asFake(
    todayScreen(todayProps(over), {
      onStart: () => {},
      onOpenDay: () => {},
      onTab: () => {},
      ...extra,
    }),
  );
}

function renderPreview(over: Partial<PreviewProps>, extra: Partial<PreviewActions> = {}) {
  const rows = LEGS_B.exercises.map((p) => ({
    exerciseId: p.exerciseId,
    tracking: p.tracking,
    name: exerciseName(p.exerciseId),
    plan: `${p.sets} × 10–12 reps`,
  }));
  return asFake(
    previewScreen(
      { day: LEGS_B, position: 5, total: 6, rows, loading: false, ...over },
      { onBack: () => {}, onStart: () => {}, ...extra },
    ),
  );
}

const promptOf = (el: FakeEl) => el.find((e) => e.hasAttribute('data-gym-prompt'));
const btn = (el: FakeEl, attr: string) => el.find((e) => e.hasAttribute(attr))[0];

describe('missing-kit prompt copy', () => {
  it('names the exercise, in coaching language', () => {
    expect(LEGS_B).toBeDefined();
    const text = gymPromptText(MISSING.name);
    expect(text).toBe(`Your gym has no kit for ${MISSING.name}.`);
    expect(checkCopy(text)).toEqual({ ok: true, hits: [] });
  });

  it('every string it shows passes checkCopy, for every program exercise', () => {
    const ids = new Set(program.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    for (const id of ids) {
      const el = asFake(
        gymPrompt({ exerciseId: id, name: exerciseName(id) }, wired({ swap: [], keep: [] })),
      );
      expect(checkCopy(el.textContent).ok, el.textContent).toBe(true);
    }
  });
});

describe('gymPrompt', () => {
  it('renders nothing without a missing exercise or without both callbacks', () => {
    const calls = { swap: [], keep: [] };
    expect(gymPrompt(null, wired(calls))).toBeNull();
    expect(gymPrompt(undefined, wired(calls))).toBeNull();
    expect(gymPrompt(MISSING, { onSeeGymSwap: () => {} })).toBeNull();
    expect(gymPrompt(MISSING, { onKeepExercise: () => {} })).toBeNull();
  });

  it('is a status card with See a swap then Keep it, each passing the exercise id', () => {
    const calls = { swap: [] as string[], keep: [] as string[] };
    const el = asFake(gymPrompt(MISSING, wired(calls)));
    expect(el.getAttribute('data-gym-prompt')).toBe(LEG_PRESS);
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBeNull(); // shown, not spoken: not an alert
    expect(el.oneByClass('gym-prompt-text').textContent).toBe(gymPromptText(MISSING.name));
    const buttons = el.byTag('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['See a swap', 'Keep it']);
    expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true);
    // M13d task 40d: round icon buttons; Start stays the page's one main action.
    expect(buttons.map((b) => b.getAttribute('data-variant'))).toEqual(['secondary', 'quiet']);
    buttons[0]?.click();
    buttons[1]?.click();
    expect(calls).toEqual({ swap: [LEG_PRESS], keep: [LEG_PRESS] });
  });

  it('CSS: body-size text, tokens only (the buttons are iconButton: ≥ 56px there)', () => {
    const css = readFileSync(new URL('./gymPrompt.css', import.meta.url), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`\\n${sel} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('\\.gym-prompt-text')).toContain('font-size: var(--fs-body)');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*\d/);
  });
});

describe('Today with the missing-kit prompt', () => {
  it('without the prop (or without callbacks) the screen is unchanged', () => {
    const plain = renderToday({});
    expect(promptOf(plain)).toHaveLength(0);
    const noCallbacks = renderToday({ missingKit: MISSING });
    expect(promptOf(noCallbacks)).toHaveLength(0);
    expect(noCallbacks.textContent).toBe(plain.textContent);
  });

  it('shows one prompt right below the hero (M13: hero first); taps reach the callbacks; Start is untouched', () => {
    const calls = { swap: [] as string[], keep: [] as string[] };
    const starts: string[] = [];
    const el = renderToday(
      { missingKit: MISSING },
      { ...wired(calls), onStart: (d) => starts.push(d.id) },
    );
    const prompts = promptOf(el);
    expect(prompts).toHaveLength(1);
    const kids = el.children;
    const at = kids.indexOf(prompts[0] as FakeEl);
    const heroAt = kids.findIndex((c) => c.classes.includes('hero'));
    expect(heroAt).toBe(1); // right after the app bar
    expect(at).toBe(heroAt + 1);
    btn(el, 'data-gym-swap')?.click();
    btn(el, 'data-gym-keep')?.click();
    expect(calls).toEqual({ swap: [LEG_PRESS], keep: [LEG_PRESS] });
    expect(starts).toEqual([]);
    btn(el, 'data-start')?.click();
    expect(starts).toEqual([LEGS_B.id]);
  });

  it('with other notices it sits in the "things to sort" row: Adjusted, then it, then the program prompt', () => {
    const el = renderToday(
      { missingKit: MISSING, newProgram: true, adjustedToday: 'Easy on arms' },
      { ...wired({ swap: [], keep: [] }), onUseNewProgram: () => {}, onKeepPlan: () => {} },
    );
    const list = el.find((c) => c.hasAttribute('data-notices-list'))[0] as FakeEl;
    const kids = list.children;
    const idx = (pred: (c: FakeEl) => boolean) => kids.findIndex(pred);
    const adj = idx((c) => c.hasAttribute('data-adjusted'));
    const gym = idx((c) => c.hasAttribute('data-gym-prompt'));
    const prog = idx((c) => c.hasAttribute('data-program-prompt'));
    expect(adj).toBe(0);
    expect(gym).toBe(adj + 1);
    expect(prog).toBe(gym + 1);
  });
});

describe('Preview with the missing-kit prompt', () => {
  it('without the prop the screen is unchanged', () => {
    const plain = renderPreview({});
    expect(promptOf(plain)).toHaveLength(0);
    const noCallbacks = renderPreview({ missingKit: MISSING });
    expect(noCallbacks.textContent).toBe(plain.textContent);
  });

  it('shows the prompt above the day; the rows still list the exercise (never silent)', () => {
    const calls = { swap: [] as string[], keep: [] as string[] };
    const el = renderPreview({ missingKit: MISSING }, wired(calls));
    const prompts = promptOf(el);
    expect(prompts).toHaveLength(1);
    const kids = el.children;
    expect(kids.indexOf(prompts[0] as FakeEl)).toBeLessThan(
      kids.findIndex((c) => c.classes.includes('preview-head')),
    );
    const rows = el.byClass('ex-row');
    expect(rows).toHaveLength(LEGS_B.exercises.length);
    expect(rows.some((r) => r.getAttribute('data-ex') === LEG_PRESS)).toBe(true);
    btn(el, 'data-gym-swap')?.click();
    btn(el, 'data-gym-keep')?.click();
    expect(calls).toEqual({ swap: [LEG_PRESS], keep: [LEG_PRESS] });
  });
});
