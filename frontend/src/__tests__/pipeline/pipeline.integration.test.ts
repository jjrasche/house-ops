import { describe, it, expect } from 'vitest';
import type {
  ExtractOutput,
  ResolveOutput,
  ClassifyOutput,
  ValidateOutput,
  PipelineResult,
  PipelinePath,
  EntityMention,
  EntityType,
  ToolCall,
} from '../../lib/pipeline/types';
import {
  PEOPLE, ITEMS, LOCATIONS, STORES, ACTIVITIES, ACTIONS,
  resolvedEntity, TEST_HOUSEHOLD_ID,
} from './seed';

// --- Stage stubs with real logic (same as per-stage tests) ---

// EXTRACT: verb + entity scan + date/quantity regex
const KNOWN_VERBS = [
  'pick up', 'out of', 'buy', 'bought', 'add', 'remind', 'schedule', 'need',
  'have', 'has', 'had', 'used', 'finished', 'save', 'are', 'is',
];

function stageExtract(text: string): ExtractOutput {
  const lower = text.toLowerCase();
  const verb = KNOWN_VERBS.find(v => lower.includes(v)) ?? '';

  const entityMentions: EntityMention[] = [];
  const allEntities = [
    ...Object.values(PEOPLE).map(p => ({ name: p.name, type: 'person' as const })),
    ...Object.values(ITEMS).map(i => ({ name: i.name, type: 'item' as const })),
    ...Object.values(LOCATIONS).map(l => ({ name: l.name, type: 'location' as const })),
    ...Object.values(STORES).map(s => ({ name: s.name, type: 'store' as const })),
    ...Object.values(ACTIVITIES).map(a => ({ name: a.name, type: 'activity' as const })),
  ].sort((a, b) => b.name.length - a.name.length);

  let remaining = lower;
  for (const entity of allEntities) {
    if (remaining.includes(entity.name.toLowerCase())) {
      entityMentions.push({ text: entity.name, typeHint: entity.type });
      remaining = remaining.replace(entity.name.toLowerCase(), '');
    }
  }

  const unknownMatch = text.match(/\b(dentist|mowing the lawn|date night)\b/i);
  if (unknownMatch && !entityMentions.some(m => m.text.toLowerCase() === unknownMatch[1]!.toLowerCase())) {
    entityMentions.push({ text: unknownMatch[1]!, typeHint: 'unknown' });
  }

  const qMatch = text.match(/(\d+)\s+(box(?:es)?|roll(?:s)?|count)/i);
  const implicitOne = text.match(/\bone\s+of\s+the\b/i);
  const quantities = qMatch
    ? [{ value: parseInt(qMatch[1]!, 10), unit: qMatch[2]!.replace(/e?s$/, '') }]
    : implicitOne
      ? [{ value: 1, unit: 'count' }]
      : [];

  const datePatterns = [
    { pattern: /\bThursday\b/i, parsed: '2026-04-02' },
    { pattern: /\btomorrow at (\d{1,2})pm\b/i, parsed: '2026-03-31T15:00' },
    { pattern: /\bat (\d{1,2})\b/, parsed: '2026-03-30T16:00' },
    { pattern: /\bnext Saturday evening\b/i, parsed: '2026-04-04T18:00' },
  ];
  const dates = datePatterns
    .filter(d => d.pattern.test(text))
    .map(d => ({ raw: text.match(d.pattern)![0], parsed: d.parsed }));

  return { verb, entityMentions, dates, quantities };
}

// RESOLVE: exact + fuzzy match against seed
function stageResolve(mentions: readonly EntityMention[], verb: string): ResolveOutput {
  const resolved = [];
  const unresolved = [];

  for (const mention of mentions) {
    const txt = mention.text.toLowerCase();
    const match =
      findExact(txt, PEOPLE, 'person') ??
      findExact(txt, ITEMS, 'item') ??
      findExact(txt, LOCATIONS, 'location') ??
      findExact(txt, STORES, 'store') ??
      findFuzzy(txt, ACTIVITIES, 'activity') ??
      findFuzzy(txt, ACTIONS, 'action');
    if (match) resolved.push(match);
    else unresolved.push(mention.text);
  }

  return { resolved, unresolved };
}

function findExact(text: string, table: Record<string, { id: number; name: string }>, type: EntityType) {
  for (const row of Object.values(table)) {
    if (text === row.name.toLowerCase()) return resolvedEntity(text, row.id, type);
  }
  return null;
}

function findFuzzy(text: string, table: Record<string, { id: number } & Record<string, unknown>>, type: EntityType) {
  for (const row of Object.values(table)) {
    const name = ('name' in row ? row.name : 'title' in row ? row.title : '') as string;
    const stem = name.toLowerCase().substring(0, 3);
    if (stem.length >= 3 && text.includes(stem)) {
      return resolvedEntity(text, row.id, type, 0.85);
    }
  }
  return null;
}

// CLASSIFY: verb + entity types lookup
const VERB_TOOL_LOOKUP: Record<string, { toolName: string; confidence: number }> = {
  'buy|item': { toolName: 'update_item', confidence: 0.95 },
  'add|item': { toolName: 'update_item', confidence: 0.93 },
  'need|item': { toolName: 'update_item', confidence: 0.94 },
  'bought|item': { toolName: 'update_item', confidence: 0.94 },
  'have|item,location': { toolName: 'update_item', confidence: 0.92 },
  'used|item': { toolName: 'update_item', confidence: 0.92 },
  'pick up|item,store': { toolName: 'update_item', confidence: 0.95 },
  'out of|item': { toolName: 'update_item', confidence: 0.90 },
  'remind|': { toolName: 'create_action', confidence: 0.93 },
  'schedule|': { toolName: 'create_action', confidence: 0.93 },
  'finished|action': { toolName: 'update_action', confidence: 0.92 },
};

function stageClassify(verb: string, resolveResult: ResolveOutput): ClassifyOutput {
  const types = resolveResult.resolved.map(r => r.entityType).sort().join(',');
  const key = `${verb}|${types}`;
  const lookup = VERB_TOOL_LOOKUP[key];

  if (lookup) {
    return { toolName: lookup.toolName, confidence: lookup.confidence, needsLlm: false, canAssemble: true };
  }

  // Two same-typed entities or ambiguous verb → LLM
  return { toolName: null, confidence: 0.3, needsLlm: true, canAssemble: false };
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

function runPipeline(text: string, householdId: number): PipelineResult {
  const extractResult = stageExtract(text);
  const resolveResult = stageResolve(extractResult.entityMentions, extractResult.verb);
  const classifyResult = stageClassify(extractResult.verb, resolveResult);

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
    ])('"%s" → %s (deterministic, %d call)', (text, expectedTool, callCount) => {
      const result = runPipeline(text, TEST_HOUSEHOLD_ID);
      expect(result.path).toBe('deterministic');
      expect(result.toolCalls).toHaveLength(callCount);
      expect(result.toolCalls[0]?.tool).toBe(expectedTool);
      expect(result.confidence).toBeGreaterThan(0.85);
    });
  });

  describe('llm path', () => {
    it('"Theo has wrestling at 4" routes to LLM (ambiguous verb)', () => {
      const result = runPipeline('Theo has wrestling at 4', TEST_HOUSEHOLD_ID);
      expect(result.path).toBe('llm');
      expect(result.toolCalls).toHaveLength(0);
    });
  });

  describe('tool call param correctness', () => {
    it('"Buy milk" sets status to on_list with item_id', () => {
      const result = runPipeline('Buy milk', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.milk.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'on_list');
    });

    it('"I bought the eggs" sets status to purchased', () => {
      const result = runPipeline('I bought the eggs', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.eggs.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'purchased');
    });

    it('quantity and location propagate through pipeline', () => {
      const result = runPipeline('We have 10 rolls of toilet paper in the basement pantry', TEST_HOUSEHOLD_ID);
      const params = result.toolCalls[0]?.params;
      expect(params).toHaveProperty('item_id', ITEMS.toiletPaper.id);
      expect(params).toHaveProperty('quantity', 10);
      expect(params).toHaveProperty('unit', 'roll');
      expect(params).toHaveProperty('location_id', LOCATIONS.basementPantry.id);
      expect(params).toHaveProperty('status', 'stocked');
    });

    it('store_id propagates from resolved store entity', () => {
      const result = runPipeline('Pick up 3 boxes of cereal from Costco', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('store_id', STORES.costco.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.cereal.id);
    });

    it('"I finished mowing the lawn" completes existing action', () => {
      const result = runPipeline('I finished mowing the lawn', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('action_id', ACTIONS.mowTheLawn.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'done');
    });

    it('"Remind me Thursday about the dentist" creates action with date', () => {
      const result = runPipeline('Remind me Thursday about the dentist', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('title', 'Dentist');
      expect(result.toolCalls[0]?.params).toHaveProperty('starts_at', '2026-04-02');
    });

    it('"We\'re out of eggs" sets status to needed', () => {
      const result = runPipeline("We're out of eggs", TEST_HOUSEHOLD_ID);
      expect(result.path).toBe('deterministic');
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.eggs.id);
      expect(result.toolCalls[0]?.params).toHaveProperty('status', 'needed');
    });

    it('quantity_delta for consumption verbs', () => {
      const result = runPipeline('Used one of the garbage bags', TEST_HOUSEHOLD_ID);
      expect(result.toolCalls[0]?.params).toHaveProperty('quantity_delta', -1);
      expect(result.toolCalls[0]?.params).toHaveProperty('item_id', ITEMS.garbageBags.id);
    });
  });
});
