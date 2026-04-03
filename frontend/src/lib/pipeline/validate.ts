import type { ValidateInput, ValidateOutput, ToolCall } from './types';

// --- Public types ---

export interface ToolSchema {
  readonly requiredParams: readonly string[];
  readonly referenceParams: Readonly<Record<string, string>>;
}

export interface ValidateOptions {
  readonly entityExists?: (entityType: string, entityId: number) => Promise<boolean>;
}

// --- Tool schema registry ---
// Required and reference params per tool. Reference params must resolve
// to existing DB rows; required params must be present in the tool call.

export const TOOL_SCHEMAS: Readonly<Record<string, ToolSchema>> = {
  update_item: {
    requiredParams: ['item_id'],
    referenceParams: {
      item_id: 'item',
      location_id: 'location',
      person_id: 'person',
    },
  },
  create_action: {
    requiredParams: ['title'],
    referenceParams: {
      person_id: 'person',
      assigned_to: 'person',
    },
  },
  update_action: {
    requiredParams: ['action_id'],
    referenceParams: {
      action_id: 'action',
    },
  },
  create_item: {
    requiredParams: ['name'],
    referenceParams: {
      person_id: 'person',
      location_id: 'location',
    },
  },
  create_recipe: {
    requiredParams: ['name'],
    referenceParams: {},
  },
};

// --- Orchestrator ---

export async function validate(
  input: ValidateInput,
  options: ValidateOptions = {},
): Promise<ValidateOutput> {
  const schemaErrors = checkSchema(input.toolCall);
  if (schemaErrors.length > 0) {
    return { isValid: false, errors: schemaErrors, confidence: 0 };
  }

  const fkErrors = await checkForeignKeys(input.toolCall, options.entityExists);

  return {
    isValid: fkErrors.length === 0,
    errors: fkErrors,
    confidence: fkErrors.length === 0 ? 0.92 : 0,
  };
}

// --- Concept: check tool schema (tool exists, required params present) ---

function checkSchema(toolCall: ToolCall): string[] {
  const schema = TOOL_SCHEMAS[toolCall.tool];
  if (!schema) {
    return [`Unknown tool: ${toolCall.tool}`];
  }

  return findMissingParams(toolCall, schema.requiredParams);
}

// --- Concept: check foreign key references exist ---

async function checkForeignKeys(
  toolCall: ToolCall,
  entityExists?: (entityType: string, entityId: number) => Promise<boolean>,
): Promise<string[]> {
  if (!entityExists) return [];

  const schema = TOOL_SCHEMAS[toolCall.tool];
  if (!schema) return [];

  const errors: string[] = [];
  for (const [paramName, paramValue] of Object.entries(toolCall.params)) {
    const entityType = schema.referenceParams[paramName];
    if (!entityType || typeof paramValue !== 'number') continue;

    const exists = await entityExists(entityType, paramValue);
    if (!exists) {
      errors.push(`FK not found: ${paramName}=${paramValue} (type: ${entityType})`);
    }
  }

  return errors;
}

// --- Leaf: find required params missing from tool call ---

function findMissingParams(
  toolCall: ToolCall,
  requiredParams: readonly string[],
): string[] {
  return requiredParams.filter(param => !(param in toolCall.params))
    .map(param => `Missing required param: ${param}`);
}
