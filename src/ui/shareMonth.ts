// M12 task 13: "Share month", the proof image (SPEC M12 goal 7). Made on the phone: a canvas
// with the month grid (a ring per day, same shapes as the Calendar) and the month's scores.
// No weights, no body or Health data, no exercise or day names: `shareMonthLayout` only reads
// each day's date, status, sets done/planned and whether it is a focus-block day, plus the
// score counts. He saves or shares it himself through the system share sheet
// (`navigator.share({ files })`) or a download link. Nothing is uploaded: no fetch, no new origin.
//
// Colours and fonts come from the tokens (cssToken), so this file holds no colour literal.
//
// M13 task 25: a second size, the Story (1080×1920, 9:16, `shareStoryLayout`): the lockup (the
// app mark + name) on top, one positive number he picks in the preview (sessions done by default,
// total lifted, weeks in a row; core `pickLead` / `shareLeadText`), the month grid with missed
// days as quiet grey rings (no red, no "missed" text) and a quiet footer. Total lifted is the
// only weight it may show, and only when picked; never per-lift weights, body or Health data.
import { APP_NAME } from '../core/brand';
import { pickLead, shareLeadText } from '../core/progress/shareStats';
import { pctOf } from '../core/progress/recap';
import { weekdayOf } from '../core/trainer/plan';
import type { DayCompletion, DayStatus, PeriodScore, ShareLead, ShareStats } from '../core/types';
import type { Unit } from '../core/units';
import { ICON_PATHS } from './icons';
import { cssToken, type TokenName } from './tokens';

/** Portrait 4:5, the size phones and Stories show without cropping the grid. */
export const SHARE_W = 1080;
export const SHARE_H = 1350;

/** M13: Story size, 9:16. */
export const STORY_W = 1080;
export const STORY_H = 1920;

export type ShareSize = 'post' | 'story';

export type ShareColor = Extract<
  TokenName,
  | '--bg'
  | '--surface'
  | '--line'
  | '--text'
  | '--text-2'
  | '--success'
  | '--warn'
  | '--muscle'
  | '--cta'
>;

export type ShareItem =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number; color: ShareColor }
  | {
      kind: 'ring';
      cx: number;
      cy: number;
      r: number;
      width: number;
      color: ShareColor;
      /** 0–100 of the circle, from 12 o'clock clockwise. */
      pct: number;
      dash?: [number, number] | undefined;
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      weight: 400 | 700;
      font: 'display' | 'body';
      color: ShareColor;
      align: 'left' | 'center' | 'right';
      /** Never wider than this (canvas fillText squeezes past it). */
      maxWidth?: number | undefined;
    }
  /** M13: the app mark (the logo path on a 24 grid), stroked at `size` px. */
  | { kind: 'mark'; x: number; y: number; size: number; color: ShareColor };

export type ShareLayout = { width: number; height: number; items: ShareItem[] };

export type ShareScores = { month: PeriodScore; streakWeeks?: number | undefined };

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The only per-day facts the image may use. */
type ShareDay = {
  date: string;
  status: DayStatus;
  setsDone: number;
  setsPlanned: number;
  focus: boolean;
};

function pick(d: DayCompletion): ShareDay {
  return {
    date: d.date,
    status: d.status,
    setsDone: d.setsDone,
    setsPlanned: d.setsPlanned,
    focus: d.blockId !== undefined,
  };
}

function ringPct(d: ShareDay): number {
  if (d.status === 'done' || d.status === 'extra') return 100;
  if (d.status !== 'partial' || d.setsPlanned <= 0) return 0;
  return Math.min(92, Math.max(8, Math.round((d.setsDone / d.setsPlanned) * 100)));
}

const PAD = 60;
const GRID_TOP = 300;
const COL = (SHARE_W - 2 * PAD) / 7;
const ROW = 104;

type GridOpts = {
  top: number;
  pad: number;
  col: number;
  row: number;
  r: number;
  /** Post: the Calendar's dashed amber ring. Story: a quiet grey dashed ring (no red, M13). */
  missed: 'dashed-warn' | 'quiet';
};

/** Weekday letters + one ring per day (Monday first), as on the Calendar. */
function gridItems(days: readonly ShareDay[], o: GridOpts): ShareItem[] {
  const items: ShareItem[] = [];
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((w, i) =>
    items.push({
      kind: 'text',
      x: o.pad + o.col * i + o.col / 2,
      y: o.top - 30,
      text: w,
      size: 32,
      weight: 700,
      font: 'body',
      color: '--text-2',
      align: 'center',
    }),
  );
  const blanks = days[0] ? (weekdayOf(days[0].date) + 6) % 7 : 0;
  days.forEach((d, i) => {
    const slot = blanks + i;
    const cx = o.pad + o.col * (slot % 7) + o.col / 2;
    const cy = o.top + o.row * Math.floor(slot / 7) + o.row / 2;
    const r = o.r;
    if (d.status !== 'rest') {
      const missed = d.status === 'missed';
      const quiet = o.missed === 'quiet';
      items.push({
        kind: 'ring',
        cx,
        cy,
        r,
        width: missed ? (quiet ? 4 : 5) : d.status === 'partial' ? 9 : 4,
        color: missed && !quiet ? '--warn' : '--line',
        pct: 100,
        dash: missed ? [10, 8] : undefined,
      });
      const pct = ringPct(d);
      if (pct > 0) items.push({ kind: 'ring', cx, cy, r, width: 9, color: '--success', pct });
    }
    items.push({
      kind: 'text',
      x: cx,
      y: cy + 13,
      text: String(Number(d.date.slice(8, 10))),
      size: 36,
      weight: d.status === 'rest' ? 400 : 700,
      font: 'body',
      color:
        d.status === 'rest' || (d.status === 'missed' && o.missed === 'quiet')
          ? '--text-2'
          : '--text',
      align: 'center',
    });
    if (d.status === 'extra')
      items.push({
        kind: 'text',
        x: cx + r - 2,
        y: cy - r + 18,
        text: '+',
        size: 36,
        weight: 700,
        font: 'body',
        color: '--success',
        align: 'center',
      });
    if (d.focus)
      items.push({ kind: 'rect', x: cx - 18, y: cy + r + 4, w: 36, h: 6, r: 3, color: '--muscle' });
  });
  return items;
}

/** Pure: what to draw. `month` is 'YYYY-MM'; `completion` = monthCompletion(…, month). */
export function shareMonthLayout(
  month: string,
  completion: readonly DayCompletion[],
  scores: ShareScores,
): ShareLayout {
  const days = completion.filter((d) => d.date.startsWith(month)).map(pick);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const items: ShareItem[] = [
    { kind: 'rect', x: 0, y: 0, w: SHARE_W, h: SHARE_H, r: 0, color: '--bg' },
    {
      kind: 'text',
      x: PAD,
      y: 110,
      text: APP_NAME.toUpperCase(),
      size: 36,
      weight: 700,
      font: 'body',
      color: '--text-2',
      align: 'left',
    },
    {
      kind: 'text',
      x: PAD,
      y: 200,
      text: `${MONTHS[m - 1] ?? ''} ${y}`,
      size: 88,
      weight: 700,
      font: 'display',
      color: '--text',
      align: 'left',
    },
  ];
  items.push(
    ...gridItems(days, {
      top: GRID_TOP,
      pad: PAD,
      col: COL,
      row: ROW,
      r: 44,
      missed: 'dashed-warn',
    }),
  );

  // Scores under the grid (6 rows always reserved, so the layout never moves).
  const s = scores.month;
  const top = GRID_TOP + ROW * 6 + 24;
  items.push({
    kind: 'rect',
    x: PAD,
    y: top,
    w: SHARE_W - 2 * PAD,
    h: 290,
    r: 28,
    color: '--surface',
  });
  const pct = pctOf(s);
  items.push({
    kind: 'text',
    x: PAD + 40,
    y: top + 150,
    text: pct === null ? '–' : `${pct}%`,
    size: 140,
    weight: 700,
    font: 'display',
    color: '--text',
    align: 'left',
  });
  items.push({
    kind: 'text',
    x: PAD + 40,
    y: top + 210,
    text: 'of planned sets',
    size: 36,
    weight: 400,
    font: 'body',
    color: '--text-2',
    align: 'left',
  });
  const right: { text: string; color: ShareColor; weight: 400 | 700 }[] = [
    {
      text:
        s.sessionsPlanned <= 0
          ? 'No sessions planned'
          : s.sessionsDone > s.sessionsPlanned
            ? `${plural(s.sessionsDone, 'session')} done`
            : `${s.sessionsDone} of ${plural(s.sessionsPlanned, 'session')}`,
      color: '--text',
      weight: 700,
    },
  ];
  if (s.extra > 0)
    right.push({ text: `+ ${plural(s.extra, 'extra')}`, color: '--text-2', weight: 400 });
  if (s.focus)
    right.push({
      text: `${cap(s.focus.group)}: ${s.focus.sets} of ${s.focus.target} sets`,
      color: '--text-2',
      weight: 400,
    });
  if (scores.streakWeeks !== undefined && scores.streakWeeks > 0)
    right.push({
      text: `Streak ${plural(scores.streakWeeks, 'week')}`,
      color: '--text-2',
      weight: 400,
    });
  right.slice(0, 4).forEach((l, i) =>
    items.push({
      kind: 'text',
      x: SHARE_W - PAD - 40,
      y: top + 80 + i * 58,
      text: l.text,
      size: 44,
      weight: l.weight,
      font: 'body',
      color: l.color,
      align: 'right',
    }),
  );
  items.push({
    kind: 'text',
    x: PAD,
    y: SHARE_H - 50,
    text: `Every set logged in ${APP_NAME}`,
    size: 32,
    weight: 400,
    font: 'body',
    color: '--text-2',
    align: 'left',
  });
  return { width: SHARE_W, height: SHARE_H, items };
}

/** File name for the image: gym-clean-2026-11.png. */
export const shareFileName = (month: string): string => `gym-clean-${month}.png`;

/** M13: file name for the Story image: gym-clean-2026-11-story.png. */
export const shareStoryFileName = (month: string): string => `gym-clean-${month}-story.png`;

/** The `d` of the app logo path (ICON_PATHS.logo, 24×24 grid), for the canvas mark. */
export function logoPathData(): string {
  // \x22 is a double quote (kept out of a regex literal so the copy scanners read this file right).
  return new RegExp('\\sd=\\x22([^\\x22]+)\\x22').exec(ICON_PATHS.logo)?.[1] ?? '';
}

export type StoryOptions = {
  stats: ShareStats;
  /** The lead he picked; one that isn't offered falls back (core `pickLead`). */
  lead: ShareLead | null | undefined;
  /** Display unit for "total lifted". */
  unit: Unit;
};

const S_PAD = 80;
const S_GRID_TOP = 900;
const S_COL = (STORY_W - 2 * S_PAD) / 7;
const S_ROW = 124;
/** The Story lead number: its biggest size and its left edge (optical, 8px into the pad). */
const S_LEAD_MAX = 260;
const S_LEAD_X = S_PAD - 8;

/**
 * Pure estimate of a lead value's width at `size` px in the display face (Barlow Condensed bold,
 * with a little slack for the Arial Narrow / system fallbacks): digits 0.56em, separators 0.28em,
 * anything else 0.6em.
 */
export function leadValueWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += /\d/.test(ch) ? 0.56 : /[,.\s]/.test(ch) ? 0.28 : 0.6;
  return em * size;
}

/** The biggest size (≤ 260, whole px) at which `text` fits `room` px; the canvas maxWidth backs it up. */
export function leadValueSize(text: string, room: number): number {
  const at1 = leadValueWidth(text, 1);
  if (at1 <= 0) return S_LEAD_MAX;
  return Math.min(S_LEAD_MAX, Math.floor(room / at1));
}

/**
 * Pure: the Story image (1080×1920). The lockup on top, the lead number big with its label,
 * the month grid with missed days as quiet grey rings, a quiet footer. When every number is 0
 * (`pickLead` → null) the month name takes the lead's place and the grid stands alone.
 */
export function shareStoryLayout(
  month: string,
  completion: readonly DayCompletion[],
  opts: StoryOptions,
): ShareLayout {
  const days = completion.filter((d) => d.date.startsWith(month)).map(pick);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const monthName = `${MONTHS[m - 1] ?? ''} ${y}`;
  const lead = pickLead(opts.stats, opts.lead ?? undefined);
  const items: ShareItem[] = [
    { kind: 'rect', x: 0, y: 0, w: STORY_W, h: STORY_H, r: 0, color: '--bg' },
    // The lockup: the mark on its tile, the name beside it.
    { kind: 'rect', x: S_PAD, y: 110, w: 112, h: 112, r: 28, color: '--surface' },
    { kind: 'mark', x: S_PAD + 16, y: 126, size: 80, color: '--cta' },
    {
      kind: 'text',
      x: S_PAD + 140,
      y: 190,
      text: APP_NAME,
      size: 64,
      weight: 700,
      font: 'display',
      color: '--text',
      align: 'left',
    },
  ];
  if (lead) {
    const t = shareLeadText(lead, opts.stats, opts.unit);
    // A long value (1,102,311 lb) steps down to fit the width instead of running off the edge.
    const room = STORY_W - S_PAD - S_LEAD_X;
    items.push(
      {
        kind: 'text',
        x: S_PAD,
        y: 380,
        text: monthName,
        size: 56,
        weight: 700,
        font: 'body',
        color: '--text-2',
        align: 'left',
      },
      {
        kind: 'text',
        x: S_LEAD_X,
        y: 650,
        text: t.value,
        size: leadValueSize(t.value, room),
        maxWidth: room,
        weight: 700,
        font: 'display',
        color: '--cta',
        align: 'left',
      },
      {
        kind: 'text',
        x: S_PAD,
        y: 760,
        text: t.label,
        size: 64,
        weight: 700,
        font: 'body',
        color: '--text',
        align: 'left',
      },
    );
  } else {
    items.push({
      kind: 'text',
      x: S_PAD,
      y: 600,
      text: monthName,
      size: 120,
      weight: 700,
      font: 'display',
      color: '--text',
      align: 'left',
    });
  }
  items.push(
    ...gridItems(days, {
      top: S_GRID_TOP,
      pad: S_PAD,
      col: S_COL,
      row: S_ROW,
      r: 48,
      missed: 'quiet',
    }),
  );
  items.push({
    kind: 'text',
    x: STORY_W / 2,
    y: STORY_H - 80,
    text: `Logged in ${APP_NAME}`,
    size: 34,
    weight: 400,
    font: 'body',
    color: '--text-2',
    align: 'center',
  });
  return { width: STORY_W, height: STORY_H, items };
}

/** Draws the layout on a canvas and returns a PNG. Needs a DOM with canvas 2D. */
export async function renderShareMonth(
  layout: ShareLayout,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): Promise<Blob> {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) await fonts.ready.catch(() => undefined);
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  const family = {
    display: cssToken('--font-display') || 'sans-serif',
    body: cssToken('--font-body') || 'sans-serif',
  };
  const colour = new Map<ShareColor, string>();
  const c = (name: ShareColor) => {
    if (!colour.has(name)) colour.set(name, cssToken(name));
    return colour.get(name) ?? '';
  };
  for (const it of layout.items) {
    if (it.kind === 'rect') {
      ctx.fillStyle = c(it.color);
      ctx.beginPath();
      if (it.r > 0 && typeof ctx.roundRect === 'function')
        ctx.roundRect(it.x, it.y, it.w, it.h, it.r);
      else ctx.rect(it.x, it.y, it.w, it.h);
      ctx.fill();
    } else if (it.kind === 'ring') {
      ctx.strokeStyle = c(it.color);
      ctx.lineWidth = it.width;
      ctx.lineCap = it.pct >= 100 ? 'butt' : 'round';
      ctx.setLineDash(it.dash ?? []);
      ctx.beginPath();
      const start = -Math.PI / 2;
      ctx.arc(it.cx, it.cy, it.r, start, start + (2 * Math.PI * it.pct) / 100);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (it.kind === 'mark') {
      const d = logoPathData();
      if (!d || typeof Path2D !== 'function') continue;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.scale(it.size / 24, it.size / 24);
      ctx.strokeStyle = c(it.color);
      ctx.lineWidth = 2.25;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.stroke(new Path2D(d));
      ctx.restore();
    } else {
      ctx.fillStyle = c(it.color);
      ctx.textAlign = it.align;
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${it.weight} ${it.size}px ${family[it.font]}`;
      if (it.maxWidth !== undefined) ctx.fillText(it.text, it.x, it.y, it.maxWidth);
      else ctx.fillText(it.text, it.x, it.y);
    }
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no PNG'))), 'image/png'),
  );
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export type ShareEnv = {
  nav?: Pick<Navigator, 'share' | 'canShare'> | undefined;
  doc?: Pick<Document, 'createElement' | 'body'> | undefined;
  createObjectURL?: ((b: Blob) => string) | undefined;
  revokeObjectURL?: ((url: string) => void) | undefined;
};

/**
 * Hands the PNG to the system share sheet when it takes files, else downloads it. A cancelled
 * share sheet is 'cancelled' (no download behind his back); any other share error downloads.
 */
export async function shareMonth(
  png: Blob,
  month: string,
  env: ShareEnv = {},
  size: ShareSize = 'post',
): Promise<ShareResult> {
  const nav = env.nav ?? (typeof navigator === 'undefined' ? undefined : navigator);
  const name = size === 'story' ? shareStoryFileName(month) : shareFileName(month);
  const FileCtor = (globalThis as { File?: typeof File }).File;
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && FileCtor) {
    const file = new FileCtor([png], name, { type: 'image/png' });
    const data = { files: [file], title: 'My month' };
    let ok: boolean;
    try {
      ok = nav.canShare(data);
    } catch {
      ok = false;
    }
    if (ok) {
      try {
        await nav.share(data);
        return 'shared';
      } catch (e) {
        if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
      }
    }
  }
  const doc = env.doc ?? document;
  const toUrl = env.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  const revoke = env.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u));
  const url = toUrl(png);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => revoke(url), 10_000);
  return 'downloaded';
}
