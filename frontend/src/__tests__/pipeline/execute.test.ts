import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineResult, ToolCall, StageExecution } from '../../lib/pipeline/types';
import { executeTool, rejectTool } from '../../lib/pipeline/execute';

// --- Mock Supabase that tracks mutations ---

interface MutationRecord {
  readonly table: string;
  readonly operation: 'insert' | 'update';
  readonly payload: unknown;
  readonly filters: Record<string, unknown>;
}

function createMutationTracker() {
  const mutations: MutationRecord[] = [];

  const supabase = {
    from: (table: string) => {
      let currentOp: 'insert' | 'update' = 'insert';
      let currentPayload: unknown = null;
      const filters: Record<string, unknown> = {};

      const chain = {
        insert: (payload: unknown) => {
          currentOp = 'insert';
          currentPayload = payload;
          mutations.push({ table, operation: 'insert', payload, filters: {} });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 1 }, error: null }),
              then: (
                onFulfilled?: (v: { data: unknown[]; error: null }) => unknown,
                onRejected?: (r: unknown) => unknown,
              ) => Promise.resolve({ data: [{ id: 1 }], error: null }).then(onFulfilled, onRejected),
            }),
            then: (
              onFulfilled?: (v: { data: null; error: null }) => unknown,
              onRejected?: (r: unknown) => unknown,
            ) => Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected),
          };
        },
        update: (payload: unknown) => {
          currentOp = 'update';
          currentPayload = payload;
          return {
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              mutations.push({ table, operation: 'update', payload: currentPayload, filters: { ...filters } });
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: val }, error: null }),
                }),
                then: (
                  onFulfilled?: (v: { data: null; error: null }) => unknown,
                  onRejected?: (r: unknown) => unknown,
                ) => Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected),
              };
            },
          };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  return { supabase, mutations };
}

// --- Test data ---

const EMPTY_TRACE = {
  inputText: 'buy milk',
  verb: 'buy',
  entityMentions: [{ text: 'milk', typeHint: 'item' as const }],
  resolved: [{ mention: 'milk', entityId: 1, entityType: 'item' as const, score: 0.95 }],
  unresolved: [],
  toolName: 'update_item',
  params: { item_id: 1, status: 'on_list' },
} as const;

function buildPipelineResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    toolCalls: [{ tool: 'update_item', params: { item_id: 1, status: 'on_list' } }],
    resolvedEntities: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
    trace: EMPTY_TRACE,
    path: 'deterministic',
    stageExecutions: [
      {
        stage: 'extract',
        inputPayload: { text: 'buy milk' },
        outputPayload: { verb: 'buy' },
        confidence: 0,
        durationMs: 1.5,
        modelVersion: 'deterministic-v1',
        userVerdict: null,
        conversationId: 0,
        householdId: 1,
      },
    ],
    confidence: 0.95,
    ...overrides,
  };
}

const DEFAULT_OPTIONS = { householdId: 1 };

// --- Tests ---

describe('executeTool', () => {
  describe('update_item', () => {
    it('updates items table with status and filters by item_id', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = { tool: 'update_item', params: { item_id: 1, status: 'on_list' } };
      const result = buildPipelineResult({ toolCalls: [toolCall] });

      const outcome = await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      expect(outcome.success).toBe(true);
      const itemMutation = mutations.find(m => m.table === 'items' && m.operation === 'update');
      expect(itemMutation).toBeDefined();
      expect(itemMutation!.payload).toEqual({ status: 'on_list' });
      expect(itemMutation!.filters).toEqual({ id: 1 });
    });

    it('separates item_id from update payload', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = {
        tool: 'update_item',
        params: { item_id: 1, status: 'purchased', quantity: 3, unit: 'gallons' },
      };
      const result = buildPipelineResult({ toolCalls: [toolCall] });

      await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      const itemMutation = mutations.find(m => m.table === 'items');
      expect(itemMutation!.payload).toEqual({ status: 'purchased', quantity: 3, unit: 'gallons' });
      expect(itemMutation!.filters).toEqual({ id: 1 });
    });
  });

  describe('create_action', () => {
    it('inserts into actions table with household_id', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = {
        tool: 'create_action',
        params: { title: 'Dentist appointment', starts_at: '2026-04-05T10:00:00' },
      };
      const result = buildPipelineResult({ toolCalls: [toolCall] });

      const outcome = await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      expect(outcome.success).toBe(true);
      const actionMutation = mutations.find(m => m.table === 'actions' && m.operation === 'insert');
      expect(actionMutation).toBeDefined();
      expect(actionMutation!.payload).toEqual({
        title: 'Dentist appointment',
        starts_at: '2026-04-05T10:00:00',
        household_id: 1,
      });
    });
  });

  describe('update_action', () => {
    it('updates actions table filtered by action_id', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = {
        tool: 'update_action',
        params: { action_id: 5, status: 'done' },
      };
      const result = buildPipelineResult({ toolCalls: [toolCall] });

      const outcome = await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      expect(outcome.success).toBe(true);
      const actionMutation = mutations.find(m => m.table === 'actions' && m.operation === 'update');
      expect(actionMutation).toBeDefined();
      expect(actionMutation!.payload).toEqual({ status: 'done' });
      expect(actionMutation!.filters).toEqual({ id: 5 });
    });
  });

  describe('create_recipe', () => {
    it('inserts into recipes table with household_id', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = {
        tool: 'create_recipe',
        params: { name: 'Chicken tikka masala' },
      };
      const result = buildPipelineResult({ toolCalls: [toolCall] });

      const outcome = await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      expect(outcome.success).toBe(true);
      const recipeMutation = mutations.find(m => m.table === 'recipes' && m.operation === 'insert');
      expect(recipeMutation).toBeDefined();
      expect(recipeMutation!.payload).toEqual({
        name: 'Chicken tikka masala',
        household_id: 1,
      });
    });
  });

  describe('create_item', () => {
    it('inserts into items table with household_id', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = {
        tool: 'create_item',
        params: { name: 'Paper towels', status: 'needed' },
      };
      const result = buildPipelineResult({ toolCalls: [toolCall] });

      const outcome = await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      expect(outcome.success).toBe(true);
      const itemMutation = mutations.find(m => m.table === 'items' && m.operation === 'insert');
      expect(itemMutation).toBeDefined();
      expect(itemMutation!.payload).toEqual({
        name: 'Paper towels',
        status: 'needed',
        household_id: 1,
      });
    });
  });

  describe('action_log', () => {
    it('logs execution to action_log with pipeline metadata', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = { tool: 'update_item', params: { item_id: 1, status: 'on_list' } };
      const result = buildPipelineResult({ toolCalls: [toolCall], confidence: 0.95, path: 'deterministic' });

      await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      const logMutation = mutations.find(m => m.table === 'action_log' && m.operation === 'insert');
      expect(logMutation).toBeDefined();
      expect(logMutation!.payload).toMatchObject({
        household_id: 1,
        tool_name: 'update_item',
        tool_params: { item_id: 1, status: 'on_list' },
        status: 'executed',
        pipeline_path: 'deterministic',
        confidence: 0.95,
      });
    });
  });

  describe('stage_executions', () => {
    it('persists stage executions to stage_executions table', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = { tool: 'update_item', params: { item_id: 1, status: 'on_list' } };
      const stageExecution: StageExecution = {
        stage: 'extract',
        inputPayload: { text: 'buy milk' },
        outputPayload: { verb: 'buy' },
        confidence: 0,
        durationMs: 1.5,
        modelVersion: 'deterministic-v1',
        userVerdict: null,
        conversationId: 0,
        householdId: 1,
      };
      const result = buildPipelineResult({ toolCalls: [toolCall], stageExecutions: [stageExecution] });

      await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      const stageMutation = mutations.find(m => m.table === 'stage_executions' && m.operation === 'insert');
      expect(stageMutation).toBeDefined();
      expect(stageMutation!.payload).toEqual([{
        household_id: 1,
        conversation_id: null,
        stage: 'extract',
        input_payload: { text: 'buy milk' },
        output_payload: { verb: 'buy' },
        confidence: 0,
        duration_ms: 2,
        model_version: 'deterministic-v1',
        user_verdict: null,
      }]);
    });
  });

  describe('unknown tool', () => {
    it('returns error for unrecognized tool name', async () => {
      const { supabase } = createMutationTracker();
      const toolCall: ToolCall = { tool: 'unknown_tool', params: {} };
      const result = buildPipelineResult({ toolCalls: [toolCall] });

      const outcome = await executeTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain('unknown_tool');
    });
  });

  describe('rejectTool', () => {
    it('logs rejection to action_log with status rejected', async () => {
      const { supabase, mutations } = createMutationTracker();
      const toolCall: ToolCall = { tool: 'update_item', params: { item_id: 1, status: 'on_list' } };
      const result = buildPipelineResult({ toolCalls: [toolCall], confidence: 0.92, path: 'deterministic' });

      await rejectTool(toolCall, result, { ...DEFAULT_OPTIONS, supabase });

      const logMutation = mutations.find(m => m.table === 'action_log');
      expect(logMutation).toBeDefined();
      expect(logMutation!.payload).toMatchObject({
        household_id: 1,
        tool_name: 'update_item',
        tool_params: { item_id: 1, status: 'on_list' },
        status: 'rejected',
        pipeline_path: 'deterministic',
        confidence: 0.92,
      });
    });
  });
});
