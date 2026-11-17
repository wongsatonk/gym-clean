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
// stays on screen (Not now brings them back). A pending focus block keeps the text box (its
// edits are typed) but not the quick chips. Nothing here speaks: `say` is main's job.
//
// e2e hooks (kept from the M10 sheet): `data-coach-chip=<id>`, `data-coach-area=<area>`,
// `data-coach-followup=<index>`, the text box labelled "Ask the coach", button "Send"; the sheet
// is a dialog named "Coach" with "Close". New: `[data-chat]` (+ `data-variant`),
// `data-coach-starter=<id>`, `data-msg-id`, `[data-chat-typing]`, `[data-chat-clear]`.
//
// M12 slice 1b task 33: a coach message with `learnId` gets a "Why?" button under its bubble
// (`data-learn-open=<id>`) when `onLearn` is passed; main finds the card and opens it with
// `openLearnCard(card, opener)` (learnCard.ts), which hands focus back to the button on close.
//
// M12 slice 2 task 16: the hold-to-talk mic next to Send (micButton.ts; props `mic`, callbacks
// `micDown` / `micUp` / `micCancel`): while listening the text box shows the live partial text
// (read-only) and Send waits; `updateChatMic(chatEl, mic)` patches partial / level in place so
// main needn't re-render the thread ten times a second. With `showSource`, coach bubbles carry a
// text badge: "On-device AI" (source 'apple') or "Quick replies" ('rules' / 'chip')
// (`[data-chat-source]`). A message's `note` (the brain note) is a muted system line with an
// info icon (`.chat-note`, role="note"). The typing state reads "Thinking…".
// Task 21: `onInputFocus` fires when the text box gets focus (main warms Apple's model then).
// Task 17: `card.kind === 'checkIn'` draws the weekly check-in card (checkInCard.ts) with
// `checkInQuestions` / `checkIns` from props and `onCheckInDone` / `onCheckInSkip`.
import { dateText } from '../../core/trainer/actions/lighter';
import {
  QUICK_CHIPS,
  SHORT_ON_TIME_CHIP,
  STARTER_CHIPS,
  type CoachArgs,
  type CoachChipId,
  type QuickChipId,
} from '../../core/trainer/coach';
import type { BodyArea, BrainSource, ChatMessage, CheckIn, FocusBlock } from '../../core/types';
import { h } from '../dom';
import { emptyState } from '../emptyState';
import { icon, type IconName } from '../icons';
import { moodClass } from '../tokens';
import { buildCheckInCard, type CheckInAnswers, type CheckInQuestionView } from './checkInCard';
import { buildFoodCard } from './foodCard';
import { buildFocusBlockCard, buildMissingBlockCard } from './focusBlockCard';
import { whyButton } from './learnCard';
import { micButton, type MicProps, type MicView } from './micButton';
import { buildRedFlagCard, buildThreadProposalCard, type Built } from './proposalCard';
import './coach.css';
import './chat.css';

export type ChatChip = { id: CoachChipId; label: string; args?: CoachArgs };

/** M12 1b: the chat's quick chips are core's QUICK_CHIPS plus "Short on time". */
export type ChatQuickId = QuickChipId | 'shortOnTime';

/** Quick-chip icons (decorative; every chip has words). Labels come from core. */
const QUICK_ICON: Record<ChatQuickId, IconName> = {
  notToday: 'calendar',
  easyOn: 'pause',
  lighter: 'minus',
  swap: 'flip',
  adjustPlan: 'sliders',
  food: 'flame',
  focusBlock: 'trend',
  shortOnTime: 'timer',
};

type ChatQuickChip = { id: ChatQuickId; label: string; icon: IconName };

const CORE_QUICK: readonly ChatQuickChip[] = QUICK_CHIPS.map((c) => ({
  id: c.id as QuickChipId,
  label: c.label,
  icon: QUICK_ICON[c.id as QuickChipId],
}));
/** M12 1b "Short on time" (core SHORT_ON_TIME_CHIP): asks how long, then proposes today's cut. */
const SHORT_CHIP: ChatQuickChip = {
  id: 'shortOnTime',
  label: SHORT_ON_TIME_CHIP.label,
  icon: QUICK_ICON.shortOnTime,
};
const afterLighter = CORE_QUICK.findIndex((c) => c.id === 'lighter') + 1;

/**
 * The quick chips: core's order, with "Short on time" next to "Lighter today" (both change
 * today only) and the M12 focusBlock chip ("Build a focus block"). Tab only: the Pause sheet
 * keeps its three (WORKOUT_CHAT_CHIPS).
 */
export const CHAT_CHIPS: readonly ChatQuickChip[] = [
  ...CORE_QUICK.slice(0, afterLighter),
  SHORT_CHIP,
  ...CORE_QUICK.slice(afterLighter),
];

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
export const THINKING_LABEL = 'Thinking…';
export const LISTENING_PLACEHOLDER = 'Listening…';

/** The bubble badge: which brain answered, in words (never colour alone). */
export function sourceBadge(source: BrainSource): string | null {
  if (source === 'apple') return 'On-device AI';
  if (source === 'rules' || source === 'chip') return 'Quick replies';
  return null;
}

export type ChatProps = {
  messages: readonly ChatMessage[];
  variant: 'tab' | 'sheet';
  /** The coach is answering: the typing indicator. */
  typing?: boolean | undefined;
  /** Quick chips to offer (default: all for the tab, the workout three for the sheet). */
  chips?: readonly ChatQuickId[] | undefined;
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
  /** M12 slice 2: the hold-to-talk mic (omit = 'hidden'). Only beside the text box. */
  mic?: MicProps | undefined;
  /** M12 slice 2: badge coach bubbles with who answered (main: the iPhone app only). */
  showSource?: boolean | undefined;
  /** M12 slice 2: the check-in questions (core CHECK_IN_QUESTIONS, mapped). */
  checkInQuestions?: readonly CheckInQuestionView[] | undefined;
  /** M12 slice 2: saved check-ins by weekStart (the summary line of a done card). */
  checkIns?: Readonly<Record<string, CheckIn>> | undefined;
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
  /** M12 1b: "Why?" under a coach message with `learnId`; omit → no link. */
  onLearn?: ((learnId: string, opener: HTMLElement) => void) | undefined;
  /** M12 slice 2: mic pressed (pointer down / Space down). */
  micDown?: (() => void) | undefined;
  /** Released on the button: send what was heard (with `viaMic`). */
  micUp?: (() => void) | undefined;
  /** Released off the button, Escape, pointercancel or the app left: send nothing. */
  micCancel?: (() => void) | undefined;
  /**
   * Checkpoint J: "Download speech for the mic" (mic 'unavailable' with reason
   * 'modelNotInstalled' / 'installFailed'). Main: set mic { state: 'downloading' }, await
   * GymSpeech.installModel(), then re-check (idle) or { state: 'unavailable', reason:
   * 'installFailed' }. Omit → the plain line, no button.
   */
  micInstall?: (() => void) | undefined;
  /** M12 slice 2: check-in card Done (answers given, ≥ 1) / Skip this week, by message id. */
  onCheckInDone?: ((messageId: number, answers: CheckInAnswers) => void) | undefined;
  onCheckInSkip?: ((messageId: number) => void) | undefined;
  /** M12 slice 2: the text box got focus (a question is likely coming: main prewarms). */
  onInputFocus?: (() => void) | undefined;
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
  const allow = new Set<ChatQuickId>(
    p.chips ?? (p.variant === 'sheet' ? WORKOUT_CHAT_CHIPS : CHAT_CHIPS.map((c) => c.id)),
  );
  return CHAT_CHIPS.filter((c) => allow.has(c.id));
}

/**
 * Unsent words per frame, kept across re-renders: main rebuilds the chat when anything arrives
 * (a check-in card on open, a reply), which would otherwise drop what he is typing.
 */
const drafts = new Map<'tab' | 'sheet', string>();

/** Test-only: forget unsent words. */
export function resetChatDrafts(): void {
  drafts.clear();
}

/** The trimmed text to send, or null for nothing worth sending. */
export function textToSend(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 200) : null;
}

// Core's quick chips only: a reply's "20 min" chips (shortOnTime + args) are follow-ups.
const QUICK_IDS = new Set<string>(CORE_QUICK.map((c) => c.id));
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

/** Gap kept above a tall newest card whose top is scrolled to. */
const NEWEST_TOP_GAP = 8;

/**
 * Where the thread scrolls on render: the bottom, unless the newest item (its offset in the
 * thread and its height) is taller than the thread's box; then its top shows, so a long card is
 * read from its start (its buttons are a short scroll away), never from its end.
 */
export function newestScrollTop(o: {
  scrollHeight: number;
  clientHeight: number;
  itemTop?: number | undefined;
  itemHeight?: number | undefined;
}): number {
  const bottom = Math.max(0, o.scrollHeight - o.clientHeight);
  if (o.itemTop === undefined || o.itemHeight === undefined) return bottom;
  if (o.itemHeight + NEWEST_TOP_GAP <= o.clientHeight) return bottom;
  return Math.min(bottom, Math.max(0, o.itemTop - NEWEST_TOP_GAP));
}

/** The bits of the thread box `pinNewest` reads and writes (a real element in the app). */
export type ScrollBox = { scrollTop: number; scrollHeight: number; clientHeight: number };
/** The newest item: its top inside the thread's content (`offsetTop`, transform-free) and height. */
export type ThreadItem = { offsetTop: number; offsetHeight: number };

/**
 * Scrolls the thread to its newest item (`newestScrollTop`). Uses offsetTop / offsetHeight (the
 * thread box is the items' offset parent, chat.css), so a rise-in transform mid-animation never
 * skews it. Returns the scrollTop it set.
 */
export function pinNewest(scroll: ScrollBox, newest: ThreadItem | null): number {
  const top = newestScrollTop({
    scrollHeight: scroll.scrollHeight,
    clientHeight: scroll.clientHeight,
    itemTop: newest ? newest.offsetTop : undefined,
    itemHeight: newest ? newest.offsetHeight : undefined,
  });
  scroll.scrollTop = top;
  return top;
}

/** How far above the bottom he must scroll before the thread stops following new layout. */
const FOLLOW_SLACK = 48;

/**
 * Keeps the newest item in view: once after mount (next frame), then whenever the thread box or
 * its content changes size (keyboard, dock rows, fonts), until he scrolls up himself.
 */
function followNewest(scroll: HTMLElement, list: HTMLElement): void {
  if (typeof requestAnimationFrame !== 'function') return;
  let following = true;
  let mine = -1; // the scrollTop we last set (scroll events at it are ours)
  const pin = () => {
    if (!following || !scroll.isConnected) return;
    mine = pinNewest(scroll, list.lastElementChild as HTMLElement | null);
  };
  requestAnimationFrame(pin);
  scroll.addEventListener('scroll', () => {
    if (Math.abs(scroll.scrollTop - mine) <= 1) return;
    const fromBottom = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
    following = fromBottom <= FOLLOW_SLACK;
    if (following) mine = scroll.scrollTop;
  });
  const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  if (typeof RO === 'function') {
    const ro = new RO(() => {
      if (!scroll.isConnected) {
        ro.disconnect();
        return;
      }
      pin();
    });
    ro.observe(scroll);
    ro.observe(list);
  }
}

// ---------- the page after the iOS keyboard ----------

let pageY: number | null = null;
let viewportHooked = false;

const isChatInput = (el: unknown): boolean =>
  !!el &&
  typeof (el as Element).classList?.contains === 'function' &&
  (el as Element).classList.contains('cs-input');

/**
 * Checkpoint J: iOS (WKWebView) scrolls the whole page up to show the text box over the keyboard
 * and doesn't always scroll it back when the keyboard closes, leaving the Coach title above the
 * screen and a band under the tab bar. The chat screens are one viewport tall and never need the
 * page scrolled, so: note the page offset when a chat text box takes focus, and put it back when
 * focus leaves every chat text box (now, and again once the keyboard has finished closing, on
 * the visualViewport resize).
 */
function settlePageAfterKeyboard(root: HTMLElement): void {
  const w = (globalThis as { window?: Window }).window;
  if (!w || typeof w.scrollTo !== 'function') return;
  const settle = () => {
    if (pageY === null) return;
    const d = (globalThis as { document?: Document }).document;
    if (isChatInput(d?.activeElement)) return; // still typing (or refocused after a re-render)
    const y = pageY;
    if (w.scrollY !== y || w.scrollX !== 0) w.scrollTo(0, y);
    if (!d?.querySelector?.('[data-chat]')) pageY = null;
  };
  root.addEventListener('focusin', (ev) => {
    if (isChatInput(ev.target) && pageY === null) pageY = w.scrollY || 0;
  });
  root.addEventListener('focusout', () => {
    setTimeout(settle, 0);
    // After the keyboard's close animation, where WebKit sometimes moves the page again.
    setTimeout(settle, 400);
  });
  const vv = w.visualViewport;
  if (vv && !viewportHooked) {
    viewportHooked = true;
    vv.addEventListener('resize', settle);
  }
}

/** "Mon 9 Nov to Sun 15 Nov". */
export function recapRange(from: string, to: string): string {
  return `${dateText(from)} to ${dateText(to)}`;
}

// ---------- pieces ----------

function bubble(m: ChatMessage, text: string = m.text): HTMLElement {
  return h(
    'div',
    { class: `cs-msg chat-bubble cs-msg-${m.role}` },
    h('span', { class: 'sr-only' }, m.role === 'coach' ? 'Coach: ' : 'You: '),
    text,
  );
}

/** A coach reply that introduces its options ("I can help with:"): its chips finish it. */
function leadIn(m: ChatMessage | undefined): m is ChatMessage {
  return !!m && m.role === 'coach' && !m.card && /:\s*$/.test(m.text);
}

/**
 * An older lead-in (its chips are gone from the screen) reads whole, its options as words:
 * "I can help with: Not today, Lighter today." Anything else: its own text.
 */
function leadInText(m: ChatMessage): string {
  const labels = (m.chips ?? []).map((c) => c.label).filter(Boolean);
  return leadIn(m) && labels.length ? `${m.text.trimEnd()} ${labels.join(', ')}.` : m.text;
}

function followUpRow(followUps: HTMLElement[]): HTMLElement {
  return h(
    'div',
    { class: 'cs-chips chat-row cs-followups', role: 'group', 'aria-label': 'Options' },
    ...followUps,
  );
}

function quickRow(chips: HTMLElement[]): HTMLElement {
  return h(
    'div',
    { class: 'cs-chips chat-row chat-quick', role: 'group', 'aria-label': 'Quick actions' },
    ...chips,
  );
}

/** The newest lead-in's options, under its bubble (follow-ups first, as in the dock). */
function offersGroup(followUps: HTMLElement[], chips: HTMLElement[], hook: string): HTMLElement {
  return h(
    'div',
    { class: 'chat-offers', [hook]: true },
    followUps.length ? followUpRow(followUps) : null,
    chips.length ? quickRow(chips) : null,
  );
}

function sourceLine(source: BrainSource): HTMLElement | null {
  const text = sourceBadge(source);
  return text
    ? h(
        'p',
        { class: 'chat-source', 'data-chat-source': source },
        h('span', { class: 'sr-only' }, 'Answered by '),
        text,
      )
    : null;
}

function noteLine(note: string): HTMLElement {
  return h(
    'p',
    { class: 'chat-note', role: 'note', 'data-chat-note': true },
    icon('help', 'sm'),
    h('span', {}, note),
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
    h(
      'span',
      { class: 'chat-dots' },
      h('span', { class: 'chat-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'chat-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'chat-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'chat-thinking' }, THINKING_LABEL),
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
  // A lead-in reply ("I can help with:") as the newest message: its options sit right under its
  // bubble in the thread, so it never reads as a cut-off sentence (and not in the dock too).
  const inlineOffers = leadIn(last(p.messages)) && (chips.length > 0 || followUps.length > 0);

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
      const newestLeadIn = inlineOffers && i === lastIndex;
      if (m.text) item.append(bubble(m, newestLeadIn ? m.text : leadInText(m)));
      if (newestLeadIn) item.append(offersGroup(followUps, chips, 'data-chat-offers'));
      if (m.text && m.role === 'coach' && p.showSource) {
        const badge = sourceLine(m.source);
        if (badge) item.append(badge);
      }
      const learnId = m.learnId;
      if (learnId && m.role === 'coach' && a.onLearn) {
        const onLearn = a.onLearn;
        const why = whyButton((opener) => onLearn(learnId, opener), {
          label: 'Why? Read more',
          className: 'chat-learn',
          attrs: { 'data-learn-open': learnId },
        });
        item.append(why);
        cycle.push(why);
      }
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
      } else if (card?.kind === 'checkIn' && p.checkInQuestions?.length) {
        const pending = card.status === 'pending' && !!a.onCheckInDone && !!a.onCheckInSkip;
        built = buildCheckInCard(
          {
            weekStart: card.weekStart,
            // Without the callbacks a pending card can't be answered: show nothing to tap.
            status: pending || card.status !== 'pending' ? card.status : 'skipped',
            questions: p.checkInQuestions,
            saved: p.checkIns?.[card.weekStart],
          },
          {
            onDone: (answers) => a.onCheckInDone?.(id, answers),
            onSkip: () => a.onCheckInSkip?.(id),
          },
        );
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
    if (m.note) item.append(noteLine(m.note));
    list.append(item);
  });
  if (p.typing) list.append(typingIndicator());

  // Empty thread: an icon, a line and the starters.
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
    // M13 task 22: the shared empty state; the starters are its one action (a group).
    starters = emptyState({
      kind: 'coach-thread',
      icon: 'spark',
      line: EMPTY_LINE,
      class: 'chat-empty',
      lineClass: 'chat-empty-line',
      action: h(
        'div',
        { class: 'chat-starters', role: 'group', 'aria-label': 'Suggestions' },
        ...chips,
      ),
    });
  }

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

  // A pending focus block keeps the text box: its edits are typed ("only 4 days a week",
  // "swap Thursday's flyes", SPEC M12 goal 6). Quick chips still wait for the answer.
  const editable = waiting && last(p.messages)?.card?.kind === 'focusBlock';
  let typingBox: HTMLElement | null = null;
  let micView: MicView | null = null;
  let input: HTMLInputElement | null = null;
  let sendBtn: HTMLButtonElement | null = null;
  let live: HTMLElement | null = null;
  if (p.allowTyping && a.onText && !red && (!waiting || editable)) {
    const onText = a.onText;
    const inputId = sheet ? 'chat-input-sheet' : 'chat-input';
    const box = h('input', {
      type: 'text',
      id: inputId,
      class: 'cs-input',
      enterkeyhint: 'send',
      autocomplete: 'off',
      maxlength: 200,
    });
    input = box;
    box.value = drafts.get(p.variant) ?? '';
    box.addEventListener('input', () => {
      drafts.set(p.variant, box.value ?? '');
    });
    if (a.onInputFocus) {
      const onFocus = a.onInputFocus;
      box.addEventListener('focus', () => onFocus());
    }
    const send = () => {
      if (box.readOnly) return;
      const t = textToSend(box.value ?? '');
      if (!t) return;
      drafts.delete(p.variant);
      onText(t);
    };
    box.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'Enter') {
        ev.preventDefault();
        send();
      }
    });
    const sendEl = h(
      'button',
      { type: 'button', class: 'cs-btn cs-send', onclick: send },
      h('span', {}, 'Send'),
    );
    sendBtn = sendEl;
    const mic = p.mic ?? { state: 'hidden' };
    const canHold = !!(a.micDown && a.micUp && a.micCancel);
    micView =
      mic.state === 'hidden' || ((mic.state === 'idle' || mic.state === 'listening') && !canHold)
        ? null
        : micButton(mic, {
            micDown: () => a.micDown?.(),
            micUp: () => a.micUp?.(),
            micCancel: () => a.micCancel?.(),
            micInstall: a.micInstall,
          });
    const holdBtn = micView?.button ? micView.el : null;
    // The live words, whole and wrapping (the text box is narrow next to the held button and
    // would show only their tail). Above the row, like the hint, so the button never moves.
    live = holdBtn
      ? h('p', { class: 'mic-live', 'data-mic-live': true, 'aria-hidden': 'true', hidden: true })
      : null;
    typingBox = h(
      'div',
      { class: 'cs-typing chat-input' },
      h('label', { class: 'sr-only', for: inputId }, 'Ask the coach'),
      // The hint goes above the row: the dock is bottom-anchored, so a line appearing under the
      // row while listening would lift the held button out from under the finger.
      micView?.hint ?? null,
      live,
      h('div', { class: 'cs-typing-row' }, box, holdBtn, sendEl),
      holdBtn ? null : (micView?.el ?? null),
    );
    box.setAttribute('placeholder', 'Ask the coach');
    cycle.push(box);
    if (micView?.button) cycle.push(micView.button);
    cycle.push(sendEl);
    applyMicToInput(box, sendEl, mic, live);
  }

  const scroll = h('div', { class: 'cs-scroll chat-scroll' }, starters, list);
  // Newest message in view once the caller has mounted the chat (chat convention); a card
  // taller than the thread shows from its top. Checkpoint J: it also stays in view after that
  // (keyboard opening or closing, the dock growing a chip row, late layout) until he scrolls up.
  followNewest(scroll, list);

  const dock = h(
    'div',
    { class: 'chat-dock' },
    followUps.length && !inlineOffers ? followUpRow(followUps) : null,
    areas.length
      ? h(
          'div',
          { class: 'cs-chips cs-areas', role: 'group', 'aria-label': 'Go easy on' },
          ...areas,
        )
      : null,
    chips.length && !inlineOffers ? quickRow(chips) : null,
    typingBox,
    h('p', { class: 'cs-privacy chat-privacy' }, icon('lock', 'sm'), h('span', {}, PRIVACY_LINE)),
  );

  const body = [head, scroll, dock];
  const handle: MicHandle = { view: micView, input, send: sendBtn, live };
  if (!sheet) {
    const tab = h(
      'section',
      { class: 'chat chat-tab', 'data-chat': true, 'data-variant': 'tab', 'aria-label': 'Coach' },
      ...body,
    );
    micHandles.set(tab, handle);
    settlePageAfterKeyboard(tab);
    return tab;
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
      // Escape mid-hold cancels the mic (micButton), not the sheet.
      if (p.mic?.state === 'listening') return;
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
  micHandles.set(root, handle);
  settlePageAfterKeyboard(root);
  return root;
}

// ---------- the mic in place ----------

type MicHandle = {
  view: MicView | null;
  input: HTMLInputElement | null;
  send: HTMLButtonElement | null;
  live: HTMLElement | null;
};
const micHandles = new WeakMap<object, MicHandle>();

/**
 * Listening: the live words show whole above the row (`[data-mic-live]`, wrapping) and in the
 * text box (read-only, the newest words in view; it's what release sends), and Send
 * is disabled and hidden (chat.css keeps its space, so the mic button never moves under the held
 * finger); release sends them.
 */
function applyMicToInput(
  box: HTMLInputElement,
  send: HTMLButtonElement,
  mic: MicProps,
  live: HTMLElement | null,
): void {
  const listening = mic.state === 'listening';
  if (live) {
    const words = listening ? (mic.partial ?? '').trim() : '';
    live.replaceChildren(h('span', { class: 'mic-live-text' }, words));
    if (words) live.removeAttribute('hidden');
    else live.setAttribute('hidden', '');
  }
  box.readOnly = listening;
  if (listening) {
    box.setAttribute('readonly', '');
    box.setAttribute('placeholder', LISTENING_PLACEHOLDER);
    box.value = mic.partial ?? '';
    // Keep the end of what was heard in view (an input shows its start by default).
    if (typeof box.scrollWidth === 'number') box.scrollLeft = box.scrollWidth;
    send.setAttribute('disabled', '');
    send.setAttribute('hidden', '');
  } else {
    box.removeAttribute('readonly');
    box.setAttribute('placeholder', 'Ask the coach');
    send.removeAttribute('disabled');
    send.removeAttribute('hidden');
  }
}

/**
 * Patches the mic of a chat built by `chat()` / `coachTabScreen()` (pass either root) in place:
 * the level ring, the pressed state and hint, the partial words in the text box. Use it for `partial` and
 * `level` events; re-render for a state change to or from 'hidden' / 'unavailable' / 'downloading'. Returns
 * false when there's nothing to patch (no mic in that chat): re-render instead.
 */
export function updateChatMic(root: HTMLElement, mic: MicProps): boolean {
  const target = micHandles.get(root);
  if (!target?.view?.button || !target.input || !target.send) return false;
  if (mic.state !== 'idle' && mic.state !== 'listening') return false;
  target.view.update(mic);
  applyMicToInput(target.input, target.send, mic, target.live);
  return true;
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
  const c = chat({ ...p, variant: 'tab' }, a);
  const screen = h(
    'main',
    { class: `screen has-tabbar coach-screen ${moodClass('pro')}`, 'data-screen': 'coach' },
    c,
    bar,
  );
  const handle = micHandles.get(c);
  if (handle) micHandles.set(screen, handle);
  return screen;
}
