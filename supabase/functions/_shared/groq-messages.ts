// Pure functions for transforming Groq/OpenAI message formats.
// Shared between chat Edge Function and tests.

export interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

export interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface GroqResponse {
  choices: Array<{
    message: GroqMessage;
    finish_reason: string;
  }>;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface ChatResponse {
  conversation_id: number;
  message: GroqMessage;
  model: string;
}

export function formatMessageForGroq(row: {
  role: string;
  content: string | null;
  tool_calls: GroqToolCall[] | null;
  tool_call_id: string | null;
}): GroqMessage {
  const message: GroqMessage = {
    role: row.role as GroqMessage["role"],
    content: row.content,
  };
  if (row.tool_calls) message.tool_calls = row.tool_calls;
  if (row.tool_call_id) message.tool_call_id = row.tool_call_id;
  return message;
}

export function extractToolCalls(groqMessage: GroqMessage): GroqToolCall[] {
  return groqMessage.tool_calls ?? [];
}

export function buildGroqHeaders(apiKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export function formatChatResponse(
  conversationId: number,
  message: GroqMessage,
  model: string,
): ChatResponse {
  return { conversation_id: conversationId, message, model };
}
