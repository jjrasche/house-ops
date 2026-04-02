import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassifyInput, ClassifyOutput, EntityType } from './types';

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

// --- Orchestrator ---

export async function classify(
  input: ClassifyInput,
  options: ClassifyOptions,
): Promise<ClassifyOutput> {
  const match = await lookupVerbTool(
    input.verb, input.entityTypes, options.householdId, options.supabase,
  );

  if (!match) {
    return buildFallbackOutput(input);
  }

  return assessConfidence(match, input);
}

// --- Concept: query verb_tool_lookup with subset matching ---
// Fetches all rows for verb+household, then filters in code:
// row's entity_types must be a subset of input entity types.
// Returns the most specific match (longest entity_types array).

async function lookupVerbTool(
  verb: string,
  inputEntityTypes: readonly EntityType[],
  householdId: number,
  supabase: SupabaseClient,
): Promise<VerbToolMatch | null> {
  const { data } = await supabase
    .from('verb_tool_lookup')
    .select('tool_name, confidence, entity_types')
    .eq('household_id', householdId)
    .eq('verb', verb);

  const rows = (data ?? []) as VerbToolMatch[];
  const inputSet = new Set(inputEntityTypes);
  const subsetMatches = rows.filter(row =>
    row.entity_types.every(type => inputSet.has(type as EntityType)),
  );

  if (subsetMatches.length === 0) return null;

  return selectMostSpecific(subsetMatches);
}

// --- Concept: assess confidence and determine routing ---
// Degrades confidence when unresolved entities exceed what the tool expects.
// Tools with empty entity_types (e.g., "remind" → create_action) don't need
// resolved entities — unresolved mentions become VALUE params like title.

function assessConfidence(
  match: VerbToolMatch,
  input: ClassifyInput,
): ClassifyOutput {
  let confidence = match.confidence;

  // Only degrade when unresolved entities would need to be resolved references.
  // If the tool requires entity types, unresolved entities are a problem.
  // If entity_types is empty, unresolved mentions are VALUE params (e.g., title).
  const requiredTypes = match.entity_types.length;
  const excessUnresolved = requiredTypes > 0 ? input.unresolvedCount : 0;

  if (excessUnresolved > 0) {
    confidence *= 1 - (excessUnresolved * 0.15);
  }

  const hasDuplicateTypes = hasSameTypedEntities(input.entityTypes);
  const needsLlm = confidence < CONFIDENCE_THRESHOLD || hasDuplicateTypes;

  return {
    toolName: match.tool_name,
    confidence,
    needsLlm,
    canAssemble: !needsLlm,
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
    canAssemble: false,
  };
}

// --- Leaf: select most specific match (longest entity_types array) ---

function selectMostSpecific(matches: VerbToolMatch[]): VerbToolMatch {
  return matches.reduce((best, current) =>
    current.entity_types.length > best.entity_types.length ? current : best,
  );
}

// --- Leaf: detect two same-typed entities ---

function hasSameTypedEntities(entityTypes: readonly EntityType[]): boolean {
  return new Set(entityTypes).size < entityTypes.length;
}
