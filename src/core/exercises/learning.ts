// Shared data for SPEC M4f `learning` rules.
import type { FocusRuleFlags } from './types';

/**
 * The focus flags every learning rule declares (SPEC M4f): the timing rules plus the presence/fps
 * reports. `shrinkingRange` and the form rules stay undeclared until the rule is tuned on real
 * fixtures; focusFlagsFor masks them anyway. A fresh object per rule.
 */
export function learningFocus(): FocusRuleFlags {
  return { rushedLowering: true, stalled: true, outOfFrame: true, lowFps: true };
}
