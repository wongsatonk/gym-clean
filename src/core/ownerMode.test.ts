import { describe, expect, it } from 'vitest';
import type { OwnerMode, OwnerSurface } from './types';
import {
  OWNER_SURFACES,
  decideOwnerMode,
  devLogRecording,
  isVisible,
  parseOwnerMode,
  versionLine,
} from './ownerMode';
import { versionLabel } from './version';

// Made-up data only (public repo).
const NOW = 1_800_000_000_000;

describe('decideOwnerMode (first launch without a row)', () => {
  it('a fresh install (no sessions, no to-do answers) starts off, by fresh', () => {
    expect(decideOwnerMode({ row: undefined, sessions: 0, todoAnswers: 0, now: NOW })).toEqual({
      mode: { on: false, setAt: NOW, by: 'fresh' },
      decided: true,
    });
  });

  it('an install with sessions starts on, by existing', () => {
    expect(decideOwnerMode({ row: undefined, sessions: 3, todoAnswers: 0, now: NOW })).toEqual({
      mode: { on: true, setAt: NOW, by: 'existing' },
      decided: true,
    });
  });

  it('an install with to-do answers only starts on, by existing', () => {
    expect(decideOwnerMode({ row: undefined, sessions: 0, todoAnswers: 1, now: NOW }).mode).toEqual(
      { on: true, setAt: NOW, by: 'existing' },
    );
  });

  it('an existing row is returned untouched and never re-decided', () => {
    const off: OwnerMode = { on: false, setAt: 5, by: 'user' };
    const r = decideOwnerMode({ row: off, sessions: 40, todoAnswers: 9, now: NOW });
    expect(r).toEqual({ mode: off, decided: false });
    expect(r.mode).toBe(off);
    const on: OwnerMode = { on: true, setAt: 6, by: 'existing' };
    expect(decideOwnerMode({ row: on, sessions: 0, todoAnswers: 0, now: NOW })).toEqual({
      mode: on,
      decided: false,
    });
  });

  it('a malformed row reads as no row (decided again)', () => {
    for (const bad of [null, 'on', { on: 'yes', setAt: 1, by: 'user' }, { on: true }, []])
      expect(decideOwnerMode({ row: bad, sessions: 0, todoAnswers: 0, now: NOW }).decided).toBe(
        true,
      );
  });
});

describe('parseOwnerMode', () => {
  it('accepts a well-formed row and keeps only its fields', () => {
    expect(parseOwnerMode({ on: true, setAt: 7, by: 'user', extra: 1 })).toEqual({
      on: true,
      setAt: 7,
      by: 'user',
    });
  });
  it('rejects anything else', () => {
    expect(parseOwnerMode(undefined)).toBeUndefined();
    expect(parseOwnerMode({ on: true, setAt: Number.NaN, by: 'user' })).toBeUndefined();
    expect(parseOwnerMode({ on: true, setAt: 1, by: 'someone' })).toBeUndefined();
  });
});

describe('isVisible', () => {
  it('lists every owner surface once', () => {
    const all: OwnerSurface[] = [
      'todos',
      'resign',
      'devlog',
      'buildHash',
      'tourTodos',
      'evalScreen',
      'copyReport',
    ];
    expect([...OWNER_SURFACES].sort()).toEqual([...all].sort());
  });

  it('hides every owner surface when owner mode is off', () => {
    for (const s of OWNER_SURFACES) expect(isVisible(s, false), s).toBe(false);
  });

  it('shows every owner surface when owner mode is on (unchanged from before)', () => {
    for (const s of OWNER_SURFACES) expect(isVisible(s, true), s).toBe(true);
  });

  it('takes the stored row as well as a boolean; no row reads as off', () => {
    expect(isVisible('todos', { on: true, setAt: 1, by: 'existing' })).toBe(true);
    expect(isVisible('todos', { on: false, setAt: 1, by: 'fresh' })).toBe(false);
    expect(isVisible('todos', undefined)).toBe(false);
  });
});

describe('versionLine', () => {
  it('owner off: MAJOR.MINOR only, no build', () => {
    expect(versionLine(false, '1.15.0', 'abc1234')).toBe('Version 1.15');
  });
  it('owner off: keeps PATCH when it is not 0', () => {
    expect(versionLine(false, '1.15.2', 'abc1234')).toBe('Version 1.15.2');
  });
  it('owner on: the unchanged versionLabel', () => {
    expect(versionLine(true, '1.15.0', 'abc1234')).toBe('Version 1.15.0 (build abc1234)');
    expect(versionLine(true, '1.15.0', 'abc1234')).toBe(versionLabel('1.15.0', 'abc1234'));
    expect(versionLine(true, '1.15.0', 'unknown')).toBe('Version 1.15.0');
  });
  it('defaults to the running release and build', () => {
    expect(versionLine(true)).toBe(versionLabel());
    expect(versionLine(false)).toMatch(/^Version \d+\.\d+(\.[1-9]\d*)?$/);
  });
});

describe('devLogRecording', () => {
  it('records nothing while owner mode is off, whatever the saved switch says', () => {
    expect(devLogRecording(false, true)).toBe(false);
    expect(devLogRecording(false, false)).toBe(false);
  });
  it('follows the saved switch while owner mode is on', () => {
    expect(devLogRecording(true, true)).toBe(true);
    expect(devLogRecording(true, false)).toBe(false);
  });
});
