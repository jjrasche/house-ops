import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import type { EntityType, ToolCall, PipelineResult, PipelineOptions, LexiconEntry } from '@house-ops/core';
import type { ToolCallExample } from '@house-ops/core';
import { executeTool, rejectTool } from '@house-ops/core';
import { supabase, isLocalDev } from '../lib/supabase';
import { useAuth } from '../lib/use-auth';
import { ChatInput } from '../components/chat-input';
import { LoginScreen } from './login';
import { HOUSEHOLD_ID } from '../lib/constants';
import { colors, fontSize, spacing } from '../lib/theme';

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

export function HomeScreen() {
  const authState = useAuth();
  const [lexicon, setLexicon] = useState<LexiconEntry[]>([]);
  const [toolCallExamples, setToolCallExamples] = useState<ToolCallExample[]>([]);

  const isAuthenticated = isLocalDev || authState.status === 'authenticated';

  const refreshLexicon = useCallback(() => loadLexicon().then(setLexicon), []);
  const refreshExamples = useCallback(() => loadToolCallExamples().then(setToolCallExamples), []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshLexicon();
    refreshExamples();
  }, [isAuthenticated, refreshLexicon, refreshExamples]);

  if (!isLocalDev && authState.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!isLocalDev && authState.status === 'unauthenticated') {
    return <LoginScreen />;
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
    <View style={styles.screen}>
      <ChatInput
        pipelineOptions={pipelineOptions}
        createEntityOptions={createEntityOptions}
        trainOptions={trainOptions}
        onExecute={handleExecute}
        onReject={handleReject}
        onLexiconChanged={() => Promise.all([refreshLexicon(), refreshExamples()])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
});
