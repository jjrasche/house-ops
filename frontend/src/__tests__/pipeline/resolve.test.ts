import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, findCandidates } from '../../lib/pipeline/resolve';
import type { ResolveOptions } from '../../lib/pipeline/resolve';
import { PEOPLE, ITEMS, LOCATIONS, STORES, ACTIVITIES } from './seed';
import { createMockSupabase } from './mock-supabase';
import type { SeedRow } from './mock-supabase';

const SEED_ENTITIES: SeedRow[] = [
  ...Object.values(PEOPLE).map(p => ({ id: p.id, name: p.name, entityType: 'person' })),
  ...Object.values(ITEMS).map(i => ({ id: i.id, name: i.name, entityType: 'item' })),
  ...Object.values(LOCATIONS).map(l => ({ id: l.id, name: l.name, entityType: 'location' })),
  ...Object.values(STORES).map(s => ({ id: s.id, name: s.name, entityType: 'store' })),
  ...Object.values(ACTIVITIES).map(a => ({ id: a.id, name: a.name, entityType: 'activity' })),
];

let options: ResolveOptions;

beforeEach(() => {
  options = { supabase: createMockSupabase(SEED_ENTITIES) };
});

describe('RESOLVE stage', () => {
  it('resolves seeded item "milk"', async () => {
    const output = await resolve({
      entityMentions: [{ text: 'milk', typeHint: 'item' }],
      householdId: 1,
      verb: 'buy',
    }, options);
    expect(output.resolved).toHaveLength(1);
    expect(output.resolved[0]?.entityId).toBe(ITEMS.milk.id);
    expect(output.resolved[0]?.entityType).toBe('item');
    expect(output.unresolved).toHaveLength(0);
  });

  it('resolves seeded person "Theo"', async () => {
    const output = await resolve({
      entityMentions: [{ text: 'Theo', typeHint: 'person' }],
      householdId: 1,
      verb: 'has',
    }, options);
    expect(output.resolved).toHaveLength(1);
    expect(output.resolved[0]?.entityId).toBe(PEOPLE.theo.id);
    expect(output.resolved[0]?.entityType).toBe('person');
  });

  it('resolves seeded location "basement pantry"', async () => {
    const output = await resolve({
      entityMentions: [
        { text: 'toilet paper', typeHint: 'item' },
        { text: 'Basement Pantry', typeHint: 'location' },
      ],
      householdId: 1,
      verb: 'have',
    }, options);
    expect(output.resolved).toHaveLength(2);
    expect(output.resolved[1]?.entityId).toBe(LOCATIONS.basementPantry.id);
    expect(output.resolved[1]?.entityType).toBe('location');
  });

  it('resolves seeded store "Costco"', async () => {
    const output = await resolve({
      entityMentions: [{ text: 'Costco', typeHint: 'unknown' }],
      householdId: 1,
      verb: 'pick up',
    }, options);
    expect(output.resolved).toHaveLength(1);
    expect(output.resolved[0]?.entityId).toBe(STORES.costco.id);
    expect(output.resolved[0]?.entityType).toBe('store');
  });

  it('resolves seeded activity "wrestlin" with fuzzy match', async () => {
    const output = await resolve({
      entityMentions: [{ text: 'wrestlin', typeHint: 'unknown' }],
      householdId: 1,
      verb: 'has',
    }, options);
    expect(output.resolved).toHaveLength(1);
    expect(output.resolved[0]?.entityId).toBe(ACTIVITIES.wrestling.id);
    expect(output.resolved[0]?.score).toBeLessThan(1.0);
  });

  it('leaves unknown entity "Sophie" unresolved', async () => {
    const output = await resolve({
      entityMentions: [{ text: 'Sophie', typeHint: 'person' }],
      householdId: 1,
      verb: 'is',
    }, options);
    expect(output.resolved).toHaveLength(0);
    expect(output.unresolved).toEqual(['Sophie']);
  });

  it('leaves unknown entity "dentist" unresolved', async () => {
    const output = await resolve({
      entityMentions: [{ text: 'dentist', typeHint: 'unknown' }],
      householdId: 1,
      verb: 'remind',
    }, options);
    expect(output.resolved).toHaveLength(0);
    expect(output.unresolved).toEqual(['dentist']);
  });

  it('resolves multiple entities of different types', async () => {
    const output = await resolve({
      entityMentions: [
        { text: 'cereal', typeHint: 'item' },
        { text: 'Costco', typeHint: 'unknown' },
      ],
      householdId: 1,
      verb: 'pick up',
    }, options);
    expect(output.resolved).toHaveLength(2);
    expect(output.resolved[0]?.entityType).toBe('item');
    expect(output.resolved[1]?.entityType).toBe('store');
    expect(output.unresolved).toHaveLength(0);
  });

  it('resolves two same-typed items', async () => {
    const output = await resolve({
      entityMentions: [
        { text: 'paper towels', typeHint: 'item' },
        { text: 'dish soap', typeHint: 'item' },
      ],
      householdId: 1,
      verb: 'need',
    }, options);
    expect(output.resolved).toHaveLength(2);
    expect(output.resolved[0]?.entityId).toBe(ITEMS.paperTowels.id);
    expect(output.resolved[1]?.entityId).toBe(ITEMS.dishSoap.id);
  });
});

describe('findCandidates', () => {
  it('returns multiple candidates for "milk" sorted by score', async () => {
    const candidates = await findCandidates('milk', 1, options);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]!.entityId).toBe(ITEMS.milk.id);
    expect(candidates[0]!.entityType).toBe('item');
    expect(candidates[0]!.score).toBeGreaterThan(0);
  });

  it('returns at most maxResults candidates', async () => {
    const candidates = await findCandidates('a', 1, options, 2);
    expect(candidates.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for unknown mention', async () => {
    const candidates = await findCandidates('xyzzyx', 1, options);
    expect(candidates).toEqual([]);
  });

  it('returns candidates with entityId, entityType, name, and score fields', async () => {
    const candidates = await findCandidates('Costco', 1, options);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const first = candidates[0]!;
    expect(first).toHaveProperty('entityId');
    expect(first).toHaveProperty('entityType');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('score');
    expect(first.entityId).toBe(STORES.costco.id);
    expect(first.name).toBe(STORES.costco.name);
  });
});
