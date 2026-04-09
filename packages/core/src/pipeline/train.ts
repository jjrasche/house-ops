import type { SupabaseClient } from '@supabase/supabase-js';
import type { Correction, PipelineTrace, ResolvedEntity } from './types';

// --- Public types ---

export interface TrainOptions {
  readonly supabase: SupabaseClient;
  readonly householdId: number;
}

// --- Constants ---

const USER_CONFIRMED_CONFIDENCE = 0.90;

// --- Orchestrator ---

export async function applyCorrection(
  correction: Correction,
  trace: PipelineTrace,
  options: TrainOptions,
): Promise<void> {
  switch (correction.stage) {
    case 'extract':
      if (correction.addedAlias) {
        await trainExtractAlias(options.supabase, options.householdId, correction.addedAlias);
      }
      break;
    case 'resolve':
      await trainResolvePreference(options.supabase, options.householdId, trace.verb, correction);
      break;
    case 'classify':
      await trainClassifyMapping(options.supabase, options.householdId, trace, correction.toolName);
      break;
    case 'assemble':
      await trainAssembleExample(options.supabase, options.householdId, trace, correction.params);
      break;
  }
}

// --- Concept: add surface form to entity lexicon ---

async function trainExtractAlias(
  supabase: SupabaseClient,
  householdId: number,
  alias: { readonly surfaceForm: string; readonly entityType: string; readonly entityId: number },
): Promise<void> {
  const { error } = await supabase.from('entity_lexicon').insert({
    household_id: householdId,
    surface_form: alias.surfaceForm,
    entity_type: alias.entityType,
    entity_id: alias.entityId,
    source: 'user_confirmed',
  });
  if (error) throw new Error(`Training failed on entity_lexicon: ${error.message}`);
}

// --- Concept: save verb+mention → preferred entity rule ---

async function trainResolvePreference(
  supabase: SupabaseClient,
  householdId: number,
  verb: string,
  correction: { readonly mention: string; readonly preferredId: number; readonly preferredType: string },
): Promise<void> {
  const { error } = await supabase.from('resolution_context_rules').upsert({
    household_id: householdId,
    verb: verb.toLowerCase(),
    mention: correction.mention.toLowerCase(),
    preferred_id: correction.preferredId,
    preferred_type: correction.preferredType,
    source: 'user_confirmed',
  }, { onConflict: 'household_id,verb,mention' });
  if (error) throw new Error(`Training failed on resolution_context_rules: ${error.message}`);
}

// --- Concept: save corrected verb → tool mapping ---

async function trainClassifyMapping(
  supabase: SupabaseClient,
  householdId: number,
  trace: PipelineTrace,
  correctedToolName: string,
): Promise<void> {
  const entityTypes = buildSortedEntityTypes(trace.resolved);

  const { error } = await supabase.from('verb_tool_lookup').insert({
    household_id: householdId,
    verb: trace.verb,
    entity_types: entityTypes,
    tool_name: correctedToolName,
    confidence: USER_CONFIRMED_CONFIDENCE,
    source: 'user_confirmed',
  });
  if (error) throw new Error(`Training failed on verb_tool_lookup: ${error.message}`);
}

// --- Concept: save corrected tool call as example ---

async function trainAssembleExample(
  supabase: SupabaseClient,
  householdId: number,
  trace: PipelineTrace,
  correctedParams: Readonly<Record<string, unknown>>,
): Promise<void> {
  const { error } = await supabase.from('tool_call_examples').insert({
    household_id: householdId,
    input_text: trace.inputText,
    verb: trace.verb,
    tool_name: trace.toolName,
    tool_params: correctedParams,
    source: 'user_confirmed',
  });
  if (error) throw new Error(`Training failed on tool_call_examples: ${error.message}`);
}

// --- Leaf: extract sorted entity type array from resolved entities ---

function buildSortedEntityTypes(resolved: readonly ResolvedEntity[]): string[] {
  return [...new Set(resolved.map(e => e.entityType))].sort();
}
