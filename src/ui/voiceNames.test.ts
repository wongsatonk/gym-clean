import { describe, expect, it } from 'vitest';

import { DEFAULT_DRILL_ORDER, listEnglishVoices, pickDrillVoice } from './voiceNames';

type V = { name: string; lang: string };
const v = (name: string, lang = 'en-US'): V => ({ name, lang });

// Made-up phone voice list: female and male names, other languages, duplicates.
const PHONE: V[] = [
  v('Samantha'),
  v('Fred'),
  v('Karen', 'en-AU'),
  v('Gordon', 'en-AU'),
  v('Rocko (English (UK))', 'en-GB'),
  v('Moira', 'en-IE'),
  v('Daniel', 'en-GB'),
  v('Tessa', 'en-ZA'),
  v('Rishi', 'en-IN'),
  v('Thomas', 'fr-FR'),
  v('Aaron'),
  v('Aaron'),
  v('Serena (Enhanced)', 'en-GB'),
  v('Eddy (German (Germany))', 'de-DE'),
  v('Plain', 'en'),
];

describe('listEnglishVoices', () => {
  it('offers every installed English voice, female and male, default order first', () => {
    expect(listEnglishVoices(PHONE).map((m) => m.name)).toEqual([
      'Daniel',
      'Rocko (English (UK))',
      'Aaron',
      'Fred',
      'Samantha',
      'Karen',
      'Gordon',
      'Moira',
      'Tessa',
      'Rishi',
      'Serena (Enhanced)',
      'Plain',
    ]);
  });

  it('known names keep their accent label; others are labelled by region', () => {
    expect(listEnglishVoices(PHONE).map((m) => m.label)).toEqual([
      'Daniel (UK)',
      'Rocko (character, UK)',
      'Aaron (US)',
      'Fred (US)',
      'Samantha (US)',
      'Karen (Australia)',
      'Gordon (Australia)',
      'Moira (Ireland)',
      'Tessa (South Africa)',
      'Rishi (India)',
      'Serena (UK, Enhanced)',
      'Plain',
    ]);
  });

  it('skips other languages and duplicate names', () => {
    const names = listEnglishVoices(PHONE).map((m) => m.name);
    expect(names).not.toContain('Thomas');
    expect(names.some((n) => n.startsWith('Eddy'))).toBe(false);
    expect(names.filter((n) => n === 'Aaron')).toHaveLength(1);
    expect(listEnglishVoices([])).toEqual([]);
    expect(listEnglishVoices([v('Amélie', 'fr-CA')])).toEqual([]);
  });

  it('keeps the default order Daniel → Arthur → Rocko → Aaron → Fred', () => {
    expect(DEFAULT_DRILL_ORDER).toEqual(['Daniel', 'Arthur', 'Rocko', 'Aaron', 'Fred']);
    const list = listEnglishVoices([v('Fred'), v('Aaron'), v('Arthur', 'en-GB'), v('Samantha')]);
    expect(list.map((m) => m.base)).toEqual(['Arthur', 'Aaron', 'Fred', 'Samantha']);
  });

  it('the first row is the voice Automatic picks when nothing is saved', () => {
    for (const phone of [
      PHONE,
      [v('Samantha'), v('Karen', 'en-AU')],
      [v('Moira', 'en-IE'), v('Gordon', 'en-AU')],
      [v('Thomas', 'fr-FR'), v('Tessa', 'en-ZA'), v('Fred')],
    ]) {
      expect(listEnglishVoices(phone)[0]?.name).toBe(pickDrillVoice(phone, null)?.name);
    }
  });
});

describe('pickDrillVoice (unchanged)', () => {
  it('a saved voice wins, female or male, then the same base name', () => {
    expect(pickDrillVoice(PHONE, 'Karen')?.name).toBe('Karen');
    expect(pickDrillVoice(PHONE, 'Fred')?.name).toBe('Fred');
    expect(pickDrillVoice(PHONE, 'Serena')?.name).toBe('Serena (Enhanced)');
  });

  it('falls back to the default order, then any English voice, then null', () => {
    expect(pickDrillVoice(PHONE, 'Gone')?.name).toBe('Daniel');
    expect(pickDrillVoice([v('Samantha'), v('Fred')], null)?.name).toBe('Fred');
    expect(pickDrillVoice([v('Amélie', 'fr-CA'), v('Karen', 'en-AU')], null)?.name).toBe('Karen');
    expect(pickDrillVoice([v('Amélie', 'fr-CA')], null)).toBeNull();
  });
});
