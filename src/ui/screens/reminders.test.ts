import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import type { ReminderSettings } from '../../core/types';
import { DEFAULT_REMINDERS } from '../../core/reminders/schedule';
import {
  REMINDERS_ASK,
  REMINDERS_DENIED,
  REMINDERS_PWA_LINE,
  clockText,
  reminderRows,
  remindersCopy,
  remindersScreen,
  validTime,
  type RemindersProps,
} from './reminders';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

function render(p: Partial<RemindersProps> = {}) {
  const log: string[] = [];
  const el = asFake(
    remindersScreen(
      { native: true, settings: DEFAULT_REMINDERS, permission: 'unknown', ...p },
      {
        onBack: () => log.push('back'),
        onToggle: (k, on) => log.push(`${k}:${on}`),
        onTime: (t) => log.push(`time:${t}`),
      },
    ),
  );
  return { el, log };
}
const at = (el: FakeEl, name: string, value?: string) =>
  el.find(
    (e) => e.hasAttribute(name) && (value === undefined || e.getAttribute(name) === value),
  )[0];
const sw = (el: FakeEl, key: string) => at(el, 'data-setting', key);
const ON: ReminderSettings = {
  session: { on: true, time: '07:30' },
  missedDay: { on: false },
  sundayRecap: { on: true },
};

describe('remindersScreen', () => {
  it('PWA: only the one line', () => {
    const { el } = render({ native: false });
    expect(at(el, 'data-reminders-pwa')?.textContent).toBe(REMINDERS_PWA_LINE);
    expect(el.find((e) => e.getAttribute('role') === 'switch')).toHaveLength(0);
  });

  it('three switches, all off by default, each with its line', () => {
    const { el } = render();
    const switches = el.find((e) => e.getAttribute('role') === 'switch');
    expect(switches.map((s) => s.oneByClass('switch-label').textContent)).toEqual([
      'Session reminder',
      'Missed-day nudge',
      'Sunday recap',
    ]);
    expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ]);
    expect(switches.every((s) => s.getAttribute('aria-describedby')?.startsWith('rem-note-'))).toBe(
      true,
    );
    expect(at(el, 'data-reminder-time')).toBeUndefined();
  });

  it('before any permission: the "we will ask" line', () => {
    expect(at(render().el, 'data-reminders-ask')?.textContent).toBe(REMINDERS_ASK);
    expect(at(render({ permission: 'granted' }).el, 'data-reminders-ask')).toBeUndefined();
  });

  it('switches call back with the kind and the new value', () => {
    const { el, log } = render({ settings: ON, permission: 'granted' });
    sw(el, 'reminder-session')?.click();
    sw(el, 'reminder-missed-day')?.click();
    sw(el, 'reminder-sunday-recap')?.click();
    expect(log).toEqual(['session:false', 'missedDay:true', 'sundayRecap:false']);
  });

  it('session on: a labelled time field with his time; a new time calls back', () => {
    const { el, log } = render({ settings: ON, permission: 'granted' });
    const t = at(el, 'data-reminder-time') as FakeEl & { value?: string };
    expect(t.tag).toBe('input');
    expect(t.getAttribute('type')).toBe('time');
    expect(t.value).toBe('07:30');
    expect(el.find((e) => e.tag === 'label' && e.getAttribute('for') === 'rem-time')).toHaveLength(
      1,
    );
    t.value = '07:30';
    t.dispatch('change', {});
    t.value = 'junk';
    t.dispatch('change', {});
    t.value = '18:45';
    t.dispatch('change', {});
    expect(log).toEqual(['time:18:45']);
  });

  it('denied: says none will arrive and how to allow them', () => {
    const { el } = render({ settings: ON, permission: 'denied' });
    const box = at(el, 'data-reminders-denied');
    expect(box?.textContent).toContain(REMINDERS_DENIED);
    expect(box?.textContent).toContain('iPhone Settings > Notifications > Gym Clean');
    expect(at(el, 'data-reminders-ask')).toBeUndefined();
  });

  it('validTime', () => {
    expect(validTime('07:05')).toBe('07:05');
    expect(validTime('23:59:00')).toBe('23:59');
    expect(validTime('24:00')).toBeNull();
    expect(validTime('7:5')).toBeNull();
  });

  it('clockText follows the clock of the locale (as the time picker does)', () => {
    const sp = (s: string) => s.replace(/\s/g, ' ');
    expect(sp(clockText('09:00', 'en-US'))).toBe('09:00 AM');
    expect(sp(clockText('19:00', 'en-US'))).toBe('07:00 PM');
    expect(clockText('09:00', 'en-GB')).toBe('09:00');
    expect(clockText('19:00', 'en-GB')).toBe('19:00');
    expect(clockText('junk', 'en-US')).toBe('junk');
  });

  it('the fixed times in the copy use the same clock: 12 h and 24 h locales', () => {
    const sp = (s: string) => s.replace(/\s/g, ' ');
    const us = reminderRows('en-US');
    expect(sp(us.missedDay.note)).toBe('The morning after a missed session, at 09:00 AM.');
    expect(sp(us.sundayRecap.note)).toBe('Sunday at 07:00 PM: a nudge to look back at your week.');
    const gb = reminderRows('en-GB');
    expect(gb.missedDay.note).toBe('The morning after a missed session, at 09:00.');
    expect(gb.sundayRecap.note).toBe('Sunday at 19:00: a nudge to look back at your week.');
    // The screen draws them with the locale it's given.
    const { el } = render({ locale: 'en-US' });
    expect(sp(at(el, 'id', 'rem-note-missedDay')?.textContent ?? '')).toContain('09:00 AM');
  });

  it('copy passes the coaching-words check and has no numbers about him', () => {
    for (const s of [...remindersCopy('en-US'), ...remindersCopy('en-GB')])
      expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
  });
});
