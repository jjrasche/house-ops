// Mock Supabase client for pipeline tests.
// Simulates resolve_entity_fuzzy RPC and resolution_context_rules queries
// using in-memory seed data. Mirrors what Postgres does with pg_trgm.

import type { ResolveOptions } from '../../lib/pipeline/resolve';

// --- Types ---

export interface SeedRow {
  readonly id: number;
  readonly name: string;
  readonly entityType: string;
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

// --- Mock Supabase factory ---

export function createMockSupabase(seedEntities: readonly SeedRow[]) {
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
    from: () => ({
      select: function() { return this; },
      eq: function() { return this; },
      limit: function() { return this; },
      single: () => Promise.resolve({ data: null, error: null }),
    }),
  } as unknown as ResolveOptions['supabase'];
}
