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
// Core entities have their own tables with auto-triggers for entity_lexicon.
// KG entities (store, activity) go into kg_entities and need manual lexicon inserts.

const CORE_ENTITY_TABLE: Record<string, string> = {
  item: 'items',
  person: 'people',
  location: 'locations',
};

const KG_ENTITY_TYPES = new Set<string>(['store', 'activity']);

// --- Orchestrator ---

export async function createEntity(
  entityType: EntityType,
  entityName: string,
  options: CreateEntityOptions,
): Promise<CreatedEntity> {
  if (KG_ENTITY_TYPES.has(entityType)) {
    const entityId = await insertKgEntity(options.supabase, entityType, entityName, options.householdId);
    await insertLexiconEntry(options.supabase, options.householdId, entityName, entityType, entityId);
    return { entityId, entityType, name: entityName };
  }

  const table = lookupCoreTable(entityType);
  const entityId = await insertCoreEntity(options.supabase, table, entityName, options.householdId);
  return { entityId, entityType, name: entityName };
}

// --- Concept: insert into a core entity table (items, people, locations) ---

async function insertCoreEntity(
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

  if (error) throw new Error(`Failed to create entity: ${error.message}`);
  return (data as { id: number }).id;
}

// --- Concept: insert into kg_entities for store/activity types ---

async function insertKgEntity(
  supabase: SupabaseClient,
  entityType: string,
  canonicalName: string,
  householdId: number,
): Promise<number> {
  const { data, error } = await supabase
    .from('kg_entities')
    .insert({ canonical_name: canonicalName, entity_type: entityType, household_id: householdId })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create entity: ${error.message}`);
  return (data as { id: number }).id;
}

// --- Concept: manually insert lexicon entry (no auto-trigger for kg_entities) ---

async function insertLexiconEntry(
  supabase: SupabaseClient,
  householdId: number,
  entityName: string,
  entityType: string,
  entityId: number,
): Promise<void> {
  const { error } = await supabase.from('entity_lexicon').insert({
    household_id: householdId,
    surface_form: entityName.toLowerCase(),
    entity_type: entityType,
    entity_id: entityId,
    source: 'user_confirmed',
  });
  if (error) throw new Error(`Failed to create lexicon entry: ${error.message}`);
}

// --- Leaf: core entity type to table name ---

function lookupCoreTable(entityType: EntityType): string {
  const table = CORE_ENTITY_TABLE[entityType];
  if (!table) throw new Error(`No table for entity type: ${entityType}`);
  return table;
}
