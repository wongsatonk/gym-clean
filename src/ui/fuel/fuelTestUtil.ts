// Test-only helpers for the Fuel render tests (FakeEl from screens/testDom).
import { checkCopy } from '../../core/trainer/replies';
import type { FakeEl } from '../screens/testDom';

export const byAttr = (el: FakeEl, name: string, value?: string): FakeEl[] =>
  el.find((e) => (value === undefined ? e.hasAttribute(name) : e.getAttribute(name) === value));

export const oneAttr = (el: FakeEl, name: string, value?: string): FakeEl => {
  const hit = byAttr(el, name, value)[0];
  if (!hit) throw new Error(`no [${name}${value === undefined ? '' : `=${value}`}]`);
  return hit;
};

/** Every text node under `el`, trimmed, non-empty. */
export const texts = (el: FakeEl): string[] =>
  el
    .find((e) => e.tag === '#text')
    .map((e) => e.text.trim())
    .filter(Boolean);

/** Copy check (M10 checkCopy: banned words + diagnosis terms) over every visible string. */
export const copyHits = (el: FakeEl): string[] =>
  texts(el).flatMap((t) => checkCopy(t).hits.map((hit) => `${hit} in "${t}"`));

/** Sets a FakeEl input's value and fires change. */
export const typeInto = (input: FakeEl, value: string) => {
  (input as unknown as { value: string }).value = value;
  input.dispatch('change', {});
};

export const valueOf = (input: FakeEl): string => (input as unknown as { value: string }).value;
