// M13 task 12: one permission page per kind (ask / connect / none / reminder). Fake DOM; the copy
// is the real data in src/data/onboarding.ts.
import { describe, expect, it } from 'vitest';
import { PERMISSION_ORDER, type OnboardingPermission } from '../../core/onboarding';
import { PERMISSION_PAGES } from '../../data/onboarding';
import { asFake, type FakeEl, useFakeDom } from '../screens/testDom';
import { PERMISSION_ICON, permissionPage } from './permissionPage';

useFakeDom();

const ob = (el: FakeEl, key: string) => el.find((e) => e.getAttribute('data-ob') === key);

function render(permission: OnboardingPermission, granted = false) {
  const calls = { allow: [] as OnboardingPermission[], notNow: [] as OnboardingPermission[] };
  const page = permissionPage(
    { permission, granted, titleId: 'ob-title' },
    { onAllow: (p) => calls.allow.push(p), onNotNow: (p) => calls.notNow.push(p) },
  );
  const body = asFake(page.body);
  return { page, body, calls };
}

describe('permissionPage', () => {
  it.each(PERMISSION_ORDER)('%s: title (the dialog label), why and an icon', (p) => {
    const { body } = render(p);
    expect(body.getAttribute('data-permission')).toBe(p);
    const title = ob(body, 'title')[0];
    expect(title?.tag).toBe('h2');
    expect(title?.getAttribute('id')).toBe('ob-title');
    expect(title?.textContent).toBe(PERMISSION_PAGES[p].title);
    expect(ob(body, 'why')[0]?.textContent).toBe(PERMISSION_PAGES[p].why);
    expect(body.byTag('svg')[0]?.getAttribute('data-icon')).toBe(PERMISSION_ICON[p]);
  });

  it.each(['camera', 'health', 'notifications'] as const)(
    '%s: the action button calls onAllow with the permission; Not now calls onNotNow',
    (p) => {
      const { page, calls } = render(p);
      const action = PERMISSION_PAGES[p].action;
      if (action.kind === 'none') throw new Error('expected an action');
      const allow = asFake(page.allow);
      expect(allow.textContent).toBe(action.label);
      expect(allow.getAttribute('data-action-kind')).toBe(action.kind);
      allow.click();
      expect(calls.allow).toEqual([p]);
      const notNow = asFake(page.notNow);
      expect(notNow.textContent).toBe(PERMISSION_PAGES[p].notNow);
      notNow.click();
      expect(calls.notNow).toEqual([p]);
    },
  );

  it('kinds match the data: camera asks, Health connects, reminders switch the reminder on', () => {
    expect(asFake(render('camera').page.allow).getAttribute('data-action-kind')).toBe('ask');
    expect(asFake(render('health').page.allow).getAttribute('data-action-kind')).toBe('connect');
    expect(asFake(render('notifications').page.allow).getAttribute('data-action-kind')).toBe(
      'reminder',
    );
  });

  it('mic explains only: no Allow and no Not now, the note says when the phone asks', () => {
    const { page, body } = render('mic');
    expect(page.allow).toBeNull();
    expect(page.notNow).toBeNull();
    const action = PERMISSION_PAGES.mic.action;
    expect(action.kind).toBe('none');
    if (action.kind === 'none') expect(ob(body, 'note')[0]?.textContent).toBe(action.note);
    expect(body.byTag('button')).toHaveLength(0);
  });

  it('an allowed permission shows "Allowed" (icon + word) and no ask', () => {
    const { page, body } = render('camera', true);
    expect(page.allow).toBeNull();
    expect(page.notNow).toBeNull();
    const done = ob(body, 'granted')[0];
    expect(done?.textContent).toContain('Allowed');
    expect(done?.byTag('svg')[0]?.getAttribute('data-icon')).toBe('check');
  });
});
