import { describe, expect, it } from 'vitest';
import {
  DATE_WORDS,
  chatSearchItems,
  mealSearchItems,
  parseDateQuery,
  rankPersonal,
  searchDateLabel,
  splitDateQuery,
  workoutSearchItems,
  type PersonalSession,
  type PersonalSet,
} from './searchPersonal';
import type { SearchEntry } from './search';
import type { ChatMessage, FoodEntry } from './types';

// ---- made-up data (never the real user's) ----

/** A Wednesday. */
const TODAY = '2026-11-18';
const at = (date: string, h = 9, min = 0): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, h, min).getTime();
};
const range = (from: string, to = from) => ({ from, to });

describe('parseDateQuery (today = Wed 18 Nov 2026)', () => {
  const p = (q: string, today = TODAY) => parseDateQuery(q, today);

  it('today / yesterday', () => {
    expect(p('today')).toEqual(range('2026-11-18'));
    expect(p('Yesterday')).toEqual(range('2026-11-17'));
  });

  it('weekday names mean the last one (today counts); "last" means before today', () => {
    expect(p('monday')).toEqual(range('2026-11-16'));
    expect(p('Mon')).toEqual(range('2026-11-16'));
    expect(p('tues')).toEqual(range('2026-11-17'));
    expect(p('thursday')).toEqual(range('2026-11-12'));
    expect(p('sunday')).toEqual(range('2026-11-15'));
    expect(p('wednesday')).toEqual(range('2026-11-18'));
    expect(p('last wednesday')).toEqual(range('2026-11-11'));
    expect(p('last monday')).toEqual(range('2026-11-16'));
  });

  it('this / last week run Monday to Sunday', () => {
    expect(p('this week')).toEqual(range('2026-11-16', '2026-11-22'));
    expect(p('last week')).toEqual(range('2026-11-09', '2026-11-15'));
  });

  it('this / last month', () => {
    expect(p('this month')).toEqual(range('2026-11-01', '2026-11-30'));
    expect(p('last month')).toEqual(range('2026-10-01', '2026-10-31'));
  });

  it('day + month in either order, with or without a year', () => {
    for (const q of ['12 nov', 'nov 12', '12 November', 'November 12th', '12th nov', '12/11']) {
      expect(p(q), q).toEqual(range('2026-11-12'));
    }
    expect(p('12 nov 2025')).toEqual(range('2025-11-12'));
    expect(p('nov 12, 2025')).toEqual(range('2025-11-12'));
    expect(p('12/11/2025')).toEqual(range('2025-11-12'));
    expect(p('12/11/25')).toEqual(range('2025-11-12'));
    expect(p('2025-11-12')).toEqual(range('2025-11-12'));
  });

  it('a day later than today without a year means last year', () => {
    expect(p('30 dec')).toEqual(range('2025-12-30'));
    expect(p('25/12')).toEqual(range('2025-12-25'));
    expect(p('19 nov')).toEqual(range('2025-11-19'));
    expect(p('18 nov')).toEqual(range('2026-11-18'));
  });

  it('day/month first; month/day only when day/month cannot be a date', () => {
    expect(p('3/4')).toEqual(range('2026-04-03'));
    expect(p('11/25')).toEqual(range('2025-11-25'));
    expect(p('13/25')).toBeNull();
  });

  it('impossible dates are not dates; 29 Feb goes back to a leap year', () => {
    expect(p('31 nov')).toBeNull();
    expect(p('29 feb')).toEqual(range('2024-02-29'));
    expect(p('29 feb 2024')).toEqual(range('2024-02-29'));
    expect(p('29 feb 2025')).toBeNull();
  });

  it('a full month name (or month + year) is the whole month', () => {
    expect(p('november')).toEqual(range('2026-11-01', '2026-11-30'));
    expect(p('december')).toEqual(range('2025-12-01', '2025-12-31'));
    expect(p('february')).toEqual(range('2026-02-01', '2026-02-28'));
    expect(p('nov 2025')).toEqual(range('2025-11-01', '2025-11-30'));
    expect(p('feb 2024')).toEqual(range('2024-02-01', '2024-02-29'));
  });

  it('month and year edges', () => {
    // Thursday 1 Jan 2026
    expect(p('yesterday', '2026-01-01')).toEqual(range('2025-12-31'));
    expect(p('this week', '2026-01-01')).toEqual(range('2025-12-29', '2026-01-04'));
    expect(p('last week', '2026-01-01')).toEqual(range('2025-12-22', '2025-12-28'));
    expect(p('last month', '2026-01-01')).toEqual(range('2025-12-01', '2025-12-31'));
    expect(p('31 dec', '2026-01-01')).toEqual(range('2025-12-31'));
    expect(p('1 jan', '2026-01-01')).toEqual(range('2026-01-01'));
    // Sunday 1 Mar 2026
    expect(p('last month', '2026-03-01')).toEqual(range('2026-02-01', '2026-02-28'));
    expect(p('monday', '2026-03-01')).toEqual(range('2026-02-23'));
    expect(p('this week', '2026-03-01')).toEqual(range('2026-02-23', '2026-03-01'));
    expect(p('yesterday', '2024-03-01')).toEqual(range('2024-02-29'));
  });

  it('Thai day names and phrases come from the data table', () => {
    expect(p('วันจันทร์')).toEqual(range('2026-11-16'));
    expect(p('จันทร์')).toEqual(range('2026-11-16'));
    expect(p('วันพฤหัสบดี')).toEqual(range('2026-11-12'));
    expect(p('วันอาทิตย์')).toEqual(range('2026-11-15'));
    expect(p('วันพุธ')).toEqual(range('2026-11-18'));
    expect(p('วันพุธที่แล้ว')).toEqual(range('2026-11-11'));
    expect(p('วันนี้')).toEqual(range('2026-11-18'));
    expect(p('เมื่อวาน')).toEqual(range('2026-11-17'));
    expect(p('สัปดาห์ที่แล้ว')).toEqual(range('2026-11-09', '2026-11-15'));
    expect(p('อาทิตย์นี้')).toEqual(range('2026-11-16', '2026-11-22'));
    expect(DATE_WORDS['วันจันทร์']).toEqual({ weekday: 1 });
  });

  it('Thai months, Buddhist-era years too', () => {
    expect(p('12 พ.ย.')).toEqual(range('2026-11-12'));
    expect(p('12 พฤศจิกายน 2568')).toEqual(range('2025-11-12'));
    expect(p('พฤศจิกายน')).toEqual(range('2026-11-01', '2026-11-30'));
  });

  it('plain words, numbers and weights are not dates', () => {
    for (const q of ['', '  ', 'bench', '12', '2.5', '8-12', 'decline', 'dec', 'monster', 'ข้าว']) {
      expect(p(q), q).toBeNull();
    }
  });
});

describe('splitDateQuery', () => {
  it('takes the date phrase out and keeps the other words', () => {
    expect(splitDateQuery('bench yesterday', TODAY)).toEqual({
      range: range('2026-11-17'),
      words: 'bench',
    });
    expect(splitDateQuery('rice on Monday', TODAY)).toEqual({
      range: range('2026-11-16'),
      words: 'rice',
    });
    expect(splitDateQuery('ข้าวเมื่อวาน', TODAY)).toEqual({
      range: range('2026-11-17'),
      words: 'ข้าว',
    });
    expect(splitDateQuery('  Bench  Press ', TODAY)).toEqual({ range: null, words: 'bench press' });
  });
});

describe('searchDateLabel', () => {
  it('short weekday, day, month; the year only when it is not this year', () => {
    expect(searchDateLabel('2026-11-17')).toBe('Tue 17 Nov');
    expect(searchDateLabel('2026-11-17', TODAY)).toBe('Tue 17 Nov');
    expect(searchDateLabel('2025-12-30', TODAY)).toBe('Tue 30 Dec 2025');
  });
});

// ---- item builders ----

const sessions: PersonalSession[] = [
  {
    sessionId: 's-pull',
    dayId: 'pull-a',
    startedAt: at('2026-11-16', 18),
    endedAt: at('2026-11-16', 19),
  },
  {
    sessionId: 's-push',
    dayId: 'push-a',
    startedAt: at('2026-11-17', 18),
    endedAt: at('2026-11-17', 19),
  },
  { sessionId: 's-open', dayId: 'legs-a', startedAt: at('2026-11-18', 7) },
  {
    sessionId: 's-empty',
    dayId: 'legs-a',
    startedAt: at('2026-11-15', 7),
    endedAt: at('2026-11-15', 7, 5),
  },
  {
    sessionId: 's-old',
    dayId: 'legs-a',
    startedAt: at('2025-12-30', 7),
    endedAt: at('2025-12-30', 8),
  },
];
const set = (sessionId: string, exerciseId: string, startedAt: number): PersonalSet => ({
  sessionId,
  exerciseId,
  startedAt,
});
const sets: PersonalSet[] = [
  set('s-push', 'bench', at('2026-11-17', 18, 5)),
  set('s-push', 'bench', at('2026-11-17', 18, 9)),
  set('s-push', 'pushdown', at('2026-11-17', 18, 30)),
  set('s-pull', 'row', at('2026-11-16', 18, 5)),
  set('s-open', 'squat', at('2026-11-18', 7, 5)),
  set('s-old', 'squat', at('2025-12-30', 7, 5)),
];
const DAY_NAMES: Record<string, string> = {
  'push-a': 'Push A',
  'pull-a': 'Pull A',
  'legs-a': 'Legs A',
};
const EX_NAMES: Record<string, string> = {
  bench: 'Barbell Bench Press',
  pushdown: 'Triceps Pushdown',
  row: 'Bent Over Barbell Row',
  squat: 'Barbell Squat',
};
const wctx = {
  dayName: (id: string) => DAY_NAMES[id],
  exerciseName: (id: string) => EX_NAMES[id] ?? id,
  today: TODAY,
};

describe('workoutSearchItems', () => {
  const items = workoutSearchItems(sessions, sets, wctx);

  it('one item per finished session with sets, newest first', () => {
    expect(items.map((i) => i.id)).toEqual(['s-push', 's-pull', 's-old']);
  });

  it('title is day name + date; keywords are the day name and exercise names', () => {
    expect(items[0]).toEqual({
      kind: 'workout',
      id: 's-push',
      title: 'Push A · Tue 17 Nov',
      subtitle: 'Barbell Bench Press, Triceps Pushdown',
      keywords: ['Push A', 'Barbell Bench Press', 'Triceps Pushdown'],
      date: '2026-11-17',
    });
    expect(items[2]?.title).toBe('Legs A · Tue 30 Dec 2025');
  });

  it('an unknown day reads "Workout"; a long list is shortened in the subtitle', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((x, i) => set('s-x', x, at('2026-11-10', 9, i)));
    const [it0] = workoutSearchItems(
      [
        {
          sessionId: 's-x',
          dayId: 'extra',
          startedAt: at('2026-11-10', 9),
          endedAt: at('2026-11-10', 10),
        },
      ],
      many,
      { dayName: () => undefined, exerciseName: (id) => id.toUpperCase() },
    );
    expect(it0?.title).toBe('Workout · Tue 10 Nov');
    expect(it0?.subtitle).toBe('A, B, C +2 more');
  });
});

const msg = (id: number, createdAt: number, role: 'user' | 'coach', text: string): ChatMessage => ({
  id,
  createdAt,
  role,
  text,
  source: 'rules',
  phase: 'today',
});

describe('chatSearchItems', () => {
  it('one item per message, newest first; who + date as the subtitle', () => {
    const items = chatSearchItems(
      [
        msg(1, at('2026-11-16', 8), 'user', 'How heavy should my bench be?'),
        msg(2, at('2026-11-16', 8, 1), 'coach', 'Start at the weight you did last time.'),
        msg(3, at('2026-11-17', 8), 'user', '   '),
        {
          createdAt: at('2026-11-17', 8),
          role: 'user',
          text: 'no id',
          source: 'rules',
          phase: 'today',
        },
      ],
      { today: TODAY },
    );
    expect(items).toEqual([
      {
        kind: 'chat',
        id: '2',
        title: 'Start at the weight you did last time.',
        subtitle: 'Coach · Mon 16 Nov',
        keywords: ['Start at the weight you did last time.'],
        date: '2026-11-16',
      },
      {
        kind: 'chat',
        id: '1',
        title: 'How heavy should my bench be?',
        subtitle: 'You · Mon 16 Nov',
        keywords: ['How heavy should my bench be?'],
        date: '2026-11-16',
      },
    ]);
  });

  it('a long message is cut near 80 characters at a word', () => {
    const long = `${'word '.repeat(30)}end`;
    const [item] = chatSearchItems([msg(1, at('2026-11-16'), 'coach', long)]);
    expect(item?.title.length).toBeLessThanOrEqual(81);
    expect(item?.title.endsWith('word…')).toBe(true);
    expect(item?.keywords).toEqual([long]);
  });
});

const entry = (id: string, date: string, h: number, label: string, foodId?: string): FoodEntry => ({
  id,
  date,
  time: at(date, h),
  slot: 'lunch',
  label,
  amount: { servings: 1 },
  estimate: false,
  kcal: 300,
  proteinG: 20,
  ...(foodId !== undefined ? { ref: { foodId } } : {}),
});

describe('mealSearchItems', () => {
  const entries = [
    entry('e1', '2026-11-16', 8, 'Rice'),
    entry('e2', '2026-11-16', 12, 'Chicken breast', 'f-chicken'),
    entry('e3', '2026-11-17', 8, 'Oats'),
    entry('e4', '2026-11-16', 19, 'Rice'),
    entry('e5', '2026-11-16', 20, 'Egg'),
    entry('e6', '2026-11-16', 21, 'Milk'),
  ];

  it('one item per day, newest first, food names (and extra names) as keywords', () => {
    const items = mealSearchItems(entries, {
      foodNames: (e) => (e.ref?.foodId === 'f-chicken' ? ['อกไก่'] : []),
      today: TODAY,
    });
    expect(items).toEqual([
      {
        kind: 'meal',
        id: '2026-11-17',
        title: 'Meals · Tue 17 Nov',
        subtitle: 'Oats',
        keywords: ['Oats'],
        date: '2026-11-17',
      },
      {
        kind: 'meal',
        id: '2026-11-16',
        title: 'Meals · Mon 16 Nov',
        subtitle: 'Rice, Chicken breast, Egg +1 more',
        keywords: ['Rice', 'Chicken breast', 'อกไก่', 'Egg', 'Milk'],
        date: '2026-11-16',
      },
    ]);
  });
});

// ---- ranking ----

describe('rankPersonal', () => {
  const items: SearchEntry[] = [
    ...workoutSearchItems(sessions, sets, wctx),
    ...mealSearchItems(
      [
        entry('e1', '2026-11-17', 8, 'Rice'),
        entry('e2', '2026-11-16', 12, 'ข้าวผัด'),
        entry('e3', '2026-11-10', 12, 'Fried rice'),
      ],
      { today: TODAY },
    ),
    ...chatSearchItems(
      [
        msg(1, at('2026-11-10'), 'user', 'Bench day tomorrow'),
        msg(2, at('2026-11-17', 20), 'coach', 'Your bench went up 2.5 kg.'),
        msg(3, at('2026-11-17', 21), 'user', 'Thanks!'),
      ],
      { today: TODAY },
    ),
  ];
  const rank = (q: string, o: Parameters<typeof rankPersonal>[2] = { today: TODAY }) =>
    rankPersonal(items, q, o);
  const ids = (r: ReturnType<typeof rankPersonal>) =>
    Object.fromEntries(r.sections.map((s) => [s.kind, s.hits.map((h) => h.id)]));

  it('sections come Workouts, Meals, Coach; words match exercise names and chat text', () => {
    const r = rank('bench');
    expect(r.sections.map((s) => s.kind)).toEqual(['workout', 'meal', 'chat']);
    expect(ids(r)).toEqual({ workout: ['s-push'], meal: [], chat: ['2', '1'] });
  });

  it('newest first even when an older item matches its title better', () => {
    const chat = rank('bench').sections.find((s) => s.kind === 'chat');
    expect(chat?.hits.map((h) => h.date)).toEqual(['2026-11-17', '2026-11-10']);
    expect(chat?.hits[1]?.score).toBeGreaterThan(chat?.hits[0]?.score ?? 0);
  });

  it('workouts by day name', () => {
    expect(ids(rank('pull a')).workout).toEqual(['s-pull']);
    expect(ids(rank('legs')).workout).toEqual(['s-old']);
  });

  it('a date alone lists everything on that date', () => {
    const r = rank('yesterday');
    expect(r.range).toEqual(range('2026-11-17'));
    expect(ids(r)).toEqual({ workout: ['s-push'], meal: ['2026-11-17'], chat: ['3', '2'] });
  });

  it('a date + words filters by the date, then the words', () => {
    expect(ids(rank('rice last week')).meal).toEqual(['2026-11-10']);
    expect(ids(rank('rice')).meal).toEqual(['2026-11-17', '2026-11-10']);
    expect(ids(rank('bench yesterday'))).toEqual({ workout: ['s-push'], meal: [], chat: ['2'] });
  });

  it('meals by Thai food name inside a longer Thai word', () => {
    expect(ids(rank('ข้าว')).meal).toEqual(['2026-11-16']);
  });

  it('blank or one letter (without a date) finds nothing', () => {
    for (const q of ['', '   ', 'b']) {
      const r = rank(q);
      expect(
        r.sections.every((s) => s.hits.length === 0 && !s.more && s.total === 0),
        q,
      ).toBe(true);
    }
  });

  it('kinds limits the sections', () => {
    const r = rank('bench', { today: TODAY, kinds: ['chat'] });
    expect(r.sections.map((s) => s.kind)).toEqual(['chat']);
  });

  it('caps each section with a "more" flag; offset pages (a number or per kind)', () => {
    const many = chatSearchItems(
      Array.from({ length: 25 }, (_, i) =>
        msg(i + 1, at('2026-11-01', 8, i), 'user', `squat note ${i + 1}`),
      ),
    );
    const page1 = rankPersonal(many, 'squat', { today: TODAY, perKind: 10 });
    const chat1 = page1.sections.find((s) => s.kind === 'chat');
    expect(chat1).toMatchObject({ total: 25, offset: 0, more: true });
    expect(chat1?.hits.map((h) => h.id)).toEqual([
      '25',
      '24',
      '23',
      '22',
      '21',
      '20',
      '19',
      '18',
      '17',
      '16',
    ]);

    const page3 = rankPersonal(many, 'squat', { today: TODAY, perKind: 10, offset: 20 });
    const chat3 = page3.sections.find((s) => s.kind === 'chat');
    expect(chat3).toMatchObject({ total: 25, offset: 20, more: false });
    expect(chat3?.hits.map((h) => h.id)).toEqual(['5', '4', '3', '2', '1']);

    const per = rankPersonal(many, 'squat', { today: TODAY, perKind: 10, offset: { chat: 10 } });
    expect(per.sections.find((s) => s.kind === 'chat')?.hits[0]?.id).toBe('15');
    expect(per.sections.find((s) => s.kind === 'workout')).toMatchObject({ offset: 0, total: 0 });
  });

  it('is deterministic', () => {
    expect(rank('bench')).toEqual(rank('bench'));
  });
});
