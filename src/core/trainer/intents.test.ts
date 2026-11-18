import { describe, expect, it } from 'vitest';
import {
  asksOwnNumbers,
  matchIntent,
  namesExercise,
  normalizeText,
  type IntentMatch,
  type MatchContext,
} from './intents';
import facts from './evals/facts.json';
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

  // 1.15.2 eval req-095: "leg extension" resolved to today's Standing_Dumbbell_Triceps_Extension.
  it("a fully named exercise beats today's exercise that only shares its last word", () => {
    const today: MatchContext = {
      ...evalCtx,
      todayExerciseIds: ['Standing_Dumbbell_Triceps_Extension', 'Hammer_Curls'],
    };
    expect(matchIntent("We don't have a leg extension machine", today)).toEqual({
      intent: 'swap',
      slots: { exerciseId: 'Leg_Extensions' },
      safety: 'none',
    });
    expect(matchIntent('swap the leg extensions', today).slots.exerciseId).toBe('Leg_Extensions');
    // A bare head word still picks today's.
    expect(matchIntent('swap the extensions', today).slots.exerciseId).toBe(
      'Standing_Dumbbell_Triceps_Extension',
    );
    expect(matchIntent('swap the curls', today).slots.exerciseId).toBe('Hammer_Curls');
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

describe('M13c: asking for abs opens the focus flow with core', () => {
  const m = (text: string) => matchIntent(text, ctx);
  const CORE = { intent: 'focusBlock', slots: { group: 'core' }, safety: 'none' };

  it('English: add abs, abs, core, six pack, train my abs', () => {
    for (const t of [
      'add abs',
      'Add abs to my plan',
      'can you add some core work',
      'abs',
      'Abs?',
      'core',
      'six pack',
      'I want a six pack',
      'I want a six-pack',
      'more abs please',
      'train my abs',
      'focus on abs',
      'build my core',
    ])
      expect(m(t), t).toMatchObject(CORE);
  });

  it('Thai: หน้าท้อง / ท้อง / ซิกแพค', () => {
    for (const t of ['หน้าท้อง', 'ท้อง', 'เพิ่มหน้าท้อง', 'อยากเล่นหน้าท้อง', 'อยากมีซิกแพค', 'เพิ่มท่าหน้าท้อง'])
      expect(m(t), t).toMatchObject(CORE);
  });

  it('counts still come along', () => {
    expect(m('add abs for 3 weeks')).toEqual({
      intent: 'focusBlock',
      slots: { group: 'core', weeks: 3 },
      safety: 'none',
    });
  });

  it('never for discomfort, avoiding, food or a stomach that is not about training', () => {
    expect(m('my abs hurt')).toMatchObject({ intent: 'avoidArea', safety: 'discomfort' });
    expect(m('ปวดท้อง')).toMatchObject({ safety: 'discomfort' });
    expect(m('ปวดท้อง').intent).not.toBe('focusBlock');
    expect(m('skip abs').intent).toBe('avoidArea');
    expect(m('go easy on my core').intent).toBe('avoidArea');
    expect(m('what should I eat for abs').intent).toBe('food');
    // Bare "ท้อง" only on its own: in a sentence it can mean other things (e.g. ตั้งท้อง).
    for (const t of ['ฉันท้อง', 'ตั้งท้อง', 'ท้องว่าง', 'my stomach is full', 'I want a flat stomach'])
      expect(m(t).intent, t).not.toBe('focusBlock');
  });

  it('M13c review: questions about abs do not open the focus flow', () => {
    for (const t of [
      'หน้าท้องทำไมไม่ลด',
      'ทำไมหน้าท้องไม่ขึ้น',
      'หน้าท้องลดยังไง',
      'does core work help squats',
      'do abs count as core',
      'what works my abs',
      'why do my abs not show',
      'how do I get abs',
      'does my core get trained by squats',
      'ท้องผูก',
      'ปวดท้อง',
      'ฉันท้อง',
      'ตั้งท้อง',
    ])
      expect(m(t).intent, t).not.toBe('focusBlock');
  });

  it('M13c review: an add word inside the abs words does not count; a polite ask still does', () => {
    // "work" in "core work" is part of the abs words, not a request.
    expect(m('core work').intent).not.toBe('focusBlock');
    expect(m('core workout').intent).not.toBe('focusBlock');
    for (const t of ['เพิ่มหน้าท้องได้ไหม', 'เพิ่มหน้าท้องได้มั้ย', 'can you add abs?', 'how about some abs'])
      expect(m(t), t).toMatchObject(CORE);
  });
});

describe('M12 1b short on time', () => {
  const short = (text: string) => matchIntent(text, evalCtx);

  it('a session length in minutes → shortOnTime with the minutes as typed', () => {
    expect(short('I have 30 min')).toEqual({
      intent: 'shortOnTime',
      slots: { minutes: 30 },
      safety: 'none',
    });
    expect(short('I have 25 min today').slots).toEqual({ minutes: 25, date: 'today' });
    expect(short('only 20 minutes').slots).toEqual({ minutes: 20 });
    expect(short('got 45mins').slots).toEqual({ minutes: 45 });
    expect(short("I'm busy, I only have 30 minutes")).toMatchObject({
      intent: 'shortOnTime',
      slots: { minutes: 30 },
    });
  });

  it('reads number words, half an hour and hours', () => {
    expect(short('I only have twenty minutes').slots).toEqual({ minutes: 20 });
    expect(short('forty-five minutes tops').slots).toEqual({ minutes: 45 });
    expect(short('I have half an hour').slots).toEqual({ minutes: 30 });
    expect(short('I have an hour').slots).toEqual({ minutes: 60 });
    expect(short('just 1 hour today').slots).toEqual({ minutes: 60, date: 'today' });
  });

  it('a short-on-time phrase without a length → shortOnTime with no minutes', () => {
    for (const text of [
      'Short on time',
      "I'm short on time today",
      "I'm in a hurry",
      'quick workout please',
      "I don't have much time",
    ]) {
      const got = short(text);
      expect(got.intent, text).toBe('shortOnTime');
      expect(got.slots.minutes, text).toBeUndefined();
    }
  });

  it('understands Thai', () => {
    expect(short('มีเวลา 30 นาที')).toMatchObject({ intent: 'shortOnTime', slots: { minutes: 30 } });
    expect(short('วันนี้มีเวลาน้อย').intent).toBe('shortOnTime');
    expect(short('มีเวลาแค่ครึ่งชั่วโมง').slots.minutes).toBe(30);
  });

  it('`minutes` is only ever a shortOnTime slot', () => {
    for (const item of ITEMS) {
      const got = matchIntent(item.text, evalCtx);
      if (got.intent !== 'shortOnTime') expect(got.slots.minutes, item.text).toBeUndefined();
    }
  });

  it('leaves other requests alone', () => {
    expect(short('No time for the gym on Wednesday').intent).toBe('postpone');
    expect(short("I can't make it today, something came up").intent).toBe('postpone');
    expect(short('rest 2 minutes').intent).toBe('help');
    expect(short('what can I eat in 10 minutes').intent).toBe('food');
    expect(short('deload week, I only have 30 minutes').intent).toBe('deload');
    // Discomfort first: the area is handled, never a faster workout.
    expect(short('my knee hurts and I only have 20 minutes')).toMatchObject({
      intent: 'avoidArea',
      safety: 'discomfort',
    });
    expect(short('chest pain and dizzy, only 20 minutes')).toEqual({
      intent: 'help',
      slots: {},
      safety: 'redFlag',
    });
  });

  it('has at least 5 rule-supported eval items', () => {
    const items = ITEMS.filter((i) => i.intent === 'shortOnTime');
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) {
      expect(item.ruleSupported, item.text).toBe(true);
      const got = matchIntent(item.text, evalCtx);
      expect(got.intent, item.text).toBe('shortOnTime');
      expect(sortKeys(got.slots), item.text).toEqual(sortKeys(item.slots));
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

// 1.15.2 phone eval follow-ups (req-036, req-043, req-058; six facts questions read as actions).
describe('1.15.2 eval follow-ups', () => {
  it('"X instead of Y": the exercise being replaced is Y (req-058)', () => {
    expect(matchIntent('Can I do face pulls instead of reverse flyes?', evalCtx)).toMatchObject({
      intent: 'swap',
      slots: { exerciseId: 'Reverse_Flyes' },
    });
    expect(matchIntent('lunges instead of goblet squats today', evalCtx).slots.exerciseId).toBe(
      'Goblet_Squat',
    );
    // Nothing named after "instead of": the usual reading.
    expect(matchIntent('swap the leg press, something else instead', evalCtx).slots).toMatchObject({
      exerciseId: 'Leg_Press',
    });
  });

  it('an area that is toast / fried / wrecked / smoked: go easy on it (req-036)', () => {
    expect(matchIntent('my arms are toast from yesterday, be gentle', evalCtx)).toEqual({
      intent: 'avoidArea',
      slots: { area: 'arms' },
      safety: 'none',
    });
    for (const [text, area] of [
      ['legs are fried', 'legs'],
      ['my shoulders are wrecked', 'shoulders'],
      ['back is smoked after deadlifts', 'back'],
      ['be gentle on my chest today', 'chest'],
    ] as const)
      expect([text, matchIntent(text, evalCtx)]).toMatchObject([
        text,
        { intent: 'avoidArea', slots: { area }, safety: 'none' },
      ]);
    // "toast" not about an area is no change.
    expect(matchIntent('I had toast for breakfast', evalCtx).intent).not.toBe('avoidArea');
  });

  it('feeling meh / flat: a lighter day (req-043)', () => {
    expect(matchIntent('I feel kind of meh today', evalCtx)).toEqual({
      intent: 'lighter',
      slots: { date: 'today' },
      safety: 'none',
    });
    for (const text of ['feeling flat', 'kinda meh tonight', 'I feel a bit meh'])
      expect([text, matchIntent(text, evalCtx).intent]).toEqual([text, 'lighter']);
  });

  it('no no-action eval item turns into an action', () => {
    const answers = new Set(['help', 'week', 'progress']);
    for (const item of ITEMS.filter((i) => answers.has(i.intent)))
      expect([item.text, answers.has(matchIntent(item.text, evalCtx).intent)]).toEqual([
        item.text,
        true,
      ]);
  });

  it('asksOwnNumbers: a question about the user’s own numbers or history', () => {
    for (const f of [
      "How's my month going?",
      "What's my best lat pulldown this month?",
      'How many calories have I eaten today?',
      "What's my protein target today?",
      'How many calories do I have left today?',
      'How much protein do I still need today?',
      'What was my best bench press set lately?',
      'What did I goblet squat last time?',
      'Did I hit my protein yesterday?',
      'When did I last train legs?',
      'How is my streak?',
      'Which lift is my best this month?',
    ])
      expect([f, asksOwnNumbers(f)]).toEqual([f, true]);
    for (const f of [
      'how much protein is left for dinner', // a meal word: asks for a suggestion
      'how many calories should I have at lunch',
      'What should I eat?',
      'Can you move my session to Friday?',
      'The leg press is taken, what else can I do?',
      'Can I do face pulls instead of reverse flyes?',
      'my left knee is sore',
      'I have 30 min left',
      '',
    ])
      expect([f, asksOwnNumbers(f)]).toEqual([f, false]);
  });

  // The six the 1.15.2 phone eval answered with an action card.
  it('asksOwnNumbers: the six facts questions read as actions; no action request', () => {
    const six = [
      'monthSessions',
      'pulldownBest',
      'kcalEaten',
      'proteinTarget',
      'kcalLeft',
      'proteinLeft',
    ];
    for (const f of facts.items.filter((x) => six.includes(x.id)))
      expect([f.id, asksOwnNumbers(f.text)]).toEqual([f.id, true]);
    const answers = new Set(['help', 'week', 'progress']);
    for (const item of ITEMS.filter((i) => !answers.has(i.intent) && i.safety === 'none'))
      expect([item.text, asksOwnNumbers(item.text)]).toEqual([item.text, false]);
  });

  // Reviewer (1.15.2 follow-up): change requests phrased as questions keep their rules action.
  it('asksOwnNumbers: advice questions and questions with a command word are not facts', () => {
    for (const [f, intent] of REVIEW_ACTIONS) {
      expect([f, asksOwnNumbers(f)]).toEqual([f, false]);
      expect([f, matchIntent(f, evalCtx).intent]).toEqual([f, intent]);
    }
    // "left" next to a time unit is time, "best" without "my" is advice.
    expect(asksOwnNumbers('what now, 20 minutes left')).toBe(false);
    expect(asksOwnNumbers('which is the best one')).toBe(false);
    expect(asksOwnNumbers('which set was my best')).toBe(true);
  });

  // Re-review: a command word in a past-tense question about the user is history, not a request.
  it('asksOwnNumbers: "did I skip / cut / drop" is a history question', () => {
    for (const f of HISTORY_WITH_COMMAND_WORDS) expect([f, asksOwnNumbers(f)]).toEqual([f, true]);
    // A command after the question mark is still a request.
    expect(asksOwnNumbers('Did I stall on bench? swap it')).toBe(false);
    expect(asksOwnNumbers('How many sets did I skip? skip legs today too')).toBe(false);
    // Advice always blocks, even with "did I".
    expect(asksOwnNumbers('did I train enough, should I deload')).toBe(false);
  });

  it('fewer / less / easier are command words: lighter stays a request', () => {
    for (const f of [
      'how many fewer sets today',
      'how much easier today please',
      'how much less weight today, feeling flat',
    ]) {
      expect([f, asksOwnNumbers(f)]).toEqual([f, false]);
      expect([f, matchIntent(f, evalCtx).intent]).toEqual([f, 'lighter']);
    }
  });

  it('"rather than" is not a replaced-exercise marker (ambiguous order)', () => {
    expect(phrases.swapReplaced.after).toEqual(['instead of', 'in place of']);
  });

  it('"X instead of Y" reads only Y when Y names an exercise; never X', () => {
    const m = matchIntent('Can I do the leg press instead of rows?', evalCtx);
    expect(m.intent).toBe('swap');
    expect(m.slots.exerciseId).not.toBe('Leg_Press');
  });

  it('the generic word "up" names no exercise ("fed up", "warm up")', () => {
    for (const text of ['I am fed up, swap something', 'swap the warm up']) {
      expect([text, matchIntent(text, evalCtx).slots.exerciseId]).toEqual([text, undefined]);
      expect([text, namesExercise(text, evalCtx)]).toEqual([text, false]);
    }
    // "ups" is as generic: "sit-ups" is not Step Ups (no sit-up in the catalog → the whole text).
    expect(namesExercise('sit ups', evalCtx)).toBe(false);
    expect(matchIntent('do crunches instead of sit-ups', evalCtx)).toMatchObject({
      intent: 'swap',
      slots: { exerciseId: 'Crunches' },
    });
    expect(matchIntent('swap push ups', evalCtx).slots.exerciseId).toBe('Pushups');
    expect(matchIntent('swap step ups', evalCtx).slots.exerciseId).toBe('Dumbbell_Step_Ups');
  });

  it('feels flat / feels meh: lighter', () => {
    for (const text of ['Everything feels meh today', 'it feels flat'])
      expect([text, matchIntent(text, evalCtx).intent]).toEqual([text, 'lighter']);
  });

  it('namesExercise: the text names a catalog exercise (name, alias or head word)', () => {
    expect(namesExercise('Can I do face pulls instead of reverse flyes?', evalCtx)).toBe(true);
    expect(namesExercise('swap the curls', evalCtx)).toBe(true);
    expect(namesExercise('Swap an exercise', evalCtx)).toBe(false);
    expect(namesExercise('Adjust my plan', evalCtx)).toBe(false);
  });
});

describe('purity', () => {
  it('uses no network or DOM', () => {
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});

/** History questions that contain a command word (re-review): they are facts questions. */
const HISTORY_WITH_COMMAND_WORDS = [
  'How many sessions did I skip this month?',
  'How many calories did I cut this week?',
  'Did I drop below my calorie target?',
];

/** Reviewer's change requests phrased as questions (1.15.2 follow-up): each keeps its intent. */
const REVIEW_ACTIONS: readonly [string, IntentMatch['intent']][] = [
  ['What should I do with 20 minutes left?', 'shortOnTime'],
  ['How much lighter should I go today?', 'lighter'],
  ['How many sets should I cut today, I am tired', 'lighter'],
  ['How many reps left in my plan? go lighter', 'lighter'],
  ['how much should I deload', 'deload'],
  ['How much protein should I eat?', 'food'],
  ['How many calories should I eat today?', 'food'],
  ['What can I eat with 40g protein left?', 'food'],
  ["What's the best swap for the bench press?", 'swap'],
  ['How much weight should I drop on bench, it stalled', 'stall'],
  ['Did I stall on bench? swap it', 'swap'],
];

function sortKeys(o: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
