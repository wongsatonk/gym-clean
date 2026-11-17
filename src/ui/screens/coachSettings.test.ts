import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import type { BrainUnavailableReason } from '../../core/types';
import {
  APPLE_LINE,
  APPLE_TITLE,
  BRAIN_REASON_COPY,
  RULES_TITLE,
  SPEAK_OPTIONS,
  SPEAK_SET_NOTE,
  coachSettingsCopy,
  coachSettingsScreen,
  type CoachSettingsProps,
} from './coachSettings';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

function render(p: Partial<CoachSettingsProps> = {}, withRecheck = true) {
  const log: string[] = [];
  const el = asFake(
    coachSettingsScreen(
      { status: { brain: 'apple' }, ...p },
      {
        onBack: () => log.push('back'),
        onSpeakReplies: (v) => log.push(`speak:${v}`),
        onRecheck: withRecheck ? () => log.push('recheck') : undefined,
      },
    ),
  );
  return { el, log };
}
const at = (el: FakeEl, name: string, value?: string) =>
  el.find(
    (e) => e.hasAttribute(name) && (value === undefined || e.getAttribute(name) === value),
  )[0];

const REASONS: BrainUnavailableReason[] = [
  'deviceNotEligible',
  'appleIntelligenceNotEnabled',
  'modelNotReady',
  'unsupported',
  'notNative',
];

describe('coachSettingsScreen', () => {
  it('a Pro sub-screen: Back, the title, who answers, Speak replies', () => {
    const { el, log } = render();
    expect(el.getAttribute('data-screen')).toBe('coach-settings');
    expect(el.classes).toContain('mood-pro');
    expect(el.byTag('h1')[0]?.textContent).toBe('Coach');
    el.byTag('button')[0]?.click();
    expect(log).toEqual(['back']);
  });

  it('Apple available: "On-device AI" with what it means; no how-to, no Check again', () => {
    const { el } = render();
    const card = at(el, 'data-brain-status', 'apple');
    expect(card?.textContent).toContain(APPLE_TITLE);
    expect(card?.textContent).toContain(APPLE_LINE);
    expect(at(el, 'data-brain-howto')).toBeUndefined();
    expect(at(el, 'data-brain-recheck')).toBeUndefined();
  });

  it('Apple Intelligence off: Quick replies, why, how to turn it on, Check again', () => {
    const { el, log } = render({
      status: { brain: 'rules', reason: 'appleIntelligenceNotEnabled' },
    });
    const card = at(el, 'data-brain-status', 'rules');
    expect(card?.getAttribute('data-brain-reason')).toBe('appleIntelligenceNotEnabled');
    expect(card?.textContent).toContain(RULES_TITLE);
    expect(at(el, 'data-brain-why')?.textContent).toBe('Apple Intelligence is off.');
    expect(at(el, 'data-brain-howto')?.textContent).toContain(
      'iPhone Settings > Apple Intelligence & Siri',
    );
    at(el, 'data-brain-recheck')?.click();
    expect(log).toEqual(['recheck']);
  });

  it('every reason has a why; nothing to fix → no how-to and no Check again', () => {
    for (const reason of REASONS) {
      const { el } = render({ status: { brain: 'rules', reason } });
      expect(at(el, 'data-brain-why')?.textContent).toBe(BRAIN_REASON_COPY[reason].why);
      const fixable = BRAIN_REASON_COPY[reason].how !== null;
      expect(at(el, 'data-brain-howto') !== undefined).toBe(fixable);
      expect(at(el, 'data-brain-recheck') !== undefined).toBe(fixable);
    }
  });

  it('checking: Check again is disabled and says so', () => {
    const { el } = render({ status: { brain: 'rules', reason: 'modelNotReady' }, checking: true });
    const b = at(el, 'data-brain-recheck');
    expect(b?.hasAttribute('disabled')).toBe(true);
    expect(b?.textContent).toBe('Checking…');
  });

  it('no onRecheck → no Check again button', () => {
    const { el } = render({ status: { brain: 'rules', reason: 'modelNotReady' } }, false);
    expect(at(el, 'data-brain-recheck')).toBeUndefined();
  });

  it('Speak replies: Mic only by default, pressed + a check mark (not colour alone)', () => {
    const { el } = render();
    const opts = SPEAK_OPTIONS.map((o) => at(el, 'data-speak-replies', o.id));
    expect(opts.map((b) => b?.textContent)).toEqual(['Mic only', 'Always', 'Off']);
    expect(opts.map((b) => b?.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(opts[0]?.find((e) => e.getAttribute('data-icon') === 'check')).toHaveLength(1);
    expect(at(el, 'data-speak-note')?.textContent).toBe(
      `Speaks a reply when you asked with the mic. ${SPEAK_SET_NOTE}`,
    );
  });

  it('a choice calls back once; tapping the chosen one does nothing', () => {
    const { el, log } = render({ speakReplies: 'always' });
    at(el, 'data-speak-replies', 'always')?.click();
    at(el, 'data-speak-replies', 'off')?.click();
    expect(log).toEqual(['speak:off']);
  });

  it('Off: the note says replies stay on screen (no set line)', () => {
    const { el } = render({ speakReplies: 'off' });
    expect(at(el, 'data-speak-note')?.textContent).toBe('Replies stay on screen only.');
  });

  it('copy passes the coaching-words check', () => {
    for (const s of coachSettingsCopy()) expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
  });
});
