import nlp from 'compromise';
import * as chrono from 'chrono-node';
import type {
  ExtractInput, ExtractOutput, EntityMention,
  EntityType, ParsedDate, ParsedQuantity,
} from './types';

// --- Public types ---

export interface LexiconEntry {
  readonly name: string;
  readonly entityType: EntityType;
}

export interface ExtractOptions {
  readonly lexicon: readonly LexiconEntry[];
  readonly referenceDate?: Date;
}

// --- Constants ---

// Multi-word verb phrases, checked before single-word scan.
const VERB_PHRASES = ['pick up', 'out of'];

// Single-word verbs recognized by the deterministic path.
// Stored as surface forms (not lemmatized) because verb_tool_lookup
// maps exact surface forms to tools.
const KNOWN_VERBS = [
  'buy', 'bought', 'add', 'remind', 'schedule', 'need',
  'have', 'has', 'had', 'used', 'finished', 'completed',
  'save', 'are', 'is',
];

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const QUANTITY_PATTERN =
  /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(box(?:es)?|roll(?:s)?|bag(?:s)?|count|gallon(?:s)?|pound(?:s)?|lb(?:s)?|oz|minutes?|dozen)/i;

const IMPLICIT_ONE_PATTERN = /\bone\s+of\s+the\b/i;

// Function words and pronouns to strip before unknown entity detection
const STRIP_WORDS =
  /\b(i|me|my|we|you|your|he|she|it|its|they|them|the|a|an|to|in|from|of|about|at|on|for|and|but|or|with|that|this|just|some|all)\b/gi;

// Nouns that appear in household commands but aren't entities
const NON_ENTITY_NOUNS = new Set([
  'list', 'shopping list', 'box', 'boxes', 'roll', 'rolls',
  'bag', 'bags', 'thing', 'things', 'time',
]);

// Words that typically start a date/time expression.
// Used to detect when chrono greedily absorbs a non-date prefix
// like "night" from "date night next Saturday evening".
const DATE_STARTERS = new Set([
  'today', 'tomorrow', 'yesterday', 'tonight',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'next', 'last', 'this', 'at', 'on', 'in', 'before', 'after',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

// --- Orchestrator ---

export function extract(input: ExtractInput, options: ExtractOptions): ExtractOutput {
  const { text } = input;
  const { lexicon, referenceDate = new Date() } = options;

  const verb = extractVerb(text);
  const dates = extractDates(text, referenceDate);
  const quantities = extractQuantities(text);
  const entityMentions = extractEntityMentions(text, lexicon, verb, dates);

  return { verb, entityMentions, dates, quantities };
}

// --- Concept: verb extraction ---
// Scans for known multi-word phrases, then single verbs.
// Falls back to compromise POS for novel verbs not in lookup table.

function extractVerb(text: string): string {
  const lower = text.toLowerCase();

  for (const phrase of VERB_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }

  for (const verb of KNOWN_VERBS) {
    if (lower.includes(verb)) return verb;
  }

  const doc = nlp(text);
  const verbs = doc.verbs().out('array') as string[];
  if (verbs.length > 0) return verbs[0]!.toLowerCase();

  return '';
}

// --- Concept: entity mention extraction ---
// Matches against lexicon first, then finds unknown noun phrases
// in the remaining text after stripping all recognized content.

function extractEntityMentions(
  text: string,
  lexicon: readonly LexiconEntry[],
  verb: string,
  dates: readonly ParsedDate[],
): EntityMention[] {
  const lexiconMentions = matchLexicon(text, lexicon);
  const remaining = stripKnownContent(text, verb, dates, lexiconMentions);
  const unknownMentions = findUnknownMentions(remaining);
  return [...lexiconMentions, ...unknownMentions];
}

// --- Concept: match text against entity lexicon ---
// Longest-match-first to handle "basement pantry" before "basement".

function matchLexicon(
  text: string,
  lexicon: readonly LexiconEntry[],
): EntityMention[] {
  const mentions: EntityMention[] = [];
  const sortedLexicon = [...lexicon].sort((a, b) => b.name.length - a.name.length);

  let remaining = text.toLowerCase();
  for (const entry of sortedLexicon) {
    const entryLower = entry.name.toLowerCase();
    if (remaining.includes(entryLower)) {
      mentions.push({ text: entry.name, typeHint: entry.entityType });
      remaining = remaining.replace(entryLower, '');
    }
  }

  return mentions;
}

// --- Concept: strip recognized content to isolate unknown noun phrases ---
// Removes verb, dates, quantities, lexicon matches, contractions,
// and function words.

function stripKnownContent(
  text: string,
  verb: string,
  dates: readonly ParsedDate[],
  lexiconMentions: readonly EntityMention[],
): string {
  let remaining = text.toLowerCase();

  // Strip contractions first ("we're" → "we", "'s" → "")
  remaining = remaining.replace(/'\w+/g, '');

  if (verb) remaining = remaining.replace(verb, ' ');

  for (const date of dates) {
    remaining = remaining.replace(date.raw.toLowerCase(), ' ');
  }

  // Strip quantity expressions (re-detect from remaining text)
  const quantityMatch = remaining.match(QUANTITY_PATTERN);
  if (quantityMatch) remaining = remaining.replace(quantityMatch[0], ' ');
  const implicitMatch = remaining.match(IMPLICIT_ONE_PATTERN);
  if (implicitMatch) remaining = remaining.replace(implicitMatch[0], ' ');

  for (const mention of lexiconMentions) {
    remaining = remaining.replace(mention.text.toLowerCase(), ' ');
  }

  remaining = remaining.replace(STRIP_WORDS, ' ');
  return remaining.replace(/\s+/g, ' ').trim();
}

// --- Concept: detect noun phrases not in the lexicon ---
// Uses compromise NLP on stripped text. Falls back to treating the
// entire remaining text as an unknown entity when compromise finds nothing.

function findUnknownMentions(remainingText: string): EntityMention[] {
  if (remainingText.length < 2) return [];

  const doc = nlp(remainingText);

  // Try gerund phrases first ("mowing the lawn"), fall back to nouns
  const gerunds = doc.match('#Gerund+ the? #Noun+').out('array') as string[];
  const nouns = doc.nouns().out('array') as string[];
  const candidates = gerunds.length > 0 ? gerunds : nouns;

  const unknowns: EntityMention[] = [];
  for (const raw of candidates) {
    const cleaned = stripArticle(raw);
    if (cleaned.length < 2) continue;
    if (NON_ENTITY_NOUNS.has(cleaned.toLowerCase())) continue;
    unknowns.push({ text: cleaned, typeHint: 'unknown' });
  }

  // Fallback: if compromise missed it but remaining text is substantive,
  // treat the whole remaining text as an unknown entity
  if (unknowns.length === 0 && remainingText.length >= 3) {
    if (!NON_ENTITY_NOUNS.has(remainingText.toLowerCase())) {
      unknowns.push({ text: remainingText, typeHint: 'unknown' });
    }
  }

  return unknowns;
}

// --- Concept: date extraction via chrono-node ---
// Refines results to trim non-date prefixes that chrono greedily absorbs.

function extractDates(text: string, referenceDate: Date): ParsedDate[] {
  const results = chrono.parse(text, referenceDate);
  return results
    .map(result => refineChronoResult(result, referenceDate))
    .filter((d): d is ParsedDate => d !== null);
}

// --- Concept: trim non-date prefix from chrono match ---
// chrono sometimes absorbs a preceding noun into a date expression
// (e.g., "night next Saturday evening"). If the first word isn't a
// typical date starter, re-parse without it.

function refineChronoResult(
  result: chrono.ParsedResult,
  referenceDate: Date,
): ParsedDate | null {
  const firstWord = result.text.split(/\s+/)[0]!.toLowerCase();

  if (DATE_STARTERS.has(firstWord)) {
    return { raw: result.text, parsed: formatParsedDate(result) };
  }

  // First word isn't a date starter — try without it
  const trimmedText = result.text.split(/\s+/).slice(1).join(' ');
  const reParsed = chrono.parse(trimmedText, referenceDate);
  if (reParsed.length > 0) {
    const refined = reParsed[0]!;
    return { raw: refined.text, parsed: formatParsedDate(refined) };
  }

  return null;
}

// --- Concept: quantity extraction via regex ---

function extractQuantities(text: string): ParsedQuantity[] {
  const match = text.match(QUANTITY_PATTERN);
  if (match) {
    const rawValue = match[1]!.toLowerCase();
    const value = WORD_NUMBERS[rawValue] ?? parseInt(rawValue, 10);
    return [{ value, unit: normalizeUnit(match[2]!) }];
  }

  if (IMPLICIT_ONE_PATTERN.test(text)) return [{ value: 1, unit: 'count' }];
  return [];
}

// --- Leaf: format chrono ParsedResult to ISO 8601 ---
// Date-only when no explicit time; datetime (no seconds) when time present.

function formatParsedDate(result: chrono.ParsedResult): string {
  const start = result.start;
  const date = start.date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (start.isCertain('hour')) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  return `${year}-${month}-${day}`;
}

// --- Leaf: normalize unit to singular form ---

function normalizeUnit(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith('box')) return 'box';
  if (lower.startsWith('roll')) return 'roll';
  if (lower.startsWith('bag')) return 'bag';
  if (lower.startsWith('minute')) return 'minutes';
  return lower;
}

// --- Leaf: strip leading articles ---

function stripArticle(text: string): string {
  return text.replace(/^(the|a|an)\s+/i, '');
}
