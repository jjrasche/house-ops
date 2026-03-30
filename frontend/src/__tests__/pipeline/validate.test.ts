import { describe, it, expect } from 'vitest';
import type { ValidateInput, ValidateOutput, ToolCall } from '../../lib/pipeline/types';
import { ITEMS, PEOPLE, LOCATIONS } from './seed';

// Stub: schema validation + FK existence checks.
// Real implementation queries Postgres for FK validity.
function stubValidate(input: ValidateInput): ValidateOutput {
  const errors: string[] = [];

  const toolSchema = TOOL_SCHEMAS[input.toolCall.tool];
  if (!toolSchema) {
    return { isValid: false, errors: [`Unknown tool: ${input.toolCall.tool}`], confidence: 0 };
  }

  for (const required of toolSchema.requiredParams) {
    if (!(required in input.toolCall.params)) {
      errors.push(`Missing required param: ${required}`);
    }
  }

  for (const [paramName, paramValue] of Object.entries(input.toolCall.params)) {
    const refType = toolSchema.referenceParams[paramName];
    if (refType && typeof paramValue === 'number') {
      if (!seedEntityExists(refType, paramValue)) {
        errors.push(`FK not found: ${paramName}=${paramValue} (type: ${refType})`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    confidence: errors.length === 0 ? 0.92 : 0,
  };
}

interface ToolSchema {
  requiredParams: string[];
  referenceParams: Record<string, string>;
}

const TOOL_SCHEMAS: Record<string, ToolSchema> = {
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

function seedEntityExists(entityType: string, entityId: number): boolean {
  const lookups: Record<string, Record<string, { id: number }>> = {
    item: ITEMS,
    person: PEOPLE,
    location: LOCATIONS,
  };
  const table = lookups[entityType];
  if (!table) return true; // action IDs validated differently
  return Object.values(table).some(row => row.id === entityId);
}

describe('VALIDATE stage', () => {
  it('accepts valid update_item with resolved FK', () => {
    const output = stubValidate({
      toolCall: { tool: 'update_item', params: { item_id: 1, status: 'on_list' } },
    });
    expect(output.isValid).toBe(true);
    expect(output.errors).toHaveLength(0);
  });

  it('rejects update_item with missing item_id', () => {
    const output = stubValidate({
      toolCall: { tool: 'update_item', params: { status: 'on_list' } },
    });
    expect(output.isValid).toBe(false);
    expect(output.errors).toContain('Missing required param: item_id');
  });

  it('rejects update_item with invalid FK', () => {
    const output = stubValidate({
      toolCall: { tool: 'update_item', params: { item_id: 999 } },
    });
    expect(output.isValid).toBe(false);
    expect(output.errors[0]).toContain('FK not found');
  });

  it('accepts create_action with valid person reference', () => {
    const output = stubValidate({
      toolCall: {
        tool: 'create_action',
        params: { title: 'Wrestling', person_id: 4, starts_at: '2026-03-30T16:00' },
      },
    });
    expect(output.isValid).toBe(true);
  });

  it('rejects create_action with missing title', () => {
    const output = stubValidate({
      toolCall: { tool: 'create_action', params: { person_id: 4 } },
    });
    expect(output.isValid).toBe(false);
    expect(output.errors).toContain('Missing required param: title');
  });

  it('rejects unknown tool', () => {
    const output = stubValidate({
      toolCall: { tool: 'nonexistent_tool', params: {} },
    });
    expect(output.isValid).toBe(false);
    expect(output.errors[0]).toContain('Unknown tool');
  });

  it('accepts update_item with location FK', () => {
    const output = stubValidate({
      toolCall: {
        tool: 'update_item',
        params: { item_id: 6, quantity: 10, location_id: 5, status: 'stocked' },
      },
    });
    expect(output.isValid).toBe(true);
  });

  it('accepts create_recipe with name only', () => {
    const output = stubValidate({
      toolCall: {
        tool: 'create_recipe',
        params: { name: 'Chicken Tikka Masala', method: 'instant_pot' },
      },
    });
    expect(output.isValid).toBe(true);
  });
});
