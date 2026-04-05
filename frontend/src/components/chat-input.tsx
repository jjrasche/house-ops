import { useState, useCallback } from 'react';
import type { PipelineResult, ToolCall, EntityType, Correction } from '../lib/pipeline/types';
import type { ExecuteResult } from '../lib/pipeline/execute';
import type { PipelineOptions } from '../lib/pipeline/router';
import type { CreateEntityOptions } from '../lib/pipeline/create-entity';
import type { TrainOptions } from '../lib/pipeline/train';
import { runPipeline } from '../lib/pipeline/router';
import { createEntity } from '../lib/pipeline/create-entity';
import { applyCorrection } from '../lib/pipeline/train';
import { ConfirmationCard } from './confirmation-card';

// --- Public types ---

export type ExecuteHandler = (toolCall: ToolCall, pipelineResult: PipelineResult) => Promise<ExecuteResult>;

export interface ChatInputProps {
  readonly pipelineOptions: PipelineOptions;
  readonly createEntityOptions: CreateEntityOptions;
  readonly trainOptions: TrainOptions;
  readonly onExecute: ExecuteHandler;
  readonly onReject: (toolCall: ToolCall, pipelineResult: PipelineResult) => void;
  readonly onLexiconChanged: () => void;
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

  const submitText = useCallback(async () => {
    const trimmed = inputText.trim();
    if (trimmed === '' || isProcessing) return;

    setIsProcessing(true);
    setResult(null);
    setFeedback(null);

    const pipelineResult = await runPipeline(trimmed, pipelineOptions);
    setResult(pipelineResult);
    setIsProcessing(false);
  }, [inputText, isProcessing, pipelineOptions]);

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
    async (toolCall: ToolCall) => {
      if (!result) return;
      const executeResult = await onExecute(toolCall, result);
      setResult(null);
      if (executeResult.success) {
        setFeedback({ kind: 'success' });
        setInputText('');
      } else {
        setFeedback({ kind: 'error', message: executeResult.error ?? 'Execution failed' });
      }
    },
    [onExecute, result],
  );

  const handleReject = useCallback(
    (toolCall: ToolCall) => {
      if (!result) return;
      onReject(toolCall, result);
      setResult(null);
      setFeedback(null);
    },
    [onReject, result],
  );

  const handleResolveEntity = useCallback(
    async (mention: string, entityType: EntityType, entityName: string) => {
      setIsResolvingEntity(true);
      try {
        await createEntity(entityType, entityName, createEntityOptions);
        onLexiconChanged();
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

  const handleCorrect = useCallback(
    async (correction: Correction) => {
      if (!result) return;
      try {
        await applyCorrection(correction, result.trace, trainOptions);
        const rerunResult = await runPipeline(inputText.trim(), pipelineOptions);
        setResult(rerunResult);
      } catch {
        setFeedback({ kind: 'error', message: 'Failed to save correction' });
      }
    },
    [result, trainOptions, inputText, pipelineOptions],
  );

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you need?"
          disabled={isProcessing}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submitText}
          disabled={isProcessing || inputText.trim() === ''}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isProcessing ? 'Thinking...' : 'Send'}
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
