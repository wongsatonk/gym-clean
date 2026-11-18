// Test-only helpers for the Fuel render tests (made-up numbers only, never real data).
import { expect } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import type { FakeEl } from '../screens/testDom';

/** The first descendant with `attr` (and value, when given). */
export function byAttr(root: FakeEl, attr: string, value?: string): FakeEl {
  const hit = all(root, attr, value)[0];
  if (!hit) throw new Error(`no [${attr}${value === undefined ? '' : `=${value}`}]`);
  return hit;
}

export function all(root: FakeEl, attr: string, value?: string): FakeEl[] {
  return root.find(
    (e) => e.attrs.has(attr) && (value === undefined || e.getAttribute(attr) === value),
  );
}

/** Types into a fake input and fires its input listeners. */
export function typeInto(input: FakeEl, text: string): void {
  (input as unknown as { value: string }).value = text;
  input.dispatch('input', {});
}

export function key(el: FakeEl, k: string, shiftKey = false): void {
  el.dispatch('keydown', { key: k, shiftKey, preventDefault: () => undefined });
}

/** Every visible string passes the M10 copy check (no banned / diagnosis words). */
export function expectCleanCopy(el: FakeEl): void {
  const res = checkCopy(el.textContent);
  expect(res.hits).toEqual([]);
  expect(el.textContent).not.toMatch(/\b(diet|weight[- ]loss|lose weight|healthy|unhealthy)\b/i);
}
