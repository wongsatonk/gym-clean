// Coach voice names and settings types (drill-sergeant design 2026-11-13). Pure: no speech, no persona.

import type { Rudeness } from '../core/personas';

export type { Rudeness };
export type CoachPersona = 'calm' | 'drill';
export type VoiceConfig = { persona: CoachPersona; rudeness: Rudeness; voiceName: string | null };

/** Drill-sergeant delivery: a bit faster and lower than calm (design: ~1.15 / ~0.8). */
export const DRILL_RATE = 1.15;
export const DRILL_PITCH = 0.8;

export type Accent = 'US' | 'UK' | 'Australia' | 'India' | 'character';

/**
 * English voices we know by name (design 2026-11-13), by base name (iOS adds " (Enhanced)" etc.),
 * with the accent shown in the picker. Any other installed English voice is offered too
 * (M13: anyone can use the app), labelled by its region.
 */
export const KNOWN_VOICES: Readonly<Record<string, Accent>> = {
  Aaron: 'US',
  Fred: 'US',
  Evan: 'US',
  Nathan: 'US',
  Tom: 'US',
  Daniel: 'UK',
  Arthur: 'UK',
  Gordon: 'Australia',
  Rishi: 'India',
  Rocko: 'character',
  Eddy: 'character',
  Reed: 'character',
  Grandpa: 'character',
};

/** Default when no voice is saved (or the saved one is gone): first one installed. */
export const DEFAULT_DRILL_ORDER: readonly string[] = [
  'Daniel',
  'Arthur',
  'Rocko',
  'Aaron',
  'Fred',
];

/** A picker row. `accent` is the known accent, else the region from the lang ("US"), else null. */
export type EnglishVoice = { name: string; base: string; accent: string | null; label: string };

type VoiceLike = Pick<SpeechSynthesisVoice, 'name' | 'lang'>;

/** "Rocko (English (UK))" → "Rocko"; "Daniel (Enhanced)" → "Daniel". */
export function baseVoiceName(name: string): string {
  return name.replace(/\s*\(.*$/, '').trim();
}

function isEnglish(v: VoiceLike): boolean {
  return v.lang.toLowerCase().replace('_', '-').startsWith('en');
}

/** Region from a lang tag: en-GB → UK; null when the tag has none. */
function regionOf(lang: string): string | null {
  const r = lang.toUpperCase().replace('_', '-').split('-')[1];
  if (!r) return null;
  return (
    (
      {
        US: 'US',
        GB: 'UK',
        AU: 'Australia',
        IN: 'India',
        IE: 'Ireland',
        ZA: 'South Africa',
        NZ: 'New Zealand',
        CA: 'Canada',
        SG: 'Singapore',
      } as Record<string, string>
    )[r] ?? r
  );
}

function accentOf(v: VoiceLike, base: string): string | null {
  const known = KNOWN_VOICES[base];
  if (!known) return regionOf(v.lang);
  if (known !== 'character') return known;
  const region = regionOf(v.lang);
  return region ? `character, ${region}` : 'character';
}

/**
 * Every installed English voice for the drill-sergeant picker, no duplicate names: the default
 * order first (Daniel → Arthur → Rocko → Aaron → Fred), then the rest in the phone's order, so
 * the first row is also the voice `pickDrillVoice` falls back to. Known names keep their accent
 * label; others show their region ("Samantha (US)").
 */
export function listEnglishVoices(voices: readonly VoiceLike[]): EnglishVoice[] {
  const rank = (base: string) => {
    const d = DEFAULT_DRILL_ORDER.indexOf(base);
    return d >= 0 ? d : DEFAULT_DRILL_ORDER.length;
  };
  const seen = new Set<string>();
  const out: EnglishVoice[] = [];
  for (const v of voices) {
    if (!isEnglish(v) || seen.has(v.name)) continue;
    seen.add(v.name);
    const base = baseVoiceName(v.name);
    const accent = accentOf(v, base);
    // "Daniel (Enhanced)" keeps "Enhanced"; "Rocko (English (UK))" drops the language name.
    const suffix = v.name
      .slice(base.length)
      .trim()
      .replace(/^\(|\)$/g, '');
    const extra = suffix && !/^english\b/i.test(suffix) ? suffix : '';
    const bits = [accent, extra].filter((b): b is string => !!b);
    const label = bits.length ? `${base} (${bits.join(', ')})` : base;
    out.push({ name: v.name, base, accent, label });
  }
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m.base) - rank(b.m.base) || a.i - b.i)
    .map(({ m }) => m);
}

/**
 * The drill-sergeant voice: the saved name (exact, then same base name), else the default
 * order Daniel → Arthur → Rocko → Aaron → Fred, else any English voice, else null.
 */
export function pickDrillVoice<V extends VoiceLike>(
  voices: readonly V[],
  voiceName: string | null,
): V | null {
  const en = voices.filter(isEnglish);
  if (voiceName) {
    const exact = voices.find((v) => v.name === voiceName);
    if (exact) return exact;
    const base = baseVoiceName(voiceName);
    const same = en.find((v) => baseVoiceName(v.name) === base);
    if (same) return same;
  }
  for (const name of DEFAULT_DRILL_ORDER) {
    const v = en.find((x) => baseVoiceName(x.name) === name);
    if (v) return v;
  }
  return en[0] ?? null;
}
