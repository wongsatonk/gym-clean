// M4e tab bar (mix README "cohesion anchors"): Today / History / Settings (History since M6).
// 72px tabs, icon + visible label, the active tab marked by an orange bar, orange icon and
// aria-current="page" (never colour alone). Buttons, not links: the app has no URL routes.
//
// M7 (M7-q7): Fuel is a 4th tab, Today / Fuel / History / Settings. Until app.ts wires the Fuel
// view, it's opt-in: `tabBar(active, onSelect, { fuel: true })` shows 4 tabs and may report
// 'fuel'. Without the option the bar and `TabId` are exactly the M6 ones, so app.ts's exhaustive
// `goTab` switch keeps compiling. When main wires Fuel it can fold `AppTabId` into `TabId`.
import { h } from './dom';
import { icon, type IconName } from './icons';

export type TabId = 'today' | 'history' | 'settings';
/** Every tab id, Fuel included (M7). */
export type AppTabId = TabId | 'fuel';

type TabDef<T extends AppTabId> = { id: T; label: string; icon: IconName };

export const TABS: readonly TabDef<TabId>[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'history', label: 'History', icon: 'bars' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

/** M7-q7: the 4-tab order. */
export const TABS_WITH_FUEL: readonly TabDef<AppTabId>[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'fuel', label: 'Fuel', icon: 'bowl' },
  { id: 'history', label: 'History', icon: 'bars' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

export type TabBarOptions = { fuel: true };

/**
 * The bottom tab bar. Tapping the active tab does nothing; any other calls `onSelect`.
 * Put it last inside a `.screen.has-tabbar` root: it sticks to the bottom of the viewport.
 */
export function tabBar(active: TabId, onSelect: (tab: TabId) => void): HTMLElement;
export function tabBar(
  active: AppTabId,
  onSelect: (tab: AppTabId) => void,
  opts: TabBarOptions,
): HTMLElement;
export function tabBar(
  active: AppTabId,
  onSelect: ((tab: TabId) => void) | ((tab: AppTabId) => void),
  opts?: TabBarOptions,
): HTMLElement {
  // Without the Fuel option only TabId values are ever passed, so either callback type is safe.
  const select = onSelect as (tab: AppTabId) => void;
  const tabs: readonly TabDef<AppTabId>[] = opts?.fuel ? TABS_WITH_FUEL : TABS;
  return h(
    'nav',
    {
      class: tabs.length > 3 ? 'tabbar tabbar-4' : 'tabbar',
      'aria-label': 'Main',
      'data-tabbar': true,
    },
    ...tabs.map((t) => {
      const on = t.id === active;
      return h(
        'button',
        {
          type: 'button',
          class: on ? 'tab on' : 'tab',
          'data-tab': t.id,
          'aria-current': on ? 'page' : undefined,
          onclick: () => {
            if (!on) select(t.id);
          },
        },
        icon(t.icon, 'md'),
        h('span', { class: 'tab-label' }, t.label),
      );
    }),
  );
}
