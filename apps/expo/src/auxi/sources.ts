import type { DataSourceRegistry } from "auxi/sdui";
import { supabase } from "../lib/supabase";
import { HOUSEHOLD_ID } from "../lib/constants";

/**
 * Data source registry for house-ops SDUI.
 * Each source maps a name to a Supabase query.
 * The shell resolves all sources before rendering the spec.
 */

export function buildSourceRegistry(): DataSourceRegistry {
  return {
    items_needed: {
      fetch: fetchItemsNeeded,
      cache: "local",
      maxItems: 50,
    },
    actions_pending: {
      fetch: fetchActionsPending,
      cache: "local",
      maxItems: 50,
    },
    recent_activity: {
      fetch: fetchRecentActivity,
      cache: "local",
      maxItems: 20,
    },
    lexicon: {
      fetch: fetchLexicon,
      cache: "local",
    },
  };
}

async function fetchItemsNeeded(): Promise<unknown> {
  const { data } = await supabase
    .from("items")
    .select("id, name, quantity, unit, status, store, category")
    .eq("household_id", HOUSEHOLD_ID)
    .in("status", ["needed", "on_list"])
    .order("updated_at", { ascending: false });

  return data ?? [];
}

async function fetchActionsPending(): Promise<unknown> {
  const { data } = await supabase
    .from("actions")
    .select("id, title, status, starts_at, due_at, category")
    .eq("household_id", HOUSEHOLD_ID)
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false });

  return data ?? [];
}

async function fetchRecentActivity(): Promise<unknown> {
  const { data } = await supabase
    .from("action_log")
    .select("id, tool_name, tool_params, status, confidence, created_at")
    .eq("household_id", HOUSEHOLD_ID)
    .in("status", ["executed", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(20);

  return data ?? [];
}

async function fetchLexicon(): Promise<unknown> {
  const { data } = await supabase
    .from("entity_lexicon")
    .select("surface_form, entity_type")
    .eq("household_id", HOUSEHOLD_ID);

  return data ?? [];
}
