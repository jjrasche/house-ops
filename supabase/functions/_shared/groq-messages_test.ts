import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildGroqHeaders,
  extractToolCalls,
  formatChatResponse,
  formatMessageForGroq,
  type GroqMessage,
  type GroqToolCall,
} from "./groq-messages.ts";

// -- formatMessageForGroq --

Deno.test("formatMessageForGroq includes role and content", () => {
  const row = { role: "user", content: "hello", tool_calls: null, tool_call_id: null };
  const result = formatMessageForGroq(row);

  assertEquals(result.role, "user");
  assertEquals(result.content, "hello");
  assertEquals(result.tool_calls, undefined);
  assertEquals(result.tool_call_id, undefined);
});

Deno.test("formatMessageForGroq includes tool_calls when present", () => {
  const toolCall: GroqToolCall = {
    id: "call_1",
    type: "function",
    function: { name: "add_event", arguments: '{"title":"test"}' },
  };
  const row = { role: "assistant", content: null, tool_calls: [toolCall], tool_call_id: null };
  const result = formatMessageForGroq(row);

  assertEquals(result.tool_calls?.length, 1);
  assertEquals(result.tool_calls![0].function.name, "add_event");
  assertEquals(result.tool_call_id, undefined);
});

Deno.test("formatMessageForGroq includes tool_call_id for tool responses", () => {
  const row = { role: "tool", content: '{"ok":true}', tool_calls: null, tool_call_id: "call_1" };
  const result = formatMessageForGroq(row);

  assertEquals(result.role, "tool");
  assertEquals(result.tool_call_id, "call_1");
  assertEquals(result.tool_calls, undefined);
});

Deno.test("formatMessageForGroq handles null content", () => {
  const row = { role: "assistant", content: null, tool_calls: null, tool_call_id: null };
  const result = formatMessageForGroq(row);

  assertEquals(result.content, null);
});

// -- extractToolCalls --

Deno.test("extractToolCalls returns empty array when no tool_calls", () => {
  const message: GroqMessage = { role: "assistant", content: "Hello" };
  assertEquals(extractToolCalls(message), []);
});

Deno.test("extractToolCalls returns empty array when tool_calls is undefined", () => {
  const message: GroqMessage = { role: "assistant", content: null, tool_calls: undefined };
  assertEquals(extractToolCalls(message), []);
});

Deno.test("extractToolCalls returns tool calls when present", () => {
  const toolCalls: GroqToolCall[] = [
    { id: "call_1", type: "function", function: { name: "add_event", arguments: "{}" } },
    { id: "call_2", type: "function", function: { name: "create_task", arguments: "{}" } },
  ];
  const message: GroqMessage = { role: "assistant", content: null, tool_calls: toolCalls };

  assertEquals(extractToolCalls(message).length, 2);
  assertEquals(extractToolCalls(message)[0].function.name, "add_event");
  assertEquals(extractToolCalls(message)[1].function.name, "create_task");
});

// -- buildGroqHeaders --

Deno.test("buildGroqHeaders sets Authorization and Content-Type", () => {
  const headers = buildGroqHeaders("test-key-123");

  assertEquals(headers["Authorization"], "Bearer test-key-123");
  assertEquals(headers["Content-Type"], "application/json");
});

// -- formatChatResponse --

Deno.test("formatChatResponse structures response correctly", () => {
  const message: GroqMessage = { role: "assistant", content: "Done" };
  const response = formatChatResponse(42, message, "llama-3.3-70b-versatile");

  assertEquals(response.conversation_id, 42);
  assertEquals(response.message.content, "Done");
  assertEquals(response.model, "llama-3.3-70b-versatile");
});

Deno.test("formatChatResponse preserves tool calls in message", () => {
  const toolCalls: GroqToolCall[] = [
    { id: "call_1", type: "function", function: { name: "add_event", arguments: '{"title":"test"}' } },
  ];
  const message: GroqMessage = { role: "assistant", content: null, tool_calls: toolCalls };
  const response = formatChatResponse(7, message, "llama-3.3-70b-versatile");

  assertEquals(response.message.tool_calls?.length, 1);
  assertEquals(response.message.tool_calls![0].function.name, "add_event");
});
