import { describe, it, expect } from 'vitest';
import type { ClassifyInput, EntityType } from '../../lib/pipeline/types';
import { classify } from '../../lib/pipeline/classify';
import type { ClassifyOptions } from '../../lib/pipeline/classify';
import { createMockSupabase, VERB_TOOL_SEED } from './mock-supabase';
import type { VerbToolRow } from './mock-supabase';
import { TEST_HOUSEHOLD_ID } from './seed';

function makeOptions(verbToolRows: readonly VerbToolRow[] = VERB_TOOL_SEED): ClassifyOptions {
  return {
    supabase: createMockSupabase({ verbToolRows }),
    householdId: TEST_HOUSEHOLD_ID,
  };
}

function makeInput(
  verb: string,
  entityTypes: EntityType[],
  unresolvedCount = 0,
): ClassifyInput {
  return {
    verb,
    entityTypes,
    resolvedCount: entityTypes.length,
    unresolvedCount,
  };
}

describe('CLASSIFY stage', () => {
  describe('verb + entity type → tool mapping', () => {
    it.each([
      ['buy',       ['item'] as EntityType[],              'update_item',   0.95],
      ['add',       ['item'] as EntityType[],              'update_item',   0.93],
      ['need',      ['item'] as EntityType[],              'update_item',   0.94],
      ['bought',    ['item'] as EntityType[],              'update_item',   0.94],
      ['purchased', ['item'] as EntityType[],              'update_item',   0.94],
      ['have',      ['item', 'location'] as EntityType[],  'update_item',   0.92],
      ['used',      ['item'] as EntityType[],              'update_item',   0.92],
      ['pick up',   ['item', 'store'] as EntityType[],     'update_item',   0.95],
      ['out of',    ['item'] as EntityType[],              'update_item',   0.90],
      ['remind',    [] as EntityType[],                    'create_action', 0.93],
      ['schedule',  [] as EntityType[],                    'create_action', 0.93],
      ['create',    [] as EntityType[],                    'create_action', 0.90],
      ['finished',  ['action'] as EntityType[],            'update_action', 0.92],
      ['completed', ['action'] as EntityType[],            'update_action', 0.92],
      ['done',      ['action'] as EntityType[],            'update_action', 0.92],
      ['save',      [] as EntityType[],                    'create_recipe', 0.88],
    ])(
      'verb="%s" + types=%j → tool=%s at confidence=%s',
      async (verb, entityTypes, expectedTool, expectedConfidence) => {
        const output = await classify(
          makeInput(verb, entityTypes),
          makeOptions(),
        );
        expect(output.toolName).toBe(expectedTool);
        expect(output.confidence).toBe(expectedConfidence);
        expect(output.needsLlm).toBe(expectedConfidence < 0.85);
        expect(output.canShowCard).toBe(expectedConfidence >= 0.85);
      },
    );
  });

  describe('subset matching', () => {
    it('"remind" with entityTypes: ["person"] still matches {} row', async () => {
      const output = await classify(
        makeInput('remind', ['person']),
        makeOptions(),
      );
      expect(output.toolName).toBe('create_action');
      expect(output.confidence).toBe(0.93);
    });

    it('"pick up" with [item] matches {item} row at 0.90, not {item,store}', async () => {
      const output = await classify(
        makeInput('pick up', ['item']),
        makeOptions(),
      );
      expect(output.toolName).toBe('update_item');
      expect(output.confidence).toBe(0.90);
    });
  });

  describe('specificity ranking', () => {
    it('"pick up" with [item, store] matches {item,store} at 0.95, not {item} at 0.90', async () => {
      const output = await classify(
        makeInput('pick up', ['item', 'store']),
        makeOptions(),
      );
      expect(output.toolName).toBe('update_item');
      expect(output.confidence).toBe(0.95);
    });
  });

  describe('confidence degradation', () => {
    it('one unresolved entity degrades confidence by 15%', async () => {
      const output = await classify(
        makeInput('buy', ['item'], 1),
        makeOptions(),
      );
      expect(output.confidence).toBeCloseTo(0.95 * 0.85, 5);
      expect(output.needsLlm).toBe(true);
    });

    it('two unresolved entities degrade confidence further', async () => {
      const output = await classify(
        makeInput('buy', ['item'], 2),
        makeOptions(),
      );
      expect(output.confidence).toBeCloseTo(0.95 * 0.70, 5);
      expect(output.needsLlm).toBe(true);
    });

    it('empty entity_types tool ignores unresolved (VALUE params like title)', async () => {
      const output = await classify(
        makeInput('remind', [], 1),
        makeOptions(),
      );
      expect(output.confidence).toBe(0.93);
      expect(output.needsLlm).toBe(false);
    });

    it('zero unresolved preserves seed confidence', async () => {
      const output = await classify(
        makeInput('buy', ['item'], 0),
        makeOptions(),
      );
      expect(output.confidence).toBe(0.95);
      expect(output.needsLlm).toBe(false);
    });
  });

  describe('LLM routing', () => {
    it('unknown verb falls through to LLM', async () => {
      const output = await classify(
        makeInput('juggle', ['item']),
        makeOptions(),
      );
      expect(output.toolName).toBeNull();
      expect(output.needsLlm).toBe(true);
      expect(output.confidence).toBe(0.3);
    });

    it('stative verb "is" with unresolved entities gets lowest confidence', async () => {
      const output = await classify(
        makeInput('is', [], 2),
        makeOptions(),
      );
      expect(output.toolName).toBeNull();
      expect(output.confidence).toBeLessThanOrEqual(0.2);
      expect(output.needsLlm).toBe(true);
    });

    it('"are" routes to LLM (no verb_tool_lookup match)', async () => {
      const output = await classify(
        makeInput('are', ['item']),
        makeOptions(),
      );
      expect(output.needsLlm).toBe(true);
    });

    it('two same-typed entities route to LLM despite tool match', async () => {
      const output = await classify(
        makeInput('need', ['item', 'item']),
        makeOptions(),
      );
      expect(output.needsLlm).toBe(true);
      expect(output.canShowCard).toBe(false);
    });
  });

  describe('verb-only fallback for unresolved entities', () => {
    it('"add" with no resolved entities falls back to update_item via verb-only', async () => {
      const output = await classify(
        makeInput('add', [], 1),
        makeOptions(),
      );
      expect(output.toolName).toBe('update_item');
      expect(output.canShowCard).toBe(true);
    });

    it('verb-only fallback applies heavier confidence penalty', async () => {
      const output = await classify(
        makeInput('add', [], 1),
        makeOptions(),
      );
      // Base 0.93, penalized for verb-only + unresolved
      expect(output.confidence).toBeLessThan(0.85);
      expect(output.confidence).toBeGreaterThan(0.5);
    });

    it('"buy" with no resolved entities falls back to update_item', async () => {
      const output = await classify(
        makeInput('buy', [], 1),
        makeOptions(),
      );
      expect(output.toolName).toBe('update_item');
      expect(output.canShowCard).toBe(true);
    });

    it('"remind" with no resolved entities still uses normal path (entity_types is empty)', async () => {
      const output = await classify(
        makeInput('remind', [], 1),
        makeOptions(),
      );
      // "remind" has entity_types=[], so subset match succeeds normally
      expect(output.toolName).toBe('create_action');
      expect(output.confidence).toBe(0.93);
    });

    it('unknown verb with no resolved entities still routes to LLM', async () => {
      const output = await classify(
        makeInput('juggle', [], 1),
        makeOptions(),
      );
      expect(output.toolName).toBeNull();
      expect(output.needsLlm).toBe(true);
    });

    it('verb-only fallback picks the most common tool for the verb', async () => {
      // "pick up" has two entries: {item,store} and {item}
      // Both require "item", neither subset-matches empty input
      // Verb-only should pick one of them
      const output = await classify(
        makeInput('pick up', [], 1),
        makeOptions(),
      );
      expect(output.toolName).toBe('update_item');
      expect(output.canShowCard).toBe(true);
    });
  });

  describe('household isolation', () => {
    it('household 2 mappings do not appear for household 1', async () => {
      const customSeed: VerbToolRow[] = [
        ...VERB_TOOL_SEED,
        { household_id: 2, verb: 'buy', entity_types: ['item'], tool_name: 'custom_buy', confidence: 0.99, source: 'seed' },
      ];
      const output = await classify(
        makeInput('buy', ['item']),
        makeOptions(customSeed),
      );
      expect(output.toolName).toBe('update_item');
      expect(output.confidence).toBe(0.95);
    });

    it('household 2 sees its own mappings', async () => {
      const customSeed: VerbToolRow[] = [
        ...VERB_TOOL_SEED,
        { household_id: 2, verb: 'buy', entity_types: ['item'], tool_name: 'custom_buy', confidence: 0.99, source: 'seed' },
      ];
      const output = await classify(
        makeInput('buy', ['item']),
        { supabase: createMockSupabase({ verbToolRows: customSeed }), householdId: 2 },
      );
      expect(output.toolName).toBe('custom_buy');
      expect(output.confidence).toBe(0.99);
    });
  });
});
