import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineTrace, Correction } from '@house-ops/core';
import { applyCorrection } from '@house-ops/core';

// --- Mutation-tracking mock (same pattern as execute.test.ts) ---

interface MutationRecord {
  readonly table: string;
  readonly operation: 'insert' | 'upsert';
  readonly payload: unknown;
  readonly options?: unknown;
}

function createMutationTracker(errorTable?: string) {
  const mutations: MutationRecord[] = [];

  function buildThenable(table: string) {
    const willError = table === errorTable;
    const result = willError
      ? { data: null, error: { message: `Insert failed on ${table}` } }
      : { data: null, error: null };
    return {
      then: (
        onFulfilled?: (v: typeof result) => unknown,
        onRejected?: (r: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
  }

  const supabase = {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        mutations.push({ table, operation: 'insert', payload });
        return buildThenable(table);
      },
      upsert: (payload: unknown, options?: unknown) => {
        mutations.push({ table, operation: 'upsert', payload, options });
        return buildThenable(table);
      },
    }),
  } as unknown as SupabaseClient;

  return { supabase, mutations };
}

// --- Test data ---

function buildTrace(overrides: Partial<PipelineTrace> = {}): PipelineTrace {
  return {
    inputText: 'Buy milk',
    verb: 'buy',
    entityMentions: [{ text: 'milk', typeHint: 'item' }],
    resolved: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
    unresolved: [],
    toolName: 'update_item',
    params: { item_id: 1, status: 'on_list' },
    ...overrides,
  };
}

const DEFAULT_OPTIONS = { householdId: 1 };

// --- Tests ---

describe('applyCorrection', () => {
  describe('extract correction — new alias', () => {
    it('inserts into entity_lexicon with user_confirmed source', async () => {
      const { supabase, mutations } = createMutationTracker();
      const correction: Correction = {
        stage: 'extract',
        addedAlias: { surfaceForm: 'oat milk', entityType: 'item', entityId: 1 },
      };

      await applyCorrection(correction, buildTrace(), { ...DEFAULT_OPTIONS, supabase });

      const lexiconInsert = mutations.find(m => m.table === 'entity_lexicon');
      expect(lexiconInsert).toBeDefined();
      expect(lexiconInsert!.payload).toEqual({
        household_id: 1,
        surface_form: 'oat milk',
        entity_type: 'item',
        entity_id: 1,
        source: 'user_confirmed',
      });
    });
  });

  describe('resolve correction — preferred entity', () => {
    it('upserts into resolution_context_rules with onConflict', async () => {
      const { supabase, mutations } = createMutationTracker();
      const correction: Correction = {
        stage: 'resolve',
        mention: 'Charlie',
        preferredId: 5,
        preferredType: 'person',
      };
      const trace = buildTrace({ verb: 'feed' });

      await applyCorrection(correction, trace, { ...DEFAULT_OPTIONS, supabase });

      const ruleUpsert = mutations.find(m => m.table === 'resolution_context_rules');
      expect(ruleUpsert).toBeDefined();
      expect(ruleUpsert!.operation).toBe('upsert');
      expect(ruleUpsert!.payload).toEqual({
        household_id: 1,
        verb: 'feed',
        mention: 'charlie',
        preferred_id: 5,
        preferred_type: 'person',
        source: 'user_confirmed',
      });
      expect(ruleUpsert!.options).toEqual({ onConflict: 'household_id,verb,mention' });
    });
  });

  describe('classify correction — wrong tool', () => {
    it('inserts into verb_tool_lookup with corrected tool', async () => {
      const { supabase, mutations } = createMutationTracker();
      const correction: Correction = {
        stage: 'classify',
        toolName: 'create_action',
      };
      const trace = buildTrace({
        verb: 'grab',
        resolved: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
      });

      await applyCorrection(correction, trace, { ...DEFAULT_OPTIONS, supabase });

      const vtlInsert = mutations.find(m => m.table === 'verb_tool_lookup');
      expect(vtlInsert).toBeDefined();
      expect(vtlInsert!.payload).toEqual({
        household_id: 1,
        verb: 'grab',
        entity_types: ['item'],
        tool_name: 'create_action',
        confidence: 0.90,
        source: 'user_confirmed',
      });
    });

    it('sorts entity_types alphabetically', async () => {
      const { supabase, mutations } = createMutationTracker();
      const correction: Correction = { stage: 'classify', toolName: 'update_item' };
      const trace = buildTrace({
        verb: 'pick up',
        resolved: [
          { mention: 'Costco', entityId: 101, entityType: 'store', score: 1.0 },
          { mention: 'cereal', entityId: 3, entityType: 'item', score: 0.92 },
        ],
      });

      await applyCorrection(correction, trace, { ...DEFAULT_OPTIONS, supabase });

      const vtlInsert = mutations.find(m => m.table === 'verb_tool_lookup');
      expect((vtlInsert!.payload as Record<string, unknown>).entity_types).toEqual(['item', 'store']);
    });
  });

  describe('assemble correction — wrong params', () => {
    it('inserts into tool_call_examples with corrected params', async () => {
      const { supabase, mutations } = createMutationTracker();
      const correction: Correction = {
        stage: 'assemble',
        params: { item_id: 1, status: 'needed' },
      };
      const trace = buildTrace({ toolName: 'update_item' });

      await applyCorrection(correction, trace, { ...DEFAULT_OPTIONS, supabase });

      const exampleInsert = mutations.find(m => m.table === 'tool_call_examples');
      expect(exampleInsert).toBeDefined();
      expect(exampleInsert!.payload).toEqual({
        household_id: 1,
        input_text: 'Buy milk',
        verb: 'buy',
        tool_name: 'update_item',
        tool_params: { item_id: 1, status: 'needed' },
        source: 'user_confirmed',
      });
    });
  });

  describe('error propagation', () => {
    it('throws when entity_lexicon insert fails', async () => {
      const { supabase } = createMutationTracker('entity_lexicon');
      const correction: Correction = {
        stage: 'extract',
        addedAlias: { surfaceForm: 'oat milk', entityType: 'item', entityId: 1 },
      };

      await expect(
        applyCorrection(correction, buildTrace(), { ...DEFAULT_OPTIONS, supabase }),
      ).rejects.toThrow('entity_lexicon');
    });

    it('throws when resolution_context_rules upsert fails', async () => {
      const { supabase } = createMutationTracker('resolution_context_rules');
      const correction: Correction = {
        stage: 'resolve',
        mention: 'Charlie',
        preferredId: 5,
        preferredType: 'person',
      };

      await expect(
        applyCorrection(correction, buildTrace({ verb: 'feed' }), { ...DEFAULT_OPTIONS, supabase }),
      ).rejects.toThrow('resolution_context_rules');
    });

    it('throws when verb_tool_lookup insert fails', async () => {
      const { supabase } = createMutationTracker('verb_tool_lookup');
      const correction: Correction = {
        stage: 'classify',
        toolName: 'create_action',
      };

      await expect(
        applyCorrection(correction, buildTrace(), { ...DEFAULT_OPTIONS, supabase }),
      ).rejects.toThrow('verb_tool_lookup');
    });

    it('throws when tool_call_examples insert fails', async () => {
      const { supabase } = createMutationTracker('tool_call_examples');
      const correction: Correction = {
        stage: 'assemble',
        params: { item_id: 1, status: 'needed' },
      };

      await expect(
        applyCorrection(correction, buildTrace(), { ...DEFAULT_OPTIONS, supabase }),
      ).rejects.toThrow('tool_call_examples');
    });
  });
});
