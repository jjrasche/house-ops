import { describe, it, expect } from 'vitest';
import type { ClassifyInput, ClassifyOutput, EntityType } from '../../lib/pipeline/types';

// Stub: simulates verb_tool_lookup query.
// Real implementation queries Postgres subset-matching.
function stubClassify(input: ClassifyInput): ClassifyOutput {
  const key = `${input.verb}|${[...input.entityTypes].sort().join(',')}`;
  return CLASSIFY_LOOKUP[key] ?? classifyFallback(input);
}

function classifyFallback(input: ClassifyInput): ClassifyOutput {
  if (input.unresolvedCount > 0 && isReferenceVerb(input.verb)) {
    return { toolName: null, confidence: 0.2, needsLlm: true, canAssemble: false };
  }
  return { toolName: null, confidence: 0.3, needsLlm: true, canAssemble: false };
}

function isReferenceVerb(verb: string): boolean {
  return ['is', 'are'].includes(verb);
}

// verb|sorted_entity_types → output
const CLASSIFY_LOOKUP: Record<string, ClassifyOutput> = {
  'buy|item':
    { toolName: 'update_item', confidence: 0.95, needsLlm: false, canAssemble: true },
  'add|item':
    { toolName: 'update_item', confidence: 0.93, needsLlm: false, canAssemble: true },
  'need|item':
    { toolName: 'update_item', confidence: 0.94, needsLlm: false, canAssemble: true },
  'bought|item':
    { toolName: 'update_item', confidence: 0.94, needsLlm: false, canAssemble: true },
  'have|item,location':
    { toolName: 'update_item', confidence: 0.92, needsLlm: false, canAssemble: true },
  'used|item':
    { toolName: 'update_item', confidence: 0.92, needsLlm: false, canAssemble: true },
  'pick up|item,store':
    { toolName: 'update_item', confidence: 0.95, needsLlm: false, canAssemble: true },
  'remind|':
    { toolName: 'create_action', confidence: 0.93, needsLlm: false, canAssemble: true },
  'schedule|':
    { toolName: 'create_action', confidence: 0.93, needsLlm: false, canAssemble: true },
  'finished|action':
    { toolName: 'update_action', confidence: 0.92, needsLlm: false, canAssemble: true },
  // Trained from Test 4 outcome:
  'has|activity,person':
    { toolName: 'create_action', confidence: 0.85, needsLlm: false, canAssemble: true },
};

describe('CLASSIFY stage', () => {
  it.each([
    ['buy', ['item'] as EntityType[], 'update_item', false],
    ['add', ['item'] as EntityType[], 'update_item', false],
    ['bought', ['item'] as EntityType[], 'update_item', false],
    ['have', ['item', 'location'] as EntityType[], 'update_item', false],
    ['used', ['item'] as EntityType[], 'update_item', false],
    ['pick up', ['item', 'store'] as EntityType[], 'update_item', false],
    ['remind', [] as EntityType[], 'create_action', false],
    ['schedule', [] as EntityType[], 'create_action', false],
    ['finished', ['action'] as EntityType[], 'update_action', false],
    ['has', ['person', 'activity'] as EntityType[], 'create_action', false],
  ])(
    'maps verb="%s" + types=%j → tool=%s, needsLlm=%s',
    (verb, entityTypes, expectedTool, expectedNeedsLlm) => {
      const input: ClassifyInput = {
        verb,
        entityTypes,
        resolvedCount: entityTypes.length,
        unresolvedCount: 0,
      };
      const output = stubClassify(input);
      expect(output.toolName).toBe(expectedTool);
      expect(output.needsLlm).toBe(expectedNeedsLlm);
      expect(output.canAssemble).toBe(true);
    },
  );

  it('routes ambiguous verb "has" without training to LLM', () => {
    const output = stubClassify({
      verb: 'has',
      entityTypes: ['person'],
      resolvedCount: 1,
      unresolvedCount: 1,
    });
    expect(output.needsLlm).toBe(true);
    expect(output.confidence).toBeLessThan(0.5);
  });

  it('routes "are" (state description) to LLM', () => {
    const output = stubClassify({
      verb: 'are',
      entityTypes: ['item'],
      resolvedCount: 1,
      unresolvedCount: 0,
    });
    expect(output.needsLlm).toBe(true);
  });

  it('halts on unresolved person with stative verb', () => {
    const output = stubClassify({
      verb: 'is',
      entityTypes: [],
      resolvedCount: 0,
      unresolvedCount: 2,
    });
    expect(output.toolName).toBeNull();
    expect(output.confidence).toBeLessThanOrEqual(0.2);
    expect(output.needsLlm).toBe(true);
  });

  it('reports higher confidence when all entities resolved', () => {
    const allResolved = stubClassify({
      verb: 'pick up',
      entityTypes: ['item', 'store'],
      resolvedCount: 2,
      unresolvedCount: 0,
    });
    expect(allResolved.confidence).toBeGreaterThanOrEqual(0.90);
  });

  it('routes two same-typed entities to LLM', () => {
    const output = stubClassify({
      verb: 'need',
      entityTypes: ['item', 'item'],
      resolvedCount: 2,
      unresolvedCount: 0,
    });
    // "need|item,item" not in lookup → falls through to LLM
    expect(output.needsLlm).toBe(true);
  });
});
