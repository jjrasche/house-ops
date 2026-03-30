// Shared setup for E2E tests against local Supabase + Edge Functions.
// Requires: supabase start, supabase db reset, supabase functions serve --env-file supabase/.env.local --no-verify-jwt

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const API_URL = "http://127.0.0.1:54421";
export const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const FUNCTIONS_URL = `${API_URL}/functions/v1`;

const TEST_EMAIL = "test@house-ops.local";
const TEST_PASSWORD = "test-password-123";

export interface ChatResult {
  conversation_id: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  };
  model: string;
}

export let adminClient: SupabaseClient;
let userAccessToken: string;

export async function setupE2E(): Promise<void> {
  adminClient = createClient(API_URL, SERVICE_ROLE_KEY);
  await ensureTestUser();
  userAccessToken = await signInTestUser();
}

async function ensureTestUser(): Promise<string> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { household_id: 1, display_name: "Test User" },
  });
  if (error?.message?.includes("already been registered")) {
    const { data: list } = await adminClient.auth.admin.listUsers();
    const existing = list.users.find((u) => u.email === TEST_EMAIL);
    if (!existing) throw new Error("User exists but not found in list");
    return existing.id;
  }
  if (error) throw new Error(`Failed to create test user: ${error.message}`);
  return data.user.id;
}

async function signInTestUser(): Promise<string> {
  const anonClient = createClient(API_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`Failed to sign in: ${error.message}`);
  return data.session!.access_token;
}

export async function callChatFunction(
  message: string,
  conversationId?: number,
): Promise<Response> {
  const body: Record<string, unknown> = { message };
  if (conversationId) body.conversation_id = conversationId;

  return fetch(`${FUNCTIONS_URL}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
}

export async function sendAndParseToolCalls(
  message: string,
  options?: { allow502?: boolean },
): Promise<ChatResult> {
  const response = await callChatFunction(message);
  if (!response.ok) {
    // 502 from Groq tool_use_failed — LLM tried an invalid tool call.
    // Some tests (disambiguation) expect this as acceptable model behavior.
    if (response.status === 502 && options?.allow502) {
      return {
        conversation_id: 0,
        message: { role: "assistant", content: null, tool_calls: [] },
        model: "error",
      };
    }
    const body = await response.text();
    throw new Error(`Chat function returned ${response.status}: ${body}`);
  }
  return response.json();
}

export function extractToolArgs(
  result: ChatResult,
  expectedTool: string,
): Record<string, unknown> {
  const toolCalls = result.message.tool_calls ?? [];
  if (toolCalls.length === 0) {
    throw new Error(
      `Expected tool call "${expectedTool}" but got text: ${result.message.content}`,
    );
  }
  if (toolCalls[0].function.name !== expectedTool) {
    throw new Error(
      `Expected tool "${expectedTool}" but got "${toolCalls[0].function.name}"`,
    );
  }
  return JSON.parse(toolCalls[0].function.arguments);
}

export function extractAllToolNames(result: ChatResult): string[] {
  return (result.message.tool_calls ?? []).map((tc) => tc.function.name);
}
