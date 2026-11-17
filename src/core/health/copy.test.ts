import { describe, expect, it } from 'vitest';
import { checkCopy } from '../trainer/replies';
import type { BodyArea } from '../types';
import {
  CARD_TITLE,
  checkHealthCopy,
  deloadReason,
  durationText,
  easyOnOfferText,
  HEALTH_BANNED_TERMS,
  kindText,
  reasonText,
  SIGNAL_ORDER,
  soreAreasText,
  type SignalDetail,
} from './copy';

describe('checkHealthCopy', () => {
  it('flags the M11 banned list on top of checkCopy', () => {
    for (const bad of [
      'You might be getting sick.',
      'You look ill today.',
      'Signs of illness.',
      'Possible infection.',
      'You are overtraining.',
      'Your stress is high.',
      'You have recovery debt.',
      'This will help you recover faster.',
      'Warning: low HRV.',
      'Your resting heart rate is abnormal.',
      'An unhealthy pattern.',
      'A symptom of fatigue syndrome.',
      'We can diagnose this.',
      'A heart problem.',
      'Your risk is higher.',
    ]) {
      expect(checkHealthCopy(bad).ok, bad).toBe(false);
    }
  });

  it('whole words only: will / skill / still pass', () => {
    for (const fine of [
      'You will train lighter.',
      'Skill work still counts.',
      'Sleep was shorter.',
    ]) {
      expect(checkHealthCopy(fine)).toEqual({ ok: true, hits: [] });
    }
  });

  it('the banned list is data and includes the SPEC words', () => {
    for (const w of [
      'sick*',
      'ill',
      'illness*',
      'infect*',
      'overtrain*',
      'stress*',
      'recover*',
      'warning*',
      'unhealthy',
      'abnormal*',
    ]) {
      expect(HEALTH_BANNED_TERMS).toContain(w);
    }
  });
});

describe('durationText', () => {
  it('rounds to 10 minutes, hours and minutes', () => {
    expect(durationText(60)).toBe('1 h');
    expect(durationText(76)).toBe('1 h 20 m');
    expect(durationText(84)).toBe('1 h 20 m');
    expect(durationText(44)).toBe('40 m');
    expect(durationText(125)).toBe('2 h 10 m');
    expect(durationText(4)).toBe('10 m');
  });
});

describe('kindText', () => {
  it('turns HealthKit names into plain words', () => {
    expect(kindText('running')).toBe('running');
    expect(kindText('traditionalStrengthTraining')).toBe('traditional strength training');
    expect(kindText('HKWorkoutActivityTypeSoccer')).toBe('soccer');
    expect(kindText('')).toBe('a workout');
  });
});

describe('reasonText', () => {
  it('states what changed versus his usual, in plain words', () => {
    expect(reasonText({ signal: 'sleepShort', shortByMin: 78 })).toBe(
      'Sleep was about 1 h 20 m shorter than usual.',
    );
    expect(reasonText({ signal: 'restingHrHigh', higherByBpm: 6.6 })).toBe(
      'Resting heart rate is about 7 bpm higher than usual.',
    );
    expect(reasonText({ signal: 'hrvLow', lowerByPct: 21.4 })).toBe(
      'Heart rate variability is about 21% lower than usual.',
    );
    expect(reasonText({ signal: 'hardOutsideWorkout', kind: 'soccer', minutes: 90 })).toBe(
      'You did 1 h 30 m of soccer in the last day.',
    );
    expect(reasonText({ signal: 'whoopLow' })).toBe(
      'Your WHOOP score today is in its lowest band.',
    );
  });

  it('every reason over a grid of values passes checkCopy and the M11 list', () => {
    const details: SignalDetail[] = [];
    for (let m = 60; m <= 300; m += 7) details.push({ signal: 'sleepShort', shortByMin: m });
    for (let p = 15; p <= 80; p += 3) details.push({ signal: 'hrvLow', lowerByPct: p });
    for (let b = 5; b <= 30; b += 1) details.push({ signal: 'restingHrHigh', higherByBpm: b });
    for (const kind of [
      'running',
      'soccer',
      'cycling',
      'traditionalStrengthTraining',
      'highIntensityIntervalTraining',
      'other',
    ]) {
      details.push({ signal: 'hardOutsideWorkout', kind, minutes: 95 });
    }
    details.push({ signal: 'whoopLow' });
    const texts = [
      ...details.map(reasonText),
      deloadReason(3, 7),
      deloadReason(5, 7),
      CARD_TITLE.lighter,
      CARD_TITLE.deload,
    ];
    for (const t of texts) {
      expect(checkCopy(t).hits, t).toEqual([]);
      expect(checkHealthCopy(t).hits, t).toEqual([]);
      expect(t, t).not.toMatch(/you'll|you will|faster|better/i);
    }
  });

  it('a workout kind that fails the copy check is replaced', () => {
    expect(reasonText({ signal: 'hardOutsideWorkout', kind: 'painCave', minutes: 70 })).toBe(
      'You did 1 h 10 m of a workout in the last day.',
    );
  });
});

describe('deloadReason', () => {
  it('counts the days', () => {
    expect(deloadReason(3, 7)).toBe('This came up on 3 of the last 7 days.');
  });
});

describe('M12 1b feel-today copy', () => {
  const AREAS: BodyArea[] = ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'];

  it('states what he said, nothing more', () => {
    expect(reasonText({ signal: 'feltLow' })).toBe('You said your energy is low today.');
    expect(reasonText({ signal: 'sore', areas: ['shoulders'] })).toBe(
      'You said your shoulders are sore.',
    );
    expect(reasonText({ signal: 'sore', areas: ['chest'] })).toBe('You said your chest is sore.');
    expect(reasonText({ signal: 'sore', areas: ['back', 'legs'] })).toBe(
      'You said your back and legs are sore.',
    );
    expect(reasonText({ signal: 'sore', areas: ['arms', 'chest', 'core'] })).toBe(
      'You said your arms, chest and core are sore.',
    );
  });

  it('joins areas in plain words', () => {
    expect(soreAreasText(['core'])).toBe('core');
    expect(soreAreasText(['arms', 'legs'])).toBe('arms and legs');
  });

  it('the offer is a question about today only', () => {
    expect(easyOnOfferText('shoulders')).toBe('Go easy on shoulders today?');
    expect(easyOnOfferText('core')).toBe('Go easy on core today?');
  });

  it('the feel signals come after the Health ones in the fixed order', () => {
    expect(SIGNAL_ORDER.slice(-2)).toEqual(['feltLow', 'sore']);
    expect(new Set(SIGNAL_ORDER).size).toBe(7);
  });

  it('every feel reason and offer passes checkCopy + the M11 list, with no medical wording', () => {
    const texts = [reasonText({ signal: 'feltLow' }), ...AREAS.map(easyOnOfferText)];
    for (let mask = 1; mask < 1 << AREAS.length; mask++) {
      const areas = AREAS.filter((_, i) => mask & (1 << i));
      texts.push(reasonText({ signal: 'sore', areas }));
    }
    for (const t of texts) {
      expect(checkCopy(t).hits, t).toEqual([]);
      expect(checkHealthCopy(t).hits, t).toEqual([]);
      expect(t, t).not.toMatch(/you'll|you will|faster|better|heal|rest it|doctor|ache/i);
    }
  });
});
