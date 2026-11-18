/**
 * M13c task 6d: the "Claude could help with this" explain card. It explains (both lists, every
 * item), says the key isn't set up, and offers exactly two buttons; nothing behind it can make a
 * request (Decision "M13c answers": explain first, ask, never send by itself).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLAUDE_OFFER } from '../../core/trainer/claude/offer';
import { CLAUDE_NEVER_SENDS, CLAUDE_SENDS } from '../../core/trainer/claude/sends';
import { checkCopy } from '../../core/trainer/replies';
import type { ChatMessage } from '../../core/types';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { chat, type ChatActions } from './chat';
import { buildClaudeOfferCard, CLAUDE_CARD_SR } from './claudeOfferCard';

useFakeDom();

const attr = (el: FakeEl, name: string) => el.find((e) => e.hasAttribute(name));
const one = (el: FakeEl, name: string): FakeEl => {
  const hit = attr(el, name)[0];
  if (!hit) throw new Error(`no [${name}]`);
  return hit;
};

function card() {
  const calls: string[] = [];
  const built = buildClaudeOfferCard({
    onWanted: () => calls.push('wanted'),
    onDismiss: () => calls.push('dismiss'),
  });
  return { el: asFake(built.el), controls: built.controls.map(asFake), calls };
}

describe('buildClaudeOfferCard', () => {
  it('title, why line and the key note, from core CLAUDE_OFFER', () => {
    const { el } = card();
    expect(el.tag).toBe('section');
    expect(el.hasAttribute('data-claude-offer')).toBe(true);
    const title = el.oneByClass('co-title');
    expect(title.textContent).toBe(CLAUDE_OFFER.title);
    expect(el.getAttribute('aria-labelledby')).toBe(title.getAttribute('id'));
    expect(el.oneByClass('co-why').textContent).toBe(CLAUDE_OFFER.why);
    expect(el.oneByClass('co-key').textContent).toContain(CLAUDE_OFFER.keyNote);
  });

  it('"What would be sent" renders every CLAUDE_SENDS item, in order', () => {
    const { el } = card();
    const list = one(el, 'data-claude-sends');
    expect(list.tag).toBe('ul');
    const rows = attr(list, 'data-claude-send');
    expect(rows.map((r) => r.getAttribute('data-claude-send'))).toEqual(
      CLAUDE_SENDS.map((i) => i.id),
    );
    rows.forEach((r, i) => expect(r.textContent).toContain(CLAUDE_SENDS[i]?.label));
    expect(el.textContent).toContain(CLAUDE_OFFER.sendsHead);
    expect(list.getAttribute('aria-labelledby')).toBe(
      el.oneByClass('co-head-sends').getAttribute('id'),
    );
  });

  it('"Never sent" renders every CLAUDE_NEVER_SENDS item, in order', () => {
    const { el } = card();
    const list = one(el, 'data-claude-never');
    expect(list.tag).toBe('ul');
    const rows = attr(list, 'data-claude-never-item');
    expect(rows.map((r) => r.getAttribute('data-claude-never-item'))).toEqual(
      CLAUDE_NEVER_SENDS.map((i) => i.id),
    );
    rows.forEach((r, i) => expect(r.textContent).toContain(CLAUDE_NEVER_SENDS[i]?.label));
    expect(el.textContent).toContain(CLAUDE_OFFER.neverHead);
  });

  it('the two lists differ by words, not colour alone: each row carries a hidden prefix', () => {
    const { el } = card();
    for (const r of attr(one(el, 'data-claude-sends'), 'data-claude-send'))
      expect(r.byClass('sr-only')[0]?.textContent).toBe(CLAUDE_CARD_SR.send);
    for (const r of attr(one(el, 'data-claude-never'), 'data-claude-never-item'))
      expect(r.byClass('sr-only')[0]?.textContent).toBe(CLAUDE_CARD_SR.never);
  });

  it("exactly two buttons, in order, calling back: Tell me when it's ready, Not now", () => {
    const { el, controls, calls } = card();
    const buttons = el.byTag('button');
    expect(buttons).toHaveLength(2);
    expect(controls).toEqual(buttons);
    expect(buttons[0]?.textContent).toBe(CLAUDE_OFFER.wanted);
    expect(buttons[0]?.hasAttribute('data-claude-offer-wanted')).toBe(true);
    expect(buttons[1]?.textContent).toBe(CLAUDE_OFFER.dismiss);
    expect(buttons[1]?.hasAttribute('data-claude-offer-dismiss')).toBe(true);
    for (const b of buttons) expect(b.getAttribute('type')).toBe('button');
    buttons[0]?.click();
    expect(calls).toEqual(['wanted']);
  });

  it('Not now calls onDismiss', () => {
    const { el, calls } = card();
    one(el, 'data-claude-offer-dismiss').click();
    expect(calls).toEqual(['dismiss']);
  });

  it('answers once: after a tap both buttons are disabled and a second tap does nothing', () => {
    const { el, calls } = card();
    const [wanted, dismiss] = el.byTag('button');
    wanted?.click();
    wanted?.click();
    dismiss?.click();
    expect(calls).toEqual(['wanted']);
    expect(wanted?.hasAttribute('disabled')).toBe(true);
    expect(dismiss?.hasAttribute('disabled')).toBe(true);
  });

  it('no other action: no link, no field, no form, nothing else listening for taps', () => {
    const { el } = card();
    for (const tag of ['a', 'input', 'textarea', 'select', 'form', 'iframe', 'img'])
      expect(el.byTag(tag), tag).toEqual([]);
    const listening = el.find((e) => e.listeners.size > 0);
    expect(listening).toEqual(el.byTag('button'));
    expect(el.find((e) => e.hasAttribute('href'))).toEqual([]);
    expect(el.find((e) => e.hasAttribute('tabindex'))).toEqual([]);
  });

  it('shown, never spoken: not a live region or an alert', () => {
    const { el } = card();
    const all = [el, ...el.find(() => true)];
    expect(all.filter((e) => e.hasAttribute('aria-live'))).toEqual([]);
    expect(all.filter((e) => e.getAttribute('role') === 'alert')).toEqual([]);
  });

  it('its own strings pass checkCopy and the anyone-scan', () => {
    for (const s of Object.values(CLAUDE_CARD_SR)) {
      expect(checkCopy(s).ok, s).toBe(true);
      expect(s, s).not.toMatch(/\b(he|she|his|her|him|hers)\b/i);
    }
  });
});

// ---------- the chat slot ----------

const T0 = Date.UTC(2026, 10, 18, 11);
const msg = (id: number, role: 'user' | 'coach', text: string, extra = {}): ChatMessage =>
  ({
    id,
    createdAt: T0 + id,
    role,
    text,
    source: 'rules',
    phase: 'today',
    ...extra,
  }) as ChatMessage;

const THREAD: ChatMessage[] = [
  msg(1, 'user', 'How do I fix my car?'),
  msg(2, 'coach', 'I can help with:', { chips: [{ id: 'notToday', label: 'Not today' }] }),
];

function actions(log: string[], extra: Partial<ChatActions> = {}): ChatActions {
  return {
    onChip: () => log.push('chip'),
    onArea: () => log.push('area'),
    onApply: () => log.push('apply'),
    onDismiss: () => log.push('dismiss'),
    onClaudeWanted: () => log.push('claudeWanted'),
    onClaudeDismiss: () => log.push('claudeDismiss'),
    ...extra,
  };
}

const offerIn = (root: FakeEl) => attr(root, 'data-claude-offer');
const item = (root: FakeEl, id: number) =>
  root.find((e) => e.getAttribute('data-msg-id') === String(id))[0];

describe('chat: the Claude card slot under a coach reply', () => {
  it('draws the card inside the named coach message, after its bubble', () => {
    const log: string[] = [];
    const root = asFake(
      chat({ messages: THREAD, variant: 'tab', claudeOffer: { messageId: 2 } }, actions(log)),
    );
    expect(offerIn(root)).toHaveLength(1);
    const li = item(root, 2);
    expect(li).toBeDefined();
    expect(offerIn(li as FakeEl)).toHaveLength(1);
    const kids = (li as FakeEl).children;
    const bubbleAt = kids.findIndex((k) => k.classes.includes('chat-bubble'));
    const slotAt = kids.findIndex((k) => k.classes.includes('chat-claude'));
    expect(bubbleAt).toBeGreaterThanOrEqual(0);
    expect(slotAt).toBeGreaterThan(bubbleAt);
    expect(offerIn(item(root, 1) as FakeEl)).toHaveLength(0);
  });

  it('its buttons reach onClaudeWanted / onClaudeDismiss and nothing else', () => {
    const log: string[] = [];
    const build = () =>
      asFake(
        chat({ messages: THREAD, variant: 'tab', claudeOffer: { messageId: 2 } }, actions(log)),
      );
    one(build(), 'data-claude-offer-wanted').click();
    one(build(), 'data-claude-offer-dismiss').click();
    expect(log).toEqual(['claudeWanted', 'claudeDismiss']);
  });

  it('no slot without the prop, both callbacks, a coach message with that id, or in the sheet', () => {
    const none = (root: HTMLElement) => expect(offerIn(asFake(root))).toEqual([]);
    const log: string[] = [];
    none(chat({ messages: THREAD, variant: 'tab' }, actions(log)));
    none(
      chat(
        { messages: THREAD, variant: 'tab', claudeOffer: { messageId: 2 } },
        actions(log, { onClaudeWanted: undefined }),
      ),
    );
    none(
      chat(
        { messages: THREAD, variant: 'tab', claudeOffer: { messageId: 2 } },
        actions(log, { onClaudeDismiss: undefined }),
      ),
    );
    // His own message, or an id not in the thread.
    none(chat({ messages: THREAD, variant: 'tab', claudeOffer: { messageId: 1 } }, actions(log)));
    none(chat({ messages: THREAD, variant: 'tab', claudeOffer: { messageId: 9 } }, actions(log)));
    // The Pause sheet is mid-workout: never there.
    none(chat({ messages: THREAD, variant: 'sheet', claudeOffer: { messageId: 2 } }, actions(log)));
    expect(log).toEqual([]);
  });

  it('never beside a red flag: a red flag as the newest message hides it', () => {
    const red = [...THREAD, msg(3, 'coach', 'Stop and rest.', { card: { kind: 'redFlag' } })];
    const root = asFake(
      chat({ messages: red, variant: 'tab', claudeOffer: { messageId: 2 } }, actions([])),
    );
    expect(offerIn(root)).toEqual([]);
  });

  it('never on a message that carries a card of its own', () => {
    const withCard = [
      msg(4, 'coach', 'Here is a recap.', {
        card: { kind: 'recap', period: 'week', from: '2026-11-09', to: '2026-11-15' },
      }),
    ];
    const root = asFake(
      chat({ messages: withCard, variant: 'tab', claudeOffer: { messageId: 4 } }, actions([])),
    );
    expect(offerIn(root)).toEqual([]);
  });
});

// ---------- nothing behind it can make a request ----------

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const rel = (p: string): string => relative(SRC, p).split(sep).join('/');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const STATIC =
  /(?:^|[\n;])\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const NETWORK =
  /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b|\bEventSource\b|\bCapacitor\b|api\.anthropic\.com|speechSynthesis/;

/** Every file the module reaches by runtime imports (type-only imports are erased). */
function reach(entry: string): { files: string[]; packages: string[] } {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const todo = [join(SRC, entry)];
  while (todo.length) {
    const file = todo.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.ts')) continue;
    const text = code(readFileSync(file, 'utf8'));
    const specs = [
      ...[...text.matchAll(STATIC)].filter((m) => !m[1]).map((m) => m[2] as string),
      ...[...text.matchAll(DYNAMIC)].map((m) => m[1] as string),
    ];
    for (const s of specs) {
      if (!s.startsWith('.')) {
        packages.add(s);
        continue;
      }
      const base = join(dirname(file), s);
      const hit = [base, `${base}.ts`, join(base, 'index.ts')].find(
        (p) => existsSync(p) && /\.(ts|json|css)$/.test(p),
      );
      if (!hit) throw new Error(`unresolved ${rel(file)} → ${s}`);
      todo.push(hit);
    }
  }
  return { files: [...seen].map(rel).sort(), packages: [...packages].sort() };
}

describe('claudeOfferCard.ts reaches no request code (M13c: no Claude request)', () => {
  it('the walker sees a network call when there is one (checked first)', () => {
    const g = reach('data/nutrition/offClient.ts');
    expect(g.files.some((f) => NETWORK.test(code(readFileSync(join(SRC, f), 'utf8'))))).toBe(true);
  });

  it('only the DOM helpers, icons, its CSS and pure core code; no fetch, native, brain or voice', () => {
    const g = reach('ui/coach/claudeOfferCard.ts');
    expect(g.packages).toEqual([]);
    for (const f of g.files) {
      expect(f, f).toMatch(
        /^(core\/.*|data\/.*\.json|ui\/dom\.ts|ui\/icons\.ts|ui\/coach\/claudeOfferCard\.ts|ui\/coach\/coach\.css)$/,
      );
      if (f.endsWith('.ts'))
        expect(NETWORK.test(code(readFileSync(join(SRC, f), 'utf8'))), f).toBe(false);
    }
    expect(g.files).toContain('core/trainer/claude/sends.ts');
  });
});
