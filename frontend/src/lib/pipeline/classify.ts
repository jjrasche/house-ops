import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassifyInput, ClassifyOutput, EntityType } from './types';
import { lemmatizeVerb } from './extract';

// --- Public types ---

export interface ClassifyOptions {
  readonly supabase: SupabaseClient;
  readonly householdId: number;
}

// --- Shape of verb_tool_lookup rows ---

interface VerbToolMatch {
  readonly tool_name: string;
  readonly confidence: number;
  readonly entity_types: string[];
}

// --- Constants ---

const CONFIDENCE_THRESHOLD = 0.85;
const VERB_ONLY_PENALTY = 0.25;


// --- Orchestrator ---

export async function classify(
  input: ClassifyInput,
  options: ClassifyOptions,
): Promise<ClassifyOutput> {
  const rows = await fetchVerbRows(
    input.verb, options.householdId, options.supabase,
  );

  if (rows.length === 0) {
    return buildFallbackOutput(input);
  }

  const subsetMatch = findSubsetMatch(rows, input.entityTypes);
  if (subsetMatch) {
    return assessConfidence(subsetMatch, input, false);
  }

  const verbOnlyMatch = findVerbOnlyMatch(rows);
  if (verbOnlyMatch) {
    return assessConfidence(verbOnlyMatch, input, true);
  }

  return buildFallbackOutput(input);
}

// --- Concept: fetch verb_tool_lookup rows, falling back to lemma form ---

async function fetchVerbRows(
  verb: string,
  householdId: number,
  supabase: SupabaseClient,
): Promise<VerbToolMatch[]> {
  const surfaceRows = await queryVerbRows(verb, householdId, supabase);
  if (surfaceRows.length > 0) return surfaceRows;

  const lemma = lemmatizeVerb(verb);
  if (lemma === verb) return [];

  return queryVerbRows(lemma, householdId, supabase);
}

// --- Concept: query verb_tool_lookup for a single verb ---

async function queryVerbRows(
  verb: string,
  householdId: number,
  supabase: SupabaseClient,
): Promise<VerbToolMatch[]> {
  const { data } = await supabase
    .from('verb_tool_lookup')
    .select('tool_name, confidence, entity_types')
    .eq('household_id', householdId)
    .eq('verb', verb);

  return (data ?? []) as VerbToolMatch[];
}

// --- Concept: subset matching — row's entity_types ⊆ input entity types ---

function findSubsetMatch(
  rows: VerbToolMatch[],
  inputEntityTypes: readonly EntityType[],
): VerbToolMatch | null {
  const inputSet = new Set(inputEntityTypes);
  const subsetMatches = rows.filter(row =>
    row.entity_types.every(type => inputSet.has(type as EntityType)),
  );

  if (subsetMatches.length === 0) return null;
  return selectMostSpecific(subsetMatches);
}

// --- Concept: verb-only fallback — pick shortest entity_types row ---
// When no entity types resolved, fall back to the most general mapping
// for this verb. Applies a confidence penalty since entity type is unverified.

function findVerbOnlyMatch(rows: VerbToolMatch[]): VerbToolMatch | null {
  if (rows.length === 0) return null;
  return selectLeastSpecific(rows);
}

// --- Concept: assess confidence and determine routing ---

function assessConfidence(
  match: VerbToolMatch,
  input: ClassifyInput,
  verbOnlyFallback: boolean,
): ClassifyOutput {
  let confidence = match.confidence;

  if (verbOnlyFallback) {
    confidence *= (1 - VERB_ONLY_PENALTY);
  }

  // Degrade when unresolved entities would need to be resolved references.
  // If entity_types is empty, unresolved mentions are VALUE params (e.g., title).
  const requiredTypes = match.entity_types.length;
  const excessUnresolved = requiredTypes > 0 && !verbOnlyFallback ? input.unresolvedCount : 0;

  if (excessUnresolved > 0) {
    confidence *= 1 - (excessUnresolved * 0.15);
  }

  const hasDuplicateTypes = hasSameTypedEntities(input.entityTypes);
  const needsLlm = confidence < CONFIDENCE_THRESHOLD || hasDuplicateTypes;

  return {
    toolName: match.tool_name,
    confidence,
    needsLlm,
    // Verb-only matches can still assemble — the unresolved entity
    // will surface in the card for the user to confirm
    canShowCard: !hasDuplicateTypes,
  };
}

// --- Concept: fallback when no verb_tool_lookup match found ---

function buildFallbackOutput(input: ClassifyInput): ClassifyOutput {
  const isStativeVerb = ['is', 'are'].includes(input.verb);
  const confidence = isStativeVerb && input.unresolvedCount > 0 ? 0.2 : 0.3;

  return {
    toolName: null,
    confidence,
    needsLlm: true,
    canShowCard: false,
  };
}

// --- Leaf: select most specific match (longest entity_types array) ---

function selectMostSpecific(matches: VerbToolMatch[]): VerbToolMatch {
  return matches.reduce((best, current) =>
    current.entity_types.length > best.entity_types.length ? current : best,
  );
}

// --- Leaf: select least specific match (shortest entity_types array) ---

function selectLeastSpecific(matches: VerbToolMatch[]): VerbToolMatch {
  return matches.reduce((best, current) =>
    current.entity_types.length < best.entity_types.length ? current : best,
  );
}

// --- Leaf: detect two same-typed entities ---

function hasSameTypedEntities(entityTypes: readonly EntityType[]): boolean {
  return new Set(entityTypes).size < entityTypes.length;
}
