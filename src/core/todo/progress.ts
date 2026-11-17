/**
 * M12 slice 1c: to-do progress from the stored answers and a facts snapshot. Pure.
 *
 * - An auto step is done once its tick is stored (ticks stick) or while its detector holds.
 *   Recurring topics (the 7-day re-sign) ignore stored ticks and follow the detector.
 * - An ask step is done once answered: an `ask` answer with an option or a non-blank note. A blank
 *   one (no options, no/blank note: he cleared his answer) doesn't count anywhere.
 * - A topic is done when every step is; skipped when a `skip` answer exists and it isn't done.
 * - Native-only topics don't apply (and don't count) in the PWA.
 */
import type { TodoAnswer, TodoFacts, TodoStep, TodoTopic } from '../types';
import { runDetector } from './detectors';

export type TopicStatus = {
  done: boolean;
  skipped: boolean;
  stepsDone: number;
  steps: number;
  /** First step not done yet (absent when done or skipped). */
  nextStepId?: string;
};

export type TodoSummary = {
  /** Topics done or skipped, for this platform. */
  done: number;
  /** Topics for this platform. */
  total: number;
  /** Show the Today card (something left to do). */
  visible: boolean;
};

export type AutoTick = { topicId: string; stepId: string };

export function topicApplies(topic: TodoTopic, platform: TodoFacts['platform']): boolean {
  return topic.platform === 'any' || platform === 'native';
}

/** An `ask` answer with no options and no (or a blank) note: he cleared it. Counts as no answer. */
export function isBlankAnswer(a: TodoAnswer): boolean {
  return (
    a.kind === 'ask' &&
    (a.optionIds?.length ?? 0) === 0 &&
    (a.note === undefined || a.note.trim() === '')
  );
}

const has = (
  answers: readonly TodoAnswer[],
  topicId: string,
  stepId: string,
  kind: TodoAnswer['kind'],
): boolean =>
  answers.some(
    (a) => a.topicId === topicId && a.stepId === stepId && a.kind === kind && !isBlankAnswer(a),
  );

/** Whether one step of a topic is done now. */
export function stepDone(
  topic: TodoTopic,
  step: TodoStep,
  answers: readonly TodoAnswer[],
  facts: TodoFacts,
): boolean {
  if (step.kind === 'ask') return has(answers, topic.id, step.id, 'ask');
  if (!topic.recurring && has(answers, topic.id, step.id, 'auto')) return true;
  return runDetector(step, facts).done;
}

export function topicStatus(
  topic: TodoTopic,
  answers: readonly TodoAnswer[],
  facts: TodoFacts,
): TopicStatus {
  const mine = answers.filter((a) => a.topicId === topic.id);
  const doneSteps = topic.steps.map((s) => stepDone(topic, s, mine, facts));
  const stepsDone = doneSteps.filter(Boolean).length;
  const done = stepsDone === topic.steps.length;
  const skipped = !done && mine.some((a) => a.kind === 'skip');
  const out: TopicStatus = { done, skipped, stepsDone, steps: topic.steps.length };
  if (!done && !skipped) {
    const next = topic.steps[doneSteps.indexOf(false)];
    if (next) out.nextStepId = next.id;
  }
  return out;
}

/** "To-dos: 6 of 12 done" and whether the Today card shows. */
export function todoSummary(
  topics: readonly TodoTopic[],
  answers: readonly TodoAnswer[],
  facts: TodoFacts,
): TodoSummary {
  const mine = topics.filter((t) => topicApplies(t, facts.platform));
  const done = mine.filter((t) => {
    const s = topicStatus(t, answers, facts);
    return s.done || s.skipped;
  }).length;
  return { done, total: mine.length, visible: done < mine.length };
}

/**
 * Auto steps met now with no stored tick yet (the store records them with their time). Not for
 * recurring topics, topics of the other platform or skipped topics.
 */
export function pendingAutoTicks(
  topics: readonly TodoTopic[],
  answers: readonly TodoAnswer[],
  facts: TodoFacts,
): AutoTick[] {
  const out: AutoTick[] = [];
  for (const t of topics) {
    if (t.recurring || !topicApplies(t, facts.platform)) continue;
    const mine = answers.filter((a) => a.topicId === t.id);
    if (mine.some((a) => a.kind === 'skip')) continue;
    for (const s of t.steps)
      if (s.kind === 'auto' && !has(mine, t.id, s.id, 'auto') && runDetector(s, facts).done)
        out.push({ topicId: t.id, stepId: s.id });
  }
  return out;
}

/** The answer an ask step shows now: its latest non-blank `ask` answer. */
export function currentAnswer(
  answers: readonly TodoAnswer[],
  topicId: string,
  stepId: string,
): TodoAnswer | undefined {
  let best: TodoAnswer | undefined;
  for (const a of answers)
    if (
      a.topicId === topicId &&
      a.stepId === stepId &&
      a.kind === 'ask' &&
      !isBlankAnswer(a) &&
      (!best || a.at >= best.at)
    )
      best = a;
  return best;
}

/**
 * Days left for the Today card's "Re-sign in N days" line: a number once the re-sign step's
 * detector is no longer met (≤ 2 days left with the default `minDaysLeft: 3`), else null (also on
 * web, with the paid account, or without a re-sign topic).
 */
export function resignReminder(topics: readonly TodoTopic[], facts: TodoFacts): number | null {
  for (const t of topics)
    for (const s of t.steps) {
      if (s.kind !== 'auto' || s.detector !== 'resignDaysLeft') continue;
      if (!topicApplies(t, facts.platform)) return null;
      const r = runDetector(s, facts);
      return r.done || r.have === undefined ? null : r.have;
    }
  return null;
}
