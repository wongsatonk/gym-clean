// Test-only: a tiny DOM stub for the screen render tests (vitest runs in node). Enough of
// Element for h(), icon() and the screens: attributes, children, text, innerHTML, click.
import { afterEach, beforeEach } from 'vitest';

export class FakeEl {
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  text = '';
  html = '';
  listeners = new Map<string, (() => void)[]>();
  constructor(public tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  set innerHTML(v: string) {
    this.html = v;
  }
  get innerHTML() {
    return this.html;
  }
  addEventListener(type: string, cb: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  click() {
    for (const cb of this.listeners.get('click') ?? []) cb();
  }
  append(...nodes: (FakeEl | string)[]) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const t = new FakeEl('#text');
        t.text = n;
        this.children.push(t);
      } else this.children.push(n);
    }
  }
  set textContent(v: string) {
    const t = new FakeEl('#text');
    t.text = v;
    this.children = [t];
  }
  get textContent(): string {
    return this.tag === '#text' ? this.text : this.children.map((c) => c.textContent).join('');
  }
  get classes(): string[] {
    return (this.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
  }
  /** Depth-first descendants matching a predicate. */
  find(pred: (e: FakeEl) => boolean): FakeEl[] {
    const out: FakeEl[] = [];
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      out.push(...c.find(pred));
    }
    return out;
  }
  byClass(cls: string): FakeEl[] {
    return this.find((e) => e.classes.includes(cls));
  }
  oneByClass(cls: string): FakeEl {
    const hit = this.byClass(cls)[0];
    if (!hit) throw new Error(`no .${cls}`);
    return hit;
  }
  byTag(tag: string): FakeEl[] {
    return this.find((e) => e.tag === tag);
  }
}

/** Installs the fake `document` for each test in the calling file. */
export function useFakeDom(): void {
  const g = globalThis as { document?: unknown };
  let saved: unknown;
  beforeEach(() => {
    saved = g.document;
    g.document = {
      createElement: (tag: string) => new FakeEl(tag),
      createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    };
  });
  afterEach(() => {
    g.document = saved;
  });
}

export const asFake = (el: unknown) => el as FakeEl;
