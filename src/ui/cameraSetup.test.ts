// M13b task 14: the "Set up your phone" card gets out of the way. Timing (pure control) and the
// "Step into frame" strip (fake DOM). Layout on the live view: e2e/camera-layout.spec.ts.
import { describe, expect, it } from 'vitest';
import {
  createFrameStrip,
  createSetupControl,
  SETUP_MANUAL_MS,
  SETUP_MAX_MS,
  SETUP_STABLE_MS,
  STRIP_LOST_MS,
  STRIP_SPEAK_MS,
  STRIP_TEXT,
  type SetupTick,
} from './cameraSetup';
import { asFake, useFakeDom } from './screens/testDom';

const tick = (t: number, over: Partial<SetupTick> = {}): SetupTick => ({
  t,
  inFrame: true,
  counted: false,
  live: true,
  speakable: true,
  ...over,
});

/** Runs ticks every 100 ms from `from` to `to` (inclusive); returns the last result. */
function run(
  c: ReturnType<typeof createSetupControl>,
  from: number,
  to: number,
  over: Partial<SetupTick> = {},
) {
  let last = c.tick(tick(from, over));
  let spoken = last.speak ? 1 : 0;
  for (let t = from + 100; t <= to; t += 100) {
    last = c.tick(tick(t, over));
    if (last.speak) spoken++;
  }
  return { ...last, spoken };
}

describe('set-up card timing', () => {
  it('constants: 1.5 s stable, 10 s at most, strip after 1 s lost', () => {
    expect(SETUP_STABLE_MS).toBe(1500);
    expect(SETUP_MAX_MS).toBe(10_000);
    expect(STRIP_LOST_MS).toBe(1000);
    expect(SETUP_MANUAL_MS).toBe(8000);
    // The strip's own line waits past the focus outOfFrame cue (2 s), so it never doubles it.
    expect(STRIP_SPEAK_MS).toBeGreaterThan(2000);
  });

  it('starts open when the exercise has a placement, closed otherwise', () => {
    expect(createSetupControl(true).card).toBe(true);
    expect(createSetupControl(false).card).toBe(false);
    expect(createSetupControl(false).tick(tick(0, { inFrame: false })).card).toBe(false);
  });

  it('closes after 1.5 s of stable tracking (as before)', () => {
    const c = createSetupControl(true);
    expect(run(c, 0, 1400).card).toBe(true);
    expect(c.tick(tick(1500)).card).toBe(false);
  });

  it('a tracking drop restarts the 1.5 s', () => {
    const c = createSetupControl(true);
    run(c, 0, 1000);
    c.tick(tick(1100, { inFrame: false }));
    expect(run(c, 1200, 2600).card).toBe(true);
    expect(c.tick(tick(2700)).card).toBe(false);
  });

  it('closes by itself after 10 s even if he is never tracked', () => {
    const c = createSetupControl(true);
    expect(run(c, 0, 9900, { inFrame: false }).card).toBe(true);
    expect(c.tick(tick(10_000, { inFrame: false })).card).toBe(false);
  });

  it('the 10 s counts from the first tick (camera running), not from creation', () => {
    const c = createSetupControl(true);
    expect(run(c, 50_000, 59_900, { inFrame: false }).card).toBe(true);
    expect(c.tick(tick(60_000, { inFrame: false })).card).toBe(false);
  });

  it('the first rep closes the card at once', () => {
    const c = createSetupControl(true);
    run(c, 0, 500, { inFrame: false });
    expect(c.tick(tick(600, { counted: true })).card).toBe(false);
  });

  it('never comes back by itself: before the first rep a loss shows the strip, not the card', () => {
    const c = createSetupControl(true);
    run(c, 0, 1500);
    expect(c.card).toBe(false);
    const r = run(c, 1600, 6000, { inFrame: false });
    expect(r.card).toBe(false);
    expect(r.strip).toBe(true);
    // Not mid-set yet: shown, not spoken (the placement sentence was the spoken part).
    expect(r.spoken).toBe(0);
  });

  it('"Got it" closes it; it does not come back on a loss', () => {
    const c = createSetupControl(true);
    run(c, 0, 500, { inFrame: false });
    c.dismiss();
    expect(c.card).toBe(false);
    expect(run(c, 600, 5000, { inFrame: false }).card).toBe(false);
  });

  it('after the first rep: 3 s out of frame → strip, card hidden, spoken once', () => {
    const c = createSetupControl(true);
    run(c, 0, 1500);
    run(c, 1600, 4000, { counted: true });
    // Lost at 4100. Nothing for the first second (tracking flickers).
    expect(run(c, 4100, 5000, { counted: true, inFrame: false }).strip).toBe(false);
    const r = run(c, 5100, 7100, { counted: true, inFrame: false });
    expect(r.card).toBe(false);
    expect(r.strip).toBe(true);
    expect(r.spoken).toBe(1);
    // Still lost for a long time: said once per loss, not repeated.
    expect(run(c, 7200, 30_000, { counted: true, inFrame: false }).spoken).toBe(0);
  });

  it('the strip goes as soon as he is back; the next loss is spoken again', () => {
    const c = createSetupControl(false);
    run(c, 0, 3000, { counted: true, inFrame: false });
    expect(c.tick(tick(3100, { counted: true })).strip).toBe(false);
    expect(run(c, 3200, 6000, { counted: true, inFrame: false }).spoken).toBe(1);
  });

  it('not spoken when the focus outOfFrame cue already said it for this loss', () => {
    const c = createSetupControl(false);
    run(c, 0, 2000, { counted: true, inFrame: false });
    c.heardOutOfFrame();
    const r = run(c, 2100, 6000, { counted: true, inFrame: false });
    expect(r.strip).toBe(true);
    expect(r.spoken).toBe(0);
    // A new loss after he came back is spoken again.
    c.tick(tick(6100, { counted: true }));
    expect(run(c, 6200, 9000, { counted: true, inFrame: false }).spoken).toBe(1);
  });

  it('not spoken while speech would be wrong (hands-free stop follows); shown still', () => {
    const c = createSetupControl(false);
    const r = run(c, 0, 5000, { counted: true, inFrame: false, speakable: false });
    expect(r.strip).toBe(true);
    expect(r.spoken).toBe(0);
  });

  it('no strip outside a live set (rest, Undo window, hold)', () => {
    const c = createSetupControl(false);
    const r = run(c, 0, 5000, { counted: true, inFrame: false, live: false });
    expect(r.strip).toBe(false);
    expect(r.spoken).toBe(0);
  });

  it('"Phone position" opens the card mid-set; it holds 8 s, then closes on tracking', () => {
    const c = createSetupControl(true);
    run(c, 0, 1500);
    run(c, 1600, 3000, { counted: true });
    c.openManual(3000);
    expect(c.card).toBe(true);
    // No strip under an open card, and nothing spoken.
    const lost = run(c, 3100, 6000, { counted: true, inFrame: false });
    expect(lost.strip).toBe(false);
    expect(lost.spoken).toBe(0);
    expect(run(c, 6100, 10_900, { counted: true }).card).toBe(true);
    expect(c.tick(tick(11_000, { counted: true })).card).toBe(false);
  });

  it('a manually opened card also closes after 10 s at most', () => {
    const c = createSetupControl(false);
    c.openManual(1000);
    expect(run(c, 1000, 10_900, { inFrame: false, counted: true }).card).toBe(true);
    expect(c.tick(tick(11_000, { inFrame: false, counted: true })).card).toBe(false);
  });
});

describe('"Step into frame" strip', () => {
  useFakeDom();

  it('one line, a polite status, hidden until shown', () => {
    const s = createFrameStrip();
    const el = asFake(s.el);
    expect(STRIP_TEXT).toBe('Step into frame');
    expect(el.textContent).toBe('Step into frame');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('class')).toBe('cam-frame-strip');
    expect(el.hasAttribute('hidden')).toBe(true);
    expect(el.getAttribute('data-frame-strip')).toBe('hidden');
    s.show(true);
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.getAttribute('data-frame-strip')).toBe('shown');
    s.show(false);
    expect(el.hasAttribute('hidden')).toBe(true);
  });
});
