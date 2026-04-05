import { useCallback, useEffect, useState } from 'react';
import type { ToolCall, PipelineResult, EntityType } from './lib/pipeline/types';
import type { PipelineOptions } from './lib/pipeline/router';
import type { LexiconEntry } from './lib/pipeline/extract';
import type { ToolCallExample } from './lib/pipeline/assemble';
import { executeTool, rejectTool } from './lib/pipeline/execute';
import { ChatInput } from './components/chat-input';
import { createClient } from '@supabase/supabase-js';

// Supabase client — local dev defaults, swapped via env in production
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54421',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
);

const HOUSEHOLD_ID = 1;

async function loadLexicon(): Promise<LexiconEntry[]> {
  const { data } = await supabase
    .from('entity_lexicon')
    .select('surface_form, entity_type')
    .eq('household_id', HOUSEHOLD_ID);

  return (data ?? []).map((row: { surface_form: string; entity_type: string }) => ({
    name: row.surface_form,
    entityType: row.entity_type as EntityType,
  }));
}

async function loadToolCallExamples(): Promise<ToolCallExample[]> {
  const { data } = await supabase
    .from('tool_call_examples')
    .select('verb, tool_name, tool_params')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('source', 'user_confirmed');

  return (data ?? []).map((row: { verb: string; tool_name: string; tool_params: Record<string, unknown> }) => ({
    verb: row.verb,
    toolName: row.tool_name,
    toolParams: row.tool_params,
  }));
}

export default function App() {
  const [lexicon, setLexicon] = useState<LexiconEntry[]>([]);
  const [toolCallExamples, setToolCallExamples] = useState<ToolCallExample[]>([]);

  const refreshLexicon = useCallback(() => {
    loadLexicon().then(setLexicon);
  }, []);

  const refreshExamples = useCallback(() => {
    loadToolCallExamples().then(setToolCallExamples);
  }, []);

  useEffect(() => {
    refreshLexicon();
    refreshExamples();
  }, [refreshLexicon, refreshExamples]);

  const pipelineOptions: PipelineOptions = {
    supabase,
    householdId: HOUSEHOLD_ID,
    lexicon,
    toolCallExamples,
  };

  const createEntityOptions = { supabase, householdId: HOUSEHOLD_ID };
  const trainOptions = { supabase, householdId: HOUSEHOLD_ID };

  const handleExecute = useCallback(async (toolCall: ToolCall, pipelineResult: PipelineResult) => {
    const result = await executeTool(toolCall, pipelineResult, { supabase, householdId: HOUSEHOLD_ID });
    return result;
  }, []);

  const handleReject = useCallback(async (toolCall: ToolCall, pipelineResult: PipelineResult) => {
    await rejectTool(toolCall, pipelineResult, { supabase, householdId: HOUSEHOLD_ID });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ChatInput
        pipelineOptions={pipelineOptions}
        createEntityOptions={createEntityOptions}
        trainOptions={trainOptions}
        onExecute={handleExecute}
        onReject={handleReject}
        onLexiconChanged={() => { refreshLexicon(); refreshExamples(); }}
      />
    </div>
  );
}
