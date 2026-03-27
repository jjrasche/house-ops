import { supabase } from './supabase'
import { resolveToolArgs } from './resolve-tool-args'
import type { ProposedAction } from './types'

type Args = Record<string, unknown>

const PARTNER_FREQUENCY_DAYS = 14
const PARENT_CHILD_FREQUENCY_DAYS = 30

// -- Leaf: single DB operations --

async function insertRow(table: string, row: Args): Promise<unknown> {
  const { data, error } = await supabase.from(table).insert(row).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function insertRows(table: string, rows: Args[]): Promise<void> {
  const { error } = await supabase.from(table).insert(rows)
  if (error) throw new Error(error.message)
}

async function updateRowByName(
  table: string,
  name: string,
  updates: Args,
  householdId: number,
): Promise<unknown> {
  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq('name', name.trim())
    .eq('household_id', householdId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function updateRowByTitle(
  table: string,
  title: string,
  updates: Args,
  householdId: number,
): Promise<unknown> {
  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq('title', title.trim())
    .eq('household_id', householdId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function fetchQuantityById(inventoryId: number): Promise<number> {
  const { data, error } = await supabase
    .from('inventory')
    .select('quantity')
    .eq('id', inventoryId)
    .single()
  if (error) throw new Error(error.message)
  return Number(data.quantity)
}

async function updateQuantityById(inventoryId: number, quantity: number): Promise<unknown> {
  const { data, error } = await supabase
    .from('inventory')
    .update({ quantity })
    .eq('id', inventoryId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function findExistingRelationshipDate(
  matchFilter: Args,
): Promise<{ id: number } | null> {
  const { data } = await supabase
    .from('relationship_dates')
    .select('id')
    .match(matchFilter)
    .single()
  return data
}

// -- Concept: tool-specific operations --

async function markItemPurchased(args: Args, householdId: number): Promise<unknown> {
  return updateRowByName(
    'shopping_list_items',
    args.name as string,
    { status: 'purchased' },
    householdId,
  )
}

async function completeTask(args: Args, householdId: number): Promise<unknown> {
  return updateRowByTitle(
    'tasks',
    args.title as string,
    { status: 'done', last_completed_at: new Date().toISOString() },
    householdId,
  )
}

async function computeNewQuantity(args: Args): Promise<number> {
  if (args.delta !== undefined) {
    const currentQuantity = await fetchQuantityById(args.inventory_id as number)
    return currentQuantity + Number(args.delta)
  }
  return Number(args.quantity)
}

async function updateInventoryQuantity(args: Args): Promise<unknown> {
  const newQuantity = await computeNewQuantity(args)
  return updateQuantityById(args.inventory_id as number, newQuantity)
}

async function insertRecipeIngredients(
  recipeId: number,
  ingredients: Array<{ name: string; quantity?: number; unit?: string }>,
): Promise<void> {
  const rows = ingredients.map(ing => ({
    recipe_id: recipeId,
    name: ing.name,
    quantity: ing.quantity,
    unit: ing.unit,
  }))
  await insertRows('recipe_ingredients', rows)
}

async function insertRecipeSteps(
  recipeId: number,
  steps: Array<{ instruction: string; duration_minutes?: number }>,
): Promise<void> {
  const rows = steps.map((step, index) => ({
    recipe_id: recipeId,
    step_number: index + 1,
    instruction: step.instruction,
    duration_minutes: step.duration_minutes,
  }))
  await insertRows('recipe_steps', rows)
}

async function createRecipe(args: Args, householdId: number): Promise<unknown> {
  const { ingredients, steps, ...recipeFields } = args as {
    ingredients?: Array<{ name: string; quantity?: number; unit?: string }>
    steps?: Array<{ instruction: string; duration_minutes?: number }>
  } & Args

  const recipe = await insertRow('recipes', {
    ...recipeFields,
    household_id: householdId,
  }) as { id: number }

  if (ingredients?.length) await insertRecipeIngredients(recipe.id, ingredients)
  if (steps?.length) await insertRecipeSteps(recipe.id, steps)

  return recipe
}

async function logRelationshipDate(args: Args, householdId: number): Promise<unknown> {
  const matchFilter: Args = { type: args.type, household_id: householdId }
  if (args.person_id) matchFilter.person_id = args.person_id

  const existing = await findExistingRelationshipDate(matchFilter)

  if (existing) {
    const { data, error } = await supabase
      .from('relationship_dates')
      .update({ last_occurred_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  const defaultFrequencyDays = args.type === 'partner'
    ? PARTNER_FREQUENCY_DAYS
    : PARENT_CHILD_FREQUENCY_DAYS

  return insertRow('relationship_dates', {
    ...args,
    household_id: householdId,
    target_frequency_days: defaultFrequencyDays,
    last_occurred_at: new Date().toISOString(),
  })
}

// -- Orchestrator: tool dispatch --

type ToolExecutor = (args: Args, householdId: number) => Promise<unknown>

const SIMPLE_INSERT_TOOLS: Record<string, string> = {
  add_inventory_item: 'inventory',
  add_shopping_list_item: 'shopping_list_items',
  add_event: 'events',
  plan_meal: 'meal_plan',
  add_person_attribute: 'person_attributes',
  add_location: 'locations',
  create_task: 'tasks',
}

const CUSTOM_EXECUTORS: Record<string, ToolExecutor> = {
  mark_item_purchased: markItemPurchased,
  complete_task: completeTask,
  update_inventory_quantity: (args) => updateInventoryQuantity(args),
  create_recipe: createRecipe,
  log_relationship_date: logRelationshipDate,
}

export async function executeToolCall(
  action: ProposedAction,
  householdId: number,
): Promise<unknown> {
  const resolvedArgs = await resolveToolArgs(action.toolName, action.arguments, householdId)

  const simpleTable = SIMPLE_INSERT_TOOLS[action.toolName]
  if (simpleTable) {
    return insertRow(simpleTable, { ...resolvedArgs, household_id: householdId })
  }

  const executor = CUSTOM_EXECUTORS[action.toolName]
  if (executor) {
    return executor(resolvedArgs, householdId)
  }

  throw new Error(`Unknown tool: ${action.toolName}`)
}
