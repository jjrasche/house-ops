import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  PipelineResult, ToolCall, EntityType, Correction,
  ExecuteResult, PipelineOptions, CreateEntityOptions, TrainOptions,
} from '@house-ops/core';
import { runPipeline, executeTool, rejectTool, createEntity, applyCorrection, findCandidates } from '@house-ops/core';
import { ConfirmationCard } from './confirmation-card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useVoice } from '../lib/voice/use-voice';
import { colors, fontSize, spacing, radius } from '../lib/theme';

// --- Public types ---

export type ExecuteHandler = (toolCalls: readonly ToolCall[], pipelineResult: PipelineResult) => Promise<ExecuteResult>;

export interface ChatInputProps {
  readonly pipelineOptions: PipelineOptions;
  readonly createEntityOptions: CreateEntityOptions;
  readonly trainOptions: TrainOptions;
  readonly onExecute: ExecuteHandler;
  readonly onReject: (toolCalls: readonly ToolCall[], pipelineResult: PipelineResult) => void;
  readonly onLexiconChanged: () => void | Promise<unknown>;
}

type FeedbackState = { readonly kind: 'success' } | { readonly kind: 'error'; readonly message: string } | null;

export function ChatInput({
  pipelineOptions, createEntityOptions, trainOptions, onExecute, onReject, onLexiconChanged,
}: ChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResolvingEntity, setIsResolvingEntity] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const pendingRestartRef = useRef(false);

  const submitTextDirect = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    setIsProcessing(true);
    setResult(null);
    setFeedback(null);
    const pipelineResult = await runPipeline(trimmed, pipelineOptions);
    setResult(pipelineResult);
    setIsProcessing(false);
  }, [pipelineOptions]);

  const submitText = useCallback(async () => {
    await submitTextDirect(inputText);
  }, [inputText, submitTextDirect]);

  // Voice
  const handleVoiceTranscript = useCallback((transcript: string) => {
    setInputText(transcript);
    submitTextDirect(transcript);
  }, [submitTextDirect]);

  const handleVoiceInterim = useCallback((interim: string) => {
    setInputText(interim);
  }, []);

  const { state: listeningState, startListening, stopListening } = useVoice({
    onTranscript: handleVoiceTranscript,
    onInterim: handleVoiceInterim,
  });

  const hasVoice = listeningState !== undefined;

  const toggleVoice = useCallback(() => {
    if (listeningState === 'listening') {
      stopListening();
      setVoiceMode(false);
    } else {
      startListening();
      setVoiceMode(true);
    }
  }, [listeningState, startListening, stopListening]);

  // Auto-restart mic after confirm/reject in voice mode
  useEffect(() => {
    if (pendingRestartRef.current && !isProcessing && !result && listeningState === 'idle' && voiceMode) {
      pendingRestartRef.current = false;
      startListening();
    }
  }, [isProcessing, result, listeningState, voiceMode, startListening]);

  const handleConfirm = useCallback(async (toolCalls: readonly ToolCall[]) => {
    if (!result) return;
    const executeResult = await onExecute(toolCalls, result);
    setResult(null);
    if (executeResult.success) {
      setFeedback({ kind: 'success' });
      setInputText('');
      if (voiceMode) pendingRestartRef.current = true;
    } else {
      setFeedback({ kind: 'error', message: executeResult.error ?? 'Execution failed' });
    }
  }, [onExecute, result, voiceMode]);

  const handleReject = useCallback((toolCalls: readonly ToolCall[]) => {
    if (!result) return;
    onReject(toolCalls, result);
    setResult(null);
    setFeedback(null);
    setInputText('');
    if (voiceMode) pendingRestartRef.current = true;
  }, [onReject, result, voiceMode]);

  const handleResolveEntity = useCallback(async (
    _mention: string, entityType: EntityType, entityName: string,
  ) => {
    setIsResolvingEntity(true);
    try {
      await createEntity(entityType, entityName, createEntityOptions);
      await onLexiconChanged();
      const rerunResult = await runPipeline(inputText.trim(), pipelineOptions);
      setResult(rerunResult);
    } catch {
      setFeedback({ kind: 'error', message: `Failed to create ${entityName}` });
    } finally {
      setIsResolvingEntity(false);
    }
  }, [createEntityOptions, inputText, onLexiconChanged, pipelineOptions]);

  const isListening = listeningState === 'listening';

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Input
          value={inputText}
          onChangeText={setInputText}
          placeholder={isListening ? 'Listening...' : 'What do you need?'}
          disabled={isProcessing || isListening}
          onSubmitEditing={submitText}
          returnKeyType="send"
          style={styles.textInput}
        />
        {hasVoice && (
          <MicButton state={listeningState!} onPress={toggleVoice} disabled={isProcessing} />
        )}
        <Button
          variant="default"
          size="default"
          onPress={submitText}
          disabled={isProcessing || inputText.trim() === ''}
        >
          {isProcessing ? '...' : 'Send'}
        </Button>
      </View>

      {result && (
        <ConfirmationCard
          result={result}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onResolveEntity={handleResolveEntity}
          isResolvingEntity={isResolvingEntity}
        />
      )}

      {feedback?.kind === 'success' && (
        <Text style={styles.successText}>Done!</Text>
      )}
      {feedback?.kind === 'error' && (
        <Text style={styles.errorText}>{feedback.message}</Text>
      )}
    </View>
  );
}

// --- Mic button ---

type ListeningState = 'idle' | 'connecting' | 'listening';

function MicButton({ state, onPress, disabled }: {
  readonly state: ListeningState;
  readonly onPress: () => void;
  readonly disabled: boolean;
}) {
  const isActive = state === 'listening';
  const isConnecting = state === 'connecting';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isConnecting}
      style={[styles.micButton, isActive && styles.micActive, (disabled || isConnecting) && styles.micDisabled]}
    >
      <Text style={[styles.micText, isActive && styles.micTextActive]}>
        {isConnecting ? '...' : '🎤'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, width: '100%', maxWidth: 448 },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  textInput: { flex: 1 },
  micButton: {
    height: 40,
    width: 40,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: { backgroundColor: '#ef4444' },
  micDisabled: { opacity: 0.5 },
  micText: { fontSize: fontSize.base },
  micTextActive: { color: '#fff' },
  successText: { fontSize: fontSize.sm, color: colors.success },
  errorText: { fontSize: fontSize.sm, color: colors.destructive },
});
