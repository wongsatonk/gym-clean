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
// - `measurementsEntryRow`: the row on the Fuel tab that opens the screen.
//
// Values are stored in cm; the `lengthUnit` prop (M13d: settings 'lengthUnit') picks cm or
// inches. Unit maths and labels come from core (`src/core/progress/measurements.ts`); each opened
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
import type { Measurement } from '../../core/types';
import { unitField, type UnitField } from '../../core/unitField';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { unitNumberField } from './fields';
import { dayNumber, shortDate } from './weighIn';
import './measurements.css';

export { MEASURE_AGAIN_DAYS, siteLabel };

export type MeasurementsProps = {
  /** Site ids from settings 'trainerKit'.measurementSites, in his order. */
  sites: readonly string[];
  /** M13d: cm or inches (settings 'lengthUnit'; the app's fallback follows the weight unit). */
  lengthUnit: LengthUnit;
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
  const lu = p.lengthUnit;
  const label = p.siteLabel ?? siteLabel;
  const afterDays = p.againAfterDays ?? MEASURE_AGAIN_DAYS;
  const status = measureStatus(p.measurements, p.today, afterDays);
  const copy = statusCopy(status, afterDays);
  // Core tape field: one decimal in either unit (0.5 cm / 0.1 in steps), so the ≥ 64px value
  // always fits its box at 390px.

  /** Opened sites → their field (these are what Save stores). */
  const open = new Map<string, { get: () => UnitField<'tape'> }>();
  const saveText = h('span', { 'data-measure-save-label': true }, saveLabel(0));
  const save = h(
    'button',
    {
      type: 'button',
      class: 'primary-btn cta-btn ms-save',
      'data-measure-save': true,
      disabled: true,
      onclick: () => {
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
    },
    icon('check', 'lg'),
    saveText,
  );
  const sync = () => {
    saveText.textContent = saveLabel(open.size);
    if (open.size === 0) save.setAttribute('disabled', '');
    else save.removeAttribute('disabled');
  };

  const row = (site: string): HTMLElement => {
    const name = label(site);
    const history = siteHistory(p.measurements, site);
    const editor = h('div', { class: 'ms-edit', 'data-site-edit': site, hidden: true });
    const state = h('span', { class: 'ms-site-state' }, icon('plus', 'sm'), h('span', {}, 'Add'));
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'ms-site-btn',
        'data-site-toggle': site,
        'aria-expanded': 'false',
      },
      h(
        'span',
        { class: 'ms-site-txt' },
        h('span', { class: 'ms-site-name' }, name),
        h(
          'span',
          { class: 'ms-site-last', 'data-site-last': site },
          siteLine(history, lu, p.today),
        ),
      ),
      state,
    );
    toggle.addEventListener('click', () => {
      if (open.has(site)) {
        open.delete(site);
        editor.setAttribute('hidden', '');
        editor.replaceChildren();
        toggle.setAttribute('aria-expanded', 'false');
        state.replaceChildren(icon('plus', 'sm'), h('span', {}, 'Add'));
      } else {
        const field = unitNumberField({
          id: `site-${site}`,
          label: `${name} now`,
          field: unitField({ kind: 'tape', metric: history[0]?.cm ?? startCm(site), unit: lu }),
          onChange: () => undefined,
        });
        open.set(site, field);
        editor.removeAttribute('hidden');
        editor.replaceChildren(field.el);
        toggle.setAttribute('aria-expanded', 'true');
        state.replaceChildren(icon('check', 'sm'), h('span', {}, 'In this save'));
      }
      sync();
    });
    return h('li', { class: 'ms-site', 'data-site': site }, toggle, editor);
  };

  return h(
    'main',
    { class: `screen fuel-form measurements ${moodClass('pro')}`, 'data-screen': 'measurements' },
    h(
      'header',
      { class: 'fuel-head' },
      h(
        'button',
        {
          type: 'button',
          class: 'fuel-back',
          'data-swipe-back': true, // M13d task 24: the edge swipe's Back
          onclick: () => a.onBack(),
        },
        icon('back', 'md'),
        h('span', {}, 'Back'),
      ),
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
    p.sites.length
      ? h('ul', { class: 'ms-sites', 'aria-label': 'Spots to measure' }, ...p.sites.map(row))
      : h('p', { class: 'fuel-note', 'data-measure-sites': 'none' }, 'No spots are set up yet.'),
    h(
      'p',
      { class: 'fuel-note' },
      `Saved for today in ${lu === 'in' ? 'inches' : 'cm'}. Saving again replaces today's.`,
    ),
    h('div', { class: 'sticky-bottom ms-bottom' }, save),
  );
}
