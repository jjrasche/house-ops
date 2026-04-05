import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StageCorrection } from '../../components/stage-correction';
import type { FetchCandidates } from '../../components/stage-correction';
import type { PipelineTrace } from '../../lib/pipeline/types';
import type { ResolveCandidate } from '../../lib/pipeline/resolve';

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

  // --- Resolve correction ---

  it('renders resolve row when resolved entities exist and fetchCandidates provided', () => {
    const fetchCandidates: FetchCandidates = vi.fn().mockResolvedValue([]);
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} fetchCandidates={fetchCandidates} />);
    expect(screen.getByText(/Resolve/)).toBeDefined();
  });

  it('does not render resolve row when no fetchCandidates prop', () => {
    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} />);
    expect(screen.queryByText(/Resolve/)).toBeNull();
  });

  it('does not render resolve row when no resolved entities', () => {
    const fetchCandidates: FetchCandidates = vi.fn().mockResolvedValue([]);
    render(
      <StageCorrection
        trace={buildTrace({ resolved: [], unresolved: ['milk'] })}
        onCorrect={vi.fn()}
        fetchCandidates={fetchCandidates}
      />,
    );
    expect(screen.queryByText(/Resolve/)).toBeNull();
  });

  it('shows candidates after expanding resolve row', async () => {
    const candidates: ResolveCandidate[] = [
      { entityId: 1, entityType: 'item', score: 0.95 },
      { entityId: 10, entityType: 'person', score: 0.4 },
    ];
    const fetchCandidates: FetchCandidates = vi.fn().mockResolvedValue(candidates);

    render(<StageCorrection trace={buildTrace()} onCorrect={vi.fn()} fetchCandidates={fetchCandidates} />);
    await userEvent.click(screen.getByText(/Resolve/));

    await waitFor(() => {
      expect(screen.getByLabelText('Entity')).toBeDefined();
    });
  });

  it('calls onCorrect with resolve correction when candidate selected', async () => {
    const candidates: ResolveCandidate[] = [
      { entityId: 1, entityType: 'item', score: 0.95 },
      { entityId: 10, entityType: 'person', score: 0.4 },
    ];
    const fetchCandidates: FetchCandidates = vi.fn().mockResolvedValue(candidates);
    const onCorrect = vi.fn();

    render(<StageCorrection trace={buildTrace()} onCorrect={onCorrect} fetchCandidates={fetchCandidates} />);
    await userEvent.click(screen.getByText(/Resolve/));

    await waitFor(() => {
      expect(screen.getByLabelText('Entity')).toBeDefined();
    });

    await userEvent.selectOptions(screen.getByLabelText('Entity'), 'milk');

    await waitFor(() => {
      expect(screen.getByLabelText('Match')).toBeDefined();
    });

    // Select the second candidate (different from current resolution)
    await userEvent.selectOptions(screen.getByLabelText('Match'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onCorrect).toHaveBeenCalledWith({
      stage: 'resolve',
      mention: 'milk',
      preferredId: 10,
      preferredType: 'person',
    });
  });
});
