import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ResolveInput, ResolveOutput, ResolvedEntity,
  EntityMention, EntityType,
} from './types';

// --- Public types ---

export interface ResolveOptions {
  readonly supabase: SupabaseClient;
  readonly similarityThreshold?: number;
}

export interface ResolveCandidate {
  readonly entityId: number;
  readonly entityType: EntityType;
  readonly name: string;
  readonly score: number;
}

// --- Shape returned by resolve_entity_fuzzy RPC ---

interface FuzzyMatch {
  readonly entity_id: number;
  readonly entity_type: string;
  readonly entity_name: string;
  readonly score: number;
}

// --- Shape of resolution_context_rules rows ---

interface ContextRule {
  readonly preferred_id: number;
  readonly preferred_type: string;
}

// --- Constants ---

const DEFAULT_SIMILARITY_THRESHOLD = 0.3;

// --- Orchestrator ---

export async function resolve(
  input: ResolveInput,
  options: ResolveOptions,
): Promise<ResolveOutput> {
  const resolved: ResolvedEntity[] = [];
  const unresolved: string[] = [];

  for (const mention of input.entityMentions) {
    const entity = await resolveEntityMention(
      mention, input.householdId, input.verb, options,
    );
    if (entity) {
      resolved.push(entity);
    } else {
      unresolved.push(mention.text);
    }
  }

  return { resolved, unresolved };
}

// --- Concept: return top-N fuzzy matches for a mention ---
// Used by ResolveCorrectionForm to show candidates the user can pick from.

export async function findCandidates(
  mentionText: string,
  householdId: number,
  options: ResolveOptions,
  maxResults = 5,
): Promise<ResolveCandidate[]> {
  const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  const { data } = await options.supabase.rpc('resolve_entity_fuzzy', {
    p_household_id: householdId,
    p_mention: mentionText,
    p_threshold: threshold,
  });

  const matches = (data ?? []) as FuzzyMatch[];
  return matches.slice(0, maxResults).map(toCandidate);
}

// --- Leaf: map FuzzyMatch → ResolveCandidate ---

function toCandidate(match: FuzzyMatch): ResolveCandidate {
  return {
    entityId: match.entity_id,
    entityType: match.entity_type as EntityType,
    name: match.entity_name,
    score: match.score,
  };
}

// --- Concept: resolve a single entity mention ---
// Checks verb-context rules first (learned disambiguation),
// then falls back to pg_trgm fuzzy matching.

async function resolveEntityMention(
  mention: EntityMention,
  householdId: number,
  verb: string,
  options: ResolveOptions,
): Promise<ResolvedEntity | null> {
  const contextOverride = await findContextRule(
    verb, mention.text, householdId, options.supabase,
  );
  if (contextOverride) {
    return {
      mention: mention.text,
      entityId: contextOverride.preferred_id,
      entityType: contextOverride.preferred_type as EntityType,
      score: 1.0,
    };
  }

  return fuzzyMatchEntity(
    mention, householdId, options,
  );
}

// --- Concept: query resolution_context_rules for verb+mention override ---
// "feed" + "Charlie" → the cat, not the child.

async function findContextRule(
  verb: string,
  mentionText: string,
  householdId: number,
  supabase: SupabaseClient,
): Promise<ContextRule | null> {
  const { data } = await supabase
    .from('resolution_context_rules')
    .select('preferred_id, preferred_type')
    .eq('household_id', householdId)
    .eq('verb', verb.toLowerCase())
    .eq('mention', mentionText.toLowerCase())
    .limit(1)
    .maybeSingle();

  return data as ContextRule | null;
}

// --- Concept: fuzzy match via resolve_entity_fuzzy RPC ---
// Returns the highest-scoring match above threshold, or null.

async function fuzzyMatchEntity(
  mention: EntityMention,
  householdId: number,
  options: ResolveOptions,
): Promise<ResolvedEntity | null> {
  const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  const { data } = await options.supabase.rpc('resolve_entity_fuzzy', {
    p_household_id: householdId,
    p_mention: mention.text,
    p_threshold: threshold,
  });

  const matches = (data ?? []) as FuzzyMatch[];
  if (matches.length === 0) return null;

  const bestMatch = matches[0]!;
  return {
    mention: mention.text,
    entityId: bestMatch.entity_id,
    entityType: bestMatch.entity_type as EntityType,
    score: bestMatch.score,
  };
}
