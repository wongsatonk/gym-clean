import { describe, expect, it } from 'vitest';
import { trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import howtoJson from '../../../data/howto.json';
import cuesJson from '../../../data/cues.json';
import facts from './facts.json';
import { serializeContext } from '../brain/context';
import {
  factsInput,
  factsMatch,
  readToolResults,
  type FactItem,
  type FactsScenario,
} from '../brain/readTools';
import type { Program } from '../../types';

const items = facts.items as FactItem[];
const input = {
  ...factsInput(facts.scenario as FactsScenario, programJson as Program, trainerCatalog()),
  howTo: (id: string) => (howtoJson as Record<string, { lines: string[] }>)[id],
  cue: (id: string) => (cuesJson as Record<string, string>)[id],
};
const context = serializeContext(input, { brain: 'apple' }).text;
const results = readToolResults(input);

describe('facts eval set', () => {
  it('has at least 20 items with unique ids, a question and facts', () => {
    expect(items.length).toBeGreaterThanOrEqual(20);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) {
      expect(i.text.length).toBeGreaterThan(5);
      expect(i.facts.length).toBeGreaterThan(0);
    }
  });

  it('covers the context and every read tool', () => {
    const sources = new Set(items.map((i) => i.source.split(':')[0]));
    for (const s of ['context', 'weekSummary', 'progressSummary', 'exerciseInfo', 'foodIdeas'])
      expect(sources).toContain(s);
  });

  for (const item of items)
    it(`${item.id}: every fact is in its source (${item.source})`, () => {
      const text = item.source === 'context' ? context : results[item.source];
      expect(text, item.source).toBeDefined();
      expect(factsMatch(text ?? '', item)).toEqual({ ok: true, missing: [] });
    });

  it('is made up: no personal names', () => {
    expect(JSON.stringify(facts)).not.toMatch(/Wongsaton|Kampusan/i);
  });
});
