import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineResult } from './types';
import type { LexiconEntry } from './extract';
import type { ValidateOptions } from './validate';
import { extract } from './extract';
import { resolve } from './resolve';
import { classify } from './classify';
import { assemble } from './assemble';
import { validate } from './validate';

// --- Public types ---

export interface PipelineOptions {
  readonly supabase: SupabaseClient;
  readonly householdId: number;
  readonly lexicon: readonly LexiconEntry[];
  readonly referenceDate?: Date;
  readonly entityExists?: ValidateOptions['entityExists'];
}

// --- Orchestrator ---

export async function runPipeline(
  text: string,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const extractResult = extract(
    { text, householdId: options.householdId },
    { lexicon: options.lexicon, referenceDate: options.referenceDate },
  );

  const resolveResult = await resolve(
    { entityMentions: extractResult.entityMentions, householdId: options.householdId, verb: extractResult.verb },
    { supabase: options.supabase },
  );

  const classifyResult = await classify(
    {
      verb: extractResult.verb,
      entityTypes: resolveResult.resolved.map(r => r.entityType),
      resolvedCount: resolveResult.resolved.length,
      unresolvedCount: resolveResult.unresolved.length,
    },
    { supabase: options.supabase, householdId: options.householdId },
  );

  if (classifyResult.needsLlm || !classifyResult.toolName) {
    return { toolCalls: [], path: 'llm', stageExecutions: [], confidence: classifyResult.confidence };
  }

  const assembleResult = assemble({
    toolName: classifyResult.toolName,
    verb: extractResult.verb,
    resolved: resolveResult.resolved,
    unresolved: resolveResult.unresolved,
    dates: extractResult.dates,
    quantities: extractResult.quantities,
  });

  const validateResult = await validate(
    { toolCall: assembleResult.toolCalls[0]! },
    { entityExists: options.entityExists },
  );

  return {
    toolCalls: validateResult.isValid ? assembleResult.toolCalls : [],
    path: 'deterministic',
    stageExecutions: [],
    confidence: validateResult.isValid ? classifyResult.confidence : 0,
  };
}
