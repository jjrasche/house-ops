import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StageCorrection } from '../../components/stage-correction';
import type { PipelineTrace } from '../../lib/pipeline/types';

afterEach(cleanup);

// --- Test data ---

function buildTrace(overrides: Partial<PipelineTrace> = {}): PipelineTrace {
  return {
    inputText: 'buy milk',
    verb: 'buy',
    entityMentions: [{ text: 'milk', typeHint: 'item' }],
    resolved: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
    unresolved: [],
    toolName: 'update_item',
    params: { item_id: 1, status: 'on_list' },
    ...overrides,
  };
}

describe('StageCorrection', () => {
  // --- Extract correction ---

  it('renders extract row with verb summary', () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);
    expect(screen.getByText(/verb="buy"/)).toBeDefined();
  });

  it('expands extract correction form when tapped', async () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);
    await userEvent.click(screen.getByText(/Heard/));
    expect(screen.getByLabelText('Verb')).toBeDefined();
  });

  it('calls onCorrect with extract correction when verb changed', async () => {
    const onCorrect = vi.fn();
    render(<StageCorrection trace={buildTrace()} onCorrect={onCorrect} />);

    await userEvent.click(screen.getByText(/Heard/));
    const verbInput = screen.getByLabelText('Verb');
    await userEvent.clear(verbInput);
    await userEvent.type(verbInput, 'add');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onCorrect).toHaveBeenCalledWith({ stage: 'extract', verb: 'add' });
  });

  it('disables apply when verb unchanged', async () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);
    await userEvent.click(screen.getByText(/Heard/));
    const applyButton = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
  });

  // --- Classify correction ---

  it('renders classify row with tool name', () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);
    expect(screen.getByText('update_item')).toBeDefined();
  });

  it('expands classify correction form with tool select', async () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);
    await userEvent.click(screen.getByText(/Tool/));
    expect(screen.getByLabelText('Tool')).toBeDefined();
  });

  it('calls onCorrect with classify correction when tool changed', async () => {
    const onCorrect = vi.fn();
    render(<StageCorrection trace={buildTrace()} onCorrect={onCorrect} />);

    await userEvent.click(screen.getByText(/Tool/));
    await userEvent.selectOptions(screen.getByLabelText('Tool'), 'create_action');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onCorrect).toHaveBeenCalledWith({ stage: 'classify', toolName: 'create_action' });
  });

  // --- Assemble correction ---

  it('renders assemble row with param summary', () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);
    expect(screen.getByText(/item_id=1/)).toBeDefined();
  });

  it('expands assemble correction form with param inputs', async () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);
    await userEvent.click(screen.getByText(/Params/));
    expect(screen.getByLabelText('status')).toBeDefined();
    expect(screen.getByLabelText('item_id')).toBeDefined();
  });

  it('calls onCorrect with assemble correction when param changed', async () => {
    const onCorrect = vi.fn();
    render(<StageCorrection trace={buildTrace()} onCorrect={onCorrect} />);

    await userEvent.click(screen.getByText(/Params/));
    const statusInput = screen.getByLabelText('status');
    await userEvent.clear(statusInput);
    await userEvent.type(statusInput, 'needed');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onCorrect).toHaveBeenCalledWith({
      stage: 'assemble',
      params: { item_id: 1, status: 'needed' },
    });
  });

  it('parses numeric param values back to numbers', async () => {
    const onCorrect = vi.fn();
    render(<StageCorrection trace={buildTrace({ params: { quantity: 3 } })} onCorrect={onCorrect} />);

    await userEvent.click(screen.getByText(/Params/));
    const qtyInput = screen.getByLabelText('quantity');
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onCorrect).toHaveBeenCalledWith({
      stage: 'assemble',
      params: { quantity: 5 },
    });
  });

  // --- Collapse behavior ---

  it('only expands one stage at a time', async () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);

    await userEvent.click(screen.getByText(/Heard/));
    expect(screen.getByLabelText('Verb')).toBeDefined();

    await userEvent.click(screen.getByText(/Tool/));
    expect(screen.queryByLabelText('Verb')).toBeNull();
    expect(screen.getByLabelText('Tool')).toBeDefined();
  });

  // --- Does not render absent stages ---

  it('does not render classify row when toolName is null', () => {
    render(<StageCorrection trace={buildTrace({ toolName: null })} onCorrect={vi.fn()} />);
    expect(screen.queryByText(/Tool/)).toBeNull();
  });

  it('does not render assemble row when params are empty', () => {
    render(<StageCorrection trace={buildTrace({ params: {} })} onCorrect={vi.fn()} />);
    expect(screen.queryByText(/Params/)).toBeNull();
  });
});
