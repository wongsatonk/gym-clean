// M12 task 10: the coach chat (SPEC M12 goals 2–4, design "Chat details"). One component, two
// frames on the same thread: `variant: 'tab'` is the Coach tab (home of the coach), `'sheet'` is
// the compact bottom sheet the Pause sheet opens between sets (workout chips only, Close).
//
// Props in, callbacks out: the thread (`ChatMessage[]` from the chat store), what to offer now
// (quick chips, follow-ups, the area chips, the text box) and the data a card needs (focus
// blocks by id). No DB, no core calls beyond pure formatting; main re-renders with new props.
//
// What it draws: bubbles (≥ 20px; his on the right, the coach's on the left, an sr-only speaker),
// cards by `card.kind` (proposal / focus block with their outcome line, food ideas, red flag,
// recap), the starters on an empty thread, a typing indicator (3 dots; static under reduced
// motion), follow-ups and quick chips above the text box "Ask the coach" + Send, the privacy
// line "Stays on this phone.", and Clear chat (two taps; tab only). The newest message is
// scrolled into view; messages newer than `animateAfter` rise + fade in (motion-rise).
//
// Rules kept from the M10 sheet: a red flag as the newest message → only its buttons (no chips,
// no text box); a pending proposal as the newest message → no quick chips / text box, so Apply
// stays on screen (Not now brings them back). Nothing here speaks: `say` is main's job.
//
// e2e hooks (kept from the M10 sheet): `data-coach-chip=<id>`, `data-coach-area=<area>`,
// `data-coach-followup=<index>`, the text box labelled "Ask the coach", button "Send"; the sheet
// is a dialog named "Coach" with "Close". New: `[data-chat]` (+ `data-variant`),
// `data-coach-starter=<id>`, `data-msg-id`, `[data-chat-typing]`, `[data-chat-clear]`.
import { dateText } from '../../core/trainer/actions/lighter';
import {
  QUICK_CHIPS,
  STARTER_CHIPS,
  type CoachArgs,
  type CoachChipId,
  type QuickChipId,
} from '../../core/trainer/coach';
import type { BodyArea, ChatMessage, FocusBlock } from '../../core/types';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { moodClass } from '../tokens';
import { buildFoodCard } from './foodCard';
import { buildFocusBlockCard, buildMissingBlockCard } from './focusBlockCard';
import { buildRedFlagCard, buildThreadProposalCard, type Built } from './proposalCard';
import './coach.css';
import './chat.css';

export type ChatChip = { id: CoachChipId; label: string; args?: CoachArgs };

/** Quick-chip icons (decorative; every chip has words). Labels come from core QUICK_CHIPS. */
const QUICK_ICON: Record<QuickChipId, IconName> = {
  notToday: 'calendar',
  easyOn: 'pause',
  lighter: 'minus',
  swap: 'flip',
  adjustPlan: 'sliders',
  food: 'flame',
  focusBlock: 'trend',
};

/** The quick chips in core order, with the M12 focusBlock chip ("Build a focus block"). */
export const CHAT_CHIPS: readonly { id: QuickChipId; label: string; icon: IconName }[] =
  QUICK_CHIPS.map((c) => ({
    id: c.id as QuickChipId,
    label: c.label,
    icon: QUICK_ICON[c.id as QuickChipId],
  }));

/** Mid-workout (the Pause sheet): only what can change what's left (core WORKOUT_CHIPS). */
export const WORKOUT_CHAT_CHIPS: readonly QuickChipId[] = ['easyOn', 'lighter', 'swap'];

export const AREA_CHAT_CHIPS: readonly { area: BodyArea; label: string }[] = [
  { area: 'arms', label: 'Arms' },
  { area: 'shoulders', label: 'Shoulders' },
  { area: 'chest', label: 'Chest' },
  { area: 'back', label: 'Back' },
  { area: 'legs', label: 'Legs' },
  { area: 'core', label: 'Core' },
];

export const PRIVACY_LINE = 'Stays on this phone.';
export const EMPTY_LINE = 'Ask me about your training, your week or food. Or pick one:';
export const CLEAR_LABEL = 'Clear chat';
export const CLEAR_CONFIRM = 'Tap again to clear';
/** The Clear chat button disarms after this long without the second tap. */
export const CLEAR_ARM_MS = 4000;

export type ChatProps = {
  messages: readonly ChatMessage[];
  variant: 'tab' | 'sheet';
  /** The coach is answering: the typing indicator. */
  typing?: boolean | undefined;
  /** Quick chips to offer (default: all for the tab, the workout three for the sheet). */
  chips?: readonly QuickChipId[] | undefined;
  /** Starters on an empty thread (default core STARTER_CHIPS; main passes starterChips(ctx)). */
  starters?: readonly ChatChip[] | undefined;
  /** The coach's alternatives / questions (core reply chips that aren't quick or area chips). */
  followUps?: readonly { label: string }[] | undefined;
  /** Show the area chips (after "Go easy on…"). */
  showAreas?: boolean | undefined;
  /** The text box. Never during a set (the caller decides). */
  allowTyping?: boolean | undefined;
  /** A workout is running: the red-flag card offers End workout. */
  inWorkout?: boolean | undefined;
  /** Focus blocks by id, for `card.kind === 'focusBlock'` (the pending draft and applied ones). */
  focusBlocks?: Readonly<Record<string, FocusBlock>> | undefined;
  /** Exercise names for the focus-block card (default: the id with spaces). */
  exerciseName?: ((exerciseId: string) => string) | undefined;
  /** Focus-exercise test for the focus-block card (main: core isFocusExercise with the catalog). */
  isFocusExercise?: ((exerciseId: string, block: FocusBlock) => boolean) | undefined;
  /** Message ids whose applied card can still be undone (default: every applied card). */
  undoable?: readonly number[] | undefined;
  /** Message id whose card was just applied: its check pops in once. */
  justApplied?: number | undefined;
  /** Messages with an id above this (or no id yet) rise in. Omit for none (first open). */
  animateAfter?: number | undefined;
};

export type ChatActions = {
  onText?: ((text: string) => void) | undefined;
  /** A quick chip or a starter (with its words for his bubble and any args). */
  onChip: (chip: ChatChip) => void;
  onArea: (area: BodyArea) => void;
  /** A follow-up option at `index` in `followUps`. */
  onFollowUp?: ((index: number) => void) | undefined;
  /** Card actions by message id. */
  onApply: (messageId: number) => void;
  onDismiss: (messageId: number) => void;
  onUndo?: ((messageId: number) => void) | undefined;
  onAskAgain?: ((messageId: number) => void) | undefined;
  /** Log on the food card row at `index` of message `messageId`. */
  onLogFood?: ((messageId: number, index: number) => void) | undefined;
  onEndWorkout?: (() => void) | undefined;
  /** Tab only: after the second tap of Clear chat. */
  onClearChat?: (() => void) | undefined;
  /** Sheet only: Close / Escape. */
  onClose?: (() => void) | undefined;
};

// ---------- pure selectors ----------

const last = (ms: readonly ChatMessage[]) => ms[ms.length - 1];

/** The newest message is a red flag: only its buttons are offered. */
export function redFlagUp(messages: readonly ChatMessage[]): boolean {
  return last(messages)?.card?.kind === 'redFlag';
}

/** The newest message holds a pending proposal / focus block: the thread waits for an answer. */
export function awaitingAnswer(messages: readonly ChatMessage[]): boolean {
  const c = last(messages)?.card;
  return (c?.kind === 'proposal' || c?.kind === 'focusBlock') && c.status === 'pending';
}

/** Which quick chips to draw: none while a red flag is up or a card waits for an answer. */
export function visibleChatChips(
  p: Pick<ChatProps, 'messages' | 'chips' | 'variant'>,
): (typeof CHAT_CHIPS)[number][] {
  if (redFlagUp(p.messages) || awaitingAnswer(p.messages)) return [];
  const allow = new Set(
    p.chips ?? (p.variant === 'sheet' ? WORKOUT_CHAT_CHIPS : CHAT_CHIPS.map((c) => c.id)),
  );
  return CHAT_CHIPS.filter((c) => allow.has(c.id));
}

/** The trimmed text to send, or null for nothing worth sending. */
export function textToSend(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 200) : null;
}

const QUICK_IDS = new Set<string>(CHAT_CHIPS.map((c) => c.id));
const AREA_IDS = new Set<string>(AREA_CHAT_CHIPS.map((c) => c.area));

/**
 * Splits a core reply's chips into what the chat draws: plain quick chips, whether the area
 * chips show, and follow-ups (everything else except the UI-only endWorkout). Same split as
 * the M10 sheet wiring in app.ts.
 */
export function splitReplyChips(chips: readonly ChatChip[]): {
  quick: QuickChipId[];
  showAreas: boolean;
  followUps: ChatChip[];
} {
  const plain = (c: ChatChip) => QUICK_IDS.has(c.id) && c.args === undefined;
  return {
    quick: chips.filter(plain).map((c) => c.id as QuickChipId),
    showAreas: chips.some((c) => AREA_IDS.has(c.id)),
    followUps: chips.filter((c) => !plain(c) && !AREA_IDS.has(c.id) && c.id !== 'endWorkout'),
  };
}

/** "Mon 9 Nov to Sun 15 Nov". */
export function recapRange(from: string, to: string): string {
  return `${dateText(from)} to ${dateText(to)}`;
}

// ---------- pieces ----------

function bubble(m: ChatMessage): HTMLElement {
  return h(
    'div',
    { class: `cs-msg chat-bubble cs-msg-${m.role}` },
    h('span', { class: 'sr-only' }, m.role === 'coach' ? 'Coach: ' : 'You: '),
    m.text,
  );
}

function recapCard(m: ChatMessage & { card: { kind: 'recap' } }): HTMLElement {
  const c = m.card;
  return h(
    'section',
    {
      class: 'chat-recap',
      'data-recap': c.period,
      'aria-label': c.period === 'week' ? 'Week recap' : 'Block recap',
    },
    h(
      'h3',
      { class: 'chat-recap-title' },
      icon('calendar', 'sm'),
      h('span', {}, c.period === 'week' ? 'Week recap' : 'Focus block recap'),
    ),
    h('p', { class: 'chat-recap-dates' }, recapRange(c.from, c.to)),
    h('p', { class: 'chat-recap-text' }, h('span', { class: 'sr-only' }, 'Coach: '), m.text),
  );
}

function typingIndicator(): HTMLElement {
  return h(
    'li',
    { class: 'chat-item chat-typing', 'data-chat-typing': true, role: 'status' },
    h('span', { class: 'sr-only' }, 'The coach is typing'),
    h(
      'span',
      { class: 'chat-dots', 'aria-hidden': 'true' },
      h('span', { class: 'chat-dot' }),
      h('span', { class: 'chat-dot' }),
      h('span', { class: 'chat-dot' }),
    ),
  );
}

function defaultName(id: string): string {
  return id.replace(/_/g, ' ');
}

// ---------- the component ----------

export function chat(p: ChatProps, a: ChatActions): HTMLElement {
  const cycle: HTMLElement[] = [];
  const sheet = p.variant === 'sheet';
  const red = redFlagUp(p.messages);
  const waiting = awaitingAnswer(p.messages);
  const quiet = red || waiting;
  const undoable = p.undoable ? new Set(p.undoable) : null;

  // Header: title + Close (sheet) or Clear chat (tab).
  const headEnd: HTMLElement[] = [];
  if (sheet && a.onClose) {
    headEnd.push(
      h(
        'button',
        { type: 'button', class: 'cs-btn cs-close', onclick: a.onClose },
        icon('close', 'md'),
        h('span', {}, 'Close'),
      ),
    );
  }
  if (!sheet && a.onClearChat && p.messages.length > 0) {
    const onClear = a.onClearChat;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const label = h('span', {}, CLEAR_LABEL);
    const clear = h(
      'button',
      {
        type: 'button',
        class: 'cs-btn chat-clear',
        'data-chat-clear': true,
        onclick: () => {
          if (clear.getAttribute('data-armed') === 'true') {
            if (timer !== undefined) clearTimeout(timer);
            onClear();
            return;
          }
          clear.setAttribute('data-armed', 'true');
          label.textContent = CLEAR_CONFIRM;
          timer = setTimeout(() => {
            clear.setAttribute('data-armed', 'false');
            label.textContent = CLEAR_LABEL;
          }, CLEAR_ARM_MS);
        },
      },
      icon('close', 'sm'),
      label,
    );
    clear.setAttribute('data-armed', 'false');
    headEnd.push(clear);
  }
  cycle.push(...headEnd);
  const head = h(
    'div',
    { class: 'cs-head chat-head' },
    h(sheet ? 'h2' : 'h1', { class: 'cs-title chat-title' }, 'Coach'),
    headEnd.length ? h('div', { class: 'chat-head-end' }, ...headEnd) : null,
  );

  // The thread.
  const list = h('ol', { class: 'cs-list chat-list', role: 'log', 'aria-live': 'polite' });
  const lastIndex = p.messages.length - 1;
  p.messages.forEach((m, i) => {
    const id = m.id ?? -1 - i;
    const isNew = p.animateAfter !== undefined && (m.id === undefined || m.id > p.animateAfter);
    const item = h('li', {
      class: `chat-item chat-item-${m.role}${isNew ? ' chat-rise' : ''}`,
      'data-msg-id': m.id,
    });
    const card = m.card;
    let built: Built | null = null;
    if (card?.kind === 'redFlag') {
      // Only the newest red flag keeps its buttons.
      built = buildRedFlagCard(
        m.text,
        i === lastIndex
          ? {
              onEndWorkout: p.inWorkout ? a.onEndWorkout : undefined,
              onNotToday: () => a.onChip({ id: 'notToday', label: 'Not today' }),
            }
          : {},
      );
    } else if (card?.kind === 'recap') {
      item.append(recapCard({ ...m, card }));
    } else {
      if (m.text) item.append(bubble(m));
      const outcome = {
        onUndo:
          a.onUndo && (!undoable || (m.id !== undefined && undoable.has(m.id)))
            ? () => a.onUndo?.(id)
            : undefined,
        onAskAgain: a.onAskAgain ? () => a.onAskAgain?.(id) : undefined,
      };
      const justApplied = m.id !== undefined && m.id === p.justApplied;
      if (card?.kind === 'proposal') {
        built = buildThreadProposalCard(
          card,
          card.status,
          { onApply: () => a.onApply(id), onDismiss: () => a.onDismiss(id), ...outcome },
          { justApplied },
        );
      } else if (card?.kind === 'focusBlock') {
        const block = p.focusBlocks?.[card.blockId];
        built = block
          ? buildFocusBlockCard(
              {
                block,
                status: card.status,
                exerciseName: p.exerciseName ?? defaultName,
                isFocus: (exId) => p.isFocusExercise?.(exId, block) ?? false,
                justApplied,
              },
              { onApply: () => a.onApply(id), onDismiss: () => a.onDismiss(id), ...outcome },
            )
          : buildMissingBlockCard(card.status, outcome);
      } else if (card?.kind === 'food' && card.suggestions.length && a.onLogFood && !red) {
        const onLogFood = a.onLogFood;
        built = buildFoodCard(
          card.suggestions,
          { onLog: (row) => onLogFood(id, row) },
          card.logged,
        );
      }
    }
    if (built) {
      item.append(h('div', { class: 'cs-card-item chat-card' }, built.el));
      cycle.push(...built.controls);
    }
    if (m.note) item.append(h('p', { class: 'chat-note' }, m.note));
    list.append(item);
  });
  if (p.typing) list.append(typingIndicator());

  // Empty thread: a line and the starters.
  let starters: HTMLElement | null = null;
  if (p.messages.length === 0 && !p.typing) {
    const chips = (p.starters ?? STARTER_CHIPS).map((c) =>
      h(
        'button',
        {
          type: 'button',
          class: 'cs-chip chat-starter',
          'data-coach-starter': c.id,
          onclick: () => a.onChip({ ...c }),
        },
        h('span', {}, c.label),
      ),
    );
    cycle.push(...chips);
    starters = h(
      'div',
      { class: 'chat-empty' },
      h('p', { class: 'chat-empty-line' }, EMPTY_LINE),
      h('div', { class: 'chat-starters', role: 'group', 'aria-label': 'Suggestions' }, ...chips),
    );
  }

  const followUps =
    !red && a.onFollowUp
      ? (p.followUps ?? []).map((f, index) =>
          h(
            'button',
            {
              type: 'button',
              class: 'cs-chip cs-followup',
              'data-coach-followup': index,
              onclick: () => a.onFollowUp?.(index),
            },
            h('span', {}, f.label),
          ),
        )
      : [];
  const chips = visibleChatChips(p).map((c) => {
    const pressed = c.id === 'easyOn' && p.showAreas === true;
    return h(
      'button',
      {
        type: 'button',
        class: 'cs-chip chat-chip',
        'data-coach-chip': c.id,
        'aria-expanded': c.id === 'easyOn' ? String(pressed) : undefined,
        onclick: () => a.onChip({ id: c.id, label: c.label }),
      },
      icon(c.icon, 'sm'),
      h('span', {}, c.label),
    );
  });
  const areas =
    p.showAreas && !quiet
      ? AREA_CHAT_CHIPS.map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: 'cs-chip cs-area',
              'data-coach-area': c.area,
              onclick: () => a.onArea(c.area),
            },
            c.label,
          ),
        )
      : [];
  cycle.push(...followUps, ...areas, ...chips);

  let typingBox: HTMLElement | null = null;
  if (p.allowTyping && a.onText && !quiet) {
    const onText = a.onText;
    const inputId = sheet ? 'chat-input-sheet' : 'chat-input';
    const input = h('input', {
      type: 'text',
      id: inputId,
      class: 'cs-input',
      enterkeyhint: 'send',
      autocomplete: 'off',
      maxlength: 200,
    });
    const send = () => {
      const t = textToSend(input.value ?? '');
      if (t) onText(t);
    };
    input.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'Enter') {
        ev.preventDefault();
        send();
      }
    });
    const sendBtn = h(
      'button',
      { type: 'button', class: 'cs-btn cs-send', onclick: send },
      h('span', {}, 'Send'),
    );
    typingBox = h(
      'div',
      { class: 'cs-typing chat-input' },
      h('label', { class: 'sr-only', for: inputId }, 'Ask the coach'),
      h('div', { class: 'cs-typing-row' }, input, sendBtn),
    );
    input.setAttribute('placeholder', 'Ask the coach');
    cycle.push(input, sendBtn);
  }

  const scroll = h('div', { class: 'cs-scroll chat-scroll' }, starters, list);
  // Newest message in view once the caller has mounted the chat (chat convention).
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      scroll.scrollTop = scroll.scrollHeight;
    });
  }

  const dock = h(
    'div',
    { class: 'chat-dock' },
    followUps.length
      ? h(
          'div',
          { class: 'cs-chips chat-row cs-followups', role: 'group', 'aria-label': 'Options' },
          ...followUps,
        )
      : null,
    areas.length
      ? h(
          'div',
          { class: 'cs-chips cs-areas', role: 'group', 'aria-label': 'Go easy on' },
          ...areas,
        )
      : null,
    chips.length
      ? h(
          'div',
          { class: 'cs-chips chat-row chat-quick', role: 'group', 'aria-label': 'Quick actions' },
          ...chips,
        )
      : null,
    typingBox,
    h('p', { class: 'cs-privacy chat-privacy' }, icon('lock', 'sm'), h('span', {}, PRIVACY_LINE)),
  );

  const body = [head, scroll, dock];
  if (!sheet) {
    return h(
      'section',
      { class: 'chat chat-tab', 'data-chat': true, 'data-variant': 'tab', 'aria-label': 'Coach' },
      ...body,
    );
  }

  const root = h(
    'div',
    {
      class: `overlay coach-sheet chat-sheet ${moodClass('pro')}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Coach',
      tabindex: '-1',
      'data-coach-sheet': true,
      'data-chat': true,
      'data-variant': 'sheet',
    },
    h('div', { class: 'cs-panel chat' }, ...body),
  );
  // Focus trap and Escape, as the Pause sheet: Escape closes; Tab / Shift+Tab cycle the
  // sheet's visible controls in order.
  root.addEventListener('keydown', (ev) => {
    const kev = ev as KeyboardEvent;
    if (kev.key === 'Escape') {
      kev.preventDefault();
      a.onClose?.();
      return;
    }
    if (kev.key !== 'Tab') return;
    kev.preventDefault();
    const live = cycle.filter(
      (el) => typeof el.closest !== 'function' || el.closest('[hidden]') === null,
    );
    const at = live.indexOf(document.activeElement as HTMLElement);
    const n = live.length;
    if (n === 0) return;
    const next = at < 0 ? (kev.shiftKey ? n - 1 : 0) : (at + (kev.shiftKey ? n - 1 : 1)) % n;
    live[next]?.focus();
  });
  return root;
}

/**
 * The Coach tab screen: the chat filling the space above the tab bar (main passes
 * `tabBar('coach', goTab)`). The thread scrolls; the chips and text box stay above the bar.
 */
export function coachTabScreen(
  p: Omit<ChatProps, 'variant'>,
  a: ChatActions,
  bar: HTMLElement,
): HTMLElement {
  return h(
    'main',
    { class: `screen has-tabbar coach-screen ${moodClass('pro')}`, 'data-screen': 'coach' },
    chat({ ...p, variant: 'tab' }, a),
    bar,
  );
}
