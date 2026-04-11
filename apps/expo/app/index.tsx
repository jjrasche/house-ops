import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import type { PipelineOptions, PipelineResult, LexiconEntry, ToolCallExample, EntityType } from "@house-ops/core";
import { runPipeline } from "@house-ops/core";
import { renderSpec, resolveAllSources, type AuxiSpec, type RenderContext } from "auxi/sdui";
import { componentRegistry } from "../src/auxi/components";
import { buildSourceRegistry } from "../src/auxi/sources";
import { buildActionRegistry, type ShellState } from "../src/auxi/actions";
import { dataSourceCache } from "../src/auxi/storage";
import { buildShellContext } from "../src/auxi/shell-context";
import { useAuth } from "../src/lib/use-auth";
import { useVoice } from "../src/lib/voice/use-voice";
import { supabase, isLocalDev } from "../src/lib/supabase";
import { HOUSEHOLD_ID } from "../src/lib/constants";
import { LoginScreen } from "../src/screens/login";
import { colors, fontSize, spacing } from "../src/lib/theme";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baselineSpecJson = require("../assets/baseline-spec.json");
const baselineSpec = baselineSpecJson as AuxiSpec;

type FeedbackState = { kind: "success" } | { kind: "error"; message: string } | null;

export default function ShellScreen() {
  const authState = useAuth();
  const isAuthenticated = isLocalDev || authState.status === "authenticated";

  // --- Pipeline state ---
  const [inputText, setInputText] = useState("");
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [lexicon, setLexicon] = useState<LexiconEntry[]>([]);
  const [toolCallExamples, setToolCallExamples] = useState<ToolCallExample[]>([]);

  // --- Source data ---
  const [sourceData, setSourceData] = useState<Record<string, unknown>>({});
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  // --- Voice ---
  const [voiceActive, setVoiceActive] = useState(false);

  const submitTextDirect = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "" || isProcessing) return;
      setIsProcessing(true);
      setPipelineResult(null);
      setFeedback(null);
      const result = await runPipeline(trimmed, {
        supabase,
        householdId: HOUSEHOLD_ID,
        lexicon,
        toolCallExamples,
      });
      setPipelineResult(result);
      setIsProcessing(false);
    },
    [isProcessing, lexicon, toolCallExamples],
  );

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      setInputText(transcript);
      submitTextDirect(transcript);
    },
    [submitTextDirect],
  );

  const handleVoiceInterim = useCallback((interim: string) => {
    setInputText(interim);
  }, []);

  const { state: listeningState, startListening, stopListening } = useVoice({
    onTranscript: handleVoiceTranscript,
    onInterim: handleVoiceInterim,
  });

  const toggleVoice = useCallback(() => {
    if (listeningState === "listening") {
      stopListening();
      setVoiceActive(false);
    } else {
      startListening();
      setVoiceActive(true);
    }
  }, [listeningState, startListening, stopListening]);

  // --- Load lexicon + examples ---
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

  // --- Resolve data sources ---
  const sourceRegistry = useMemo(buildSourceRegistry, []);

  const refreshSources = useCallback(async () => {
    const resolved = await resolveAllSources(sourceRegistry, dataSourceCache);
    setSourceData(resolved.sources);
    setSourcesLoaded(true);
  }, [sourceRegistry]);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshLexicon();
    refreshToolCallExamples();
    refreshSources();
  }, [isAuthenticated, refreshLexicon, refreshToolCallExamples, refreshSources]);

  // --- Build action registry from shell state ---
  const pipelineOptions: PipelineOptions = useMemo(
    () => ({ supabase, householdId: HOUSEHOLD_ID, lexicon, toolCallExamples }),
    [lexicon, toolCallExamples],
  );

  const shellState: ShellState = useMemo(
    () => ({
      inputText,
      pipelineResult,
      isProcessing,
      voiceActive,
      pipelineOptions,
      setInputText,
      setPipelineResult,
      setIsProcessing,
      setFeedback,
      toggleVoice,
      refreshSources,
    }),
    [inputText, pipelineResult, isProcessing, voiceActive, pipelineOptions, toggleVoice, refreshSources],
  );

  const actionRegistry = useMemo(() => buildActionRegistry(shellState), [shellState]);

  // --- Build render context ---
  const shellContext = useMemo(
    () => buildShellContext({ inputText, isProcessing, pipelineResult, feedback, voiceActive }),
    [inputText, isProcessing, pipelineResult, feedback, voiceActive],
  );

  const renderContext: RenderContext = useMemo(
    () => ({
      components: componentRegistry,
      actions: actionRegistry,
      data: { ...sourceData, ...shellContext },
    }),
    [actionRegistry, sourceData, shellContext],
  );

  // --- Auth gate ---
  if (!isLocalDev && authState.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!isLocalDev && authState.status === "unauthenticated") {
    return <LoginScreen />;
  }

  if (!sourcesLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading data...</Text>
      </View>
    );
  }

  // --- Render spec ---
  const rendered = renderSpec(baselineSpec.root, renderContext) as ReactNode;
  return (
    <View style={styles.shell}>
      {rendered}
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
});
