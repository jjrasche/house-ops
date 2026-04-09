// Data-driven phrase routing test.
//
// Runs every row in phrase-catalog.ts through the deterministic pipeline
// (mock Supabase, zero LLM calls) and checks:
//   1. Did it route to the expected path (deterministic vs llm)?
//   2. If deterministic: did it pick the right verb, tool, and status?
//
// Output: a summary table showing pass/fail per phrase, plus aggregate
// stats by tag so you can see coverage at a glance.
//
// To add coverage: edit phrase-catalog.ts. This file doesn't change.

import { describe, it, expect, afterAll } from 'vitest';
import type { LexiconEntry, PipelineOptions } from '@house-ops/core';
import { extract, lemmatizeVerb, runPipeline } from '@house-ops/core';
import {
  PEOPLE, ITEMS, LOCATIONS, STORES, ACTIVITIES, ACTIONS,
  TEST_HOUSEHOLD_ID,
} from './seed';
import { createMockSupabase, VERB_TOOL_SEED } from './mock-supabase';
import type { SeedRow } from './mock-supabase';
import { PHRASE_CATALOG } from './phrase-catalog';
import type { PhraseRow } from './phrase-catalog';

// --- Test infrastructure ---

const LEXICON: LexiconEntry[] = [
  ...Object.values(PEOPLE).map(p => ({ name: p.name, entityType: 'person' as const })),
  ...Object.values(ITEMS).map(i => ({ name: i.name, entityType: 'item' as const })),
  ...Object.values(LOCATIONS).map(l => ({ name: l.name, entityType: 'location' as const })),
  ...Object.values(STORES).map(s => ({ name: s.name, entityType: 'store' as const })),
  ...Object.values(ACTIVITIES).map(a => ({ name: a.name, entityType: 'activity' as const })),
];

const REFERENCE_DATE = new Date('2026-04-07T12:00:00');

const SEED_ENTITIES: SeedRow[] = [
  ...Object.values(PEOPLE).map(p => ({ id: p.id, name: p.name, entityType: 'person' })),
  ...Object.values(ITEMS).map(i => ({ id: i.id, name: i.name, entityType: 'item' })),
  ...Object.values(LOCATIONS).map(l => ({ id: l.id, name: l.name, entityType: 'location' })),
  ...Object.values(STORES).map(s => ({ id: s.id, name: s.name, entityType: 'store' })),
  ...Object.values(ACTIVITIES).map(a => ({ id: a.id, name: a.name, entityType: 'activity' })),
  ...Object.values(ACTIONS).map(a => ({ id: a.id, name: a.title, entityType: 'action' })),
];

const mockSupabase = createMockSupabase({
  seedEntities: SEED_ENTITIES,
  verbToolRows: VERB_TOOL_SEED,
});

const opts: PipelineOptions = {
  supabase: mockSupabase,
  householdId: TEST_HOUSEHOLD_ID,
  lexicon: LEXICON,
  referenceDate: REFERENCE_DATE,
};

// --- Result tracking for summary ---

interface RowResult {
  readonly phrase: string;
  readonly tag: string;
  readonly pass: boolean;
  readonly actualPath: string;
  readonly expectedPath: string;
  readonly detail: string;
}

const results: RowResult[] = [];

// --- Summary printer ---

function printSummary() {
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const deterministicCount = results.filter(r => r.actualPath === 'deterministic').length;
  const llmCount = results.filter(r => r.actualPath === 'llm').length;

  // Per-tag breakdown
  const tags = new Map<string, { total: number; passed: number; deterministic: number }>();
  for (const r of results) {
    const t = tags.get(r.tag) ?? { total: 0, passed: 0, deterministic: 0 };
    t.total++;
    if (r.pass) t.passed++;
    if (r.actualPath === 'deterministic') t.deterministic++;
    tags.set(r.tag, t);
  }

  console.log('\n' + '='.repeat(72));
  console.log('PHRASE ROUTING SUMMARY');
  console.log('='.repeat(72));
  console.log(`Total: ${total} | Pass: ${passed} | Fail: ${failed}`);
  console.log(`On-device: ${deterministicCount} (${Math.round(deterministicCount / total * 100)}%) | LLM: ${llmCount} (${Math.round(llmCount / total * 100)}%)`);
  console.log('-'.repeat(72));

  // Tag table
  console.log('TAG'.padEnd(20) + 'TOTAL'.padStart(6) + 'PASS'.padStart(6) + 'ON-DEV'.padStart(8) + ' RATE');
  for (const [tag, t] of [...tags].sort((a, b) => a[0].localeCompare(b[0]))) {
    const rate = Math.round(t.deterministic / t.total * 100);
    console.log(
      tag.padEnd(20)
      + String(t.total).padStart(6)
      + String(t.passed).padStart(6)
      + String(t.deterministic).padStart(8)
      + ` ${rate}%`,
    );
  }

  // Failures
  const failures = results.filter(r => !r.pass);
  if (failures.length > 0) {
    console.log('-'.repeat(72));
    console.log('FAILURES:');
    for (const f of failures) {
      console.log(`  [${f.tag}] "${f.phrase}"`);
      console.log(`    ${f.detail}`);
    }
  }

  console.log('='.repeat(72) + '\n');
}

// --- Build test rows: one it.each across the entire catalog ---

interface ActualResult {
  readonly path: string;
  readonly verb: string;
  readonly tool: string | null;
  readonly status: unknown;
  readonly callCount: number;
  readonly mentions: string[];
}

function buildDetail(row: PhraseRow, actual: ActualResult): { pass: boolean; detail: string } {
  const mismatches: string[] = [];

  if (actual.path !== row.expectedPath) {
    mismatches.push(`path: expected=${row.expectedPath} actual=${actual.path}`);
  }
  if (row.expectedVerb !== undefined && actual.verb !== row.expectedVerb) {
    mismatches.push(`verb: expected="${row.expectedVerb}" actual="${actual.verb}"`);
  }
  if (row.expectedTool !== undefined && actual.tool !== row.expectedTool) {
    mismatches.push(`tool: expected=${row.expectedTool} actual=${actual.tool}`);
  }
  if (row.expectedStatus !== undefined && actual.status !== row.expectedStatus) {
    mismatches.push(`status: expected=${row.expectedStatus} actual=${actual.status}`);
  }
  if (row.expectedCallCount !== undefined && actual.callCount !== row.expectedCallCount) {
    mismatches.push(`calls: expected=${row.expectedCallCount} actual=${actual.callCount}`);
  }
  if (row.expectedMentions !== undefined) {
    const missing = row.expectedMentions.filter(m => !actual.mentions.includes(m));
    if (missing.length > 0) {
      mismatches.push(`mentions missing: [${missing.join(', ')}] in [${actual.mentions.join(', ')}]`);
    }
  }

  return {
    pass: mismatches.length === 0,
    detail: mismatches.length === 0
      ? `OK → ${actual.path} verb="${actual.verb}" tool=${actual.tool} calls=${actual.callCount}`
      : mismatches.join(' | '),
  };
}

// --- The test ---

describe('Phrase routing regression', () => {
  afterAll(() => {
    printSummary();
  });

  const testRows = PHRASE_CATALOG.map(
    row => [row.phrase, row.tag, row] as const,
  );

  it.each(testRows)('%s [%s]', async (_phrase, _tag, row) => {
    const result = await runPipeline(row.phrase, opts);
    const actual: ActualResult = {
      path: result.path,
      verb: result.trace.verb,
      tool: result.toolCalls[0]?.tool ?? null,
      status: result.toolCalls[0]?.params?.status ?? null,
      callCount: result.toolCalls.length,
      mentions: result.trace.entityMentions.map(m => m.text.toLowerCase()),
    };

    const { pass, detail } = buildDetail(row, actual);
    results.push({
      phrase: row.phrase,
      tag: row.tag,
      pass,
      actualPath: actual.path,
      expectedPath: row.expectedPath,
      detail,
    });

    // Actual assertion — if this fails, the test fails
    if (!pass) {
      expect.fail(detail);
    }
  });
});

// ---------------------------------------------------------------------------
// Verb consistency: every base verb in verb_tool_lookup must be extractable,
// and every inflection in KNOWN_VERBS must lemmatize back to something
// in verb_tool_lookup. Catches drift between the three verb sources.
// ---------------------------------------------------------------------------

describe('Verb source consistency', () => {
  const lookupBaseVerbs = [...new Set(VERB_TOOL_SEED.map(r => r.verb))];
  const dummyLexicon: LexiconEntry[] = [{ name: 'milk', entityType: 'item' }];

  it.each(lookupBaseVerbs.map(v => [v]))(
    'verb_tool_lookup verb "%s" is extractable',
    (verb) => {
      const result = extract(
        { text: `${verb} milk`, householdId: 1 },
        { lexicon: dummyLexicon },
      );
      expect(result.verb).toBe(verb);
    },
  );

  // Every inflected form that extract recognizes should lemmatize to
  // a verb that exists in verb_tool_lookup (or be in verb_tool_lookup itself).
  const lookupVerbSet = new Set(lookupBaseVerbs);

  // Get KNOWN_VERBS by extracting each — if it comes back as the verb, it's known
  const knownInflections = [
    'bought', 'buying', 'buys',
    'added', 'adding', 'adds',
    'needed', 'needs',
    'has', 'had',
    'uses',
    'finishes', 'finishing',
    'completes', 'completing',
    'reminded', 'reminds', 'reminding',
    'scheduled', 'schedules', 'scheduling',
    'saved', 'saves', 'saving',
    'created', 'creates', 'creating',
    'purchased',
    // 'is' — intentionally stative, no verb_tool_lookup row (routes to LLM)
  ];

  it.each(knownInflections.map(v => [v]))(
    'inflection "%s" lemmatizes to a verb_tool_lookup entry',
    (verb) => {
      const lemma = lemmatizeVerb(verb);
      const reachable = lookupVerbSet.has(verb) || lookupVerbSet.has(lemma);
      if (!reachable) {
        expect.fail(
          `"${verb}" lemmatizes to "${lemma}" but neither is in verb_tool_lookup. `
          + `Add a lemma mapping or a verb_tool_lookup row.`,
        );
      }
    },
  );
});
