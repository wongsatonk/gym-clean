// M13 task 15: the Owner tools switch (option A, his pick 2026-11-17: "Go with option A").
// Tap the About version line 7 times, each tap within 3 s of the last, and an "Owner tools"
// switch appears under it with a short status line ("Owner tools unlocked", words, not colour
// alone). While owner mode is on the switch is always there. This file is the whole mechanism:
// `tapUnlock` is the pure counter; `ownerTools` is the small controller About places.
//
// The switch only reports: `onOwnerChange(on)` → main calls setOwnerMode and re-renders About
// with the new version line. Nothing is spoken (this is never used mid-set).
//
// e2e hooks: `[data-about-version]` (the tappable line), `[data-owner-tools]` (the panel),
// `[data-setting="owner-tools"]` (role=switch), `[data-owner-status]` (role=status).
import { h } from './dom';
import { switchRow } from './screens/settings';

export const UNLOCK_TAPS = 7;
/** Each tap must come within this long of the one before, else the count starts over. */
export const UNLOCK_WINDOW_MS = 3000;

export const OWNER_TOOLS_LABEL = 'Owner tools';
export const OWNER_UNLOCKED_TEXT = 'Owner tools unlocked';

export type TapState = {
  /** Taps in the current run. */
  count: number;
  /** Time (ms) of the last tap, null before the first. */
  last: number | null;
  unlocked: boolean;
};

export const TAP_START: TapState = { count: 0, last: null, unlocked: false };

/** Pure: the state after a tap at `now` (ms). Once unlocked it stays unlocked. */
export function tapUnlock(state: TapState, now: number): TapState {
  if (state.unlocked) return state;
  const gap = state.last === null ? Infinity : now - state.last;
  const count = gap >= 0 && gap <= UNLOCK_WINDOW_MS ? state.count + 1 : 1;
  return { count, last: now, unlocked: count >= UNLOCK_TAPS };
}

export type OwnerToolsProps = {
  /** `versionLine(owner)` from src/core/ownerMode.ts. */
  versionText: string;
  /** Owner mode now. On → the switch shows from the start. */
  owner: boolean;
  /** Clock (ms). Default Date.now. */
  now?: (() => number) | undefined;
};

export type OwnerToolsActions = {
  onOwnerChange: (on: boolean) => void;
};

export type OwnerToolsParts = {
  /** The version line, a quiet button About puts where the version reads. */
  version: HTMLElement;
  /** The panel under it: empty until unlocked (or while owner mode is on). */
  tools: HTMLElement;
};

export function ownerTools(props: OwnerToolsProps, actions: OwnerToolsActions): OwnerToolsParts {
  const now = props.now ?? (() => Date.now());
  let taps: TapState = TAP_START;
  let on = props.owner;
  /** Shown once the 7th tap lands (not when the screen opens with owner mode already on). */
  let justUnlocked = false;

  const tools = h('div', { class: 'owner-tools', 'data-owner-tools': true });

  const draw = () => {
    if (!on && !taps.unlocked) {
      tools.replaceChildren();
      return;
    }
    const sw = switchRow('owner-tools', OWNER_TOOLS_LABEL, on, (next) => {
      on = next;
      actions.onOwnerChange(next);
      draw();
    });
    tools.replaceChildren(
      ...(justUnlocked
        ? [
            h(
              'p',
              {
                class: 'owner-status',
                role: 'status',
                'aria-atomic': 'true',
                'data-owner-status': true,
              },
              OWNER_UNLOCKED_TEXT,
            ),
          ]
        : []),
      sw,
      h(
        'p',
        { class: 'muted set-note owner-note' },
        'Shows the to-dos, the developer log and the build number.',
      ),
    );
  };

  const version = h(
    'button',
    {
      type: 'button',
      class: 'about-version',
      'data-about-version': true,
      onclick: () => {
        if (taps.unlocked) return;
        taps = tapUnlock(taps, now());
        if (taps.unlocked) {
          justUnlocked = !on;
          draw();
        }
      },
    },
    props.versionText,
  );

  draw();
  return { version, tools };
}
