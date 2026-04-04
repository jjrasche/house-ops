import { useState, useCallback } from 'react';
import type { PipelineResult, ToolCall } from '../lib/pipeline/types';
import type { PipelineOptions } from '../lib/pipeline/router';
import { runPipeline } from '../lib/pipeline/router';
import { ConfirmationCard } from './confirmation-card';

// --- Public types ---

export interface ChatInputProps {
  readonly pipelineOptions: PipelineOptions;
  readonly onExecute: (toolCall: ToolCall) => void;
  readonly onReject: (toolCall: ToolCall) => void;
}

// --- Orchestrator ---

export function ChatInput({ pipelineOptions, onExecute, onReject }: ChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const submitText = useCallback(async () => {
    const trimmed = inputText.trim();
    if (trimmed === '' || isProcessing) return;

    setIsProcessing(true);
    setResult(null);

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
    (toolCall: ToolCall) => {
      onExecute(toolCall);
      setResult(null);
      setInputText('');
    },
    [onExecute],
  );

  const handleReject = useCallback(
    (toolCall: ToolCall) => {
      onReject(toolCall);
      setResult(null);
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
    </div>
  );
}
