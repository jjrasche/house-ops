import { describe, it, expect, vi } from 'vitest';
import { createEntity } from '../../lib/pipeline/create-entity';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Mock Supabase that tracks inserts and returns IDs ---

function createInsertTrackingMock(): {
  supabase: SupabaseClient;
  insertedRows: Array<{ table: string; payload: Record<string, unknown> }>;
} {
  const insertedRows: Array<{ table: string; payload: Record<string, unknown> }> = [];
  let nextId = 100;

  const supabase = {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        insertedRows.push({ table, payload });
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: { id: nextId++ },
              error: null,
            }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;

  return { supabase, insertedRows };
}

function createErrorMock(errorMessage: string): SupabaseClient {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: null,
            error: { message: errorMessage },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('createEntity', () => {
  it('inserts item into items table with household_id', async () => {
    const { supabase, insertedRows } = createInsertTrackingMock();

    const result = await createEntity('item', 'Chex Mix', { supabase, householdId: 1 });

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]!.table).toBe('items');
    expect(insertedRows[0]!.payload).toEqual({ name: 'Chex Mix', household_id: 1 });
    expect(result.entityId).toBe(100);
    expect(result.entityType).toBe('item');
    expect(result.name).toBe('Chex Mix');
  });

  it('inserts person into people table', async () => {
    const { supabase, insertedRows } = createInsertTrackingMock();

    await createEntity('person', 'Charlie', { supabase, householdId: 1 });

    expect(insertedRows[0]!.table).toBe('people');
    expect(insertedRows[0]!.payload).toEqual({ name: 'Charlie', household_id: 1 });
  });

  it('inserts location into locations table', async () => {
    const { supabase, insertedRows } = createInsertTrackingMock();

    await createEntity('location', 'Garage', { supabase, householdId: 1 });

    expect(insertedRows[0]!.table).toBe('locations');
  });

  it('inserts store into stores table', async () => {
    const { supabase, insertedRows } = createInsertTrackingMock();

    await createEntity('store', 'Costco', { supabase, householdId: 1 });

    expect(insertedRows[0]!.table).toBe('stores');
  });

  it('returns the created entity with ID from DB', async () => {
    const { supabase } = createInsertTrackingMock();

    const result = await createEntity('item', 'Oat Milk', { supabase, householdId: 2 });

    expect(result).toEqual({
      entityId: 100,
      entityType: 'item',
      name: 'Oat Milk',
    });
  });

  it('throws on Supabase error', async () => {
    const supabase = createErrorMock('duplicate key');

    await expect(
      createEntity('item', 'Milk', { supabase, householdId: 1 }),
    ).rejects.toThrow('Failed to create entity: duplicate key');
  });

  it('throws for unsupported entity type', async () => {
    const { supabase } = createInsertTrackingMock();

    await expect(
      createEntity('activity' as any, 'Soccer', { supabase, householdId: 1 }),
    ).rejects.toThrow('No table for entity type: activity');
  });
});
