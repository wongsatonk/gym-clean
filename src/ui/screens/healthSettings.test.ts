/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEALTH_TYPES, type HealthSettings, type HealthType } from '../../core/types';
import { checkHealthCopy } from '../../core/health/copy';
import {
  HEALTH_PWA_LINE,
  HEALTH_TYPE_COPY,
  healthSettingsCopy,
  healthSettingsScreen,
  lastReadText,
  type HealthSettingsProps,
} from './healthSettings';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

// Made-up times only (public repo).
const NOW = new Date(2026, 10, 16, 9, 30).getTime();
const ALL_ON = Object.fromEntries(HEALTH_TYPES.map((t) => [t, true])) as Record<
  HealthType,
  boolean
>;
const SETTINGS: HealthSettings = { enabled: ALL_ON, route: 'apple' };

function render(over: Partial<HealthSettingsProps> = {}) {
  const calls = {
    back: 0,
    connect: 0,
    readNow: 0,
    enable: [] as HealthType[],
    del: [] as HealthType[],
  };
  const el = asFake(
    healthSettingsScreen(
      { native: true, connected: true, settings: SETTINGS, now: NOW, ...over },
      {
        onBack: () => calls.back++,
        onConnect: () => calls.connect++,
        onEnable: (t) => calls.enable.push(t),
        onTurnOffAndDelete: (t) => calls.del.push(t),
        onReadNow: () => calls.readNow++,
      },
    ),
  );
  return { el, calls };
}

const attr = (el: FakeEl, name: string, value?: string) =>
  el.find((e) => (value === undefined ? e.hasAttribute(name) : e.getAttribute(name) === value));
const one = (el: FakeEl, name: string, value?: string) => {
  const hit = attr(el, name, value)[0];
  if (!hit) throw new Error(`no [${name}${value === undefined ? '' : `=${value}`}]`);
  return hit;
};

describe('Health settings copy', () => {
  it('every string passes checkCopy + the M11 list, and never says it writes to Health', () => {
    for (const t of healthSettingsCopy()) expect(checkHealthCopy(t).hits, t).toEqual([]);
  });

  it('read-only wording: nothing says it writes, syncs or sends to Health', () => {
    for (const t of healthSettingsCopy())
      expect(t, t).not.toMatch(/\b(write|writes|writing|sync|send|upload)/i);
  });

  it('each type has a label and a one-line explainer of what the coach does with it', () => {
    for (const t of HEALTH_TYPES) {
      const c = HEALTH_TYPE_COPY[t];
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.explainer).toMatch(/^[^.]+\.( [^.]+\.)?$/); // one line, at most two short sentences
      expect(c.explainer.length).toBeLessThanOrEqual(80);
    }
  });

  it('the rendered screen passes too (connected and not)', () => {
    for (const over of [{}, { connected: false }, { native: false }, { reading: true }]) {
      const { el } = render(over);
      const texts = el
        .find((e) => e.tag === '#text')
        .map((e) => e.text.trim())
        .filter(Boolean);
      for (const t of texts) expect(checkHealthCopy(t).hits, t).toEqual([]);
    }
  });

  it('lastReadText', () => {
    expect(lastReadText(undefined, NOW)).toBe('Not read yet');
    expect(lastReadText(new Date(2026, 10, 16, 7, 5).getTime(), NOW)).toBe(
      'Last read: today 07:05',
    );
    expect(lastReadText(new Date(2026, 10, 13, 22, 40).getTime(), NOW)).toBe(
      'Last read: Fri 13 Nov 22:40',
    );
  });
});

describe('PWA (no native bridge)', () => {
  it('shows only the iPhone-app line (plus Back), no switches or buttons', () => {
    const { el, calls } = render({ native: false });
    expect(el.getAttribute('data-screen')).toBe('health-settings');
    expect(one(el, 'data-health-pwa').textContent).toBe(HEALTH_PWA_LINE);
    expect(attr(el, 'data-health-type')).toHaveLength(0);
    expect(attr(el, 'data-health-connect')).toHaveLength(0);
    expect(attr(el, 'data-health-read-now')).toHaveLength(0);
    const buttons = el.byTag('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['‹ Back']);
    buttons[0]?.click();
    expect(calls.back).toBe(1);
  });
});

describe('native, not connected', () => {
  it('Connect button; no Read now; the switches choose what is asked for', () => {
    const { el, calls } = render({ connected: false });
    const connect = one(el, 'data-health-connect');
    expect(connect.textContent).toBe('Connect to Apple Health');
    connect.click();
    expect(calls.connect).toBe(1);
    expect(attr(el, 'data-health-read-now')).toHaveLength(0);
    expect(attr(el, 'data-health-type')).toHaveLength(HEALTH_TYPES.length);
  });

  it('while connecting the button is disabled and says so', () => {
    const { el } = render({ connected: false, reading: true });
    const connect = one(el, 'data-health-connect');
    expect(connect.hasAttribute('disabled')).toBe(true);
    expect(connect.textContent).toBe('Connecting…');
  });
});

describe('native, connected', () => {
  it('Read now + last read time; Reading… disables it', () => {
    const at = new Date(2026, 10, 16, 7, 5).getTime();
    const { el, calls } = render({ settings: { ...SETTINGS, lastReadAt: at } });
    expect(one(el, 'data-health-last-read').textContent).toBe('Last read: today 07:05');
    expect(attr(el, 'data-health-connect')).toHaveLength(0);
    one(el, 'data-health-read-now').click();
    expect(calls.readNow).toBe(1);
    const busy = render({ reading: true }).el;
    expect(one(busy, 'data-health-read-now').hasAttribute('disabled')).toBe(true);
    expect(one(busy, 'data-health-last-read').textContent).toBe('Reading…');
  });

  it('one switch row per type, in HEALTH_TYPES order, with its explainer tied to it', () => {
    const { el } = render({ settings: { ...SETTINGS, enabled: { ...ALL_ON, hrv: false } } });
    const sws = attr(el, 'data-health-type');
    expect(sws.map((s) => s.getAttribute('data-health-type'))).toEqual([...HEALTH_TYPES]);
    for (const sw of sws) {
      const t = sw.getAttribute('data-health-type') as HealthType;
      expect(sw.getAttribute('role')).toBe('switch');
      expect(sw.getAttribute('aria-checked')).toBe(t === 'hrv' ? 'false' : 'true');
      expect(sw.oneByClass('switch-label').textContent).toBe(HEALTH_TYPE_COPY[t].label);
      const desc = one(el, 'id', sw.getAttribute('aria-describedby') ?? '');
      expect(desc.textContent).toBe(HEALTH_TYPE_COPY[t].explainer);
    }
  });

  it('an Off switch turns on in one tap', () => {
    const { el, calls } = render({
      settings: { ...SETTINGS, enabled: { ...ALL_ON, sleep: false } },
    });
    one(el, 'data-health-type', 'sleep').click();
    expect(calls.enable).toEqual(['sleep']);
    expect(calls.del).toEqual([]);
  });

  it('an On switch asks first: Turn off and delete calls back, Keep it closes', () => {
    const { el, calls } = render();
    const sw = one(el, 'data-health-type', 'restingHr');
    const confirm = one(el, 'data-health-confirm', 'restingHr');
    expect(confirm.hasAttribute('hidden')).toBe(true);
    expect(attr(el, 'data-health-delete')).toHaveLength(0);

    sw.click();
    expect(confirm.hasAttribute('hidden')).toBe(false);
    expect(sw.getAttribute('aria-expanded')).toBe('true');
    expect(calls.del).toEqual([]); // nothing deleted by the switch tap alone
    one(el, 'data-health-keep', 'restingHr').click();
    expect(confirm.hasAttribute('hidden')).toBe(true);
    expect(attr(el, 'data-health-delete')).toHaveLength(0);

    sw.click();
    const del = one(el, 'data-health-delete', 'restingHr');
    expect(del.textContent).toBe('Turn off and delete');
    del.click();
    expect(calls.del).toEqual(['restingHr']);
    expect(calls.enable).toEqual([]);
  });
});

describe('Health settings CSS', () => {
  const css = readFileSync(new URL('./healthSettings.css', import.meta.url), 'utf8');
  const rule = (sel: string) => css.match(new RegExp(`\\n${sel} \\{([^}]*)\\}`))?.[1] ?? '';

  it('rows and buttons ≥ 56px, text at body size, tokens only', () => {
    expect(rule('\\.health-switch')).toContain('min-height: var(--tap-bar)');
    expect(rule('\\.health-btn')).toContain('min-height: var(--tap-min)');
    expect(rule('\\.health-btn')).toContain('font-size: var(--fs-body)');
    expect(rule('\\.health-explainer')).toContain('font-size: var(--fs-body)');
    expect(rule('\\.health-confirm-note')).toContain('font-size: var(--fs-body)');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*\d/);
  });
});
