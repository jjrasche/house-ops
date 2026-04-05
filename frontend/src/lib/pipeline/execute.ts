import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineResult, ToolCall, StageExecution } from './types';

// --- Public types ---

export interface ExecuteOptions {
  readonly supabase: SupabaseClient;
  readonly householdId: number;
  readonly userId?: string;
  readonly conversationId?: number;
}

export interface ExecuteResult {
  readonly success: boolean;
  readonly error?: string;
}

// --- Tool → table mapping ---

interface ToolMutation {
  readonly table: string;
  readonly operation: 'insert' | 'update';
  readonly idParam?: string; // param key that holds the row ID (for updates)
}

const TOOL_MUTATIONS: Readonly<Record<string, ToolMutation>> = {
  update_item: { table: 'items', operation: 'update', idParam: 'item_id' },
  create_action: { table: 'actions', operation: 'insert' },
  update_action: { table: 'actions', operation: 'update', idParam: 'action_id' },
  create_item: { table: 'items', operation: 'insert' },
  create_recipe: { table: 'recipes', operation: 'insert' },
};

// --- Orchestrator ---

export async function executeTool(
  toolCall: ToolCall,
  pipelineResult: PipelineResult,
  options: ExecuteOptions,
): Promise<ExecuteResult> {
  const mutation = TOOL_MUTATIONS[toolCall.tool];
  if (!mutation) {
    return { success: false, error: `Unknown tool: ${toolCall.tool}` };
  }

  const mutationResult = mutation.operation === 'update'
    ? await applyUpdate(options.supabase, mutation, toolCall.params)
    : await applyInsert(options.supabase, mutation, toolCall.params, options.householdId);

  if (!mutationResult.success) {
    return mutationResult;
  }

  await logExecution(options.supabase, toolCall, pipelineResult, options);
  await persistStageExecutions(options.supabase, pipelineResult.stageExecutions);

  return { success: true };
}

// --- Concept: apply update mutation (separate ID from payload) ---

async function applyUpdate(
  supabase: SupabaseClient,
  mutation: ToolMutation,
  params: Record<string, unknown>,
): Promise<ExecuteResult> {
  const idParam = mutation.idParam!;
  const rowId = params[idParam];
  const payload = separateIdFromPayload(params, idParam);

  const { error } = await supabase
    .from(mutation.table)
    .update(payload)
    .eq('id', rowId);

  return error
    ? { success: false, error: error.message }
    : { success: true };
}

// --- Concept: apply insert mutation (add household_id) ---

async function applyInsert(
  supabase: SupabaseClient,
  mutation: ToolMutation,
  params: Record<string, unknown>,
  householdId: number,
): Promise<ExecuteResult> {
  const payload = { ...params, household_id: householdId };

  const { error } = await supabase
    .from(mutation.table)
    .insert(payload);

  return error
    ? { success: false, error: error.message }
    : { success: true };
}

// --- Concept: log tool execution to action_log ---

async function logExecution(
  supabase: SupabaseClient,
  toolCall: ToolCall,
  pipelineResult: PipelineResult,
  options: ExecuteOptions,
): Promise<void> {
  await supabase.from('action_log').insert({
    household_id: options.householdId,
    user_id: options.userId ?? null,
    conversation_id: options.conversationId ?? null,
    tool_name: toolCall.tool,
    tool_params: toolCall.params,
    status: 'executed',
    pipeline_path: pipelineResult.path,
    confidence: pipelineResult.confidence,
  });
}

// --- Concept: persist stage executions to DB ---

async function persistStageExecutions(
  supabase: SupabaseClient,
  executions: readonly StageExecution[],
): Promise<void> {
  if (executions.length === 0) return;

  const rows = executions.map(formatStageRow);
  await supabase.from('stage_executions').insert(rows);
}

// --- Concept: log rejection to action_log ---

export async function rejectTool(
  toolCall: ToolCall,
  pipelineResult: PipelineResult,
  options: ExecuteOptions,
): Promise<void> {
  await options.supabase.from('action_log').insert({
    household_id: options.householdId,
    user_id: options.userId ?? null,
    conversation_id: options.conversationId ?? null,
    tool_name: toolCall.tool,
    tool_params: toolCall.params,
    status: 'rejected',
    pipeline_path: pipelineResult.path,
    confidence: pipelineResult.confidence,
  });
}

// --- Leaf: remove ID param from update payload ---

function separateIdFromPayload(
  params: Record<string, unknown>,
  idParam: string,
): Record<string, unknown> {
  const { [idParam]: _, ...rest } = params;
  return rest;
}

// --- Leaf: convert StageExecution to DB row shape ---

function formatStageRow(execution: StageExecution) {
  return {
    household_id: execution.householdId,
    conversation_id: execution.conversationId || null,
    stage: execution.stage,
    input_payload: execution.inputPayload,
    output_payload: execution.outputPayload,
    confidence: execution.confidence,
    duration_ms: Math.round(execution.durationMs),
    model_version: execution.modelVersion,
    user_verdict: execution.userVerdict,
  };
}
