import { describe, it, expect } from 'vitest';
import type { ExtractInput } from '../../lib/pipeline/types';
import { extract } from '../../lib/pipeline/extract';
import type { LexiconEntry } from '../../lib/pipeline/extract';
import { TEST_HOUSEHOLD_ID, ITEMS, PEOPLE, LOCATIONS, STORES, ACTIVITIES } from './seed';

// Build lexicon from seed data (mirrors entity_lexicon table in production)
const LEXICON: LexiconEntry[] = [
  ...Object.values(PEOPLE).map(p => ({ name: p.name, entityType: 'person' as const })),
  ...Object.values(ITEMS).map(i => ({ name: i.name, entityType: 'item' as const })),
  ...Object.values(LOCATIONS).map(l => ({ name: l.name, entityType: 'location' as const })),
  ...Object.values(STORES).map(s => ({ name: s.name, entityType: 'store' as const })),
  ...Object.values(ACTIVITIES).map(a => ({ name: a.name, entityType: 'activity' as const })),
];

// Pin reference date so chrono-node produces deterministic results
const REFERENCE_DATE = new Date('2026-03-30T12:00:00');

function runExtract(text: string) {
  const input: ExtractInput = { text, householdId: TEST_HOUSEHOLD_ID };
  return extract(input, { lexicon: LEXICON, referenceDate: REFERENCE_DATE });
}

describe('EXTRACT stage', () => {
  it.each([
    ['Buy milk', 'buy', 1, 0, 0],
    ['Add 3 boxes of cereal to the shopping list', 'add', 1, 0, 1],
    ['Remind me Thursday about the dentist', 'remind', 1, 1, 0],
    ['Theo has wrestling at 4', 'has', 2, 1, 0],
    ["We're out of eggs", 'out of', 1, 0, 0],
    ['I bought the eggs', 'bought', 1, 0, 0],
    ['We have 10 rolls of toilet paper in the basement pantry', 'have', 2, 0, 1],
    ['Used one of the garbage bags', 'used', 1, 0, 1],
    ['Pick up 3 boxes of cereal from Costco', 'pick up', 2, 0, 1],
    ['I finished mowing the lawn', 'finished', 1, 0, 0],
    ['Schedule a date night next Saturday evening', 'schedule', 1, 1, 0],
  ] as const)(
    'extracts from "%s": verb=%s, entities=%d, dates=%d, quantities=%d',
    (text, expectedVerb, entityCount, dateCount, quantityCount) => {
      const output = runExtract(text);

      expect(output.verb).toBe(expectedVerb);
      expect(output.entityMentions).toHaveLength(entityCount);
      expect(output.dates).toHaveLength(dateCount);
      expect(output.quantities).toHaveLength(quantityCount);
    },
  );

  it('extracts date with ISO format', () => {
    const output = runExtract('Remind me Thursday about the dentist');
    expect(output.dates[0]?.parsed).toBe('2026-04-02');
  });

  it('extracts quantity with unit', () => {
    const output = runExtract('Add 3 boxes of cereal to the shopping list');
    expect(output.quantities[0]).toEqual({ value: 3, unit: 'box' });
  });

  it('extracts multi-word verb "pick up"', () => {
    const output = runExtract('Pick up 3 boxes of cereal from Costco');
    expect(output.verb).toBe('pick up');
  });

  describe('entity identity (text + typeHint)', () => {
    it('"Buy milk" identifies milk as item', () => {
      const output = runExtract('Buy milk');
      expect(output.entityMentions[0]).toEqual({ text: 'milk', typeHint: 'item' });
    });

    it('"Theo has wrestling at 4" identifies person + activity', () => {
      const output = runExtract('Theo has wrestling at 4');
      const types = output.entityMentions.map(e => e.typeHint).sort();
      expect(types).toEqual(['activity', 'person']);
      expect(output.entityMentions).toContainEqual({ text: 'Theo', typeHint: 'person' });
      expect(output.entityMentions).toContainEqual({ text: 'wrestling', typeHint: 'activity' });
    });

    it('"Pick up cereal from Costco" identifies item + store', () => {
      const output = runExtract('Pick up 3 boxes of cereal from Costco');
      expect(output.entityMentions).toContainEqual({ text: 'cereal', typeHint: 'item' });
      expect(output.entityMentions).toContainEqual({ text: 'Costco', typeHint: 'store' });
    });

    it('"toilet paper in the basement pantry" identifies item + location', () => {
      const output = runExtract('We have 10 rolls of toilet paper in the basement pantry');
      expect(output.entityMentions).toContainEqual({ text: 'toilet paper', typeHint: 'item' });
      expect(output.entityMentions).toContainEqual({ text: 'Basement Pantry', typeHint: 'location' });
    });
  });

  describe('date/entity separation', () => {
    it('"Schedule a date night next Saturday evening" separates entity from date', () => {
      const output = runExtract('Schedule a date night next Saturday evening');
      expect(output.entityMentions).toContainEqual({ text: 'date night', typeHint: 'unknown' });
      expect(output.dates[0]?.raw).toBe('next Saturday evening');
    });
  });

  describe('negative entity extraction', () => {
    it('"Add milk to the shopping list" does not extract "shopping list" as entity', () => {
      const output = runExtract('Add milk to the shopping list');
      const texts = output.entityMentions.map(e => e.text.toLowerCase());
      expect(texts).not.toContain('shopping list');
      expect(texts).not.toContain('list');
    });

    it('"Used one of the garbage bags" does not extract "one" or "bags" as entities', () => {
      const output = runExtract('Used one of the garbage bags');
      const texts = output.entityMentions.map(e => e.text.toLowerCase());
      expect(texts).toContain('garbage bags');
      expect(texts).not.toContain('one');
      expect(texts).not.toContain('bags');
    });

    it('implicit quantity extracts value and unit', () => {
      const output = runExtract('Used one of the garbage bags');
      expect(output.quantities[0]).toEqual({ value: 1, unit: 'count' });
    });
  });
});
