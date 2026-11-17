import { describe, expect, it } from 'vitest';
import { copyText, selectAllAndCopy } from './clipboard';

describe('copyText', () => {
  it('writes through navigator.clipboard.writeText', async () => {
    const got: string[] = [];
    const nav = { clipboard: { writeText: async (t: string) => void got.push(t) } };
    expect(await copyText('hello', nav)).toBe(true);
    expect(got).toEqual(['hello']);
  });

  it('false when the clipboard API is missing or refuses', async () => {
    expect(await copyText('x', undefined)).toBe(false);
    expect(await copyText('x', {})).toBe(false);
    const nav = { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } };
    expect(await copyText('x', nav)).toBe(false);
  });
});

describe('selectAllAndCopy', () => {
  it('selects all the text and reports the legacy copy result', () => {
    const calls: string[] = [];
    const box = {
      value: 'abc',
      focus: () => calls.push('focus'),
      select: () => calls.push('select'),
      setSelectionRange: (a: number, b: number) => calls.push(`range ${a}-${b}`),
    };
    expect(selectAllAndCopy(box, { execCommand: (c) => c === 'copy' })).toBe(true);
    expect(calls).toEqual(['focus', 'select', 'range 0-3']);
    expect(selectAllAndCopy(box, { execCommand: () => false })).toBe(false);
    expect(selectAllAndCopy(box, {})).toBe(false);
    expect(
      selectAllAndCopy(box, {
        execCommand: () => {
          throw new Error('no');
        },
      }),
    ).toBe(false);
  });
});
