// M13c task 12: the Library screen (render + callbacks), with made-up rows and the real catalog.
import { describe, expect, it, vi } from 'vitest';
import { equipmentGroupLabel, groupExercises, type LibraryGroup } from '../../core/library';
import { buildSearchIndex, exerciseSearchItems, search } from '../../core/search';
import { checkCopy } from '../../core/trainer/replies';
import type { PersonalResults, PersonalSection } from '../../core/searchPersonal';
import type { LibraryGroupBy, SearchHit } from '../../core/types';
import {
  bodyAreaLabel,
  bodyAreaOf,
  catalogExercises,
  defaultGymProfile,
  gymCanDo,
  missingKitLabels,
  program,
} from '../../data/catalog';
import { muscleLabel } from '../../core/dayInfo';
import { FakeEl, asFake, useFakeDom } from './testDom';
import {
  GROUP_BY_OPTIONS,
  LIBRARY_TITLE,
  MY_GYM_LABEL,
  NO_GYM_FIT,
  SEARCHING_HISTORY,
  SEARCH_HINT,
  SEARCH_PLACEHOLDER,
  SEARCH_SECTIONS,
  SHOW_MORE,
  SHOW_MORE_LABEL,
  createLibraryScreen,
  exerciseCount,
  hitSections,
  hitsWithFood,
  needsLine,
  noMatchLine,
  uniqueIds,
  withPersonal,
  type LibraryActions,
  type LibraryProps,
  type LibraryRow,
} from './library';

useFakeDom();

const hook = (el: FakeEl, attr: string, value?: string) =>
  el.find((e) => e.hasAttribute(attr) && (value === undefined || e.getAttribute(attr) === value));
const one = (el: FakeEl, attr: string, value?: string): FakeEl => {
  const hit = hook(el, attr, value)[0];
  if (!hit) throw new Error(`no [${attr}${value ? `=${value}` : ''}]`);
  return hit;
};

// Made-up rows (real ids so the badges resolve; names and kit made up).
const ROWS: LibraryRow[] = [
  {
    id: 'Crunches',
    name: 'Crunches',
    tracking: 'manual',
    muscle: 'Abdominals',
    equipment: 'Body only',
  },
  {
    id: 'Hanging_Leg_Raise',
    name: 'Hanging Leg Raise',
    tracking: 'manual',
    muscle: 'Abdominals',
    equipment: 'Other',
    needs: ['Pull-up bar'],
  },
  {
    id: 'Dumbbell_Bicep_Curl',
    name: 'Dumbbell Bicep Curl',
    tracking: 'pose',
    ruleStatus: 'learning',
    muscle: 'Biceps',
    equipment: 'Dumbbell',
  },
];
const GROUPS: LibraryGroup[] = [
  { key: 'muscle:biceps', label: 'Biceps', area: 'arms', ids: ['Dumbbell_Bicep_Curl'] },
  {
    key: 'muscle:abdominals',
    label: 'Abdominals',
    area: 'core',
    ids: ['Crunches', 'Hanging_Leg_Raise'],
  },
];

function setup(over: Partial<LibraryProps> = {}) {
  const calls: string[] = [];
  const actions: LibraryActions = {
    onQuery: (q) => calls.push(`query:${q}`),
    onGroupBy: (by) => calls.push(`groupBy:${by}`),
    onMyGym: (on) => calls.push(`myGym:${on}`),
    onOpenExercise: (id) => calls.push(`open:${id}`),
    onBadge: (kind, id, opener) => calls.push(`badge:${kind}:${id}:${asFake(opener).tag}`),
    onHit: (hit, opener) => calls.push(`hit:${hit.kind}:${hit.id}:${asFake(opener).tag}`),
    onMore: (kind) => calls.push(`more:${kind}`),
    onBack: () => calls.push('back'),
  };
  const props: LibraryProps = {
    rows: ROWS,
    groups: GROUPS,
    groupBy: 'muscle',
    query: '',
    hits: [],
    myGymOnly: false,
    areaLabel: (a) => (a === 'core' ? 'Core' : 'Arms'),
    ...over,
  };
  const handle = createLibraryScreen(props, actions);
  return { handle, el: asFake(handle.el), calls };
}

const hit = (kind: SearchHit['kind'], id: string, title: string, subtitle?: string): SearchHit => ({
  kind,
  id,
  title,
  keywords: [],
  score: 1,
  ...(subtitle ? { subtitle } : {}),
});

describe('pure helpers', () => {
  it('needs line, counts and the no-match line', () => {
    expect(needsLine(['Pull-up bar'])).toBe('Needs: Pull-up bar');
    expect(needsLine(['Cable pulley', 'Rope attachment'])).toBe(
      'Needs: Cable pulley, Rope attachment',
    );
    expect(needsLine([])).toBeNull();
    expect(needsLine(undefined)).toBeNull();
    expect(exerciseCount(1)).toBe('1 exercise');
    expect(exerciseCount(70)).toBe('70 exercises');
    expect(noMatchLine('  xyz   abc ')).toBe("No match for 'xyz abc'");
  });

  it('unique ids across groups (a plan exercise under two days counts once)', () => {
    expect(
      uniqueIds([
        { key: 'day:a', label: 'Push A', ids: ['x', 'y'] },
        { key: 'day:b', label: 'Push B', ids: ['x', 'z'] },
      ]),
    ).toEqual(['x', 'y', 'z']);
  });

  it('hit sections follow the SPEC order, keep the ranked order and drop empty ones', () => {
    const hits = [
      hit('learn', 'effort', 'Effort'),
      hit('exercise', 'b', 'B'),
      hit('setting', 'voice', 'Voice'),
      hit('exercise', 'a', 'A'),
      hit('food', 'food', "Search foods for 'x'"),
    ];
    const s = hitSections(hits);
    expect(s.map((x) => x.kind)).toEqual(['exercise', 'setting', 'learn', 'food']);
    expect(s[0]?.hits.map((x) => x.id)).toEqual(['b', 'a']);
    expect(SEARCH_SECTIONS.map((x) => x.title)).toEqual([
      'Exercises',
      'Workouts',
      'Meals',
      'Coach',
      'Settings',
      'Why? cards',
      'Foods',
    ]);
  });

  it('adds the food row once, only for a typed query', () => {
    expect(hitsWithFood('  ', [hit('exercise', 'a', 'A')])).toEqual([]);
    const withFood = hitsWithFood('rice', [hit('exercise', 'a', 'A')]);
    expect(withFood.map((x) => `${x.kind}:${x.id}`)).toEqual(['exercise:a', 'food:food']);
    expect(withFood[1]?.title).toBe("Search foods for 'rice'");
    expect(hitsWithFood('rice', [hit('food', 'food', 'F')])).toHaveLength(1);
  });

  it('every string passes checkCopy and says "you", never he/she', () => {
    const strings = [
      LIBRARY_TITLE,
      SEARCH_PLACEHOLDER,
      SEARCH_HINT,
      MY_GYM_LABEL,
      NO_GYM_FIT,
      'Show all exercises',
      'Group by',
      'Clear search',
      'Search the app',
      noMatchLine('abs'),
      SEARCHING_HISTORY,
      SHOW_MORE,
      ...Object.values(SHOW_MORE_LABEL),
      needsLine(['Pull-up bar']) ?? '',
      ...GROUP_BY_OPTIONS.map((o) => o.label),
      ...SEARCH_SECTIONS.map((o) => o.title),
    ];
    for (const s of strings) {
      expect(checkCopy(s).ok, s).toBe(true);
      expect(s, s).not.toMatch(/\b(he|she|his|her|him)\b/i);
    }
  });
});

describe('Library screen: groups', () => {
  it('renders the title, count, search field, group-by and the switch', () => {
    const { el } = setup();
    expect(el.getAttribute('data-screen')).toBe('library');
    expect(el.classes).toContain('mood-pro');
    expect(el.byTag('h1')[0]?.textContent).toBe('Library');
    expect(one(el, 'data-library-count').textContent).toBe('3 exercises');
    const input = one(el, 'data-library-search');
    expect(input.getAttribute('type')).toBe('search');
    expect(input.getAttribute('placeholder')).toBe(SEARCH_PLACEHOLDER);
    expect(input.hasAttribute('autofocus')).toBe(false);
    expect(one(el, 'data-library-clear').hasAttribute('hidden')).toBe(true);
    const seg = hook(el, 'data-group-by');
    expect(seg.map((b) => b.getAttribute('data-group-by'))).toEqual([
      'muscle',
      'equipment',
      'day',
      'movement',
      'az',
    ]);
    expect(seg.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    const sw = one(el, 'data-library-mygym');
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toContain('My gym only');
    expect(sw.textContent).toContain('Off');
  });

  it('groups render with area headers, counts, rows, badges and the needs line', () => {
    const { el } = setup();
    expect(hook(el, 'data-library-area').map((a) => a.textContent)).toEqual(['Arms', 'Core']);
    const heads = hook(el, 'data-library-group');
    expect(heads.map((x) => x.getAttribute('data-library-group'))).toEqual([
      'muscle:biceps',
      'muscle:abdominals',
    ]);
    expect(heads[1]?.textContent).toContain('Abdominals');
    expect(heads[1]?.textContent).toContain('2, 2 exercises');
    expect(heads[1]?.getAttribute('aria-expanded')).toBe('true');
    const rows = hook(el, 'data-library-ex');
    expect(rows.map((r) => r.getAttribute('data-library-ex'))).toEqual([
      'Dumbbell_Bicep_Curl',
      'Crunches',
      'Hanging_Leg_Raise',
    ]);
    const curl = one(el, 'data-library-ex', 'Dumbbell_Bicep_Curl');
    expect(curl.textContent).toContain('Biceps · Dumbbell');
    expect(hook(curl, 'data-badge-open').map((b) => b.getAttribute('data-badge-open'))).toEqual([
      '3d',
      'camera',
      'learning',
    ]);
    expect(hook(curl, 'data-library-needs')).toHaveLength(0);
    const hanging = one(el, 'data-library-ex', 'Hanging_Leg_Raise');
    expect(one(hanging, 'data-library-needs').textContent).toBe('Needs: Pull-up bar');
    expect(hanging.hasAttribute('data-needs')).toBe(true);
  });

  it('a group header folds and unfolds its list, and the fold survives an update', () => {
    const { el, handle } = setup();
    const head = one(el, 'data-library-group', 'muscle:abdominals');
    const list = one(el, 'data-library-list', 'muscle:abdominals');
    expect(head.getAttribute('aria-controls')).toBe(list.getAttribute('id'));
    head.click();
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(list.hasAttribute('hidden')).toBe(true);
    handle.update({ myGymOnly: true });
    const head2 = one(el, 'data-library-group', 'muscle:abdominals');
    expect(head2.getAttribute('aria-expanded')).toBe('false');
    expect(one(el, 'data-library-list', 'muscle:abdominals').hasAttribute('hidden')).toBe(true);
    head2.click();
    expect(head2.getAttribute('aria-expanded')).toBe('true');
    expect(one(el, 'data-library-list', 'muscle:abdominals').hasAttribute('hidden')).toBe(false);
  });

  it('row tap opens the detail; a badge calls onBadge with its button; nothing else fires', () => {
    const { el, calls } = setup();
    one(el, 'data-ex-open', 'Crunches').click();
    const curl = one(el, 'data-library-ex', 'Dumbbell_Bicep_Curl');
    one(curl, 'data-badge-open', 'camera').click();
    one(curl, 'data-badge-open', 'learning').click();
    expect(calls).toEqual([
      'open:Crunches',
      'badge:camera:Dumbbell_Bicep_Curl:button',
      'badge:learning:Dumbbell_Bicep_Curl:button',
    ]);
    expect(one(curl, 'data-badge-open', '3d').getAttribute('aria-label')).toBe(
      '3D demo for Dumbbell Bicep Curl',
    );
  });

  it('group-by, the switch and Back call back; the active choice does nothing', () => {
    const { el, calls } = setup();
    one(el, 'data-group-by', 'muscle').click();
    one(el, 'data-group-by', 'equipment').click();
    one(el, 'data-library-mygym').click();
    one(el, 'data-library-back').click();
    expect(calls).toEqual(['groupBy:equipment', 'myGym:true', 'back']);
  });

  it('update re-renders the controls (group-by, switch) without replacing the field', () => {
    const { el, handle } = setup();
    const input = one(el, 'data-library-search');
    handle.update({
      groupBy: 'az',
      myGymOnly: true,
      groups: [{ key: 'az', label: 'A–Z', ids: ['Crunches', 'Dumbbell_Bicep_Curl'] }],
    });
    expect(one(el, 'data-library-search')).toBe(input);
    expect(one(el, 'data-group-by', 'az').getAttribute('aria-pressed')).toBe('true');
    expect(one(el, 'data-group-by', 'muscle').getAttribute('aria-pressed')).toBe('false');
    expect(one(el, 'data-library-mygym').getAttribute('aria-checked')).toBe('true');
    expect(one(el, 'data-library-mygym').classes).toContain('on');
    expect(hook(el, 'data-library-area')).toHaveLength(0);
    expect(one(el, 'data-library-count').textContent).toBe('2 exercises');
  });

  it('no group (My gym only filtered everything): empty state that turns the switch off', () => {
    const { el, calls } = setup({ groups: [], myGymOnly: true });
    const empty = one(el, 'data-empty-state', 'library-gym');
    expect(empty.textContent).toContain(NO_GYM_FIT);
    empty.byTag('button')[0]?.click();
    expect(calls).toEqual(['myGym:false']);
  });

  it('autofocus prop and focusSearch', () => {
    const { el, handle } = setup({ autofocus: true });
    const input = one(el, 'data-library-search');
    expect(input.hasAttribute('autofocus')).toBe(true);
    handle.focusSearch();
    expect(
      (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement,
    ).toBe(input);
  });
});

describe('Library screen: search', () => {
  it('typing calls onQuery; Clear empties the field, calls back and refocuses', () => {
    const { el, calls, handle } = setup();
    const input = one(el, 'data-library-search') as FakeEl & { value: string };
    input.value = 'ab';
    input.dispatch('input', {});
    handle.update({ query: 'ab' });
    expect(one(el, 'data-library-clear').hasAttribute('hidden')).toBe(false);
    one(el, 'data-library-clear').click();
    expect(input.value).toBe('');
    expect(calls).toEqual(['query:ab', 'query:']);
    expect(
      (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement,
    ).toBe(input);
  });

  it('a typed query shows sections: exercise rows (with badges), settings, Why? cards, food', () => {
    const { el, calls, handle } = setup();
    handle.update({
      query: 'abs',
      hits: [
        hit('exercise', 'Crunches', 'Crunches', 'Abdominals · Body only'),
        hit('setting', 'voice', 'Voice', 'Settings'),
        hit('learn', 'cameraLearning', 'Camera still learning'),
      ],
    });
    expect(hook(el, 'data-library-group')).toHaveLength(0);
    // Group-by and the switch shape the groups only: hidden while searching.
    expect(hook(el, 'data-group-by')).toHaveLength(0);
    expect(hook(el, 'data-library-mygym')).toHaveLength(0);
    expect(
      hook(el, 'data-search-section').map((s) => s.getAttribute('data-search-section')),
    ).toEqual(['exercise', 'setting', 'learn', 'food']);
    const exRow = one(el, 'data-search-hit', 'exercise:Crunches');
    expect(exRow.getAttribute('data-library-ex')).toBe('Crunches');
    expect(hook(exRow, 'data-badge-open')).toHaveLength(1);
    expect(one(el, 'data-search-hit', 'food:food').textContent).toContain("Search foods for 'abs'");
    expect(one(el, 'data-search-hit', 'setting:voice').textContent).toContain('Settings');
    one(exRow, 'data-ex-open').click();
    one(el, 'data-search-hit', 'setting:voice').click();
    one(el, 'data-search-hit', 'learn:cameraLearning').click();
    one(el, 'data-search-hit', 'food:food').click();
    expect(calls).toEqual([
      'open:Crunches',
      'hit:setting:voice:button',
      'hit:learn:cameraLearning:button',
      'hit:food:food:button',
    ]);
    // Back to blank: the groups return.
    handle.update({ query: '', hits: [] });
    expect(hook(el, 'data-search-section')).toHaveLength(0);
    expect(hook(el, 'data-library-group')).toHaveLength(2);
    expect(hook(el, 'data-group-by')).toHaveLength(5);
    expect(hook(el, 'data-library-mygym')).toHaveLength(1);
  });

  it('an exercise hit without a row still opens the detail', () => {
    const { el, calls } = setup({ query: 'x', hits: [hit('exercise', 'Unknown', 'Unknown')] });
    one(el, 'data-search-hit', 'exercise:Unknown').click();
    expect(calls).toEqual(['open:Unknown']);
  });

  it('later personal sections render in their place with no screen change', () => {
    const { el } = setup({
      query: 'bench',
      hits: [
        hit('chat', 'm1', 'How heavy for bench?', 'Tue 12 Nov'),
        hit('workout', 's1', 'Push A · Tue 12 Nov'),
        hit('exercise', 'Crunches', 'Crunches'),
        hit('meal', 'd1', 'Meals · Mon 11 Nov'),
      ],
    });
    expect(
      hook(el, 'data-search-section').map((s) => s.getAttribute('data-search-section')),
    ).toEqual(['exercise', 'workout', 'meal', 'chat', 'food']);
    expect(one(el, 'data-search-hit', 'chat:m1').textContent).toContain('Tue 12 Nov');
  });

  it('no match: the empty state with the food row as its action, and a hint', () => {
    const { el, calls } = setup({ query: 'zzz', hits: [] });
    const empty = one(el, 'data-empty-state', 'library-search');
    expect(empty.textContent).toContain("No match for 'zzz'");
    const food = one(empty, 'data-search-hit', 'food:food');
    expect(food.textContent).toContain("Search foods for 'zzz'");
    expect(el.textContent).toContain(SEARCH_HINT);
    food.click();
    expect(calls).toEqual(['hit:food:food:button']);
  });
});

describe('Library screen: the real catalog', () => {
  const catalog = catalogExercises();
  const gym = defaultGymProfile();
  const rows: LibraryRow[] = catalog.map((e) => ({
    id: e.id,
    name: e.name,
    tracking: 'manual',
    muscle: muscleLabel(e.primaryMuscles[0] ?? ''),
    equipment: equipmentGroupLabel(e.equipment),
    needs: missingKitLabels(e.id, gym),
  }));
  const ctx = {
    planDays: program.days,
    areaOf: bodyAreaOf,
    muscleLabel,
    canDo: (id: string) => gymCanDo(id, gym),
  };

  it.each(GROUP_BY_OPTIONS.map((o) => o.by))('group by %s lists every exercise', (by) => {
    const groups = groupExercises(catalog, by as LibraryGroupBy, ctx);
    const { el } = setup({ rows, groups, groupBy: by as LibraryGroupBy, areaLabel: bodyAreaLabel });
    const shown = new Set(
      hook(el, 'data-library-ex').map((r) => r.getAttribute('data-library-ex')),
    );
    expect(shown.size).toBe(catalog.length);
    expect(one(el, 'data-library-count').textContent).toBe(exerciseCount(catalog.length));
    if (by === 'day') {
      expect(hook(el, 'data-library-group').at(-1)?.textContent).toContain('Not in your plan');
    }
    if (by === 'muscle') {
      expect(hook(el, 'data-library-area').map((a) => a.textContent)).toContain('Core');
    }
  });

  it('My gym only drops the exercises the default gym lacks kit for (no needs line left)', () => {
    const groups = groupExercises(catalog, 'muscle', { ...ctx, myGymOnly: true });
    const { el } = setup({ rows, groups, myGymOnly: true, areaLabel: bodyAreaLabel });
    expect(hook(el, 'data-library-ex').length).toBeLessThan(catalog.length);
    expect(hook(el, 'data-library-needs')).toHaveLength(0);
  });

  it('"abs" puts abdominals-primary exercises first under Exercises', () => {
    const index = buildSearchIndex(
      exerciseSearchItems(catalog, {
        planDays: program.days,
        areaOf: bodyAreaOf,
        areaLabel: bodyAreaLabel,
        muscleLabel,
      }),
    );
    const hits = search(index, 'abs', { limit: 40 });
    const { el } = setup({ rows, groups: [], query: 'abs', hits });
    const shown = hook(one(el, 'data-search-section', 'exercise'), 'data-library-ex').map((r) =>
      r.getAttribute('data-library-ex'),
    );
    expect(shown.length).toBeGreaterThanOrEqual(8);
    const abs = catalog.filter((e) => e.primaryMuscles[0] === 'abdominals').map((e) => e.id);
    expect(new Set(shown.slice(0, 8)).size).toBe(8);
    for (const id of shown.slice(0, 8)) expect(abs).toContain(id);
  });

  it('a mocked onBadge sees the badge kinds the real data gives', () => {
    const onBadge = vi.fn();
    const groups = groupExercises(catalog, 'az', ctx);
    const handle = createLibraryScreen(
      { rows, groups, groupBy: 'az', query: '', hits: [], myGymOnly: false },
      {
        onQuery() {},
        onGroupBy() {},
        onMyGym() {},
        onOpenExercise() {},
        onBadge,
        onHit() {},
        onBack() {},
      },
    );
    const first = hook(asFake(handle.el), 'data-badge-open')[0];
    first?.click();
    expect(onBadge).toHaveBeenCalledTimes(1);
    expect(['3d', 'info']).toContain(onBadge.mock.calls[0]?.[0]);
  });
});

// ---------- task 12b: your own data (workouts, meals, coach chat) ----------

const sec = (
  kind: PersonalSection['kind'],
  hits: SearchHit[],
  over: Partial<PersonalSection> = {},
): PersonalSection => ({ kind, hits, total: hits.length, offset: 0, more: false, ...over });

const personal = (sections: PersonalSection[]): PersonalResults => ({
  range: null,
  words: 'bench',
  sections,
});

const WORKOUT = hit('workout', 'sess-1', 'Push A · Tue 17 Nov', 'Dumbbell Bench Press, Pushups');
const MEAL = hit('meal', '2026-11-16', 'Meals · Mon 16 Nov', 'Rice, Chicken breast');
const CHAT = hit('chat', '42', 'How heavy should my bench be?', 'You · Tue 17 Nov');

describe('Library screen: personal results (task 12b)', () => {
  it('withPersonal appends section hits after the bundled ones, without repeats', () => {
    const bundled = [hit('exercise', 'a', 'A'), hit('workout', 'sess-1', 'Old title')];
    const merged = withPersonal(
      bundled,
      personal([sec('workout', [WORKOUT]), sec('meal', [MEAL]), sec('chat', [CHAT])]),
    );
    expect(merged.map((x) => `${x.kind}:${x.id}`)).toEqual([
      'exercise:a',
      'workout:sess-1',
      'meal:2026-11-16',
      'chat:42',
    ]);
    expect(merged[1]?.title).toBe('Old title');
    expect(withPersonal(bundled, undefined)).toEqual(bundled);
  });

  it('each kind renders as its own section in SPEC order, with the date line', () => {
    const { el } = setup({
      query: 'bench',
      hits: [hit('exercise', 'Crunches', 'Crunches'), hit('setting', 'voice', 'Voice')],
      personal: personal([sec('workout', [WORKOUT]), sec('meal', [MEAL]), sec('chat', [CHAT])]),
    });
    expect(
      hook(el, 'data-search-section').map((s) => s.getAttribute('data-search-section')),
    ).toEqual(['exercise', 'workout', 'meal', 'chat', 'setting', 'food']);
    expect(one(el, 'data-search-section', 'workout').textContent).toContain('Workouts');
    expect(one(el, 'data-search-section', 'meal').textContent).toContain('Meals');
    expect(one(el, 'data-search-section', 'chat').textContent).toContain('Coach');
    const w = one(el, 'data-search-hit', 'workout:sess-1');
    expect(w.tag).toBe('button');
    expect(w.textContent).toContain('Push A · Tue 17 Nov');
    expect(w.textContent).toContain('Dumbbell Bench Press, Pushups');
    expect(one(el, 'data-search-hit', 'meal:2026-11-16').textContent).toContain(
      'Meals · Mon 16 Nov',
    );
    const c = one(el, 'data-search-hit', 'chat:42');
    expect(c.textContent).toContain('How heavy should my bench be?');
    expect(c.textContent).toContain('You · Tue 17 Nov');
    expect(hook(el, 'data-search-loading')).toHaveLength(0);
    expect(hook(el, 'data-search-more')).toHaveLength(0);
  });

  it('a tap on a workout, meal or chat row calls onHit with the hit and its button', () => {
    const { el, calls } = setup({
      query: 'bench',
      personal: personal([sec('workout', [WORKOUT]), sec('meal', [MEAL]), sec('chat', [CHAT])]),
    });
    one(el, 'data-search-hit', 'workout:sess-1').click();
    one(el, 'data-search-hit', 'meal:2026-11-16').click();
    one(el, 'data-search-hit', 'chat:42').click();
    expect(calls).toEqual([
      'hit:workout:sess-1:button',
      'hit:meal:2026-11-16:button',
      'hit:chat:42:button',
    ]);
  });

  it('empty personal sections are hidden', () => {
    const { el } = setup({
      query: 'bench',
      hits: [hit('exercise', 'Crunches', 'Crunches')],
      personal: personal([sec('workout', []), sec('meal', []), sec('chat', [CHAT])]),
    });
    expect(
      hook(el, 'data-search-section').map((s) => s.getAttribute('data-search-section')),
    ).toEqual(['exercise', 'chat', 'food']);
  });

  it('Show more: one button per section with more, the total in the header, onMore(kind)', () => {
    const { el, calls } = setup({
      query: 'bench',
      personal: personal([
        sec('workout', [WORKOUT], { total: 14, more: true }),
        sec('meal', [MEAL]),
        sec('chat', [CHAT], { total: 3, more: true }),
      ]),
    });
    expect(hook(el, 'data-search-more').map((b) => b.getAttribute('data-search-more'))).toEqual([
      'workout',
      'chat',
    ]);
    const more = one(el, 'data-search-more', 'workout');
    expect(more.tag).toBe('button');
    expect(more.textContent).toBe(SHOW_MORE);
    expect(more.getAttribute('aria-label')).toBe('Show more workouts');
    // The button sits inside its own section, after the rows.
    const section = one(el, 'data-search-section', 'workout');
    expect(section.children.at(-1)).toBe(more);
    expect(section.oneByClass('lib-group-count').textContent).toBe('14');
    expect(one(el, 'data-search-section', 'meal').oneByClass('lib-group-count').textContent).toBe(
      '1',
    );
    more.click();
    one(el, 'data-search-more', 'chat').click();
    expect(calls).toEqual(['more:workout', 'more:chat']);
  });

  it('a next page appended by main keeps the shown rows and drops Show more at the end', () => {
    const second = hit('workout', 'sess-0', 'Pull A · Sat 14 Nov');
    const { el, handle } = setup({
      query: 'bench',
      personal: personal([sec('workout', [WORKOUT], { total: 2, more: true })]),
    });
    handle.update({ personal: personal([sec('workout', [WORKOUT, second], { total: 2 })]) });
    const ids = hook(one(el, 'data-search-section', 'workout'), 'data-search-hit').map((x) =>
      x.getAttribute('data-search-hit'),
    );
    expect(ids).toEqual(['workout:sess-1', 'workout:sess-0']);
    expect(hook(el, 'data-search-more')).toHaveLength(0);
  });

  it('no onMore → no Show more button', () => {
    const handle = createLibraryScreen(
      {
        rows: ROWS,
        groups: GROUPS,
        groupBy: 'muscle',
        query: 'bench',
        hits: [],
        myGymOnly: false,
        personal: personal([sec('workout', [WORKOUT], { total: 5, more: true })]),
      },
      {
        onQuery() {},
        onGroupBy() {},
        onMyGym() {},
        onOpenExercise() {},
        onBadge() {},
        onHit() {},
        onBack() {},
      },
    );
    expect(hook(asFake(handle.el), 'data-search-more')).toHaveLength(0);
  });

  it('loading: a quiet status line where the personal sections go, no "No match" yet', () => {
    const { el, handle } = setup({
      query: 'bench',
      hits: [hit('exercise', 'Crunches', 'Crunches'), hit('setting', 'voice', 'Voice')],
      personalLoading: true,
    });
    const line = one(el, 'data-search-loading');
    expect(line.textContent).toBe(SEARCHING_HISTORY);
    expect(line.getAttribute('role')).toBe('status');
    expect(line.getAttribute('aria-live')).not.toBe('assertive');
    const results = el.oneByClass('lib-results');
    expect(results.children.map((c) => c.getAttribute('data-search-section') ?? 'loading')).toEqual(
      ['exercise', 'loading', 'setting', 'food'],
    );

    // Nothing bundled matched: still searching, so no empty state yet; the food row stays.
    handle.update({ query: 'zzz', hits: [] });
    expect(hook(el, 'data-empty-state')).toHaveLength(0);
    expect(hook(el, 'data-search-loading')).toHaveLength(1);
    expect(hook(el, 'data-search-hit', 'food:food')).toHaveLength(1);

    // Done with nothing found: the empty state.
    handle.update({ personalLoading: false, personal: personal([sec('workout', [])]) });
    expect(hook(el, 'data-search-loading')).toHaveLength(0);
    expect(one(el, 'data-empty-state', 'library-search').textContent).toContain(
      "No match for 'zzz'",
    );

    // Done with only personal hits: their sections, no empty state.
    handle.update({ personal: personal([sec('meal', [MEAL])]) });
    expect(hook(el, 'data-empty-state')).toHaveLength(0);
    expect(
      hook(el, 'data-search-section').map((s) => s.getAttribute('data-search-section')),
    ).toEqual(['meal', 'food']);
  });

  it('loading after personal sections already shown (Show more): the line follows them', () => {
    const { el } = setup({
      query: 'bench',
      hits: [hit('setting', 'voice', 'Voice')],
      personal: personal([sec('workout', [WORKOUT], { total: 9, more: true })]),
      personalLoading: true,
    });
    expect(
      el
        .oneByClass('lib-results')
        .children.map((c) => c.getAttribute('data-search-section') ?? 'loading'),
    ).toEqual(['workout', 'loading', 'setting', 'food']);
  });

  it('the search field survives personal updates (focus and caret stay)', () => {
    const { el, handle } = setup({ query: 'bench' });
    const input = one(el, 'data-library-search');
    handle.focusSearch();
    handle.update({ personalLoading: true });
    handle.update({ personalLoading: false, personal: personal([sec('chat', [CHAT])]) });
    expect(one(el, 'data-library-search')).toBe(input);
    expect(
      (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement,
    ).toBe(input);
  });
});
