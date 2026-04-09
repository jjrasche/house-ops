import { describe, it, expect } from 'vitest';
import type { ValidateOptions } from '@house-ops/core';
import { validate } from '@house-ops/core';
import { ITEMS, PEOPLE, LOCATIONS } from './seed';

// --- FK existence checker using seed data ---

function createSeedEntityChecker(): ValidateOptions['entityExists'] {
  const lookups: Record<string, Record<string, { id: number }>> = {
    item: ITEMS,
    person: PEOPLE,
    location: LOCATIONS,
  };

  return async (entityType: string, entityId: number): Promise<boolean> => {
    const table = lookups[entityType];
    if (!table) return true; // action IDs validated differently
    return Object.values(table).some(row => row.id === entityId);
  };
}

const withFkChecks: ValidateOptions = { entityExists: createSeedEntityChecker() };

// --- Tests ---

describe('VALIDATE stage', () => {
  describe('schema validation', () => {
    it('accepts valid update_item with required item_id', async () => {
      const output = await validate(
        { toolCall: { tool: 'update_item', params: { item_id: 1, status: 'on_list' } } },
      );
      expect(output.isValid).toBe(true);
      expect(output.errors).toHaveLength(0);
      expect(output.confidence).toBe(0.92);
    });

    it('rejects update_item missing item_id', async () => {
      const output = await validate(
        { toolCall: { tool: 'update_item', params: { status: 'on_list' } } },
      );
      expect(output.isValid).toBe(false);
      expect(output.errors).toContain('Missing required param: item_id');
      expect(output.confidence).toBe(0);
    });

    it('rejects create_action missing title', async () => {
      const output = await validate(
        { toolCall: { tool: 'create_action', params: { person_id: 4 } } },
      );
      expect(output.isValid).toBe(false);
      expect(output.errors).toContain('Missing required param: title');
    });

    it('rejects unknown tool', async () => {
      const output = await validate(
        { toolCall: { tool: 'nonexistent_tool', params: {} } },
      );
      expect(output.isValid).toBe(false);
      expect(output.errors[0]).toContain('Unknown tool');
    });

    it('accepts create_recipe with name only', async () => {
      const output = await validate(
        { toolCall: { tool: 'create_recipe', params: { name: 'Chicken Tikka Masala', method: 'instant_pot' } } },
      );
      expect(output.isValid).toBe(true);
    });

    it('accepts update_action with action_id', async () => {
      const output = await validate(
        { toolCall: { tool: 'update_action', params: { action_id: 1, status: 'done' } } },
      );
      expect(output.isValid).toBe(true);
    });
  });

  describe('FK existence checks', () => {
    it('accepts update_item with valid item FK', async () => {
      const output = await validate(
        { toolCall: { tool: 'update_item', params: { item_id: ITEMS.milk.id, status: 'on_list' } } },
        withFkChecks,
      );
      expect(output.isValid).toBe(true);
    });

    it('rejects update_item with invalid item FK', async () => {
      const output = await validate(
        { toolCall: { tool: 'update_item', params: { item_id: 999 } } },
        withFkChecks,
      );
      expect(output.isValid).toBe(false);
      expect(output.errors[0]).toContain('FK not found');
      expect(output.errors[0]).toContain('item_id=999');
    });

    it('accepts update_item with valid item + location FKs', async () => {
      const output = await validate(
        { toolCall: { tool: 'update_item', params: { item_id: ITEMS.toiletPaper.id, quantity: 10, location_id: LOCATIONS.basementPantry.id, status: 'stocked' } } },
        withFkChecks,
      );
      expect(output.isValid).toBe(true);
    });

    it('rejects update_item with invalid location FK', async () => {
      const output = await validate(
        { toolCall: { tool: 'update_item', params: { item_id: ITEMS.milk.id, location_id: 999 } } },
        withFkChecks,
      );
      expect(output.isValid).toBe(false);
      expect(output.errors[0]).toContain('location_id=999');
    });

    it('accepts create_action with valid person reference', async () => {
      const output = await validate(
        { toolCall: { tool: 'create_action', params: { title: 'Wrestling', person_id: PEOPLE.theo.id, starts_at: '2026-03-30T16:00' } } },
        withFkChecks,
      );
      expect(output.isValid).toBe(true);
    });

    it('skips FK checks when entityExists not provided', async () => {
      const output = await validate(
        { toolCall: { tool: 'update_item', params: { item_id: 999 } } },
      );
      expect(output.isValid).toBe(true);
    });
  });
});
