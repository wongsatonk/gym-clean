import { describe, expect, it } from 'vitest';
import { checkCopy } from '../replies';
import { CLAUDE_NEVER_SENDS, CLAUDE_SENDS, type ClaudeSendItem } from './sends';

const ALL: readonly ClaudeSendItem[] = [...CLAUDE_SENDS, ...CLAUDE_NEVER_SENDS];
/** The M13 anyone-scan: "you", never a gendered word (the app has a second user). */
const GENDERED = /\b(he|she|his|her|him|hers)\b/i;

describe('CLAUDE_SENDS / CLAUDE_NEVER_SENDS (M13c task 6c; M12 slice 3 task 4 lists)', () => {
  it('names every group of what would be sent', () => {
    expect(CLAUDE_SENDS.map((i) => i.id)).toEqual([
      'messages',
      'plan',
      'planChanges',
      'topSets',
      'scores',
      'food',
      'goals',
      'lookups',
    ]);
  });

  it('names every group that is never sent', () => {
    expect(CLAUDE_NEVER_SENDS.map((i) => i.id)).toEqual([
      'health',
      'body',
      'measurements',
      'photos',
      'checkIns',
      'dayFeel',
      'notes',
      'goalWords',
      'camera',
      'devlog',
      'key',
    ]);
  });

  it('ids are unique across both lists', () => {
    const ids = ALL.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every item is plain copy: checkCopy, the anyone-scan, a capital, no full stop, ≤ 80 chars', () => {
    for (const i of ALL) {
      expect(checkCopy(i.label).hits, i.id).toEqual([]);
      expect(i.label, i.id).not.toMatch(GENDERED);
      expect(i.label, i.id).toMatch(/^[A-Z]/);
      expect(i.label, i.id).not.toMatch(/\.$/);
      expect(i.label.length, i.id).toBeLessThanOrEqual(80);
    }
  });

  it('says the chat turns that used Health data stay out, and Health data is never sent', () => {
    const label = (id: string) => ALL.find((i) => i.id === id)?.label ?? '';
    expect(label('messages')).toMatch(/last 8/);
    expect(label('messages')).toMatch(/Health/);
    expect(label('health')).toMatch(/Health data/);
    expect(label('health')).toMatch(/Lighter today\?/);
    expect(label('body')).toMatch(/body fat/i);
    expect(label('body')).toMatch(/lean mass/i);
    expect(label('topSets')).toMatch(/4 weeks/);
    expect(label('plan')).toMatch(/next 7 days/);
    expect(label('plan')).toMatch(/weekly sets/i);
  });

  it('is read-only data (the explain card, Settings and About render the same lists)', () => {
    expect(Object.isFrozen(CLAUDE_SENDS)).toBe(true);
    expect(Object.isFrozen(CLAUDE_NEVER_SENDS)).toBe(true);
    for (const i of ALL) expect(Object.isFrozen(i), i.id).toBe(true);
  });
});
