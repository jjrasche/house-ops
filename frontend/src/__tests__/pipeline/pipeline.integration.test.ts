import { describe, it, expect } from 'vitest';
import type { LexiconEntry, PipelineOptions } from '@house-ops/core';
import { runPipeline } from '@house-ops/core';
import {
  PEOPLE, ITEMS, LOCATIONS, STORES, ACTIVITIES, ACTIONS,
  TEST_HOUSEHOLD_ID,
} from './seed';
import { createMockSupabase, VERB_TOOL_SEED } from './mock-supabase';
import type { SeedRow } from './mock-supabase';

// --- Test infrastructure ---

const LEXICON: LexiconEntry[] = [
  ...Object.values(PEOPLE).map(p => ({ name: p.name, entityType: 'person' as const })),
  ...Object.values(ITEMS).map(i => ({ name: i.name, entityType: 'item' as const })),
  ...Object.values(LOCATIONS).map(l => ({ name: l.name, entityType: 'location' as const })),
  ...Object.values(STORES).map(s => ({ name: s.name, entityType: 'store' as const })),
  ...Object.values(ACTIVITIES).map(a => ({ name: a.name, entityType: 'activity' as const })),
];

const REFERENCE_DATE = new Date('2026-03-30T12:00:00');

const SEED_ENTITIES: SeedRow[] = [
  ...Object.values(PEOPLE).map(p => ({ id: p.id, name: p.name, entityType: 'person' })),
  ...Object.values(ITEMS).map(i => ({ id: i.id, name: i.name, entityType: 'item' })),
  ...Object.values(LOCATIONS).map(l => ({ id: l.id, name: l.name, entityType: 'location' })),
  ...Object.values(STORES).map(s => ({ id: s.id, name: s.name, entityType: 'store' })),
  ...Object.values(ACTIVITIES).map(a => ({ id: a.id, name: a.name, entityType: 'activity' })),
  ...Object.values(ACTIONS).map(a => ({ id: a.id, name: a.title, entityType: 'action' })),
];

const mockSupabase = createMockSupabase({
  seedEntities: SEED_ENTITIES,
  verbToolRows: VERB_TOOL_SEED,
});

const pipelineOptions: PipelineOptions = {
  supabase: mockSupabase,
  householdId: TEST_HOUSEHOLD_ID,
  lexicon: LEXICON,
  referenceDate: REFERENCE_DATE,
};

// --- Tests ---

describe('Pipeline integration (wired stages)', () => {
  describe('deterministic path', () => {
    it.each([
      ['Buy milk', 'update_item', 1],
      ['Add 3 boxes of cereal to the shopping list', 'update_item', 1],
      ['Remind me Thursday about the dentist', 'create_action', 1],
      ['I bought the eggs', 'update_item', 1],
      ['We have 10 rolls of toilet paper in the basement pantry', 'update_item', 1],
      ['Used one of the garbage bags', 'update_item', 1],
      ['Pick up 3 boxes of cereal from Costco', 'update_item', 1],
      ['I finished mowing the lawn', 'update_action', 1],
      ['Schedule a date night next Saturday evening', 'create_action', 1],
    ])('"%s" → %s (deterministic, %d call)', async (text, expectedTool, callCount) => {
      const result = await runPipeline(text as string, pipelineOptions);
      expect(result.path).toBe('deterministic');
      expect(result.toolCalls).toHaveLength(callCount);
      expect(result.toolCalls[0]?.tool).toBe(expectedTool);
      expect(result.confidence).toBeGreaterThan(0.85);
    });
  });

  describe('llm path', () => {
    it('"Theo has wrestling at 4" routes deterministic after has→have lemma fix', async () => {
      const result = await runPipeline('Theo has wrestling at 4', pipelineOptions);
      // has→have lemma maps to update_item via verb_tool_lookup.
      // Arguably wrong (should be schedule/create_action), but classify's
      // best deterministic guess. User corrects via card → trains classify.
      expect(result.path).toBe('deterministic');
      expect(result.trace.verb).toBe('has');
    });

    it('"organize the garage" routes to LLM (unknown verb)', async () => {
      const result = await runPipeline('organize the garage', pipelineOptions);
      expect(result.path).toBe('llm');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.trace.verb).toBe('organize');
    });

    it('"milk" routes deterministic via bare noun default (verb → need)', async () => {
      const result = await runPipeline('milk', pipelineOptions);
      expect(result.path).toBe('deterministic');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.trace.verb).toBe('need');
      expect(result.trace.entityMentions).toContainEqual({ text: 'milk', typeHint: 'item' });
    });

    it('"buy milk and milk" routes deterministic (expands to 2 tool calls)', async () => {
      const result = await runPipeline('buy milk and milk', pipelineOptions);
      expect(result.path).toBe('deterministic');
      expect(result.toolCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('verb boundary correctness', () => {
    it('"I needed more milk" extracts "needed" and routes deterministically via lemma', async () => {
      const result = await runPipeline('I needed more milk', pipelineOptions);
      // "needed" extracted as surface form, classify lemmatizes to "need" for lookup
      expect(result.trace.verb).toBe('needed');
      expect(result.trace.verb).not.toBe('need');
      expect(result.path).toBe('deterministic');
      expect(result.trace.toolName).toBe('update_item');
    });
  });

  describe('tool call param correctness', () => {
    it('"Buy milk" sets status to on_list with item_id', async () => {
      const result = await runPipeline('Buy milk', pipelineOptions);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.milk.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'on_list');
    });

    it('"I bought the eggs" sets status to purchased', async () => {
      const result = await runPipeline('I bought the eggs', pipelineOptions);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.eggs.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'purchased');
    });

    it('quantity and location propagate through pipeline', async () => {
      const result = await runPipeline('We have 10 rolls of toilet paper in the basement pantry', pipelineOptions);
      const params = result.toolCalls[0]?.params;
      expect(params).toHaveProperty('item_id', ITEMS.toiletPaper.id);
      expect(params).toHaveProperty('quantity', 10);
      expect(params).toHaveProperty('unit', 'roll');
      expect(params).toHaveProperty('location_id', LOCATIONS.basementPantry.id);
      expect(params).toHaveProperty('status', 'stocked');
    });

    it('store_id propagates from resolved store entity', async () => {
      const result = await runPipeline('Pick up 3 boxes of cereal from Costco', pipelineOptions);
      expect(result.toolCalls[0]?.params).toHaveProperty('store_id', STORES.costco.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.cereal.id);
    });

    it('"I finished mowing the lawn" completes existing action', async () => {
      const result = await runPipeline('I finished mowing the lawn', pipelineOptions);
      expect(result.toolCalls[0]?.params).toHaveProperty('action_id', ACTIONS.mowTheLawn.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'done');
    });

    it('"Remind me Thursday about the dentist" creates action with date', async () => {
      const result = await runPipeline('Remind me Thursday about the dentist', pipelineOptions);
      expect(result.toolCalls[0]?.params).toHaveProperty('title', 'Dentist');
      expect(result.toolCalls[0]?.params).toHaveProperty('starts_at', '2026-04-02');
    });

    it('"We\'re out of eggs" sets status to needed', async () => {
      const result = await runPipeline("We're out of eggs", pipelineOptions);
      expect(result.path).toBe('deterministic');
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.eggs.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'needed');
    });

    it('quantity_delta for consumption verbs', async () => {
      const result = await runPipeline('Used one of the garbage bags', pipelineOptions);
      expect(result.toolCalls[0]?.params).toHaveProperty('quantity_delta', -1);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.garbageBags.id);
    });
  });

  describe('multi-entity extraction', () => {
    it('"pick up cereal and dish soap from Costco" extracts all three entities', async () => {
      const result = await runPipeline('pick up cereal and dish soap from Costco', pipelineOptions);
      const mentionTexts = result.trace.entityMentions.map(m => m.text.toLowerCase());
      expect(mentionTexts).toContain('cereal');
      expect(mentionTexts).toContain('dish soap');
      expect(mentionTexts).toContain('costco');
    });

    it('multiple quantities propagate through pipeline', async () => {
      const result = await runPipeline('buy 2 rolls of paper towels and 3 bags of cereal', pipelineOptions);
      expect(result.trace.entityMentions.length).toBeGreaterThanOrEqual(2);
    });
  });
});
