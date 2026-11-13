// M4e step 1 — builds the three standalone direction mockups (energy.html, pro.html, track.html)
// and their comparison sheets, plus a contrast table (contrast.json) used by README.md.
// Run: node docs/design/m4e-directions/_src/build.mjs   (then shoot.mjs for the PNGs)
// Everything is inline: no external requests, original SVG art only.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- contrast (WCAG 2.x relative luminance) ----------
const lum = (hex) => {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

// ---------- directions ----------
const directions = {
  energy: {
    name: 'Energy',
    tagline: 'Bold colour blocks. Orange means go, green means you did it.',
    font: {
      display: 'Barlow Condensed',
      displayLicence: 'SIL OFL 1.1',
      body: 'Barlow',
      standIn: "local('DINCondensed-Bold'), local('DIN Condensed Bold')",
      standInName: 'DIN Condensed Bold (macOS) stands in for Barlow Condensed 700',
      bodyStack: "'Barlow', system-ui, -apple-system, 'Helvetica Neue', sans-serif",
      displayWeight: 700,
      displayTracking: '0.01em',
    },
    t: {
      bg: '#121014', surface: '#1E1A20', surface2: '#2B2530', line: '#433A48',
      text: '#FFF7F0', text2: '#D2C6C0',
      cta: '#FF7A1A', onCta: '#1A0B00',
      success: '#3BE38B', onSuccess: '#06210F',
      muscle: '#FF5FA2', body: '#45404A', edge: '#9A90A0', stage1: '#3A3240', stage2: '#1E1A20',
      cue: '#FFD84D', info: '#8EC9FF', danger: '#FF6B6B',
    },
    icon: { stroke: 2.5, cap: 'round', join: 'round' },
    radius: { card: '24px', btn: '18px', chip: '999px' },
  },
  pro: {
    name: 'Pro',
    tagline: 'Calm graphite, one electric volt accent. Quiet until it matters.',
    font: {
      display: 'Archivo (variable, wdth 62–125)',
      displayLicence: 'SIL OFL 1.1',
      body: 'Archivo',
      standIn: "local('AvenirNextCondensed-DemiBold'), local('Avenir Next Condensed Demi Bold')",
      standInName: 'Avenir Next Condensed Demi Bold (macOS) stands in for Archivo SemiCondensed 650',
      bodyStack: "'Archivo', 'Avenir Next', system-ui, -apple-system, sans-serif",
      displayWeight: 600,
      displayTracking: '-0.01em',
    },
    t: {
      bg: '#0D0F12', surface: '#16191E', surface2: '#20242B', line: '#323842',
      text: '#F2F4F7', text2: '#A9B1BC',
      cta: '#C8F31D', onCta: '#12160A',
      success: '#FFC94D', onSuccess: '#221800',
      muscle: '#35C8FF', body: '#3A424D', edge: '#8D98A6', stage1: '#2A313B', stage2: '#16191E',
      cue: '#C5B3FF', info: '#A9B1BC', danger: '#FF7A7A',
    },
    icon: { stroke: 1.75, cap: 'round', join: 'round' },
    radius: { card: '20px', btn: '16px', chip: '10px' },
  },
  track: {
    name: 'Track',
    tagline: 'Stadium scoreboard. Black, white, signal yellow — numbers first.',
    font: {
      display: 'Big Shoulders Display',
      displayLicence: 'SIL OFL 1.1',
      body: 'Barlow Semi Condensed',
      standIn: "local('Futura-CondensedExtraBold'), local('Futura Condensed ExtraBold')",
      standInName: 'Futura Condensed ExtraBold (macOS) stands in for Big Shoulders Display 800',
      bodyStack: "'Barlow Semi Condensed', 'Avenir Next', system-ui, -apple-system, sans-serif",
      displayWeight: 800,
      displayTracking: '0.02em',
    },
    t: {
      bg: '#000000', surface: '#111111', surface2: '#1D1D1D', line: '#3A3A3A',
      text: '#FFFFFF', text2: '#B8B8B8',
      cta: '#FFD60A', onCta: '#000000',
      success: '#2EE6A6', onSuccess: '#00261A',
      muscle: '#FF5A1F', body: '#3D3D3D', edge: '#9A9A9A', stage1: '#2A2A2A', stage2: '#111111',
      cue: '#7FD8FF', info: '#B8B8B8', danger: '#FF6B6B',
    },
    icon: { stroke: 2.25, cap: 'square', join: 'miter' },
    radius: { card: '6px', btn: '6px', chip: '4px' },
  },
};

// Pairs we promise. kind: 'text' needs >= 4.5, 'large' (>= 64px numbers / graphics) needs >= 3.
const pairs = (t) => [
  ['text on bg', t.text, t.bg, 'text'],
  ['text on surface-2', t.text, t.surface2, 'text'],
  ['text-2 on bg', t.text2, t.bg, 'text'],
  ['text-2 on surface-2', t.text2, t.surface2, 'text'],
  ['on-cta on cta (button label)', t.onCta, t.cta, 'text'],
  ['cta on bg (accent text/icons)', t.cta, t.bg, 'text'],
  ['on-success on success', t.onSuccess, t.success, 'text'],
  ['success on surface', t.success, t.surface, 'text'],
  ['cue on surface', t.cue, t.surface, 'text'],
  ['info on surface', t.info, t.surface, 'text'],
  ['danger on bg', t.danger, t.bg, 'text'],
  ['muscle on body (3D/2D highlight)', t.muscle, t.body, 'large'],
  ['figure rim (edge) on stage', t.edge, t.stage2, 'large'],
  ['figure rim (edge) on lit stage', t.edge, t.stage1, 'large'],
  ['text on stage light', t.text, t.stage1, 'text'],
];

// ---------- original icon set (24 grid, stroke = currentColor; style set per direction) ----------
const ICONS = {
  dumbbell: '<path d="M3 9.5v5M6.5 7v10M17.5 7v10M21 9.5v5M6.5 12h11"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7l1.5-3h4l1.5 3"/><circle cx="12" cy="13.5" r="3.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="8.5" cy="17" r="2.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5.5v-6h-5v6H4z"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.6 1.4-4.2 2.6-5.2.2 2 1.1 3.1 2.4 3.6C12.6 9.7 11.4 6.3 12 3z"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11M12 14v4M8 21h8M9.5 18h5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  skip: '<path d="M5 6l8 6-8 6zM17.5 6v12"/>',
  flag: '<path d="M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.6M12 17v.2"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 3h4M18.5 6.5L20 5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5zM13.5 7l3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bars: '<path d="M5 20v-7M10 20V8M15 20v-9M20 20V5"/>',
  medal: '<path d="M7.5 3h3.5l1 5.2M16.5 3H13l-1 5.2"/><circle cx="12" cy="15" r="6"/><path d="M9.6 15l1.7 1.7 3.2-3.4"/>',
  logo: '<path d="M2.5 9.5v5M5.5 7v10M18.5 7v10M21.5 9.5v5M5.5 12h4l1.5-3 2 6 1.5-3h3.5"/>',
};
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(ICONS)
  .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
  .join('')}</svg>`;
const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// ---------- original body figure placeholder (stands in for the 3D viewer) ----------
// regions: chest, delts, arms, lats, abs, quads, calves, traps
function figure(regions = [], { back = false, cls = '' } = {}) {
  const on = (r) => (regions.includes(r) ? 'm' : 'b');
  const front = `
    <ellipse class="${on('chest')}" cx="40.5" cy="52" rx="9.5" ry="7.5"/>
    <ellipse class="${on('chest')}" cx="59.5" cy="52" rx="9.5" ry="7.5"/>
    <rect class="${on('abs')}" x="42.5" y="62" width="15" height="26" rx="5"/>`;
  const rear = `
    <path class="${on('traps')}" d="M38 38 Q50 33 62 38 L58 48 Q50 46 42 48Z"/>
    <path class="${on('lats')}" d="M33 50 Q41 54 46 64 L44 86 Q37 82 33 72Z"/>
    <path class="${on('lats')}" d="M67 50 Q59 54 54 64 L56 86 Q63 82 67 72Z"/>`;
  return `<svg class="figure ${cls}" viewBox="0 0 100 200" aria-hidden="true">
    <circle class="b" cx="50" cy="16" r="11"/>
    <rect class="b" x="45" y="25" width="10" height="9" rx="3"/>
    <path class="b torso" d="M30 39 Q50 31 70 39 L68 92 Q50 99 32 92Z"/>
    ${back ? rear : front}
    <circle class="${on('delts')}" cx="27" cy="44" r="8"/>
    <circle class="${on('delts')}" cx="73" cy="44" r="8"/>
    <rect class="${on('arms')}" x="15.5" y="49" width="11" height="33" rx="5.5" transform="rotate(8 21 65)"/>
    <rect class="${on('arms')}" x="73.5" y="49" width="11" height="33" rx="5.5" transform="rotate(-8 79 65)"/>
    <rect class="b" x="11" y="83" width="10" height="31" rx="5" transform="rotate(6 16 98)"/>
    <rect class="b" x="79" y="83" width="10" height="31" rx="5" transform="rotate(-6 84 98)"/>
    <path class="b" d="M32 93 L68 93 L65 108 L35 108Z"/>
    <rect class="${on('quads')}" x="32.5" y="106" width="16" height="48" rx="7.5"/>
    <rect class="${on('quads')}" x="51.5" y="106" width="16" height="48" rx="7.5"/>
    <rect class="${on('calves')}" x="33.5" y="157" width="13" height="36" rx="6"/>
    <rect class="${on('calves')}" x="53.5" y="157" width="13" height="36" rx="6"/>
  </svg>`;
}

// ---------- screens ----------
const days = [
  ['Push A', ['chest', 'delts', 'arms'], false, 'Mon', 'done'],
  ['Pull A', ['lats', 'traps', 'arms'], true, 'Next', 'next'],
  ['Legs A', ['quads', 'calves'], false, 'Sat', ''],
  ['Push B', ['chest', 'delts'], false, 'Sun', ''],
  ['Pull B', ['lats', 'arms'], true, '—', ''],
  ['Legs B', ['quads', 'calves'], false, '—', ''],
];
const week = [
  ['M', 'done'], ['T', 'rest'], ['W', 'done'], ['T', 'rest'], ['F', 'today'], ['S', ''], ['S', ''],
];

function topbarWorkout(d, { rest = false } = {}) {
  const left = `<button class="tb tb-wide" aria-label="Workout list">${ic('list')}<span class="tb-txt"><b>Pull A</b><small>${rest ? '1 of 5' : '1 of 5'}</small></span></button>`;
  const cam = rest ? '' : `<button class="tb">${ic('camera')}<span class="tb-lbl">Camera</span></button>`;
  const pause = `<button class="tb">${ic('pause')}<span class="tb-lbl">Pause</span></button>`;
  const segs = [1, 2, 3, 4, 5].map((i) => `<i class="${i === 1 ? 'cur' : ''}"></i>`).join('');
  return `<header class="topbar">${left}${cam}${pause}</header><div class="segs" aria-label="Exercise 1 of 5">${segs}</div>`;
}

function today(d) {
  const dayCards = days
    .map(
      ([n, r, back, when, st]) => `<article class="day is-${st}">
        <div class="day-fig">${figure(r, { back })}</div>
        <div class="day-name">${n}</div>
        <div class="day-when">${st === 'done' ? ic('check', 'sm') : ''}${when}</div>
      </article>`,
    )
    .join('');
  const weekDots = week
    .map(([l, s]) => `<li class="wd ${s}"><span class="dot">${s === 'done' ? ic('check', 'xs') : ''}</span><span class="wl">${l}</span></li>`)
    .join('');
  return `<section class="screen s-today" id="today" aria-label="Today">
  <header class="appbar">
    <div class="brand">${ic('logo', 'brand-ic')}<span>Gym Clean</span></div>
    <div class="date">Fri 13 Nov</div>
  </header>
  <article class="hero">
    <div class="hero-deco" aria-hidden="true"></div>
    <div class="hero-txt">
      <div class="eyebrow">Next up · Day 2 of 6</div>
      <h1 class="hero-title">Pull A</h1>
      <div class="hero-meta"><span>${ic('dumbbell', 'sm')}5 exercises</span><span>${ic('clock', 'sm')}~45 min</span></div>
      <div class="chips"><span class="chip">Back</span><span class="chip">Biceps</span><span class="chip">Rear delts</span></div>
    </div>
    <div class="hero-fig">${figure(['lats', 'traps', 'arms'], { back: true })}</div>
    <button class="cta cta-xl">${ic('play')}Start workout</button>
  </article>
  <div class="pair">
    <article class="tile streak">
      <div class="tile-head">${ic('flame')}<span>Streak</span></div>
      <div class="tile-num">3<small>wks</small></div>
      <ul class="week">${weekDots}</ul>
    </article>
    <article class="tile last">
      <div class="tile-head">${ic('calendar')}<span>Last time</span></div>
      <div class="last-name">Push A</div>
      <div class="last-meta">Wed · 42 min</div>
      <div class="trend-pill">${ic('trend', 'sm')}+6% volume</div>
    </article>
  </div>
  <div class="days-head"><h2>Your week</h2><span>6-day split</span></div>
  <div class="days">${dayCards}</div>
  <nav class="tabbar">
    <a class="tab on">${ic('home')}<span>Today</span></a>
    <a class="tab">${ic('bars')}<span>History</span></a>
    <a class="tab">${ic('sliders')}<span>Settings</span></a>
  </nav>
</section>`;
}

function stepper(label, unit, value) {
  return `<div class="stepper">
    <div class="st-label">${label}<small>${unit}</small></div>
    <div class="st-row">
      <button class="st-btn" aria-label="Less ${label}">${ic('minus')}</button>
      <output class="st-val">${value}</output>
      <button class="st-btn" aria-label="More ${label}">${ic('plus')}</button>
    </div>
  </div>`;
}

function exercise(d) {
  return `<section class="screen s-ex" id="exercise" aria-label="Exercise">
  ${topbarWorkout(d)}
  <div class="ex-head">
    <h1 class="ex-title">One-Arm Dumbbell Row</h1>
    <div class="ex-meta">Target 8–12 · last 10 × 22.5 kg</div>
  </div>
  <div class="stage">
    <div class="stage-col">
      <div class="set-badge"><span class="set-lbl">Set</span><span class="set-num">1<i>/4</i></span>
        <span class="pips"><i class="cur"></i><i></i><i></i><i></i></span></div>
      <div class="legend"><i></i>Lats · Biceps</div>
      <button class="howto">${ic('help')}How to</button>
    </div>
    <div class="stage-fig">${figure(['lats', 'traps', 'arms'], { back: true })}</div><span class="placeholder-tag">3D viewer</span>
  </div>
  <div class="cue">${ic('speaker')}<p>Elbow to hip, squeeze your back.</p></div>
  ${stepper('Reps', 'count', '12')}
  ${stepper('Weight', 'kg', '22.5')}
  <button class="cta cta-xl">${ic('check')}Set done</button>
</section>`;
}

function rest(d) {
  const R = 118;
  const C = 2 * Math.PI * R;
  return `<section class="screen s-rest" id="rest" aria-label="Rest">
  ${topbarWorkout(d, { rest: true })}
  <div class="timer">
    <svg class="ring" viewBox="0 0 280 280" aria-hidden="true">
      <circle class="ring-bg" cx="140" cy="140" r="${R}"/>
      <circle class="ring-fg" cx="140" cy="140" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * 0.5).toFixed(1)}" transform="rotate(-90 140 140)"/>
    </svg>
    <div class="timer-txt"><span class="timer-lbl">Rest</span><span class="timer-num">1:00</span><span class="timer-sub">of 2:00</span></div>
  </div>
  <div class="timer-btns">
    <button class="ghost">${ic('plus', 'sm')}30 s</button>
    <button class="ghost">${ic('skip', 'sm')}Skip rest</button>
  </div>
  <div class="lastset">
    <div><span class="ls-lbl">Last set</span><span class="ls-val">10 reps × 22.5 kg</span></div>
    <button class="fix">${ic('pencil')}Fix</button>
  </div>
  <article class="next">
    <div class="next-fig">${figure(['lats', 'traps', 'arms'], { back: true })}</div>
    <div class="next-txt">
      <div class="eyebrow">Next · Set 2 of 4</div>
      <div class="next-name">One-Arm Dumbbell Row</div>
      <div class="next-target"><b>10</b> reps × <b>22.5</b> kg</div>
      <div class="next-cue">${ic('speaker', 'sm')}Elbow to hip.</div>
    </div>
  </article>
  <button class="cta cta-xl">${ic('play')}Start set</button>
</section>`;
}

function summary(d) {
  return `<section class="screen s-sum" id="summary" aria-label="Summary">
  <header class="sum-head">
    <div class="burst" aria-hidden="true">${ic('trophy', 'trophy')}</div>
    <div>
      <h1 class="sum-title">Pull A done</h1>
      <div class="sum-sub">Fri 13 Nov · 47 min</div>
    </div>
  </header>
  <article class="vol">
    <div class="vol-lbl">Total volume</div>
    <div class="vol-num">7,420<small>kg</small></div>
    <div class="vol-delta">${ic('trend', 'sm')}+8% vs last Pull A</div>
    <div class="vol-bars" aria-hidden="true">
      <div class="vb"><span>Last</span><i style="--w:86%"></i><b>6,870</b></div>
      <div class="vb now"><span>Today</span><i style="--w:93%"></i><b>7,420</b></div>
    </div>
  </article>
  <h2 class="sec-h">${ic('medal', 'sm')}2 new bests</h2>
  <div class="bests">
    <article class="best"><div class="best-ex">DB Row</div><div class="best-val">12 × 22.5</div><div class="best-was">was 10 × 22.5 kg</div></article>
    <article class="best"><div class="best-ex">Bicep Curl</div><div class="best-val">10 × 12</div><div class="best-was">was 10 × 10 kg</div></article>
  </div>
  <div class="stats">
    <div class="stat"><b>17</b><span>sets</span></div>
    <div class="stat"><b>162</b><span>reps</span></div>
    <div class="stat"><b>4/5</b><span>exercises</span></div>
  </div>
  <div class="work-on">${ic('speaker', 'sm')}<span><b>Next time:</b> curl a little higher on the last reps.</span></div>
  <button class="cta cta-xl">${ic('check')}Done</button>
</section>`;
}

// ---------- CSS ----------
function css(key, d) {
  const t = d.t;
  const base = `
@font-face { font-family: 'GC Display'; src: ${d.font.standIn}; font-weight: ${d.font.displayWeight}; }
/* In the app: @font-face { font-family: 'GC Display'; src: url('/fonts/<file>.woff2') format('woff2'); font-display: swap; } */
:root {
  --bg:${t.bg}; --surface:${t.surface}; --surface-2:${t.surface2}; --line:${t.line};
  --text:${t.text}; --text-2:${t.text2};
  --cta:${t.cta}; --on-cta:${t.onCta}; --success:${t.success}; --on-success:${t.onSuccess};
  --muscle:${t.muscle}; --body:${t.body}; --edge:${t.edge}; --stage-1:${t.stage1}; --stage-2:${t.stage2};
  --cue:${t.cue}; --info:${t.info}; --danger:${t.danger};
  --r-card:${d.radius.card}; --r-btn:${d.radius.btn}; --r-chip:${d.radius.chip};
  --icon-stroke:${d.icon.stroke}; --tap:56px;
  --f-display:'GC Display', 'Arial Narrow', sans-serif; --f-body:${d.font.bodyStack};
  --fs-body:20px; --fs-label:20px; --fs-title:34px; --fs-num:72px; --fs-hero:84px; --fs-timer:132px;
}
* { box-sizing:border-box; margin:0; padding:0; }
html,body { background:#2a2a2e; }
body { font-family:var(--f-body); color:var(--text); font-size:var(--fs-body); -webkit-font-smoothing:antialiased; padding:24px; }
.board { display:flex; gap:24px; align-items:flex-start; width:max-content; }
.frame-cap { font:600 16px system-ui; color:#ccc; margin:0 0 8px; }
.screen { width:390px; height:844px; overflow:hidden; position:relative; background:var(--bg); display:flex; flex-direction:column; gap:12px; padding:12px 16px 16px; }
button { font:inherit; color:inherit; background:none; border:0; cursor:pointer; }
.ic { width:28px; height:28px; flex:none; fill:none; stroke:currentColor; stroke-width:var(--icon-stroke); stroke-linecap:${d.icon.cap}; stroke-linejoin:${d.icon.join}; }
.ic.sm { width:22px; height:22px; } .ic.xs { width:16px; height:16px; stroke-width:3; }
.num, .tile-num, .st-val, .timer-num, .vol-num, .set-num, .hero-title, .best-val, .stat b { font-variant-numeric: tabular-nums; }
h1,h2,.hero-title,.ex-title,.sum-title,.tile-num,.st-val,.timer-num,.vol-num,.set-num,.best-val,.stat b,.next-name,.last-name,.day-name {
  font-family:var(--f-display); font-weight:${d.font.displayWeight}; letter-spacing:${d.font.displayTracking}; line-height:1; }
.eyebrow { font-size:20px; color:var(--text-2); font-weight:600; }

/* figure */
.figure { display:block; height:100%; width:auto; }
.figure .b, .figure .m { stroke:var(--edge); stroke-width:1.6; }
.figure .b { fill:var(--body); }
.figure .m { fill:var(--muscle); stroke:var(--muscle); }

/* buttons */
.cta { min-height:72px; width:100%; border-radius:var(--r-btn); background:var(--cta); color:var(--on-cta); font-family:var(--f-display); font-weight:${d.font.displayWeight};
  font-size:34px; display:flex; align-items:center; justify-content:center; gap:12px; letter-spacing:${d.font.displayTracking}; flex:none; }
.cta .ic { width:30px; height:30px; }
.ghost { min-height:var(--tap); border-radius:var(--r-btn); border:2px solid var(--line); background:var(--surface); font-size:20px; font-weight:600;
  display:flex; align-items:center; justify-content:center; gap:8px; flex:1; color:var(--text); }
.ghost .ic { width:22px; height:22px; color:var(--text-2); }
.sec-row, .timer-btns { display:flex; gap:12px; flex:none; }

/* topbar (workout) */
.topbar { display:flex; gap:8px; flex:none; }
.tb { min-height:60px; min-width:88px; padding:0 8px; border-radius:var(--r-btn); background:var(--surface); border:2px solid var(--line); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
.tb .ic { width:26px; height:26px; }
.tb-lbl { font-size:18px; font-weight:600; color:var(--text-2); letter-spacing:.02em; }
.tb-wide { flex:1; flex-direction:row; justify-content:flex-start; gap:12px; padding:0 14px; }
.tb-txt { display:flex; flex-direction:column; align-items:flex-start; line-height:1.1; }
.tb-txt b { font-size:22px; } .tb-txt small { font-size:17px; color:var(--text-2); font-weight:600; }
.segs { display:flex; gap:6px; flex:none; margin-top:-4px; }
.segs i { flex:1; height:6px; border-radius:3px; background:var(--surface-2); }
.segs i.cur { background:var(--text); }

/* today */
.appbar { display:flex; justify-content:space-between; align-items:center; min-height:44px; flex:none; }
.brand { display:flex; align-items:center; gap:8px; font-family:var(--f-display); font-weight:${d.font.displayWeight}; font-size:28px; letter-spacing:${d.font.displayTracking}; }
.brand-ic { width:32px; height:32px; color:var(--cta); }
.date { font-size:20px; color:var(--text-2); font-weight:600; }
.hero { position:relative; border-radius:var(--r-card); overflow:hidden; padding:16px 18px 18px; display:flex; flex-direction:column; gap:14px; flex:none; }
.hero-txt { position:relative; z-index:1; }
.hero-title { font-size:var(--fs-hero); margin:4px 0 8px; white-space:nowrap; }
.hero-meta { display:flex; gap:16px; font-size:20px; font-weight:600; white-space:nowrap; }
.hero-meta span { display:flex; align-items:center; gap:6px; }
.chips { display:flex; gap:6px; margin-top:12px; flex-wrap:nowrap; }
.chip { font-size:18px; font-weight:700; padding:4px 10px; border-radius:var(--r-chip); white-space:nowrap; }
.hero-fig { position:absolute; z-index:1; height:150px; right:22px; top:20px; }
.hero .cta { position:relative; z-index:1; }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; flex:none; }
.tile { border-radius:var(--r-card); padding:12px 14px; min-height:136px; display:flex; flex-direction:column; gap:6px; }
.tile-head { display:flex; align-items:center; gap:6px; font-size:18px; font-weight:700; }
.tile-head .ic { width:24px; height:24px; }
.tile-num { font-size:64px; display:flex; align-items:baseline; gap:6px; }
.tile-num small { font-size:22px; font-family:var(--f-body); font-weight:700; letter-spacing:0; }
.week { list-style:none; display:flex; justify-content:space-between; margin-top:auto; }
.wd { display:flex; flex-direction:column; align-items:center; gap:2px; }
.wd .dot { width:18px; height:18px; border-radius:50%; display:grid; place-items:center; border:2px solid currentColor; opacity:.55; }
.wd.done .dot { opacity:1; }
.wd.today .dot { opacity:1; border-width:3px; }
.wd .wl { font-size:16px; font-weight:700; opacity:.8; }
.last-name { font-size:36px; margin-top:4px; }
.last-meta { font-size:18px; color:var(--text-2); font-weight:600; }
.trend-pill { margin-top:auto; display:inline-flex; align-items:center; gap:6px; font-size:18px; font-weight:700; color:var(--success); }
.days-head { display:flex; justify-content:space-between; align-items:baseline; flex:none; }
.days-head h2 { font-size:30px; } .days-head span { font-size:18px; color:var(--text-2); font-weight:600; }
.days { display:flex; gap:10px; overflow:hidden; flex:none; margin-right:-16px; }
.day { flex:none; width:104px; height:126px; border-radius:var(--r-card); background:var(--surface); border:2px solid var(--line); padding:8px; display:flex; flex-direction:column; align-items:center; }
.day-fig { height:56px; }
.day-name { font-size:26px; margin-top:6px; white-space:nowrap; }
.day-when { font-size:16px; font-weight:700; color:var(--text-2); display:flex; align-items:center; gap:4px; margin-top:4px; }
.day.is-done .day-when { color:var(--success); }
.day.is-next { border-color:var(--cta); border-width:3px; }
.day.is-next .day-when { color:var(--cta); }
.tabbar { margin:auto -16px -16px; display:flex; border-top:2px solid var(--line); background:var(--surface); flex:none; }
.tab { flex:1; min-height:72px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:18px; font-weight:700; color:var(--text-2); }
.tab.on { color:var(--text); }
.tab.on .ic { color:var(--cta); }

/* exercise */
.ex-title { font-size:var(--fs-title); }
.ex-meta { font-size:20px; color:var(--text-2); margin-top:6px; font-weight:500; }
.stage { position:relative; flex:none; height:224px; border-radius:var(--r-card); overflow:hidden;
  background:radial-gradient(ellipse 60% 75% at 66% 52%, var(--stage-1), var(--stage-2) 75%); border:2px solid var(--line); }
.stage-fig { position:absolute; right:30px; top:32px; bottom:10px; }
.placeholder-tag { position:absolute; right:12px; top:8px; font-size:12px; color:var(--text-2); font-weight:700; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; opacity:.8; }
.stage-col { position:absolute; left:14px; top:10px; bottom:12px; display:flex; flex-direction:column; gap:6px; z-index:1; }
.set-badge { display:flex; flex-direction:column; }
.set-lbl { font-size:20px; font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:.08em; }
.set-num { font-size:var(--fs-num); }
.set-num i { font-style:normal; color:var(--text-2); font-size:.55em; }
.pips { display:flex; gap:6px; margin-top:8px; }
.pips i { width:22px; height:8px; border-radius:4px; background:var(--line); }
.pips i.cur { background:var(--text); }
.legend { margin-top:auto; font-size:18px; font-weight:700; display:flex; align-items:center; gap:8px; }
.legend i { width:14px; height:14px; border-radius:50%; background:var(--muscle); }
.howto { align-self:flex-start; min-height:var(--tap); padding:0 14px; border-radius:var(--r-btn); background:var(--surface-2); border:2px solid var(--line); display:flex; align-items:center; gap:8px; font-size:20px; font-weight:700; }
.howto .ic { color:var(--info); }
.cue { display:flex; gap:12px; align-items:center; padding:12px 14px; border-radius:var(--r-btn); background:var(--surface); border-left:6px solid var(--cue); flex:none; }
.cue .ic { color:var(--cue); }
.cue p { font-size:22px; font-weight:600; line-height:1.25; font-style:normal; }
.stepper { flex:none; }
.st-label { font-size:20px; font-weight:700; color:var(--text-2); display:flex; gap:8px; align-items:baseline; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
.st-label small { font-size:17px; text-transform:none; letter-spacing:0; font-weight:600; opacity:.85; }
.st-row { display:grid; grid-template-columns:80px 1fr 80px; align-items:center; gap:12px; }
.st-btn { height:68px; border-radius:var(--r-btn); background:var(--surface-2); border:2px solid var(--line); display:grid; place-items:center; }
.st-btn .ic { width:32px; height:32px; stroke-width:3; }
.st-val { font-size:var(--fs-num); text-align:center; }

/* rest */
.timer { position:relative; width:272px; height:272px; align-self:center; flex:none; }
.ring { width:100%; height:100%; }
.ring circle { fill:none; stroke-width:16; }
.ring-bg { stroke:var(--surface-2); }
.ring-fg { stroke:var(--text); stroke-linecap:round; }
.timer-txt { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.timer-lbl { font-size:22px; font-weight:800; letter-spacing:.2em; text-transform:uppercase; color:var(--text-2); }
.timer-num { font-size:var(--fs-timer); margin:2px 0; }
.timer-sub { font-size:20px; color:var(--text-2); font-weight:600; }
.lastset { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 8px 8px 16px; border-radius:var(--r-btn); background:var(--surface); border:2px solid var(--line); flex:none; }
.lastset > div { display:flex; flex-direction:column; }
.ls-lbl { font-size:17px; color:var(--text-2); font-weight:700; }
.ls-val { font-size:22px; font-weight:700; }
.fix { min-height:var(--tap); padding:0 16px; border-radius:var(--r-btn); background:var(--surface-2); display:flex; align-items:center; gap:8px; font-size:20px; font-weight:700; }
.fix .ic { width:22px; height:22px; color:var(--info); }
.next { display:grid; grid-template-columns:84px 1fr; gap:12px; padding:12px; border-radius:var(--r-card); background:var(--surface); flex:none;
  }
.next-fig { height:148px; border-radius:calc(var(--r-card) - 8px); background:radial-gradient(ellipse at 50% 50%, var(--stage-1), var(--stage-2)); display:grid; place-items:center; padding:6px 0; }
.next-name { font-size:30px; margin:4px 0 6px; }
.next-target { font-size:22px; color:var(--text-2); font-weight:600; }
.next-target b { color:var(--text); font-size:26px; }
.next-cue { margin-top:8px; display:flex; gap:6px; align-items:center; font-size:20px; font-weight:600; color:var(--cue); }
.s-rest .cta, .s-ex .cta { margin-top:auto; }

/* summary */
.sum-head { display:flex; gap:14px; align-items:center; flex:none; padding-top:8px; }
.burst { width:76px; height:76px; flex:none; border-radius:50%; display:grid; place-items:center; }
.trophy { width:48px; height:48px; stroke-width:2.25; }
.sum-title { font-size:48px; }
.sum-sub { font-size:20px; color:var(--text-2); font-weight:600; margin-top:4px; }
.vol { border-radius:var(--r-card); background:var(--surface); padding:16px; flex:none; }
.vol-lbl { font-size:20px; font-weight:700; color:var(--text-2); }
.vol-num { font-size:var(--fs-num); display:flex; align-items:baseline; gap:8px; margin:4px 0; }
.vol-num small { font-size:26px; font-family:var(--f-body); font-weight:700; color:var(--text-2); letter-spacing:0; }
.vol-delta { display:inline-flex; align-items:center; gap:6px; font-size:20px; font-weight:800; color:var(--success); }
.vol-bars { margin-top:10px; display:flex; flex-direction:column; gap:8px; }
.vb { display:grid; grid-template-columns:62px 1fr 64px; align-items:center; gap:8px; font-size:17px; font-weight:700; color:var(--text-2); }
.vb i { height:14px; width:var(--w); border-radius:7px; background:var(--line); }
.vb.now i { background:var(--success); }
.vb.now { color:var(--text); }
.vb b { text-align:right; }
.sec-h { font-size:28px; display:flex; align-items:center; gap:8px; flex:none; }
.sec-h .ic { color:var(--success); width:28px; height:28px; }
.bests { display:grid; grid-template-columns:1fr 1fr; gap:12px; flex:none; }
.best { border-radius:var(--r-card); padding:12px 14px; background:var(--surface); border:2px solid var(--success); }
.best-ex { font-size:18px; font-weight:700; color:var(--text-2); }
.best-val { font-size:38px; margin:4px 0; white-space:nowrap; }
.best-was { font-size:16px; color:var(--text-2); font-weight:600; }
.stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; flex:none; }
.stat { display:flex; flex-direction:column; align-items:center; padding:10px 0; border-radius:var(--r-btn); background:var(--surface); }
.stat b { font-size:40px; } .stat span { font-size:17px; color:var(--text-2); font-weight:700; }
.work-on { display:flex; gap:10px; align-items:flex-start; font-size:20px; line-height:1.3; color:var(--text-2); flex:none; }
.work-on .ic { color:var(--cue); margin-top:2px; }
.work-on b { color:var(--text); }
.s-sum .cta { margin-top:auto; }

/* motion (idea only; screenshots are static) */
@media (prefers-reduced-motion: no-preference) {
  .cta { transition: transform .15s ease-out; }
  .cta:active { transform: scale(.97); }
}
`;
  return base + directionCss[key](d);
}

const directionCss = {
  energy: (d) => `
/* ENERGY: solid colour blocks */
.hero { background:var(--cta); color:var(--on-cta); }
.hero .eyebrow { color:var(--on-cta); opacity:.85; }
.hero-deco { position:absolute; right:-60px; top:-40px; width:240px; height:240px; border-radius:50%; background:#FF9A4D; }
.hero-deco::after { content:''; position:absolute; left:40px; top:200px; width:160px; height:160px; border-radius:50%; background:#FF8A33; }
.hero .chip { background:rgba(26,11,0,.14); color:var(--on-cta); }
.hero .figure .b { fill:#C25A12; stroke:#7A3A0E; } .hero .figure .m { fill:var(--on-cta); stroke:var(--on-cta); }
.hero .cta { background:var(--on-cta); color:#FFF7F0; }
.hero .cta .ic { color:var(--cta); }
.tile.streak { background:var(--success); color:var(--on-success); }
.tile.last { background:var(--surface-2); }
.tile.last .trend-pill { color:var(--success); }
.wd .dot { color:var(--on-success); }
.wd.done .dot { background:var(--on-success); color:var(--success); }
.segs i.cur { background:var(--cta); }
.ring-fg { stroke:var(--cta); }
.pips i.cur { background:var(--cta); }
.cue { border-left:0; background:var(--surface-2); border-radius:var(--r-btn); }
.cue .ic { background:var(--cue); color:#1E1500; border-radius:50%; padding:7px; width:44px; height:44px; }
.burst { background:var(--success); color:var(--on-success); box-shadow:0 0 0 8px rgba(59,227,139,.18); }
.best { background:var(--success); color:var(--on-success); border:0; }
.best .best-ex, .best .best-was { color:var(--on-success); opacity:.85; }
.vol { background:var(--surface-2); }
@media (prefers-reduced-motion: no-preference) {
  .hero-deco { animation: drift 6s ease-in-out infinite alternate; }
  @keyframes drift { to { transform: translate(-14px, 10px) scale(1.04); } }
}
`,
  pro: (d) => `
/* PRO: graphite surfaces, hairlines, a single volt accent */
.hero { background:var(--surface); border:1px solid var(--line); }
.hero::before { content:''; position:absolute; left:0; top:0; bottom:0; width:6px; background:var(--cta); }
.hero-deco { position:absolute; right:-30px; top:0; width:200px; height:100%; background:radial-gradient(ellipse at 50% 45%, var(--stage-1), transparent 70%); }
.hero .chip { background:var(--surface-2); color:var(--text); border:1px solid var(--line); }
.hero .chip:first-child { color:var(--muscle); }
.tile { background:var(--surface); border:1px solid var(--line); }
.tile.streak .tile-head .ic { color:var(--success); }
.tile.last .tile-head .ic { color:var(--text-2); }
.wd .dot { color:var(--text-2); }
.wd.done .dot { background:var(--success); border-color:var(--success); color:var(--on-success); }
.wd.today .dot { color:var(--cta); }
.trend-pill { color:var(--success); }
.day { border-width:1px; }
.day.is-done .day-when { color:var(--success); }
.tb, .ghost, .st-btn, .howto, .lastset, .stage { border-width:1px; }
.segs i { height:4px; } .segs i.cur { background:var(--cta); }
.ring circle { stroke-width:10; }
.timer-num { font-size:108px; }
.best-val { font-size:34px; }
.ring-fg { stroke:var(--cta); }
.pips i.cur { background:var(--cta); }
.burst { background:radial-gradient(circle, rgba(255,201,77,.25), transparent 70%); color:var(--success); }
.best { border:1px solid var(--line); box-shadow:inset 0 4px 0 var(--success); }
.best-val { color:var(--success); }
.vol { border:1px solid var(--line); }
@media (prefers-reduced-motion: no-preference) {
  .ring-fg { transition: stroke-dashoffset 1s linear; }
}
`,
  track: (d) => `
/* TRACK: scoreboard — black, ruled lanes, condensed caps, signal yellow */
.screen { gap:10px; }
.ex-title { font-size:30px; }
.timer-num { font-size:96px; }
.hero-title { font-size:72px !important; }
.sum-title { font-size:40px; white-space:nowrap; }
.best-val { font-size:32px; }
.s-today { gap:8px; }
.tb-lbl { text-transform:none; letter-spacing:.02em; }
.s-sum .stat { padding:6px 0; }
.eyebrow, .tile-head, .days-head span, .set-lbl, .st-label, .vol-lbl, .ls-lbl, .best-ex, .tab, .date { text-transform:uppercase; letter-spacing:.08em; }
.hero-title, .ex-title, .sum-title, .next-name, .day-name, .last-name, .days-head h2, .sec-h, .brand, .cta { text-transform:uppercase; }
.hero-title { font-size:80px; }
.hero { background:var(--surface); border-top:6px solid var(--cta); border-radius:var(--r-card); }
.hero-deco { position:absolute; inset:0; background:repeating-linear-gradient(0deg, transparent 0 46px, rgba(255,255,255,.06) 46px 48px); }
.hero .chip { border:2px solid var(--muscle); color:var(--text); }
.tile { background:var(--surface); border:2px solid var(--line); }
.tile-num { color:var(--text); }
.tile.streak .tile-head .ic { color:var(--cta); }
.wd .dot { border-radius:2px; color:var(--text-2); }
.wd.done .dot { background:var(--success); border-color:var(--success); color:var(--on-success); }
.wd.today .dot { color:var(--cta); }
.day { border-radius:var(--r-card); }
.tab.on { box-shadow: inset 0 4px 0 var(--cta); }
.segs i { border-radius:0; height:8px; } .segs i.cur { background:var(--cta); }
.pips i { border-radius:0; } .pips i.cur { background:var(--cta); }
.set-num, .st-val, .timer-num, .vol-num { color:var(--text); }
.stage { background:radial-gradient(ellipse 60% 75% at 66% 52%, var(--stage-1), var(--stage-2) 75%), var(--stage-2); }
.stage::before { content:''; position:absolute; inset:0; background:repeating-linear-gradient(90deg, transparent 0 62px, rgba(255,255,255,.05) 62px 64px); }
.st-row { gap:0; border:2px solid var(--line); border-radius:var(--r-btn); overflow:hidden; }
.st-btn { border:0; border-radius:0; height:76px; }
.st-val { background:#000; height:76px; display:grid; place-items:center; border-left:2px solid var(--line); border-right:2px solid var(--line); }
.cue { border-left:6px solid var(--cue); border-radius:var(--r-btn); }
.ring circle { stroke-width:18; }
.ring-bg { stroke:var(--surface-2); stroke-dasharray:4 8; }
.ring-fg { stroke:var(--cta); stroke-linecap:butt; }
.timer-num { color:var(--cta); }
.burst { background:var(--cta); color:var(--on-cta); border-radius:var(--r-card); }
.best { border:2px solid var(--success); }
.best-val { color:var(--success); }
.vol { border-top:6px solid var(--success); }
.vb i { border-radius:0; }
.stat { border:2px solid var(--line); background:transparent; }
.stat b { color:var(--text); }
@media (prefers-reduced-motion: no-preference) {
  .timer-num { animation: none; }
  .tile-num { transition: transform .2s; }
}
`,
};

function page(key, d) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gym Clean M4e — ${d.name}</title>
<style>${css(key, d)}</style>
</head>
<body class="dir-${key}">
${sprite}
<div class="board">
  <div><p class="frame-cap">${d.name} · Today</p>${today(d)}</div>
  <div><p class="frame-cap">${d.name} · Exercise</p>${exercise(d)}</div>
  <div><p class="frame-cap">${d.name} · Rest</p>${rest(d)}</div>
  <div><p class="frame-cap">${d.name} · Summary</p>${summary(d)}</div>
</div>
</body>
</html>
`;
}

function sheet(key, d, table) {
  const t = d.t;
  const sw = [
    ['bg', t.bg], ['surface', t.surface], ['surface-2', t.surface2], ['text', t.text], ['text-2', t.text2],
    ['cta', t.cta], ['success', t.success], ['muscle', t.muscle], ['cue', t.cue], ['danger', t.danger],
  ];
  const rows = table
    .map((r) => `<tr><td>${r.pair}</td><td>${r.fg} / ${r.bg}</td><td class="${r.pass ? 'ok' : 'bad'}">${r.ratio.toFixed(2)}:1</td><td>${r.need}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${d.name} sheet</title>
<style>${css(key, d)}
html, body { background:${t.bg}; } body { padding:32px; width:1760px; }
.sh-head { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:24px; }
.sh-head h1 { font-size:84px; text-transform:none; }
.sh-head p { font-size:24px; color:var(--text-2); max-width:760px; margin-top:8px; }
.shots { display:flex; gap:24px; }
.shots figure { display:flex; flex-direction:column; gap:8px; }
.shots img { width:390px; height:844px; border-radius:28px; outline:2px solid var(--line); }
.shots figcaption { font-size:20px; font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:.08em; }
.meta { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:32px; margin-top:28px; }
.sw { display:flex; flex-wrap:wrap; gap:10px; }
.sw div { width:96px; } .sw i { display:block; height:56px; border-radius:10px; border:1px solid var(--line); }
.sw span { font-size:14px; color:var(--text-2); display:block; margin-top:4px; font-family:ui-monospace,monospace; }
table { border-collapse:collapse; font-size:15px; width:100%; }
td { padding:3px 8px 3px 0; color:var(--text-2); font-family:ui-monospace,monospace; } td:first-child { font-family:var(--f-body); color:var(--text); }
td.ok { color:var(--success); font-weight:700; } td.bad { color:var(--danger); font-weight:700; }
.type .d1 { font-family:var(--f-display); font-weight:${d.font.displayWeight}; font-size:132px; line-height:1; }
.type .d2 { font-family:var(--f-display); font-weight:${d.font.displayWeight}; font-size:34px; }
.type p { font-size:20px; color:var(--text-2); margin-top:6px; }
.icons { display:flex; flex-wrap:wrap; gap:14px; margin-top:16px; color:var(--text); }
.icons .ic { width:36px; height:36px; }
h3 { font-size:22px; margin-bottom:12px; font-family:var(--f-display); text-transform:uppercase; letter-spacing:.06em; color:var(--text-2); }
</style></head><body>${sprite}
<div class="sh-head"><div><h1>${d.name}</h1><p>${d.tagline}</p></div>
<p style="text-align:right;font-size:18px">Display: ${d.font.display} (${d.font.displayLicence})<br>Body: ${d.font.body} (SIL OFL 1.1)<br>Mockup stand-in: ${d.font.standInName}</p></div>
<div class="shots">
${['today', 'exercise', 'rest', 'summary'].map((s) => `<figure><img src="../${key}-${s}.png" alt="${s}"><figcaption>${s}</figcaption></figure>`).join('')}
</div>
<div class="meta">
  <div><h3>Palette</h3><div class="sw">${sw.map(([n, c]) => `<div><i style="background:${c}"></i><span>${n}<br>${c}</span></div>`).join('')}</div>
    <h3 style="margin-top:20px">Icons (original, ${d.icon.stroke}px ${d.icon.cap})</h3>
    <div class="icons">${['play', 'pause', 'camera', 'list', 'sliders', 'bars', 'home', 'flame', 'trophy', 'medal', 'check', 'skip', 'flag', 'speaker', 'help', 'timer', 'trend', 'pencil', 'clock', 'dumbbell'].map((n) => ic(n)).join('')}</div></div>
  <div class="type"><h3>Type</h3><div class="d1">1:00 · 22.5</div><div class="d2">One-Arm Dumbbell Row</div><p>Body 20px — Elbow to hip, squeeze your back.</p></div>
  <div><h3>Contrast (WCAG)</h3><table>${rows}</table></div>
</div>
</body></html>`;
}

const contrast = {};
for (const [key, d] of Object.entries(directions)) {
  const table = pairs(d.t).map(([pair, fg, bg, kind]) => {
    const r = ratio(fg, bg);
    const need = kind === 'text' ? 4.5 : 3;
    return { pair, fg, bg, ratio: r, need: `≥ ${need}`, pass: r >= need };
  });
  contrast[key] = table;
  writeFileSync(join(OUT, `${key}.html`), page(key, d));
  writeFileSync(join(OUT, '_src', `${key}-sheet.html`), sheet(key, d, table));
  const fails = table.filter((r) => !r.pass);
  console.log(key, fails.length ? `FAILS: ${fails.map((f) => `${f.pair} ${f.ratio}`).join('; ')}` : 'all pairs pass');
}
writeFileSync(join(OUT, '_src', 'contrast.json'), JSON.stringify(contrast, null, 2));
