import { describe, it, expect } from 'vitest';
import type { AssembleInput, ResolvedEntity, ParsedDate, ParsedQuantity } from '../../lib/pipeline/types';
import { assemble } from '../../lib/pipeline/assemble';
import { ITEMS, LOCATIONS, STORES, PEOPLE, ACTIONS } from './seed';

// --- Helpers ---

function makeInput(overrides: Partial<AssembleInput> & Pick<AssembleInput, 'toolName' | 'verb'>): AssembleInput {
  return {
    resolved: [],
    unresolved: [],
    dates: [],
    quantities: [],
    ...overrides,
  };
}

function resolved(mention: string, entityId: number, entityType: string, score = 1.0): ResolvedEntity {
  return { mention, entityId, entityType: entityType as ResolvedEntity['entityType'], score };
}

// --- Tests ---

describe('ASSEMBLE stage', () => {
  describe('entity-to-param mapping', () => {
    it.each([
      ['item',     ITEMS.milk.id,              'item_id'],
      ['location', LOCATIONS.basementPantry.id, 'location_id'],
      ['person',   PEOPLE.jim.id,              'person_id'],
      ['store',    STORES.costco.id,           'store_id'],
      ['action',   ACTIONS.mowTheLawn.id,      'action_id'],
    ])('%s entity → %s param', (entityType, entityId, expectedParam) => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'buy',
        resolved: [resolved('test', entityId as number, entityType as string)],
      }));
      expect(output.toolCalls).toHaveLength(1);
      expect(output.toolCalls[0]!.params).toHaveProperty(expectedParam, entityId);
    });

    it('maps multiple entity types into separate params', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'pick up',
        resolved: [
          resolved('cereal', ITEMS.cereal.id, 'item'),
          resolved('Costco', STORES.costco.id, 'store'),
        ],
      }));
      expect(output.toolCalls[0]!.params).toHaveProperty('item_id', ITEMS.cereal.id);
      expect(output.toolCalls[0]!.params).toHaveProperty('store_id', STORES.costco.id);
    });

    it('ignores entity types with no param mapping (activity)', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'buy',
        resolved: [resolved('wrestling', 201, 'activity')],
      }));
      expect(output.toolCalls[0]!.params).not.toHaveProperty('activity_id');
    });
  });

  describe('verb → status inference', () => {
    it.each([
      ['buy',       'on_list'],
      ['add',       'on_list'],
      ['need',      'needed'],
      ['pick up',   'on_list'],
      ['bought',    'purchased'],
      ['purchased', 'purchased'],
      ['have',      'stocked'],
      ['finished',  'done'],
      ['completed', 'done'],
      ['out of',    'needed'],
    ])('verb="%s" → status="%s"', (verb, expectedStatus) => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb,
        resolved: [resolved('milk', ITEMS.milk.id, 'item')],
      }));
      expect(output.toolCalls[0]!.params).toHaveProperty('status', expectedStatus);
    });

    it('no status for unknown verbs', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'juggle',
        resolved: [resolved('milk', ITEMS.milk.id, 'item')],
      }));
      expect(output.toolCalls[0]!.params).not.toHaveProperty('status');
    });
  });

  describe('quantity handling', () => {
    it('consumption verb → negative quantity_delta', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'used',
        resolved: [resolved('garbage bags', ITEMS.garbageBags.id, 'item')],
        quantities: [{ value: 1, unit: 'count' }],
      }));
      expect(output.toolCalls[0]!.params).toHaveProperty('quantity_delta', -1);
      expect(output.toolCalls[0]!.params).not.toHaveProperty('quantity');
      expect(output.toolCalls[0]!.params).not.toHaveProperty('quantity_needed');
    });

    it('stocked status → quantity + unit (absolute)', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'have',
        resolved: [
          resolved('toilet paper', ITEMS.toiletPaper.id, 'item'),
          resolved('basement pantry', LOCATIONS.basementPantry.id, 'location'),
        ],
        quantities: [{ value: 10, unit: 'roll' }],
      }));
      expect(output.toolCalls[0]!.params).toHaveProperty('quantity', 10);
      expect(output.toolCalls[0]!.params).toHaveProperty('unit', 'roll');
      expect(output.toolCalls[0]!.params).not.toHaveProperty('quantity_needed');
    });

    it('non-consumption, non-stocked → quantity_needed + unit', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'buy',
        resolved: [resolved('cereal', ITEMS.cereal.id, 'item')],
        quantities: [{ value: 3, unit: 'box' }],
      }));
      expect(output.toolCalls[0]!.params).toHaveProperty('quantity_needed', 3);
      expect(output.toolCalls[0]!.params).toHaveProperty('unit', 'box');
      expect(output.toolCalls[0]!.params).not.toHaveProperty('quantity');
    });

    it('no quantities → no quantity params', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'buy',
        resolved: [resolved('milk', ITEMS.milk.id, 'item')],
      }));
      expect(output.toolCalls[0]!.params).not.toHaveProperty('quantity');
      expect(output.toolCalls[0]!.params).not.toHaveProperty('quantity_delta');
      expect(output.toolCalls[0]!.params).not.toHaveProperty('quantity_needed');
    });
  });

  describe('date propagation', () => {
    it('date → starts_at for action tools', () => {
      const output = assemble(makeInput({
        toolName: 'create_action',
        verb: 'remind',
        unresolved: ['dentist'],
        dates: [{ raw: 'Thursday', parsed: '2026-04-02' }],
      }));
      expect(output.toolCalls[0]!.params).toHaveProperty('starts_at', '2026-04-02');
    });

    it('date ignored for non-action tools', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'buy',
        resolved: [resolved('milk', ITEMS.milk.id, 'item')],
        dates: [{ raw: 'Thursday', parsed: '2026-04-02' }],
      }));
      expect(output.toolCalls[0]!.params).not.toHaveProperty('starts_at');
    });
  });

  describe('title from unresolved mentions', () => {
    it('create_action gets title from first unresolved mention (capitalized)', () => {
      const output = assemble(makeInput({
        toolName: 'create_action',
        verb: 'remind',
        unresolved: ['dentist'],
      }));
      expect(output.toolCalls[0]!.params).toHaveProperty('title', 'Dentist');
    });

    it('non-create_action tools do not get title', () => {
      const output = assemble(makeInput({
        toolName: 'update_action',
        verb: 'finished',
        resolved: [resolved('mow the lawn', ACTIONS.mowTheLawn.id, 'action')],
        unresolved: ['something'],
      }));
      expect(output.toolCalls[0]!.params).not.toHaveProperty('title');
    });

    it('create_action with no unresolved does not set title', () => {
      const output = assemble(makeInput({
        toolName: 'create_action',
        verb: 'schedule',
        dates: [{ raw: 'next Saturday evening', parsed: '2026-04-04T18:00' }],
      }));
      expect(output.toolCalls[0]!.params).not.toHaveProperty('title');
    });
  });

  describe('output structure', () => {
    it('always returns exactly one tool call', () => {
      const output = assemble(makeInput({
        toolName: 'update_item',
        verb: 'buy',
        resolved: [resolved('milk', ITEMS.milk.id, 'item')],
      }));
      expect(output.toolCalls).toHaveLength(1);
      expect(output.toolCalls[0]!.tool).toBe('update_item');
    });
  });
});
