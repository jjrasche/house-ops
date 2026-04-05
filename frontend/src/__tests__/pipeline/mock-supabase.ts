// Mock Supabase client for pipeline tests.
// Simulates resolve_entity_fuzzy RPC, resolution_context_rules queries,
// and verb_tool_lookup subset matching using in-memory seed data.

import type { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---

export interface SeedRow {
  readonly id: number;
  readonly name: string;
  readonly entityType: string;
}

export interface VerbToolRow {
  readonly household_id: number;
  readonly verb: string;
  readonly entity_types: readonly string[];
  readonly tool_name: string;
  readonly confidence: number;
  readonly source: string;
}

// --- pg_trgm-equivalent: Jaccard similarity over character trigrams ---

function buildTrigramSet(text: string): Set<string> {
  const padded = `  ${text.toLowerCase()} `;
  const trigrams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

export function calculateTrigramSimilarity(surface: string, mention: string): number {
  const surfaceTrigrams = buildTrigramSet(surface);
  const mentionTrigrams = buildTrigramSet(mention);
  let intersection = 0;
  for (const trigram of surfaceTrigrams) {
    if (mentionTrigrams.has(trigram)) intersection++;
  }
  const union = surfaceTrigrams.size + mentionTrigrams.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// --- Subset matching for verb_tool_lookup ---
// Mirrors Postgres: entity_types <@ input_types, ORDER BY array_length DESC.
// Most specific match wins (longest entity_types array that is a subset).


// --- Seed verb_tool_lookup rows (mirrors 003_seed_data.sql) ---

export const VERB_TOOL_SEED: VerbToolRow[] = [
  { household_id: 1, verb: 'buy',       entity_types: ['item'],            tool_name: 'update_item',    confidence: 0.95, source: 'seed' },
  { household_id: 1, verb: 'add',       entity_types: ['item'],            tool_name: 'update_item',    confidence: 0.93, source: 'seed' },
  { household_id: 1, verb: 'need',      entity_types: ['item'],            tool_name: 'update_item',    confidence: 0.94, source: 'seed' },
  { household_id: 1, verb: 'bought',    entity_types: ['item'],            tool_name: 'update_item',    confidence: 0.94, source: 'seed' },
  { household_id: 1, verb: 'purchased', entity_types: ['item'],            tool_name: 'update_item',    confidence: 0.94, source: 'seed' },
  { household_id: 1, verb: 'have',      entity_types: ['item', 'location'], tool_name: 'update_item',    confidence: 0.92, source: 'seed' },
  { household_id: 1, verb: 'used',      entity_types: ['item'],            tool_name: 'update_item',    confidence: 0.92, source: 'seed' },
  { household_id: 1, verb: 'pick up',   entity_types: ['item', 'store'],   tool_name: 'update_item',    confidence: 0.95, source: 'seed' },
  { household_id: 1, verb: 'out of',    entity_types: ['item'],            tool_name: 'update_item',    confidence: 0.90, source: 'seed' },
  { household_id: 1, verb: 'pick up',   entity_types: ['item'],            tool_name: 'update_item',    confidence: 0.90, source: 'seed' },
  { household_id: 1, verb: 'remind',    entity_types: [],                  tool_name: 'create_action',  confidence: 0.93, source: 'seed' },
  { household_id: 1, verb: 'schedule',  entity_types: [],                  tool_name: 'create_action',  confidence: 0.93, source: 'seed' },
  { household_id: 1, verb: 'create',    entity_types: [],                  tool_name: 'create_action',  confidence: 0.90, source: 'seed' },
  { household_id: 1, verb: 'finished',  entity_types: ['action'],          tool_name: 'update_action',  confidence: 0.92, source: 'seed' },
  { household_id: 1, verb: 'completed', entity_types: ['action'],          tool_name: 'update_action',  confidence: 0.92, source: 'seed' },
  { household_id: 1, verb: 'done',      entity_types: ['action'],          tool_name: 'update_action',  confidence: 0.92, source: 'seed' },
  { household_id: 1, verb: 'save',      entity_types: [],                  tool_name: 'create_recipe',  confidence: 0.88, source: 'seed' },
];

// --- Mock Supabase builder ---
// Supports both RESOLVE (rpc + context rules) and CLASSIFY (verb_tool_lookup).

interface MockSupabaseConfig {
  readonly seedEntities?: readonly SeedRow[];
  readonly verbToolRows?: readonly VerbToolRow[];
}

export function createMockSupabase(
  seedEntitiesOrConfig: readonly SeedRow[] | MockSupabaseConfig,
): SupabaseClient {
  const config: MockSupabaseConfig = Array.isArray(seedEntitiesOrConfig)
    ? { seedEntities: seedEntitiesOrConfig }
    : seedEntitiesOrConfig;

  const seedEntities = config.seedEntities ?? [];
  const verbToolRows = config.verbToolRows ?? [];

  return {
    rpc: (_fnName: string, params: Record<string, unknown>) => {
      const mention = params.p_mention as string;
      const threshold = params.p_threshold as number;
      const matches = seedEntities
        .map(row => ({
          entity_id: row.id,
          entity_type: row.entityType,
          score: calculateTrigramSimilarity(row.name, mention),
        }))
        .filter(m => m.score > threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      return Promise.resolve({ data: matches, error: null });
    },
    from: (table: string) => {
      if (table === 'verb_tool_lookup') {
        return createVerbToolQueryChain(verbToolRows);
      }
      // Default: resolution_context_rules (returns null)
      return createNullQueryChain();
    },
  } as unknown as SupabaseClient;
}

// --- Query chain builders ---

function createNullQueryChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    order: () => chain,
  };
  return chain;
}

function createVerbToolQueryChain(rows: readonly VerbToolRow[]) {
  let filteredRows = [...rows];
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      filteredRows = filteredRows.filter(
        (row) => (row as Record<string, unknown>)[column] === value,
      );
      return chain;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      const asc = options?.ascending ?? true;
      filteredRows.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[column];
        const bVal = (b as Record<string, unknown>)[column];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return asc ? aVal - bVal : bVal - aVal;
        }
        return 0;
      });
      return chain;
    },
    limit: (count: number) => {
      filteredRows = filteredRows.slice(0, count);
      return chain;
    },
    single: () => Promise.resolve({
      data: filteredRows[0] ?? null,
      error: null,
    }),
    // Thenable: allows `await supabase.from().select().eq()...`
    then: (
      onFulfilled?: (value: { data: VerbToolRow[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      return Promise.resolve({ data: filteredRows, error: null })
        .then(onFulfilled, onRejected);
    },
  };
  return chain;
}
