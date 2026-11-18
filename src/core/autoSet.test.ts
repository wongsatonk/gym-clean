import { describe, expect, it } from 'vitest';
import {
  AUTO_SET_DEFAULTS,
  createAutoSet,
  type AutoSet,
  type AutoSetAction,
  type AutoSetConfig,
  type AutoSetInput,
  personInFrame,
} from './autoSet';
import type { RepPhase, UntrackedReason } from './repCounter';
import type { LandmarkFrame, RepEvent } from './types';

// ---------------------------------------------------------------------------------------------
// A stream simulator shaped like the camera loop: counter snapshots (phase, tracking, smoothed
// angle) at an irregular 15–30 fps with dropped frames, angle jitter, gated (untracked) frames and
// gaps, with rep/partial events on the frame where the counter completes them. Curl-like angles:
// start band ≈ 165°, far band ≈ 50°.
// ---------------------------------------------------------------------------------------------

/** Element i, failing the test if it is missing. */
function nth<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error(`missing element ${i}`);
  return x;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SimOpts = { fps?: [number, number]; drop?: number; seed?: number; t0?: number };
type Logged = { t: number; action: AutoSetAction };

const TOP = 165;
const BOTTOM = 50;

class Sim {
  t: number;
  phase: RepPhase = 'top';
  log: Logged[] = [];
  reps = 0;
  partials = 0;
  /** Frame t of the last pushed 'top' frame before the latest departure. */
  lastDepartT = 0;
  private lastTopT = 0;
  private rnd: () => number;
  private fps: [number, number];
  private drop: number;

  constructor(
    public auto: AutoSet,
    opts: SimOpts = {},
  ) {
    this.t = opts.t0 ?? 0;
    this.fps = opts.fps ?? [30, 30];
    this.drop = opts.drop ?? 0;
    this.rnd = mulberry32(opts.seed ?? 1);
  }

  private step(): number {
    const [lo, hi] = this.fps;
    const fps = lo + (hi - lo) * this.rnd();
    return 1000 / fps;
  }

  record(actions: AutoSetAction[]): AutoSetAction[] {
    for (const action of actions) this.log.push({ t: this.t, action });
    return actions;
  }

  /** Push one frame at the current t (never dropped). */
  frame(
    phase: RepPhase,
    angle: number,
    tracking = true,
    events: RepEvent[] = [],
    present?: boolean,
    untracked?: UntrackedReason | null,
  ): void {
    if (this.phase === 'top' && phase !== 'top') this.lastDepartT = this.lastTopT;
    this.phase = phase;
    if (phase === 'top' && tracking) this.lastTopT = this.t;
    const input: AutoSetInput = {
      t: this.t,
      tracking,
      phase,
      angle: tracking ? angle : null,
      events,
    };
    if (present !== undefined) input.present = present;
    if (untracked !== undefined) input.untracked = untracked;
    this.record(this.auto.push(input));
  }

  /** Frames for `ms` (time advances first, then a frame unless it is dropped). */
  hold(
    phase: RepPhase,
    ms: number,
    o: {
      angle?: number | ((f: number) => number);
      jitter?: number;
      tracking?: boolean;
      /** Person detected (default: same as tracking, i.e. the field is omitted). */
      present?: boolean;
      /** The counter's untracked reason (a reason implies tracking false unless given). */
      untracked?: UntrackedReason | null;
    } = {},
  ): void {
    const end = this.t + ms;
    const start = this.t;
    for (;;) {
      const next = this.t + this.step();
      if (next > end) break;
      this.t = next;
      if (this.rnd() < this.drop) continue;
      const base =
        typeof o.angle === 'function' ? o.angle((this.t - start) / ms) : (o.angle ?? TOP);
      const j = o.jitter ? (this.rnd() * 2 - 1) * o.jitter : 0;
      const tracking = o.tracking ?? !o.untracked;
      this.frame(phase, base + j, tracking, [], o.present, o.untracked);
    }
    this.t = end;
  }

  /** No frames at all for `ms` (camera hiccup). */
  gap(ms: number): void {
    this.t += ms;
  }

  /** One rep: down → bottom → up, then the frame back in the start band carries the event. */
  rep(o: { downMs?: number; upMs?: number; bottomMs?: number } = {}): RepEvent {
    const downMs = o.downMs ?? 900;
    const upMs = o.upMs ?? 900;
    this.hold('down', downMs, { angle: (f) => TOP - (TOP - BOTTOM) * f });
    this.hold('bottom', o.bottomMs ?? 150, { angle: BOTTOM });
    this.hold('up', upMs, { angle: (f) => BOTTOM + (TOP - BOTTOM) * f });
    this.t += this.step();
    const ev = repEvent('rep', ++this.reps, this.t, downMs, upMs);
    this.frame('top', TOP, true, [ev]);
    return ev;
  }

  /** A partial that turns around before the far band. */
  partial(): RepEvent {
    this.hold('down', 600, { angle: (f) => TOP - 50 * f });
    this.t += this.step();
    const ev = repEvent('partial', ++this.partials, this.t, 600, 600);
    this.frame('top', TOP, true, [ev]);
    return ev;
  }

  /** Reps at a steady pace with `pauseMs` at the top between them. */
  reps_(n: number, pauseMs = 400): RepEvent[] {
    const out: RepEvent[] = [];
    for (let i = 0; i < n; i++) {
      out.push(this.rep());
      if (i < n - 1) this.hold('top', pauseMs, { jitter: 3 });
    }
    return out;
  }

  undo(): AutoSetAction[] {
    return this.record(this.auto.undo(this.t));
  }
  confirm(): AutoSetAction[] {
    return this.record(this.auto.confirm(this.t));
  }
  continueSet(): AutoSetAction[] {
    return this.record(this.auto.continueSet(this.t));
  }
  nextSet(): AutoSetAction[] {
    return this.record(this.auto.nextSet(this.t));
  }
  session(phase: 'exercise' | 'rest' | 'other', paused = false, restElapsedMs = 0): void {
    this.record(this.auto.setSession({ phase, paused, restElapsedMs }, this.t));
  }

  of<K extends AutoSetAction['type']>(type: K): (Logged & { action: { type: K } })[] {
    return this.log.filter((l) => l.action.type === type) as (Logged & {
      action: { type: K };
    })[];
  }
  types(): string[] {
    return this.log.map((l) => l.action.type);
  }
}

function repEvent(
  type: 'rep' | 'partial',
  index: number,
  t: number,
  downMs: number,
  upMs: number,
): RepEvent {
  return {
    type,
    index,
    eccentricMs: Math.round(upMs),
    concentricMs: Math.round(downMs),
    minAngle: type === 'rep' ? BOTTOM : TOP - 50,
    maxAngle: TOP,
    t,
    ...(type === 'partial' ? { reason: 'far' as const, shortByDeg: 20 } : {}),
  };
}

/** A set already running (manual Start set), counter at the start band. */
function inSet(opts: SimOpts = {}, config?: Partial<AutoSetConfig>): Sim {
  const sim = new Sim(createAutoSet({ ...AUTO_SET_DEFAULTS, ...config }), opts);
  sim.session('exercise');
  sim.hold('top', 1000);
  return sim;
}

/** A rest that has been running `elapsedMs` at the sim's t. */
function inRest(elapsedMs: number, opts: SimOpts = {}, config?: Partial<AutoSetConfig>): Sim {
  const sim = new Sim(createAutoSet({ ...AUTO_SET_DEFAULTS, ...config }), opts);
  sim.session('rest', false, elapsedMs);
  return sim;
}

// ---------------------------------------------------------------------------------------------

describe('AUTO_SET_DEFAULTS', () => {
  it('matches SPEC M5c', () => {
    expect(AUTO_SET_DEFAULTS).toMatchObject({
      startReps: 2,
      startWindowSec: 8,
      armAfterSec: 10,
      stopMinReps: 2,
      stillSec: 6,
      awaySec: 3,
      breakGateSec: 5,
      stalledSec: 10,
      undoSec: 5,
      undoStillFactor: 2,
      idleNoPersonSec: 180,
      idleNoRepSec: 600,
      armAfterAutoStopSec: 5,
    });
  });
});

describe('auto stop', () => {
  it('clean set: still 6 s in the start band → stopPending, then commit 5 s later at the last rep', () => {
    const sim = inSet();
    const reps = sim.reps_(3);
    const last = nth(reps, 2);
    sim.hold('top', 5900, { jitter: 2 });
    expect(sim.log).toEqual([]);
    sim.hold('top', 200, { jitter: 2 });
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop).toBeDefined();
    expect(stop.t).toBeGreaterThanOrEqual(last.t + 6000);
    expect(stop.action).toMatchObject({ reason: 'still', reps: 3, partials: 0, endedAt: last.t });
    expect(sim.auto.state).toBe('pending');
    expect(sim.auto.pendingUntil).toBeCloseTo(stop.t + 5000, 6);
    // Nothing committed inside the window.
    sim.hold('top', 4900);
    expect(sim.of('commit')).toEqual([]);
    sim.hold('top', 200);
    const commit = nth(sim.of('commit'), 0);
    expect(commit.t).toBeGreaterThanOrEqual(stop.t + 5000);
    expect(commit.action).toMatchObject({ endedAt: last.t, reps: 3, partials: 0 });
    expect(sim.types()).toEqual(['stopPending', 'commit']);
    // After the save the machine waits in rest; more stillness does nothing.
    expect(sim.auto.state).toBe('rest');
    expect(sim.auto.pendingUntil).toBeNull();
    sim.hold('top', 20000, { jitter: 3 });
    expect(sim.types()).toEqual(['stopPending', 'commit']);
  });

  it('endedAt is the last event, even when it is a partial', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('top', 500);
    const p = sim.partial();
    sim.hold('top', 6100);
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.action).toMatchObject({ reason: 'still', reps: 2, partials: 1, endedAt: p.t });
  });

  it('away: 3 s without a tracked person → hold away (a break, not a stop; M5c follow-up)', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 300);
    const lostFrom = sim.t;
    sim.hold('top', 2900, { tracking: false });
    expect(sim.log).toEqual([]);
    sim.hold('top', 200, { tracking: false });
    expect(sim.of('stopPending')).toEqual([]);
    const hold = nth(sim.of('hold'), 0);
    expect(hold.action).toEqual({
      type: 'hold',
      reason: 'away',
      reps: 2,
      partials: 0,
      endedAt: last.t,
    });
    expect(hold.t).toBeGreaterThanOrEqual(lostFrom + 3000 - 40);
    expect(sim.auto.state).toBe('held');
  });

  it('away also counts time with no frames at all after the person is lost', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('top', 200, { tracking: false });
    sim.gap(3500);
    sim.hold('top', 100, { tracking: false });
    expect(sim.of('hold')[0]?.action).toMatchObject({ reason: 'away' });
    expect(sim.of('stopPending')).toEqual([]);
  });

  it('stalled: 10 s outside the start band with no event or phase change', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    // Push-up done, lying on the floor: the counter sits in the far band.
    sim.hold('down', 600, { angle: (f) => TOP - 100 * f });
    const since = sim.t;
    sim.hold('bottom', 9800, { angle: BOTTOM, jitter: 5 });
    expect(sim.log).toEqual([]);
    sim.hold('bottom', 400, { angle: BOTTOM, jitter: 5 });
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.action).toMatchObject({ reason: 'stalled', reps: 2, endedAt: last.t });
    expect(stop.t).toBeGreaterThanOrEqual(since + 10000 - 40);
  });

  it('never stops with fewer than 2 reps (one rep, partials only, nothing)', () => {
    const one = inSet();
    one.rep();
    one.hold('top', 30000, { jitter: 3 });
    one.hold('top', 10000, { tracking: false });
    expect(one.log).toEqual([]);

    const partials = inSet();
    partials.partial();
    partials.hold('top', 500);
    partials.partial();
    partials.hold('top', 500);
    partials.partial();
    partials.hold('top', 20000);
    expect(partials.log).toEqual([]);

    const none = inSet();
    none.hold('setup', 20000, { angle: 120 });
    expect(none.log).toEqual([]);
  });

  it('a phase change resets the still timer (stepping in and out of the start band)', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 4000);
    sim.hold('setup', 500, { angle: 140 }); // posture gate dropped the attempt
    sim.hold('top', 4000);
    expect(sim.log).toEqual([]);
    sim.hold('top', 2100);
    expect(sim.of('stopPending')[0]?.action).toMatchObject({
      reason: 'still',
      endedAt: last.t,
    });
  });
});

describe('undo window', () => {
  function pendingSet(): { sim: Sim; stopT: number; lastT: number } {
    const sim = inSet();
    const last = nth(sim.reps_(3), 2);
    sim.hold('top', 6100);
    const stop = nth(sim.of('stopPending'), 0);
    return { sim, stopT: stop.t, lastT: last.t };
  }

  it('Undo cancels the stop, nothing is committed, and the next still stop needs 12 s', () => {
    const { sim } = pendingSet();
    sim.hold('top', 2000);
    expect(sim.undo()).toEqual([{ type: 'stopCancelled', reason: 'undo' }]);
    const undoT = sim.t;
    expect(sim.auto.state).toBe('set');
    expect(sim.auto.pendingUntil).toBeNull();
    sim.hold('top', 11800, { jitter: 3 });
    expect(sim.types()).toEqual(['stopPending', 'stopCancelled']);
    sim.hold('top', 300, { jitter: 3 });
    const stops = sim.of('stopPending');
    expect(stops).toHaveLength(2);
    expect(nth(stops, 1).t).toBeGreaterThanOrEqual(undoT + 12000);
    expect(nth(stops, 1).action).toMatchObject({ reason: 'still', reps: 3 });
  });

  it('a rep inside the window cancels without a tap and counting continues', () => {
    const { sim, stopT } = pendingSet();
    sim.hold('top', 500);
    const rep4 = sim.rep();
    expect(rep4.t).toBeLessThan(stopT + 5000);
    expect(sim.types()).toEqual(['stopPending', 'stopCancelled']);
    expect(nth(sim.of('stopCancelled'), 0).action).toEqual({
      type: 'stopCancelled',
      reason: 'rep',
    });
    expect(sim.auto.counts).toEqual({ reps: 4, partials: 0 });
    // The doubled still time applies for the rest of the set.
    sim.hold('top', 11900);
    expect(sim.of('stopPending')).toHaveLength(1);
    sim.hold('top', 200);
    const stops = sim.of('stopPending');
    expect(stops).toHaveLength(2);
    expect(nth(stops, 1).action).toMatchObject({ reason: 'still', reps: 4, endedAt: rep4.t });
    sim.hold('top', 5100);
    expect(nth(sim.of('commit'), 0).action).toMatchObject({ endedAt: rep4.t, reps: 4 });
  });

  it('a partial inside the window does not cancel', () => {
    const { sim } = pendingSet();
    sim.hold('top', 300);
    sim.partial();
    sim.hold('top', 5000);
    expect(sim.types()).toEqual(['stopPending', 'commit']);
    // Counts are frozen at the proposal: the window's partial isn't in the saved set.
    expect(nth(sim.of('commit'), 0).action).toMatchObject({ reps: 3, partials: 0 });
  });

  it('a cancelled window keeps the partials seen inside it', () => {
    const { sim } = pendingSet();
    sim.hold('top', 300);
    sim.partial();
    sim.hold('top', 300);
    sim.rep();
    expect(sim.types()).toEqual(['stopPending', 'stopCancelled']);
    expect(sim.auto.counts).toEqual({ reps: 4, partials: 1 });
  });

  it('the away time is not doubled after a cancel (away → hold)', () => {
    const { sim } = pendingSet();
    sim.undo();
    const t = sim.t;
    sim.hold('top', 3100, { tracking: false });
    expect(sim.of('stopPending')).toHaveLength(1);
    const hold = nth(sim.of('hold'), 0);
    expect(hold.action).toMatchObject({ reason: 'away' });
    expect(hold.t - t).toBeLessThan(3200);
  });

  it('confirm() commits at once with the backdated end', () => {
    const { sim, lastT } = pendingSet();
    sim.hold('top', 1000);
    expect(sim.confirm()).toEqual([{ type: 'commit', endedAt: lastT, reps: 3, partials: 0 }]);
    sim.hold('top', 10000);
    expect(sim.types()).toEqual(['stopPending', 'commit']);
  });

  it('undo() and confirm() outside a pending stop do nothing', () => {
    const sim = inSet();
    sim.reps_(2);
    expect(sim.undo()).toEqual([]);
    expect(sim.confirm()).toEqual([]);
    expect(sim.auto.state).toBe('set');
  });

  it('a new set (manual Start set) gets the normal still time again', () => {
    const { sim } = pendingSet();
    sim.undo();
    sim.session('rest', false, 0); // manual Set done
    sim.session('exercise'); // manual Start set
    sim.hold('top', 500);
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 6100);
    const stops = sim.of('stopPending');
    expect(stops).toHaveLength(2);
    expect(nth(stops, 1).t - last.t).toBeLessThan(6200);
    expect(nth(stops, 1).action).toMatchObject({ reps: 2 });
  });
});

describe('auto start in rest', () => {
  it('no start before 10 s of rest (reps before arming are ignored)', () => {
    const sim = inRest(0);
    sim.hold('top', 1000);
    sim.rep();
    sim.hold('top', 500);
    sim.rep();
    sim.hold('top', 500);
    sim.rep();
    expect(sim.t).toBeLessThan(10000);
    sim.hold('top', 3000);
    expect(sim.log).toEqual([]);
    expect(sim.auto.state).toBe('rest');
  });

  it('arming counts the rest already elapsed when the camera opens', () => {
    const sim = inRest(9000);
    sim.hold('top', 1200);
    sim.rep();
    sim.hold('top', 500);
    const second = sim.rep();
    expect(sim.of('start')).toHaveLength(1);
    expect(nth(sim.of('start'), 0).t).toBe(second.t);
  });

  it('a lone phantom rep does not start a set', () => {
    const sim = inRest(30000, { fps: [15, 30], drop: 0.1, seed: 7 });
    sim.hold('top', 2000, { jitter: 5 });
    sim.rep();
    sim.hold('top', 60000, { jitter: 5 });
    expect(sim.log).toEqual([]);
  });

  it('two reps 9 s apart do not start; a third within 8 s starts from the second', () => {
    const sim = inRest(30000);
    sim.hold('top', 1000);
    const first = sim.rep();
    sim.hold('top', 9000 - 1950 - 33);
    const second = sim.rep();
    expect(second.t - first.t).toBeGreaterThan(8000);
    expect(sim.log).toEqual([]);
    const departSecond = sim.lastDepartT;
    sim.hold('top', 400);
    sim.rep();
    const start = nth(sim.of('start'), 0);
    expect(start.action).toEqual({ type: 'start', at: departSecond, reps: 2, partials: 0 });
  });

  it('two reps within 8 s start the set, backdated to the first departure, with partials in between', () => {
    const sim = inRest(20000);
    sim.hold('top', 1000);
    sim.partial(); // before the first rep's departure: not part of the set
    sim.hold('top', 2000);
    sim.rep();
    const departFirst = sim.lastDepartT;
    sim.hold('top', 400);
    sim.partial();
    sim.hold('top', 400);
    const second = sim.rep();
    const start = nth(sim.of('start'), 0);
    expect(start.t).toBe(second.t);
    expect(start.action).toEqual({ type: 'start', at: departFirst, reps: 2, partials: 1 });
    expect(departFirst).toBeLessThan(second.t - 2000);
    expect(sim.auto.state).toBe('set');
    expect(sim.auto.counts).toEqual({ reps: 2, partials: 1 });
  });

  it('partials alone never start a set', () => {
    const sim = inRest(20000);
    for (let i = 0; i < 6; i++) {
      sim.hold('top', 300);
      sim.partial();
    }
    sim.hold('top', 2000);
    expect(sim.log).toEqual([]);
  });

  it('an auto-started set keeps its counts when the session switches to exercise, then stops as usual', () => {
    const sim = inRest(20000);
    sim.hold('top', 500);
    sim.reps_(2);
    expect(sim.types()).toEqual(['start']);
    sim.session('exercise'); // the app dispatched START_SET
    expect(sim.auto.counts).toEqual({ reps: 2, partials: 0 });
    sim.hold('top', 400);
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 6100);
    expect(nth(sim.of('stopPending'), 0).action).toMatchObject({
      reason: 'still',
      reps: 4,
      endedAt: last.t,
    });
  });

  it('after an auto stop the rest arms at max(end + 10 s, commit + 5 s)', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 11200); // still stop at +6 s, commit at +11 s
    expect(sim.types()).toEqual(['stopPending', 'commit']);
    const commitT = nth(sim.of('commit'), 0).t;
    expect(sim.auto.state).toBe('rest');
    // The app saves and resets the counter; rest started at the backdated end (≈ 11 s ago).
    sim.session('rest', false, sim.t - last.t);
    // Walking to the rack / picking the dumbbells up right after "Set done": two rep-like moves.
    sim.hold('top', 200);
    const pickUps = sim.reps_(2);
    expect(nth(pickUps, 1).t).toBeLessThan(commitT + 5000);
    expect(sim.types()).toEqual(['stopPending', 'commit']);
    // Later real reps start the next set.
    sim.hold('top', 3000);
    sim.reps_(2);
    expect(sim.types()).toEqual(['stopPending', 'commit', 'start']);
  });

  it('the commit + 5 s floor survives later setSession(rest) refreshes', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 11100);
    expect(sim.types()).toEqual(['stopPending', 'commit']);
    for (let i = 0; i < 3; i++) {
      sim.session('rest', false, sim.t - last.t + 12000); // even a rest that claims to be long
      sim.hold('top', 100);
    }
    sim.reps_(2);
    expect(sim.types()).toEqual(['stopPending', 'commit']);
  });

  it('a rep that left the start band before the commit is not a start candidate', () => {
    const sim = inSet();
    sim.reps_(3);
    sim.hold('top', 6100);
    expect(sim.types()).toEqual(['stopPending']);
    // A slow rep starts in the window and Set done is tapped mid-rep.
    sim.hold('top', 500);
    sim.hold('down', 1000, { angle: (f) => TOP - 40 * f });
    const endedAt = nth(sim.confirm(), 0);
    expect(endedAt.type).toBe('commit');
    sim.session('rest', false, 7000);
    sim.hold('down', 2000, { angle: (f) => TOP - 40 - 75 * f });
    sim.hold('bottom', 1000, { angle: BOTTOM });
    sim.hold('up', 3000, { angle: (f) => BOTTOM + (TOP - BOTTOM) * f });
    sim.t += 33;
    const slow = repEvent('rep', 4, sim.t, 3000, 3000);
    sim.frame('top', TOP, true, [slow]); // completes after commit + 5 s
    expect(slow.t).toBeGreaterThan(nth(sim.of('commit'), 0).t + 5000);
    sim.hold('top', 400);
    sim.rep(); // within 8 s of the slow one, but the slow one doesn't count
    expect(sim.types()).toEqual(['stopPending', 'commit']);
    sim.hold('top', 400);
    sim.rep();
    expect(sim.types()).toEqual(['stopPending', 'commit', 'start']);
  });
});

describe("don't commit mid-rep", () => {
  it('slow 3.5 s rep starting 2 s into the window: no commit mid-rep, the rep cancels', () => {
    const sim = inSet();
    sim.reps_(3);
    sim.hold('top', 6100); // 6 s lockout breath
    const stop = nth(sim.of('stopPending'), 0);
    sim.hold('top', stop.t + 2000 - sim.t);
    const rep4 = sim.rep({ downMs: 1500, bottomMs: 500, upMs: 1500 });
    expect(rep4.t).toBeGreaterThan(stop.t + 5400);
    expect(sim.of('commit')).toEqual([]);
    const cancelled = nth(sim.of('stopCancelled'), 0);
    expect(cancelled.action).toEqual({ type: 'stopCancelled', reason: 'rep' });
    expect(cancelled.t).toBe(rep4.t);
    expect(sim.auto.state).toBe('set');
    expect(sim.auto.counts.reps).toBe(4);
  });

  it('an attempt in the window that returns without a rep commits on the return', () => {
    const sim = inSet();
    const last = nth(sim.reps_(3), 2);
    sim.hold('top', 6100);
    const stop = nth(sim.of('stopPending'), 0);
    sim.hold('top', stop.t + 1500 - sim.t);
    sim.hold('down', 4000, { angle: (f) => TOP - 30 * f }); // until 5.5 s into the window
    expect(sim.of('commit')).toEqual([]);
    sim.hold('top', 300); // back without a counted rep
    const commit = nth(sim.of('commit'), 0);
    expect(commit.t).toBeLessThan(stop.t + 5500 + 100);
    expect(commit.action).toMatchObject({ endedAt: last.t, reps: 3 });
  });

  it('an attempt in the window that leaves the frame commits after the away time', () => {
    const sim = inSet();
    sim.reps_(3);
    sim.hold('top', 6100);
    const stop = nth(sim.of('stopPending'), 0);
    sim.hold('top', stop.t + 4000 - sim.t);
    sim.hold('down', 1500, { angle: (f) => TOP - 30 * f });
    const goneT = sim.t;
    sim.hold('down', 2900, { tracking: false, present: false });
    expect(sim.of('commit')).toEqual([]);
    sim.hold('down', 300, { tracking: false, present: false });
    expect(nth(sim.of('commit'), 0).t).toBeGreaterThanOrEqual(goneT + 3000 - 40);
  });

  it('the hold has a hard cap: commit by pendingUntil + stalledSec even if the counter flaps', () => {
    const sim = inSet();
    const last = nth(sim.reps_(3), 2);
    sim.hold('top', 6100);
    const stop = nth(sim.of('stopPending'), 0);
    sim.hold('top', stop.t + 2000 - sim.t);
    // An attempt that never comes back: down ⇄ bottom ⇄ up flapping, each a phase change.
    for (let i = 0; i < 20 && sim.of('commit').length === 0; i++) {
      sim.hold('down', 400, { angle: TOP - 60 });
      sim.hold('bottom', 400, { angle: BOTTOM });
      sim.hold('up', 400, { angle: TOP - 60 });
    }
    const commit = nth(sim.of('commit'), 0);
    const until = stop.t + 5000;
    expect(commit.t).toBeGreaterThanOrEqual(until + 10000 - 40);
    expect(commit.t).toBeLessThan(until + 10000 + 100);
    expect(commit.action).toMatchObject({ endedAt: last.t, reps: 3 });
  });

  it('a stalled stop (already outside the band) still commits when the window ends', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('down', 600, { angle: (f) => TOP - 100 * f });
    sim.hold('bottom', 10100, { angle: BOTTOM, jitter: 4 });
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.action).toMatchObject({ reason: 'stalled' });
    sim.hold('bottom', 5100, { angle: BOTTOM, jitter: 4 });
    expect(nth(sim.of('commit'), 0).t).toBeLessThan(stop.t + 5100);
  });
});

describe('clock going backwards (stream restart, new t0)', () => {
  it('a jitter regression under 100 ms is ignored (no rebase, timers keep running)', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 3000);
    sim.t -= 60; // out-of-order camera timestamp
    sim.frame('top', TOP);
    sim.t += 60;
    sim.hold('top', 3150);
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.t - last.t).toBeLessThan(6100); // not 6 s after the regression
  });

  it('a regression of 100 ms or more is a restart (timers restart)', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('top', 3000);
    const before = sim.t;
    sim.t -= 150;
    sim.frame('top', TOP);
    sim.hold('top', 5700);
    expect(sim.log).toEqual([]);
    sim.hold('top', 400);
    expect(nth(sim.of('stopPending'), 0).t).toBeGreaterThan(before + 5700);
  });

  it('idle noPerson still fires after a restart (no stale last-seen time)', () => {
    const sim = inRest(5000);
    sim.hold('top', 60000, { jitter: 3 });
    sim.t = 0;
    sim.hold('top', 179000, { tracking: false, present: false });
    expect(sim.log).toEqual([]);
    sim.hold('top', 1100, { tracking: false, present: false });
    expect(sim.types()).toEqual(['close']);
  });

  it('a set keeps going: the still stop comes 6 s after the restart', () => {
    const sim = inSet({ t0: 50000 });
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 3000);
    sim.t = 0;
    sim.hold('top', 5900);
    expect(sim.log).toEqual([]);
    sim.hold('top', 200);
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.t).toBeGreaterThanOrEqual(6000 - 40);
    // endedAt is on the new clock, before the restart.
    expect(stop.action.endedAt).toBeLessThanOrEqual(0);
    expect(stop.action.endedAt).toBeGreaterThan(-3100); // last rep ≈ 3 s before the restart
    void last;
  });

  it('a pending window continues on the new clock and commits ≈ on time', () => {
    const sim = inSet({ t0: 50000 });
    sim.reps_(2);
    sim.hold('top', 6100);
    const stop = nth(sim.of('stopPending'), 0);
    sim.hold('top', stop.t + 2000 - sim.t);
    sim.t = 0;
    sim.hold('top', 2800);
    expect(sim.of('commit')).toEqual([]);
    expect(sim.auto.pendingUntil).toBeLessThan(3100);
    sim.hold('top', 400);
    const commit = nth(sim.of('commit'), 0);
    expect(commit.t).toBeLessThan(3200);
    expect(commit.action.endedAt).toBeLessThan(commit.t);
  });

  it('rest arming carries over to the new clock', () => {
    const sim = inRest(4000, { t0: 60000 });
    sim.hold('top', 1000);
    sim.t = 0; // 5 s of rest so far; armed 5 s from here
    sim.hold('top', 300);
    sim.reps_(2); // done by ≈ 4.6 s
    expect(sim.log).toEqual([]);
    sim.hold('top', 1500);
    sim.reps_(2);
    expect(sim.types()).toEqual(['start']);
  });
});

describe('pause and phase other', () => {
  it('paused set: no auto stop; after resume the timers restart', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.session('exercise', true);
    sim.hold('top', 20000);
    sim.hold('top', 5000, { tracking: false });
    sim.hold('top', 1000);
    expect(sim.log).toEqual([]);
    sim.session('exercise', false);
    const resumeT = sim.t;
    sim.hold('top', 5900);
    expect(sim.log).toEqual([]);
    sim.hold('top', 200);
    expect(nth(sim.of('stopPending'), 0).t).toBeGreaterThanOrEqual(resumeT + 6000);
  });

  it('paused rest: reps never start a set', () => {
    const sim = inRest(30000);
    sim.session('rest', true, 30000);
    sim.reps_(4);
    sim.hold('top', 1000);
    expect(sim.log).toEqual([]);
    sim.session('rest', false, 30000);
    sim.hold('top', 500);
    sim.rep(); // within 8 s of the last paused rep, but reps seen while paused don't pair
    expect(sim.log).toEqual([]);
    sim.hold('top', 400);
    sim.rep();
    expect(sim.types()).toEqual(['start']);
  });

  it('Pause during the undo window cancels the stop (the user is at the screen)', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('top', 6100);
    sim.session('exercise', true);
    expect(nth(sim.of('stopCancelled'), 0).action).toEqual({
      type: 'stopCancelled',
      reason: 'paused',
    });
    sim.hold('top', 10000);
    expect(sim.of('commit')).toEqual([]);
  });

  it('nothing is proposed while paused; after resume: 6 s still from the resume, endedAt ≥ the resume', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('top', 6100); // stop pending
    sim.session('exercise', true); // Pause inside the window → cancelled
    sim.hold('top', 30000, { jitter: 3 });
    sim.hold('top', 5000, { tracking: false });
    sim.hold('top', 1000);
    expect(sim.types()).toEqual(['stopPending', 'stopCancelled']);
    sim.session('exercise', false);
    const resumeT = sim.t;
    sim.hold('top', 5900, { jitter: 3 }); // a pause is not "Keep going": normal still time
    expect(sim.of('stopPending')).toHaveLength(1);
    sim.hold('top', 200, { jitter: 3 });
    const stop = nth(sim.of('stopPending'), 1);
    expect(stop.t).toBeGreaterThanOrEqual(resumeT + 6000);
    // The reducer doesn't record pauses: the set can't be backdated into the pause.
    expect(stop.action).toMatchObject({ reason: 'still', reps: 2, endedAt: resumeT });
    sim.hold('top', 5100);
    expect(nth(sim.of('commit'), 0).action).toMatchObject({ endedAt: resumeT, reps: 2 });
  });

  it('a rep after the resume backdates normally (endedAt = that rep)', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.session('exercise', true);
    sim.hold('top', 5000);
    sim.session('exercise', false);
    sim.hold('top', 500);
    const rep3 = sim.rep();
    sim.hold('top', 6100);
    expect(nth(sim.of('stopPending'), 0).action).toMatchObject({ reps: 3, endedAt: rep3.t });
  });

  it('a start is never backdated before the last resume', () => {
    const sim = inRest(30000);
    sim.session('rest', true, 30000);
    sim.hold('top', 500);
    sim.hold('down', 600, { angle: (f) => TOP - 100 * f }); // first rep departs while paused…
    sim.session('rest', false, 30000);
    const resumeT = sim.t;
    sim.hold('bottom', 150, { angle: BOTTOM });
    sim.hold('up', 900, { angle: (f) => BOTTOM + (TOP - BOTTOM) * f });
    sim.t += 33;
    sim.frame('top', TOP, true, [repEvent('rep', 1, sim.t, 600, 900)]); // …and ends after resume
    sim.hold('top', 400);
    sim.rep();
    expect(nth(sim.of('start'), 0).action).toMatchObject({ at: resumeT, reps: 2 });
  });

  it("phase 'other' (summary, manual exercise): no actions at all", () => {
    const auto = createAutoSet(AUTO_SET_DEFAULTS);
    const sim = new Sim(auto);
    sim.session('other');
    expect(auto.state).toBe('off');
    sim.hold('top', 1000);
    sim.reps_(4);
    sim.hold('top', 30000);
    sim.hold('top', 200000, { tracking: false });
    expect(sim.log).toEqual([]);
    expect(sim.undo()).toEqual([]);
    expect(sim.confirm()).toEqual([]);
  });

  it('a manual Set done during the window (session → rest) drops the pending stop silently', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('top', 6100);
    sim.session('rest', false, 0);
    sim.hold('top', 6000);
    expect(sim.types()).toEqual(['stopPending']);
    expect(sim.auto.state).toBe('rest');
  });
});

describe('gated but in frame (posture / body-line gate)', () => {
  it('counter not tracking while a person is detected: no away stop', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    // Sat down / knelt: the counter's lean gate fails (tracking false, back to setup).
    sim.hold('setup', 5500, { tracking: false, present: true });
    expect(sim.log).toEqual([]);
    sim.hold('setup', 1000, { tracking: false, present: true });
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.action).toMatchObject({ reason: 'still', endedAt: last.t });
  });

  it('kneeling mid-set for 4 s then carrying on: no stop at all', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('setup', 4000, { tracking: false, present: true });
    sim.hold('setup', 600, { angle: TOP });
    sim.hold('top', 400);
    sim.reps_(2);
    expect(sim.log).toEqual([]);
  });

  it('present: false is out of frame even if a stale tracking flag says otherwise', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('top', 3100, { tracking: false, present: false });
    expect(nth(sim.of('hold'), 0).action).toMatchObject({ reason: 'away' });
  });

  it('idle noPerson uses presence: a gated but visible person keeps the camera open', () => {
    const sim = inRest(5000);
    sim.hold('setup', 200000, { tracking: false, present: true });
    expect(sim.log).toEqual([]);
  });
});

describe('personInFrame', () => {
  const frame = (visible: number): LandmarkFrame => ({
    t: 0,
    landmarks: Array.from({ length: 33 }, (_, i) => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: i < visible ? 0.9 : 0.1,
    })),
  });

  it('is false for no pose and for a few stray landmarks', () => {
    expect(personInFrame({ t: 0, landmarks: [] })).toBe(false);
    expect(personInFrame(frame(3))).toBe(false);
  });

  it('is true for a pose with enough visible landmarks (seated, partly cropped)', () => {
    expect(personInFrame(frame(12))).toBe(true);
    expect(personInFrame(frame(33))).toBe(true);
  });

  it('treats NaN visibility as not visible', () => {
    const f = frame(33);
    for (const l of f.landmarks) l.visibility = Number.NaN;
    expect(personInFrame(f)).toBe(false);
  });
});

describe('idle close', () => {
  it('closes after 180 s with no tracked person (rest)', () => {
    const sim = inRest(5000);
    sim.hold('top', 1000);
    const lost = sim.t;
    sim.hold('top', 179000, { tracking: false });
    expect(sim.log).toEqual([]);
    sim.hold('top', 1100, { tracking: false });
    const close = nth(sim.of('close'), 0);
    expect(close.action).toEqual({ type: 'close', reason: 'noPerson' });
    expect(close.t).toBeGreaterThanOrEqual(lost + 180000 - 40);
    expect(sim.auto.state).toBe('closed');
    sim.hold('top', 2000);
    sim.reps_(3);
    sim.hold('top', 10000);
    expect(sim.types()).toEqual(['close']);
  });

  it('closes after 600 s without a counted rep while the person is visible', () => {
    const sim = inRest(5000);
    sim.hold('top', 2000);
    sim.partial();
    sim.hold('top', 598000 - 650, { jitter: 4 });
    expect(sim.log).toEqual([]);
    sim.hold('top', 2000, { jitter: 4 });
    expect(nth(sim.of('close'), 0).action).toEqual({ type: 'close', reason: 'noRep' });
  });

  it('a rep restarts the no-rep idle time', () => {
    const sim = inRest(5000);
    sim.hold('top', 300000);
    sim.rep();
    sim.hold('top', 590000);
    expect(sim.log).toEqual([]);
  });

  it('a set with < 2 reps can idle-close (no person for 180 s)', () => {
    const sim = inSet();
    sim.rep();
    sim.hold('top', 181000, { tracking: false });
    expect(sim.types()).toEqual(['close']);
  });

  it('never closes during a pending stop', () => {
    // Idle limit (8 s) passes inside the window (still stop at 6 s, window until 11 s).
    const sim = inSet({}, { idleNoRepSec: 8 });
    sim.reps_(2);
    sim.hold('top', 10900);
    expect(sim.types()).toEqual(['stopPending']);
    sim.hold('top', 200);
    expect(sim.types().slice(0, 2)).toEqual(['stopPending', 'commit']);
  });

  it('paused: no idle close; resuming restarts the idle time', () => {
    const sim = inRest(5000);
    sim.session('rest', true, 5000);
    sim.hold('top', 400000, { tracking: false });
    expect(sim.log).toEqual([]);
    sim.session('rest', false, 5000);
    sim.hold('top', 179000, { tracking: false });
    expect(sim.log).toEqual([]);
    sim.hold('top', 1100, { tracking: false });
    expect(sim.types()).toEqual(['close']);
  });
});

describe('noise built like real data', () => {
  it('±5° jitter in the start band at 15–30 fps with dropped frames: still timer not reset', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = inSet({ fps: [15, 30], drop: 0.15, seed });
      const last = nth(sim.reps_(2), 1);
      sim.hold('top', 5800, { jitter: 5 });
      expect(sim.log).toEqual([]);
      sim.hold('top', 400, { jitter: 5 });
      const stop = nth(sim.of('stopPending'), 0);
      expect(stop.action).toMatchObject({ reason: 'still', endedAt: last.t });
      expect(stop.t - last.t).toBeLessThan(6000 + 150);
    }
  });

  it('±5° jitter in rest at 15–30 fps with dropped frames: no start', () => {
    for (const seed of [11, 12, 13]) {
      const sim = inRest(30000, { fps: [15, 30], drop: 0.2, seed });
      sim.hold('top', 120000, { jitter: 5 });
      expect(sim.log).toEqual([]);
    }
  });

  it('1–2 gated frames mid-set, again and again: no away stop', () => {
    const sim = inSet({ fps: [15, 30], drop: 0.1, seed: 21 });
    for (let i = 0; i < 6; i++) {
      sim.rep();
      sim.hold('top', 70, { tracking: false });
      sim.hold('top', 300, { jitter: 4 });
      sim.frame('top', TOP, false);
      sim.hold('top', 300, { jitter: 4 });
    }
    expect(sim.log).toEqual([]);
    expect(sim.auto.counts.reps).toBe(6);
  });

  it('a 450 ms tracking gap mid-rep does not stop or lose the set', () => {
    const sim = inSet({ fps: [15, 30], seed: 31 });
    sim.reps_(2);
    sim.hold('top', 400);
    sim.hold('down', 500, { angle: (f) => TOP - 60 * f });
    sim.gap(450);
    sim.hold('down', 400, { angle: (f) => TOP - 60 - 55 * f });
    sim.hold('bottom', 150, { angle: BOTTOM });
    sim.hold('up', 900, { angle: (f) => BOTTOM + (TOP - BOTTOM) * f });
    sim.t += 40;
    sim.frame('top', TOP, true, [repEvent('rep', 3, sim.t, 900, 900)]);
    expect(sim.log).toEqual([]);
    expect(sim.auto.counts.reps).toBe(3);
  });

  it('a 450 ms gap while still at the top does not reset the still timer', () => {
    const sim = inSet({ fps: [20, 30], seed: 41 });
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 3000, { jitter: 4 });
    sim.gap(450);
    sim.hold('top', 2400, { jitter: 4 });
    expect(sim.log).toEqual([]);
    sim.hold('top', 300, { jitter: 4 });
    expect(nth(sim.of('stopPending'), 0).t - last.t).toBeLessThan(6150);
  });

  it('slow 3 s lowering after a long pause at the top: no still stop mid-rep', () => {
    const sim = inSet({ fps: [15, 30], drop: 0.1, seed: 51 });
    sim.reps_(2);
    sim.hold('top', 4500, { jitter: 5 }); // catching breath, 4.5 s of the 6 s still time used
    sim.rep({ downMs: 1000, upMs: 3000 }); // slow 3 s lowering right after the pause
    sim.hold('top', 600, { jitter: 5 });
    const rep4 = sim.rep({ downMs: 3000, upMs: 3000, bottomMs: 600 });
    expect(sim.log).toEqual([]);
    sim.hold('top', 6200, { jitter: 5 });
    expect(nth(sim.of('stopPending'), 0).action).toMatchObject({ reps: 4, endedAt: rep4.t });
  });

  it('a slow drift inside the start band (getting into the next rep) resets the still timer', () => {
    // Press-like: the counter is still in 'top' while the angle has clearly started moving.
    const sim = inSet({ fps: [15, 30], drop: 0.1, seed: 61 });
    sim.reps_(2);
    sim.hold('top', 3500, { jitter: 4 });
    sim.hold('top', 3000, { angle: (f) => TOP - 25 * f, jitter: 2 });
    expect(sim.log).toEqual([]);
  });

  it('a slow lowering for a start-extended exercise sits in down/bottom/up, never still', () => {
    const sim = inSet({ fps: [15, 30], drop: 0.1, seed: 71 });
    sim.reps_(2);
    sim.hold('down', 3000, { angle: (f) => TOP - (TOP - BOTTOM) * f, jitter: 3 });
    sim.hold('bottom', 1500, { angle: BOTTOM, jitter: 3 });
    sim.hold('up', 3000, { angle: (f) => BOTTOM + (TOP - BOTTOM) * f, jitter: 3 });
    expect(sim.log).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// M5c follow-up: breaks inside a set ("tap to continue"). A posture / body-line gate failing for
// breakGateSec while present, or nobody in frame for awaySec, puts a set with ≥ stopMinReps reps
// on hold. Nothing is saved until a tap (Continue / Start next set / Save set) or an idle limit.
// ---------------------------------------------------------------------------------------------

/** Sitting down (front push-up: the body-line gate fails, the person stays in frame). */
const SIT = { untracked: 'bodyLine', present: true } as const;
const BEND = { untracked: 'posture', present: true } as const;

describe('break: posture / body-line gate', () => {
  it('a gate failing for 5.0 s is a break (hold), with the last rep as endedAt', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 300);
    const from = sim.t;
    sim.hold('setup', 4900, SIT);
    expect(sim.log).toEqual([]);
    sim.hold('setup', 200, SIT);
    const hold = nth(sim.of('hold'), 0);
    expect(hold.action).toEqual({
      type: 'hold',
      reason: 'bodyLine',
      reps: 2,
      partials: 0,
      endedAt: last.t,
    });
    expect(hold.t).toBeGreaterThanOrEqual(from + 5000);
    expect(hold.t).toBeLessThan(from + 5100);
    expect(sim.types()).toEqual(['hold']);
    expect(sim.auto.state).toBe('held');
    expect(sim.auto.counts).toEqual({ reps: 2, partials: 0 });
    expect(sim.auto.pendingUntil).toBeNull();
  });

  it('a posture gate (bending over) reports reason posture', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('setup', 5100, BEND);
    expect(nth(sim.of('hold'), 0).action).toMatchObject({ reason: 'posture', reps: 2 });
  });

  it('a gate failing for 4.9 s then re-tracked is no break, and its frames never feed the still timer', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('setup', 4900, SIT);
    const back = sim.t;
    sim.hold('top', 5900, { jitter: 2 });
    expect(sim.log).toEqual([]);
    sim.hold('top', 200, { jitter: 2 });
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.action).toMatchObject({ reason: 'still', reps: 2, endedAt: last.t });
    expect(stop.t).toBeGreaterThanOrEqual(back + 6000);
    expect(sim.of('hold')).toEqual([]);
  });

  it('a flickering gate (one re-tracked frame) restarts the 5 s', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('setup', 4000, SIT);
    sim.frame('top', TOP); // re-tracked for one frame
    const flickerT = sim.t;
    sim.hold('setup', 4900, SIT);
    expect(sim.log).toEqual([]);
    sim.hold('setup', 200, SIT);
    expect(nth(sim.of('hold'), 0).t).toBeGreaterThanOrEqual(flickerT + 5000);
  });

  it('switching between posture and body-line keeps the gate running (still a break)', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('setup', 2500, BEND);
    sim.hold('setup', 2600, SIT);
    expect(nth(sim.of('hold'), 0).action).toMatchObject({ reason: 'bodyLine' });
  });

  it('a visibility gap of 10 s is never a break (hands out of frame)', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('bottom', 4000, { untracked: 'visibility', present: true });
    sim.hold('top', 10000, { untracked: 'visibility', present: true });
    expect(sim.of('hold')).toEqual([]);
  });

  it('visibility frames inside a sit neither break nor restart the gate clock', () => {
    const sim = inSet();
    sim.reps_(2);
    const from = sim.t;
    sim.hold('setup', 2000, SIT);
    sim.hold('setup', 300, { untracked: 'visibility', present: true });
    sim.hold('setup', 2600, SIT);
    expect(sim.of('hold')).toEqual([]); // 4.9 s since the gate began
    sim.hold('setup', 200, SIT);
    expect(sim.of('hold')).toHaveLength(1);
    expect(nth(sim.of('hold'), 0).t).toBeLessThan(from + 5100);
  });

  it('gated frames never produce still or stalled stops (top or mid-rep)', () => {
    for (const phase of ['top', 'setup', 'bottom'] as const) {
      const sim = inSet();
      sim.reps_(2);
      if (phase === 'bottom') sim.hold('down', 600, { angle: (f) => TOP - 100 * f });
      for (let i = 0; i < 8; i++) {
        sim.hold(phase, 4500, SIT);
        sim.frame(phase, phase === 'bottom' ? BOTTOM : TOP, true, [], true, null);
      }
      expect(sim.log).toEqual([]);
    }
  });

  it('with < 2 reps a sit or a walk-away is nothing', () => {
    const one = inSet();
    one.rep();
    one.hold('setup', 20000, SIT);
    one.hold('top', 10000, { tracking: false, present: false });
    one.hold('setup', 20000, BEND);
    expect(one.log).toEqual([]);
    expect(one.auto.state).toBe('set');
  });

  it('a gate defaults present to true (the counter saw a pose)', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('setup', 4000, { untracked: 'bodyLine' });
    expect(sim.log).toEqual([]);
    sim.hold('setup', 1100, { untracked: 'bodyLine' });
    expect(nth(sim.of('hold'), 0).action).toMatchObject({ reason: 'bodyLine' });
  });

  it('a short bend to the rack (2 s) then standing still: the normal still stop, 6 s after the bend', () => {
    const sim = inSet();
    const last = nth(sim.reps_(3), 2);
    sim.hold('top', 1000);
    sim.hold('setup', 2000, BEND);
    const back = sim.t;
    sim.hold('top', 6100, { jitter: 3 });
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.action).toMatchObject({ reason: 'still', reps: 3, endedAt: last.t });
    expect(stop.t).toBeGreaterThanOrEqual(back + 6000);
    sim.hold('top', 5100);
    expect(sim.types()).toEqual(['stopPending', 'commit']);
  });

  it('a break after a still stop is plain rest: the Undo window commits as usual', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 6100);
    expect(sim.types()).toEqual(['stopPending']);
    sim.hold('setup', 8000, SIT);
    sim.hold('top', 3000, { tracking: false, present: false });
    expect(sim.types()).toEqual(['stopPending', 'commit']);
    expect(nth(sim.of('commit'), 0).action).toMatchObject({ reps: 2, endedAt: last.t });
    expect(sim.auto.state).toBe('rest');
  });

  it('a paused set never goes on hold; resuming restarts the gate clock', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.session('exercise', true);
    sim.hold('setup', 20000, SIT);
    sim.hold('top', 5000, { tracking: false, present: false });
    expect(sim.log).toEqual([]);
    sim.session('exercise', false);
    const resumeT = sim.t;
    sim.hold('setup', 4900, SIT);
    expect(sim.log).toEqual([]);
    sim.hold('setup', 200, SIT);
    expect(nth(sim.of('hold'), 0).t).toBeGreaterThanOrEqual(resumeT + 5000);
  });
});

describe('held set', () => {
  /** 2 reps, then a 6 s sit → held. */
  function heldSet(config?: Partial<AutoSetConfig>): { sim: Sim; lastT: number } {
    const sim = inSet({}, config);
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 300);
    sim.hold('setup', 5100, SIT);
    expect(sim.types()).toEqual(['hold']);
    return { sim, lastT: last.t };
  }

  it('reps while held change no counts and start nothing', () => {
    const { sim } = heldSet();
    sim.hold('top', 1000);
    sim.reps_(4);
    sim.hold('top', 20000, { jitter: 3 });
    sim.reps_(3);
    expect(sim.types()).toEqual(['hold']);
    expect(sim.auto.state).toBe('held');
    expect(sim.auto.counts).toEqual({ reps: 2, partials: 0 });
  });

  it('a walk-away while held is nothing more (one hold)', () => {
    const { sim } = heldSet();
    sim.hold('top', 10000, { tracking: false, present: false });
    sim.hold('setup', 10000, SIT);
    expect(sim.types()).toEqual(['hold']);
  });

  it('Continue → holdEnded, the same counts, fresh stop timers; the later still stop sums the reps', () => {
    const { sim, lastT } = heldSet();
    sim.hold('setup', 10000, SIT); // sitting 16 s in all
    sim.hold('top', 1000);
    expect(sim.continueSet()).toEqual([{ type: 'holdEnded', how: 'continue' }]);
    expect(sim.auto.state).toBe('set');
    expect(sim.auto.counts).toEqual({ reps: 2, partials: 0 });
    sim.hold('top', 500);
    const reps = sim.reps_(5);
    const last = nth(reps, 4);
    expect(sim.auto.counts).toEqual({ reps: 7, partials: 0 });
    sim.hold('top', 6100, { jitter: 2 });
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.action).toMatchObject({ reason: 'still', reps: 7, partials: 0, endedAt: last.t });
    sim.hold('top', 5100);
    const commits = sim.of('commit');
    expect(commits).toHaveLength(1);
    expect(nth(commits, 0).action).toMatchObject({ reps: 7, endedAt: last.t });
    expect(sim.of('start')).toEqual([]);
    void lastT;
  });

  it('Continue restarts the still timer from the tap (normal still time, not doubled)', () => {
    const { sim, lastT } = heldSet();
    sim.hold('top', 2000);
    sim.continueSet();
    const tapT = sim.t;
    sim.hold('top', 5900);
    expect(sim.of('stopPending')).toEqual([]);
    sim.hold('top', 200);
    const stop = nth(sim.of('stopPending'), 0);
    expect(stop.t).toBeGreaterThanOrEqual(tapT + 6000);
    expect(stop.action).toMatchObject({ reason: 'still', reps: 2, endedAt: lastT });
  });

  it('Continue while still out of frame: the away clock starts at the tap', () => {
    const { sim } = heldSet();
    sim.hold('top', 5000, { tracking: false, present: false });
    sim.continueSet();
    const tapT = sim.t;
    sim.hold('top', 2900, { tracking: false, present: false });
    expect(sim.of('hold')).toHaveLength(1);
    sim.hold('top', 200, { tracking: false, present: false });
    expect(sim.of('hold')).toHaveLength(2);
    expect(nth(sim.of('hold'), 1).t).toBeGreaterThanOrEqual(tapT + 3000);
  });

  it('Start next set → commit with the backdated end and the frozen counts, then rest', () => {
    const { sim, lastT } = heldSet();
    sim.hold('top', 3000);
    sim.reps_(2); // not counted
    expect(sim.nextSet()).toEqual([{ type: 'commit', endedAt: lastT, reps: 2, partials: 0 }]);
    expect(sim.auto.state).toBe('rest');
    // The caller then dispatches SET_DONE + START_SET: a fresh set.
    sim.session('exercise');
    expect(sim.auto.state).toBe('set');
    expect(sim.auto.counts).toEqual({ reps: 0, partials: 0 });
  });

  it('confirm (Save set / Set done) while held → commit with the backdated end', () => {
    const { sim, lastT } = heldSet();
    sim.hold('top', 3000);
    expect(sim.confirm()).toEqual([{ type: 'commit', endedAt: lastT, reps: 2, partials: 0 }]);
    expect(sim.auto.state).toBe('rest');
  });

  it('a partial before the hold is kept in the saved counts', () => {
    const sim = inSet();
    sim.reps_(2);
    sim.hold('top', 300);
    const p = sim.partial();
    sim.hold('setup', 5100, SIT);
    expect(nth(sim.of('hold'), 0).action).toMatchObject({ reps: 2, partials: 1, endedAt: p.t });
    expect(sim.nextSet()).toEqual([{ type: 'commit', endedAt: p.t, reps: 2, partials: 1 }]);
  });

  it('idle no-rep while held → commit (backdated) then close', () => {
    const { sim, lastT } = heldSet({ idleNoRepSec: 30 });
    sim.hold('setup', 30000, SIT);
    expect(sim.types()).toEqual(['hold', 'commit', 'close']);
    expect(nth(sim.of('commit'), 0).action).toEqual({
      type: 'commit',
      endedAt: lastT,
      reps: 2,
      partials: 0,
    });
    expect(nth(sim.of('close'), 0).action).toEqual({ type: 'close', reason: 'noRep' });
    expect(sim.auto.state).toBe('closed');
  });

  it('idle no-person while held (walked away) → commit then close', () => {
    const sim = inSet();
    const last = nth(sim.reps_(2), 1);
    sim.hold('top', 200);
    const goneT = sim.t;
    sim.hold('top', 181000, { tracking: false, present: false });
    expect(sim.types()).toEqual(['hold', 'commit', 'close']);
    expect(nth(sim.of('commit'), 0).action).toMatchObject({ endedAt: last.t, reps: 2 });
    expect(nth(sim.of('close'), 0).t).toBeGreaterThanOrEqual(goneT + 180000 - 40);
  });

  it('paused while held → nothing (no idle close); Continue still works', () => {
    const { sim } = heldSet({ idleNoRepSec: 30 });
    sim.session('exercise', true);
    sim.hold('top', 400000, { tracking: false, present: false });
    expect(sim.types()).toEqual(['hold']);
    expect(sim.auto.state).toBe('held');
    sim.session('exercise', false);
    expect(sim.continueSet()).toEqual([{ type: 'holdEnded', how: 'continue' }]);
  });

  it('a manual Set done (session → rest) drops the hold silently; phase other turns it off', () => {
    const a = heldSet().sim;
    a.session('rest', false, 0);
    expect(a.types()).toEqual(['hold']);
    expect(a.auto.state).toBe('rest');
    const b = heldSet().sim;
    b.session('other');
    expect(b.auto.state).toBe('off');
  });

  it('continueSet / nextSet outside a hold do nothing; undo while held does nothing', () => {
    const sim = inSet();
    sim.reps_(2);
    expect(sim.continueSet()).toEqual([]);
    expect(sim.nextSet()).toEqual([]);
    sim.hold('setup', 5100, SIT);
    expect(sim.undo()).toEqual([]);
    expect(sim.auto.state).toBe('held');
    const rest = inRest(30000);
    expect(rest.continueSet()).toEqual([]);
    expect(rest.nextSet()).toEqual([]);
  });

  it('the hold carries over a frame-clock restart (no extra actions)', () => {
    const { sim, lastT } = heldSet();
    sim.t = 0;
    sim.hold('setup', 5000, SIT);
    expect(sim.types()).toEqual(['hold']);
    const commit = nth(sim.nextSet(), 0);
    expect(commit).toMatchObject({ type: 'commit', reps: 2 });
    if (commit.type === 'commit') expect(commit.endedAt).toBeLessThan(0);
    void lastT;
  });
});

describe('plain rest is unchanged around breaks', () => {
  for (const tap of ['confirm', 'nextSet'] as const) {
    it(`${tap} while held after a long break: no auto start within armAfterAutoStopSec (5 s)`, () => {
      const sim = inSet();
      const last = nth(sim.reps_(2), 1);
      sim.hold('top', 300);
      sim.hold('setup', 30000, SIT); // a long break: the rest since rep 2 is well past 10 s
      sim.hold('top', 1000);
      expect(sim.types()).toEqual(['hold']);
      const tapT = sim.t;
      if (tap === 'confirm') sim.confirm();
      else sim.nextSet();
      expect(sim.types()).toEqual(['hold', 'commit']);
      // The caller's SET_DONE → setSession(rest) with the rest backdated to the last rep.
      sim.session('rest', false, sim.t - last.t);
      sim.hold('top', 300);
      sim.reps_(2, 300); // 2 quick reps right after the tap
      expect(sim.t).toBeLessThan(tapT + 5000);
      expect(sim.of('start')).toEqual([]);
      // After the 5 s floor, 2 reps start a set as usual.
      sim.hold('top', 1500);
      sim.reps_(2);
      expect(sim.types()).toEqual(['hold', 'commit', 'start']);
    });
  }

  it('rest in place (tracked, untracked null) → still stop, commit, auto start on 2 reps', () => {
    const sim = inSet();
    const last = nth(sim.reps_(3), 2);
    sim.hold('top', 6100, { untracked: null, jitter: 3 });
    sim.hold('top', 5100, { untracked: null });
    expect(sim.types()).toEqual(['stopPending', 'commit']);
    expect(nth(sim.of('commit'), 0).action).toMatchObject({ reps: 3, endedAt: last.t });
    sim.session('rest', false, sim.t - last.t);
    sim.hold('top', 10000, { untracked: null });
    sim.reps_(2);
    expect(sim.types()).toEqual(['stopPending', 'commit', 'start']);
  });

  it('a break during rest (sit, then walk away) does not disarm auto start', () => {
    const sim = inRest(30000);
    sim.hold('setup', 20000, SIT);
    sim.hold('top', 5000, { tracking: false, present: false });
    sim.hold('top', 1000);
    sim.reps_(2);
    expect(sim.types()).toEqual(['start']);
  });
});
