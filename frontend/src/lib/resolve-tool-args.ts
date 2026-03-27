import {
  resolvePersonId,
  resolveLocationId,
  resolveRecipeId,
  resolveInventoryId,
} from './resolve-names'

type Args = Record<string, unknown>

type NameResolver = (name: string, householdId: number) => Promise<number>

type ArgResolver = (args: Args, householdId: number) => Promise<Args>

async function resolveForeignKeyArg(
  args: Args,
  sourceKey: string,
  targetKey: string,
  householdId: number,
  resolve: NameResolver,
): Promise<Args> {
  const name = args[sourceKey] as string | undefined
  if (!name) return args
  const id = await resolve(name, householdId)
  const { [sourceKey]: _removed, ...rest } = args
  return { ...rest, [targetKey]: id }
}

const TOOL_RESOLVERS: Record<string, ArgResolver> = {
  add_inventory_item: (args, hid) =>
    resolveForeignKeyArg(args, 'location', 'location_id', hid, resolveLocationId),

  update_inventory_quantity: (args, hid) =>
    resolveForeignKeyArg(args, 'name', 'inventory_id', hid, resolveInventoryId),

  add_event: (args, hid) =>
    resolveForeignKeyArg(args, 'person', 'person_id', hid, resolvePersonId),

  create_task: (args, hid) =>
    resolveForeignKeyArg(args, 'assigned_to', 'assigned_to', hid, resolvePersonId),

  plan_meal: (args, hid) =>
    resolveForeignKeyArg(args, 'recipe_name', 'recipe_id', hid, resolveRecipeId),

  add_person_attribute: (args, hid) =>
    resolveForeignKeyArg(args, 'person', 'person_id', hid, resolvePersonId),

  log_relationship_date: (args, hid) =>
    resolveForeignKeyArg(args, 'person', 'person_id', hid, resolvePersonId),

  add_location: (args, hid) =>
    resolveForeignKeyArg(args, 'parent_location', 'parent_location_id', hid, resolveLocationId),
}

export async function resolveToolArgs(
  toolName: string,
  args: Args,
  householdId: number,
): Promise<Args> {
  const resolver = TOOL_RESOLVERS[toolName]
  if (!resolver) return args
  return resolver(args, householdId)
}
