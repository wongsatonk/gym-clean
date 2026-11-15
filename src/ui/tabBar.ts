// M4e tab bar (mix README "cohesion anchors"), with Fuel since M7 (M7-q7):
// Today / Fuel / History / Settings on every tabbed screen.
// 72px tabs, icon + visible label, the active tab marked by an orange bar, orange icon and
// aria-current="page" (never colour alone). Buttons, not links: the app has no URL routes.
import { h } from './dom';
import { icon, type IconName } from './icons';

export type TabId = 'today' | 'fuel' | 'history' | 'settings';
/** Kept as an alias (wave-1 screens import it). */
export type AppTabId = TabId;

type TabDef = { id: TabId; label: string; icon: IconName };

/** M7-q7: the 4-tab order. */
export const TABS: readonly TabDef[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'fuel', label: 'Fuel', icon: 'bowl' },
  { id: 'history', label: 'History', icon: 'bars' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

/** Same as TABS (the bar always has Fuel now). */
export const TABS_WITH_FUEL: readonly TabDef[] = TABS;

/**
 * The bottom tab bar. Tapping the active tab does nothing; any other calls `onSelect`.
 * Put it last inside a `.screen.has-tabbar` root: it sticks to the bottom of the viewport.
 */
export function tabBar(active: TabId, onSelect: (tab: TabId) => void): HTMLElement {
  return h(
    'nav',
    { class: 'tabbar tabbar-4', 'aria-label': 'Main', 'data-tabbar': true },
    ...TABS.map((t) => {
      const on = t.id === active;
      return h(
        'button',
        {
          type: 'button',
          class: on ? 'tab on' : 'tab',
          'data-tab': t.id,
          'aria-current': on ? 'page' : undefined,
          onclick: () => {
            if (!on) onSelect(t.id);
          },
        },
        icon(t.icon, 'md'),
        h('span', { class: 'tab-label' }, t.label),
      );
    }),
  );
}
