import { describe, it, expect } from 'vitest';
import type {
  ExtractOutput,
  ResolveOutput,
  ClassifyOutput,
  ValidateOutput,
  PipelineResult,
  EntityMention,
  ToolCall,
} from '../../lib/pipeline/types';
import { extract } from '../../lib/pipeline/extract';
import type { LexiconEntry } from '../../lib/pipeline/extract';
import { resolve } from '../../lib/pipeline/resolve';
import { classify } from '../../lib/pipeline/classify';
import {
  PEOPLE, ITEMS, LOCATIONS, STORES, ACTIVITIES, ACTIONS,
  TEST_HOUSEHOLD_ID,
} from './seed';
import { createMockSupabase, VERB_TOOL_SEED } from './mock-supabase';
import type { SeedRow } from './mock-supabase';

// --- Real EXTRACT + RESOLVE + CLASSIFY, stubs for ASSEMBLE/VALIDATE ---

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

function stageExtract(text: string): ExtractOutput {
  return extract(
    { text, householdId: TEST_HOUSEHOLD_ID },
    { lexicon: LEXICON, referenceDate: REFERENCE_DATE },
  );
}

async function stageResolve(mentions: readonly EntityMention[], verb: string): Promise<ResolveOutput> {
  return resolve(
    { entityMentions: mentions, householdId: TEST_HOUSEHOLD_ID, verb },
    { supabase: mockSupabase },
  );
}

async function stageClassify(verb: string, resolveResult: ResolveOutput): Promise<ClassifyOutput> {
  return classify(
    {
      verb,
      entityTypes: resolveResult.resolved.map(r => r.entityType),
      resolvedCount: resolveResult.resolved.length,
      unresolvedCount: resolveResult.unresolved.length,
    },
    { supabase: mockSupabase, householdId: TEST_HOUSEHOLD_ID },
  );
}

// ASSEMBLE: map resolved entities to tool params
function stageAssemble(
  toolName: string,
  resolveResult: ResolveOutput,
  extractResult: ExtractOutput,
): ToolCall[] {
  const params: Record<string, unknown> = {};

  for (const entity of resolveResult.resolved) {
    if (entity.entityType === 'item') params.item_id = entity.entityId;
    if (entity.entityType === 'location') params.location_id = entity.entityId;
    if (entity.entityType === 'person') params.person_id = entity.entityId;
    if (entity.entityType === 'store') params.store_id = entity.entityId;
    if (entity.entityType === 'action') params.action_id = entity.entityId;
  }

  // Status inference from verb
  const verbStatusMap: Record<string, string> = {
    buy: 'on_list', add: 'on_list', need: 'needed', 'pick up': 'on_list',
    bought: 'purchased', have: 'stocked', finished: 'done', 'out of': 'needed',
  };
  const status = verbStatusMap[extractResult.verb];
  if (status) params.status = status;

  // Quantities
  if (extractResult.quantities.length > 0) {
    const q = extractResult.quantities[0]!;
    if (extractResult.verb === 'used') {
      params.quantity_delta = -q.value;
    } else if (status === 'stocked') {
      params.quantity = q.value;
      params.unit = q.unit;
    } else {
      params.quantity_needed = q.value;
      params.unit = q.unit;
    }
  }

  // Dates → starts_at for actions
  if (extractResult.dates.length > 0 && toolName.includes('action')) {
    params.starts_at = extractResult.dates[0]!.parsed;
  }

  // Title for create_action from unresolved mentions
  if (toolName === 'create_action' && resolveResult.unresolved.length > 0) {
    params.title = capitalize(resolveResult.unresolved[0]!);
  }

  return [{ tool: toolName, params }];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// VALIDATE: schema + FK check
const REQUIRED_PARAMS: Record<string, string[]> = {
  update_item: ['item_id'],
  create_action: ['title'],
  update_action: ['action_id'],
};

function stageValidate(toolCall: ToolCall): ValidateOutput {
  const required = REQUIRED_PARAMS[toolCall.tool];
  if (!required) return { isValid: false, errors: [`Unknown tool: ${toolCall.tool}`], confidence: 0 };

  const missing = required.filter(p => !(p in toolCall.params));
  if (missing.length > 0) {
    return { isValid: false, errors: missing.map(p => `Missing: ${p}`), confidence: 0 };
  }
  return { isValid: true, errors: [], confidence: 0.92 };
}

// --- Pipeline orchestrator (wires stages) ---

async function runPipeline(text: string, householdId: number): Promise<PipelineResult> {
  const extractResult = stageExtract(text);
  const resolveResult = await stageResolve(extractResult.entityMentions, extractResult.verb);
  const classifyResult = await stageClassify(extractResult.verb, resolveResult);

  if (classifyResult.needsLlm || !classifyResult.toolName) {
    return { toolCalls: [], path: 'llm', stageExecutions: [], confidence: classifyResult.confidence };
  }

  const toolCalls = stageAssemble(classifyResult.toolName, resolveResult, extractResult);
  const validateResult = stageValidate(toolCalls[0]!);

  return {
    toolCalls: validateResult.isValid ? toolCalls : [],
    path: 'deterministic',
    stageExecutions: [],
    confidence: validateResult.isValid ? classifyResult.confidence : 0,
  };
}

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
      const result = await runPipeline(text as string, TEST_HOUSEHOLD_ID);
      expect(result.path).toBe('deterministic');
      expect(result.toolCalls).toHaveLength(callCount);
      expect(result.toolCalls[0]?.tool).toBe(expectedTool);
      expect(result.confidence).toBeGreaterThan(0.85);
    });
  });

  describe('llm path', () => {
    it('"Theo has wrestling at 4" routes to LLM (ambiguous verb)', async () => {
      const result = await runPipeline('Theo has wrestling at 4', TEST_HOUSEHOLD_ID);
      expect(result.path).toBe('llm');
      expect(result.toolCalls).toHaveLength(0);
    });
  });

  describe('tool call param correctness', () => {
    it('"Buy milk" sets status to on_list with item_id', async () => {
      const result = await runPipeline('Buy milk', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.milk.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'on_list');
    });

    it('"I bought the eggs" sets status to purchased', async () => {
      const result = await runPipeline('I bought the eggs', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.eggs.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'purchased');
    });

    it('quantity and location propagate through pipeline', async () => {
      const result = await runPipeline('We have 10 rolls of toilet paper in the basement pantry', TEST_HOUSEHOLD_ID);
      const params = result.toolCalls[0]?.params;
      expect(params).toHaveProperty('item_id', ITEMS.toiletPaper.id);
      expect(params).toHaveProperty('quantity', 10);
      expect(params).toHaveProperty('unit', 'roll');
      expect(params).toHaveProperty('location_id', LOCATIONS.basementPantry.id);
      expect(params).toHaveProperty('status', 'stocked');
    });

    it('store_id propagates from resolved store entity', async () => {
      const result = await runPipeline('Pick up 3 boxes of cereal from Costco', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('store_id', STORES.costco.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.cereal.id);
    });

    it('"I finished mowing the lawn" completes existing action', async () => {
      const result = await runPipeline('I finished mowing the lawn', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('action_id', ACTIONS.mowTheLawn.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'done');
    });

    it('"Remind me Thursday about the dentist" creates action with date', async () => {
      const result = await runPipeline('Remind me Thursday about the dentist', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('title', 'Dentist');
      expect(result.toolCalls[0]?.params).toHaveProperty('starts_at', '2026-04-02');
    });

    it('"We\'re out of eggs" sets status to needed', async () => {
      const result = await runPipeline("We're out of eggs", TEST_HOUSEHOLD_ID);
      expect(result.path).toBe('deterministic');
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.eggs.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'needed');
    });

    it('quantity_delta for consumption verbs', async () => {
      const result = await runPipeline('Used one of the garbage bags', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('quantity_delta', -1);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.garbageBags.id);
    });
  });
});
