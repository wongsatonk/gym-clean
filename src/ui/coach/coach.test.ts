import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BodyArea } from '../../core/types';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import {
  AREA_CHIPS,
  COACH_CHIPS,
  PRIVACY_LINE,
  awaitingAnswer,
  coachSheet,
  textToSend,
  visibleChips,
  type CoachChipId,
  type CoachItem,
  type CoachSheetProps,
} from './coachSheet';
import { proposalCard, redFlagCard, rowLabel } from './proposalCard';
import { UNDO_MS, undoBarStyle, undoToast } from './undoToast';

useFakeDom();

const RED = 'Stop the workout for today and get checked by a doctor.';
const PROPOSAL = {
  title: 'Go easy on arms',
  lines: [
    { before: 'Bicep Curl', after: 'Leg Curl' },
    { before: 'Skull Crusher', after: '' },
    { before: 'DB Row 20 kg', after: 'DB Row 18 kg' },
  ],
  why: 'Arms are the main target in two exercises.',
};

const buttons = (el: FakeEl) => el.byTag('button');
const byText = (el: FakeEl, t: string) => {
  const hit = buttons(el).find((b) => b.textContent.trim() === t);
  if (!hit)
    throw new Error(
      `no button "${t}" in ${buttons(el)
        .map((b) => b.textContent)
        .join('|')}`,
    );
  return hit;
};
const active = () =>
  (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement;
const key = (k: string, shiftKey = false) => {
  const ev = { key: k, shiftKey, prevented: false, preventDefault: () => (ev.prevented = true) };
  return ev;
};

function mount(p: Partial<CoachSheetProps> = {}) {
  const log: string[] = [];
  const el = asFake(
    coachSheet(
      { items: [], ...p },
      {
        onClose: () => log.push('close'),
        onChip: (id: CoachChipId) => log.push(`chip:${id}`),
        onArea: (a: BodyArea) => log.push(`area:${a}`),
        onText: (t: string) => log.push(`text:${t}`),
        onApply: (i: number) => log.push(`apply:${i}`),
        onDismiss: (i: number) => log.push(`dismiss:${i}`),
        onEndWorkout: () => log.push('end'),
        onFollowUp: (i: number) => log.push(`follow:${i}`),
      },
    ),
  );
  return { el, log };
}

describe('coach chips (pure)', () => {
  it('lists the SPEC quick actions in order, each with a label and an icon', () => {
    expect(COACH_CHIPS.map((c) => c.label)).toEqual([
      'Not today',
      'Go easy on…',
      'Lighter today',
      'Swap an exercise',
      'Adjust my plan',
      'What should I eat?',
    ]);
    for (const c of COACH_CHIPS) expect(c.icon).toBeTruthy();
    expect(AREA_CHIPS.map((a) => a.area)).toEqual([
      'arms',
      'shoulders',
      'chest',
      'back',
      'legs',
      'core',
    ]);
  });

  it('can limit chips, and shows none while a red flag is up', () => {
    expect(visibleChips({ items: [], chips: ['swap', 'lighter'] }).map((c) => c.id)).toEqual([
      'lighter',
      'swap',
    ]);
    expect(visibleChips({ items: [{ kind: 'redFlag', text: RED }] })).toEqual([]);
  });

  it('hides chips while the newest item is a proposal (Apply stays on screen)', () => {
    const proposal: CoachItem = { kind: 'proposal', proposal: PROPOSAL };
    expect(awaitingAnswer([proposal])).toBe(true);
    expect(visibleChips({ items: [proposal] })).toEqual([]);
    const answered: CoachItem[] = [proposal, { kind: 'coach', text: 'OK.' }];
    expect(awaitingAnswer(answered)).toBe(false);
    expect(visibleChips({ items: answered })).toHaveLength(COACH_CHIPS.length);
  });

  it('trims and caps typed text; blank sends nothing', () => {
    expect(textToSend('  my  arms\nhurt ')).toBe('my arms hurt');
    expect(textToSend('   ')).toBeNull();
    expect(textToSend('x'.repeat(300))?.length).toBe(200);
  });

  it('describes before → after rows for screen readers', () => {
    expect(rowLabel({ before: 'Bicep Curl', after: 'Hammer Curl' })).toBe(
      'Bicep Curl, becomes Hammer Curl',
    );
    expect(rowLabel({ before: 'Skull Crusher', after: '' })).toBe('Skull Crusher, removed');
    expect(rowLabel({ before: '', after: 'Push-up' })).toBe('Add Push-up');
  });

  it('drains the Undo bar over the window', () => {
    expect(UNDO_MS).toBe(10_000);
    expect(undoBarStyle(10_000)).toBe('--undo-ms:10000ms');
    expect(undoBarStyle(-5)).toBe('--undo-ms:0ms');
  });
});

describe('coachSheet', () => {
  it('is a modal dialog named Coach with chips, the privacy line and Close', () => {
    const { el, log } = mount({ items: [{ kind: 'coach', text: 'I can help with:' }] });
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.getAttribute('aria-label')).toBe('Coach');
    expect(el.classes).toContain('mood-pro');
    const chips = el.byClass('cs-chip');
    expect(chips.map((c) => c.getAttribute('data-coach-chip'))).toEqual(
      COACH_CHIPS.map((c) => c.id),
    );
    // Labelled icons: every chip has an svg and visible words.
    for (const c of chips) {
      expect(c.byTag('svg')).toHaveLength(1);
      expect(c.textContent.trim().length).toBeGreaterThan(0);
    }
    expect(el.oneByClass('cs-privacy').textContent).toBe(PRIVACY_LINE);
    expect(el.oneByClass('cs-list').getAttribute('role')).toBe('log');
    expect(el.oneByClass('cs-msg-coach').textContent).toBe('Coach: I can help with:');
    byText(el, 'Lighter today').click();
    byText(el, 'Close').click();
    expect(log).toEqual(['chip:lighter', 'close']);
    // No action-colour fill without a proposal.
    expect(el.byClass('primary-btn')).toHaveLength(0);
  });

  it('shows area chips only when asked, and Go easy on… reports expanded', () => {
    expect(mount().el.byClass('cs-area')).toHaveLength(0);
    const { el, log } = mount({ showAreas: true });
    const areas = el.byClass('cs-area');
    expect(areas.map((a) => a.textContent)).toEqual(AREA_CHIPS.map((a) => a.label));
    expect(
      el
        .find((e) => e.getAttribute('data-coach-chip') === 'easyOn')[0]
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    areas[0]?.click();
    expect(log).toEqual(['area:arms']);
  });

  it('offers the text box only with allowTyping; Send and Enter send trimmed text', () => {
    expect(mount().el.byTag('input')).toHaveLength(0);
    const { el, log } = mount({ allowTyping: true });
    const input = el.byTag('input')[0] as FakeEl & { value: string };
    expect(input).toBeTruthy();
    expect(el.byTag('label')[0]?.getAttribute('for')).toBe(input.getAttribute('id'));
    input.value = '  my arms hurt ';
    byText(el, 'Send').click();
    input.value = 'not today';
    const enter = key('Enter');
    input.dispatch('keydown', enter);
    expect(enter.prevented).toBe(true);
    input.value = '   ';
    byText(el, 'Send').click();
    expect(log).toEqual(['text:my arms hurt', 'text:not today']);
  });

  it('renders a proposal in the list; Apply / Not now report its index', () => {
    const items: CoachItem[] = [
      { kind: 'user', text: 'my arms hurt' },
      { kind: 'coach', text: "If something doesn't feel right, check with a doctor or physio." },
      { kind: 'proposal', proposal: PROPOSAL },
    ];
    const { el, log } = mount({ items });
    expect(el.oneByClass('cs-msg-user').textContent).toBe('You: my arms hurt');
    const card = el.oneByClass('proposal-card');
    expect(card.oneByClass('proposal-title').textContent).toBe('Go easy on arms');
    expect(card.byClass('proposal-row')).toHaveLength(3);
    byText(el, 'Apply').click();
    byText(el, 'Not now').click();
    expect(log).toEqual(['apply:2', 'dismiss:2']);
    expect(el.byClass('primary-btn')).toHaveLength(1);
    expect(el.byClass('cs-chip')).toHaveLength(0);
    expect(mount({ items, allowTyping: true, showAreas: true }).el.byTag('input')).toHaveLength(0);
  });

  it('red flag: no chips, no text box, only End workout (in a workout) and Not today', () => {
    const items: CoachItem[] = [{ kind: 'redFlag', text: RED }];
    const home = mount({ items, allowTyping: true, showAreas: true });
    expect(home.el.byClass('cs-chip')).toHaveLength(0);
    expect(home.el.byTag('input')).toHaveLength(0);
    expect(buttons(home.el).map((b) => b.textContent.trim())).toEqual(['Close', 'Not today']);
    const gym = mount({ items, inWorkout: true });
    expect(buttons(gym.el).map((b) => b.textContent.trim())).toEqual([
      'Close',
      'End workout',
      'Not today',
    ]);
    byText(gym.el, 'End workout').click();
    byText(gym.el, 'Not today').click();
    expect(gym.log).toEqual(['end', 'chip:notToday']);
    expect(gym.el.byClass('primary-btn')).toHaveLength(0);
  });

  it('follow-up options: shown with a waiting proposal, report their index, hidden by a red flag', () => {
    const followUps = [{ label: 'Try Hammer Curls' }, { label: 'Push the week instead' }];
    const items: CoachItem[] = [{ kind: 'proposal', proposal: PROPOSAL }];
    const { el, log } = mount({ items, followUps });
    expect(el.byClass('cs-followup').map((b) => b.textContent.trim())).toEqual([
      'Try Hammer Curls',
      'Push the week instead',
    ]);
    byText(el, 'Push the week instead').click();
    expect(log).toEqual(['follow:1']);
    const red = mount({ items: [{ kind: 'redFlag', text: RED }], followUps });
    expect(red.el.byClass('cs-followup')).toHaveLength(0);
  });

  it('Escape closes; Tab and Shift+Tab cycle the controls inside the sheet', () => {
    const { el, log } = mount({
      items: [
        { kind: 'proposal', proposal: PROPOSAL },
        { kind: 'coach', text: 'Anything else?' },
      ],
    });
    const esc = key('Escape');
    el.dispatch('keydown', esc);
    expect(esc.prevented).toBe(true);
    expect(log).toEqual(['close']);
    const order = ['Close', 'Apply', 'Not now', ...COACH_CHIPS.map((c) => c.label)].map((t) =>
      byText(el, t),
    );
    const tab = (shift = false) => {
      const ev = key('Tab', shift);
      el.dispatch('keydown', ev);
      expect(ev.prevented).toBe(true);
      return active();
    };
    for (const want of order) expect(tab()).toBe(want);
    expect(tab()).toBe(order[0]);
    expect(tab(true)).toBe(order[order.length - 1]);
    const other = key('a');
    el.dispatch('keydown', other);
    expect(other.prevented).toBe(false);
  });
});

describe('proposalCard / redFlagCard', () => {
  it('a proposal: title, rows with before and after, why, Apply as the CTA', () => {
    const calls: string[] = [];
    const el = asFake(
      proposalCard(PROPOSAL, {
        onApply: () => calls.push('apply'),
        onDismiss: () => calls.push('dismiss'),
      }),
    );
    const rows = el.byClass('proposal-row');
    expect(rows[0]?.getAttribute('aria-label')).toBe('Bicep Curl, becomes Leg Curl');
    const after = rows[1]?.oneByClass('proposal-after');
    expect(after?.textContent).toBe('Removed');
    // M13 task 20: the arrow is the arrow-right icon, not a typed "→".
    expect(
      after
        ?.oneByClass('proposal-arrow')
        .find((e) => e.getAttribute('data-icon') === 'arrow-right'),
    ).toHaveLength(1);
    expect(el.oneByClass('proposal-why').textContent).toBe(PROPOSAL.why);
    expect(byText(el, 'Apply').classes).toEqual(expect.arrayContaining(['primary-btn', 'cta-btn']));
    byText(el, 'Not now').click();
    expect(calls).toEqual(['dismiss']);
  });

  it('red flag card is an alert with a flag icon and words', () => {
    const el = asFake(redFlagCard(RED, {}));
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.oneByClass('redflag-text').textContent).toBe(RED);
    expect(el.byTag('svg')[0]?.getAttribute('data-icon')).toBe('flag');
    expect(buttons(el)).toHaveLength(0);
  });
});

describe('undoToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function mountToast(durationMs?: number) {
    const log: string[] = [];
    const el = undoToast(
      { text: 'Done. Curls swapped for hammer curls.', durationMs },
      { onUndo: () => log.push('undo'), onExpire: () => log.push('expire') },
    );
    return { el, fake: asFake(el), log };
  }

  it('is a polite status with the text, Undo and a 10 s bar', () => {
    const { fake } = mountToast();
    expect(fake.getAttribute('role')).toBe('status');
    expect(fake.getAttribute('aria-atomic')).toBe('true');
    expect(fake.oneByClass('undo-text').textContent).toBe('Done. Curls swapped for hammer curls.');
    expect(fake.oneByClass('undo-bar').getAttribute('style')).toBe('--undo-ms:10000ms');
    expect(fake.oneByClass('undo-track').getAttribute('aria-hidden')).toBe('true');
  });

  it('expires once after the window', () => {
    const { log } = mountToast();
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(UNDO_MS);
    expect(log).toEqual(['expire']);
  });

  it('Undo cancels the expiry', () => {
    const { fake, log } = mountToast();
    byText(fake, 'Undo').click();
    vi.advanceTimersByTime(UNDO_MS * 2);
    expect(log).toEqual(['undo']);
  });

  it('does not expire once removed or disposed', () => {
    const a = mountToast(500);
    a.fake.isConnected = false;
    vi.advanceTimersByTime(500);
    expect(a.log).toEqual([]);
    const b = mountToast(500);
    b.el.dispose();
    vi.advanceTimersByTime(500);
    expect(b.log).toEqual([]);
  });
});
