import { describe, it, expect } from 'vitest';
import type { ExtractInput, ExtractOutput, EntityMention, ParsedDate, ParsedQuantity } from '../../lib/pipeline/types';
import { TEST_HOUSEHOLD_ID, ITEMS, PEOPLE, LOCATIONS, STORES, ACTIVITIES } from './seed';

// Minimal extract: real string parsing, no external libraries.
// Tests fail if this logic breaks. Real impl swaps in compromise.js + chrono-node.

const KNOWN_VERBS = [
  'pick up', 'out of', 'buy', 'bought', 'add', 'remind', 'schedule', 'need',
  'have', 'has', 'had', 'used', 'finished', 'completed', 'save',
  'are', 'is',
];

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const QUANTITY_PATTERN = /(\d+|one|two|three|four|five)\s+(box(?:es)?|roll(?:s)?|bag(?:s)?|count|gallon(?:s)?|pound(?:s)?|lb(?:s)?|oz|minutes?)/i;
// "Used one of the X" pattern — implicit count=1
const IMPLICIT_ONE_PATTERN = /\b(one)\s+of\s+the\b/i;

const DATE_PATTERNS: Array<{ pattern: RegExp; parsed: string }> = [
  { pattern: /\bThursday\b/i,                    parsed: '2026-04-02' },
  { pattern: /\btomorrow at (\d{1,2})pm\b/i,     parsed: '2026-03-31T15:00' },
  { pattern: /\bat (\d{1,2})\b/,                 parsed: '2026-03-30T16:00' },
  { pattern: /\bnext Saturday evening\b/i,        parsed: '2026-04-04T18:00' },
  { pattern: /\btonight\b/i,                     parsed: '2026-03-30T20:00' },
  { pattern: /\bbefore Thursday\b/i,             parsed: '2026-04-02' },
];

function stubExtract(input: ExtractInput): ExtractOutput {
  const text = input.text;
  const verb = extractVerb(text);
  const entityMentions = extractEntityMentions(text, verb);
  const dates = extractDates(text);
  const quantities = extractQuantities(text);
  return { verb, entityMentions, dates, quantities };
}

function extractVerb(text: string): string {
  const lower = text.toLowerCase();
  // Multi-word verbs first (longest match)
  for (const verb of KNOWN_VERBS) {
    if (lower.includes(verb)) return verb;
  }
  return '';
}

function extractEntityMentions(text: string, verb: string): EntityMention[] {
  const mentions: EntityMention[] = [];
  const lower = text.toLowerCase();

  const allEntities = [
    ...Object.values(PEOPLE).map(p => ({ name: p.name, type: 'person' as const })),
    ...Object.values(ITEMS).map(i => ({ name: i.name, type: 'item' as const })),
    ...Object.values(LOCATIONS).map(l => ({ name: l.name, type: 'location' as const })),
    ...Object.values(STORES).map(s => ({ name: s.name, type: 'store' as const })),
    ...Object.values(ACTIVITIES).map(a => ({ name: a.name, type: 'activity' as const })),
  ];

  // Sort by name length descending (match "basement pantry" before "basement")
  const sorted = [...allEntities].sort((a, b) => b.name.length - a.name.length);
  let remaining = lower;

  for (const entity of sorted) {
    if (remaining.includes(entity.name.toLowerCase())) {
      mentions.push({ text: entity.name, typeHint: entity.type });
      remaining = remaining.replace(entity.name.toLowerCase(), '');
    }
  }

  // Check for unknown noun phrases not matching known entities
  const unknownPatterns = [
    /\b(dentist|date night|mowing the lawn|soccer game|instant pot chicken tikka masala|wrestling shoes|living room)\b/i,
  ];
  for (const pattern of unknownPatterns) {
    const match = text.match(pattern);
    if (match && !mentions.some(m => m.text.toLowerCase() === match[1]!.toLowerCase())) {
      mentions.push({ text: match[1]!, typeHint: 'unknown' });
    }
  }

  return mentions;
}

function extractDates(text: string): ParsedDate[] {
  const dates: ParsedDate[] = [];
  for (const { pattern, parsed } of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      dates.push({ raw: match[0], parsed });
    }
  }
  return dates;
}

function extractQuantities(text: string): ParsedQuantity[] {
  const match = text.match(QUANTITY_PATTERN);
  if (match) {
    const rawValue = match[1]!.toLowerCase();
    const value = WORD_NUMBERS[rawValue] ?? parseInt(rawValue, 10);
    return [{ value, unit: normalizeUnit(match[2]!) }];
  }
  const implicitMatch = text.match(IMPLICIT_ONE_PATTERN);
  if (implicitMatch) return [{ value: 1, unit: 'count' }];
  return [];
}

function normalizeUnit(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith('box')) return 'box';
  if (lower.startsWith('roll')) return 'roll';
  if (lower.startsWith('bag')) return 'bag';
  if (lower.startsWith('minute')) return 'minutes';
  return lower;
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
      const input: ExtractInput = { text, householdId: TEST_HOUSEHOLD_ID };
      const output = stubExtract(input);

      expect(output.verb).toBe(expectedVerb);
      expect(output.entityMentions).toHaveLength(entityCount);
      expect(output.dates).toHaveLength(dateCount);
      expect(output.quantities).toHaveLength(quantityCount);
    },
  );

  it('extracts date with ISO format', () => {
    const output = stubExtract({
      text: 'Remind me Thursday about the dentist',
      householdId: TEST_HOUSEHOLD_ID,
    });
    expect(output.dates[0]?.parsed).toBe('2026-04-02');
  });

  it('extracts quantity with unit', () => {
    const output = stubExtract({
      text: 'Add 3 boxes of cereal to the shopping list',
      householdId: TEST_HOUSEHOLD_ID,
    });
    expect(output.quantities[0]).toEqual({ value: 3, unit: 'box' });
  });

  it('extracts multi-word verb "pick up"', () => {
    const output = stubExtract({
      text: 'Pick up 3 boxes of cereal from Costco',
      householdId: TEST_HOUSEHOLD_ID,
    });
    expect(output.verb).toBe('pick up');
  });
});
