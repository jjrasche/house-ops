// @vitest-environment node
// Model comparison: runs NLI routing tests directly against Groq API for each model.
// Bypasses the Edge Function to test model quality in isolation.
//
// Run: cd frontend && npx vitest run src/__tests__/e2e/model-comparison.test.ts

import { describe, it, expect } from "vitest";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const MODELS_TO_TEST = [
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "openai/gpt-oss-120b",
  "qwen/qwen3-32b",
];

// Inline system prompt + tool schemas to avoid Deno import issues
const SYSTEM_PROMPT = `You are HouseOps, a household operations assistant. You help a family manage their home by turning natural language into structured actions.

## What you can do

You have tools for: inventory tracking, shopping lists, task management, calendar events, recipes, meal planning, person attributes (sizes, allergies, preferences), relationship date logging, and storage locations.

## Rules

### Tool calls vs. text — never both
- If the user's intent maps to a tool, respond with ONLY a tool call. No accompanying text.
- If you need clarification or the request is conversational, respond with ONLY text. No tool call.
- Never combine a tool call with explanatory text in the same response.

### Disambiguation — ask, don't guess
- If the user's intent is ambiguous (could map to multiple tools), ask a short clarifying question.
- If a required parameter is missing and can't be reasonably inferred, ask for it.
- If a name could match multiple people, items, or locations, ask which one.
- Reasonable defaults: omit optional parameters rather than guessing values. Let the database defaults apply.
- If the message is too vague to determine WHICH tool to use (e.g. "add it", "add something"), always ask — never guess a tool.

### Shopping list awareness
- "I bought X" or "got the X" = \`mark_item_purchased\` (marks an existing shopping list item as bought).
- "We need X" or "add X to the shopping list" = \`add_shopping_list_item\`.
- Do NOT use \`add_inventory_item\` for purchase confirmations — that's for stocking or discovering items already on hand.

### Parameter conventions
- People, locations, and recipes are passed as plain-text names. The application layer resolves them to IDs.
- Dates should be ISO 8601 format. Parse natural language dates into this format.
- For inventory updates, prefer \`delta\` (relative change) over \`quantity\` (absolute) when the user says "used one" or "bought 3 more".

## Current date
2026-03-29
`;

const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "add_inventory_item",
      description: "Add a new item to household inventory.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name" },
          category: { type: "string", description: "Category" },
          quantity: { type: "number", description: "Quantity on hand" },
          unit: { type: "string", description: "Unit of measure" },
          location: { type: "string", description: "Storage location" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_inventory_quantity",
      description: "Update quantity of existing inventory item.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name" },
          quantity: { type: "number", description: "New absolute quantity" },
          delta: { type: "number", description: "Relative change" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_shopping_list_item",
      description: "Add an item to the shopping list.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item to buy" },
          quantity_needed: { type: "number", description: "How many" },
          store_section: { type: "string", description: "Aisle or section" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_item_purchased",
      description: "Mark a shopping list item as purchased.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a household task.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Details" },
          category: { type: "string", description: "Category" },
          assigned_to: { type: "string", description: "Person name" },
          due_date: { type: "string", description: "ISO 8601 date" },
          recurrence_interval: { type: "string", description: "Repeat interval" },
          recurrence_unit: {
            type: "string",
            enum: ["days", "weeks", "months", "years"],
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as done.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_event",
      description: "Add a calendar event.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          description: { type: "string", description: "Details" },
          category: { type: "string", description: "Category" },
          date: { type: "string", description: "ISO 8601 date" },
          end_date: { type: "string", description: "End date" },
          all_day: { type: "boolean", description: "All-day event" },
          person: { type: "string", description: "Person name" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_recipe",
      description: "Save a new recipe.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Recipe name" },
          method: {
            type: "string",
            enum: ["instant_pot", "air_fryer", "stovetop", "oven", "grill", "other"],
          },
          prep_time_minutes: { type: "number", description: "Prep time" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_meal",
      description: "Add a meal to the meal plan.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date YYYY-MM-DD" },
          meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
          recipe_name: { type: "string", description: "Recipe name" },
          notes: { type: "string", description: "Meal notes" },
        },
        required: ["date", "meal", "recipe_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_person_attribute",
      description: "Record an attribute about a person (EAV pattern).",
      parameters: {
        type: "object",
        properties: {
          person: { type: "string", description: "Person name" },
          attribute_type: { type: "string", description: "Attribute key" },
          value: { type: "string", description: "Attribute value" },
        },
        required: ["person", "attribute_type", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_relationship_date",
      description: "Log that a relationship date occurred.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["partner", "parent_child"] },
          person: { type: "string", description: "Person name" },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_location",
      description: "Add a storage location.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Location name" },
          parent_location: { type: "string", description: "Parent location" },
        },
        required: ["name"],
      },
    },
  },
];

// -- Test cases: [input, expectedTool, argValidator] --

interface TestCase {
  input: string;
  expectedTool: string;
  validateArgs?: (args: Record<string, unknown>) => boolean;
}

const TOOL_CALL_CASES: TestCase[] = [
  // Inventory
  {
    input: "We have 10 rolls of toilet paper in the hall closet",
    expectedTool: "add_inventory_item",
    validateArgs: (a) =>
      /toilet paper/i.test(a.name as string) && a.quantity === 10,
  },
  {
    input: "Used one of the garbage bags",
    expectedTool: "update_inventory_quantity",
    validateArgs: (a) => a.delta === -1,
  },
  {
    input: "We restocked the laundry detergent, bought 2 more",
    expectedTool: "update_inventory_quantity",
    validateArgs: (a) => a.delta === 2,
  },
  // Shopping
  {
    input: "Add milk to the shopping list",
    expectedTool: "add_shopping_list_item",
    validateArgs: (a) => a.name === "milk",
  },
  {
    input: "I bought the eggs",
    expectedTool: "mark_item_purchased",
    validateArgs: (a) => a.name === "eggs",
  },
  {
    input: "Pick up 3 boxes of cereal from the store",
    expectedTool: "add_shopping_list_item",
    validateArgs: (a) => a.quantity_needed === 3,
  },
  // Tasks
  {
    input: "Remind me to change the air filter every 3 months",
    expectedTool: "create_task",
    validateArgs: (a) =>
      Number(a.recurrence_interval) === 3 && a.recurrence_unit === "months",
  },
  {
    input: "I finished mowing the lawn",
    expectedTool: "complete_task",
  },
  {
    input: "Jim needs to fix the leaky faucet by Friday",
    expectedTool: "create_task",
    validateArgs: (a) =>
      (a.assigned_to as string)?.toLowerCase() === "jim" && a.due_date != null,
  },
  {
    input: "Add a weekly chore to vacuum the living room, assign it to Sophie",
    expectedTool: "create_task",
    validateArgs: (a) =>
      Number(a.recurrence_interval) === 1 &&
      a.recurrence_unit === "weeks" &&
      (a.assigned_to as string)?.toLowerCase() === "sophie",
  },
  // Events
  {
    input: "Sophie has a soccer game tomorrow at 3pm",
    expectedTool: "add_event",
    validateArgs: (a) => (a.person as string)?.toLowerCase() === "sophie",
  },
  {
    input: "Schedule a date night next Saturday evening",
    expectedTool: "add_event",
  },
  {
    input: "Dentist appointment for Luke on April 5th at 10am",
    expectedTool: "add_event",
    validateArgs: (a) =>
      (a.date as string)?.includes("2026-04-05") &&
      (a.person as string)?.toLowerCase() === "luke",
  },
  // People
  {
    input: "Sophie's shoe size is now 3Y",
    expectedTool: "add_person_attribute",
    validateArgs: (a) =>
      (a.person as string)?.toLowerCase() === "sophie" && a.value === "3Y",
  },
  {
    input: "Luke is allergic to peanuts",
    expectedTool: "add_person_attribute",
    validateArgs: (a) =>
      (a.person as string)?.toLowerCase() === "luke" &&
      a.attribute_type === "allergy",
  },
  {
    input: "We had date night tonight",
    expectedTool: "log_relationship_date",
    validateArgs: (a) => a.type === "partner",
  },
  {
    input: "I took Sophie out for one-on-one time today",
    expectedTool: "log_relationship_date",
    validateArgs: (a) =>
      a.type === "parent_child" &&
      (a.person as string)?.toLowerCase() === "sophie",
  },
  // Meals
  {
    input: "Save a recipe for instant pot chicken tikka masala, takes about 30 minutes",
    expectedTool: "create_recipe",
    validateArgs: (a) =>
      a.method === "instant_pot" && Number(a.prep_time_minutes) === 30,
  },
  {
    input: "Plan chicken tikka masala for dinner on Wednesday",
    expectedTool: "plan_meal",
    validateArgs: (a) =>
      a.meal === "dinner" && /tikka masala/i.test(a.recipe_name as string),
  },
  // Locations
  {
    input: "Add a location called Garage Shelf 3 under Garage",
    expectedTool: "add_location",
    validateArgs: (a) =>
      /Garage Shelf 3/.test(a.name as string) &&
      (a.parent_location as string)?.toLowerCase() === "garage",
  },
  // Multi-tool: shopping list with two items
  {
    input: "We need paper towels and dish soap",
    expectedTool: "add_shopping_list_item",
  },
];

// -- Groq API caller --

interface GroqToolCall {
  function: { name: string; arguments: string };
}

interface ModelResult {
  toolName: string | null;
  args: Record<string, unknown> | null;
  allToolCalls: GroqToolCall[];
  content: string | null;
  error: string | null;
}

async function callGroqDirect(
  model: string,
  userMessage: string,
): Promise<ModelResult> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      tools: TOOL_SCHEMAS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      toolName: null,
      args: null,
      allToolCalls: [],
      content: null,
      error: `${response.status}: ${body.slice(0, 200)}`,
    };
  }

  const data = await response.json();
  const message = data.choices[0].message;
  const toolCalls: GroqToolCall[] = message.tool_calls ?? [];

  return {
    toolName: toolCalls[0]?.function.name ?? null,
    args: toolCalls[0] ? JSON.parse(toolCalls[0].function.arguments) : null,
    allToolCalls: toolCalls,
    content: message.content,
    error: null,
  };
}

// -- Test runner per model --

if (!GROQ_API_KEY) {
  describe.skip("Model comparison (GROQ_API_KEY not set)", () => {
    it("skipped", () => {});
  });
} else {
  for (const model of MODELS_TO_TEST) {
    describe(`Model: ${model}`, () => {
      const results: Array<{
        input: string;
        pass: boolean;
        detail: string;
      }> = [];

      for (const tc of TOOL_CALL_CASES) {
        it(`${tc.expectedTool}: ${tc.input.slice(0, 50)}`, async () => {
          const result = await callGroqDirect(model, tc.input);

          if (result.error) {
            results.push({
              input: tc.input,
              pass: false,
              detail: `API error: ${result.error}`,
            });
            expect.fail(`Groq API error: ${result.error}`);
          }

          // Check correct tool was called
          const correctTool = result.toolName === tc.expectedTool;
          if (!correctTool) {
            results.push({
              input: tc.input,
              pass: false,
              detail: `Expected ${tc.expectedTool}, got ${result.toolName ?? "text: " + result.content?.slice(0, 60)}`,
            });
            expect(result.toolName).toBe(tc.expectedTool);
            return;
          }

          // Check args if validator provided
          if (tc.validateArgs && result.args) {
            const argsValid = tc.validateArgs(result.args);
            results.push({
              input: tc.input,
              pass: argsValid,
              detail: argsValid
                ? "OK"
                : `Args failed: ${JSON.stringify(result.args)}`,
            });
            expect(argsValid).toBe(true);
          } else {
            results.push({ input: tc.input, pass: true, detail: "OK" });
          }
        }, 30_000);
      }

      // Print summary after all tests for this model
      it("SUMMARY", () => {
        const passed = results.filter((r) => r.pass).length;
        const total = results.length;
        console.log(`\n=== ${model}: ${passed}/${total} ===`);
        for (const r of results.filter((r) => !r.pass)) {
          console.log(`  FAIL: ${r.input.slice(0, 50)} — ${r.detail}`);
        }
      });
    });
  }
}
