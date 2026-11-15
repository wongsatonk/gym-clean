import { describe, expect, it } from 'vitest';
import { asFake, useFakeDom } from './screens/testDom';
import { TABS, TABS_WITH_FUEL, tabBar, type AppTabId, type TabId } from './tabBar';

useFakeDom();

describe('tabBar: M7 Fuel tab', () => {
  it('always has the 4 tabs', () => {
    const picked: TabId[] = [];
    const bar = asFake(tabBar('today', (t) => picked.push(t)));
    expect(bar.byClass('tab').map((t) => t.getAttribute('data-tab'))).toEqual(
      TABS.map((t) => t.id),
    );
    expect(TABS.map((t) => t.id)).toEqual(['today', 'fuel', 'history', 'settings']);
    expect(bar.classes).toEqual(['tabbar', 'tabbar-4']);
  });

  it('Today / Fuel / History / Settings, each icon + label', () => {
    const picked: AppTabId[] = [];
    const bar = asFake(tabBar('today', (t) => picked.push(t)));
    const tabs = bar.byClass('tab');
    expect(TABS_WITH_FUEL.map((t) => t.label)).toEqual(['Today', 'Fuel', 'History', 'Settings']);
    expect(tabs.map((t) => t.getAttribute('data-tab'))).toEqual([
      'today',
      'fuel',
      'history',
      'settings',
    ]);
    expect(tabs[1]?.byTag('svg')[0]?.getAttribute('data-icon')).toBe('bowl');
    expect(tabs.every((t) => t.byClass('tab-label').length === 1)).toBe(true);
    tabs[0]?.click();
    tabs[1]?.click();
    expect(picked).toEqual(['fuel']);
  });
});
