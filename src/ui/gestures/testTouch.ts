// Test-only: a finger for the fake DOM (src/ui/screens/testDom.ts `dispatch`). Sends touchstart,
// touchmove every 16 ms (a phone's frames) and touchend to one element, the way the swipe
// trackers read them (touches / changedTouches / timeStamp / target / preventDefault).

export type Dispatchable = { dispatch: (type: string, ev: unknown) => void };

export type FakeSwipe = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  steps?: number;
  /** Hold still this long before lifting (no flick). */
  holdMs?: number;
  /** false: leave the finger down. */
  release?: boolean;
  /** `event.target` (the element under the finger); the dispatching element by default. */
  target?: unknown;
};

export type FakeSwipeResult = { prevented: number; lift: () => void };

let clock = 1000;

export function fakeSwipe(el: Dispatchable, s: FakeSwipe): FakeSwipeResult {
  const { from, to, steps = 12, holdMs = 160, release = true } = s;
  const target = s.target ?? el;
  let prevented = 0;
  const ev = (x: number, y: number, down: boolean) => {
    const touch = { clientX: x, clientY: y };
    return {
      touches: down ? [touch] : [],
      changedTouches: [touch],
      timeStamp: clock,
      target,
      cancelable: true,
      preventDefault: () => {
        prevented++;
      },
    };
  };
  el.dispatch('touchstart', ev(from.x, from.y, true));
  let x = from.x;
  let y = from.y;
  for (let i = 1; i <= steps; i++) {
    clock += 16;
    x = from.x + ((to.x - from.x) * i) / steps;
    y = from.y + ((to.y - from.y) * i) / steps;
    el.dispatch('touchmove', ev(x, y, true));
  }
  clock += holdMs;
  const lift = () => {
    clock += 16;
    el.dispatch('touchend', ev(x, y, false));
  };
  if (release) lift();
  return {
    get prevented() {
      return prevented;
    },
    lift,
  };
}
