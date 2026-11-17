/**
 * M12 slice 1c: the one plain-text to-do report he copies (SPEC M12 "One report"). Pure.
 *
 * What goes in: the app name, the version label (release + build), PWA or iPhone app, the date,
 * then one block per topic with something new: ask answers as their option labels + his note
 * (as typed, key-like strings and photo data removed), auto ticks as "done (date)", unticked
 * auto steps as counts ("not yet (2 of 3)"), skipped topics as "Skipped" (after any answers).
 * Blank ask rows (no option, no note) are left out.
 *
 * What never goes in: Health values, photos or photo data, API keys or key-like strings, chat
 * text, food or body numbers, his name. The report reads only topic data (labels), answers (ids,
 * dates, notes) and detector counts; it never prints a facts field or an unknown option id.
 */
import { versionLabel } from '../version';
import type { TodoAnswer, TodoFacts, TodoTopic } from '../types';
import { runDetector } from './detectors';
import { isBlankAnswer } from './progress';

export const NOTE_MAX_CHARS = 500;

const DATA_URL = /data:[\w.+/-]+;base64,[A-Za-z0-9+/=_-]+/g;
const SK_KEY = /\bsk-[A-Za-z0-9_-]{8,}/g;
/** Long runs of token characters with both a letter and a digit (base64, hex, JWT parts…). */
const LONG_TOKEN = /[A-Za-z0-9+/=_-]{32,}/g;

/**
 * His note with photo data URLs → "[photo removed]" and key-like strings (`sk-…`, long tokens
 * mixing letters and digits) → "[key removed]"; trimmed and capped at 500 characters.
 */
export function redactNote(note: string): string {
  const out = note
    .replace(DATA_URL, '[photo removed]')
    .replace(SK_KEY, '[key removed]')
    .replace(LONG_TOKEN, (m) => (/\d/.test(m) && /[A-Za-z]/.test(m) ? '[key removed]' : m))
    .trim();
  return out.slice(0, NOTE_MAX_CHARS);
}

export type ReportInput = {
  topics: readonly TodoTopic[];
  answers: readonly TodoAnswer[];
  facts: TodoFacts;
  release: string;
  build: string;
  platform: 'web' | 'native';
  now: number;
  /** "Copy all again": everything, not only what wasn't sent yet. */
  all?: boolean;
};

export type Report = {
  text: string;
  /** Answers covered by this report: mark them sent after a successful copy. */
  answerIds: string[];
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD. */
function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The latest of each (step, kind), so a changed answer replaces the older one. */
function latestPerStep(answers: readonly TodoAnswer[]): TodoAnswer[] {
  const by = new Map<string, TodoAnswer>();
  for (const a of answers) {
    const k = `${a.kind}\u0000${a.stepId}`;
    const prev = by.get(k);
    if (!prev || a.at >= prev.at) by.set(k, a);
  }
  return [...by.values()];
}

export function buildReport(input: ReportInput): Report {
  const { topics, facts, release, build, platform, now, all = false } = input;
  const picked = all ? input.answers : input.answers.filter((a) => a.sentAt === undefined);
  const answerIds = picked.map((a) => a.id);

  const when = (a: TodoAnswer) =>
    a.release === release ? `(${localDate(a.at)})` : `(${localDate(a.at)}, ${a.release})`;

  const blocks: string[] = [];
  for (const topic of topics) {
    const mine = latestPerStep(picked.filter((a) => a.topicId === topic.id && !isBlankAnswer(a)));
    if (mine.length === 0) continue;
    const head = topic.checkpoint ? `${topic.title} (${topic.checkpoint})` : topic.title;
    const lines = [head];
    const skip = mine.find((a) => a.kind === 'skip');
    const stepLines: string[] = [];
    /** Steps with a new tick or answer in this report (progress lines alone don't count). */
    let reported = 0;
    for (const step of topic.steps) {
      const sep = /[?:]$/.test(step.title) ? ' ' : ': ';
      if (step.kind === 'auto') {
        const tick = mine.find((a) => a.kind === 'auto' && a.stepId === step.id);
        if (tick) {
          stepLines.push(`- ${step.title}: done ${when(tick)}`);
          reported++;
          continue;
        }
        const r = runDetector(step, facts);
        if (r.done) stepLines.push(`- ${step.title}: done`);
        else if (r.have !== undefined && r.need !== undefined)
          stepLines.push(`- ${step.title}: not yet (${r.have} of ${r.need})`);
        else stepLines.push(`- ${step.title}: not yet`);
        continue;
      }
      const a = mine.find((x) => x.kind === 'ask' && x.stepId === step.id);
      if (!a) continue;
      const labels = (a.optionIds ?? [])
        .map((id) => step.options.find((o) => o.id === id)?.label)
        .filter((l): l is string => l !== undefined);
      stepLines.push(
        `- ${step.title}${sep}${labels.length ? labels.join(', ') : 'no choice'} ${when(a)}`,
      );
      reported++;
      const note = a.note === undefined ? '' : redactNote(a.note);
      if (note !== '') stepLines.push(`  Note: ${note.replace(/\s*\n\s*/g, ' / ')}`);
    }
    if (reported > 0) lines.push(...stepLines);
    if (skip) lines.push(`- Skipped ${when(skip)}`);
    if (reported === 0 && !skip) continue; // only answers for steps that no longer exist
    blocks.push(lines.join('\n'));
  }

  const header = [
    'Gym Clean to-do report',
    versionLabel(release, build),
    `App: ${platform === 'native' ? 'iPhone app' : 'PWA'}`,
    `Copied: ${localDate(now)}`,
  ].join('\n');
  const body = blocks.length ? blocks.join('\n\n') : 'Nothing new since your last copy.';
  return { text: `${header}\n\n${body}\n`, answerIds };
}
