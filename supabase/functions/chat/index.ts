// HouseOps Chat Edge Function — Groq proxy.
// Authenticates user, loads conversation history, calls Groq, persists messages, returns response.
// Does NOT execute tool calls — returns them to frontend for user confirmation.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TOOL_SCHEMAS } from "../_shared/tool-schemas.ts";
import { buildSystemPromptWithDate } from "../_shared/system-prompt.ts";
import {
  buildGroqHeaders,
  extractToolCalls,
  formatChatResponse,
  formatMessageForGroq,
  type ChatResponse,
  type GroqMessage,
  type GroqResponse,
  type GroqToolCall,
} from "../_shared/groq-messages.ts";

// -- Types --

interface ChatRequest {
  message: string;
  conversation_id?: number;
}

// -- Configuration --

const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = "openai/gpt-oss-20b";
const ESCALATION_MODEL = "openai/gpt-oss-120b";
const MAX_HISTORY_MESSAGES = 20;

// -- Concept functions --

async function authenticateUser(
  request: Request,
): Promise<{ userId: string; householdId: number }> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "Missing Authorization header");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) throw new HttpError(401, "Invalid token");

  const { data: profile, error: profileError } = await anonClient
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) throw new HttpError(403, "No profile found");

  return {
    userId: user.id,
    householdId: profile.household_id,
  };
}

async function resolveConversation(
  serviceClient: SupabaseClient,
  conversationId: number | undefined,
  userId: string,
  householdId: number,
): Promise<number> {
  if (conversationId) {
    const { data, error } = await serviceClient
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("household_id", householdId)
      .single();

    if (error || !data) throw new HttpError(404, "Conversation not found");
    return conversationId;
  }

  const { data, error } = await serviceClient
    .from("conversations")
    .insert({ household_id: householdId, user_id: userId })
    .select("id")
    .single();

  if (error || !data) throw new HttpError(500, "Failed to create conversation");
  return data.id;
}

async function loadConversationHistory(
  serviceClient: SupabaseClient,
  conversationId: number,
): Promise<GroqMessage[]> {
  const { data: rows, error } = await serviceClient
    .from("messages")
    .select("role, content, tool_calls, tool_call_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);

  if (error) throw new HttpError(500, "Failed to load history");
  return (rows ?? []).map(formatMessageForGroq);
}

async function callGroqChat(
  messages: GroqMessage[],
  apiKey: string,
  model: string,
): Promise<{ message: GroqMessage; model: string }> {
  const response = await fetch(GROQ_BASE_URL, {
    method: "POST",
    headers: buildGroqHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(502, `Groq API error ${response.status}: ${body}`);
  }

  const data: GroqResponse = await response.json();
  return {
    message: data.choices[0].message,
    model: data.model,
  };
}

async function persistMessages(
  serviceClient: SupabaseClient,
  conversationId: number,
  userMessage: string,
  assistantMessage: GroqMessage,
): Promise<void> {
  const userRow = {
    conversation_id: conversationId,
    role: "user",
    content: userMessage,
  };

  const assistantRow = {
    conversation_id: conversationId,
    role: "assistant",
    content: assistantMessage.content,
    tool_calls: assistantMessage.tool_calls ?? null,
  };

  const { error } = await serviceClient
    .from("messages")
    .insert([userRow, assistantRow]);

  if (error) throw new HttpError(500, "Failed to persist messages");
}

async function touchConversationTimestamp(
  serviceClient: SupabaseClient,
  conversationId: number,
): Promise<void> {
  await serviceClient
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

async function logProposedActions(
  serviceClient: SupabaseClient,
  assistantMessage: GroqMessage,
  userMessage: string,
  modelUsed: string,
  householdId: number,
  conversationId: number,
  userId: string,
): Promise<void> {
  const toolCalls = extractToolCalls(assistantMessage);
  if (toolCalls.length === 0) return;

  await serviceClient.from("action_log").insert(
    toolCalls.map((tc) => ({
      input_text: userMessage,
      model_used: modelUsed,
      proposed_action: { tool: tc.function.name, arguments: JSON.parse(tc.function.arguments) },
      confirmed: null,
      household_id: householdId,
      conversation_id: conversationId,
      user_id: userId,
    })),
  );
}

async function callGroqWithEscalation(
  messages: GroqMessage[],
  apiKey: string,
): Promise<{ message: GroqMessage; model: string }> {
  const result = await callGroqChat(messages, apiKey, PRIMARY_MODEL);

  const isRefusal = PRIMARY_MODEL !== ESCALATION_MODEL &&
    result.message.content?.toLowerCase().includes("i can't") &&
    extractToolCalls(result.message).length === 0;

  if (isRefusal) {
    return callGroqChat(messages, apiKey, ESCALATION_MODEL);
  }
  return result;
}

// -- Error handling --

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function buildErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  console.error("Unexpected error:", error);
  return new Response(JSON.stringify({ error: "Internal server error" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

// -- Orchestrator --

async function handleChatRequest(request: Request): Promise<Response> {
  const { userId, householdId } = await authenticateUser(request);

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body: ChatRequest = await request.json();
  if (!body.message?.trim()) throw new HttpError(400, "Message is required");

  const conversationId = await resolveConversation(
    serviceClient,
    body.conversation_id,
    userId,
    householdId,
  );

  const history = await loadConversationHistory(serviceClient, conversationId);
  const currentDate = new Date().toISOString().split("T")[0];
  const systemMessage: GroqMessage = {
    role: "system",
    content: buildSystemPromptWithDate(currentDate),
  };

  const groqMessages: GroqMessage[] = [
    systemMessage,
    ...history,
    { role: "user", content: body.message },
  ];

  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) throw new HttpError(500, "GROQ_API_KEY not configured");

  const result = await callGroqWithEscalation(groqMessages, groqApiKey);

  await persistMessages(serviceClient, conversationId, body.message, result.message);
  await touchConversationTimestamp(serviceClient, conversationId);
  await logProposedActions(
    serviceClient, result.message, body.message, result.model,
    householdId, conversationId, userId,
  );

  const chatResponse = formatChatResponse(conversationId, result.message, result.model);
  return new Response(JSON.stringify(chatResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// -- Entry point --

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    return await handleChatRequest(request);
  } catch (error) {
    return buildErrorResponse(error);
  }
});
