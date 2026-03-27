import { supabase } from './supabase'

async function resolveIdByName(
  table: string,
  name: string,
  householdId: number,
  label: string,
): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('name', name.trim())
    .eq('household_id', householdId)
    .single()
  if (error) throw new Error(`${label} "${name}" not found: ${error.message}`)
  return data.id
}

export const resolvePersonId = (name: string, householdId: number): Promise<number> =>
  resolveIdByName('people', name, householdId, 'Person')

export const resolveLocationId = (name: string, householdId: number): Promise<number> =>
  resolveIdByName('locations', name, householdId, 'Location')

export const resolveRecipeId = (name: string, householdId: number): Promise<number> =>
  resolveIdByName('recipes', name, householdId, 'Recipe')

export const resolveInventoryId = (name: string, householdId: number): Promise<number> =>
  resolveIdByName('inventory', name, householdId, 'Inventory item')
