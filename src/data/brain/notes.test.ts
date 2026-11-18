import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import type { BrainErrorCode, BrainUnavailableReason } from '../../core/types';
import { GymDb } from '../db';
import { COACH_UI_KEY, getCoachUi, patchCoachUi } from '../chat/store';
import {
  BRAIN_ERROR_CODES,
  BRAIN_UNAVAILABLE_REASONS,
  BrainError,
  ERROR_NOTE,
  UNAVAILABLE_COPY,
  brainErrorCode,
  coachNoteStore,
  errorNote,
  isUnavailableReason,
  memoryNoteStore,
  noteCopy,
  parseBrainNotes,
} from './notes';

const REASONS: BrainUnavailableReason[] = [
  'deviceNotEligible',
  'appleIntelligenceNotEnabled',
  'modelNotReady',
  'unsupported',
  'notNative',
];
const CODES: BrainErrorCode[] = [
  'guardrail',
  'contextTooLong',
  'unsupportedLanguage',
  'timeout',
  'other',
];

describe('brain note copy (data)', () => {
  it('has a status line and a chat note for every unavailable reason', () => {
    expect([...BRAIN_UNAVAILABLE_REASONS].sort()).toEqual([...REASONS].sort());
    for (const r of REASONS) {
      expect(UNAVAILABLE_COPY[r].status.length).toBeGreaterThan(5);
      expect(UNAVAILABLE_COPY[r].note).toMatch(/[.!]$/);
    }
  });

  it('uses the planned wording for the three common reasons', () => {
    expect(UNAVAILABLE_COPY.appleIntelligenceNotEnabled.note).toBe(
      "Apple Intelligence is off, so I'm using quick replies. Turn it on in Settings > Apple Intelligence & Siri.",
    );
    expect(UNAVAILABLE_COPY.modelNotReady.note).toBe(
      "Apple Intelligence is still downloading. Quick replies until it's ready.",
    );
    expect(UNAVAILABLE_COPY.deviceNotEligible.note).toBe(
      "This iPhone can't run Apple Intelligence. Quick replies still work.",
    );
  });

  it('has a one-line error note for every error code, naming who answered', () => {
    expect([...BRAIN_ERROR_CODES].sort()).toEqual([...CODES].sort());
    for (const c of CODES) {
      const line = errorNote(c, 'apple', 'rules');
      expect(line).toContain('Apple Intelligence');
      expect(line).toContain('quick replies');
      expect(line).not.toMatch(/\{|\}/);
      expect(line.split(/(?<=[.!?])\s+/)).toHaveLength(1);
      expect(ERROR_NOTE[c].length).toBeGreaterThan(5);
    }
    expect(errorNote('timeout', 'apple', 'claude')).toContain('Claude');
  });

  it('every line passes the copy check and has no numbers', () => {
    const all = noteCopy();
    expect(all.length).toBeGreaterThanOrEqual(REASONS.length * 2 + CODES.length);
    for (const line of all) {
      expect(checkCopy(line), line).toEqual({ ok: true, hits: [] });
      expect(line).not.toMatch(/\d/);
    }
  });
});

describe('brain error convention', () => {
  it('reads a known code from an Error or a plain object', () => {
    expect(brainErrorCode(new BrainError('guardrail'))).toBe('guardrail');
    expect(brainErrorCode(Object.assign(new Error('x'), { code: 'timeout' }))).toBe('timeout');
    expect(brainErrorCode({ code: 'contextTooLong' })).toBe('contextTooLong');
  });

  it('gives undefined for anything without a known code', () => {
    for (const e of [new Error('x'), { code: 'nope' }, 'boom', null, undefined, 42, { code: 7 }])
      expect(brainErrorCode(e)).toBeUndefined();
  });

  it('BrainError is an Error with a code and no message text from the model', () => {
    const e = new BrainError('unsupportedLanguage');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('unsupportedLanguage');
    expect(e.message).toBe('brain error: unsupportedLanguage');
  });

  it('isUnavailableReason accepts only the five reasons', () => {
    for (const r of REASONS) expect(isUnavailableReason(r)).toBe(true);
    for (const r of ['off', '', null, 3]) expect(isUnavailableReason(r)).toBe(false);
  });
});

describe('brainNotes parsing and stores', () => {
  it('keeps only known reasons with positive finite times', () => {
    expect(
      parseBrainNotes({
        modelNotReady: 5,
        deviceNotEligible: -1,
        bogus: 3,
        unsupported: Number.NaN,
        notNative: '7',
      }),
    ).toEqual({ modelNotReady: 5 });
    expect(parseBrainNotes(null)).toEqual({});
    expect(parseBrainNotes([1])).toEqual({});
  });

  it('memory store round-trips', async () => {
    const s = memoryNoteStore({ modelNotReady: 1 });
    expect(await s.load()).toEqual({ modelNotReady: 1 });
    await s.save({ modelNotReady: 1, unsupported: 2 });
    expect(await s.load()).toEqual({ modelNotReady: 1, unsupported: 2 });
  });

  describe('coachNoteStore (settings row "coach")', () => {
    let db: GymDb;
    let n = 0;
    beforeEach(async () => {
      db = new GymDb(`brain-notes-${n++}`);
      await db.open();
    });
    afterEach(async () => {
      db.close();
      await db.delete();
    });

    it('reads empty notes from a fresh database', async () => {
      expect(await coachNoteStore(db).load()).toEqual({});
    });

    it('saves brainNotes into the coach row and keeps the other fields', async () => {
      await patchCoachUi(db, { missedAnswered: ['2030-01-02'], lastWeekRecap: '2030-01-06' });
      await db.settings.put({
        key: COACH_UI_KEY,
        value: {
          ...((await db.settings.get(COACH_UI_KEY))?.value as object),
          appleCardReasons: false,
          speakReplies: 'always',
        },
      });
      const store = coachNoteStore(db);
      await store.save({ appleIntelligenceNotEnabled: 1000 });
      expect(await store.load()).toEqual({ appleIntelligenceNotEnabled: 1000 });
      const row = (await db.settings.get(COACH_UI_KEY))?.value as Record<string, unknown>;
      expect(row.appleCardReasons).toBe(false);
      expect(row.speakReplies).toBe('always');
      expect(row.brainNotes).toEqual({ appleIntelligenceNotEnabled: 1000 });
      expect((await getCoachUi(db)).missedAnswered).toEqual(['2030-01-02']);
    });

    it('drops junk stored by someone else', async () => {
      await db.settings.put({
        key: COACH_UI_KEY,
        value: { brainNotes: { x: 1, modelNotReady: 9 } },
      });
      expect(await coachNoteStore(db).load()).toEqual({ modelNotReady: 9 });
    });
  });
});
