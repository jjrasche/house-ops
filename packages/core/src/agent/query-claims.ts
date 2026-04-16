import type { SupabaseClient } from '@supabase/supabase-js';

export interface MemoryClaim {
  readonly id: string;
  readonly description: string;
  readonly entity_names: string[];
  readonly memory_status: string;
  readonly occurred_at: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface ClaimQueryResult {
  readonly claims: MemoryClaim[];
  readonly error?: string;
}

/**
 * Search current (non-superseded) claims whose description matches keywords.
 * Uses pg_trgm similarity via ilike for keyword matching.
 * Returns top N claims ordered by created_at descending.
 */
export async function searchClaims(
  supabase: SupabaseClient,
  userId: string,
  keywords: string[],
  limit = 5,
): Promise<ClaimQueryResult> {
  if (keywords.length === 0) {
    return { claims: [] };
  }

  // Build ilike filter: each keyword must appear somewhere in description
  let query = supabase
    .from('current_claims')
    .select('id, description, entity_names, memory_status, occurred_at, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  for (const keyword of keywords) {
    query = query.ilike('description', `%${keyword}%`);
  }

  const { data, error } = await query;

  if (error) {
    return { claims: [], error: error.message };
  }

  return { claims: (data ?? []) as MemoryClaim[] };
}

/**
 * Extract keywords from input text for claim search.
 * Strips common stop words, returns lowercase tokens >= 3 chars.
 */
export function extractSearchKeywords(text: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'it', 'its', 'this', 'that', 'and', 'or', 'but', 'not',
    'do', 'does', 'did', 'has', 'have', 'had', 'can', 'could',
    'will', 'would', 'shall', 'should', 'may', 'might',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she',
    'him', 'her', 'they', 'them', 'their', 'what', 'which',
    'who', 'when', 'where', 'how', 'all', 'each', 'every',
    'some', 'any', 'no', 'just', 'also', 'very', 'too',
    'set', 'get', 'put', 'make', 'let', 'please',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
}
