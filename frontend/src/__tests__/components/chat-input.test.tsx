import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../../components/chat-input';
import type { PipelineResult, PipelineTrace, Correction } from '@house-ops/core';

// --- Module mocks ---

const mockRunPipeline = vi.fn();
const mockApplyCorrection = vi.fn();
const mockFindCandidates = vi.fn();

vi.mock('../../lib/pipeline/router', () => ({
  runPipeline: (...args: unknown[]) => mockRunPipeline(...args),
}));

vi.mock('../../lib/pipeline/train', () => ({
  applyCorrection: (...args: unknown[]) => mockApplyCorrection(...args),
}));

vi.mock('../../lib/pipeline/resolve', () => ({
  findCandidates: (...args: unknown[]) => mockFindCandidates(...args),
}));

vi.mock('../../lib/pipeline/create-entity', () => ({
  createEntity: vi.fn().mockResolvedValue({ entityId: 99, entityType: 'item', name: 'Test' }),
}));

vi.mock('../../lib/voice/use-deepgram-stt', () => ({
  useDeepgramSTT: () => ({
    state: 'idle',
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}));

afterEach(cleanup);

// --- Test data ---

const TRACE: PipelineTrace = {
  inputText: 'buy milk',
  verb: 'buy',
  entityMentions: [{ text: 'milk', typeHint: 'item' }],
  resolved: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
  unresolved: [],
  toolName: 'update_item',
  params: { item_id: 1, status: 'on_list' },
};

function buildPipelineResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    toolCalls: [{ tool: 'update_item', params: { item_id: 1, status: 'on_list' } }],
    resolvedEntities: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
    unresolved: [],
    trace: TRACE,
    path: 'deterministic',
    stageExecutions: [],
    confidence: 0.92,
    validationErrors: [],
    ...overrides,
  };
}

// --- Shared props ---

function buildProps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pipelineOptions: {
      supabase: {} as never,
      householdId: 1,
      lexicon: [],
      toolCallExamples: [],
    },
    createEntityOptions: { supabase: {} as never, householdId: 1 },
    trainOptions: { supabase: {} as never, householdId: 1 },
    onExecute: vi.fn().mockResolvedValue({ success: true }),
    onReject: vi.fn(),
    onLexiconChanged: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// --- Tests ---

describe('ChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPipeline.mockResolvedValue(buildPipelineResult());
    mockApplyCorrection.mockResolvedValue(undefined);
  });

  it('calls onLexiconChanged before re-running pipeline after correction', async () => {
    const onLexiconChanged = vi.fn().mockResolvedValue(undefined);
    const callOrder: string[] = [];

    onLexiconChanged.mockImplementation(() => {
      callOrder.push('lexiconRefresh');
      return Promise.resolve();
    });

    mockRunPipeline.mockImplementation(() => {
      callOrder.push('runPipeline');
      return Promise.resolve(buildPipelineResult());
    });

    const props = buildProps({ onLexiconChanged });
    render(<ChatInput {...props} />);

    // Type and submit to get a pipeline result
    const input = screen.getByPlaceholderText('What do you need?');
    await userEvent.type(input, 'buy milk');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    // Clear call tracking from initial submit
    callOrder.length = 0;
    mockRunPipeline.mockClear();
    onLexiconChanged.mockClear();

    // Enter edit mode, expand extract correction
    await userEvent.click(screen.getByText('Edit'));
    await userEvent.click(screen.getByText(/Heard/));

    const verbInput = screen.getByLabelText('Verb');
    await userEvent.clear(verbInput);
    await userEvent.type(verbInput, 'add');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(mockApplyCorrection).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(onLexiconChanged).toHaveBeenCalledTimes(1);
      expect(mockRunPipeline).toHaveBeenCalled();
    });

    // Verify order: refresh BEFORE re-run
    expect(callOrder.indexOf('lexiconRefresh')).toBeLessThan(
      callOrder.indexOf('runPipeline'),
    );
  });
});
