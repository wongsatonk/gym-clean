// Original, stylized SVG body map (front + back). Drawn from our own half-body point lists:
// each shape is defined for the figure's left half (x ≤ 50), mirrored to the right half and
// smoothed with Catmull-Rom curves. viewBox is 100 × 212; the figure's centre line is x = 50.
// Muscle names match yuhonas/free-exercise-db exactly.

export const MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export type Muscle = (typeof MUSCLES)[number];
export type BodyView = 'front' | 'back';

type Pt = readonly [number, number];
type Shape = readonly Pt[];

/** Muscles that are mainly seen from behind; everything else defaults to the front view. */
const BACK_FIRST = new Set<string>([
  'lats',
  'middle back',
  'lower back',
  'traps',
  'triceps',
  'glutes',
  'hamstrings',
  'calves',
]);

// ---------- geometry (left half) ----------

const BODY: Record<string, Shape> = {
  torso: [
    [50, 26],
    [42, 27],
    [34, 29],
    [29, 34],
    [30, 46],
    [32, 60],
    [33, 72],
    [32, 84],
    [31, 96],
    [30, 104],
    [36, 111],
    [44, 115],
    [50, 116],
  ],
  upperArm: [
    [30, 32],
    [24, 36],
    [22, 46],
    [21, 58],
    [23, 65],
    [28, 63],
    [30, 52],
    [31, 41],
  ],
  forearm: [
    [22, 62],
    [18, 72],
    [16, 84],
    [15, 94],
    [19, 96],
    [22, 86],
    [25, 74],
    [27, 64],
  ],
  thigh: [
    [31, 100],
    [29, 118],
    [30, 134],
    [32, 150],
    [35, 159],
    [41, 159],
    [44, 148],
    [46, 132],
    [48, 120],
    [50, 114],
    [44, 110],
    [36, 106],
  ],
  shin: [
    [34, 157],
    [33, 170],
    [34, 184],
    [36, 196],
    [41, 196],
    [42, 184],
    [43, 170],
    [42, 157],
  ],
};

const FRONT: Partial<Record<Muscle, Shape>> = {
  neck: [
    [46, 21],
    [45, 27],
    [48, 31],
    [49.5, 29],
    [48, 22],
  ],
  traps: [
    [44, 26],
    [37, 28.5],
    [33, 31],
    [40, 31.5],
    [46, 29],
  ],
  shoulders: [
    [33, 30.5],
    [28, 33],
    [25, 38],
    [24, 45],
    [27, 47],
    [30, 41],
    [33, 36],
    [36, 32.5],
  ],
  chest: [
    [49, 32],
    [42, 31.5],
    [36, 33.5],
    [31.5, 38],
    [31.5, 45],
    [35, 49],
    [42, 50],
    [49, 48],
  ],
  biceps: [
    [27.5, 47],
    [24.5, 49],
    [23.5, 56],
    [24.5, 62],
    [27, 61],
    [29, 54],
    [29.5, 48.5],
  ],
  forearms: [
    [23, 65],
    [20, 71],
    [18, 80],
    [17, 90],
    [20, 91],
    [22, 82],
    [25, 72],
    [26, 66],
  ],
  abdominals: [
    [49, 51],
    [43, 52],
    [37, 53],
    [34.5, 58],
    [35, 70],
    [35.5, 82],
    [37, 93],
    [42, 102],
    [49, 105],
  ],
  abductors: [
    [31.5, 99],
    [30.5, 107],
    [30.5, 116],
    [32.5, 120],
    [34, 112],
    [34, 103],
  ],
  adductors: [
    [49, 114],
    [45.5, 116],
    [42.5, 124],
    [42.5, 134],
    [44.5, 139],
    [46.5, 130],
    [48.5, 120],
  ],
  quadriceps: [
    [34, 108],
    [31.5, 120],
    [32, 136],
    [34, 150],
    [37, 156],
    [41, 156],
    [43, 148],
    [42, 138],
    [41, 127],
    [43, 118],
    [39, 112],
  ],
  calves: [
    [41.5, 162],
    [42.5, 172],
    [41.5, 182],
    [39.5, 186],
    [39, 176],
    [39.5, 166],
  ],
};

const BACK: Partial<Record<Muscle, Shape>> = {
  neck: [
    [46.5, 21],
    [45.5, 26],
    [49.5, 27],
    [49.5, 21],
  ],
  traps: [
    [49.5, 22],
    [45, 27],
    [37, 29],
    [32, 31],
    [38, 34],
    [44, 38],
    [47, 46],
    [49.5, 52],
  ],
  shoulders: [
    [32, 31.5],
    [27, 34],
    [25, 40],
    [25, 46],
    [28, 46],
    [31, 40],
    [35, 34],
  ],
  triceps: [
    [27.5, 46.5],
    [24.5, 49],
    [23.5, 56],
    [24.5, 63],
    [27, 63],
    [29, 56],
    [29.5, 49],
  ],
  forearms: [
    [23, 65],
    [20, 71],
    [18, 80],
    [17, 90],
    [20, 91],
    [22, 82],
    [25, 72],
    [26, 66],
  ],
  'middle back': [
    [45.5, 46],
    [43, 40],
    [37.5, 37],
    [35.5, 42],
    [37.5, 50],
    [42, 55],
    [46, 55],
  ],
  lats: [
    [35, 43],
    [31.5, 47],
    [31.5, 58],
    [33, 70],
    [36, 78],
    [42, 74],
    [46, 64],
    [46.5, 58],
    [41.5, 56],
    [37, 51],
  ],
  'lower back': [
    [49.5, 66],
    [45.5, 67],
    [42.5, 76],
    [41.5, 88],
    [44, 96],
    [49.5, 98],
  ],
  abductors: [
    [35, 96],
    [31.5, 100],
    [30.5, 108],
    [33.5, 105],
    [38.5, 100],
  ],
  glutes: [
    [49.5, 100],
    [42, 100],
    [35, 104],
    [31.5, 112],
    [32.5, 122],
    [38, 126],
    [45, 124],
    [49.5, 120],
  ],
  adductors: [
    [49.5, 123],
    [46.5, 126],
    [45.5, 136],
    [46.5, 142],
    [48.5, 132],
  ],
  hamstrings: [
    [32.5, 125],
    [31.5, 135],
    [33, 146],
    [36, 154],
    [40, 154],
    [43, 146],
    [44, 135],
    [45, 127],
    [38.5, 129],
  ],
  calves: [
    [35, 160],
    [33.5, 168],
    [34, 178],
    [37, 185],
    [41, 183],
    [43, 174],
    [43, 164],
    [40, 159],
  ],
};

const VIEWS: Record<BodyView, Partial<Record<Muscle, Shape>>> = { front: FRONT, back: BACK };

// ---------- path building ----------

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const mirror = (shape: Shape): Shape => shape.map(([x, y]) => [100 - x, y] as const);

/** Closed Catmull-Rom spline through the points, as cubic Bézier path data. */
function smoothClosed(points: Shape): string {
  const n = points.length;
  const at = (i: number): Pt => points[((i % n) + n) % n] ?? [0, 0];
  const [x0, y0] = at(0);
  let d = `M${fmt(x0)} ${fmt(y0)}`;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = at(i - 1);
    const [bx, by] = at(i);
    const [cx, cy] = at(i + 1);
    const [dx, dy] = at(i + 2);
    const c1x = bx + (cx - ax) / 6;
    const c1y = by + (cy - ay) / 6;
    const c2x = cx - (dx - bx) / 6;
    const c2y = cy - (dy - by) / 6;
    d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(cx)} ${fmt(cy)}`;
  }
  return `${d}Z`;
}

const bothSides = (shape: Shape) => `${smoothClosed(shape)}${smoothClosed(mirror(shape))}`;

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0Z`;

const SILHOUETTE = [
  ellipse(50, 12.5, 8, 10),
  'M45 19h10v9h-10Z',
  bothSides(BODY.torso ?? []),
  bothSides(BODY.upperArm ?? []),
  bothSides(BODY.forearm ?? []),
  ellipse(16.5, 101, 3.6, 6) + ellipse(83.5, 101, 3.6, 6),
  bothSides(BODY.thigh ?? []),
  bothSides(BODY.shin ?? []),
  ellipse(38, 201, 5.5, 4) + ellipse(62, 201, 5.5, 4),
].join('');

// ---------- public API ----------

export function musclesInView(view: BodyView): Muscle[] {
  return MUSCLES.filter((m) => VIEWS[view][m] !== undefined);
}

/** Front unless most of the primary muscles are seen from behind. */
export function pickView(primary: readonly string[]): BodyView {
  const back = primary.filter((m) => BACK_FIRST.has(m)).length;
  return back > primary.length - back ? 'back' : 'front';
}

const slug = (m: string) => m.replace(/\s+/g, '-');

export type BodyMapOptions = {
  view: BodyView;
  primary: readonly string[];
  secondary: readonly string[];
};

/** SVG markup for one view. Content is generated from constants only, so it is safe as innerHTML. */
export function bodyMapSvg({ view, primary, secondary }: BodyMapOptions): string {
  const label =
    `${view === 'front' ? 'Front' : 'Back'} view.` +
    (primary.length ? ` Primary: ${primary.join(', ')}.` : '') +
    (secondary.length ? ` Secondary: ${secondary.join(', ')}.` : '');
  const paths = musclesInView(view)
    .map((m) => {
      const shape = VIEWS[view][m] ?? [];
      const level = primary.includes(m) ? ' primary' : secondary.includes(m) ? ' secondary' : '';
      return `<path id="muscle-${view}-${slug(m)}" data-muscle="${m}" class="muscle${level}" d="${bothSides(shape)}"/>`;
    })
    .join('');
  return (
    `<svg class="body-map" data-view="${view}" viewBox="0 0 100 212" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">` +
    `<path class="body" d="${SILHOUETTE}"/>${paths}</svg>`
  );
}
