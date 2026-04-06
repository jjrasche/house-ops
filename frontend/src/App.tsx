import { useCallback, useEffect, useState } from 'react';
import type { ToolCall, PipelineResult, EntityType } from './lib/pipeline/types';
import type { PipelineOptions } from './lib/pipeline/router';
import type { LexiconEntry } from './lib/pipeline/extract';
import type { ToolCallExample } from './lib/pipeline/assemble';
import { executeTool, rejectTool } from './lib/pipeline/execute';
import { ChatInput } from './components/chat-input';
import { Login } from './components/login';
import { useAuth } from './lib/auth/use-auth';
import { supabase, isLocalDev } from './lib/supabase';

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
  const authState = useAuth();
  const [lexicon, setLexicon] = useState<LexiconEntry[]>([]);
  const [toolCallExamples, setToolCallExamples] = useState<ToolCallExample[]>([]);

  const refreshLexicon = useCallback(() => {
    return loadLexicon().then(setLexicon);
  }, []);

  const refreshExamples = useCallback(() => {
    return loadToolCallExamples().then(setToolCallExamples);
  }, []);

  const isAuthenticated = isLocalDev || authState.status === 'authenticated';

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshLexicon();
    refreshExamples();
  }, [isAuthenticated, refreshLexicon, refreshExamples]);

  if (!isLocalDev && authState.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!isLocalDev && authState.status === 'unauthenticated') {
    return <Login />;
  }

  const pipelineOptions: PipelineOptions = {
    supabase,
    householdId: HOUSEHOLD_ID,
    lexicon,
    toolCallExamples,
  };

  const createEntityOptions = { supabase, householdId: HOUSEHOLD_ID };
  const trainOptions = { supabase, householdId: HOUSEHOLD_ID };

  const handleExecute = async (toolCalls: readonly ToolCall[], pipelineResult: PipelineResult) => {
    const options = { supabase, householdId: HOUSEHOLD_ID };
    for (const toolCall of toolCalls) {
      const result = await executeTool(toolCall, pipelineResult, options);
      if (!result.success) return result;
    }
    return { success: true as const };
  };

  const handleReject = async (toolCalls: readonly ToolCall[], pipelineResult: PipelineResult) => {
    const options = { supabase, householdId: HOUSEHOLD_ID };
    for (const toolCall of toolCalls) {
      await rejectTool(toolCall, pipelineResult, options);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ChatInput
        pipelineOptions={pipelineOptions}
        createEntityOptions={createEntityOptions}
        trainOptions={trainOptions}
        onExecute={handleExecute}
        onReject={handleReject}
        onLexiconChanged={() => Promise.all([refreshLexicon(), refreshExamples()])}
      />
    </div>
  );
}
