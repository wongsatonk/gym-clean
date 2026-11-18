// M4e step 1b: the MIX. One app, three moods: Energy (Today, Summary), Pro (Exercise, camera,
// Settings), Track (Rest, later History). Builds mix.html (six 390x844 screens), the comparison
// sheet and contrast.json. Run: node docs/design/m4e-mix/_src/build.mjs  (then shoot.mjs)
// Everything is inline: no external requests, original SVG art only.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = join(SRC, '..');

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

// ---------- shared foundation (one set for the whole app) ----------
const T = {
  bg: '#0D0F12', surface: '#16191E', surface2: '#20242B', line: '#323842',
  text: '#F2F4F7', text2: '#A9B1BC',
  cta: '#FF7A1A', onCta: '#1A0B00', // ACTION: filled = press this; stroke/dot = where you are now
  success: '#3BE38B', onSuccess: '#06210F', // DONE: achieved things (streak, bests, volume up, done days)
  muscle: '#35C8FF', body: '#3A424D', edge: '#8D98A6', stage1: '#2A313B', stage2: '#16191E', // MUSCLE only
  cue: '#C5B3FF', // SPOKEN cue marker
  danger: '#FF6B6B', // confirmations only, always with icon + words
};
// ---------- per-screen mood accents (only these differ between screens) ----------
const MOODS = {
  energy: {
    name: 'Energy', screens: 'Today, Summary',
    why: 'Moments that should make you want to train or feel rewarded. Loud colour blocks, big rounded cards.',
    t: { ember: '#3D1C0A', emberHi: '#5A2A0E', ring: '#FF7A1A' },
    radius: '24px', line: '2px',
  },
  pro: {
    name: 'Pro', screens: 'Exercise, Camera, Settings (+ Pause sheet, exercise list)',
    why: 'Mid-set and admin screens. Calm graphite, hairlines, one orange thing glows: the button to press.',
    t: {},
    radius: '20px', line: '1px',
  },
  track: {
    name: 'Track', screens: 'Rest (+ History/stats when they exist)',
    why: 'Numbers first. OLED black, ruled lanes, condensed caps labels, a scoreboard countdown.',
    t: { bgDeep: '#000000', rule: '#3A3A3A' },
    radius: '8px', line: '2px',
  },
};

const pairs = [
  // shared, every screen
  ['shared', 'text on bg', T.text, T.bg, 'text'],
  ['shared', 'text on surface-2', T.text, T.surface2, 'text'],
  ['shared', 'text-2 on bg', T.text2, T.bg, 'text'],
  ['shared', 'text-2 on surface', T.text2, T.surface, 'text'],
  ['shared', 'text-2 on surface-2', T.text2, T.surface2, 'text'],
  ['shared', 'on-cta on cta (button label)', T.onCta, T.cta, 'text'],
  ['shared', 'cta on bg (now marker, tab icon)', T.cta, T.bg, 'text'],
  ['shared', 'cta on surface (Next day label)', T.cta, T.surface, 'text'],
  ['shared', 'on-success on success (green block)', T.onSuccess, T.success, 'text'],
  ['shared', 'success on surface', T.success, T.surface, 'text'],
  ['shared', 'cue on surface', T.cue, T.surface, 'text'],
  ['shared', 'cue on surface-2', T.cue, T.surface2, 'text'],
  ['shared', 'danger on bg', T.danger, T.bg, 'text'],
  ['shared', 'bg on text (selected segment / switch on)', T.bg, T.text, 'text'],
  ['shared', 'muscle on body (3D/2D highlight)', T.muscle, T.body, 'large'],
  ['shared', 'figure rim (edge) on stage', T.edge, T.stage2, 'large'],
  ['shared', 'figure rim (edge) on lit stage', T.edge, T.stage1, 'large'],
  ['shared', 'cta button edge on bg', T.cta, T.bg, 'large'],
  // energy
  ['energy', 'text on ember (hero)', T.text, MOODS.energy.t.ember, 'text'],
  ['energy', 'text on ember highlight', T.text, MOODS.energy.t.emberHi, 'text'],
  ['energy', 'text-2 on ember highlight', T.text2, MOODS.energy.t.emberHi, 'text'],
  ['energy', 'cta button edge on ember highlight', T.cta, MOODS.energy.t.emberHi, 'large'],
  ['energy', 'figure rim (edge) on ember', T.edge, MOODS.energy.t.ember, 'large'],
  ['energy', 'muscle on ember (chip text)', T.muscle, MOODS.energy.t.ember, 'text'],
  // track
  ['track', 'text on black', T.text, MOODS.track.t.bgDeep, 'text'],
  ['track', 'text-2 on black', T.text2, MOODS.track.t.bgDeep, 'text'],
  ['track', 'cta on black (ring, now)', T.cta, MOODS.track.t.bgDeep, 'text'],
  ['track', 'cue on black', T.cue, MOODS.track.t.bgDeep, 'text'],
  ['track', 'rule on black (lanes, non-text)', MOODS.track.t.rule, MOODS.track.t.bgDeep, 'deco'],
];

// ---------- original icon set: ONE geometry, ONE stroke (2.25px, round caps) ----------
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
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  flip: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.3-1.6-1.3-2.8 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.2" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  ruler: '<path d="M4 15.5L15.5 4 20 8.5 8.5 20z"/><path d="M8 12l2 2M10.5 9.5l1.5 1.5M13 7l2 2"/>',
};
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(ICONS)
  .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
  .join('')}</svg>`;
const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// ---------- original body figure placeholder (stands in for the 3D viewer) ----------
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

// Original stick skeleton for the camera placeholder: side view, one-arm row, mid-pull.
function skeleton() {
  const J = {
    head: [88, 146], neck: [112, 170], hip: [222, 192], knee: [204, 264], ankle: [256, 264],
    knee2: [244, 290], ankle2: [238, 384], sh: [118, 172], el: [164, 148], wr: [152, 214],
    supSh: [110, 174], supEl: [100, 222], supWr: [96, 264],
  };
  const seg = (a, b, cls = '') => `<line class="${cls}" x1="${J[a][0]}" y1="${J[a][1]}" x2="${J[b][0]}" y2="${J[b][1]}"/>`;
  const dot = (a, cls = '') => `<circle class="${cls}" cx="${J[a][0]}" cy="${J[a][1]}" r="7"/>`;
  return `<svg class="skel" viewBox="40 120 240 276" aria-hidden="true">
    <rect class="bench" x="60" y="272" width="210" height="16" rx="4"/><path class="bench" d="M84 288v96M246 288v96"/>
    <g class="bones">
      ${seg('neck', 'hip')}${seg('hip', 'knee')}${seg('knee', 'ankle')}${seg('hip', 'knee2')}${seg('knee2', 'ankle2')}
      ${seg('supSh', 'supEl')}${seg('supEl', 'supWr')}
      ${seg('sh', 'el', 'work')}${seg('el', 'wr', 'work')}
    </g>
    <circle class="headc" cx="${J.head[0]}" cy="${J.head[1]}" r="18"/>
    <g class="joints">${['neck', 'hip', 'knee', 'ankle', 'knee2', 'ankle2', 'supEl', 'supWr'].map((j) => dot(j)).join('')}
      ${dot('sh', 'work')}${dot('el', 'work')}${dot('wr', 'work')}</g>
    <rect class="db" x="134" y="210" width="36" height="16" rx="5"/>
  </svg>`;
}

// ---------- data ----------
const days = [
  ['Push A', ['chest', 'delts', 'arms'], false, 'Mon', 'done'],
  ['Pull A', ['lats', 'traps', 'arms'], true, 'Next', 'next'],
  ['Legs A', ['quads', 'calves'], false, 'Sat', ''],
  ['Push B', ['chest', 'delts'], false, 'Sun', ''],
  ['Pull B', ['lats', 'arms'], true, '—', ''],
  ['Legs B', ['quads', 'calves'], false, '—', ''],
];
const week = [['M', 'done'], ['T', 'rest'], ['W', 'done'], ['T', 'rest'], ['F', 'today'], ['S', ''], ['S', '']];

// ---------- shared components (identical on every screen: the cohesion anchors) ----------
function topbarWorkout({ rest = false } = {}) {
  const left = `<button class="tb tb-wide" aria-label="Workout list">${ic('list')}<span class="tb-txt"><b>Pull A</b><small>1 of 5</small></span></button>`;
  const cam = rest ? '' : `<button class="tb">${ic('camera')}<span class="tb-lbl">Camera</span></button>`;
  const pause = `<button class="tb">${ic('pause')}<span class="tb-lbl">Pause</span></button>`;
  const segs = [1, 2, 3, 4, 5].map((i) => `<i class="${i === 1 ? 'cur' : ''}"></i>`).join('');
  return `<header class="topbar">${left}${cam}${pause}</header><div class="segs" aria-label="Exercise 1 of 5">${segs}</div>`;
}
const tabbar = (on) => `<nav class="tabbar">
    <a class="tab ${on === 'today' ? 'on' : ''}">${ic('home')}<span>Today</span></a>
    <a class="tab ${on === 'history' ? 'on' : ''}">${ic('bars')}<span>History</span></a>
    <a class="tab ${on === 'settings' ? 'on' : ''}">${ic('sliders')}<span>Settings</span></a>
  </nav>`;
const cta = (icon, label) => `<button class="cta">${ic(icon)}${label}</button>`;
const cue = (text) => `<div class="cue">${ic('speaker')}<p>${text}</p></div>`;

// ---------- screens ----------
function today() {
  const dayCards = days.map(([n, r, back, when, st]) => `<article class="day is-${st}">
        <div class="day-fig">${figure(r, { back })}</div>
        <div class="day-name">${n}</div>
        <div class="day-when">${st === 'done' ? ic('check', 'xs') : ''}${when}</div>
      </article>`).join('');
  const weekDots = week.map(([l, s]) => `<li class="wd ${s}"><span class="dot">${s === 'done' ? ic('check', 'xs') : ''}</span><span class="wl">${l}</span></li>`).join('');
  return `<section class="screen s-today mood-energy" id="today" aria-label="Today">
  <header class="appbar">
    <div class="brand">${ic('logo', 'brand-ic')}<span>Gym Clean</span></div>
    <div class="date">Fri 13 Nov</div>
  </header>
  <article class="hero">
    <svg class="hero-rings" viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="112"/><circle cx="120" cy="120" r="84"/><circle cx="120" cy="120" r="56"/></svg>
    <div class="hero-txt">
      <div class="eyebrow">Next up · Day 2 of 6</div>
      <h1 class="hero-title">Pull A</h1>
      <div class="hero-meta"><span>${ic('dumbbell', 'sm')}5 exercises</span><span>${ic('clock', 'sm')}~45 min</span></div>
      <div class="chips"><span class="chip">Back</span><span class="chip">Biceps</span><span class="chip">Rear delts</span></div>
    </div>
    <div class="hero-fig">${figure(['lats', 'traps', 'arms'], { back: true })}</div>
    ${cta('play', 'Start workout')}
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
  ${tabbar('today')}
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

function exercise() {
  return `<section class="screen s-ex mood-pro" id="exercise" aria-label="Exercise">
  ${topbarWorkout()}
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
  ${cue('Elbow to hip, squeeze your back.')}
  ${stepper('Reps', 'count', '12')}
  ${stepper('Weight', 'kg', '22.5')}
  ${cta('check', 'Set done')}
</section>`;
}

function camera() {
  return `<section class="screen s-cam mood-pro" id="camera" aria-label="Camera">
  <header class="topbar">
    <div class="tb tb-wide cam-title"><span class="tb-txt"><b>DB Row · Set 1 of 4</b><small>Left arm · side view</small></span></div>
    <button class="tb">${ic('close')}<span class="tb-lbl">Close</span></button>
  </header>
  <div class="cam-view">
    <div class="cam-floor" aria-hidden="true"></div>
    ${skeleton()}
    <span class="placeholder-tag">camera feed</span>
    <div class="hud">
      <div class="rep"><span class="rep-num">7</span><span class="rep-of">/ 12</span></div>
      <div class="rep-lbl">reps</div>
    </div>
    <div class="gauge" aria-hidden="true">
      <span class="g-lbl">Range</span>
      <div class="g-track"><i class="g-target"></i><i class="g-fill"></i><i class="g-now"></i></div>
    </div>
    <div class="cam-foot">
      <span class="cam-chip">${ic('lock', 'sm')}On device</span>
      <button class="cam-icon" aria-label="Switch camera">${ic('flip')}</button>
    </div>
  </div>
  ${cue('Slow the lowering.')}
  ${cta('check', 'Set done')}
</section>`;
}

function rest() {
  const R = 118;
  const C = 2 * Math.PI * R;
  return `<section class="screen s-rest mood-track" id="rest" aria-label="Rest">
  ${topbarWorkout({ rest: true })}
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
  ${cta('play', 'Start set')}
</section>`;
}

function summary() {
  return `<section class="screen s-sum mood-energy" id="summary" aria-label="Summary">
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
  ${cta('check', 'Done')}
</section>`;
}

const sw = (on, label) => `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}"><span class="sw-lbl">${label}</span><span class="sw-state"><span class="sw-txt">${on ? 'On' : 'Off'}</span><i class="knob"></i></span></button>`;
const seg = (opts, sel, label) => `<div class="segmented" role="group" aria-label="${label}">${opts.map((o) => `<button class="${o === sel ? 'sel' : ''}" aria-pressed="${o === sel}">${o === sel ? ic('check', 'sm') : ''}${o}</button>`).join('')}</div>`;

function settings() {
  const accents = [['Orange', T.cta, true], ['Volt', '#C8F31D', false], ['Yellow', '#FFD60A', false]];
  return `<section class="screen s-set mood-pro" id="settings" aria-label="Settings">
  <header class="appbar"><h1 class="page-title">Settings</h1></header>
  <div class="scroll">
    <p class="field-label">${ic('palette', 'sm')}Accent colour</p>
    <div class="accents" role="radiogroup" aria-label="Accent colour">${accents.map(([n, c, s]) => `<button class="acc ${s ? 'sel' : ''}" role="radio" aria-checked="${s}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>
    <p class="field-label">${ic('speaker', 'sm')}Voice</p>
    ${sw(true, 'Count reps out loud')}
    ${sw(true, 'Coach tips after a set')}
    <p class="sub-label">Coach voice style</p>
    ${seg(['Calm', 'Drill sergeant'], 'Drill sergeant', 'Coach voice style')}
    <p class="sub-label">Rudeness</p>
    ${seg(['Tough', 'Rude', 'Savage'], 'Rude', 'Rudeness')}
    <p class="field-label">${ic('camera', 'sm')}Camera sets</p>
    ${sw(false, 'Hands-free sets')}
    <p class="field-label">${ic('ruler', 'sm')}Weight unit</p>
    ${seg(['kg', 'lb'], 'kg', 'Weight unit')}
  </div>
  ${tabbar('settings')}
</section>`;
}

// ---------- CSS ----------
function css() {
  return `
@font-face { font-family:'GC Display'; src: local('DINCondensed-Bold'), local('DIN Condensed Bold'); font-weight:700; }
/* In the app: Barlow Condensed 700 (+800 for Track caps) and Barlow 400/600/700, self-hosted .woff2, font-display:swap. */
:root {
  /* shared foundation: identical on every screen */
  --bg:${T.bg}; --surface:${T.surface}; --surface-2:${T.surface2}; --line:${T.line};
  --text:${T.text}; --text-2:${T.text2};
  --cta:${T.cta}; --on-cta:${T.onCta}; --success:${T.success}; --on-success:${T.onSuccess};
  --muscle:${T.muscle}; --body:${T.body}; --edge:${T.edge}; --stage-1:${T.stage1}; --stage-2:${T.stage2};
  --cue:${T.cue}; --info:${T.text2}; --danger:${T.danger};
  --r-btn:14px; --tap:56px; --cta-h:72px;
  --icon-stroke:2.25; --ic-sm:22px; --ic-md:28px; --ic-lg:32px;
  --f-display:'GC Display', 'Arial Narrow', sans-serif;
  --f-body:'Barlow', 'Avenir Next', system-ui, -apple-system, sans-serif;
  --fs-label:18px; --fs-body:20px; --fs-cue:22px; --fs-title:34px; --fs-num:72px; --fs-hero:84px; --fs-timer:132px;
  /* mood defaults (Pro) */
  --r-card:${MOODS.pro.radius}; --bw:${MOODS.pro.line};
}
.mood-energy { --r-card:${MOODS.energy.radius}; --bw:${MOODS.energy.line}; --ember:${MOODS.energy.t.ember}; --ember-hi:${MOODS.energy.t.emberHi}; }
.mood-pro { --r-card:${MOODS.pro.radius}; --bw:${MOODS.pro.line}; }
.mood-track { --r-card:${MOODS.track.radius}; --bw:${MOODS.track.line}; --bg:${MOODS.track.t.bgDeep}; --line:${MOODS.track.t.rule}; }

* { box-sizing:border-box; margin:0; padding:0; }
html,body { background:#2a2a2e; }
body { font-family:var(--f-body); color:var(--text); font-size:var(--fs-body); -webkit-font-smoothing:antialiased; padding:24px; }
.board { display:flex; gap:24px; align-items:flex-start; width:max-content; }
.frame-cap { font:600 16px system-ui; color:#ccc; margin:0 0 8px; }
.screen { width:390px; height:844px; overflow:hidden; position:relative; background:var(--bg); display:flex; flex-direction:column; gap:12px; padding:12px 16px 16px; }
button { font:inherit; color:inherit; background:none; border:0; cursor:pointer; }
.ic { width:var(--ic-md); height:var(--ic-md); flex:none; fill:none; stroke:currentColor; stroke-width:var(--icon-stroke); stroke-linecap:round; stroke-linejoin:round; }
.ic.sm { width:var(--ic-sm); height:var(--ic-sm); } .ic.xs { width:16px; height:16px; stroke-width:3; }
.tile-num, .st-val, .timer-num, .vol-num, .set-num, .best-val, .stat b, .rep-num { font-variant-numeric:tabular-nums; }
h1,h2,.hero-title,.ex-title,.sum-title,.tile-num,.st-val,.timer-num,.vol-num,.set-num,.best-val,.stat b,.next-name,.last-name,.day-name,.page-title,.rep-num,.rep-of {
  font-family:var(--f-display); font-weight:700; letter-spacing:.01em; line-height:1; }
.eyebrow { font-size:var(--fs-body); color:var(--text-2); font-weight:600; }
.placeholder-tag { position:absolute; right:12px; top:8px; font-size:12px; color:var(--text-2); font-weight:700; letter-spacing:.08em; text-transform:uppercase; opacity:.8; z-index:3; }

/* figure: the same colours on every screen */
.figure { display:block; height:100%; width:auto; }
.figure .b, .figure .m { stroke:var(--edge); stroke-width:1.6; }
.figure .b { fill:var(--body); }
.figure .m { fill:var(--muscle); stroke:var(--muscle); }

/* THE action button: same size, colour, radius, type and place on every screen */
.cta { min-height:var(--cta-h); width:100%; border-radius:var(--r-btn); background:var(--cta); color:var(--on-cta);
  font-family:var(--f-display); font-weight:700; font-size:34px; letter-spacing:.01em; display:flex; align-items:center; justify-content:center; gap:12px; flex:none; margin-top:auto; }
.cta .ic { width:30px; height:30px; }
.ghost { min-height:var(--tap); border-radius:var(--r-btn); border:var(--bw) solid var(--line); background:var(--surface); font-size:var(--fs-body); font-weight:600;
  display:flex; align-items:center; justify-content:center; gap:8px; flex:1; color:var(--text); }
.ghost .ic { color:var(--text-2); }

/* the spoken-cue panel: same on every screen */
.cue { display:flex; gap:12px; align-items:center; padding:12px 14px; border-radius:var(--r-btn); background:var(--surface); border-left:6px solid var(--cue); flex:none; }
.cue .ic { color:var(--cue); }
.cue p { font-size:var(--fs-cue); font-weight:600; line-height:1.25; }

/* workout top bar: same on Exercise, camera, Rest */
.topbar { display:flex; gap:8px; flex:none; }
.tb { min-height:60px; min-width:88px; padding:0 8px; border-radius:var(--r-btn); background:var(--surface); border:var(--bw) solid var(--line); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
.tb .ic { width:26px; height:26px; }
.tb-lbl { font-size:var(--fs-label); font-weight:600; color:var(--text-2); }
.tb-wide { flex:1; flex-direction:row; justify-content:flex-start; gap:12px; padding:0 14px; }
.tb-txt { display:flex; flex-direction:column; align-items:flex-start; line-height:1.1; }
.tb-txt b { font-size:22px; } .tb-txt small { font-size:17px; color:var(--text-2); font-weight:600; }
.segs { display:flex; gap:6px; flex:none; margin-top:-4px; }
.segs i { flex:1; height:6px; border-radius:3px; background:var(--surface-2); }
.segs i.cur { background:var(--cta); }

/* tab bar: same on Today, History, Settings */
.tabbar { margin:auto -16px -16px; display:flex; border-top:2px solid var(--line); background:var(--surface); flex:none; }
.tab { flex:1; min-height:72px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:var(--fs-label); font-weight:700; color:var(--text-2); position:relative; }
.tab.on { color:var(--text); } .tab.on .ic { color:var(--cta); }
.tab.on::before { content:''; position:absolute; top:-2px; left:28%; right:28%; height:4px; border-radius:0 0 4px 4px; background:var(--cta); }

/* ================= ENERGY: Today ================= */
.appbar { display:flex; justify-content:space-between; align-items:center; min-height:44px; flex:none; }
.brand { display:flex; align-items:center; gap:8px; font-family:var(--f-display); font-weight:700; font-size:28px; }
.brand-ic { width:32px; height:32px; color:var(--cta); }
.date { font-size:var(--fs-body); color:var(--text-2); font-weight:600; }
.hero { position:relative; border-radius:var(--r-card); overflow:hidden; padding:16px 18px 18px; display:flex; flex-direction:column; gap:14px; flex:none;
  background:radial-gradient(ellipse 70% 80% at 82% 30%, var(--ember-hi), var(--ember) 70%); }
.hero-rings { position:absolute; right:-56px; top:-40px; width:260px; height:260px; fill:none; stroke:var(--cta); stroke-width:2; opacity:.35; }
.hero-txt { position:relative; z-index:1; }
.hero-title { font-size:var(--fs-hero); margin:4px 0 8px; white-space:nowrap; }
.hero .eyebrow { color:var(--text); opacity:.9; }
.hero-meta { display:flex; gap:16px; font-size:var(--fs-body); font-weight:600; white-space:nowrap; }
.hero-meta span { display:flex; align-items:center; gap:6px; }
.chips { display:flex; gap:6px; margin-top:12px; }
.chip { font-size:var(--fs-label); font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap; background:rgba(13,15,18,.45); color:var(--text); }
.chip:first-child { color:var(--muscle); box-shadow:inset 0 0 0 2px var(--muscle); }
.hero-fig { position:absolute; z-index:1; height:150px; right:22px; top:22px; }
.hero .cta { position:relative; z-index:1; min-height:80px; margin-top:0; box-shadow:0 10px 30px rgba(255,122,26,.25); }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; flex:none; }
.tile { border-radius:var(--r-card); padding:12px 14px; min-height:136px; display:flex; flex-direction:column; gap:6px; }
.tile-head { display:flex; align-items:center; gap:6px; font-size:var(--fs-label); font-weight:700; }
.tile-head .ic { width:24px; height:24px; }
.tile-num { font-size:64px; display:flex; align-items:baseline; gap:6px; }
.tile-num small { font-size:22px; font-family:var(--f-body); font-weight:700; letter-spacing:0; }
.tile.streak { background:var(--success); color:var(--on-success); }
.tile.last { background:var(--surface-2); }
.week { list-style:none; display:flex; justify-content:space-between; margin-top:auto; }
.wd { display:flex; flex-direction:column; align-items:center; gap:2px; }
.wd .dot { width:18px; height:18px; border-radius:50%; display:grid; place-items:center; border:2px solid var(--on-success); opacity:.5; }
.wd.done .dot { opacity:1; background:var(--on-success); color:var(--success); }
.wd.today .dot { opacity:1; border-width:3px; }
.wd .wl { font-size:16px; font-weight:700; }
.last-name { font-size:36px; margin-top:4px; }
.last-meta { font-size:var(--fs-label); color:var(--text-2); font-weight:600; }
.trend-pill { margin-top:auto; display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-label); font-weight:700; color:var(--success); }
.days-head { display:flex; justify-content:space-between; align-items:baseline; flex:none; }
.days-head h2 { font-size:30px; } .days-head span { font-size:var(--fs-label); color:var(--text-2); font-weight:600; }
.days { display:flex; gap:10px; overflow:hidden; flex:none; margin-right:-16px; }
.day { flex:none; width:104px; height:126px; border-radius:var(--r-card); background:var(--surface); border:2px solid var(--line); padding:8px; display:flex; flex-direction:column; align-items:center; }
.day-fig { height:56px; }
.day-name { font-size:26px; margin-top:6px; white-space:nowrap; }
.day-when { font-size:16px; font-weight:700; color:var(--text-2); display:flex; align-items:center; gap:4px; margin-top:4px; }
.day.is-done .day-when { color:var(--success); }
.day.is-next { border:3px solid var(--cta); }
.day.is-next .day-when { color:var(--cta); }

/* ================= PRO: Exercise ================= */
.ex-title { font-size:var(--fs-title); }
.ex-meta { font-size:var(--fs-body); color:var(--text-2); margin-top:6px; font-weight:500; }
.stage { position:relative; flex:none; height:224px; border-radius:var(--r-card); overflow:hidden;
  background:radial-gradient(ellipse 60% 75% at 66% 52%, var(--stage-1), var(--stage-2) 75%); border:var(--bw) solid var(--line); }
.stage-fig { position:absolute; right:30px; top:32px; bottom:10px; }
.stage-col { position:absolute; left:14px; top:10px; bottom:12px; display:flex; flex-direction:column; gap:6px; z-index:1; }
.set-badge { display:flex; flex-direction:column; }
.set-lbl { font-size:var(--fs-body); font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:.08em; }
.set-num { font-size:var(--fs-num); }
.set-num i { font-style:normal; color:var(--text-2); font-size:.55em; }
.pips { display:flex; gap:6px; margin-top:8px; }
.pips i { width:22px; height:8px; border-radius:4px; background:var(--line); }
.pips i.cur { background:var(--cta); }
.legend { margin-top:auto; font-size:var(--fs-label); font-weight:700; display:flex; align-items:center; gap:8px; }
.legend i { width:14px; height:14px; border-radius:50%; background:var(--muscle); }
.howto { align-self:flex-start; min-height:var(--tap); padding:0 14px; border-radius:var(--r-btn); background:var(--surface-2); border:var(--bw) solid var(--line); display:flex; align-items:center; gap:8px; font-size:var(--fs-body); font-weight:700; }
.howto .ic { color:var(--info); }
.stepper { flex:none; }
.st-label { font-size:var(--fs-body); font-weight:700; color:var(--text-2); display:flex; gap:8px; align-items:baseline; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
.st-label small { font-size:17px; text-transform:none; letter-spacing:0; font-weight:600; }
.st-row { display:grid; grid-template-columns:80px 1fr 80px; align-items:center; gap:12px; }
.st-btn { height:68px; border-radius:var(--r-btn); background:var(--surface-2); border:var(--bw) solid var(--line); display:grid; place-items:center; }
.st-btn .ic { width:32px; height:32px; stroke-width:3; }
.st-val { font-size:var(--fs-num); text-align:center; }

/* ================= PRO: Camera ================= */
.s-cam { gap:10px; }
.cam-title { background:transparent; border:0; padding-left:2px; }
.cam-view { position:relative; flex:1; border-radius:var(--r-card); overflow:hidden; border:var(--bw) solid var(--line);
  background:linear-gradient(180deg, #232a33 0%, #1a1f26 62%, #14181d 62.2%, #101317 100%); }
.cam-floor { position:absolute; left:0; right:0; top:62%; height:2px; background:#2c333d; }
.skel { position:absolute; left:4px; bottom:56px; width:calc(100% - 92px); height:auto; }
.s-cam .placeholder-tag { top:auto; bottom:84px; left:16px; right:auto; }
.skel .bench { fill:#2c333d; stroke:#2c333d; stroke-width:8; }
.skel .bones line { stroke:var(--text-2); stroke-width:6; stroke-linecap:round; }
.skel .bones line.work { stroke:var(--text); stroke-width:8; }
.skel .joints circle { fill:var(--surface); stroke:var(--text-2); stroke-width:3; }
.skel .joints circle.work { stroke:var(--text); fill:var(--text); }
.skel .headc { fill:none; stroke:var(--text-2); stroke-width:5; }
.skel .db { fill:var(--edge); }
.hud { position:absolute; left:12px; top:12px; padding:16px 16px 12px; border-radius:var(--r-btn); background:var(--surface); border:var(--bw) solid var(--line); z-index:2; }
.rep { display:flex; align-items:baseline; gap:8px; }
.rep-num { font-size:120px; }
.rep-of { font-size:44px; color:var(--text-2); }
.rep-lbl { font-size:var(--fs-body); font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:.08em; margin-top:4px; }
.gauge { position:absolute; right:12px; top:12px; bottom:84px; width:64px; padding:8px 0 12px; border-radius:var(--r-btn); background:var(--surface); border:var(--bw) solid var(--line);
  display:flex; flex-direction:column; align-items:center; gap:8px; z-index:2; }
.g-lbl { font-size:16px; font-weight:700; color:var(--text-2); }
.g-track { position:relative; flex:1; width:22px; border-radius:11px; background:var(--surface-2); }
.g-fill { position:absolute; left:0; right:0; bottom:0; height:62%; border-radius:11px; background:var(--text-2); }
.g-now { position:absolute; left:-8px; right:-8px; bottom:calc(62% - 3px); height:6px; border-radius:3px; background:var(--text); }
.g-target { position:absolute; left:-12px; right:-12px; bottom:84%; height:4px; border-radius:2px; background:var(--success); }
.cam-foot { position:absolute; left:12px; right:12px; bottom:12px; display:flex; justify-content:space-between; align-items:center; z-index:2; }
.cam-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:999px; background:var(--surface); font-size:var(--fs-label); font-weight:700; color:var(--text-2); }
.cam-icon { width:60px; height:60px; border-radius:var(--r-btn); background:var(--surface); border:var(--bw) solid var(--line); display:grid; place-items:center; }

/* ================= PRO: Settings ================= */
.page-title { font-size:var(--fs-title); }
.scroll { flex:1; overflow:hidden; display:flex; flex-direction:column; gap:8px; }
.field-label { display:flex; align-items:center; gap:8px; font-size:var(--fs-body); font-weight:700; color:var(--text-2); margin-top:4px; }
.field-label:first-child { margin-top:0; }
.sub-label { font-size:var(--fs-label); font-weight:600; color:var(--text-2); margin-bottom:-2px; }
.accents { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; flex:none; }
.acc { min-height:60px; padding:0 6px; border-radius:var(--r-btn); background:var(--surface); border:var(--bw) solid var(--line); display:flex; align-items:center; justify-content:center; gap:6px; font-size:var(--fs-body); font-weight:700; }
.acc i { width:22px; height:22px; border-radius:50%; flex:none; }
.acc.sel { border:3px solid var(--text); }
.switch { min-height:60px; flex:none; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 12px 0 16px; border-radius:var(--r-btn); background:var(--surface); border:var(--bw) solid var(--line); text-align:left; }
.sw-lbl { font-size:var(--fs-body); font-weight:600; }
.sw-state { display:flex; align-items:center; gap:8px; }
.sw-txt { font-size:var(--fs-label); font-weight:700; color:var(--text-2); min-width:30px; text-align:right; }
.knob { width:60px; height:34px; border-radius:17px; background:var(--surface-2); border:2px solid var(--edge); position:relative; }
.knob::after { content:''; position:absolute; top:3px; left:3px; width:24px; height:24px; border-radius:50%; background:var(--text-2); }
.switch.on .knob { background:var(--text); border-color:var(--text); }
.switch.on .knob::after { left:auto; right:3px; background:var(--bg); }
.switch.on .sw-txt { color:var(--text); }
.segmented { display:flex; gap:0; border-radius:var(--r-btn); border:var(--bw) solid var(--line); background:var(--surface); padding:2px; flex:none; }
.segmented button { flex:1; min-height:56px; border-radius:calc(var(--r-btn) - 2px); font-size:var(--fs-body); font-weight:700; color:var(--text-2); display:flex; align-items:center; justify-content:center; gap:6px; white-space:nowrap; }
.segmented button.sel { background:var(--text); color:var(--bg); }

/* ================= TRACK: Rest ================= */
.mood-track .eyebrow, .mood-track .ls-lbl, .mood-track .timer-lbl, .mood-track .tb-lbl { text-transform:uppercase; letter-spacing:.08em; }
.mood-track .tb, .mood-track .ghost, .mood-track .lastset, .mood-track .next, .mood-track .fix { border-radius:var(--r-card); }
.mood-track .tb { background:var(--bg); }
.timer { position:relative; width:280px; height:280px; align-self:center; flex:none; }
.timer::before { content:''; position:absolute; inset:-6px -55px; background:repeating-linear-gradient(0deg, transparent 0 54px, var(--line) 54px 56px); opacity:.55; }
.ring { position:relative; width:100%; height:100%; }
.ring circle { fill:none; stroke-width:18; }
.ring-bg { stroke:var(--surface-2); stroke-dasharray:4 8; }
.ring-fg { stroke:var(--cta); stroke-linecap:butt; }
.timer-txt { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.timer-lbl { font-size:22px; font-weight:800; letter-spacing:.2em !important; color:var(--text-2); }
.timer-num { font-size:var(--fs-timer); margin:2px 0; color:var(--text); }
.timer-sub { font-size:var(--fs-body); color:var(--text-2); font-weight:600; }
.timer-btns { display:flex; gap:12px; flex:none; }
.lastset { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 8px 8px 16px; background:var(--surface); border:var(--bw) solid var(--line); flex:none; }
.lastset > div { display:flex; flex-direction:column; }
.ls-lbl { font-size:17px; color:var(--text-2); font-weight:700; }
.ls-val { font-size:22px; font-weight:700; }
.fix { min-height:var(--tap); padding:0 16px; background:var(--surface-2); display:flex; align-items:center; gap:8px; font-size:var(--fs-body); font-weight:700; }
.fix .ic { width:22px; height:22px; color:var(--info); }
.next { display:grid; grid-template-columns:84px 1fr; gap:12px; padding:12px; background:var(--surface); border:var(--bw) solid var(--line); border-top:6px solid var(--cta); flex:none; }
.next-fig { height:142px; border-radius:4px; background:radial-gradient(ellipse at 50% 50%, var(--stage-1), var(--stage-2)); display:grid; place-items:center; padding:6px 0; }
.next-name { font-size:30px; margin:4px 0 6px; }
.next-target { font-size:22px; color:var(--text-2); font-weight:600; }
.next-target b { color:var(--text); font-size:26px; }
.next-cue { margin-top:8px; display:flex; gap:6px; align-items:center; font-size:var(--fs-body); font-weight:600; color:var(--cue); }

/* ================= ENERGY: Summary ================= */
.sum-head { display:flex; gap:14px; align-items:center; flex:none; padding-top:8px; }
.burst { width:76px; height:76px; flex:none; border-radius:50%; display:grid; place-items:center; background:var(--success); color:var(--on-success); box-shadow:0 0 0 8px rgba(59,227,139,.18); }
.trophy { width:48px; height:48px; }
.sum-title { font-size:48px; }
.sum-sub { font-size:var(--fs-body); color:var(--text-2); font-weight:600; margin-top:4px; }
.vol { border-radius:var(--r-card); padding:16px; flex:none; background:radial-gradient(ellipse 80% 90% at 90% 0%, var(--ember-hi), var(--ember) 75%); }
.vol-lbl { font-size:var(--fs-body); font-weight:700; color:var(--text); opacity:.9; }
.vol-num { font-size:var(--fs-num); display:flex; align-items:baseline; gap:8px; margin:4px 0; }
.vol-num small { font-size:26px; font-family:var(--f-body); font-weight:700; letter-spacing:0; }
.vol-delta { display:inline-flex; align-items:center; gap:6px; font-size:var(--fs-body); font-weight:800; padding:2px 10px; border-radius:999px; background:var(--success); color:var(--on-success); }
.vol-bars { margin-top:10px; display:flex; flex-direction:column; gap:8px; }
.vb { display:grid; grid-template-columns:62px 1fr 64px; align-items:center; gap:8px; font-size:17px; font-weight:700; color:var(--text); }
.vb i { height:14px; width:var(--w); border-radius:7px; background:rgba(242,244,247,.35); }
.vb.now i { background:var(--success); }
.vb b { text-align:right; }
.sec-h { font-size:28px; display:flex; align-items:center; gap:8px; flex:none; }
.sec-h .ic { color:var(--success); width:28px; height:28px; }
.bests { display:grid; grid-template-columns:1fr 1fr; gap:12px; flex:none; }
.best { border-radius:var(--r-card); padding:12px 14px; background:var(--success); color:var(--on-success); }
.best-ex { font-size:var(--fs-label); font-weight:700; }
.best-val { font-size:38px; margin:4px 0; white-space:nowrap; }
.best-was { font-size:16px; font-weight:600; }
.stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; flex:none; }
.stat { display:flex; flex-direction:column; align-items:center; padding:10px 0; border-radius:var(--r-btn); background:var(--surface); }
.stat b { font-size:40px; } .stat span { font-size:17px; color:var(--text-2); font-weight:700; }
.work-on { display:flex; gap:10px; align-items:flex-start; font-size:var(--fs-body); line-height:1.3; color:var(--text-2); flex:none; }
.work-on .ic { color:var(--cue); margin-top:2px; }
.work-on b { color:var(--text); }

/* motion ideas: all behind reduced-motion (screenshots are static) */
@media (prefers-reduced-motion: no-preference) {
  .cta { transition:transform .15s ease-out; } .cta:active { transform:scale(.97); }
  .mood-energy .hero-rings { animation:pulse 6s ease-in-out infinite alternate; }
  @keyframes pulse { to { transform:scale(1.05); opacity:.25; } }
  .ring-fg { transition:stroke-dashoffset 1s steps(1); }
  .rep-num { transition:transform 80ms; }
}
`;
}

const SCREENS = [
  ['today', 'Today', 'energy', today],
  ['exercise', 'Exercise', 'pro', exercise],
  ['rest', 'Rest', 'track', rest],
  ['summary', 'Summary', 'energy', summary],
  ['camera', 'Camera', 'pro', camera],
  ['settings', 'Settings', 'pro', settings],
];

function page() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gym Clean M4e mix</title><style>${css()}</style></head>
<body>${sprite}
<div class="board">
${SCREENS.map(([id, n, m, f]) => `  <div><p class="frame-cap">${n} · ${MOODS[m].name}</p>${f()}</div>`).join('\n')}
</div></body></html>
`;
}

function sheet(table) {
  const swatches = [
    ['bg', T.bg, 'page'], ['surface', T.surface, 'cards'], ['surface-2', T.surface2, 'buttons'], ['text', T.text, 'text'], ['text-2', T.text2, 'labels, info'],
    ['cta', T.cta, 'PRESS THIS / now'], ['success', T.success, 'done, bests'], ['muscle', T.muscle, 'muscles only'], ['cue', T.cue, 'spoken cue'], ['danger', T.danger, 'confirm only'],
  ];
  const moodSw = [['ember', MOODS.energy.t.ember, 'Energy hero'], ['ember-hi', MOODS.energy.t.emberHi, 'Energy glow'], ['black', MOODS.track.t.bgDeep, 'Track page'], ['rule', MOODS.track.t.rule, 'Track lanes']];
  const swHtml = (list) => list.map(([n, c, r]) => `<div><i style="background:${c}"></i><span>${n}<br>${c}<br><em>${r}</em></span></div>`).join('');
  const rows = table.map((r) => `<tr><td>${r.scope}</td><td>${r.pair}</td><td>${r.fg} / ${r.bg}</td><td class="${r.pass ? 'ok' : 'bad'}">${r.ratio.toFixed(2)}:1</td><td>${r.need}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mix sheet</title>
<style>${css()}
html, body { background:${T.bg}; } body { padding:32px; width:2640px; }
.sh-head { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:24px; }
.sh-head h1 { font-size:84px; }
.sh-head p { font-size:24px; color:var(--text-2); max-width:1200px; margin-top:8px; }
.shots { display:flex; gap:24px; }
.shots figure { display:flex; flex-direction:column; gap:10px; }
.shots img { width:390px; height:844px; border-radius:28px; outline:2px solid var(--line); }
.shots figcaption { font-size:22px; font-weight:700; display:flex; gap:10px; align-items:center; }
.tag { font-size:16px; padding:3px 10px; border-radius:999px; text-transform:uppercase; letter-spacing:.08em; }
.tag.energy { background:${MOODS.energy.t.emberHi}; color:var(--text); } .tag.pro { background:var(--surface-2); color:var(--text); border:1px solid var(--line); } .tag.track { background:#000; color:var(--text); border:2px solid ${MOODS.track.t.rule}; }
.meta { display:grid; grid-template-columns: 1.1fr 0.9fr 1.3fr; gap:40px; margin-top:32px; }
.sw { display:flex; flex-wrap:wrap; gap:12px; }
.sw div { width:118px; } .sw i { display:block; height:56px; border-radius:10px; border:1px solid var(--line); }
.sw span { font-size:14px; color:var(--text-2); display:block; margin-top:4px; font-family:ui-monospace,monospace; } .sw em { font-style:normal; color:var(--text); font-family:var(--f-body); }
table { border-collapse:collapse; font-size:15px; width:100%; }
td { padding:3px 10px 3px 0; color:var(--text-2); font-family:ui-monospace,monospace; } td:nth-child(2) { font-family:var(--f-body); color:var(--text); }
td.ok { color:var(--success); font-weight:700; } td.bad { color:var(--danger); font-weight:700; }
.type .d1 { font-family:var(--f-display); font-weight:700; font-size:132px; line-height:1; }
.type .d2 { font-family:var(--f-display); font-weight:700; font-size:34px; margin-top:8px; }
.type .d3 { font-family:var(--f-display); font-weight:700; font-size:24px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-2); margin-top:6px; }
.type p { font-size:20px; color:var(--text-2); margin-top:8px; }
.icons { display:flex; flex-wrap:wrap; gap:14px; margin-top:12px; }
.icons .ic { width:36px; height:36px; }
h3 { font-size:22px; margin:22px 0 12px; font-family:var(--f-display); text-transform:uppercase; letter-spacing:.06em; color:var(--text-2); }
h3:first-child { margin-top:0; }
.rules li { font-size:19px; line-height:1.4; margin:0 0 6px 20px; color:var(--text); } .rules b { color:var(--cta); }
</style></head><body>${sprite}
<div class="sh-head"><div><h1>Gym Clean · the mix</h1><p>One app, three moods. Energy where you decide to train and celebrate, Pro while you lift and set things up, Track while you rest and read numbers. Shared: one orange action colour, one cyan muscle colour, one font family, one icon stroke, one button.</p></div>
<p style="text-align:right;font-size:18px;color:var(--text-2)">Type: Barlow Condensed + Barlow (SIL OFL 1.1, self-hosted)<br>Mockup stand-in: DIN Condensed Bold (macOS) + Avenir Next<br>Icons: original, 24 grid, 2.25px round</p></div>
<div class="shots">
${SCREENS.map(([id, n, m]) => `<figure><img src="../${id}.png" alt="${n}"><figcaption>${n}<span class="tag ${m}">${MOODS[m].name}</span></figcaption></figure>`).join('\n')}
</div>
<div class="meta">
  <div><h3>Shared tokens (every screen)</h3><div class="sw">${swHtml(swatches)}</div>
    <h3>Mood accents (per screen)</h3><div class="sw">${swHtml(moodSw)}</div>
    <h3>Icons: one set, one stroke</h3>
    <div class="icons">${['play', 'pause', 'camera', 'list', 'sliders', 'bars', 'home', 'flame', 'trophy', 'medal', 'check', 'skip', 'speaker', 'help', 'timer', 'trend', 'pencil', 'clock', 'dumbbell', 'close', 'flip', 'lock', 'palette'].map((n) => ic(n)).join('')}</div></div>
  <div class="type"><h3>Type: one family, two widths</h3><div class="d1">1:00 · 7</div><div class="d2">One-Arm Dumbbell Row</div><div class="d3">Track label caps</div><p>Body 20px: Elbow to hip, squeeze your back.</p>
    <h3>Cohesion rules</h3><ul class="rules">
      <li><b>Filled orange = press this.</b> Orange outline or dot = where you are now. Nothing else is orange.</li>
      <li>Filled green = you achieved it. Never a button.</li>
      <li>Cyan = muscles only, on every screen and in 3D.</li>
      <li>Lavender bar + speaker = this line is spoken.</li>
      <li>Selected / on = white fill, not orange.</li>
      <li>Same CTA, cue panel, top bar and tab bar everywhere. Moods change only page black, card radius, line weight, caps and fills.</li>
    </ul></div>
  <div><h3>Contrast (WCAG 2.x)</h3><table>${rows}</table></div>
</div>
</body></html>`;
}

const table = pairs.map(([scope, pair, fg, bg, kind]) => {
  const r = ratio(fg, bg);
  const need = kind === 'text' ? 4.5 : kind === 'large' ? 3 : 1;
  return { scope, pair, fg, bg, ratio: r, need: kind === 'deco' ? 'decorative' : `≥ ${need}`, pass: r >= need };
});
writeFileSync(join(OUT, 'mix.html'), page());
writeFileSync(join(SRC, 'mix-sheet.html'), sheet(table));
writeFileSync(join(SRC, 'contrast.json'), JSON.stringify(table, null, 2));
const fails = table.filter((r) => !r.pass);
for (const r of table) console.log(`${r.scope.padEnd(7)} ${r.pair.padEnd(44)} ${r.ratio.toFixed(2)} ${r.need}${r.pass ? '' : '  FAIL'}`);
console.log(fails.length ? `FAILS: ${fails.length}` : 'all pairs pass');
