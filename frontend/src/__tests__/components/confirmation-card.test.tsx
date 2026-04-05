import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationCard } from '../../components/confirmation-card';
import type { PipelineResult, ToolCall } from '../../lib/pipeline/types';

afterEach(cleanup);

// --- Test data ---

const EMPTY_TRACE = {
  inputText: '',
  verb: '',
  entityMentions: [],
  resolved: [],
  unresolved: [],
  toolName: null,
  params: {},
} as const;

function buildResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    toolCalls: [{ tool: 'update_item_status', params: { item_id: 1, status: 'on_list' } }],
    resolvedEntities: [],
    unresolved: [],
    trace: EMPTY_TRACE,
    path: 'deterministic',
    stageExecutions: [],
    confidence: 0.92,
    validationErrors: [],
    ...overrides,
  };
}

// --- Rendering ---

describe('ConfirmationCard', () => {
  it('renders tool name as human-readable label', () => {
    render(
      <ConfirmationCard result={buildResult()} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText('Update item')).toBeDefined();
  });

  it('renders all param key-value pairs', () => {
    render(
      <ConfirmationCard result={buildResult()} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    // Use getAllByText since "Item" may appear in both title and params
    const paramLabels = screen.getAllByText('Item');
    expect(paramLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('Status')).toBeDefined();
    expect(screen.getByText('on_list')).toBeDefined();
  });

  it('renders confidence as percentage badge', () => {
    render(
      <ConfirmationCard result={buildResult({ confidence: 0.87 })} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText('87%')).toBeDefined();
  });

  it.each([
    [0.92, '92%'],
    [0.5, '50%'],
    [0.25, '25%'],
    [1.0, '100%'],
  ])('confidence %f renders as %s', (confidence, expectedLabel) => {
    const { unmount } = render(
      <ConfirmationCard result={buildResult({ confidence })} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText(expectedLabel)).toBeDefined();
    unmount();
  });

  // --- Empty state ---

  it('renders fallback message when no tool calls (llm path)', () => {
    const emptyResult = buildResult({ toolCalls: [], path: 'llm', confidence: 0.3 });
    render(
      <ConfirmationCard result={emptyResult} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText(/not sure what to do/)).toBeDefined();
  });

  it('renders validation failure message when no tool calls (deterministic path)', () => {
    const emptyResult = buildResult({ toolCalls: [], path: 'deterministic', confidence: 0 });
    render(
      <ConfirmationCard result={emptyResult} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText(/Could not validate/)).toBeDefined();
  });

  // --- Unknown tool name falls back to formatted name ---

  it('formats unknown tool names by replacing underscores', () => {
    const result = buildResult({
      toolCalls: [{ tool: 'some_new_tool', params: {} }],
    });
    render(
      <ConfirmationCard result={result} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText('some new tool')).toBeDefined();
  });

  // --- Entity display names ---

  it('renders entity mention instead of raw ID when resolved entity matches', () => {
    const result = buildResult({
      toolCalls: [{ tool: 'update_item_status', params: { item_id: 1, status: 'on_list' } }],
      resolvedEntities: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
    });
    render(
      <ConfirmationCard result={result} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText('milk')).toBeDefined();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('falls back to raw ID when no resolved entity matches', () => {
    const result = buildResult({
      toolCalls: [{ tool: 'update_item_status', params: { item_id: 99, status: 'on_list' } }],
      resolvedEntities: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
    });
    render(
      <ConfirmationCard result={result} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText('99')).toBeDefined();
  });

  it('resolves multiple entity IDs to their mentions', () => {
    const result = buildResult({
      toolCalls: [{ tool: 'create_action', params: { person_id: 2, location_id: 3, title: 'pick up' } }],
      resolvedEntities: [
        { mention: 'Jim', entityId: 2, entityType: 'person', score: 1.0 },
        { mention: 'kitchen', entityId: 3, entityType: 'location', score: 0.88 },
      ],
    });
    render(
      <ConfirmationCard result={result} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText('Jim')).toBeDefined();
    expect(screen.getByText('kitchen')).toBeDefined();
    expect(screen.getByText('pick up')).toBeDefined();
  });

  it('does not resolve non-ID params even if they are numbers', () => {
    const result = buildResult({
      toolCalls: [{ tool: 'update_item_status', params: { item_id: 1, quantity: 3 } }],
      resolvedEntities: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
    });
    render(
      <ConfirmationCard result={result} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText('milk')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  // --- Unresolved entities ---

  it('shows unresolved warning when entities are unresolved', () => {
    const result = buildResult({
      toolCalls: [{ tool: 'update_item', params: { status: 'on_list' } }],
      unresolved: ['chex mix'],
    });
    render(
      <ConfirmationCard result={result} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText(/chex mix/)).toBeDefined();
    expect(screen.getByText(/not in the database/)).toBeDefined();
  });

  it('disables confirm button when validation errors exist', () => {
    const result = buildResult({
      validationErrors: ['Missing required param: item_id'],
    });
    render(
      <ConfirmationCard result={result} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    const confirmButton = screen.getByRole('button', { name: 'Needs resolution' });
    expect(confirmButton).toBeDefined();
    expect(confirmButton.hasAttribute('disabled')).toBe(true);
  });

  it('shows confirm button when no validation errors', () => {
    render(
      <ConfirmationCard result={buildResult()} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmButton.hasAttribute('disabled')).toBe(false);
  });

  // --- Interactions ---

  it('calls onConfirm with the tool call when Confirm clicked', async () => {
    const onConfirm = vi.fn();
    const toolCall: ToolCall = { tool: 'update_item_status', params: { item_id: 1, status: 'on_list' } };
    const result = buildResult({ toolCalls: [toolCall] });

    render(
      <ConfirmationCard result={result} onConfirm={onConfirm} onReject={vi.fn()} />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    await userEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledWith(toolCall);
  });

  it('calls onReject with the tool call when Reject clicked', async () => {
    const onReject = vi.fn();
    const toolCall: ToolCall = { tool: 'update_item_status', params: { item_id: 1, status: 'on_list' } };
    const result = buildResult({ toolCalls: [toolCall] });

    render(
      <ConfirmationCard result={result} onConfirm={vi.fn()} onReject={onReject} />,
    );

    const rejectButton = screen.getByRole('button', { name: 'Reject' });
    await userEvent.click(rejectButton);
    expect(onReject).toHaveBeenCalledWith(toolCall);
  });

  // --- Does not render confirm/reject for empty results ---

  it('does not render action buttons when no tool calls', () => {
    const emptyResult = buildResult({ toolCalls: [], path: 'llm' });
    const { container } = render(
      <ConfirmationCard result={emptyResult} onConfirm={vi.fn()} onReject={vi.fn()} />,
    );
    const buttons = within(container).queryAllByRole('button');
    expect(buttons).toHaveLength(0);
  });
});
