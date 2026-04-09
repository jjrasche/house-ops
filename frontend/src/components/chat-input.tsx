import { useState, useCallback, useRef, useEffect } from 'react';
import type { PipelineResult, ToolCall, EntityType, Correction, ExecuteResult, PipelineOptions, CreateEntityOptions, TrainOptions } from '@house-ops/core';
import { runPipeline, createEntity, applyCorrection, findCandidates } from '@house-ops/core';
import { ConfirmationCard } from './confirmation-card';
import { useDeepgramSTT } from '../lib/voice/use-deepgram-stt';
import type { ListeningState } from '../lib/voice/use-deepgram-stt';

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

// --- Orchestrator ---

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

  // --- Voice: Deepgram STT ---

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setInputText(transcript);
    submitTextDirect(transcript);
  }, [submitTextDirect]);

  const handleVoiceInterim = useCallback((interim: string) => {
    setInputText(interim);
  }, []);

  const { state: listeningState, startListening, stopListening } = useDeepgramSTT({
    onTranscript: handleVoiceTranscript,
    onInterim: handleVoiceInterim,
    endpointingMs: 1000,
  });

  const toggleVoice = useCallback(() => {
    if (listeningState !== 'idle') {
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

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitText();
      }
    },
    [submitText],
  );

  const handleConfirm = useCallback(
    async (toolCalls: readonly ToolCall[]) => {
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
    },
    [onExecute, result, voiceMode],
  );

  const handleReject = useCallback(
    (toolCalls: readonly ToolCall[]) => {
      if (!result) return;
      onReject(toolCalls, result);
      setResult(null);
      setFeedback(null);
      setInputText('');
      if (voiceMode) pendingRestartRef.current = true;
    },
    [onReject, result, voiceMode],
  );

  const handleResolveEntity = useCallback(
    async (_mention: string, entityType: EntityType, entityName: string) => {
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
    },
    [createEntityOptions, inputText, onLexiconChanged, pipelineOptions],
  );

  const handleFetchCandidates = useCallback(
    (mention: string) => findCandidates(
      mention, pipelineOptions.householdId, { supabase: pipelineOptions.supabase },
    ),
    [pipelineOptions.householdId, pipelineOptions.supabase],
  );

  const handleCorrect = useCallback(
    async (correction: Correction) => {
      if (!result) return;
      try {
        await applyCorrection(correction, result.trace, trainOptions);
        await onLexiconChanged();
        const rerunResult = await runPipeline(inputText.trim(), pipelineOptions);
        setResult(rerunResult);
      } catch {
        setFeedback({ kind: 'error', message: 'Failed to save correction' });
      }
    },
    [result, trainOptions, inputText, pipelineOptions, onLexiconChanged],
  );

  const hasDeepgramKey = Boolean(import.meta.env.VITE_DEEPGRAM_API_KEY);

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listeningState === 'listening' ? 'Listening...' : 'What do you need?'}
          disabled={isProcessing || listeningState === 'listening'}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        {hasDeepgramKey && (
          <MicButton state={listeningState} onClick={toggleVoice} disabled={isProcessing} />
        )}
        <button
          type="button"
          onClick={submitText}
          disabled={isProcessing || inputText.trim() === ''}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isProcessing ? '...' : 'Send'}
        </button>
      </div>

      {result && (
        <ConfirmationCard
          result={result}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onCorrect={handleCorrect}
          onResolveEntity={handleResolveEntity}
          isResolvingEntity={isResolvingEntity}
          fetchCandidates={handleFetchCandidates}
        />
      )}

      {feedback?.kind === 'success' && (
        <p className="text-sm text-green-600" role="status">Done!</p>
      )}
      {feedback?.kind === 'error' && (
        <p className="text-sm text-destructive" role="alert">{feedback.message}</p>
      )}
    </div>
  );
}

// --- Concept: microphone toggle button with state-dependent styling ---

interface MicButtonProps {
  readonly state: ListeningState;
  readonly onClick: () => void;
  readonly disabled: boolean;
}

function MicButton({ state, onClick, disabled }: MicButtonProps) {
  const isActive = state === 'listening';
  const isConnecting = state === 'connecting';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isConnecting}
      aria-label={isActive ? 'Stop listening' : 'Start voice input'}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-red-500 text-white animate-pulse'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
      } disabled:opacity-50`}
    >
      {isConnecting ? '...' : '🎤'}
    </button>
  );
}
