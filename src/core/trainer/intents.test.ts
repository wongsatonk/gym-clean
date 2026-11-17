import { describe, expect, it } from 'vitest';
import { matchIntent, normalizeText, type IntentMatch, type MatchContext } from './intents';
import evals from './evals/requests.json';
import phrases from './phrases.json';
import exercisesJson from '../../data/exercises.json';
import programJson from '../../data/program.json';
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
/** The eval set runs with the default program's day names, as the coach passes its plan's. */
const evalCtx: MatchContext = {
  ...ctx,
  dayNames: (programJson as { days: { name: string }[] }).days.map((d) => d.name),
};

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

  it('"skip leg day" / "skip <day name>" postpones the session instead of avoiding an area', () => {
    for (const text of [
      'skip leg day',
      'Skip legs day today',
      'can I skip push day?',
      'skip pull today',
    ]) {
      expect(matchIntent(text, ctx).intent, text).toBe('postpone');
      expect(matchIntent(text, ctx).slots.area, text).toBeUndefined();
    }
    // A plan day name from the context counts too.
    const named: MatchContext = { exercises: CATALOG, dayNames: ['Upper Power', 'Legs A'] };
    expect(matchIntent('skip upper power', named).intent).toBe('postpone');
    expect(matchIntent('skip legs a tomorrow', named)).toEqual({
      intent: 'postpone',
      slots: { date: 'tomorrow' },
      safety: 'none',
    });
    // Without "day" or a plan day name, "skip legs" is still "go easy on legs".
    expect(matchIntent('skip legs today', ctx)).toEqual({
      intent: 'avoidArea',
      slots: { area: 'legs', date: 'today' },
      safety: 'none',
    });
  });

  it('M12 "do <plan day> today" is doToday with the plan day name as typed in the plan', () => {
    const named: MatchContext = { exercises: CATALOG, dayNames: ['Push A', 'Legs B'] };
    expect(matchIntent('do push A today', named)).toEqual({
      intent: 'doToday',
      slots: { dayName: 'Push A', date: 'today' },
      safety: 'none',
    });
    expect(matchIntent('Can I train legs b instead?', named)).toEqual({
      intent: 'doToday',
      slots: { dayName: 'Legs B' },
      safety: 'none',
    });
    expect(matchIntent('เล่น push a วันนี้', named).intent).toBe('doToday');
    // Not for another day, not a skip, and not without a plan day name.
    expect(matchIntent('do push a tomorrow', named).intent).not.toBe('doToday');
    expect(matchIntent('dont do push a today', named).intent).toBe('postpone');
    expect(matchIntent('skip push a', named).intent).toBe('postpone');
    expect(matchIntent('do push a today', ctx).intent).not.toBe('doToday');
  });

  it('M12 "move Thursday to Friday" is a postpone with both days', () => {
    for (const text of ['move Thursday to Friday', "move saturday's workout to monday"]) {
      const got = matchIntent(text, ctx);
      expect(got.intent, text).toBe('postpone');
      expect(got.slots.date, text).toBeDefined();
      expect(got.slots.moveTo, text).toBeDefined();
    }
    expect(matchIntent('move Thursday to Friday', ctx).slots).toEqual({
      date: 'thu',
      moveTo: 'fri',
    });
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

describe('missing kit (M10e)', () => {
  it('"my gym has no leg press" and friends → swap Leg Press', () => {
    for (const text of [
      'my gym has no leg press',
      "there's no leg press",
      'There is no leg press here',
      'no leg press machine',
      "we don't have a leg press",
      'ไม่มีเครื่อง leg press',
    ]) {
      expect(matchIntent(text, ctx), text).toEqual({
        intent: 'swap',
        slots: { exerciseId: 'Leg_Press' },
        safety: 'none',
      });
    }
  });

  it('leaves other "no" requests alone', () => {
    expect(matchIntent('no legs today', ctx).intent).toBe('avoidArea');
    expect(matchIntent('no time today', ctx).intent).toBe('postpone');
    expect(matchIntent('no progress on hammer curls', ctx).intent).toBe('stall');
    expect(matchIntent('no energy today', ctx).intent).toBe('lighter');
    // Discomfort keeps the avoid-area path (the referral line comes first).
    expect(matchIntent('my knee is sore, no leg press', ctx).intent).toBe('avoidArea');
  });
  it('"no more squats", "no squats today", "no legs today please" are not missing-kit swaps', () => {
    // Squats and curls on today's plan, so a generic word would resolve to an exercise.
    const today: MatchContext = {
      ...ctx,
      todayExerciseIds: ['Goblet_Squat', 'Dumbbell_Bicep_Curl', 'Leg_Press'],
    };
    for (const c of [ctx, today]) {
      for (const text of [
        'no more squats',
        'no squats today',
        'no legs today please',
        'no more curls',
        'no curls anymore',
        'no leg press today',
        'ไม่มี squat วันนี้',
      ]) {
        expect(matchIntent(text, c).intent, text).not.toBe('swap');
      }
      expect(matchIntent('no legs today please', c)).toEqual({
        intent: 'avoidArea',
        slots: { area: 'legs', date: 'today' },
        safety: 'none',
      });
      // A plain statement about the gym still is one.
      expect(matchIntent('no leg press here', c).intent).toBe('swap');
      expect(matchIntent('my gym has no leg press', c).intent).toBe('swap');
    }
  });
});

describe('M12 intents: week, progress, focus block, focus edits', () => {
  const m = (text: string) => matchIntent(text, ctx);

  it('week and progress questions', () => {
    for (const t of ["How's my week?", 'this week?', 'week so far', 'how was my week'])
      expect(m(t), t).toEqual({ intent: 'week', slots: {}, safety: 'none' });
    for (const t of ['How am I doing?', 'am I on track', 'my progress so far'])
      expect(m(t), t).toEqual({ intent: 'progress', slots: {}, safety: 'none' });
  });

  it('a focus block with its slots: group, weeks ("this month" = 4) and days a week', () => {
    expect(m('This month I want to build my chest')).toEqual({
      intent: 'focusBlock',
      slots: { group: 'chest', weeks: 4 },
      safety: 'none',
    });
    expect(m('focus on my back for two weeks, five days a week').slots).toEqual({
      group: 'back',
      weeks: 2,
      daysPerWeek: 5,
    });
    expect(m('build a focus block')).toEqual({ intent: 'focusBlock', slots: {}, safety: 'none' });
    expect(m('bigger arms in 8 weeks').slots).toEqual({ group: 'arms', weeks: 8 });
  });

  it('focus edits: a count alone, or a swap on a weekday', () => {
    expect(m('only 4 days a week')).toEqual({
      intent: 'focusEdit',
      slots: { daysPerWeek: 4 },
      safety: 'none',
    });
    expect(m('make it three weeks').slots).toEqual({ weeks: 3 });
    expect(m("swap Thursday's flyes")).toEqual({
      intent: 'focusEdit',
      slots: { exerciseId: 'Dumbbell_Flyes', date: 'thu' },
      safety: 'none',
    });
    // Today / tomorrow swaps stay swaps.
    expect(m('swap the flyes today').intent).toBe('swap');
  });

  it('older intents keep their meaning', () => {
    expect(m('can we make this week an easy week').intent).toBe('deload');
    expect(m('I cant train this week').intent).toBe('postpone');
    expect(m('no progress on hammer curls').intent).toBe('stall');
    expect(m('what should I eat this week').intent).toBe('food');
    expect(m('go easy on my chest').intent).toBe('avoidArea');
    // Discomfort still flags; chest + pain is a red flag even with focus words.
    expect(m('build my chest, my chest hurts').safety).toBe('redFlag');
    expect(m('build my legs, my knee is sore')).toMatchObject({
      intent: 'avoidArea',
      safety: 'discomfort',
    });
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

  it('has the missing-kit negatives (reviewer note on M10e) as rule-supported non-swaps', () => {
    for (const text of ['no more squats', 'no squats today', 'no legs today please']) {
      const item = ITEMS.find((i) => i.text.toLowerCase() === text);
      expect(item, text).toBeDefined();
      expect(item?.ruleSupported).toBe(true);
      expect(item?.intent).not.toBe('swap');
    }
  });

  it('has the M12 doToday / move-a-day items as rule-supported', () => {
    for (const text of ['do push a today', 'move thursday to friday']) {
      const item = ITEMS.find((i) => i.text.toLowerCase() === text);
      expect(item, text).toBeDefined();
      expect(item?.ruleSupported).toBe(true);
    }
  });

  it('matches intent + slots on >= 90% of rule-supported items', () => {
    const supported = ITEMS.filter((i) => i.ruleSupported);
    const misses = supported.filter((item) => {
      const got = matchIntent(item.text, evalCtx);
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
          got: matchIntent(m.text, evalCtx),
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
