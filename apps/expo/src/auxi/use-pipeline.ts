import { useState, useCallback, useMemo, useRef } from "react";
import type { PipelineOptions, PipelineResult } from "@house-ops/core";
import { useVoice } from "../lib/voice/use-voice";
import { supabase } from "../lib/supabase";
import { HOUSEHOLD_ID } from "../lib/constants";
import { buildActionRegistry, type ShellState } from "./actions";
import type { ActionRegistry } from "@factoredui/core";
import type { LexiconState } from "./use-lexicon";

type FeedbackState = { kind: "success" } | { kind: "error"; message: string } | null;

export interface PipelineState {
  inputText: string;
  setInputText: (text: string) => void;
  pipelineResult: PipelineResult | null;
  setPipelineResult: (result: PipelineResult | null) => void;
  isProcessing: boolean;
  feedback: FeedbackState;
  voiceActive: boolean;
  entityResolverVisible: boolean;
  setEntityResolverVisible: (visible: boolean) => void;
  actionRegistry: ActionRegistry;
}

export function usePipeline(
  lexiconState: LexiconState,
  refreshSources: () => Promise<void>,
): PipelineState {
  const [inputText, setInputText] = useState("");
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [entityResolverVisible, setEntityResolverVisible] = useState(false);

  const actionRegistryRef = useRef<ActionRegistry>({});

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setInputText(transcript);
    actionRegistryRef.current.submit?.({ text: transcript });
  }, []);

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

  const pipelineOptions: PipelineOptions = useMemo(
    () => ({
      supabase,
      householdId: HOUSEHOLD_ID,
      lexicon: lexiconState.lexicon,
      toolCallExamples: lexiconState.toolCallExamples,
    }),
    [lexiconState.lexicon, lexiconState.toolCallExamples],
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
      showEntityResolver: () => setEntityResolverVisible(true),
    }),
    [inputText, pipelineResult, isProcessing, voiceActive, pipelineOptions, toggleVoice, refreshSources],
  );

  const actionRegistry = useMemo(() => {
    const registry = buildActionRegistry(shellState);
    actionRegistryRef.current = registry;
    return registry;
  }, [shellState]);

  return {
    inputText,
    setInputText,
    pipelineResult,
    setPipelineResult,
    isProcessing,
    feedback,
    voiceActive,
    entityResolverVisible,
    setEntityResolverVisible,
    actionRegistry,
  };
}
