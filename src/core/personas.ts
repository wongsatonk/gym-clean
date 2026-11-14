// Coach voice personas (design 2026-11-13 "drill-sergeant coach voice"). Pure: a calm line the
// app is about to speak goes in, the drill sergeant's version comes out. Nothing is generated
// live: every line is written here, per rudeness level, and tests check the word lists.
//  - Count words are never rewritten (the count must never be late).
//  - Each calm line is matched against a template; captured variables (reps, weights, names,
//    distances) and the actual fix are kept in every variant.
//  - Unknown text comes back unchanged (calm fallback).
//  - Hard limits at every level: no slurs or identity insults, no body/weight/looks jokes, no
//    pain or injury words, at most DRILL_MAX_WORDS words.
import cuesJson from '../data/cues.json';
import { RULES } from './exercises';
import type { MissReason } from './exercises';

/** 1 = Tough (no swearing), 2 = Rude (damn, hell, ass, crap), 3 = Savage (everything). */
export type Rudeness = 1 | 2 | 3;
export const RUDENESS_LEVELS: readonly Rudeness[] = [1, 2, 3];
export const RUDENESS_NAMES: Readonly<Record<Rudeness, string>> = {
  1: 'Tough',
  2: 'Rude',
  3: 'Savage',
};

/** Same kinds as the speech choke point (ui/voice.ts). */
export type DrillKind = 'count' | 'hint' | 'cue';

/** A drill line must be speakable in about 4 s. */
export const DRILL_MAX_WORDS = 14;

type Lines = Readonly<Record<Rudeness, readonly string[]>>;

/**
 * A calm line pattern and its rude variants. Variants use `{group}` for a captured group as is,
 * and `{group!}` for the group with its final "." turned into "!".
 */
type Template = {
  id: string;
  match: (calm: string) => Record<string, string> | null;
  lines: Lines;
};

const re =
  (r: RegExp) =>
  (calm: string): Record<string, string> | null => {
    const m = r.exec(calm);
    return m ? { ...m.groups } : null;
  };
const exact = (text: string) => (calm: string) => (calm === text ? {} : null);
const oneOf =
  (texts: Iterable<string>) =>
  (calm: string): Record<string, string> | null => {
    const set = new Set(texts);
    return set.has(calm) ? { fix: calm } : null;
  };

// ---------------------------------------------------------------------------------------------
// Rest cues (restCues.ts), hands-free (ui/cameraView.ts), voice tests (ui/app.ts, ui/audioTest.ts)

const REST: Template[] = [
  {
    id: 'rest.tenSeconds',
    match: re(/^Ten seconds\. Next: (?<next>.+), set (?<set>\d+)\.$/),
    lines: {
      1: [
        'Ten seconds. Quit stalling. {next}, set {set}.',
        'Ten seconds, recruit! {next}, set {set}. Get ready!',
        'Ten seconds! {next}, set {set}. Eyes front!',
      ],
      2: [
        'Ten seconds. {next}, set {set}. Get your ass ready.',
        'Ten damn seconds! {next}, set {set}. Move!',
        'Ten seconds. {next}, set {set}. Quit the damn daydreaming.',
      ],
      3: [
        'Ten seconds! {next}, set {set}. Get your shit together.',
        'Ten fucking seconds. {next}, set {set}. Up!',
        'Ten seconds. {next}, set {set}. No more fucking around.',
      ],
    },
  },
  {
    id: 'rest.go',
    match: exact('Go.'),
    lines: {
      1: ['Go! Get under that weight!', 'Go, go, go! Move it!', "Time's up, recruit. Go!"],
      2: ['Go! Get your ass up!', 'Go! Rest is over, damn it!', 'Go! Move it like hell!'],
      3: ['Go! Get the fuck up!', 'Go! Get under that fucking weight!', 'Go! Quit fucking around!'],
    },
  },
  {
    id: 'rest.nudge',
    match: re(/^Rest is over\. (?<next>.+), set (?<set>\d+)\.$/),
    lines: {
      1: [
        'Rest is over, recruit! {next}, set {set}. Now!',
        'Are we napping? {next}, set {set}. Move!',
        'Clock ran out! {next}, set {set}. Go!',
      ],
      2: [
        'Rest is over, damn it! {next}, set {set}.',
        'Off your ass! {next}, set {set}.',
        'What the hell are you waiting for? {next}, set {set}.',
      ],
      3: [
        'Rest is fucking over! {next}, set {set}.',
        'Quit the bullshit. {next}, set {set}. Now!',
        'Get your shit up! {next}, set {set}.',
      ],
    },
  },
];

const HANDS_FREE: Template[] = [
  {
    id: 'handsFree.setDone',
    match: re(/^Set done\. (?<n>\d+) (?<reps>reps?)\.$/),
    lines: {
      1: [
        "Set done. {n} {reps}. Don't get comfy.",
        "{n} {reps} in the bank. Don't you smile yet.",
        'Set done. {n} {reps}. Breathe, then back to work.',
      ],
      2: [
        "Set done. {n} {reps}. Don't get comfy, damn it.",
        "{n} {reps}. Hell, that wasn't terrible.",
        'Set done. {n} {reps}. Rest your ass, not your brain.',
      ],
      3: [
        "Set done. {n} {reps}. Don't get fucking comfy.",
        '{n} {reps}. Holy shit, you actually finished.',
        'Set done. {n} {reps}. Now shut up and rest.',
      ],
    },
  },
  {
    id: 'handsFree.keepGoing',
    match: exact('Keep going.'),
    lines: {
      1: ['Did I say stop? Keep going!', 'Nobody said rest! Keep going!', 'Keep going! Earn it!'],
      2: [
        'Did I say stop? Keep going, damn it!',
        "Hell no, you're not done. Keep going!",
        'Keep going! Move your ass!',
      ],
      3: [
        'Did I say stop? Keep fucking going!',
        'Who the fuck said stop? Keep going!',
        'Keep going! Get the fuck back under that weight!',
      ],
    },
  },
  {
    id: 'handsFree.cameraOff',
    match: exact('Camera off.'),
    lines: {
      1: ["Camera off. I'm still watching you.", "Camera off. Don't slack off."],
      2: ["Camera off. Don't sit on your ass.", 'Camera off. I still see you, damn it.'],
      3: ["Camera off. Don't fuck around.", 'Camera off. No fucking slacking.'],
    },
  },
];

const VOICE_TEST: Template[] = [
  {
    id: 'voiceTest',
    match: exact('Voice test. One, two, three.'),
    lines: {
      1: ['Voice test! One, two, three! Sound off!', 'Can you hear me, recruit? One, two, three!'],
      2: ['Voice test, damn it! One, two, three!', 'Hear me? One, two, three! Hell yes!'],
      3: ['Voice test! One, two, fucking three!', 'Hear me, recruit? One, two, three. Fuck yes!'],
    },
  },
  {
    id: 'audioTest',
    match: re(/^(?<n>[A-Z][a-z]+)\. Slow the lowering\.$/),
    lines: {
      1: ['{n}. Slow the lowering, recruit!', '{n}. Control it! Slow the lowering!'],
      2: ['{n}. Slow the damn lowering!', '{n}. Slow the lowering, damn it!'],
      3: ['{n}. Slow the fucking lowering!', "{n}. Slow the lowering, for fuck's sake!"],
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Focus cues (focus.ts CUE_TEXT). The fix words stay in every variant.

const FOCUS: Template[] = [
  {
    id: 'focus.rushedLowering',
    match: exact('Slow the lowering.'),
    lines: {
      1: [
        'Slow the lowering! Control it!',
        'Easy on the way down! Slow the lowering!',
        "Don't drop it! Slow the lowering!",
      ],
      2: ['Slow the damn lowering!', "Slow the lowering! Gravity's doing your work, damn it!"],
      3: ['Slow the fucking lowering!', 'Stop dropping that shit! Slow the lowering!'],
    },
  },
  {
    id: 'focus.shrinkingRange',
    match: exact('Full range.'),
    lines: {
      1: ['Full range! No half reps in my gym!', 'Full range, recruit! All the way!'],
      2: ['Full range, damn it!', 'Half reps? Hell no! Full range!'],
      3: ['Full fucking range!', 'Half-ass reps are shit! Full range!'],
    },
  },
  {
    id: 'focus.stalled',
    match: re(/^Stay with it\. (?<n>\d+) to go\.$/),
    lines: {
      1: ['Did I say stop? {n} to go!', '{n} to go! Stay with it, recruit!'],
      2: ['{n} to go, damn it! Stay with it!', 'Did I say stop? Hell no! {n} to go!'],
      3: [
        "{n} more, for fuck's sake! Stay with it!",
        'Did I say stop? Get the fuck back under it! {n} to go!',
      ],
    },
  },
  {
    id: 'focus.outOfFrame',
    match: exact('Step back into frame.'),
    lines: {
      1: ["Where'd you go? Step back into frame!", "I can't see you! Step back into frame!"],
      2: ['Get your ass back into frame!', 'Where the hell did you go? Step back into frame!'],
      3: [
        'Where the fuck did you go? Back into frame!',
        "Get your ass back in frame, for fuck's sake!",
      ],
    },
  },
  {
    id: 'focus.lowFps',
    match: exact('Move closer to the light.'),
    lines: {
      1: [
        "I can't see a thing! Move closer to the light!",
        'Too dark, recruit! Move closer to the light!',
      ],
      2: [
        "It's dark as hell! Move closer to the light!",
        "I can't see crap! Move closer to the light!",
      ],
      3: [
        "I can't see shit! Move closer to the light!",
        'Too fucking dark! Move closer to the light!',
      ],
    },
  },
  {
    id: 'focus.armsOutOfSync',
    match: exact('Both arms together.'),
    lines: {
      1: ["Both arms together! This isn't a solo act!", 'One team! Both arms together!'],
      2: ['Both arms together, damn it!', 'What the hell is that arm doing? Both arms together!'],
      3: [
        "Both arms together, for fuck's sake!",
        'One arm is slacking like shit! Both arms together!',
      ],
    },
  },
  {
    id: 'focus.raiseTooHigh',
    match: exact('Stop at shoulder height.'),
    lines: {
      1: ['Too high! Stop at shoulder height!', 'Not a jumping jack! Stop at shoulder height!'],
      2: ['Too damn high! Stop at shoulder height!', 'Hell no, too high! Stop at shoulder height!'],
      3: [
        'Too fucking high! Stop at shoulder height!',
        "That's not a damn salute! Stop at shoulder height!",
      ],
    },
  },
  {
    id: 'focus.elbowDrift',
    match: exact('Keep your elbow still.'),
    lines: {
      1: [
        'Elbow still! Let the arm do the work!',
        "That elbow's wandering! Keep your elbow still!",
      ],
      2: ['Keep that damn elbow still!', 'Where the hell is that elbow going? Keep it still!'],
      3: ['Keep your fucking elbow still!', 'Quit swinging that shit! Keep your elbow still!'],
    },
  },
  {
    id: 'focus.bodySwing',
    match: exact('Keep your body still.'),
    lines: {
      1: ['No swinging! Keep your body still!', "This isn't a dance! Keep your body still!"],
      2: [
        'Quit swinging your ass! Keep your body still!',
        'No damn momentum! Keep your body still!',
      ],
      3: [
        'Momentum is bullshit! Keep your body still!',
        'Stop fucking swinging! Keep your body still!',
      ],
    },
  },
  {
    id: 'focus.hipSag',
    match: exact('Keep your body straight.'),
    lines: {
      1: ['Hips up! Keep your body straight!', 'Plank it, recruit! Keep your body straight!'],
      2: [
        'Hips up, damn it! Keep your body straight!',
        'Hips up like hell! Keep your body straight!',
      ],
      3: [
        'Hips up! Keep your fucking body straight!',
        'Get those hips up, shit! Keep your body straight!',
      ],
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Partial hints (exercise rules) and exercise focus cues (data/cues.json): generic wrappers that
// keep the calm fix word for word. Built from the data so new hints/cues are covered.

const HINT_LINES: Readonly<Record<MissReason, Lines>> = {
  far: {
    1: [
      'Half a rep? {fix!}',
      "That's a warm-up, not a rep! {fix!}",
      'Not even close, recruit! {fix!}',
    ],
    2: [
      "Half a rep? That's a damn warm-up. {fix!}",
      'What the hell was that? {fix!}',
      'Half-assed rep! {fix!}',
    ],
    3: [
      "Half a rep? That's bullshit. {fix!}",
      'What the fuck was that? {fix!}',
      'That rep was shit! {fix!}',
    ],
  },
  start: {
    1: [
      'Finish the rep! {fix!}',
      'Not done yet, recruit! {fix!}',
      '{fix!} Every rep, no shortcuts!',
    ],
    2: [
      'Finish the damn rep! {fix!}',
      "Hell no, that's not done! {fix!}",
      '{fix!} Every damn rep!',
    ],
    3: ['Finish the fucking rep! {fix!}', 'Bullshit rep! {fix!}', '{fix!} Every fucking rep!'],
  },
};

const HINTS: Template[] = (['far', 'start'] as const).map((reason) => ({
  id: `hint.${reason}`,
  match: oneOf(RULES.map((r) => r.hints[reason])),
  lines: HINT_LINES[reason],
}));

const EXERCISE_CUES: Template = {
  id: 'exerciseCue',
  match: oneOf(Object.values(cuesJson as Record<string, string>)),
  lines: {
    1: ['Listen up! {fix!}', 'Eyes on me, recruit! {fix!}', '{fix!} Every single rep!'],
    2: ['Listen up, damn it! {fix!}', 'Hear me? {fix!} Hell yes!', '{fix!} Every damn rep!'],
    3: [
      'Listen the fuck up! {fix!}',
      "Listen up, for fuck's sake! {fix!}",
      '{fix!} Every fucking rep!',
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Phone placement (exercise rules' `placement.spoken`), shortened to stay ≤ 14 words.

const PLACEMENT: Template[] = [
  {
    id: 'placement.sideOn',
    match: re(/^Stand side-on, (?<dist>.+?) from the phone, with (?<what>.+) in view\.$/),
    lines: {
      1: [
        'Side-on, {dist} out, {what} in view. Move it!',
        'Side-on, recruit! {dist} out, {what} in view.',
      ],
      2: [
        'Side-on, damn it! {dist} out, {what} in view.',
        'Side-on, {dist} out, {what} in view. Hell, move!',
      ],
      3: [
        'Fucking side-on! {dist} out, {what} in view.',
        'Side-on, {dist} out, {what} in view. Fucking move!',
      ],
    },
  },
  {
    id: 'placement.facing',
    match: re(
      /^Face the phone at chest height, (?<dist>.+?) away, with room (?<where>\w+) your hands\.$/,
    ),
    lines: {
      1: [
        'Chest-high phone, {dist} away, room {where} your hands. Move!',
        'Face it, recruit! Chest height, {dist} away, room {where} hands.',
      ],
      2: [
        'Chest-high phone, {dist} away, room {where} your hands. Damn, move!',
        'Face the damn phone. Chest-high, {dist} away, room {where} hands.',
      ],
      3: [
        'Face the fucking phone. Chest-high, {dist} away, room {where} hands.',
        'Chest-high phone, {dist} away, room {where} your hands. Fucking move!',
      ],
    },
  },
  {
    id: 'placement.floor',
    match: re(/^Put the phone on the floor beside you, (?<dist>.+?) away, whole body in view\.$/),
    lines: {
      1: [
        'Phone down beside you, {dist} out, whole body in view!',
        'Floor, beside you, {dist} out, whole body in view. Now!',
      ],
      2: [
        'Phone down beside you, {dist} out, whole damn body in view!',
        'Floor, beside you, {dist} out, whole body in view. Hell, move!',
      ],
      3: [
        'Phone down beside you, {dist} out, whole fucking body in view!',
        'Floor, beside you, {dist} out, whole body in view. Fucking move!',
      ],
    },
  },
  {
    id: 'placement.bench',
    match: re(
      /^Put the phone at bench height, (?<dist>.+?) away, with your rowing arm facing it\.$/,
    ),
    lines: {
      1: [
        'Bench-high phone, {dist} out, rowing arm toward it. Move!',
        'Phone at bench height, {dist} away, rowing arm facing it!',
      ],
      2: [
        'Bench-high phone, {dist} out, rowing arm toward it. Damn, move!',
        'Bench-high phone, {dist} out, rowing arm facing it. Hell yes!',
      ],
      3: [
        'Bench-high phone, {dist} out, rowing arm facing it. Fucking move!',
        "Bench-high phone, {dist} out, rowing arm facing it, for fuck's sake!",
      ],
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Coach tips (advice.ts `say`). Next-time tips drop the exercise name (it was just done) and
// keep the tail ("drop to 7.5 kilos.") word for word.

const ADVICE: Template[] = [
  {
    id: 'advice.A1',
    match: exact('Focus on full range.'),
    lines: {
      1: ['Full range next set! No more half reps!', 'Next set: full range, recruit! Every rep!'],
      2: ['Full range next set, damn it!', 'Next set, full range. No half-ass reps!'],
      3: ['Full fucking range next set!', 'Next set: full range. No half-assed shit!'],
    },
  },
  {
    id: 'advice.A1keep',
    match: exact('Keep the weight. Focus on full range.'),
    lines: {
      1: [
        'Same weight. Full range this time, recruit!',
        'Keep the weight. Full range, no excuses!',
      ],
      2: ['Keep the weight. Full range, damn it!', 'Same weight. No half-ass reps this time!'],
      3: ['Keep the weight. Full fucking range!', 'Same weight. Cut the half-rep bullshit!'],
    },
  },
  {
    id: 'advice.A2keep',
    match: re(/^Keep the weight\. Aim for (?<n>\d+) reps\.$/),
    lines: {
      1: ['Same weight. {n} reps next set, recruit!', 'Keep the weight. I want {n} reps!'],
      2: ['Same weight. {n} reps, damn it!', 'Keep the weight. {n} reps, no damn excuses!'],
      3: ['Same weight. {n} fucking reps!', 'Keep the weight and get me {n} fucking reps!'],
    },
  },
  {
    id: 'advice.A2',
    match: re(/^Aim for (?<n>\d+) reps\.$/),
    lines: {
      1: ['{n} reps next set! No excuses!', 'I want {n} reps, recruit!'],
      2: ['{n} reps next set, damn it!', '{n} reps next set. Get your ass in gear!'],
      3: ['{n} fucking reps next set!', 'Get me {n} reps, no bullshit!'],
    },
  },
  {
    id: 'advice.A3',
    match: re(/^Strong set\. Try plus (?<jump>[\d.,]+) (?<unit>kilos|pounds) next set\.$/),
    lines: {
      1: [
        'Not bad, recruit. Plus {jump} {unit} next set. You can handle it.',
        'Strong set! Plus {jump} {unit} next set. Earn it!',
      ],
      2: [
        'Damn, strong set! Plus {jump} {unit} next set!',
        "Hell yes! Plus {jump} {unit} next set. Don't get comfy.",
      ],
      3: [
        'Fuck yes, strong set! Plus {jump} {unit} next set!',
        'Holy shit, not bad. Plus {jump} {unit} next set!',
      ],
    },
  },
  {
    id: 'advice.A4',
    match: re(/^Strong set\. Try (?<n>\d+) reps next set\.$/),
    lines: {
      1: ['Strong set! {n} reps next set. Earn it!', 'Not bad, recruit. Now give me {n} reps!'],
      2: ['Damn, strong set! {n} reps next set!', 'Hell yes! Now give me {n} reps!'],
      3: ['Fuck yes! {n} reps next set!', 'Holy shit, not bad. Now {n} reps!'],
    },
  },
  {
    id: 'advice.A5',
    match: exact('Rest ran long. Start when the timer says go.'),
    lines: {
      1: [
        'Rest ran long! Start when the timer says go!',
        'Is this a spa? Start when the timer says go!',
      ],
      2: [
        'Rest ran long as hell! Start when the timer says go!',
        'Is this a damn spa? Start when the timer says go!',
      ],
      3: [
        'Rest ran fucking long! Start when the timer says go!',
        'Is this a fucking spa? Start when the timer says go!',
      ],
    },
  },
  {
    id: 'advice.nextTime',
    match: re(/^Next time(?: on|,) (?<name>.+?): (?<tail>.+)$/),
    lines: {
      1: [
        'Next time: {tail} You can handle it.',
        'Next time, recruit: {tail} No excuses.',
        'Listen up. Next time: {tail}',
      ],
      2: [
        'Next time: {tail} No damn excuses.',
        'Next time, damn it: {tail}',
        "Next time: {tail} Don't half-ass it.",
      ],
      3: [
        'Next time: {tail} No fucking excuses.',
        "Next time: {tail} Don't fuck it up.",
        'Next time: {tail} No bullshit.',
      ],
    },
  },
];

/** All templates, most specific first. */
const TEMPLATES: readonly Template[] = [
  ...REST,
  ...HANDS_FREE,
  ...VOICE_TEST,
  ...FOCUS,
  ...ADVICE,
  ...PLACEMENT,
  ...HINTS,
  EXERCISE_CUES,
];

// ---------------------------------------------------------------------------------------------

function fill(line: string, vars: Record<string, string>): string {
  return line.replace(/\{(\w+)(!?)\}/g, (whole, key: string, bang: string) => {
    const v = vars[key];
    if (v === undefined) return whole;
    return bang ? v.replace(/\.$/, '!') : v;
  });
}

type Found = { template: Template; vars: Record<string, string> };

function find(calm: string): Found | null {
  const text = calm.trim();
  for (const template of TEMPLATES) {
    const vars = template.match(text);
    if (vars) return { template, vars };
  }
  return null;
}

/** The template id a calm line matches, or null (spoken unchanged). For tests and dev logs. */
export function drillTemplateFor(calmText: string): string | null {
  return find(calmText)?.template.id ?? null;
}

/** Every drill variant for a calm line at a level, variables filled in; [] for counts/unknown. */
export function drillVariants(calmText: string, kind: DrillKind, level: Rudeness): string[] {
  if (kind === 'count') return [];
  const f = find(calmText);
  return f ? f.template.lines[level].map((l) => fill(l, f.vars)) : [];
}

/** Last variant index per template and level; create one per voice (createDrillSergeant). */
export type DrillMemory = Map<string, number>;

const clampIndex = (i: number, n: number) =>
  Number.isFinite(i) ? Math.min(n - 1, Math.max(0, Math.floor(i))) : 0;

/**
 * The drill sergeant's version of a calm line. Counts and unknown text come back unchanged.
 * `pick(n)` returns an index in [0, n) (e.g. `n => Math.floor(Math.random() * n)`). With
 * `memory`, the previous variant of the same template is never picked again back to back.
 */
export function drillSergeantLine(
  calmText: string,
  kind: DrillKind,
  level: Rudeness,
  pick: (n: number) => number,
  memory?: DrillMemory,
): string {
  if (kind === 'count') return calmText;
  const f = find(calmText);
  if (!f) return calmText;
  const lines = f.template.lines[level];
  const key = `${f.template.id}@${level}`;
  const last = memory?.get(key);
  let idx: number;
  if (last !== undefined && lines.length > 1) {
    const k = clampIndex(pick(lines.length - 1), lines.length - 1);
    idx = k >= last ? k + 1 : k;
  } else {
    idx = clampIndex(pick(lines.length), lines.length);
  }
  memory?.set(key, idx);
  return fill(lines[idx] ?? lines[0] ?? calmText, f.vars);
}

export type DrillSergeant = {
  /** drillSergeantLine with this sergeant's memory (no back-to-back repeats per template). */
  line(calmText: string, kind: DrillKind, level: Rudeness, pick: (n: number) => number): string;
  /** Forget the previous variants. */
  reset(): void;
};

export function createDrillSergeant(): DrillSergeant {
  const memory: DrillMemory = new Map();
  return {
    line: (calmText, kind, level, pick) => drillSergeantLine(calmText, kind, level, pick, memory),
    reset: () => memory.clear(),
  };
}
