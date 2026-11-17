import { describe, expect, it } from 'vitest';
import type { TodoAnswer, TodoFacts, TodoTopic } from '../types';
import { NOTE_MAX_CHARS, buildReport, redactNote } from './report';

// Made-up topics, answers and facts only (public repo).
const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();
const NOW = at(16, 20);

const TOPICS: TodoTopic[] = [
  {
    id: 'coach',
    title: 'Coach tab + Calendar',
    checkpoint: 'Checkpoint I',
    since: '1.12.0',
    platform: 'any',
    steps: [
      { id: 'asked', title: 'Ask the coach a question', kind: 'auto', detector: 'chatAsked' },
      {
        id: 'changes',
        title: 'Apply 2 coach changes',
        kind: 'auto',
        detector: 'coachChanges',
        params: { min: 2 },
      },
      {
        id: 'motion',
        title: 'How did the motion feel?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'right', label: 'Just right' },
          { id: 'much', label: 'Too much' },
          { id: 'little', label: 'Too little' },
        ],
      },
      {
        id: 'types',
        title: 'Which ones',
        kind: 'ask',
        multi: true,
        options: [
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
        ],
      },
    ],
  },
  {
    id: 'health',
    title: 'Apple Health week',
    checkpoint: 'Checkpoint H',
    since: '1.12.0',
    platform: 'native',
    steps: [
      {
        id: 'days',
        title: 'Health data on 7 of the last 7 days',
        kind: 'auto',
        detector: 'healthDays',
        params: { min: 7 },
      },
    ],
  },
  {
    id: 'food',
    title: 'Food photos',
    checkpoint: 'Checkpoint D',
    since: '1.12.0',
    platform: 'any',
    steps: [{ id: 'q', title: 'Fast enough?', kind: 'ask', options: [{ id: 'y', label: 'Yes' }] }],
  },
];

const FACTS: TodoFacts = {
  platform: 'native',
  now: NOW,
  counts: { chatQuestions: 2, coachChanges: 1, healthDays7: 5 },
  flags: { healthConnected: true },
};

let seq = 0;
const ans = (
  topicId: string,
  stepId: string,
  kind: TodoAnswer['kind'],
  extra: Partial<TodoAnswer> = {},
): TodoAnswer => ({
  id: `a${seq++}`,
  topicId,
  stepId,
  kind,
  at: at(16),
  release: '1.12.0',
  ...extra,
});

const BASE = {
  topics: TOPICS,
  facts: FACTS,
  release: '1.12.0',
  build: 'abc1234',
  platform: 'native' as const,
  now: NOW,
};

describe('buildReport', () => {
  it('formats a header and one block per topic (snapshot)', () => {
    const answers = [
      ans('coach', 'asked', 'auto', { at: at(15) }),
      ans('coach', 'motion', 'ask', { optionIds: ['much'], note: 'Cards bounce a lot' }),
      ans('coach', 'types', 'ask', { optionIds: ['a', 'b'] }),
      ans('food', '', 'skip', { at: at(14), release: '1.11.0' }),
    ];
    const { text, answerIds } = buildReport({ ...BASE, answers });
    expect(text).toBe(
      [
        'Gym Clean to-do report',
        'Version 1.12.0 (build abc1234)',
        'App: iPhone app',
        'Copied: 2026-11-16',
        '',
        'Coach tab + Calendar (Checkpoint I)',
        '- Ask the coach a question: done (2026-11-15)',
        '- Apply 2 coach changes: not yet (1 of 2)',
        '- How did the motion feel? Too much (2026-11-16)',
        '  Note: Cards bounce a lot',
        '- Which ones: Alpha, Beta (2026-11-16)',
        '',
        'Food photos (Checkpoint D)',
        '- Skipped (2026-11-14, 1.11.0)',
        '',
      ].join('\n'),
    );
    expect(answerIds.sort()).toEqual(answers.map((a) => a.id).sort());
  });

  it('says PWA on the web and has no topic blocks when nothing is new', () => {
    const { text, answerIds } = buildReport({
      ...BASE,
      platform: 'web',
      answers: [ans('coach', 'motion', 'ask', { optionIds: ['right'], sentAt: at(15) })],
    });
    expect(text).toContain('App: PWA');
    expect(text).toContain('Nothing new since your last copy.');
    expect(text).not.toContain('Coach tab');
    expect(answerIds).toEqual([]);
  });

  it('only reports answers not sent yet', () => {
    const sent = ans('coach', 'asked', 'auto', { sentAt: at(15) });
    const fresh = ans('food', 'q', 'ask', { optionIds: ['y'] });
    const { text, answerIds } = buildReport({ ...BASE, answers: [sent, fresh] });
    expect(text).not.toContain('Coach tab');
    expect(text).toContain('Food photos (Checkpoint D)');
    expect(text).toContain('- Fast enough? Yes (2026-11-16)');
    expect(answerIds).toEqual([fresh.id]);
  });

  it('`all` reports everything again, the latest answer per step', () => {
    const old = ans('coach', 'motion', 'ask', { optionIds: ['right'], at: at(10), sentAt: at(11) });
    const newer = ans('coach', 'motion', 'ask', {
      optionIds: ['little'],
      at: at(12),
      sentAt: at(13),
    });
    const tick = ans('coach', 'asked', 'auto', { at: at(9), sentAt: at(11) });
    const { text, answerIds } = buildReport({ ...BASE, answers: [old, newer, tick], all: true });
    expect(text).toContain('- How did the motion feel? Too little (2026-11-12)');
    expect(text).not.toContain('Just right');
    expect(text).toContain('- Ask the coach a question: done (2026-11-09)');
    expect(answerIds.sort()).toEqual([old.id, newer.id, tick.id].sort());
  });

  it('reports a changed answer after a copy as the new answer', () => {
    const old = ans('coach', 'motion', 'ask', { optionIds: ['right'], at: at(10), sentAt: at(11) });
    const changed = ans('coach', 'motion', 'ask', { optionIds: ['much'], at: at(12) });
    const { text, answerIds } = buildReport({ ...BASE, answers: [old, changed] });
    expect(text).toContain('Too much (2026-11-12)');
    expect(text).not.toContain('Just right');
    expect(answerIds).toEqual([changed.id]);
  });

  it('auto steps report counts or done, never values', () => {
    const { text } = buildReport({
      ...BASE,
      answers: [ans('health', 'days', 'auto', { at: at(16) })],
    });
    expect(text).toContain('Apple Health week (Checkpoint H)');
    expect(text).toContain('- Health data on 7 of the last 7 days: done (2026-11-16)');
  });

  it('lists a skipped topic as skipped, without its steps', () => {
    const { text } = buildReport({ ...BASE, answers: [ans('coach', '', 'skip')] });
    expect(text).toContain('Coach tab + Calendar (Checkpoint I)\n- Skipped (2026-11-16)\n');
    expect(text).not.toContain('Ask the coach a question');
  });

  it('still prints Skipped when a skipped topic also has answers', () => {
    const { text } = buildReport({
      ...BASE,
      answers: [
        ans('food', 'q', 'ask', { optionIds: ['y'], at: at(15) }),
        ans('food', '', 'skip', { at: at(16) }),
      ],
    });
    expect(text).toContain(
      'Food photos (Checkpoint D)\n- Fast enough? Yes (2026-11-15)\n- Skipped (2026-11-16)',
    );
  });

  it('leaves blank ask rows (no option, no note) out of the report', () => {
    const { text } = buildReport({
      ...BASE,
      answers: [ans('food', 'q', 'ask', { optionIds: [] })],
    });
    expect(text).not.toContain('Food photos');
    expect(text).not.toContain('no choice');
  });

  it('drops answers for unknown topics and steps, and unknown option ids', () => {
    const { text, answerIds } = buildReport({
      ...BASE,
      answers: [
        ans('gone', 'x', 'ask', { optionIds: ['y'] }),
        ans('coach', 'gone', 'ask', { optionIds: ['y'] }),
        ans('coach', 'types', 'ask', { optionIds: ['a', 'kcal-2150'] }),
      ],
    });
    expect(text).toContain('- Which ones: Alpha (2026-11-16)');
    expect(text).not.toContain('2150');
    expect(text).not.toContain('gone');
    expect(answerIds).toHaveLength(3); // still marked sent, so they don't come back
  });

  it('never contains Health values, photo data, keys, chat text, food/body numbers or his name', () => {
    const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJ';
    const KEY = 'sk-ant-api03-Zq9XmadeupMadeUpMadeUp0123456789abcdefABCDEF';
    const leaky = {
      ...FACTS,
      counts: { ...FACTS.counts, restingHr: 58.7, weightKg: 81.3, kcalToday: 2150 },
      flags: { ...FACTS.flags },
      // Fields a buggy gatherer might add: never read by the report.
      chatText: 'Made-up chat line about my shoulder',
      photo: PHOTO,
      owner: 'Wongsaton Kampusan',
    } as TodoFacts;
    const answers = [
      ans('coach', 'motion', 'ask', {
        optionIds: ['much', 'hrv-63.4'],
        note: `Here is my key ${KEY} and a photo ${PHOTO}`,
      }),
      ans('health', 'days', 'auto'),
    ];
    const { text } = buildReport({ ...BASE, facts: leaky, answers, all: true });
    for (const bad of [
      '58.7',
      '81.3',
      '2150',
      '63.4',
      'sk-ant',
      'Zq9X',
      'base64',
      '/9j/',
      'Made-up chat line',
      'Wongsaton',
      'Kampusan',
    ])
      expect(text, bad).not.toContain(bad);
    expect(text).toContain('[key removed]');
    expect(text).toContain('[photo removed]');
  });
});

describe('redactNote', () => {
  it('replaces key-like strings', () => {
    expect(redactNote('key sk-ant-api03-abcDEF123_-xyz here')).toBe('key [key removed] here');
    expect(redactNote('sk-proj-AbCdEf0123456789AbCdEf0123')).toBe('[key removed]');
    expect(redactNote('hex 0123456789abcdef0123456789abcdef01234567 end')).toBe(
      'hex [key removed] end',
    );
    expect(redactNote('tok QWxhZGRpbjpvcGVuIHNlc2FtZQ0123456789Zz+/== end')).toBe(
      'tok [key removed] end',
    );
  });

  it('replaces photo data URLs', () => {
    expect(redactNote('see data:image/png;base64,iVBORw0KGgo= ok')).toBe('see [photo removed] ok');
  });

  it('keeps ordinary words, numbers, ids and short codes', () => {
    const s =
      'Leg_Press felt off at 80 kg, set 3. Build abc1234. Supercalifragilisticexpialidocious!';
    expect(redactNote(s)).toBe(s);
  });

  it('trims and caps the note at 500 characters', () => {
    expect(NOTE_MAX_CHARS).toBe(500);
    expect(redactNote(`  ${'a '.repeat(400)}  `)).toHaveLength(500);
    expect(redactNote('  hi  ')).toBe('hi');
  });
});
