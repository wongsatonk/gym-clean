// M4e tab bar (mix README "cohesion anchors"), with Fuel since M7 (M7-q7) and, since M12
// (task 9), five tabs: Today · Fuel · Coach · Calendar · Settings. Calendar replaces History
// (per-exercise history stays one tap deeper). Coach is the centre tab, drawn raised and filled.
// 72px tabs (78px wide at 390px), icon + visible label, the active tab marked by an action-colour
// bar, action-colour icon and aria-current="page" (never colour alone; the Coach bubble also
// gains a ring). The bar slides from the previous tab to the new one (--dur-base, transform
// only; instant under reduced motion via motion.ts). Buttons, not links: no URL routes.
import { h } from './dom';
import { icon, type IconName } from './icons';
import { DUR, EASE, motionAllowed } from './motion';

export type TabId = 'today' | 'fuel' | 'coach' | 'calendar' | 'settings';

type TabDef = { id: TabId; label: string; icon: IconName };

/** M12 task 9: the 5-tab order, Coach in the centre. */
export const TABS: readonly TabDef[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'fuel', label: 'Fuel', icon: 'bowl' },
  { id: 'coach', label: 'Coach', icon: 'chat' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

/** The raised centre tab. */
export const CENTRE_TAB: TabId = 'coach';

/** The last tab drawn active, so the next bar can slide its indicator from there. */
let lastActive: TabId | null = null;

/** Test-only: forget the previous tab (each test starts without a slide). */
export function resetTabMemory(): void {
  lastActive = null;
}

const indexOf = (id: TabId): number => TABS.findIndex((t) => t.id === id);

/** The indicator's transform for a tab: one tab width per step. */
export function indicatorTransform(id: TabId): string {
  return `translateX(${indexOf(id) * 100}%)`;
}

/**
 * The bottom tab bar. Tapping the active tab does nothing; any other calls `onSelect`.
 * Put it last inside a `.screen.has-tabbar` root: it sticks to the bottom of the viewport.
 */
export function tabBar(active: TabId, onSelect: (tab: TabId) => void): HTMLElement {
  const indicator = h('span', {
    class: 'tab-ind',
    'aria-hidden': 'true',
    'data-tab-ind': active,
    style: `transform: ${indicatorTransform(active)}`,
  });
  const from = lastActive;
  lastActive = active;
  if (from && from !== active && motionAllowed(indicator)) {
    indicator.animate(
      [{ transform: indicatorTransform(from) }, { transform: indicatorTransform(active) }],
      { duration: DUR.base, easing: EASE.standard },
    );
  }
  return h(
    'nav',
    { class: 'tabbar tabbar-5', 'aria-label': 'Main', 'data-tabbar': true },
    indicator,
    ...TABS.map((t) => {
      const on = t.id === active;
      const centre = t.id === CENTRE_TAB;
      const cls = ['tab', centre ? 'tab-centre' : '', on ? 'on' : ''].filter(Boolean).join(' ');
      return h(
        'button',
        {
          type: 'button',
          class: cls,
          'data-tab': t.id,
          'aria-current': on ? 'page' : undefined,
          onclick: () => {
            if (!on) onSelect(t.id);
          },
        },
        centre ? h('span', { class: 'tab-bubble' }, icon(t.icon, 'md')) : icon(t.icon, 'md'),
        h('span', { class: 'tab-label' }, t.label),
      );
    }),
  );
}
