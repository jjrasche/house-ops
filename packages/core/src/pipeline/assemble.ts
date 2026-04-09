import type {
  AssembleInput, AssembleOutput, ToolCall,
  ResolvedEntity, ParsedDate, ParsedQuantity,
} from './types';
import { lemmatizeVerb } from './extract';

// --- Public types ---

export interface ToolCallExample {
  readonly verb: string;
  readonly toolName: string;
  readonly toolParams: Readonly<Record<string, unknown>>;
}

export interface AssembleOptions {
  readonly toolCallExamples?: readonly ToolCallExample[];
}

// --- Constants ---

const VERB_STATUS_MAP: Record<string, string> = {
  buy: 'on_list', add: 'on_list', need: 'needed', 'pick up': 'on_list',
  bought: 'purchased', purchased: 'purchased',
  get: 'on_list', got: 'purchased',
  grab: 'on_list', grabbed: 'purchased',
  put: 'on_list',
  'picked up': 'purchased',
  'running low': 'needed', 'low on': 'needed', 'all set': 'stocked',
  have: 'stocked', finished: 'done', completed: 'done',
  'out of': 'needed',
};

const CONSUMPTION_VERBS = new Set(['used']);

// --- Orchestrator ---

export function assemble(input: AssembleInput, options: AssembleOptions = {}): AssembleOutput {
  const sharedParams: Record<string, unknown> = {};

  inferStatusFromExamplesOrMap(sharedParams, input.verb, input.toolName, options.toolCallExamples);
  mapQuantityParams(sharedParams, input.quantities, input.verb, sharedParams.status as string | undefined);
  mapDateParams(sharedParams, input.dates, input.toolName);
  mapTitleParam(sharedParams, input.toolName, input.unresolved);

  const toolCalls = expandByDuplicateType(input.toolName, sharedParams, input.resolved);

  return { toolCalls };
}

// --- Concept: expand into N tool calls when multiple entities share a type ---
// Groups entities by type. If any type has >1 entity, produces one tool call per
// entity in that type, sharing all other entity params and non-entity params.

function expandByDuplicateType(
  toolName: string,
  sharedParams: Record<string, unknown>,
  resolved: readonly ResolvedEntity[],
): ToolCall[] {
  const byType = groupEntitiesByType(resolved);
  const expansionType = findExpansionType(byType);

  if (!expansionType) {
    const params = { ...sharedParams };
    mapSingletonEntities(params, byType);
    return [{ tool: toolName, params }];
  }

  const singletonParams: Record<string, unknown> = {};
  for (const [type, entities] of byType) {
    if (type !== expansionType) {
      const paramName = entityTypeToParam(type);
      if (paramName) singletonParams[paramName] = entities[0]!.entityId;
    }
  }

  return byType.get(expansionType)!.map(entity => {
    const paramName = entityTypeToParam(entity.entityType)!;
    return { tool: toolName, params: { ...sharedParams, ...singletonParams, [paramName]: entity.entityId } };
  });
}

// --- Concept: map singleton entity groups (one entity per type) ---

function mapSingletonEntities(
  params: Record<string, unknown>,
  byType: Map<string, ResolvedEntity[]>,
): void {
  for (const [, entities] of byType) {
    const paramName = entityTypeToParam(entities[0]!.entityType);
    if (paramName) params[paramName] = entities[0]!.entityId;
  }
}

// --- Concept: infer status from trained examples first, then hardcoded map ---

function inferStatusFromExamplesOrMap(
  params: Record<string, unknown>,
  verb: string,
  toolName: string,
  examples?: readonly ToolCallExample[],
): void {
  const exampleStatus = findExampleStatus(verb, toolName, examples);
  if (exampleStatus !== undefined) {
    params.status = exampleStatus;
    return;
  }

  const status = VERB_STATUS_MAP[verb] ?? VERB_STATUS_MAP[lemmatizeVerb(verb)];
  if (status) params.status = status;
}

// --- Concept: look up status from tool_call_examples ---

function findExampleStatus(
  verb: string,
  toolName: string,
  examples?: readonly ToolCallExample[],
): unknown | undefined {
  if (!examples || examples.length === 0) return undefined;

  const match = examples.find(
    ex => ex.verb === verb && ex.toolName === toolName,
  );

  return match?.toolParams.status;
}

// --- Concept: map quantities with verb-aware semantics ---
// Consumption verbs → negative quantity_delta.
// Stocked items → quantity + unit (absolute count).
// Everything else → quantity_needed + unit.

function mapQuantityParams(
  params: Record<string, unknown>,
  quantities: readonly ParsedQuantity[],
  verb: string,
  status: string | undefined,
): void {
  if (quantities.length === 0) return;

  const quantity = quantities[0]!;

  if (CONSUMPTION_VERBS.has(verb)) {
    params.quantity_delta = -quantity.value;
    return;
  }

  if (status === 'stocked') {
    params.quantity = quantity.value;
    params.unit = quantity.unit;
    return;
  }

  params.quantity_needed = quantity.value;
  params.unit = quantity.unit;
}

// --- Concept: propagate dates to action tools ---

function mapDateParams(
  params: Record<string, unknown>,
  dates: readonly ParsedDate[],
  toolName: string,
): void {
  if (dates.length === 0) return;
  if (!toolName.includes('action')) return;

  params.starts_at = dates[0]!.parsed;
}

// --- Concept: title from unresolved mentions for create_action ---

function mapTitleParam(
  params: Record<string, unknown>,
  toolName: string,
  unresolved: readonly string[],
): void {
  if (toolName !== 'create_action') return;
  if (unresolved.length === 0) return;

  params.title = capitalize(unresolved[0]!);
}

// --- Leaf: entity type to parameter name ---

function entityTypeToParam(entityType: string): string | null {
  const mapping: Record<string, string> = {
    item: 'item_id',
    location: 'location_id',
    person: 'person_id',
    store: 'store_id',
    action: 'action_id',
  };
  return mapping[entityType] ?? null;
}

// --- Leaf: group resolved entities by type ---

function groupEntitiesByType(resolved: readonly ResolvedEntity[]): Map<string, ResolvedEntity[]> {
  const byType = new Map<string, ResolvedEntity[]>();
  for (const entity of resolved) {
    const group = byType.get(entity.entityType);
    if (group) group.push(entity);
    else byType.set(entity.entityType, [entity]);
  }
  return byType;
}

// --- Leaf: find the first entity type with >1 entity, or null ---

function findExpansionType(byType: Map<string, ResolvedEntity[]>): string | null {
  for (const [type, entities] of byType) {
    if (entities.length > 1) return type;
  }
  return null;
}

// --- Leaf: capitalize first letter ---

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
