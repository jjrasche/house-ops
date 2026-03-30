// HouseOps Chat Edge Function — will be refactored into pipeline stages.
// Currently: minimal Groq proxy with auth. Tool schemas and system prompt TBD.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildGroqHeaders,
  type GroqMessage,
  type GroqResponse,
} from "../_shared/groq-messages.ts";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = "openai/gpt-oss-20b";
const ESCALATION_MODEL = "openai/gpt-oss-120b";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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

  return { userId: user.id, householdId: profile.household_id };
}

async function callGroq(
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
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(502, `Groq API error ${response.status}: ${body}`);
  }

  const data: GroqResponse = await response.json();
  return { message: data.choices[0].message, model: data.model };
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
    const { userId, householdId } = await authenticateUser(request);

    const body = await request.json();
    if (!body.message?.trim()) throw new HttpError(400, "Message is required");

    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) throw new HttpError(500, "GROQ_API_KEY not configured");

    // TODO: Pipeline stages (EXTRACT, RESOLVE, CLASSIFY) run here
    // TODO: If deterministic path succeeds, return tool call without LLM
    // TODO: If LLM needed, call Groq with pre-resolved entities + context

    const result = await callGroq(
      [{ role: "user", content: body.message }],
      groqApiKey,
      PRIMARY_MODEL,
    );

    return new Response(JSON.stringify({
      message: result.message,
      model: result.model,
      household_id: householdId,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return buildErrorResponse(error);
  }
});
