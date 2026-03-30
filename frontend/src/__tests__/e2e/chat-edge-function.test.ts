// @vitest-environment node
// E2E test: Chat Edge Function pipeline (auth, persistence, conversation continuity).
// Requires: supabase start, supabase db reset, supabase functions serve --env-file supabase/.env.local --no-verify-jwt
//
// Run: cd frontend && npx vitest run src/__tests__/e2e/chat-edge-function.test.ts

import { describe, it, expect, beforeAll } from "vitest";
import {
  setupE2E,
  callChatFunction,
  sendAndParseToolCalls,
  adminClient,
  FUNCTIONS_URL,
  ANON_KEY,
} from "./e2e-helpers";

let userAccessToken: string;

describe("Chat Edge Function E2E", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 30_000);

  it("returns 401 without auth header", async () => {
    const response = await fetch(`${FUNCTIONS_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ message: "hello" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 for empty message", async () => {
    const response = await callChatFunction("");
    expect(response.status).toBe(400);
  });

  it("returns a valid chat response with tool calls for a task request", async () => {
    const result = await sendAndParseToolCalls(
      "Add a task to clean the gutters this Saturday",
    );
    expect(result.conversation_id).toBeGreaterThan(0);
    expect(result.model).toBeDefined();

    const toolCalls = result.message.tool_calls ?? [];
    expect(toolCalls.length).toBeGreaterThan(0);
    expect(toolCalls[0].function.name).toBe("create_task");

    const args = JSON.parse(toolCalls[0].function.arguments);
    expect(args.title).toBeDefined();
  }, 30_000);

  it("persists messages to the database", async () => {
    const result = await sendAndParseToolCalls(
      "Add milk to the shopping list",
    );

    const { data: messages, error } = await adminClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", result.conversation_id)
      .order("created_at", { ascending: true });

    expect(error).toBeNull();
    expect(messages!.length).toBeGreaterThanOrEqual(2);

    const userMsg = messages!.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("Add milk to the shopping list");

    const assistantMsg = messages!.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
  }, 30_000);

  it("logs proposed actions to action_log", async () => {
    const result = await sendAndParseToolCalls("We need to buy paper towels");

    const toolCalls = result.message.tool_calls ?? [];
    expect(toolCalls.length).toBeGreaterThan(0);

    const { data: logs, error } = await adminClient
      .from("action_log")
      .select("input_text, proposed_action, confirmed")
      .eq("conversation_id", result.conversation_id);

    expect(error).toBeNull();
    expect(logs!.length).toBeGreaterThan(0);
    expect(logs![0].confirmed).toBeNull();
    expect(logs![0].proposed_action.tool).toBeDefined();
  }, 30_000);

  it("continues an existing conversation", async () => {
    const firstResult = await sendAndParseToolCalls("Hello");
    const conversationId = firstResult.conversation_id;

    const secondResult = await sendAndParseToolCalls(
      "Actually, add a task to mow the lawn",
    );
    // New conversation since sendAndParseToolCalls doesn't pass conversationId
    // Use callChatFunction directly to test continuity
    const response = await callChatFunction(
      "Now add another task to rake the leaves",
      conversationId,
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversation_id).toBe(conversationId);
  }, 60_000);

  it("returns 405 for GET requests", async () => {
    const response = await fetch(`${FUNCTIONS_URL}/chat`, {
      method: "GET",
      headers: { apikey: ANON_KEY },
    });
    expect(response.status).toBe(405);
  });
});
