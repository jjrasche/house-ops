import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveToolArgs } from '../resolve-tool-args'

vi.mock('../resolve-names', () => ({
  resolvePersonId: vi.fn(),
  resolveLocationId: vi.fn(),
  resolveRecipeId: vi.fn(),
  resolveInventoryId: vi.fn(),
}))

import {
  resolvePersonId,
  resolveLocationId,
  resolveRecipeId,
  resolveInventoryId,
} from '../resolve-names'

const HOUSEHOLD_ID = 1

beforeEach(() => {
  vi.resetAllMocks()
})

describe('resolveToolArgs', () => {
  describe('tools without resolvers pass args through unchanged', () => {
    it('returns args unchanged for add_shopping_list_item', async () => {
      const args = { name: 'Milk', quantity: 2, household_id: HOUSEHOLD_ID }
      const resolved = await resolveToolArgs('add_shopping_list_item', args, HOUSEHOLD_ID)
      expect(resolved).toEqual(args)
    })

    it('returns args unchanged for unknown tool', async () => {
      const args = { foo: 'bar' }
      const resolved = await resolveToolArgs('nonexistent_tool', args, HOUSEHOLD_ID)
      expect(resolved).toEqual(args)
    })
  })

  describe('add_inventory_item resolves location to location_id', () => {
    it('replaces location name with location_id', async () => {
      vi.mocked(resolveLocationId).mockResolvedValue(10)

      const args = { name: 'Paper towels', location: 'Kitchen', quantity: 3 }
      const resolved = await resolveToolArgs('add_inventory_item', args, HOUSEHOLD_ID)

      expect(resolveLocationId).toHaveBeenCalledWith('Kitchen', HOUSEHOLD_ID)
      expect(resolved).toEqual({ name: 'Paper towels', location_id: 10, quantity: 3 })
    })

    it('passes through when location is absent', async () => {
      const args = { name: 'Paper towels', quantity: 3 }
      const resolved = await resolveToolArgs('add_inventory_item', args, HOUSEHOLD_ID)

      expect(resolveLocationId).not.toHaveBeenCalled()
      expect(resolved).toEqual(args)
    })
  })

  describe('update_inventory_quantity resolves name to inventory_id', () => {
    it('replaces name with inventory_id', async () => {
      vi.mocked(resolveInventoryId).mockResolvedValue(42)

      const args = { name: 'Paper towels', delta: 2 }
      const resolved = await resolveToolArgs('update_inventory_quantity', args, HOUSEHOLD_ID)

      expect(resolveInventoryId).toHaveBeenCalledWith('Paper towels', HOUSEHOLD_ID)
      expect(resolved).toEqual({ inventory_id: 42, delta: 2 })
    })
  })

  describe('add_event resolves person to person_id', () => {
    it('replaces person with person_id', async () => {
      vi.mocked(resolvePersonId).mockResolvedValue(5)

      const args = { person: 'Jim', title: 'Birthday', date: '2026-04-01' }
      const resolved = await resolveToolArgs('add_event', args, HOUSEHOLD_ID)

      expect(resolvePersonId).toHaveBeenCalledWith('Jim', HOUSEHOLD_ID)
      expect(resolved).toEqual({ person_id: 5, title: 'Birthday', date: '2026-04-01' })
    })
  })

  describe('create_task resolves assigned_to (person name) to assigned_to (person_id)', () => {
    it('replaces assigned_to name with person_id', async () => {
      vi.mocked(resolvePersonId).mockResolvedValue(7)

      const args = { assigned_to: 'Sarah', title: 'Mow lawn' }
      const resolved = await resolveToolArgs('create_task', args, HOUSEHOLD_ID)

      expect(resolvePersonId).toHaveBeenCalledWith('Sarah', HOUSEHOLD_ID)
      expect(resolved).toEqual({ assigned_to: 7, title: 'Mow lawn' })
    })
  })

  describe('plan_meal resolves recipe_name to recipe_id', () => {
    it('replaces recipe_name with recipe_id', async () => {
      vi.mocked(resolveRecipeId).mockResolvedValue(20)

      const args = { recipe_name: 'Pasta Bolognese', date: '2026-04-01', meal_type: 'dinner' }
      const resolved = await resolveToolArgs('plan_meal', args, HOUSEHOLD_ID)

      expect(resolveRecipeId).toHaveBeenCalledWith('Pasta Bolognese', HOUSEHOLD_ID)
      expect(resolved).toEqual({ recipe_id: 20, date: '2026-04-01', meal_type: 'dinner' })
    })
  })

  describe('add_person_attribute resolves person to person_id', () => {
    it('replaces person with person_id', async () => {
      vi.mocked(resolvePersonId).mockResolvedValue(3)

      const args = { person: 'Jim', attribute: 'shoe_size', value: '10' }
      const resolved = await resolveToolArgs('add_person_attribute', args, HOUSEHOLD_ID)

      expect(resolvePersonId).toHaveBeenCalledWith('Jim', HOUSEHOLD_ID)
      expect(resolved).toEqual({ person_id: 3, attribute: 'shoe_size', value: '10' })
    })
  })

  describe('log_relationship_date resolves person to person_id', () => {
    it('replaces person with person_id', async () => {
      vi.mocked(resolvePersonId).mockResolvedValue(8)

      const args = { person: 'Mom', type: 'parent_child' }
      const resolved = await resolveToolArgs('log_relationship_date', args, HOUSEHOLD_ID)

      expect(resolvePersonId).toHaveBeenCalledWith('Mom', HOUSEHOLD_ID)
      expect(resolved).toEqual({ person_id: 8, type: 'parent_child' })
    })
  })

  describe('add_location resolves parent_location to parent_location_id', () => {
    it('replaces parent_location with parent_location_id', async () => {
      vi.mocked(resolveLocationId).mockResolvedValue(15)

      const args = { name: 'Pantry', parent_location: 'Kitchen' }
      const resolved = await resolveToolArgs('add_location', args, HOUSEHOLD_ID)

      expect(resolveLocationId).toHaveBeenCalledWith('Kitchen', HOUSEHOLD_ID)
      expect(resolved).toEqual({ name: 'Pantry', parent_location_id: 15 })
    })
  })
})
