import { useCallback } from 'react';
import type { ToolCall } from './lib/pipeline/types';
import type { PipelineOptions } from './lib/pipeline/router';
import { ChatInput } from './components/chat-input';
import { createClient } from '@supabase/supabase-js';

// Supabase client — local dev defaults, swapped via env in production
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
);

const pipelineOptions: PipelineOptions = {
  supabase,
  householdId: 1,
  lexicon: [],
};

export default function App() {
  const handleExecute = useCallback((toolCall: ToolCall) => {
    // TODO(HOUSE-XX): execute tool call via Supabase mutation
    console.log('Execute:', toolCall);
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
