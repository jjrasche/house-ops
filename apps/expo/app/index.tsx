import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import type { EntityType } from "@house-ops/core";
import { createEntity, runPipeline } from "@house-ops/core";
import { renderSpec, useSourceData, type RenderContext } from "@factoredui/react";
import { createComponentRegistry, type ThemeTokens } from "@factoredui/react-native";
import type { AuxiSpec } from "@factoredui/core";
import { buildShellContext } from "../src/auxi/shell-context";
import { useLexicon } from "../src/auxi/use-lexicon";
import { dataSourceCache } from "../src/auxi/storage";
import { usePipeline } from "../src/auxi/use-pipeline";
import { EntityResolver } from "../src/components/entity-resolver";
import { useAuth } from "../src/lib/use-auth";
import { supabase, isLocalDev } from "../src/lib/supabase";
import { HOUSEHOLD_ID } from "../src/lib/constants";
import { LoginScreen } from "../src/screens/login";
import { colors, fontSize, spacing, radius } from "../src/lib/theme";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baselineSpecJson = require("../assets/baseline-spec.json");
const baselineSpec = baselineSpecJson as AuxiSpec;

const theme: ThemeTokens = { colors, spacing, fontSize, radius };
const componentRegistry = createComponentRegistry(theme);
const emptySourceRegistry = () => ({});

export default function ShellScreen() {
  const authState = useAuth();
  const isAuthenticated = isLocalDev || authState.status === "authenticated";

  const lexiconState = useLexicon();
  const { sourceData, sourcesLoaded, refreshSources } = useSourceData(emptySourceRegistry, dataSourceCache);
  const pipeline = usePipeline(lexiconState, refreshSources);

  useEffect(() => {
    if (!isAuthenticated) return;
    lexiconState.refreshLexicon();
    lexiconState.refreshToolCallExamples();
    refreshSources();
  }, [isAuthenticated, lexiconState.refreshLexicon, lexiconState.refreshToolCallExamples, refreshSources]);

  const shellContext = useMemo(
    () => buildShellContext({
      inputText: pipeline.inputText,
      isProcessing: pipeline.isProcessing,
      pipelineResult: pipeline.pipelineResult,
      feedback: pipeline.feedback,
      voiceActive: pipeline.voiceActive,
    }),
    [pipeline.inputText, pipeline.isProcessing, pipeline.pipelineResult, pipeline.feedback, pipeline.voiceActive],
  );

  const renderContext: RenderContext = useMemo(
    () => ({
      components: componentRegistry,
      actions: pipeline.actionRegistry,
      data: { ...sourceData, ...shellContext },
    }),
    [pipeline.actionRegistry, sourceData, shellContext],
  );

  const resolveEntity = useCallback(
    async (mention: string, entityType: EntityType, entityName: string) => {
      const options = { supabase, householdId: HOUSEHOLD_ID };
      await createEntity(entityType, entityName, options);
      await lexiconState.refreshLexicon();
      pipeline.setEntityResolverVisible(false);
    },
    [lexiconState, pipeline],
  );

  const rerunPipeline = useCallback(async () => {
    const result = await runPipeline(pipeline.inputText.trim(), {
      supabase,
      householdId: HOUSEHOLD_ID,
      lexicon: lexiconState.lexicon,
      toolCallExamples: lexiconState.toolCallExamples,
    });
    pipeline.setPipelineResult(result);
  }, [lexiconState, pipeline]);

  const handleResolveEntity = useCallback(
    async (mention: string, entityType: EntityType, entityName: string) => {
      await resolveEntity(mention, entityType, entityName);
      await rerunPipeline();
    },
    [resolveEntity, rerunPipeline],
  );

  if (!isLocalDev && authState.status === "loading") {
    return <LoadingView message="Loading..." />;
  }

  if (!isLocalDev && authState.status === "unauthenticated") {
    return <LoginScreen />;
  }

  if (!sourcesLoaded) {
    return <LoadingView message="Loading data..." />;
  }

  const rendered = renderSpec(baselineSpec.root, renderContext) as ReactNode;
  return (
    <View style={styles.shell}>
      {rendered}
      {pipeline.entityResolverVisible && pipeline.pipelineResult && (
        <View style={styles.overlay}>
          <EntityResolver
            mentions={pipeline.pipelineResult.unresolved}
            onResolve={handleResolveEntity}
          />
        </View>
      )}
    </View>
  );
}

function LoadingView({ message }: { readonly message: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
});
