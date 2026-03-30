// Test seed data matching docs/pipeline-test-cases.md
// IDs are stable across all pipeline tests.

import type {
  EntityType,
  ResolvedEntity,
  ContextItem,
} from '../../lib/pipeline/types';

// --- People ---
export const PEOPLE = {
  jim:      { id: 1, name: 'Jim' },
  justine:  { id: 2, name: 'Justine' },
  charlie:  { id: 3, name: 'Charlie' },
  theo:     { id: 4, name: 'Theo' },
  lily:     { id: 5, name: 'Lily' },
  desi:     { id: 6, name: 'Desi' },
} as const;

// --- Locations ---
export const LOCATIONS = {
  kitchen:         { id: 1, name: 'Kitchen', parentId: null },
  garage:          { id: 2, name: 'Garage', parentId: null },
  basement:        { id: 3, name: 'Basement', parentId: null },
  pantry:          { id: 4, name: 'Pantry', parentId: 1 },
  basementPantry:  { id: 5, name: 'Basement Pantry', parentId: 3 },
  charliesRoom:    { id: 6, name: "Charlie's Room", parentId: null },
  theosRoom:       { id: 7, name: "Theo's Room", parentId: null },
} as const;

// --- Items ---
export const ITEMS = {
  milk:              { id: 1, name: 'milk' },
  eggs:              { id: 2, name: 'eggs' },
  cereal:            { id: 3, name: 'cereal' },
  paperTowels:       { id: 4, name: 'paper towels' },
  dishSoap:          { id: 5, name: 'dish soap' },
  toiletPaper:       { id: 6, name: 'toilet paper' },
  garbageBags:       { id: 7, name: 'garbage bags' },
  laundryDetergent:  { id: 8, name: 'laundry detergent' },
} as const;

// --- KG entities (stores, activities) ---
export const STORES = {
  costco: { id: 101, name: 'Costco' },
  kroger: { id: 102, name: 'Kroger' },
  target: { id: 103, name: 'Target' },
} as const;

export const ACTIVITIES = {
  wrestling: { id: 201, name: 'wrestling' },
  soccer:    { id: 202, name: 'soccer' },
} as const;

// --- Actions (test-only seed) ---
export const ACTIONS = {
  mowTheLawn: { id: 1, title: 'Mow the lawn', status: 'pending' as const },
} as const;

// --- Household ---
export const TEST_HOUSEHOLD_ID = 1;

// --- Helpers ---

export function resolvedEntity(
  mention: string,
  entityId: number,
  entityType: EntityType,
  score = 1.0,
): ResolvedEntity {
  return { mention, entityId, entityType, score };
}

export function contextItem(
  content: string,
  edgeType: string,
  relevance: number,
): ContextItem {
  return { content, edgeType, relevance };
}
