import type {
  AssembleInput, AssembleOutput, ToolCall,
  ResolvedEntity, ParsedDate, ParsedQuantity,
} from './types';

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
  have: 'stocked', finished: 'done', completed: 'done',
  'out of': 'needed',
};

const CONSUMPTION_VERBS = new Set(['used']);

// --- Orchestrator ---

export function assemble(input: AssembleInput, options: AssembleOptions = {}): AssembleOutput {
  const params: Record<string, unknown> = {};

  mapEntityParams(params, input.resolved);
  inferStatusFromExamplesOrMap(params, input.verb, input.toolName, options.toolCallExamples);
  mapQuantityParams(params, input.quantities, input.verb, params.status as string | undefined);
  mapDateParams(params, input.dates, input.toolName);
  mapTitleParam(params, input.toolName, input.unresolved);

  return { toolCalls: [{ tool: input.toolName, params }] };
}

// --- Concept: map resolved entities to typed parameter slots ---

function mapEntityParams(
  params: Record<string, unknown>,
  resolved: readonly ResolvedEntity[],
): void {
  for (const entity of resolved) {
    const paramName = entityTypeToParam(entity.entityType);
    if (paramName) params[paramName] = entity.entityId;
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

  const status = VERB_STATUS_MAP[verb];
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

// --- Leaf: capitalize first letter ---

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
