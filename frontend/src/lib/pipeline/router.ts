import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EntityMention, ResolvedEntity,
  PipelineResult, PipelineTrace, StageExecution, StageName,
} from './types';
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
  readonly conversationId?: number;
}

// --- Orchestrator ---

export async function runPipeline(
  text: string,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const executions: StageExecution[] = [];
  const conversationId = options.conversationId ?? 0;

  const extractResult = recordExecution(
    executions, 'extract', conversationId, options.householdId,
    { text, householdId: options.householdId },
    () => extract(
      { text, householdId: options.householdId },
      { lexicon: options.lexicon, referenceDate: options.referenceDate },
    ),
  );

  const resolveResult = await recordExecutionAsync(
    executions, 'resolve', conversationId, options.householdId,
    { entityMentions: extractResult.entityMentions, householdId: options.householdId, verb: extractResult.verb },
    () => resolve(
      { entityMentions: extractResult.entityMentions, householdId: options.householdId, verb: extractResult.verb },
      { supabase: options.supabase },
    ),
  );

  const classifyResult = await recordExecutionAsync(
    executions, 'classify', conversationId, options.householdId,
    {
      verb: extractResult.verb,
      entityTypes: resolveResult.resolved.map(r => r.entityType),
      resolvedCount: resolveResult.resolved.length,
      unresolvedCount: resolveResult.unresolved.length,
    },
    () => classify(
      {
        verb: extractResult.verb,
        entityTypes: resolveResult.resolved.map(r => r.entityType),
        resolvedCount: resolveResult.resolved.length,
        unresolvedCount: resolveResult.unresolved.length,
      },
      { supabase: options.supabase, householdId: options.householdId },
    ),
  );

  if (!classifyResult.canShowCard || !classifyResult.toolName) {
    const trace = buildTrace(text, extractResult, resolveResult, classifyResult.toolName, {});
    return { toolCalls: [], resolvedEntities: resolveResult.resolved, unresolved: resolveResult.unresolved, trace, path: 'llm', stageExecutions: executions, confidence: classifyResult.confidence, validationErrors: [] };
  }

  const assembleInput = {
    toolName: classifyResult.toolName,
    verb: extractResult.verb,
    resolved: resolveResult.resolved,
    unresolved: resolveResult.unresolved,
    dates: extractResult.dates,
    quantities: extractResult.quantities,
  };

  const assembleResult = assemble(assembleInput);

  const validateResult = await recordExecutionAsync(
    executions, 'validate', conversationId, options.householdId,
    { toolCall: assembleResult.toolCalls[0]! },
    () => validate(
      { toolCall: assembleResult.toolCalls[0]! },
      { entityExists: options.entityExists },
    ),
  );

  const toolCall = assembleResult.toolCalls[0];
  const trace = buildTrace(text, extractResult, resolveResult, classifyResult.toolName, toolCall?.params ?? {});

  return {
    toolCalls: assembleResult.toolCalls,
    resolvedEntities: resolveResult.resolved,
    unresolved: resolveResult.unresolved,
    trace,
    path: 'deterministic',
    stageExecutions: executions,
    confidence: classifyResult.confidence,
    validationErrors: validateResult.errors,
  };
}

// --- Concept: record sync stage execution with timing ---

function recordExecution<T extends object>(
  executions: StageExecution[],
  stage: StageName,
  conversationId: number,
  householdId: number,
  inputPayload: object,
  executeStage: () => T,
): T {
  const startMs = performance.now();
  const output = executeStage();
  const durationMs = performance.now() - startMs;

  executions.push(buildExecution(stage, conversationId, householdId, inputPayload, output, durationMs));
  return output;
}

// --- Concept: record async stage execution with timing ---

async function recordExecutionAsync<T extends object>(
  executions: StageExecution[],
  stage: StageName,
  conversationId: number,
  householdId: number,
  inputPayload: object,
  executeStage: () => Promise<T>,
): Promise<T> {
  const startMs = performance.now();
  const output = await executeStage();
  const durationMs = performance.now() - startMs;

  executions.push(buildExecution(stage, conversationId, householdId, inputPayload, output, durationMs));
  return output;
}

// --- Leaf: collect stage outputs into a user-visible trace ---

function buildTrace(
  inputText: string,
  extractResult: { readonly verb: string; readonly entityMentions: readonly EntityMention[] },
  resolveResult: { readonly resolved: readonly ResolvedEntity[]; readonly unresolved: readonly string[] },
  toolName: string | null,
  params: Readonly<Record<string, unknown>>,
): PipelineTrace {
  return {
    inputText,
    verb: extractResult.verb,
    entityMentions: extractResult.entityMentions,
    resolved: resolveResult.resolved,
    unresolved: resolveResult.unresolved,
    toolName,
    params,
  };
}

// --- Leaf: construct StageExecution record ---

function buildExecution(
  stage: StageName,
  conversationId: number,
  householdId: number,
  inputPayload: object,
  outputPayload: object,
  durationMs: number,
): StageExecution {
  return {
    stage,
    inputPayload,
    outputPayload,
    confidence: 0, // populated by caller or downstream
    durationMs: Math.round(durationMs * 100) / 100,
    modelVersion: 'deterministic-v1',
    userVerdict: null,
    conversationId,
    householdId,
  };
}
