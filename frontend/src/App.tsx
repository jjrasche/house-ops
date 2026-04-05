import { useCallback, useEffect, useState } from 'react';
import type { ToolCall, PipelineResult, EntityType } from './lib/pipeline/types';
import type { PipelineOptions } from './lib/pipeline/router';
import type { LexiconEntry } from './lib/pipeline/extract';
import { executeTool } from './lib/pipeline/execute';
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

export default function App() {
  const [lexicon, setLexicon] = useState<LexiconEntry[]>([]);

  useEffect(() => {
    loadLexicon().then(setLexicon);
  }, []);

  const pipelineOptions: PipelineOptions = {
    supabase,
    householdId: HOUSEHOLD_ID,
    lexicon,
  };

  const handleExecute = useCallback(async (toolCall: ToolCall, pipelineResult: PipelineResult) => {
    const result = await executeTool(toolCall, pipelineResult, { supabase, householdId: HOUSEHOLD_ID });
    return result;
  }, []);

  const handleReject = useCallback((toolCall: ToolCall) => {
    // TODO(HOUSE-XX): feed rejection back to appropriate stage
    console.log('Reject:', toolCall);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ChatInput
        pipelineOptions={pipelineOptions}
        onExecute={handleExecute}
        onReject={handleReject}
      />
    </div>
  );
}
