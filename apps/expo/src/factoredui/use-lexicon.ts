import { useState, useCallback } from "react";
import type { LexiconEntry, ToolCallExample, EntityType } from "@house-ops/core";
import { supabase } from "../lib/supabase";
import { HOUSEHOLD_ID } from "../lib/constants";

export interface LexiconState {
  lexicon: LexiconEntry[];
  toolCallExamples: ToolCallExample[];
  refreshLexicon: () => Promise<void>;
  refreshToolCallExamples: () => Promise<void>;
}

export function useLexicon(): LexiconState {
  const [lexicon, setLexicon] = useState<LexiconEntry[]>([]);
  const [toolCallExamples, setToolCallExamples] = useState<ToolCallExample[]>([]);

  const refreshLexicon = useCallback(async () => {
    const { data } = await supabase
      .from("entity_lexicon")
      .select("surface_form, entity_type")
      .eq("household_id", HOUSEHOLD_ID);
    setLexicon(
      (data ?? []).map((row: { surface_form: string; entity_type: string }) => ({
        name: row.surface_form,
        entityType: row.entity_type as EntityType,
      })),
    );
  }, []);

  const refreshToolCallExamples = useCallback(async () => {
    const { data } = await supabase
      .from("tool_call_examples")
      .select("verb, tool_name, tool_params")
      .eq("household_id", HOUSEHOLD_ID)
      .eq("source", "user_confirmed");
    setToolCallExamples(
      (data ?? []).map((row: { verb: string; tool_name: string; tool_params: Record<string, unknown> }) => ({
        verb: row.verb,
        toolName: row.tool_name,
        toolParams: row.tool_params,
      })),
    );
  }, []);

  return { lexicon, toolCallExamples, refreshLexicon, refreshToolCallExamples };
}
