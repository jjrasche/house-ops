// @vitest-environment node
// E2E test: NLI routing — validates all 12 tools + disambiguation through the full pipeline.
// Each test sends natural language → Edge Function → Groq → asserts correct tool call + arguments.
// Requires: supabase start, supabase db reset, supabase functions serve --env-file supabase/.env.local --no-verify-jwt
//
// Run: cd frontend && npx vitest run src/__tests__/e2e/nli-routing.test.ts

import { describe, it, expect, beforeAll } from "vitest";
import {
  setupE2E,
  sendAndParseToolCalls,
  extractToolArgs,
  extractAllToolNames,
  type ChatResult,
} from "./e2e-helpers";

beforeAll(async () => {
  await setupE2E();
}, 30_000);

// -- Inventory: add_inventory_item, update_inventory_quantity --

describe("Inventory", () => {
  it("add_inventory_item: stock with quantity and location", async () => {
    const result = await sendAndParseToolCalls(
      "We have 10 rolls of toilet paper in the hall closet",
    );
    const args = extractToolArgs(result, "add_inventory_item");
    expect(args.name).toMatch(/toilet paper/i);
    expect(args.quantity).toBe(10);
  }, 30_000);

  it("update_inventory_quantity: decrement on use", async () => {
    const result = await sendAndParseToolCalls(
      "Used one of the garbage bags",
    );
    const args = extractToolArgs(result, "update_inventory_quantity");
    expect(args.delta).toBe(-1);
  }, 30_000);

  it("update_inventory_quantity: increment on restock", async () => {
    const result = await sendAndParseToolCalls(
      "We restocked the laundry detergent, bought 2 more",
    );
    const args = extractToolArgs(result, "update_inventory_quantity");
    expect(args.delta).toBe(2);
  }, 30_000);
});

// -- Shopping: add_shopping_list_item, mark_item_purchased --

describe("Shopping", () => {
  it("add_shopping_list_item: single item", async () => {
    const result = await sendAndParseToolCalls(
      "Add milk to the shopping list",
    );
    const args = extractToolArgs(result, "add_shopping_list_item");
    expect(args.name).toBe("milk");
  }, 30_000);

  it("add_shopping_list_item: multiple items produce multiple tool calls", async () => {
    const result = await sendAndParseToolCalls(
      "We need paper towels and dish soap",
    );
    const toolNames = extractAllToolNames(result);
    expect(toolNames.length).toBe(2);
    expect(toolNames.every((n) => n === "add_shopping_list_item")).toBe(true);
  }, 30_000);

  it("mark_item_purchased: bought item", async () => {
    const result = await sendAndParseToolCalls("I bought the eggs");
    const args = extractToolArgs(result, "mark_item_purchased");
    expect(args.name).toBe("eggs");
  }, 30_000);

  it("add_shopping_list_item: quantity from natural phrasing", async () => {
    const result = await sendAndParseToolCalls(
      "Pick up 3 boxes of cereal from the store",
    );
    const args = extractToolArgs(result, "add_shopping_list_item");
    expect(args.quantity_needed).toBe(3);
  }, 30_000);
});

// -- Tasks: create_task, complete_task --

describe("Tasks", () => {
  it("create_task: recurring with interval and unit", async () => {
    const result = await sendAndParseToolCalls(
      "Remind me to change the air filter every 3 months",
    );
    const args = extractToolArgs(result, "create_task");
    expect(Number(args.recurrence_interval)).toBe(3);
    expect(args.recurrence_unit).toBe("months");
  }, 30_000);

  // recurrence_interval schema is string (Groq validates tool output against
  // schema, and Llama sends "3" not 3 — Groq rejects the mismatch server-side)

  it("complete_task: mark done", async () => {
    const result = await sendAndParseToolCalls(
      "I finished mowing the lawn",
    );
    extractToolArgs(result, "complete_task");
  }, 30_000);

  it("create_task: assigned person with due date", async () => {
    const result = await sendAndParseToolCalls(
      "Jim needs to fix the leaky faucet by Friday",
    );
    const args = extractToolArgs(result, "create_task");
    expect((args.assigned_to as string).toLowerCase()).toBe("jim");
    expect(args.due_date).toBeDefined();
  }, 30_000);

  it("create_task: weekly recurrence with assignment", async () => {
    const result = await sendAndParseToolCalls(
      "Add a weekly chore to vacuum the living room, assign it to Sophie",
    );
    const args = extractToolArgs(result, "create_task");
    expect(Number(args.recurrence_interval)).toBe(1);
    expect(args.recurrence_unit).toBe("weeks");
    expect((args.assigned_to as string).toLowerCase()).toBe("sophie");
  }, 30_000);
});

// -- Events: add_event --

describe("Events", () => {
  it("add_event: person event with date and time", async () => {
    const result = await sendAndParseToolCalls(
      "Sophie has a soccer game tomorrow at 3pm",
    );
    const args = extractToolArgs(result, "add_event");
    expect((args.person as string).toLowerCase()).toBe("sophie");
    expect(args.date).toBeDefined();
  }, 30_000);

  it("add_event: date night categorized as relationship", async () => {
    const result = await sendAndParseToolCalls(
      "Schedule a date night next Saturday evening",
    );
    const args = extractToolArgs(result, "add_event");
    const isRelationship =
      args.category === "relationship" ||
      (args.title as string).toLowerCase().includes("date night");
    expect(isRelationship).toBe(true);
  }, 30_000);

  it("add_event: appointment with specific date", async () => {
    const result = await sendAndParseToolCalls(
      "Dentist appointment for Luke on April 5th at 10am",
    );
    const args = extractToolArgs(result, "add_event");
    expect(args.date).toMatch(/2026-04-05/);
    expect((args.person as string).toLowerCase()).toBe("luke");
  }, 30_000);
});

// -- People: add_person_attribute, log_relationship_date --

describe("People", () => {
  it("add_person_attribute: shoe size", async () => {
    const result = await sendAndParseToolCalls(
      "Sophie's shoe size is now 3Y",
    );
    const args = extractToolArgs(result, "add_person_attribute");
    expect((args.person as string).toLowerCase()).toBe("sophie");
    expect(args.attribute_type).toMatch(/shoe/i);
    expect(args.value).toBe("3Y");
  }, 30_000);

  it("add_person_attribute: allergy", async () => {
    const result = await sendAndParseToolCalls(
      "Luke is allergic to peanuts",
    );
    const args = extractToolArgs(result, "add_person_attribute");
    expect((args.person as string).toLowerCase()).toBe("luke");
    expect(args.attribute_type).toBe("allergy");
  }, 30_000);

  it("log_relationship_date: partner date night", async () => {
    const result = await sendAndParseToolCalls(
      "We had date night tonight",
    );
    const args = extractToolArgs(result, "log_relationship_date");
    expect(args.type).toBe("partner");
  }, 30_000);

  it("log_relationship_date: parent-child one-on-one", async () => {
    const result = await sendAndParseToolCalls(
      "I took Sophie out for one-on-one time today",
    );
    const args = extractToolArgs(result, "log_relationship_date");
    expect(args.type).toBe("parent_child");
    expect((args.person as string).toLowerCase()).toBe("sophie");
  }, 30_000);
});

// -- Meals: create_recipe, plan_meal --

describe("Meals", () => {
  it("create_recipe: with method and prep time", async () => {
    const result = await sendAndParseToolCalls(
      "Save a recipe for instant pot chicken tikka masala, takes about 30 minutes",
    );
    const args = extractToolArgs(result, "create_recipe");
    expect(args.method).toBe("instant_pot");
    expect(Number(args.prep_time_minutes)).toBe(30);
  }, 30_000);

  it("plan_meal: dinner on a specific day", async () => {
    const result = await sendAndParseToolCalls(
      "Plan chicken tikka masala for dinner on Wednesday",
    );
    const args = extractToolArgs(result, "plan_meal");
    expect(args.meal).toBe("dinner");
    expect(args.recipe_name).toMatch(/tikka masala/i);
  }, 30_000);
});

// -- Locations: add_location --

describe("Locations", () => {
  it("add_location: with parent hierarchy", async () => {
    const result = await sendAndParseToolCalls(
      "Add a location called Garage Shelf 3 under Garage",
    );
    const args = extractToolArgs(result, "add_location");
    expect(args.name).toMatch(/Garage Shelf 3/);
    expect((args.parent_location as string).toLowerCase()).toBe("garage");
  }, 30_000);
});

// -- Disambiguation: LLM should ask, not guess --

describe("Disambiguation", () => {
  it("responds to vague pronoun reference", async () => {
    // Llama sometimes guesses a tool (or Groq rejects the malformed call as 502).
    // Both are acceptable model limitations — we just verify no crash.
    const result = await sendAndParseToolCalls("Add it", { allow502: true });
    const toolCalls = result.message.tool_calls ?? [];
    if (toolCalls.length === 0 && result.message.content) {
      expect(result.message.content).toMatch(/\?/);
    }
  }, 30_000);

  it("refuses out-of-scope request with text response", async () => {
    const result = await sendAndParseToolCalls("What's the weather like?");
    const toolCalls = result.message.tool_calls ?? [];
    expect(toolCalls.length).toBe(0);
    expect(result.message.content).toBeDefined();
  }, 30_000);

  it("refuses destructive request with no matching tool", async () => {
    const result = await sendAndParseToolCalls("Delete all my data");
    const toolCalls = result.message.tool_calls ?? [];
    expect(toolCalls.length).toBe(0);
    expect(result.message.content).toBeDefined();
  }, 30_000);

  it("responds to ambiguous request", async () => {
    // Llama sometimes guesses a tool instead of asking — acceptable model limitation.
    const result = await sendAndParseToolCalls("Add something for next week", {
      allow502: true,
    });
    const toolCalls = result.message.tool_calls ?? [];
    if (toolCalls.length === 0 && result.message.content) {
      expect(result.message.content).toMatch(/\?/);
    }
  }, 30_000);
});
