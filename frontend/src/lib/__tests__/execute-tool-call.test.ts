import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeToolCall } from '../execute-tool-call'
import type { ProposedAction } from '../types'

// -- Mock Supabase query builder chain --

type QueryResult = { data: unknown; error: { message: string } | null }

let mockQueryResult: QueryResult = { data: null, error: null }

const queryBuilder = {
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  match: vi.fn().mockReturnThis(),
  single: vi.fn(() => mockQueryResult),
}

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => queryBuilder),
  },
}))

vi.mock('../resolve-tool-args', () => ({
  resolveToolArgs: vi.fn((_tool: string, args: Record<string, unknown>) => Promise.resolve(args)),
}))

import { supabase } from '../supabase'

const HOUSEHOLD_ID = 1

function buildAction(toolName: string, args: Record<string, unknown>): ProposedAction {
  return { toolCallId: 'tc_1', toolName, arguments: args }
}

function setQueryResult(data: unknown, error: { message: string } | null = null): void {
  mockQueryResult = { data, error }
}

beforeEach(() => {
  vi.clearAllMocks()
  setQueryResult({ id: 1 })
})

describe('executeToolCall', () => {
  describe('simple insert tools', () => {
    it('inserts into inventory for add_inventory_item', async () => {
      const action = buildAction('add_inventory_item', { name: 'Soap', quantity: 2 })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(supabase.from).toHaveBeenCalledWith('inventory')
      expect(queryBuilder.insert).toHaveBeenCalledWith({
        name: 'Soap',
        quantity: 2,
        household_id: HOUSEHOLD_ID,
      })
    })

    it('inserts into shopping_list_items for add_shopping_list_item', async () => {
      const action = buildAction('add_shopping_list_item', { name: 'Milk' })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(supabase.from).toHaveBeenCalledWith('shopping_list_items')
      expect(queryBuilder.insert).toHaveBeenCalledWith({
        name: 'Milk',
        household_id: HOUSEHOLD_ID,
      })
    })

    it('inserts into tasks for create_task', async () => {
      const action = buildAction('create_task', { title: 'Mow lawn', assigned_to: 7 })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(supabase.from).toHaveBeenCalledWith('tasks')
      expect(queryBuilder.insert).toHaveBeenCalledWith({
        title: 'Mow lawn',
        assigned_to: 7,
        household_id: HOUSEHOLD_ID,
      })
    })
  })

  describe('markItemPurchased', () => {
    it('updates shopping_list_items status to purchased', async () => {
      const action = buildAction('mark_item_purchased', { name: 'Milk' })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(supabase.from).toHaveBeenCalledWith('shopping_list_items')
      expect(queryBuilder.update).toHaveBeenCalledWith({ status: 'purchased' })
      expect(queryBuilder.eq).toHaveBeenCalledWith('name', 'Milk')
      expect(queryBuilder.eq).toHaveBeenCalledWith('household_id', HOUSEHOLD_ID)
    })
  })

  describe('completeTask', () => {
    it('updates task status to done with last_completed_at', async () => {
      const action = buildAction('complete_task', { title: 'Mow lawn' })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(supabase.from).toHaveBeenCalledWith('tasks')
      expect(queryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'done' }),
      )
      const updateArg = queryBuilder.update.mock.calls[0][0]
      expect(updateArg.last_completed_at).toBeDefined()
      expect(queryBuilder.eq).toHaveBeenCalledWith('title', 'Mow lawn')
    })
  })

  describe('updateInventoryQuantity', () => {
    it('computes new quantity from delta', async () => {
      // First call: fetchQuantityById (select → eq → single)
      // Second call: updateQuantityById (update → eq → select → single)
      let callCount = 0
      queryBuilder.single.mockImplementation(() => {
        callCount++
        if (callCount === 1) return { data: { quantity: 5 }, error: null }
        return { data: { id: 42, quantity: 7 }, error: null }
      })

      const action = buildAction('update_inventory_quantity', { inventory_id: 42, delta: 2 })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(queryBuilder.update).toHaveBeenCalledWith({ quantity: 7 })
    })

    it('sets absolute quantity when delta is absent', async () => {
      const action = buildAction('update_inventory_quantity', { inventory_id: 42, quantity: 10 })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(queryBuilder.update).toHaveBeenCalledWith({ quantity: 10 })
    })
  })

  describe('createRecipe', () => {
    it('inserts recipe, ingredients, and steps', async () => {
      let insertCallCount = 0
      queryBuilder.insert.mockImplementation(() => {
        insertCallCount++
        return queryBuilder
      })
      queryBuilder.single.mockImplementation(() => {
        if (insertCallCount === 1) return { data: { id: 99 }, error: null }
        return { data: null, error: null }
      })

      const action = buildAction('create_recipe', {
        name: 'Pasta',
        ingredients: [{ name: 'Noodles', quantity: 200, unit: 'g' }],
        steps: [{ instruction: 'Boil water', duration_minutes: 10 }],
      })
      await executeToolCall(action, HOUSEHOLD_ID)

      // Recipe insert
      expect(queryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Pasta', household_id: HOUSEHOLD_ID }),
      )
      // Ingredients insert
      expect(queryBuilder.insert).toHaveBeenCalledWith([
        { recipe_id: 99, name: 'Noodles', quantity: 200, unit: 'g' },
      ])
      // Steps insert
      expect(queryBuilder.insert).toHaveBeenCalledWith([
        { recipe_id: 99, step_number: 1, instruction: 'Boil water', duration_minutes: 10 },
      ])
    })
  })

  describe('logRelationshipDate', () => {
    it('inserts new relationship date with partner frequency default', async () => {
      // findExistingRelationshipDate returns null (no existing)
      let singleCallCount = 0
      queryBuilder.single.mockImplementation(() => {
        singleCallCount++
        if (singleCallCount === 1) return { data: null, error: { message: 'not found' } }
        return { data: { id: 1 }, error: null }
      })

      const action = buildAction('log_relationship_date', {
        person_id: 5,
        type: 'partner',
      })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(queryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          person_id: 5,
          type: 'partner',
          household_id: HOUSEHOLD_ID,
          target_frequency_days: 14,
        }),
      )
    })

    it('updates existing relationship date instead of inserting', async () => {
      // findExistingRelationshipDate returns existing record
      let singleCallCount = 0
      queryBuilder.single.mockImplementation(() => {
        singleCallCount++
        if (singleCallCount === 1) return { data: { id: 50 }, error: null }
        return { data: { id: 50 }, error: null }
      })

      const action = buildAction('log_relationship_date', {
        person_id: 5,
        type: 'parent_child',
      })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(queryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ last_occurred_at: expect.any(String) }),
      )
      expect(queryBuilder.eq).toHaveBeenCalledWith('id', 50)
    })

    it('uses parent_child frequency default for non-partner types', async () => {
      let singleCallCount = 0
      queryBuilder.single.mockImplementation(() => {
        singleCallCount++
        if (singleCallCount === 1) return { data: null, error: { message: 'not found' } }
        return { data: { id: 1 }, error: null }
      })

      const action = buildAction('log_relationship_date', {
        person_id: 5,
        type: 'parent_child',
      })
      await executeToolCall(action, HOUSEHOLD_ID)

      expect(queryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ target_frequency_days: 30 }),
      )
    })
  })

  describe('unknown tool', () => {
    it('throws for unregistered tool name', async () => {
      const action = buildAction('nonexistent_tool', {})
      await expect(executeToolCall(action, HOUSEHOLD_ID)).rejects.toThrow('Unknown tool: nonexistent_tool')
    })
  })
})
