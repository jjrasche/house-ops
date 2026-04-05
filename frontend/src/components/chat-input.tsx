import { useState, useCallback } from 'react';
import type { PipelineResult, ToolCall } from '../lib/pipeline/types';
import type { ExecuteResult } from '../lib/pipeline/execute';
import type { PipelineOptions } from '../lib/pipeline/router';
import { runPipeline } from '../lib/pipeline/router';
import { ConfirmationCard } from './confirmation-card';

// --- Public types ---

export type ExecuteHandler = (toolCall: ToolCall, pipelineResult: PipelineResult) => Promise<ExecuteResult>;

export interface ChatInputProps {
  readonly pipelineOptions: PipelineOptions;
  readonly onExecute: ExecuteHandler;
  readonly onReject: (toolCall: ToolCall) => void;
}

type FeedbackState = { readonly kind: 'success' } | { readonly kind: 'error'; readonly message: string } | null;

// --- Orchestrator ---

export function ChatInput({ pipelineOptions, onExecute, onReject }: ChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
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
      onReject(toolCall);
      setResult(null);
      setFeedback(null);
    },
    [onReject],
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
