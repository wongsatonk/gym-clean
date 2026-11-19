// M13d task 12 (SPEC M13d Goal 3; Wave A review follow-up (a)): which locale to hand core
// `defaultUnits(locale)` so the Units page preselects from the phone's REGION, not its language.
//
// Why not `navigator.language` alone: it is the language list's first entry. It can carry no
// region at all ("en"), or the language's home region rather than where the phone is set up
// (an English phone in Thailand can report "en-US" and would preselect lb + ft·in).
// `Intl.DateTimeFormat().resolvedOptions().locale` is the locale the engine formats dates and
// numbers with; on Apple platforms WebKit builds it from the system's language + Region setting,
// so it is the best region signal a web page gets (e.g. "en-TH"). So: try Intl first, then each
// entry of `navigator.languages`, then `navigator.language`, and take the FIRST that names a
// region. Nothing names one → the first value we have (core reads no region → kg + cm), or
// undefined. Never `Intl.Locale#maximize()`: that would invent "US" for a bare "en".
//
// Pure apart from the default sources (read only when no `sources` are passed); nothing stored.
// Checked on her phone at Checkpoint K4. If WebKit there hides the region, the iPhone app could
// pass the native region instead (a Capacitor read; ios-engineer).

export type LocaleSources = {
  /** `Intl.DateTimeFormat().resolvedOptions().locale`. */
  intl?: string | undefined;
  /** `navigator.languages`. */
  languages?: readonly string[] | undefined;
  /** `navigator.language`. */
  language?: string | undefined;
};

/** The region subtag of a BCP 47 tag ("en-TH" → "TH", "en_US" → "US"), or undefined. */
export function regionOf(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  try {
    return new Intl.Locale(tag.replace(/_/g, '-')).region ?? undefined;
  } catch {
    return undefined;
  }
}

/** Reads the browser's sources; any of them may be missing or throw (old engines, tests). */
export function browserLocaleSources(): LocaleSources {
  let intl: string | undefined;
  try {
    intl = Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    intl = undefined;
  }
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return { intl, languages: nav?.languages, language: nav?.language };
}

/**
 * The locale to pass to core `defaultUnits()`: the first candidate (Intl, then
 * navigator.languages, then navigator.language) that names a region; else the first non-empty
 * candidate; else undefined.
 */
export function deviceLocale(sources: LocaleSources = browserLocaleSources()): string | undefined {
  const candidates = [sources.intl, ...(sources.languages ?? []), sources.language].filter(
    (t): t is string => typeof t === 'string' && t.trim() !== '',
  );
  return candidates.find((t) => regionOf(t) !== undefined) ?? candidates[0];
}
