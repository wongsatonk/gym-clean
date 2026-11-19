// M4b demo player controls, M13d task 40h (SPEC M13d Goal 7): the bar under the canvas.
//
// Front / Side are a segmented view choice (aria-pressed), so they keep their pill look (Goal 7
// leaves segmented choices as they are). Play / Pause is the bar's one action: the shared round
// `iconButton` with our play / pause icon and the word under it. The word is the accessible name
// ("Play" / "Pause", unchanged); the icon is decorative.
//
// No three.js and no pose math here: player.ts wires these to the scene. Built with h() so the
// render tests run on the fake DOM.
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { icon, type IconName } from '../icons';

export type DemoView = 'front' | 'side';

/** The Play button's icon and word for a playing state (what a tap will do). */
export function playControl(playing: boolean): { icon: IconName; label: 'Play' | 'Pause' } {
  return playing ? { icon: 'pause', label: 'Pause' } : { icon: 'play', label: 'Play' };
}

// margin-top: level with the Play circle (the round button has 4px padding round its circle).
const VIEW_BTN_STYLE =
  'min-height:56px;min-width:56px;flex:1;margin-top:4px;font-size:var(--fs-body);font-weight:600;border-radius:var(--r-btn);';

export type DemoControls = {
  /** div.demo3d-controls (role=group): Front, Side, Play. */
  readonly bar: HTMLDivElement;
  readonly front: HTMLButtonElement;
  readonly side: HTMLButtonElement;
  readonly play: HTMLButtonElement;
  /** Shows Play (paused) or Pause (playing): icon and word together. */
  showPlaying(on: boolean): void;
  /** Marks the pressed view; null = neither (a demo that opens on its own turn). */
  showView(v: DemoView | null): void;
};

export function demoControls(handlers: {
  onView: (v: DemoView) => void;
  onTogglePlay: () => void;
}): DemoControls {
  const viewBtn = (v: DemoView, label: string) =>
    h(
      'button',
      {
        type: 'button',
        class: `demo3d-btn demo3d-${v}`,
        style: VIEW_BTN_STYLE,
        'aria-pressed': 'false',
        onclick: () => handlers.onView(v),
      },
      label,
    );
  const front = viewBtn('front', 'Front');
  const side = viewBtn('side', 'Side');

  const start = playControl(false);
  const play = iconButton({
    icon: start.icon,
    label: start.label,
    variant: 'secondary',
    class: 'demo3d-play',
    onClick: () => handlers.onTogglePlay(),
  });
  // iconButton's children: [0] the circle (holds the icon), [1] the word.
  const circle = play.children[0] as HTMLElement;
  const word = play.children[1] as HTMLElement;

  const bar = h(
    'div',
    {
      class: 'demo3d-controls',
      role: 'group',
      'aria-label': 'Demo controls',
      // The pills sit level with the circle; the word hangs below it.
      style: 'display:flex;gap:8px;align-items:flex-start;',
    },
    front,
    side,
    play,
  );

  let shown: boolean | null = false;
  return {
    bar,
    front,
    side,
    play,
    showPlaying(on) {
      if (shown === on) return;
      shown = on;
      const c = playControl(on);
      circle.replaceChildren(icon(c.icon, 'md'));
      word.textContent = c.label;
    },
    showView(v) {
      front.setAttribute('aria-pressed', String(v === 'front'));
      side.setAttribute('aria-pressed', String(v === 'side'));
    },
  };
}
