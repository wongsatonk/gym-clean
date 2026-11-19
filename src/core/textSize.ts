/**
 * M13d task 20 (SPEC M13d Goal 4): Settings → Display → Text size. Pure data: the px of the word
 * text steps per size (body / cue / lead / label). Numbers, timers and tab labels are not in the
 * map: they keep their size at every step. Stored in settings 'textSize' (no row → 'standard').
 */
import type { TextSize } from './types';

export const TEXT_SIZES: readonly TextSize[] = ['standard', 'large', 'larger'];

export type TextScale = { body: number; cue: number; lead: number; label: number };

const SCALE: Readonly<Record<TextSize, Readonly<TextScale>>> = {
  standard: { body: 20, cue: 22, lead: 26, label: 18 },
  large: { body: 22, cue: 24, lead: 28, label: 20 },
  larger: { body: 24, cue: 26, lead: 30, label: 22 },
};

export function isTextSize(v: unknown): v is TextSize {
  return typeof v === 'string' && (TEXT_SIZES as readonly string[]).includes(v);
}

/** The px of each word text step at `size` (a fresh object). */
export function textScale(size: TextSize): TextScale {
  return { ...SCALE[size] };
}
