// M12 slice 1b task 27: tape measurements in Fuel (SPEC M12 "Trainer kit" item 4).
// Props in, callbacks out: the app passes the site ids from settings 'trainerKit'
// (`measurementSites`), every saved `Measurement` and today's date; it saves what comes back.
// No DB and no core math here beyond display (cm ↔ in, "measure again" wording).
//
// Two pieces:
// - `measurementsScreen`: Back, a status card ("Measure again" once the latest measurement is
//   28 days old), one row per site with its last value and the change since the time before.
//   Tapping a row opens its [−] value [+] field and adds it to this save; tapping it again leaves
//   it out. One Save button stores every opened site for today (saving again replaces today's).
//   M13d task 40e: Save is the main round button with the short word "Save" (one line at 390);
//   its name says what it saves ("Save 1 measurement", or "Save. Tap a spot to measure").
// - `measurementsEntryRow`: the row on the Fuel tab that opens the screen.
//
// Values are stored in cm; `units.length` (M13d: settings 'lengthUnit') picks cm or inches.
// M13d task 13c: a cm | in switch ("Measurement unit", `[data-unit-for="tape"]`) heads the list.
// A tap re-shows every opened field from the cm it holds (no drift, nothing saved), re-words the
// last-value lines and the note, and calls `onUnits` with the whole new preference. Unit maths and labels come from core (`src/core/progress/measurements.ts`); each opened
// site is a core tape unit field (no drift; range 5–300 cm). Copy is plain numbers: no score, no
// good/bad colour, no health wording.
//
// e2e hooks: `main[data-screen="measurements"]`, `[data-measure-status=first|ok|due]`,
// `[data-site=<id>]` rows, `[data-site-toggle=<id>]` (aria-expanded), `[data-site-last=<id>]`,
// `[data-field="site-<id>"] .nf-value`, `[data-measure-save]`; on Fuel
// `[data-measurements-open]` (data-due).
import {
  MEASURE_AGAIN_DAYS,
  formatLength,
  siteLabel,
  toLength,
  type LengthUnit,
} from '../../core/progress/measurements';
import type { Measurement, UnitPrefs } from '../../core/types';
import { switchUnit, unitField, type UnitField } from '../../core/unitField';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { TAPE_UNIT_SWITCH, unitSwitch } from '../unitSwitch';
import { unitNumberField } from './fields';
import { fuelBack, fuelMain, labelOf } from './fuelButtons';
import { dayNumber, shortDate } from './weighIn';
import './measurements.css';

export { MEASURE_AGAIN_DAYS, siteLabel };

export type MeasurementsProps = {
  /** Site ids from settings 'trainerKit'.measurementSites, in his order. */
  sites: readonly string[];
  /** M13d: the app's units; tape in `units.length` (settings 'lengthUnit'; the app's fallback
   *  follows the weight unit). */
  units: UnitPrefs;
  /** Local date YYYY-MM-DD. */
  today: string;
  /** Every saved measurement, any order. */
  measurements: readonly Measurement[];
  /** Days until "Measure again" (core's rule data). Default 28. */
  againAfterDays?: number | undefined;
  /** Site id → label, for ids this file doesn't know. Default: the id in words. */
  siteLabel?: ((site: string) => string) | undefined;
};

export type MeasurementsActions = {
  onBack: () => void;
  /** One row per opened site, dated today, in cm (1 decimal). Replaces today's for that site. */
  onSave: (rows: Measurement[]) => void;
  /** M13d task 13c: the cm | in switch was tapped; the whole new preference, once per tap. */
  onUnits: (next: UnitPrefs) => void;
};

// ---------- pure helpers ----------

/** Where the field starts when a site has no value yet (cm). Only a starting point to tap from. */
const SITE_START: readonly [RegExp, number][] = [
  [/arm|bicep/i, 32],
  [/chest|shoulder/i, 95],
  [/waist/i, 80],
  [/hip/i, 95],
  [/thigh/i, 55],
  [/calf/i, 37],
  [/neck/i, 38],
];

export function startCm(site: string): number {
  return SITE_START.find(([re]) => re.test(site))?.[1] ?? 50;
}

/** A site's measurements, newest first. */
export function siteHistory(measurements: readonly Measurement[], site: string): Measurement[] {
  return measurements.filter((m) => m.site === site).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** "+0.5 cm" / "−0.5 cm" / "same" between two values, in the display unit. */
export function changeText(nowCm: number, beforeCm: number, lu: LengthUnit): string {
  const d = Number((toLength(nowCm, lu) - toLength(beforeCm, lu)).toFixed(1));
  if (d === 0) return 'same';
  const n = Math.abs(d).toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${d > 0 ? '+' : '−'}${n} ${lu}`;
}

/** "34.5 cm · 12 Oct · +0.5 cm since 14 Sep" / "Not measured yet". */
export function siteLine(history: readonly Measurement[], lu: LengthUnit, today: string): string {
  const [last, before] = history;
  if (!last) return 'Not measured yet';
  const when = last.date === today ? 'today' : shortDate(last.date);
  const base = `${formatLength(last.cm, lu)} · ${when}`;
  if (!before) return base;
  const change = changeText(last.cm, before.cm, lu);
  return change === 'same'
    ? `${base} · same as ${shortDate(before.date)}`
    : `${base} · ${change} since ${shortDate(before.date)}`;
}

export type MeasureStatus =
  | { kind: 'first' }
  | { kind: 'ok'; last: string; days: number }
  | { kind: 'due'; last: string; days: number };

/** Whether it's time to measure again: the newest measurement of any site is `afterDays` old. */
export function measureStatus(
  measurements: readonly Measurement[],
  today: string,
  afterDays: number = MEASURE_AGAIN_DAYS,
): MeasureStatus {
  let last: string | null = null;
  for (const m of measurements) if (last === null || m.date > last) last = m.date;
  if (last === null) return { kind: 'first' };
  const days = Math.max(0, dayNumber(today) - dayNumber(last));
  return { kind: days >= afterDays ? 'due' : 'ok', last, days };
}

const daysAgo = (n: number) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

export function statusCopy(s: MeasureStatus, afterDays: number = MEASURE_AGAIN_DAYS) {
  if (s.kind === 'first') {
    return {
      title: 'First measurements',
      body: 'Use a tape measure. Same spot each time, about once a month.',
    };
  }
  if (s.kind === 'due') {
    return {
      title: 'Measure again',
      body: `Last measured ${shortDate(s.last)}, ${daysAgo(s.days)}.`,
    };
  }
  const left = Math.max(1, afterDays - s.days);
  return {
    title: 'Up to date',
    body: `Last measured ${shortDate(s.last)}, ${daysAgo(s.days)}. Next in ${left} ${left === 1 ? 'day' : 'days'}.`,
  };
}

/** The Save button's words for `n` opened sites. */
export function saveLabel(n: number): string {
  if (n === 0) return 'Tap a spot to measure';
  return n === 1 ? 'Save 1 measurement' : `Save ${n} measurements`;
}

/** M13d task 40e: the Save button's visible word (one line at 390, at every text size). */
export const SAVE_WORD = 'Save';

/** The Save button's accessible name: starts with the visible word, then what it saves. */
export function saveName(n: number): string {
  return n === 0 ? `${SAVE_WORD}. ${saveLabel(0)}` : saveLabel(n);
}

// ---------- the Fuel entry row ----------

export type MeasurementsEntry = { lastDate: string | null; due: boolean };

/** What the Fuel row needs, from the saved measurements. */
export function measurementsEntry(
  measurements: readonly Measurement[],
  today: string,
  afterDays: number = MEASURE_AGAIN_DAYS,
): MeasurementsEntry {
  const s = measureStatus(measurements, today, afterDays);
  return s.kind === 'first'
    ? { lastDate: null, due: false }
    : { lastDate: s.last, due: s.kind === 'due' };
}

export function entryLine(e: MeasurementsEntry): string {
  if (e.lastDate === null) return 'Tape measure, once a month';
  return e.due ? `Measure again · last ${shortDate(e.lastDate)}` : `Last ${shortDate(e.lastDate)}`;
}

/** The Fuel tab's "Measurements" row (opens the screen). */
export function measurementsEntryRow(e: MeasurementsEntry, onOpen: () => void): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: 'ms-entry',
      'data-measurements-open': true,
      'data-due': e.due ? 'true' : 'false',
      onclick: () => onOpen(),
    },
    icon('ruler', 'md'),
    h(
      'span',
      { class: 'ms-entry-txt' },
      h('span', { class: 'ms-entry-name' }, 'Measurements'),
      h('span', { class: 'ms-entry-sub' }, entryLine(e)),
    ),
    h('span', { class: 'ms-entry-go', 'aria-hidden': 'true' }, icon('back', 'md')),
  );
}

// ---------- the screen ----------

export function measurementsScreen(p: MeasurementsProps, a: MeasurementsActions): HTMLElement {
  let units: UnitPrefs = { ...p.units };
  const label = p.siteLabel ?? siteLabel;
  const afterDays = p.againAfterDays ?? MEASURE_AGAIN_DAYS;
  const status = measureStatus(p.measurements, p.today, afterDays);
  const copy = statusCopy(status, afterDays);
  // Core tape field: one decimal in either unit (0.5 cm / 0.1 in steps), so the ≥ 64px value
  // always fits its box at 390px.

  /** Opened sites → their field (these are what Save stores). */
  const open = new Map<string, { get: () => UnitField<'tape'> }>();
  /** Per site: re-shows its line and (when opened) its field in the unit now chosen. */
  const reshow: (() => void)[] = [];
  // M13d task 40e: the main round button with the short word "Save" (the long "Save 1
  // measurement" wrapped onto two lines in the system font); the count stays in its name.
  const save = fuelMain({
    icon: 'check',
    label: SAVE_WORD,
    ariaLabel: saveName(0),
    class: 'ms-save',
    hooks: { 'data-measure-save': true },
    disabled: true,
    onClick: () => {
      if (open.size === 0) return;
      a.onSave(
        p.sites
          .filter((s) => open.has(s))
          .map((site) => ({
            date: p.today,
            site,
            cm: open.get(site)?.get().metric ?? 0,
          })),
      );
    },
  });
  labelOf(save)?.setAttribute('data-measure-save-label', '');
  const sync = () => {
    save.setAttribute('aria-label', saveName(open.size));
    if (open.size === 0) save.setAttribute('disabled', '');
    else save.removeAttribute('disabled');
  };

  const row = (site: string): HTMLElement => {
    const name = label(site);
    const history = siteHistory(p.measurements, site);
    const editor = h('div', { class: 'ms-edit', 'data-site-edit': site, hidden: true });
    const state = h('span', { class: 'ms-site-state' }, icon('plus', 'sm'), h('span', {}, 'Add'));
    const last = h(
      'span',
      { class: 'ms-site-last', 'data-site-last': site },
      siteLine(history, units.length, p.today),
    );
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'ms-site-btn',
        'data-site-toggle': site,
        'aria-expanded': 'false',
      },
      h('span', { class: 'ms-site-txt' }, h('span', { class: 'ms-site-name' }, name), last),
      state,
    );
    const openField = (field: UnitField<'tape'>) => {
      const f = unitNumberField({
        id: `site-${site}`,
        label: `${name} now`,
        field,
        onChange: () => undefined,
      });
      open.set(site, f);
      editor.replaceChildren(f.el);
    };
    reshow.push(() => {
      last.textContent = siteLine(history, units.length, p.today);
      const f = open.get(site);
      if (f) openField(switchUnit(f.get(), units.length));
    });
    toggle.addEventListener('click', () => {
      if (open.has(site)) {
        open.delete(site);
        editor.setAttribute('hidden', '');
        editor.replaceChildren();
        toggle.setAttribute('aria-expanded', 'false');
        state.replaceChildren(icon('plus', 'sm'), h('span', {}, 'Add'));
      } else {
        openField(
          unitField({ kind: 'tape', metric: history[0]?.cm ?? startCm(site), unit: units.length }),
        );
        editor.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
        state.replaceChildren(icon('check', 'sm'), h('span', {}, 'In this save'));
      }
      sync();
    });
    return h('li', { class: 'ms-site', 'data-site': site }, toggle, editor);
  };

  const note = h('p', { class: 'fuel-note', 'data-measure-note': true }, noteText(units.length));
  const unitRow = p.sites.length
    ? h(
        'div',
        { class: 'unit-field-head ms-unit-row' },
        h('h2', { class: 'nf-label ms-unit-label', id: 'ms-spots' }, 'Spots to measure'),
        unitSwitch({
          ...TAPE_UNIT_SWITCH,
          value: units.length,
          hooks: { 'data-unit-for': 'tape' },
          onChange: (length) => {
            units = { ...units, length };
            for (const f of reshow) f();
            note.textContent = noteText(length);
            a.onUnits(units);
          },
        }),
      )
    : null;

  return h(
    'main',
    { class: `screen fuel-form measurements ${moodClass('pro')}`, 'data-screen': 'measurements' },
    h(
      'header',
      { class: 'fuel-head' },
      fuelBack(() => a.onBack(), { swipe: true }), // M13d task 24: the edge swipe's Back
      h('h1', { class: 'page-title' }, 'Measurements'),
    ),
    h(
      'section',
      {
        class: `ms-status ms-status-${status.kind}`,
        'data-measure-status': status.kind,
        role: 'status',
        'aria-labelledby': 'ms-status-title',
      },
      h(
        'h2',
        { class: 'ms-status-title', id: 'ms-status-title' },
        icon(status.kind === 'ok' ? 'check' : 'ruler', 'md'),
        h('span', {}, copy.title),
      ),
      h('p', { class: 'ms-status-body' }, copy.body),
    ),
    unitRow,
    p.sites.length
      ? h('ul', { class: 'ms-sites', 'aria-labelledby': 'ms-spots' }, ...p.sites.map(row))
      : h('p', { class: 'fuel-note', 'data-measure-sites': 'none' }, 'No spots are set up yet.'),
    note,
    h('div', { class: 'sticky-bottom ms-bottom' }, save),
  );
}

/** The note under the list, in the unit shown. */
function noteText(lu: LengthUnit): string {
  return `Saved for today in ${lu === 'in' ? 'inches' : 'cm'}. Saving again replaces today's.`;
}
