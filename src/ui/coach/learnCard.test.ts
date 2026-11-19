import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage, LearnCard } from '../../core/types';
import { byAttr, copyHits, oneAttr, texts } from '../fuel/fuelTestUtil';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { chat, type ChatActions } from './chat';
import { LEARN_CARDS } from '../../data/learnCards';
import {
  GOT_IT,
  HIDE_WHY_ATTR,
  WHY_HEADING,
  bodyParagraphs,
  closeLearnCard,
  findLearnCard,
  learnCardOpen,
  learnCardSheet,
  openLearnCard,
  whyButton,
} from './learnCard';

useFakeDom();

// Made-up cards (the real ~10 are core data, task 21).
const EFFORT: LearnCard = {
  id: 'effort',
  title: 'How hard was that set?',
  body: 'Easy means 3 or more reps left.\nGood means about 2 left.\n\nHard means 0 to 1 left.',
  why: 'It tells the coach when to add weight next time.',
};
const PROTEIN: LearnCard = {
  id: 'protein',
  title: 'Protein through the day',
  body: 'Spread it over your meals.',
};

// FakeEl has no remove(): mark it detached, like the browser would.
const removed: FakeEl[] = [];
beforeEach(() => {
  removed.length = 0;
  (FakeEl.prototype as unknown as { remove: () => void }).remove = function (this: FakeEl) {
    this.isConnected = false;
    removed.push(this);
  };
});
afterEach(() => {
  closeLearnCard();
  delete (FakeEl.prototype as unknown as { remove?: () => void }).remove;
});

const key = (k: string, shiftKey = false) => {
  let prevented = false;
  return {
    ev: { key: k, shiftKey, preventDefault: () => (prevented = true) },
    prevented: () => prevented,
  };
};
const active = () =>
  (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement;

describe('learn card helpers', () => {
  it('bodyParagraphs splits on blank lines and joins single newlines', () => {
    expect(bodyParagraphs(EFFORT.body)).toEqual([
      'Easy means 3 or more reps left. Good means about 2 left.',
      'Hard means 0 to 1 left.',
    ]);
    expect(bodyParagraphs('  \n\n ')).toEqual([]);
  });

  it('findLearnCard finds by id; a missing or stale id gives null', () => {
    expect(findLearnCard([EFFORT, PROTEIN], 'protein')).toBe(PROTEIN);
    expect(findLearnCard([EFFORT], 'gone')).toBeNull();
    expect(findLearnCard([EFFORT], undefined)).toBeNull();
  });
});

describe('learnCardSheet', () => {
  it('is a modal dialog named by its title, with the body, the why block and Got it', () => {
    const el = asFake(learnCardSheet(EFFORT, { onClose: () => {} }));
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.getAttribute('data-learn-sheet')).toBe('effort');
    const title = oneAttr(el, 'data-learn-title');
    expect(title.textContent).toBe(EFFORT.title);
    expect(el.getAttribute('aria-labelledby')).toBe(title.getAttribute('id'));
    expect(
      oneAttr(el, 'data-learn-body')
        .byTag('p')
        .map((p) => p.textContent),
    ).toHaveLength(2);
    const why = oneAttr(el, 'data-learn-why');
    expect(why.textContent).toContain(WHY_HEADING);
    expect(why.textContent).toContain(EFFORT.why);
    expect(oneAttr(el, 'data-learn-close').textContent).toBe(GOT_IT);
    expect(copyHits(el)).toEqual([]);
  });

  it('leaves out the why block when the card has none', () => {
    const el = asFake(learnCardSheet(PROTEIN, { onClose: () => {} }));
    expect(byAttr(el, 'data-learn-why')).toHaveLength(0);
    expect(texts(el)).toContain('Spread it over your meals.');
  });

  it('Got it, the veil and Escape close; Tab stays on Got it', () => {
    let closes = 0;
    const el = asFake(learnCardSheet(EFFORT, { onClose: () => closes++ }));
    oneAttr(el, 'data-learn-close').click();
    oneAttr(el, 'data-learn-veil').click();
    const esc = key('Escape');
    el.dispatch('keydown', esc.ev);
    expect(esc.prevented()).toBe(true);
    expect(closes).toBe(3);
    const tab = key('Tab', true);
    el.dispatch('keydown', tab.ev);
    expect(tab.prevented()).toBe(true);
    expect(active()).toBe(oneAttr(el, 'data-learn-close'));
    expect(closes).toBe(3);
  });
});

// M13d task 19: a card with a `short` lead opens on it; body + why are behind More.
const SHORT: LearnCard = { ...EFFORT, short: 'Easy, good or hard: how many reps you had left.' };

describe('learnCardSheet: short lead first (M13d task 19)', () => {
  it('shows the short lead; the body and the why block sit in a closed More panel', () => {
    const el = asFake(learnCardSheet(SHORT, { onClose: () => {} }));
    const lead = oneAttr(el, 'data-learn-short');
    expect(lead.textContent).toBe(SHORT.short);
    expect(el.getAttribute('aria-describedby')).toBe(lead.getAttribute('id'));
    const more = oneAttr(el, 'data-more', 'learn');
    const btn = oneAttr(more, 'data-more-btn');
    expect(btn.tag).toBe('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const panel = oneAttr(more, 'data-more-panel');
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(oneAttr(panel, 'data-learn-body').byTag('p')).toHaveLength(2);
    expect(oneAttr(panel, 'data-learn-why').textContent).toContain(SHORT.why);
    btn.click();
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(copyHits(el)).toEqual([]);
  });

  it('Tab and Shift+Tab move between More and Got it', () => {
    const el = asFake(learnCardSheet(SHORT, { onClose: () => {} }));
    const more = oneAttr(el, 'data-more-btn');
    const close = oneAttr(el, 'data-learn-close');
    close.focus();
    el.dispatch('keydown', key('Tab').ev);
    expect(active()).toBe(more);
    el.dispatch('keydown', key('Tab').ev);
    expect(active()).toBe(close);
    el.dispatch('keydown', key('Tab', true).ev);
    expect(active()).toBe(more);
  });

  it('opened while a workout is on screen (the Rest screen): More starts open', () => {
    const doc = globalThis.document as unknown as { querySelector?: (s: string) => unknown };
    doc.querySelector = (sel: string) => (sel.includes('[data-screen="rest"]') ? {} : null);
    const parent = new FakeEl('body');
    const handle = openLearnCard(SHORT, null, { parent: parent as unknown as HTMLElement });
    const more = oneAttr(asFake(handle.el), 'data-more', 'learn');
    expect(oneAttr(more, 'data-more-btn').getAttribute('aria-expanded')).toBe('true');
    expect(oneAttr(more, 'data-more-panel').hasAttribute('hidden')).toBe(false);
    handle.close();
  });

  it('closing removes its swipe-down', () => {
    const parent = new FakeEl('body');
    const handle = openLearnCard(SHORT, null, { parent: parent as unknown as HTMLElement });
    const el = asFake(handle.el);
    expect(el.hasAttribute('data-sheet-swipe')).toBe(true);
    handle.close();
    expect(el.hasAttribute('data-sheet-swipe')).toBe(false);
  });

  it('hideWhy leaves the why block out (the intake context)', () => {
    const el = asFake(learnCardSheet(SHORT, { onClose: () => {} }, { hideWhy: true }));
    expect(byAttr(el, 'data-learn-why')).toHaveLength(0);
    expect(byAttr(el, 'data-learn-body')).toHaveLength(1);
  });

  it('an opener with data-learn-hide-why opens the card without its why', () => {
    const parent = new FakeEl('body');
    const opener = new FakeEl('button');
    opener.setAttribute(HIDE_WHY_ATTR, '');
    const handle = openLearnCard(SHORT, opener as unknown as HTMLElement, {
      parent: parent as unknown as HTMLElement,
    });
    expect(byAttr(asFake(handle.el), 'data-learn-why')).toHaveLength(0);
    handle.close();
    const plain = openLearnCard(SHORT, new FakeEl('button') as unknown as HTMLElement, {
      parent: parent as unknown as HTMLElement,
    });
    expect(byAttr(asFake(plain.el), 'data-learn-why')).toHaveLength(1);
    plain.close();
  });

  it('every real card has a short lead of one sentence, ≤ 20 words', () => {
    for (const c of LEARN_CARDS) {
      expect(c.short, c.id).toBeTruthy();
      expect((c.short ?? '').split(/\s+/).length, c.id).toBeLessThanOrEqual(20);
    }
  });
});

describe('openLearnCard', () => {
  it('mounts, focuses Got it, and on close removes itself and refocuses the opener', () => {
    const parent = new FakeEl('body');
    const opener = new FakeEl('button');
    let closed = 0;
    const handle = openLearnCard(EFFORT, opener as unknown as HTMLElement, {
      parent: parent as unknown as HTMLElement,
      onClosed: () => closed++,
    });
    const sheet = asFake(handle.el);
    expect(parent.children).toContain(sheet);
    expect(learnCardOpen()).toBe(true);
    expect(active()).toBe(oneAttr(sheet, 'data-learn-close'));

    oneAttr(sheet, 'data-learn-close').click();
    expect(removed).toEqual([sheet]);
    expect(active()).toBe(opener);
    expect(learnCardOpen()).toBe(false);
    expect(closed).toBe(1);

    handle.close(); // idempotent
    expect(removed).toHaveLength(1);
    expect(closed).toBe(1);
  });

  it('Escape closes through the same path', () => {
    const parent = new FakeEl('body');
    const opener = new FakeEl('button');
    const handle = openLearnCard(PROTEIN, opener as unknown as HTMLElement, {
      parent: parent as unknown as HTMLElement,
    });
    asFake(handle.el).dispatch('keydown', key('Escape').ev);
    expect(removed).toEqual([asFake(handle.el)]);
    expect(active()).toBe(opener);
  });

  it('does not refocus an opener that left the page (the screen re-rendered)', () => {
    const parent = new FakeEl('body');
    const opener = new FakeEl('button');
    const handle = openLearnCard(EFFORT, opener as unknown as HTMLElement, {
      parent: parent as unknown as HTMLElement,
    });
    opener.isConnected = false;
    handle.close();
    expect(active()).toBe(oneAttr(asFake(handle.el), 'data-learn-close'));
  });

  it('only one at a time: opening another closes the first; closeLearnCard closes from outside', () => {
    const parent = new FakeEl('body');
    const a = openLearnCard(EFFORT, null, { parent: parent as unknown as HTMLElement });
    const b = openLearnCard(PROTEIN, null, { parent: parent as unknown as HTMLElement });
    expect(removed).toEqual([asFake(a.el)]);
    closeLearnCard();
    expect(removed).toEqual([asFake(a.el), asFake(b.el)]);
    expect(learnCardOpen()).toBe(false);
  });

  it('works from the rest screen effort row: onEffortWhy(opener) → openLearnCard(card, opener)', () => {
    const parent = new FakeEl('body');
    // What main passes as RestActions.onEffortWhy.
    const onEffortWhy = (opener: HTMLElement) =>
      openLearnCard(EFFORT, opener, { parent: parent as unknown as HTMLElement });
    const why = asFake(whyButton(onEffortWhy));
    why.click();
    expect(asFake(parent.children[0]).getAttribute('data-learn-sheet')).toBe('effort');
    closeLearnCard();
    expect(active()).toBe(why);
  });
});

describe('whyButton', () => {
  it('is a ≥ 56px button with icon + "Why?" that hands itself to the callback', () => {
    const got: unknown[] = [];
    const btn = asFake(
      whyButton((o) => got.push(o), { label: 'Why? About protein', attrs: { 'data-x': true } }),
    );
    expect(btn.tag).toBe('button');
    expect(btn.classes).toContain('learn-why');
    expect(btn.getAttribute('aria-label')).toBe('Why? About protein');
    expect(btn.hasAttribute('data-x')).toBe(true);
    expect(btn.textContent).toBe('Why?');
    btn.click();
    expect(got).toEqual([btn]);
  });
});

describe('chat: "Why?" on a coach message with learnId', () => {
  const T0 = Date.UTC(2026, 10, 17, 9);
  const m = (
    id: number,
    role: 'user' | 'coach',
    extra: Partial<ChatMessage> = {},
  ): ChatMessage => ({
    id,
    createdAt: T0 + id,
    role,
    text: role === 'coach' ? 'Add 2.5 kg next time.' : 'Why that weight?',
    source: 'rules',
    phase: 'today',
    ...extra,
  });
  const actions = (over: Partial<ChatActions> = {}): ChatActions => ({
    onChip: () => {},
    onArea: () => {},
    onApply: () => {},
    onDismiss: () => {},
    ...over,
  });

  it('shows the link under that bubble and passes the id and the button', () => {
    const got: [string, unknown][] = [];
    const el = asFake(
      chat(
        { variant: 'tab', messages: [m(1, 'user'), m(2, 'coach', { learnId: 'effort' })] },
        actions({ onLearn: (id, opener) => got.push([id, opener]) }),
      ),
    );
    const link = oneAttr(el, 'data-learn-open', 'effort');
    const item = el.find((e) => e.getAttribute('data-msg-id') === '2')[0];
    expect(item?.find((e) => e === link)).toHaveLength(1);
    link.click();
    expect(got).toEqual([['effort', link]]);
  });

  it('no link without onLearn, without learnId, or on his own message', () => {
    const msgs = [m(1, 'user', { learnId: 'effort' }), m(2, 'coach')];
    const withCb = asFake(chat({ variant: 'tab', messages: msgs }, actions({ onLearn: () => {} })));
    expect(byAttr(withCb, 'data-learn-open')).toHaveLength(0);
    const noCb = asFake(
      chat({ variant: 'tab', messages: [m(3, 'coach', { learnId: 'effort' })] }, actions()),
    );
    expect(byAttr(noCb, 'data-learn-open')).toHaveLength(0);
  });

  it('the link is in the sheet focus cycle', () => {
    const el = asFake(
      chat(
        { variant: 'sheet', messages: [m(4, 'coach', { learnId: 'protein' })] },
        actions({ onLearn: () => {}, onClose: () => {} }),
      ),
    );
    const link = oneAttr(el, 'data-learn-open', 'protein');
    link.focus();
    el.dispatch('keydown', key('Tab', true).ev);
    expect(active()).not.toBe(link);
    el.dispatch('keydown', key('Tab').ev);
    expect(active()).toBe(link);
  });
});
