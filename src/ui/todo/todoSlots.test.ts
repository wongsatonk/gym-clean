// M12 slice 1c task 9: the to-do card slot on Today and the To-dos rows in Settings.
// (Kept apart from today.test.ts / settings.test.ts, which other tasks edit at the same time.)
import { describe, expect, it } from 'vitest';
import type { WeekDot } from '../../core/stats';
import { program } from '../../data/catalog';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { settingsScreen, type SettingsActions } from '../screens/settings';
import { todayScreen, type TodayActions, type TodayProps } from '../screens/today';

useFakeDom();

const NOW = new Date(2026, 10, 16, 18).getTime();
const DOTS: WeekDot[] = Array.from({ length: 7 }, (_, i) => ({
  dayStart: new Date(2026, 10, 16 + i).getTime(),
  state: i === 0 ? 'today' : 'future',
}));

function today(over: Partial<TodayProps> = {}, act: Partial<TodayActions> = {}) {
  return asFake(
    todayScreen(
      {
        now: NOW,
        days: program.days,
        upNextDayId: program.days[0]?.id ?? null,
        streakWeeks: 2,
        weekDots: DOTS,
        last: null,
        unit: 'kg',
        ...over,
      },
      { onStart: () => {}, onOpenDay: () => {}, onTab: () => {}, ...act },
    ),
  );
}

const card = (el: FakeEl) => el.find((e) => e.hasAttribute('data-todo-card'))[0];
const TODO = { done: 6, total: 12, visible: true, nextTitle: 'Coach tab + Calendar' };

describe('Today to-do card slot', () => {
  it('shows the card right after the hero (Start), and it opens the list', () => {
    let opened = 0;
    const el = today({ todo: TODO }, { onOpenTodos: () => opened++ });
    const c = card(el);
    expect(c?.textContent).toContain('To-dos: 6 of 12 done');
    const kids = el.children;
    const heroAt = kids.findIndex((k) => k.hasAttribute('data-hero'));
    const cardAt = kids.findIndex((k) => k.hasAttribute('data-todo-card'));
    expect(heroAt).toBeGreaterThan(0);
    expect(cardAt).toBe(heroAt + 1); // below Start, never above it
    expect(kids[heroAt]?.find((e) => e.hasAttribute('data-start'))).toHaveLength(1);
    c?.click();
    expect(opened).toBe(1);
  });

  it('hidden when all done, without the prop, or without the callback', () => {
    expect(
      card(today({ todo: { ...TODO, visible: false } }, { onOpenTodos: () => {} })),
    ).toBeUndefined();
    expect(card(today({}, { onOpenTodos: () => {} }))).toBeUndefined();
    expect(card(today({ todo: TODO }))).toBeUndefined();
  });

  it('shows the re-sign line at ≤ 2 days', () => {
    const el = today({ todo: { ...TODO, resignDaysLeft: 2 } }, { onOpenTodos: () => {} });
    expect(card(el)?.textContent).toContain('Re-sign in 2 days');
  });
});

const slot = (attr: string) => {
  const el = new FakeEl('div');
  el.setAttribute(attr, '');
  return el as unknown as HTMLElement;
};

function settings(act: Partial<SettingsActions> = {}) {
  return asFake(
    settingsScreen(
      {
        accent: 'orange',
        spokenCount: true,
        coachTips: true,
        handsFree: false,
        unit: 'kg',
        coachVoice: slot('data-coach-voice'),
        speakerCheck: slot('data-voice-test'),
        audioTest: slot('data-audio-test'),
        devLog: slot('data-devlog'),
      },
      {
        onAccent: () => {},
        onSpokenCount: () => {},
        onCoachTips: () => {},
        onHandsFree: () => {},
        onUnit: () => {},
        onCameraTest: () => {},
        onTab: () => {},
        ...act,
      },
    ),
  );
}

describe('Settings To-dos rows', () => {
  it('"To-dos" and "What\'s new" rows call back', () => {
    const calls = { todos: 0, whatsNew: 0 };
    const el = settings({ onTodos: () => calls.todos++, onWhatsNew: () => calls.whatsNew++ });
    const section = el.find((e) => e.getAttribute('data-section') === 'todos')[0];
    expect(section).toBeDefined();
    const open = el.find((e) => e.hasAttribute('data-todos-open'))[0];
    const replay = el.find((e) => e.hasAttribute('data-whats-new-open'))[0];
    expect(open?.textContent).toBe('To-dos');
    expect(replay?.textContent).toBe("What's new");
    expect(open?.classes).toContain('set-row');
    expect(replay?.hasAttribute('data-icon-btn')).toBe(true);
    open?.click();
    replay?.click();
    expect(calls).toEqual({ todos: 1, whatsNew: 1 });
  });

  it('no callbacks → no To-dos section (unchanged)', () => {
    expect(settings().find((e) => e.getAttribute('data-section') === 'todos')).toHaveLength(0);
  });

  it('sits before Backup and the developer log', () => {
    const el = settings({ onTodos: () => {} });
    const keys = el.find((e) => e.tag === 'section').map((s) => s.getAttribute('data-section'));
    expect(keys.indexOf('todos')).toBeLessThan(keys.indexOf('devlog'));
  });
});
