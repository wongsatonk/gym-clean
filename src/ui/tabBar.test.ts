/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asFake, useFakeDom } from './screens/testDom';
import { CENTRE_TAB, TABS, indicatorTransform, resetTabMemory, tabBar, type TabId } from './tabBar';

useFakeDom();
beforeEach(() => resetTabMemory());

const stylesCss = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const flat = stylesCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = flat.indexOf(`\n${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  return flat.slice(at, flat.indexOf('}', at));
}

describe('tabBar: M12 five tabs with a centre Coach', () => {
  it('Today · Fuel · Coach · Calendar · Settings, Coach in the centre', () => {
    expect(TABS.map((t) => t.id)).toEqual(['today', 'fuel', 'coach', 'calendar', 'settings']);
    expect(TABS.map((t) => t.label)).toEqual(['Today', 'Fuel', 'Coach', 'Calendar', 'Settings']);
    expect(CENTRE_TAB).toBe('coach');
    const bar = asFake(tabBar('today', () => {}));
    expect(bar.classes).toEqual(['tabbar', 'tabbar-5']);
    const tabs = bar.byClass('tab');
    expect(tabs.map((t) => t.getAttribute('data-tab'))).toEqual(TABS.map((t) => t.id));
    expect(tabs[2]?.classes).toContain('tab-centre');
    expect(tabs.filter((t) => t.classes.includes('tab-centre'))).toHaveLength(1);
    expect(tabs[2]?.byClass('tab-bubble')).toHaveLength(1);
  });

  it('each tab has an icon and a visible label (chat for Coach, calendar for Calendar)', () => {
    const tabs = asFake(tabBar('today', () => {})).byClass('tab');
    expect(tabs.every((t) => t.byClass('tab-label').length === 1)).toBe(true);
    expect(tabs.map((t) => t.byTag('svg')[0]?.getAttribute('data-icon'))).toEqual([
      'home',
      'bowl',
      'chat',
      'calendar',
      'sliders',
    ]);
    expect(tabs.map((t) => t.byClass('tab-label')[0]?.textContent)).toEqual(
      TABS.map((t) => t.label),
    );
  });

  it.each(TABS.map((t) => t.id))('active %s: aria-current on that tab only', (id) => {
    const tabs = asFake(tabBar(id, () => {})).byClass('tab');
    const current = tabs.filter((t) => t.getAttribute('aria-current') === 'page');
    expect(current.map((t) => t.getAttribute('data-tab'))).toEqual([id]);
    expect(current[0]?.classes).toContain('on');
    expect(tabs.filter((t) => t.classes.includes('on'))).toHaveLength(1);
  });

  it('the active tab does nothing; any other calls onSelect', () => {
    const picked: TabId[] = [];
    const tabs = asFake(tabBar('coach', (t) => picked.push(t))).byClass('tab');
    tabs[2]?.click();
    tabs[0]?.click();
    tabs[3]?.click();
    expect(picked).toEqual(['today', 'calendar']);
  });

  it('the indicator sits under the active tab (one tab width per step)', () => {
    const bar = asFake(tabBar('calendar', () => {}));
    const ind = bar.oneByClass('tab-ind');
    expect(ind.getAttribute('aria-hidden')).toBe('true');
    expect(ind.getAttribute('style')).toBe('transform: translateX(300%)');
    expect(indicatorTransform('today')).toBe('translateX(0%)');
    expect(indicatorTransform('coach')).toBe('translateX(200%)');
  });

  it('slides from the previous tab with --dur-base when motion is allowed', () => {
    const animate = vi.fn();
    const g = globalThis as unknown as {
      document: { createElement: (t: string) => unknown };
      matchMedia?: unknown;
    };
    const make = g.document.createElement;
    g.document.createElement = (t: string) => {
      const el = make(t) as { animate?: unknown; closest?: unknown };
      el.animate = animate;
      el.closest = () => null;
      return el;
    };
    tabBar('today', () => {});
    expect(animate).not.toHaveBeenCalled(); // first bar: nothing to slide from
    tabBar('settings', () => {});
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { transform: 'translateX(0%)' },
      { transform: 'translateX(400%)' },
    ]);
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 220 });

    // Reduced motion: no slide, the indicator is simply in place.
    animate.mockClear();
    g.matchMedia = () => ({ matches: true });
    try {
      const bar = asFake(tabBar('fuel', () => {}));
      expect(animate).not.toHaveBeenCalled();
      expect(bar.oneByClass('tab-ind').getAttribute('style')).toBe('transform: translateX(100%)');
    } finally {
      delete g.matchMedia;
    }
  });

  it('at 390px every tab is at least 56px wide and the bar 72px tall (CSS)', () => {
    // .tabbar spans the 390px screen (margin -16px over the 16px gutters); 5 equal flex tabs.
    expect(rule('.tabbar')).toMatch(/margin: auto -16px 0;/);
    expect(rule('.tab')).toMatch(/flex: 1;/);
    expect(rule('.tab')).toMatch(/min-height: var\(--tab-h\);/);
    expect(390 / TABS.length).toBeGreaterThanOrEqual(56);
    expect(rule('.tab-ind')).toMatch(/width: 20%;/);
    expect(rule('.tab-bubble')).toMatch(/width: var\(--tap-min\);/);
    expect(rule('.tab-bubble')).toMatch(/height: var\(--tap-min\);/);
  });
});
