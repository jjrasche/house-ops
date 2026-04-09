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
  referenceDate: new Date('2026-03-30T12:00:00'),
  conversationId: 42,
};

// --- Tests ---

describe('Stage execution logging', () => {
  it('deterministic path records extract, resolve, classify, validate executions', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    expect(result.path).toBe('deterministic');

    const stageNames = result.stageExecutions.map(e => e.stage);
    expect(stageNames).toEqual(['extract', 'resolve', 'classify', 'validate']);
  });

  it('llm path records extract, resolve, classify executions (no validate)', async () => {
    const result = await runPipeline('do something weird', pipelineOptions);

    expect(result.path).toBe('llm');

    const stageNames = result.stageExecutions.map(e => e.stage);
    expect(stageNames).toEqual(['extract', 'resolve', 'classify']);
  });

  it('each execution has non-negative durationMs', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    for (const execution of result.stageExecutions) {
      expect(execution.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('each execution carries conversationId and householdId', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    for (const execution of result.stageExecutions) {
      expect(execution.conversationId).toBe(42);
      expect(execution.householdId).toBe(TEST_HOUSEHOLD_ID);
    }
  });

  it('extract execution captures input text and output verb', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    const extractExec = result.stageExecutions.find(e => e.stage === 'extract')!;
    expect(extractExec.inputPayload).toHaveProperty('text', 'Buy milk');

    const output = extractExec.outputPayload as { verb: string };
    expect(output.verb).toBe('buy');
  });

  it('resolve execution captures entity mentions in input', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    const resolveExec = result.stageExecutions.find(e => e.stage === 'resolve')!;
    const input = resolveExec.inputPayload as { entityMentions: Array<{ text: string }> };
    expect(input.entityMentions).toContainEqual(expect.objectContaining({ text: 'milk' }));
  });

  it('validate execution captures isValid in output', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    const validateExec = result.stageExecutions.find(e => e.stage === 'validate')!;
    const output = validateExec.outputPayload as { isValid: boolean };
    expect(output.isValid).toBe(true);
  });

  it('modelVersion is deterministic-v1 for all stages', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    for (const execution of result.stageExecutions) {
      expect(execution.modelVersion).toBe('deterministic-v1');
    }
  });

  it('userVerdict defaults to null', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    for (const execution of result.stageExecutions) {
      expect(execution.userVerdict).toBeNull();
    }
  });

  // --- Pipeline trace ---

  it('trace captures input text and extracted verb', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    expect(result.trace.inputText).toBe('Buy milk');
    expect(result.trace.verb).toBe('buy');
  });

  it('trace captures entity mentions from extract', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    expect(result.trace.entityMentions).toContainEqual(
      expect.objectContaining({ text: 'milk', typeHint: 'item' }),
    );
  });

  it('trace captures resolved entities and unresolved mentions', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    expect(result.trace.resolved).toContainEqual(
      expect.objectContaining({ mention: 'milk', entityType: 'item' }),
    );
    expect(result.trace.unresolved).toEqual([]);
  });

  it('trace captures tool name and assembled params on deterministic path', async () => {
    const result = await runPipeline('Buy milk', pipelineOptions);

    expect(result.trace.toolName).toBe('update_item');
    expect(result.trace.params).toMatchObject({ item_id: 1, status: 'on_list' });
  });

  it('trace has null toolName and empty params on LLM path', async () => {
    const result = await runPipeline('do something weird', pipelineOptions);

    expect(result.trace.toolName).toBeNull();
    expect(result.trace.params).toEqual({});
  });
});
