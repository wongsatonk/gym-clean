import { describe, expect, it } from 'vitest';
import { matchIntent, normalizeText, type IntentMatch, type MatchContext } from './intents';
import evals from './evals/requests.json';
import phrases from './phrases.json';
import exercisesJson from '../../data/exercises.json';
import source from './intents.ts?raw';

type EvalItem = {
  text: string;
  intent: IntentMatch['intent'];
  slots: IntentMatch['slots'];
  safety: IntentMatch['safety'];
  ruleSupported: boolean;
};

const ITEMS = evals.items as EvalItem[];
const CATALOG = (exercisesJson as { id: string; name: string }[]).map(({ id, name }) => ({
  id,
  name,
}));
const ctx: MatchContext = { exercises: CATALOG };

describe('normalizeText', () => {
  it('lowercases, drops apostrophes and turns punctuation into single spaces', () => {
    expect(normalizeText("  Can't   make it—TODAY's  session! ")).toBe(
      'cant make it todays session',
    );
    expect(normalizeText('light-headed')).toBe('light headed');
    expect(normalizeText('I’m sore')).toBe('im sore');
  });

  it('keeps Thai text', () => {
    expect(normalizeText('เจ็บแขน!')).toBe('เจ็บแขน');
  });
});

describe('matchIntent basics', () => {
  it('unknown or empty text is help with no slots and no flag', () => {
    for (const text of ['', '   ', 'tell me a joke', 'สวัสดี', '42']) {
      expect(matchIntent(text, ctx)).toEqual({ intent: 'help', slots: {}, safety: 'none' });
    }
  });

  it('discomfort with an area proposes avoidArea for that area', () => {
    expect(matchIntent('my arms hurt', ctx)).toEqual({
      intent: 'avoidArea',
      slots: { area: 'arms' },
      safety: 'discomfort',
    });
  });

  it('discomfort without an area still asks for avoidArea (the coach shows area chips)', () => {
    expect(matchIntent("I'm sore", ctx)).toEqual({
      intent: 'avoidArea',
      slots: {},
      safety: 'discomfort',
    });
  });

  it('red flags win over everything and carry no training intent or slots', () => {
    expect(matchIntent('chest pain, swap bench press for tomorrow', ctx)).toEqual({
      intent: 'help',
      slots: {},
      safety: 'redFlag',
    });
    expect(matchIntent('my chest is sore', ctx).safety).toBe('redFlag');
  });

  it('the area word inside an exercise name does not leak into a swap', () => {
    expect(matchIntent('swap the leg press', ctx)).toEqual({
      intent: 'swap',
      slots: { exerciseId: 'Leg_Press' },
      safety: 'none',
    });
  });

  it('"back" as in "come back" is not the back area', () => {
    expect(matchIntent("I'll come back tomorrow, go easy on me", ctx).slots.area).toBeUndefined();
  });

  it('a more specific exercise name beats a short alias', () => {
    expect(matchIntent('swap incline dumbbell curl', ctx).slots.exerciseId).toBe(
      'Incline_Dumbbell_Curl',
    );
    expect(matchIntent('swap hammer curls', ctx).slots.exerciseId).toBe('Hammer_Curls');
    expect(matchIntent('swap curls', ctx).slots.exerciseId).toBe('Dumbbell_Bicep_Curl');
  });

  it("a generic word picks today's exercise when the context lists today's ids", () => {
    const today: MatchContext = {
      exercises: CATALOG,
      todayExerciseIds: ['Hammer_Curls', 'Pushups'],
    };
    expect(matchIntent('swap the curls', today).slots.exerciseId).toBe('Hammer_Curls');
    const rows: MatchContext = { exercises: CATALOG, todayExerciseIds: ['Seated_Cable_Rows'] };
    expect(matchIntent('swap rows', rows).slots.exerciseId).toBe('Seated_Cable_Rows');
  });

  it('an ambiguous generic word without context leaves exerciseId empty', () => {
    expect(matchIntent('swap rows', ctx).slots.exerciseId).toBeUndefined();
  });

  it('only matches ids that exist in the given catalog', () => {
    const small: MatchContext = { exercises: [{ id: 'Pushups', name: 'Pushups' }] };
    expect(matchIntent('swap curls', small).slots.exerciseId).toBeUndefined();
    expect(matchIntent('swap push ups', small).slots.exerciseId).toBe('Pushups');
  });

  it('defaults to the bundled catalog when the context has no exercises', () => {
    expect(matchIntent('swap hammer curls', {}).slots.exerciseId).toBe('Hammer_Curls');
  });

  it('reads the day to skip and the day to move to', () => {
    expect(matchIntent("move tomorrow's session to friday", ctx).slots).toEqual({
      date: 'tomorrow',
      moveTo: 'fri',
    });
    expect(matchIntent('can we do it saturday instead', ctx).slots).toEqual({ moveTo: 'sat' });
    expect(matchIntent("can't train on monday", ctx).slots).toEqual({ date: 'mon' });
  });

  it('reads the scope', () => {
    expect(matchIntent('swap pushups from now on', ctx).slots.scope).toBe('plan');
    expect(matchIntent('swap pushups just for today', ctx).slots.scope).toBe('today');
  });

  it('is deterministic and does not mutate its inputs', () => {
    const frozen: MatchContext = Object.freeze({ exercises: Object.freeze([...CATALOG]) });
    const a = matchIntent('my knee hurts', frozen);
    const b = matchIntent('my knee hurts', frozen);
    expect(a).toEqual(b);
  });
});

describe('phrases.json', () => {
  it('maps every alias to a catalog id', () => {
    const ids = new Set(CATALOG.map((e) => e.id));
    for (const [id, list] of Object.entries(phrases.exerciseAliases)) {
      if (id === 'note') continue;
      expect(ids.has(id), id).toBe(true);
      expect(Array.isArray(list)).toBe(true);
    }
  });

  it('has English and Thai discomfort, red-flag and diagnosis words', () => {
    const thai = /[฀-๿]/;
    for (const list of [
      phrases.safety.discomfort,
      phrases.safety.redFlag,
      phrases.diagnosisTerms,
    ]) {
      expect(list.some((w) => thai.test(w))).toBe(true);
      expect(list.some((w) => /^[a-z]/.test(w))).toBe(true);
    }
  });
});

describe('eval set (SPEC M10 Accept)', () => {
  it('has at least 60 items and no personal data', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(60);
    for (const item of ITEMS) {
      expect(item.text).not.toMatch(/@|\+?\d[\d\s-]{6,}\d|https?:/);
      expect(item.text).not.toMatch(/\b\d+(\.\d+)?\s?(kg|lb|cm)\b/i);
    }
  });

  it('matches intent + slots on >= 90% of rule-supported items', () => {
    const supported = ITEMS.filter((i) => i.ruleSupported);
    const misses = supported.filter((item) => {
      const got = matchIntent(item.text, ctx);
      return (
        got.intent !== item.intent ||
        JSON.stringify(sortKeys(got.slots)) !== JSON.stringify(sortKeys(item.slots))
      );
    });
    const score = (supported.length - misses.length) / supported.length;
    if (score < 1) {
      console.info(
        `intent eval ${(score * 100).toFixed(1)}% (${supported.length - misses.length}/${supported.length}); misses:`,
        misses.map((m) => ({
          text: m.text,
          want: [m.intent, m.slots],
          got: matchIntent(m.text, ctx),
        })),
      );
    }
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('flags 100% of discomfort and red-flag items', () => {
    for (const item of ITEMS.filter((i) => i.safety !== 'none')) {
      const got = matchIntent(item.text, ctx).safety;
      if (item.safety === 'redFlag') expect(got, item.text).toBe('redFlag');
      else expect(got, item.text).not.toBe('none');
    }
  });

  it('never makes a training intent for a red-flag item', () => {
    for (const item of ITEMS) {
      const got = matchIntent(item.text, ctx);
      if (got.safety === 'redFlag')
        expect(got).toEqual({ intent: 'help', slots: {}, safety: 'redFlag' });
    }
  });
});

describe('purity', () => {
  it('uses no network or DOM', () => {
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});

function sortKeys(o: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
