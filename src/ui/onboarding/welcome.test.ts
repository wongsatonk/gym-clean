// M13 task 12: the first-launch screen (welcome pages + the shell around permission pages). Fake
// DOM; steps come from the real onboardingSteps(), copy from src/data/onboarding.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_NAME, APP_TAGLINE } from '../../core/brand';
import { onboardingSteps, type OnboardingPermission } from '../../core/onboarding';
import type { OnboardingStep } from '../../core/types';
import { ONBOARDING_BUTTONS, WELCOME_PAGES } from '../../data/onboarding';
import { asFake, FakeEl, useFakeDom } from '../screens/testDom';
import { onboardingScreen, stepCount, type OnboardingProps } from './welcome';

useFakeDom();

const NATIVE = onboardingSteps({
  platform: 'native',
  fresh: true,
  intakeDone: true,
  has: { health: true, mic: true, notifications: true },
});
const WEB = onboardingSteps({
  platform: 'web',
  fresh: true,
  intakeDone: true,
  has: { health: false, mic: false, notifications: false },
});

type Calls = {
  next: number;
  back: number;
  skip: number;
  done: number;
  allow: OnboardingPermission[];
  notNow: OnboardingPermission[];
};

function render(over: Partial<OnboardingProps> = {}) {
  const calls: Calls = { next: 0, back: 0, skip: 0, done: 0, allow: [], notNow: [] };
  const screen = onboardingScreen(
    { steps: NATIVE, index: 0, ...over },
    {
      onNext: () => calls.next++,
      onBack: () => calls.back++,
      onSkipAll: () => calls.skip++,
      onDone: () => calls.done++,
      onAllow: (p) => calls.allow.push(p),
      onNotNow: (p) => calls.notNow.push(p),
    },
  );
  return { screen, el: asFake(screen.el), calls };
}

const ob = (el: FakeEl, key: string) => el.find((e) => e.getAttribute('data-ob') === key);
const one = (el: FakeEl, key: string) => {
  const hit = ob(el, key)[0];
  if (!hit) throw new Error(`no [data-ob=${key}]`);
  return hit;
};

let animate: ReturnType<typeof vi.fn>;
function setReduced(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce') }));
}
beforeEach(() => {
  animate = vi.fn(() => ({ cancel: vi.fn() }));
  (FakeEl.prototype as unknown as { animate: unknown }).animate = animate;
  setReduced(false);
});
afterEach(() => {
  delete (FakeEl.prototype as unknown as { animate?: unknown }).animate;
  vi.unstubAllGlobals();
});

describe('onboardingScreen: welcome pages', () => {
  it('is a modal dialog labelled by the page title', () => {
    const { el } = render();
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    const id = el.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    expect(el.find((e) => e.getAttribute('id') === id)).toHaveLength(1);
  });

  it('page 1 is the lockup: mark, APP_NAME as the title, tagline, body', () => {
    const { el } = render();
    const lockup = el.find((e) => e.getAttribute('data-brand') === 'lockup')[0];
    expect(lockup?.classes).toContain('brand-lg');
    const name = lockup?.find((e) => e.getAttribute('data-brand') === 'name')[0];
    expect(name?.textContent).toBe(APP_NAME);
    expect(name?.getAttribute('id')).toBe(el.getAttribute('aria-labelledby'));
    expect(lockup?.find((e) => e.getAttribute('data-brand') === 'tagline')[0]?.textContent).toBe(
      APP_TAGLINE,
    );
    expect(one(el, 'body').textContent).toBe(WELCOME_PAGES.hello.body);
    expect(one(el, 'page').getAttribute('data-step')).toBe('welcome:hello');
  });

  it('later welcome pages show their title and body', () => {
    const { el } = render({ index: 1 });
    expect(one(el, 'title').textContent).toBe(WELCOME_PAGES.train.title);
    expect(one(el, 'body').textContent).toBe(WELCOME_PAGES.train.body);
    expect(el.find((e) => e.getAttribute('data-brand') === 'lockup')).toHaveLength(0);
  });

  it('Skip is visible on every page and calls onSkipAll', () => {
    NATIVE.forEach((_, index) => {
      const { el, calls } = render({ index });
      const skip = one(el, 'skip');
      expect(skip.textContent).toBe(ONBOARDING_BUTTONS.skip);
      skip.click();
      expect(calls.skip).toBe(1);
    });
  });

  it('the page indicator says it in words and by shape, not colour alone', () => {
    const { el } = render({ index: 1 });
    expect(one(el, 'count').textContent).toBe(stepCount(1, NATIVE.length));
    expect(stepCount(1, 7)).toBe('2 of 7');
    const dots = one(el, 'dots');
    expect(dots.getAttribute('aria-hidden')).toBe('true');
    expect(dots.children).toHaveLength(NATIVE.length);
    expect(dots.children.map((d) => d.classes.includes('on'))).toEqual(
      NATIVE.map((_, i) => i === 1),
    );
    expect(one(el, 'live').textContent).toBe(`Page 2 of ${NATIVE.length}: Train with a guide`);
  });

  it('Next calls onNext; Back calls onBack and is disabled on page 1', () => {
    const first = render();
    expect(one(first.el, 'back').hasAttribute('disabled')).toBe(true);
    const next = one(first.el, 'primary');
    expect(next.textContent).toBe(ONBOARDING_BUTTONS.next);
    next.click();
    expect(first.calls.next).toBe(1);
    const second = render({ index: 1 });
    expect(one(second.el, 'back').hasAttribute('disabled')).toBe(false);
    expect(one(second.el, 'back').textContent).toBe(ONBOARDING_BUTTONS.back);
    one(second.el, 'back').click();
    expect(second.calls.back).toBe(1);
  });

  it('the last page says "Go to Today" and calls onDone', () => {
    const steps: OnboardingStep[] = [
      { kind: 'welcome', id: 'hello' },
      { kind: 'welcome', id: 'coach' },
    ];
    const { el, calls } = render({ steps, index: 1 });
    const done = one(el, 'primary');
    expect(done.textContent).toBe(ONBOARDING_BUTTONS.done);
    done.click();
    expect(calls.done).toBe(1);
    expect(calls.next).toBe(0);
  });

  it('keys: Escape skips, arrows move (no keyboard needed, buttons are the way through)', () => {
    const { el, calls } = render({ index: 1 });
    const key = (k: string) => el.dispatch('keydown', { key: k, preventDefault: vi.fn() });
    key('Escape');
    key('ArrowRight');
    key('ArrowLeft');
    expect(calls).toMatchObject({ skip: 1, next: 1, back: 1 });
  });
});

describe('onboardingScreen: permission pages', () => {
  const at = (p: OnboardingPermission) =>
    NATIVE.findIndex((s) => s.kind === 'permission' && s.permission === p);

  it('a page with an ask puts the action first, then Back + Not now', () => {
    const { el, calls } = render({ index: at('camera') });
    const primary = one(el, 'primary');
    expect(primary.textContent).toBe('Allow camera');
    primary.click();
    expect(calls.allow).toEqual(['camera']);
    one(el, 'not-now').click();
    expect(calls.notNow).toEqual(['camera']);
    expect(calls.next).toBe(0);
    one(el, 'back').click();
    expect(calls.back).toBe(1);
  });

  it('ArrowRight does not walk past an ask (Not now / the action are the choices)', () => {
    const { el, calls } = render({ index: at('camera') });
    el.dispatch('keydown', { key: 'ArrowRight', preventDefault: vi.fn() });
    expect(calls.next + calls.allow.length + calls.notNow.length).toBe(0);
  });

  it('the mic page has no Allow and no Not now: Next only', () => {
    const { el, calls } = render({ index: at('mic') });
    expect(ob(el, 'not-now')).toHaveLength(0);
    const primary = one(el, 'primary');
    expect(primary.textContent).toBe(ONBOARDING_BUTTONS.next);
    primary.click();
    expect(calls).toMatchObject({ next: 1, allow: [] });
  });

  it('an allowed permission moves on with Next (or Go to Today on the last page)', () => {
    const last = NATIVE.length - 1;
    const step = NATIVE[last];
    const p = step?.kind === 'permission' ? step.permission : 'notifications';
    const { el, calls } = render({ index: last, granted: { [p]: true } });
    expect(ob(el, 'not-now')).toHaveLength(0);
    const primary = one(el, 'primary');
    expect(primary.textContent).toBe(ONBOARDING_BUTTONS.done);
    primary.click();
    expect(calls.done).toBe(1);
  });

  it('PWA: only the camera permission page is reachable', () => {
    const perms = WEB.map((_, index) => one(render({ steps: WEB, index }).el, 'page'))
      .map((p) => p.getAttribute('data-step'))
      .filter((s) => s?.startsWith('permission:'));
    expect(perms).toEqual(['permission:camera']);
  });

  it('the native flow shows all four permission pages in order', () => {
    const perms = NATIVE.map((_, index) => one(render({ index }).el, 'page'))
      .map((p) => p.getAttribute('data-step'))
      .filter((s) => s?.startsWith('permission:'));
    expect(perms).toEqual([
      'permission:camera',
      'permission:health',
      'permission:mic',
      'permission:notifications',
    ]);
  });
});

describe('onboardingScreen: motion', () => {
  it('slides the page in the direction of travel', () => {
    render({ index: 1, dir: 'next' });
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('first show (no dir) does not animate', () => {
    render();
    expect(animate).not.toHaveBeenCalled();
  });

  it('reduced motion: the page change is instant', () => {
    setReduced(true);
    render({ index: 1, dir: 'next' });
    expect(animate).not.toHaveBeenCalled();
  });
});
