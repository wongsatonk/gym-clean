import { describe, expect, it } from 'vitest';
import { describeLoadError } from './loadError';

describe('describeLoadError', () => {
  it('keeps an Error message', () => {
    expect(describeLoadError(new Error('Failed to fetch model: /m.task (404)'))).toBe(
      'Failed to fetch model: /m.task (404)',
    );
  });

  it('names the file of a failed <script> load (an error Event, which has no message)', () => {
    const ev = { type: 'error', target: { src: 'capacitor://localhost/mediapipe/wasm/vision_wasm_internal.js' } };
    expect(describeLoadError(ev)).toBe("couldn't load vision_wasm_internal.js");
  });

  it('drops a query string from the file name', () => {
    const ev = { type: 'error', target: { src: 'https://x.test/a/loader.js?v=2' } };
    expect(describeLoadError(ev)).toBe("couldn't load loader.js");
  });

  it('describes an Event without a source', () => {
    expect(describeLoadError({ type: 'error', target: null })).toBe("couldn't load a pose file (error event)");
  });

  it('passes strings through and stringifies other values', () => {
    expect(describeLoadError('ModuleFactory not set.')).toBe('ModuleFactory not set.');
    expect(describeLoadError(5243)).toBe('error 5243');
    expect(describeLoadError(undefined)).toBe('unknown error');
    expect(describeLoadError(null)).toBe('unknown error');
  });

  it('falls back when an Error has an empty message', () => {
    expect(describeLoadError(new TypeError(''))).toBe('TypeError');
  });

  it('never returns "undefined"', () => {
    for (const v of [{}, { message: undefined }, [], new Error()]) {
      expect(describeLoadError(v)).not.toMatch(/undefined/);
    }
  });
});
