// M12 task 13: "Share month", the proof image (SPEC M12 goal 7). Made on the phone: a canvas
// with the month grid (a ring per day, same shapes as the Calendar) and the month's scores.
// No weights, no body or Health data, no exercise or day names: `shareMonthLayout` only reads
// each day's date, status, sets done/planned and whether it is a focus-block day, plus the
// score counts. He saves or shares it himself through the system share sheet
// (`navigator.share({ files })`) or a download link. Nothing is uploaded: no fetch, no new origin.
//
// Colours and fonts come from the tokens (cssToken), so this file holds no colour literal.
import { pctOf } from '../core/progress/recap';
import { weekdayOf } from '../core/trainer/plan';
import type { DayCompletion, DayStatus, PeriodScore } from '../core/types';
import { cssToken, type TokenName } from './tokens';

/** Portrait 4:5, the size phones and Stories show without cropping the grid. */
export const SHARE_W = 1080;
export const SHARE_H = 1350;

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
    };

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
      text: 'GYM CLEAN',
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
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((w, i) =>
    items.push({
      kind: 'text',
      x: PAD + COL * i + COL / 2,
      y: GRID_TOP - 30,
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
    const cx = PAD + COL * (slot % 7) + COL / 2;
    const cy = GRID_TOP + ROW * Math.floor(slot / 7) + ROW / 2;
    const r = 44;
    if (d.status !== 'rest') {
      const missed = d.status === 'missed';
      items.push({
        kind: 'ring',
        cx,
        cy,
        r,
        width: missed ? 5 : d.status === 'partial' ? 9 : 4,
        color: missed ? '--warn' : '--line',
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
      color: d.status === 'rest' ? '--text-2' : '--text',
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
        s.sessionsPlanned > 0
          ? `${s.sessionsDone} of ${plural(s.sessionsPlanned, 'session')}`
          : 'No sessions planned',
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
    text: 'Every set logged in Gym Clean',
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
    } else {
      ctx.fillStyle = c(it.color);
      ctx.textAlign = it.align;
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${it.weight} ${it.size}px ${family[it.font]}`;
      ctx.fillText(it.text, it.x, it.y);
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
): Promise<ShareResult> {
  const nav = env.nav ?? (typeof navigator === 'undefined' ? undefined : navigator);
  const name = shareFileName(month);
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
