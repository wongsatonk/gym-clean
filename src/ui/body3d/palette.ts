// Figure colours for the 3D body, the demo mannequin, the live skeleton and the 2D map (M4e A7).
// Every colour comes from the design tokens (docs/design/m4e-mix/README.md, "Colour roles"):
// --body (figure fill), --edge (rim), --stage-1 / --stage-2 (lit stage / stage), --muscle (the
// only muscle highlight), --muscle-2 (secondary muscles) and --text. They are read through
// cssToken() (tokens.ts) once, when a scene is created.
//
// FIGURE_TOKEN_FALLBACK is the only place these colours are written out: it is used before the
// tokens exist in styles.css, and in tests (no stylesheet). Everything else is derived from the
// tokens, so changing a token changes the figure everywhere.
//
// Pure apart from the default token reader; no three.js import.
import { cssToken } from '../tokens';

export const FIGURE_TOKEN_FALLBACK = {
  '--body': '#3A424D',
  '--edge': '#8D98A6',
  '--stage-1': '#2A313B',
  '--stage-2': '#16191E',
  '--muscle': '#35C8FF',
  '--muscle-2': '#1F86B0',
  '--text': '#F2F4F7',
} as const;

export type FigureToken = keyof typeof FIGURE_TOKEN_FALLBACK;

/** `var(--token, fallback)` for inline styles and SVG, so a missing token still draws. */
export function cssVar(token: FigureToken): string {
  return `var(${token}, ${FIGURE_TOKEN_FALLBACK[token]})`;
}

/** '#rgb' / '#rrggbb' (any case) → 0xRRGGBB, anything else → null. */
export function parseHex(value: string): number | null {
  const v = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short)
    return parseInt(`${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`, 16);
  const long = /^#([0-9a-f]{6})$/i.exec(v);
  return long ? parseInt(long[1] ?? '', 16) : null;
}

const channels = (c: number): [number, number, number] => [
  (c >> 16) & 255,
  (c >> 8) & 255,
  c & 255,
];
const pack = (r: number, g: number, b: number) =>
  (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

/** Linear blend of two 0xRRGGBB colours: t = 0 → a, t = 1 → b. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return pack(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** Toward white by t (0..1). */
export function lighten(c: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const [r, g, b] = channels(c);
  return pack(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
}

/** Scale toward black by t (0..1). */
export function darken(c: number, t: number): number {
  const k = 1 - Math.min(1, Math.max(0, t));
  const [r, g, b] = channels(c);
  return pack(r * k, g * k, b * k);
}

export type FigurePalette = {
  /** The five tokens, as 0xRRGGBB. */
  body: number;
  edge: number;
  stage1: number;
  stage2: number;
  muscle: number;
  text: number;
  /** Primary muscle glow (emissive), a dark cyan so the highlight reads under any light. */
  muscleGlow: number;
  /** Secondary muscles (--muscle-2), a dimmer cyan, clearly weaker than primary. */
  secondary: number;
  /** Muscles that aren't worked: a touch lighter than the body, so the shapes still read. */
  idleMuscle: number;
  /** Demo mannequin joints, a touch darker than the body. */
  joint: number;
  /** Dumbbells, bars and the weight stack. */
  iron: number;
  /** Benches and machine frames. */
  prop: number;
  /** Lights: key (from the front), hemisphere sky / ground, and the rim light from behind. */
  keyLight: number;
  skyLight: number;
  groundLight: number;
  rimLight: number;
};

/** Resolves the figure palette; unset or non-hex tokens use FIGURE_TOKEN_FALLBACK. */
export function figurePalette(
  read: (name: FigureToken) => string = (name) => cssToken(name),
): FigurePalette {
  const get = (t: FigureToken): number =>
    parseHex(read(t)) ?? (parseHex(FIGURE_TOKEN_FALLBACK[t]) as number);
  const body = get('--body');
  const edge = get('--edge');
  const stage1 = get('--stage-1');
  const stage2 = get('--stage-2');
  const muscle = get('--muscle');
  const muscle2 = get('--muscle-2');
  const text = get('--text');
  return {
    body,
    edge,
    stage1,
    stage2,
    muscle,
    text,
    muscleGlow: darken(muscle, 0.6),
    secondary: muscle2,
    idleMuscle: mix(body, edge, 0.12),
    joint: mix(body, stage2, 0.3),
    iron: edge,
    prop: mix(stage1, body, 0.5),
    keyLight: lighten(text, 0.5),
    skyLight: text,
    groundLight: stage2,
    rimLight: edge,
  };
}

/** Lit-stage background behind the figure (radial, lit centre). */
export function stageBackground(): string {
  return `radial-gradient(ellipse 70% 70% at 50% 45%, ${cssVar('--stage-1')}, ${cssVar('--stage-2')} 80%)`;
}

/** WCAG relative luminance of 0xRRGGBB. */
export function luminance(c: number): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(c);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (≥ 1). */
export function contrast(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
