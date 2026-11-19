// M13c task 12: the exercise Library + search (SPEC M13c goals 3 and 6). Pure render: props in,
// callbacks out. app.ts owns the state (query, group-by, My gym only), runs core's
// `groupExercises` / `search` and hands the results back through `update`; nothing here reads
// the database, and nothing here is spoken (read at rest only, never during a set).
//
// It is a handle, not a one-shot element: typing re-renders the results on every keystroke, and
// a full re-render would drop the search field's focus and caret (and the phone keyboard with
// them). `update(next)` replaces everything below the controls and leaves the field alone.
//
// Layout (top to bottom): Back + "Library" title + a count line; the search field (clear button
// when it has text); "Group by" Muscle / Equipment / Day / Movement / A–Z (3 + 2 grid, so every
// word stays ≥ 20px at 390px wide); the "My gym only" switch; then either the folding groups
// (blank query) or the hit sections (typed query; group-by and the switch hide meanwhile, they
// only shape the groups).
//
// Search sections come in SPEC order (Exercises, Workouts, Meals, Coach, Settings, Why? cards,
// Foods). A section renders only when it has hits.
//
// M13c task 12b: your own data. `personal` (task 3b's `personalSearch` result) fills Workouts /
// Meals / Coach: each row is a hit button (title with the date, e.g. "Push A · Tue 17 Nov";
// chat rows "You · Tue 17 Nov" underneath), the header pill shows the section's `total`, and a
// "Show more" button (`[data-search-more=<kind>]` → `onMore(kind)`) follows the rows while
// `more`. Main appends each next page to the same section's `hits` (keep `offset` at 0), so the
// rows already shown stay put. While `personalLoading`, a quiet "Searching your history…" line
// (role=status, polite) sits where those sections go; "No match" waits until it's done.
//
// Taps: a row's name (stretched over the row) → `onOpenExercise(id)`, a badge →
// `onBadge(kind, id, opener)`, an exercise hit → `onOpenExercise(id)` (same row look), any other
// hit (setting / learn / food / workout / chat / meal) → `onHit(hit, opener)`.
//
// e2e hooks: `[data-screen="library"]`, `[data-library-back]`, `[data-library-count]`,
// `[data-library-search]` (the input), `[data-library-clear]`, `[data-group-by=<by>]`
// (aria-pressed), `[data-library-mygym]` (role=switch, aria-checked), `[data-library-group=<key>]`
// (the fold button, aria-expanded), `[data-library-list=<key>]`, `[data-library-ex=<id>]` rows,
// `[data-ex-open=<id>]`, `[data-badge-open=<kind>]`, `[data-library-needs]`,
// `[data-search-section=<kind>]`, `[data-search-hit=<kind>:<id>]`, `[data-search-more=<kind>]`,
// `[data-search-loading]`, `[data-empty-state="library-search"]`, `[data-empty-state="library-gym"]`.
import type { LibraryGroup } from '../../core/library';
import { foodSearchHit } from '../../core/search';
import type { PersonalKind, PersonalResults } from '../../core/searchPersonal';
import type {
  BodyArea,
  LibraryGroupBy,
  PlannedExercise,
  SearchHit,
  SearchKind,
} from '../../core/types';
import { badgesFor, type BadgeKind, type BadgeRuleStatus } from '../badges';
import { backButton } from '../backButton';
import { h } from '../dom';
import { emptyState } from '../emptyState';
import { icon, type IconName } from '../icons';
import { iconButton } from '../iconButton';
import { moodClass } from '../tokens';
import '../library.css';

/** One exercise as a Library row shows it. */
export type LibraryRow = {
  id: string;
  /** Display name (`exerciseName(id)`). */
  name: string;
  /** Badge input: 'pose' when a camera rule counts it (the plan row's tracking, else the rule). */
  tracking: PlannedExercise['tracking'];
  /** Badge override for tests / harness; omitted = looked up from the rule data. */
  ruleStatus?: BadgeRuleStatus;
  /** The main muscle's label ("Abdominals"). */
  muscle: string;
  /** The equipment group label ("Body only", `equipmentGroupLabel`). */
  equipment: string;
  /** Kit this phone's gym lacks (`missingKitLabels(id, gym)`); empty / omitted = doable. */
  needs?: readonly string[] | undefined;
};

export type LibraryProps = {
  /** Every exercise in the app (program, pool, abs); groups and hits refer to these by id. */
  rows: readonly LibraryRow[];
  /** `groupExercises(catalog, groupBy, ctx)`, with `myGymOnly` applied. */
  groups: readonly LibraryGroup[];
  groupBy: LibraryGroupBy;
  /** The typed text; blank shows the groups. */
  query: string;
  /**
   * `search(index, query, …)` over the bundled items (exercises, settings, Why? cards; later the
   * personal ones). The "Search foods for '…'" row is added here (`foodSearchHit`), not by the
   * caller. Ignored while the query is blank.
   */
  hits: readonly SearchHit[];
  myGymOnly: boolean;
  /** Body-area header above the muscle groups ("Core"); omitted = no area headers. */
  areaLabel?: ((area: BodyArea) => string) | undefined;
  /** Back button words (where it goes: "Today", "Fuel"…). Default "Back". */
  backLabel?: string | undefined;
  /** Mark the field `autofocus`; still call `focusSearch()` inside the opening tap (iOS keyboard). */
  autofocus?: boolean | undefined;
  /**
   * Task 12b: `personalSearch(db, query, …)` for the current query (workouts, meals, coach
   * chat). "Show more" pages are appended to the section's `hits` by main. Omitted = none yet.
   */
  personal?: PersonalResults | undefined;
  /** Task 12b: the personal query is running → "Searching your history…". */
  personalLoading?: boolean | undefined;
};

export type LibraryActions = {
  /** Every edit of the field, and Clear (with ''). */
  onQuery: (query: string) => void;
  onGroupBy: (by: LibraryGroupBy) => void;
  onMyGym: (on: boolean) => void;
  onOpenExercise: (exerciseId: string) => void;
  /** 3D demo / Info → How-to sheet, Camera → Camera sheet, Learning → learn card. */
  onBadge: (kind: BadgeKind, exerciseId: string, opener: HTMLElement) => void;
  /** A setting / Why? card / food / workout / chat / meal hit. */
  onHit: (hit: SearchHit, opener: HTMLElement) => void;
  /** Task 12b: "Show more" under Workouts / Meals / Coach (main asks for the next page). */
  onMore?: ((kind: PersonalKind) => void) | undefined;
  onBack: () => void;
};

export type LibraryHandle = {
  el: HTMLElement;
  /** Re-render with changed props (results, controls); the search field keeps focus and caret. */
  update: (next: Partial<LibraryProps>) => void;
  /** Focus the search field. Call it in the tap that opened the Library so iOS shows the keyboard. */
  focusSearch: () => void;
};

// ---------- copy + pure helpers ----------

export const LIBRARY_TITLE = 'Library';
export const SEARCH_PLACEHOLDER = 'Search: abs, cable, Push A';
export const SEARCH_HINT = 'Try a muscle like abs or chest, or kit like cable.';
export const MY_GYM_LABEL = 'My gym only';
export const NO_GYM_FIT = 'No exercise here fits your gym.';
export const SEARCHING_HISTORY = 'Searching your history…';
export const SHOW_MORE = 'Show more';

/** Screen-reader name of a section's Show more ("Show more workouts"). */
export const SHOW_MORE_LABEL: Readonly<Record<PersonalKind, string>> = {
  workout: 'Show more workouts',
  meal: 'Show more meals',
  chat: 'Show more coach messages',
};

/** The group-by choices, in display order. */
export const GROUP_BY_OPTIONS: readonly { by: LibraryGroupBy; label: string }[] = [
  { by: 'muscle', label: 'Muscle' },
  { by: 'equipment', label: 'Equipment' },
  { by: 'day', label: 'Day' },
  { by: 'movement', label: 'Movement' },
  { by: 'az', label: 'A–Z' },
];

/** The search sections, in SPEC order. A section shows only when it has hits. */
export const SEARCH_SECTIONS: readonly { kind: SearchKind; title: string; icon: IconName }[] = [
  { kind: 'exercise', title: 'Exercises', icon: 'dumbbell' },
  { kind: 'workout', title: 'Workouts', icon: 'calendar' },
  { kind: 'meal', title: 'Meals', icon: 'plate' },
  { kind: 'chat', title: 'Coach', icon: 'chat' },
  { kind: 'setting', title: 'Settings', icon: 'sliders' },
  { kind: 'learn', title: 'Why? cards', icon: 'help' },
  { kind: 'food', title: 'Foods', icon: 'bowl' },
];

export type HitSection = { kind: SearchKind; title: string; hits: SearchHit[] };

/** Hits split into the SPEC's sections, each keeping the ranked order; empty ones dropped. */
export function hitSections(hits: readonly SearchHit[]): HitSection[] {
  return SEARCH_SECTIONS.flatMap(({ kind, title }) => {
    const list = hits.filter((x) => x.kind === kind);
    return list.length === 0 ? [] : [{ kind, title, hits: list }];
  });
}

const PERSONAL_SEARCH_KINDS: ReadonlySet<SearchKind> = new Set(['workout', 'meal', 'chat']);

/**
 * The bundled hits plus the personal sections' hits (bundled first; a kind:id already there is
 * not repeated). Blank query or no `personal` → the bundled hits as given.
 */
export function withPersonal(
  hits: readonly SearchHit[],
  personal: PersonalResults | undefined,
): SearchHit[] {
  if (!personal) return [...hits];
  const seen = new Set(hits.map((x) => `${x.kind}:${x.id}`));
  const extra = personal.sections.flatMap((s) =>
    s.hits.filter((x) => {
      const key = `${x.kind}:${x.id}`;
      if (x.kind !== s.kind || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  return [...hits, ...extra];
}

/** The bundled hits plus the "Search foods for '…'" row (once). Blank query → []. */
export function hitsWithFood(query: string, hits: readonly SearchHit[]): SearchHit[] {
  if (query.trim() === '') return [];
  const food = hits.some((x) => x.kind === 'food') ? null : foodSearchHit(query);
  return food ? [...hits, food] : [...hits];
}

/** "Needs: Pull-up bar" / "Needs: Cable pulley, Rope attachment"; null when doable. */
export function needsLine(labels: readonly string[] | undefined): string | null {
  return labels && labels.length > 0 ? `Needs: ${labels.join(', ')}` : null;
}

/** "70 exercises" / "1 exercise". */
export function exerciseCount(n: number): string {
  return `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
}

/** "No match for 'xyz'". */
export function noMatchLine(query: string): string {
  return `No match for '${query.trim().replace(/\s+/g, ' ')}'`;
}

/** Unique exercise ids across the groups (an exercise can sit under several plan days). */
export function uniqueIds(groups: readonly LibraryGroup[]): string[] {
  return [...new Set(groups.flatMap((g) => g.ids))];
}

// ---------- component ----------

let screens = 0;

const HIT_ICON: Record<SearchKind, IconName> = Object.fromEntries(
  SEARCH_SECTIONS.map((s) => [s.kind, s.icon]),
) as Record<SearchKind, IconName>;

export function createLibraryScreen(initial: LibraryProps, actions: LibraryActions): LibraryHandle {
  const uid = ++screens;
  let props: LibraryProps = initial;
  /** Folded group keys; kept across updates (and across group-bys: keys differ per group-by). */
  const folded = new Set<string>();

  const input = h('input', {
    type: 'search',
    class: 'lib-search-input',
    id: `lib-search-${uid}`,
    placeholder: SEARCH_PLACEHOLDER,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-label': 'Search the app',
    'data-library-search': true,
    autofocus: initial.autofocus === true,
  });
  input.value = initial.query;
  input.addEventListener('input', () => actions.onQuery(input.value));
  input.addEventListener('keydown', (ev: Event) => {
    // Enter hides the phone keyboard; results are already live.
    if ((ev as KeyboardEvent).key === 'Enter') input.blur();
  });

  const clear = h(
    'button',
    {
      type: 'button',
      class: 'lib-search-clear',
      'aria-label': 'Clear search',
      'data-library-clear': true,
      onclick: () => {
        input.value = '';
        actions.onQuery('');
        input.focus();
      },
    },
    icon('close', 'md'),
  );

  const count = h('p', { class: 'lib-count muted', 'data-library-count': true });
  const controls = h('div', { class: 'lib-controls' });
  const results = h('div', { class: 'lib-results' });

  const el = h(
    'main',
    { class: `screen library ${moodClass('pro')}`, 'data-screen': 'library' },
    h(
      'header',
      { class: 'top-bar' },
      backButton(actions.onBack, initial.backLabel ?? 'Back', { 'data-library-back': true }),
    ),
    h(
      'div',
      { class: 'lib-head' },
      h('h1', { class: 'page-title', id: `lib-title-${uid}` }, LIBRARY_TITLE),
      count,
    ),
    h('div', { class: 'lib-search', role: 'search' }, input, clear),
    controls,
    results,
  );

  function render(): void {
    const q = props.query;
    if (input.value !== q) input.value = q;
    if (q === '') clear.setAttribute('hidden', '');
    else clear.removeAttribute('hidden');
    count.textContent = exerciseCount(uniqueIds(props.groups).length);
    // Group-by and My gym only shape the groups, not the hits: hidden while searching, so the
    // results start right under the field.
    const browsing = q.trim() === '';
    controls.replaceChildren(
      ...(browsing
        ? [groupByControl(props.groupBy, actions, uid), myGymSwitch(props, actions)]
        : []),
    );
    results.replaceChildren(...(browsing ? groupList() : searchResults()));
  }

  const rowById = (): Map<string, LibraryRow> => new Map(props.rows.map((r) => [r.id, r]));

  function groupList(): HTMLElement[] {
    if (props.groups.length === 0) {
      return [
        emptyState({
          kind: 'library-gym',
          icon: 'dumbbell',
          line: NO_GYM_FIT,
          action: { label: 'Show all exercises', onClick: () => actions.onMyGym(false) },
        }),
      ];
    }
    const rows = rowById();
    const out: HTMLElement[] = [];
    let area: BodyArea | undefined;
    props.groups.forEach((g, i) => {
      if (props.areaLabel && g.area !== undefined && g.area !== area) {
        out.push(
          h('h2', { class: 'lib-area caps', 'data-library-area': g.area }, props.areaLabel(g.area)),
        );
      }
      area = g.area;
      out.push(groupBlock(g, `lib-g-${uid}-${i}`, rows));
    });
    return out;
  }

  function groupBlock(g: LibraryGroup, listId: string, rows: Map<string, LibraryRow>): HTMLElement {
    const open = !folded.has(g.key);
    const list = h(
      'ul',
      { class: 'lib-list', id: listId, 'data-library-list': g.key, hidden: !open },
      ...g.ids.flatMap((id) => {
        const r = rows.get(id);
        return r ? [libraryRow(r, actions)] : [];
      }),
    );
    const head: HTMLButtonElement = h(
      'button',
      {
        type: 'button',
        class: 'lib-group-head',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': listId,
        'data-library-group': g.key,
        onclick: () => {
          const nowOpen = folded.has(g.key);
          if (nowOpen) folded.delete(g.key);
          else folded.add(g.key);
          head.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
          if (nowOpen) list.removeAttribute('hidden');
          else list.setAttribute('hidden', '');
        },
      },
      h('span', { class: 'lib-group-label' }, g.label),
      h(
        'span',
        { class: 'lib-group-count' },
        h('span', { 'aria-hidden': 'true' }, String(g.ids.length)),
        h('span', { class: 'sr-only' }, `, ${exerciseCount(g.ids.length)}`),
      ),
      icon('back', 'sm', { class: 'lib-group-chev' }),
    );
    return h('section', { class: 'lib-group' }, h('h3', { class: 'lib-group-h' }, head), list);
  }

  function searchResults(): HTMLElement[] {
    const q = props.query;
    const all = hitsWithFood(q, withPersonal(props.hits, props.personal));
    const found = all.filter((x) => x.kind !== 'food');
    const rows = rowById();
    const loading = props.personalLoading === true;
    if (found.length === 0 && !loading) {
      const food = all.find((x) => x.kind === 'food');
      return [
        emptyState({
          kind: 'library-search',
          icon: 'list',
          line: noMatchLine(q),
          lineHooks: { role: 'status' },
          action: food ? hitButton(food) : null,
        }),
        h('p', { class: 'lib-hint muted' }, SEARCH_HINT),
      ];
    }
    const out = hitSections(all).map((s) => sectionBlock(s, rows));
    if (loading) {
      // Where Workouts / Meals / Coach go: after Exercises and any personal section so far.
      const before = new Set<SearchKind>(['exercise', ...PERSONAL_SEARCH_KINDS]);
      const at = out.filter((el) =>
        before.has(el.getAttribute('data-search-section') as SearchKind),
      ).length;
      out.splice(at, 0, loadingLine());
    }
    return out;
  }

  function sectionBlock(s: HitSection, rows: Map<string, LibraryRow>): HTMLElement {
    const section = props.personal?.sections.find((x) => x.kind === s.kind);
    const total = section ? Math.max(section.total, s.hits.length) : s.hits.length;
    const more =
      section?.more === true && actions.onMore !== undefined
        ? moreButton(section.kind, actions.onMore)
        : null;
    return h(
      'section',
      {
        class: 'lib-section',
        'data-search-section': s.kind,
        'aria-labelledby': `lib-s-${uid}-${s.kind}`,
      },
      h(
        'h2',
        { class: 'lib-section-title', id: `lib-s-${uid}-${s.kind}` },
        s.title,
        h('span', { class: 'lib-group-count' }, String(total)),
      ),
      h(
        'ul',
        { class: 'lib-list' },
        ...s.hits.map((hit) => {
          const r = hit.kind === 'exercise' ? rows.get(hit.id) : undefined;
          return r
            ? libraryRow(r, actions, `${hit.kind}:${hit.id}`)
            : h('li', { class: 'lib-hit-item' }, hitButton(hit));
        }),
      ),
      more,
    );
  }

  function hitButton(hit: SearchHit): HTMLElement {
    const btn: HTMLButtonElement = h(
      'button',
      {
        type: 'button',
        class: 'lib-hit',
        'data-search-hit': `${hit.kind}:${hit.id}`,
        onclick: () =>
          hit.kind === 'exercise' ? actions.onOpenExercise(hit.id) : actions.onHit(hit, btn),
      },
      icon(HIT_ICON[hit.kind], 'md', { class: 'lib-hit-ic' }),
      h(
        'span',
        { class: 'lib-hit-text' },
        h('span', { class: 'lib-hit-title' }, hit.title),
        hit.subtitle ? h('span', { class: 'lib-hit-sub muted' }, hit.subtitle) : null,
      ),
      icon('back', 'sm', { class: 'ex-row-chev' }),
    );
    return btn;
  }

  render();

  return {
    el,
    update(next) {
      props = { ...props, ...next };
      render();
    },
    focusSearch() {
      input.focus();
    },
  };
}

/** "Searching your history…": quiet (polite status), shown while the personal query runs. */
function loadingLine(): HTMLElement {
  return h(
    'p',
    { class: 'lib-loading muted', role: 'status', 'data-search-loading': true },
    icon('clock', 'md'),
    h('span', {}, SEARCHING_HISTORY),
  );
}

/** M13d task 40c: "Show more" is a quiet round iconButton, its word beside it on a full row. */
function moreButton(kind: PersonalKind, onMore: (kind: PersonalKind) => void): HTMLElement {
  return iconButton({
    icon: 'plus',
    label: SHOW_MORE,
    variant: 'quiet',
    labelAt: 'beside',
    wideHit: true,
    ariaLabel: SHOW_MORE_LABEL[kind],
    class: 'lib-more',
    hooks: { 'data-search-more': kind },
    onClick: () => onMore(kind),
  });
}

function groupByControl(
  current: LibraryGroupBy,
  actions: LibraryActions,
  uid: number,
): HTMLElement {
  const labelId = `lib-groupby-${uid}`;
  return h(
    'div',
    { class: 'lib-groupby' },
    h('p', { class: 'lib-ctl-label muted', id: labelId }, 'Group by'),
    h(
      'div',
      { class: 'lib-seg', role: 'group', 'aria-labelledby': labelId },
      ...GROUP_BY_OPTIONS.map(({ by, label }) => {
        const on = by === current;
        return h(
          'button',
          {
            type: 'button',
            class: on ? 'lib-seg-btn active' : 'lib-seg-btn',
            'aria-pressed': on ? 'true' : 'false',
            'data-group-by': by,
            onclick: () => {
              if (!on) actions.onGroupBy(by);
            },
          },
          on ? icon('check', 'sm') : null,
          h('span', {}, label),
        );
      }),
    ),
  );
}

function myGymSwitch(props: LibraryProps, actions: LibraryActions): HTMLElement {
  const on = props.myGymOnly;
  return h(
    'button',
    {
      type: 'button',
      class: on ? 'switch-btn lib-mygym on' : 'switch-btn lib-mygym',
      role: 'switch',
      'aria-checked': on ? 'true' : 'false',
      'data-library-mygym': true,
      onclick: () => actions.onMyGym(!on),
    },
    h('span', { class: 'switch-label' }, MY_GYM_LABEL),
    h('span', { class: 'switch-state', 'aria-hidden': 'true' }, on ? 'On' : 'Off'),
  );
}

/** One exercise row: name (opens the detail; its target covers the row), badges, muscle · kit. */
function libraryRow(r: LibraryRow, actions: LibraryActions, hitKey?: string): HTMLElement {
  const needs = needsLine(r.needs);
  return h(
    'li',
    {
      class: 'lib-row',
      'data-library-ex': r.id,
      'data-search-hit': hitKey,
      'data-needs': needs ? true : undefined,
    },
    h(
      'button',
      {
        type: 'button',
        class: 'ex-row-open',
        'data-ex-open': r.id,
        onclick: () => actions.onOpenExercise(r.id),
      },
      h('strong', { class: 'ex-row-name' }, r.name),
      icon('back', 'sm', { class: 'ex-row-chev' }),
    ),
    h(
      'div',
      { class: 'lib-row-line' },
      badgesFor({
        exerciseId: r.id,
        tracking: r.tracking,
        name: r.name,
        ...(r.ruleStatus !== undefined ? { ruleStatus: r.ruleStatus } : {}),
        onBadge: (kind, opener) => actions.onBadge(kind, r.id, opener),
      }),
      h('span', { class: 'lib-row-meta muted' }, `${r.muscle} · ${r.equipment}`),
    ),
    needs
      ? h(
          'p',
          { class: 'lib-needs', 'data-library-needs': true },
          icon('lock', 'sm'),
          h('span', {}, needs),
        )
      : null,
  );
}
