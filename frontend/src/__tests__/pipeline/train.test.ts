import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineTrace, Correction } from '../../lib/pipeline/types';
import { applyCorrection } from '../../lib/pipeline/train';

// --- Mutation-tracking mock (same pattern as execute.test.ts) ---

interface MutationRecord {
  readonly table: string;
  readonly operation: 'insert';
  readonly payload: unknown;
}

function createMutationTracker() {
  const mutations: MutationRecord[] = [];

  const supabase = {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        mutations.push({ table, operation: 'insert', payload });
        return {
          then: (
            onFulfilled?: (v: { data: null; error: null }) => unknown,
            onRejected?: (r: unknown) => unknown,
          ) => Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected),
        };
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
    it('inserts into resolution_context_rules', async () => {
      const { supabase, mutations } = createMutationTracker();
      const correction: Correction = {
        stage: 'resolve',
        mention: 'Charlie',
        preferredId: 5,
        preferredType: 'person',
      };
      const trace = buildTrace({ verb: 'feed' });

      await applyCorrection(correction, trace, { ...DEFAULT_OPTIONS, supabase });

      const ruleInsert = mutations.find(m => m.table === 'resolution_context_rules');
      expect(ruleInsert).toBeDefined();
      expect(ruleInsert!.payload).toEqual({
        household_id: 1,
        verb: 'feed',
        mention: 'charlie',
        preferred_id: 5,
        preferred_type: 'person',
        source: 'user_confirmed',
      });
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
});
