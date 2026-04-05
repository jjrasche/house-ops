import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntityType } from './types';

// --- Public types ---

export interface CreateEntityOptions {
  readonly supabase: SupabaseClient;
  readonly householdId: number;
}

export interface CreatedEntity {
  readonly entityId: number;
  readonly entityType: EntityType;
  readonly name: string;
}

// --- Table mapping ---

const ENTITY_TABLE: Record<string, string> = {
  item: 'items',
  person: 'people',
  location: 'locations',
  store: 'stores',
};

// --- Orchestrator ---

export async function createEntity(
  entityType: EntityType,
  entityName: string,
  options: CreateEntityOptions,
): Promise<CreatedEntity> {
  const table = lookupTable(entityType);
  const entityId = await insertEntity(options.supabase, table, entityName, options.householdId);
  return { entityId, entityType, name: entityName };
}

// --- Concept: insert entity row and return its ID ---

async function insertEntity(
  supabase: SupabaseClient,
  table: string,
  name: string,
  householdId: number,
): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .insert({ name, household_id: householdId })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create entity: ${error.message}`);
  }

  return (data as { id: number }).id;
}

// --- Leaf: entity type to table name ---

function lookupTable(entityType: EntityType): string {
  const table = ENTITY_TABLE[entityType];
  if (!table) {
    throw new Error(`No table for entity type: ${entityType}`);
  }
  return table;
}
