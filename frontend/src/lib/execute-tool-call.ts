import { supabase } from './supabase'
import type { ProposedAction } from './types'

type ToolExecutor = (args: Record<string, unknown>, householdId: number) => Promise<unknown>

const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  add_inventory_item: (args, householdId) =>
    insertRow('inventory', { ...args, household_id: householdId }),

  update_inventory_quantity: (args, householdId) =>
    updateByName('inventory', args, householdId),

  add_shopping_list_item: (args, householdId) =>
    insertRow('shopping_list_items', { ...args, household_id: householdId }),

  mark_item_purchased: (args, householdId) =>
    updateByName('shopping_list_items', { ...args, purchased: true }, householdId),

  create_task: (args, householdId) =>
    insertRow('tasks', { ...args, household_id: householdId }),

  complete_task: (args, householdId) =>
    completeTaskRow(args.title as string, householdId),

  add_event: (args, householdId) =>
    insertRow('events', { ...args, household_id: householdId }),

  create_recipe: (args, householdId) =>
    insertRow('recipes', { ...args, household_id: householdId }),

  plan_meal: (args, householdId) =>
    insertRow('meal_plan', { ...args, household_id: householdId }),

  add_person_attribute: (args, householdId) =>
    insertRow('person_attributes', { ...args, household_id: householdId }),

  log_relationship_date: (args, householdId) =>
    insertRow('relationship_dates', { ...args, household_id: householdId }),

  add_location: (args, householdId) =>
    insertRow('locations', { ...args, household_id: householdId }),
}

async function completeTaskRow(title: string, householdId: number): Promise<unknown> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .ilike('title', title)
    .eq('household_id', householdId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function insertRow(table: string, row: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.from(table).insert(row).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function updateByName(
  table: string,
  args: Record<string, unknown>,
  householdId: number,
): Promise<unknown> {
  const { name: nameValue, ...updates } = args as { name: string } & Record<string, unknown>

  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .ilike('name', nameValue)
    .eq('household_id', householdId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function executeToolCall(
  action: ProposedAction,
  householdId: number,
): Promise<unknown> {
  const executor = TOOL_EXECUTORS[action.toolName]
  if (!executor) throw new Error(`Unknown tool: ${action.toolName}`)
  return executor(action.arguments, householdId)
}
