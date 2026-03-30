import { describe, it, expect } from 'vitest';
import type { ResolveInput, ResolveOutput, EntityMention } from '../../lib/pipeline/types';
import { PEOPLE, ITEMS, LOCATIONS, STORES, ACTIVITIES, ACTIONS, resolvedEntity } from './seed';

// Stub: simulates entity resolution against seed data.
// Real implementation queries Postgres via pg_trgm.
function stubResolve(input: ResolveInput): ResolveOutput {
  const resolved = [];
  const unresolved = [];

  for (const mention of input.entityMentions) {
    const match = findSeedEntity(mention);
    if (match) {
      resolved.push(match);
    } else {
      unresolved.push(mention.text);
    }
  }

  return { resolved, unresolved };
}

function findSeedEntity(mention: EntityMention) {
  const text = mention.text.toLowerCase();

  for (const person of Object.values(PEOPLE)) {
    if (text === person.name.toLowerCase()) {
      return resolvedEntity(mention.text, person.id, 'person');
    }
  }
  for (const item of Object.values(ITEMS)) {
    if (text === item.name.toLowerCase()) {
      return resolvedEntity(mention.text, item.id, 'item');
    }
  }
  for (const location of Object.values(LOCATIONS)) {
    if (text === location.name.toLowerCase()) {
      return resolvedEntity(mention.text, location.id, 'location');
    }
  }
  for (const store of Object.values(STORES)) {
    if (text === store.name.toLowerCase()) {
      return resolvedEntity(mention.text, store.id, 'store');
    }
  }
  for (const activity of Object.values(ACTIVITIES)) {
    if (text.includes(activity.name.toLowerCase())) {
      return resolvedEntity(mention.text, activity.id, 'activity', 0.85);
    }
  }
  for (const action of Object.values(ACTIONS)) {
    if (text.includes(action.title.toLowerCase().substring(0, 6))) {
      return resolvedEntity(mention.text, action.id, 'action', 0.85);
    }
  }

  return null;
}

describe('RESOLVE stage', () => {
  it('resolves seeded item "milk"', () => {
    const output = stubResolve({
      entityMentions: [{ text: 'milk', typeHint: 'item' }],
      householdId: 1,
      verb: 'buy',
    });
    expect(output.resolved).toHaveLength(1);
    expect(output.resolved[0]?.entityId).toBe(ITEMS.milk.id);
    expect(output.resolved[0]?.entityType).toBe('item');
    expect(output.unresolved).toHaveLength(0);
  });

  it('resolves seeded person "Theo"', () => {
    const output = stubResolve({
      entityMentions: [{ text: 'Theo', typeHint: 'person' }],
      householdId: 1,
      verb: 'has',
    });
    expect(output.resolved).toHaveLength(1);
    expect(output.resolved[0]?.entityId).toBe(PEOPLE.theo.id);
    expect(output.resolved[0]?.entityType).toBe('person');
  });

  it('resolves seeded location "basement pantry"', () => {
    const output = stubResolve({
      entityMentions: [
        { text: 'toilet paper', typeHint: 'item' },
        { text: 'Basement Pantry', typeHint: 'location' },
      ],
      householdId: 1,
      verb: 'have',
    });
    expect(output.resolved).toHaveLength(2);
    expect(output.resolved[1]?.entityId).toBe(LOCATIONS.basementPantry.id);
    expect(output.resolved[1]?.entityType).toBe('location');
  });

  it('resolves seeded store "Costco"', () => {
    const output = stubResolve({
      entityMentions: [{ text: 'Costco', typeHint: 'unknown' }],
      householdId: 1,
      verb: 'pick up',
    });
    expect(output.resolved).toHaveLength(1);
    expect(output.resolved[0]?.entityId).toBe(STORES.costco.id);
    expect(output.resolved[0]?.entityType).toBe('store');
  });

  it('resolves seeded activity "wrestling" with fuzzy match', () => {
    const output = stubResolve({
      entityMentions: [{ text: 'wrestling', typeHint: 'unknown' }],
      householdId: 1,
      verb: 'has',
    });
    expect(output.resolved).toHaveLength(1);
    expect(output.resolved[0]?.entityId).toBe(ACTIVITIES.wrestling.id);
    expect(output.resolved[0]?.score).toBeLessThan(1.0);
  });

  it('leaves unknown entity "Sophie" unresolved', () => {
    const output = stubResolve({
      entityMentions: [{ text: 'Sophie', typeHint: 'person' }],
      householdId: 1,
      verb: 'is',
    });
    expect(output.resolved).toHaveLength(0);
    expect(output.unresolved).toEqual(['Sophie']);
  });

  it('leaves unknown entity "dentist" unresolved', () => {
    const output = stubResolve({
      entityMentions: [{ text: 'dentist', typeHint: 'unknown' }],
      householdId: 1,
      verb: 'remind',
    });
    expect(output.resolved).toHaveLength(0);
    expect(output.unresolved).toEqual(['dentist']);
  });

  it('resolves multiple entities of different types', () => {
    const output = stubResolve({
      entityMentions: [
        { text: 'cereal', typeHint: 'item' },
        { text: 'Costco', typeHint: 'unknown' },
      ],
      householdId: 1,
      verb: 'pick up',
    });
    expect(output.resolved).toHaveLength(2);
    expect(output.resolved[0]?.entityType).toBe('item');
    expect(output.resolved[1]?.entityType).toBe('store');
    expect(output.unresolved).toHaveLength(0);
  });

  it('resolves two same-typed items', () => {
    const output = stubResolve({
      entityMentions: [
        { text: 'paper towels', typeHint: 'item' },
        { text: 'dish soap', typeHint: 'item' },
      ],
      householdId: 1,
      verb: 'need',
    });
    expect(output.resolved).toHaveLength(2);
    expect(output.resolved[0]?.entityId).toBe(ITEMS.paperTowels.id);
    expect(output.resolved[1]?.entityId).toBe(ITEMS.dishSoap.id);
  });
});
