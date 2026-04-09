import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { StageSummary } from '../../components/stage-summary';
import type { PipelineTrace } from '@house-ops/core';

afterEach(cleanup);

// --- Test data ---

function buildTrace(overrides: Partial<PipelineTrace> = {}): PipelineTrace {
  return {
    inputText: 'Buy milk',
    verb: 'buy',
    entityMentions: [{ text: 'milk', typeHint: 'item' }],
    resolved: [{ mention: 'milk', entityId: 1, entityType: 'item', score: 0.95 }],
    unresolved: [],
    toolName: 'update_item',
    params: { item_id: 1, status: 'on_list' },
    ...overrides,
  };
}

// --- Tests ---

describe('StageSummary', () => {
  it('renders extract row with verb and entity', () => {
    render(<StageSummary trace={buildTrace()} />);

    const extractRow = screen.getByText(/verb="buy"/);
    expect(extractRow).toBeDefined();
    expect(extractRow.textContent).toContain('"milk" (item)');
  });

  it('renders resolve row with matched entity and score', () => {
    render(<StageSummary trace={buildTrace()} />);

    const resolveRow = screen.getByText(/milk → item #1/);
    expect(resolveRow).toBeDefined();
    expect(resolveRow.textContent).toContain('95%');
  });

  it('renders unresolved mentions in resolve row', () => {
    const trace = buildTrace({
      resolved: [],
      unresolved: ['oat milk'],
    });
    render(<StageSummary trace={trace} />);

    expect(screen.getByText(/oat milk → unresolved/)).toBeDefined();
  });

  it('renders classify row with tool name', () => {
    render(<StageSummary trace={buildTrace()} />);

    expect(screen.getByText('update_item')).toBeDefined();
  });

  it('renders assemble row with param summary', () => {
    render(<StageSummary trace={buildTrace()} />);

    expect(screen.getByText(/item_id=1/)).toBeDefined();
    expect(screen.getByText(/status=on_list/)).toBeDefined();
  });

  it('hides classify row when toolName is null', () => {
    const trace = buildTrace({ toolName: null, params: {} });
    const { container } = render(<StageSummary trace={trace} />);

    const classifyRow = container.querySelector('[data-stage="classify"]');
    expect(classifyRow).toBeNull();
  });

  it('hides assemble row when params are empty', () => {
    const trace = buildTrace({ params: {} });
    const { container } = render(<StageSummary trace={trace} />);

    const assembleRow = container.querySelector('[data-stage="assemble"]');
    expect(assembleRow).toBeNull();
  });

  it('renders multiple resolved entities', () => {
    const trace = buildTrace({
      entityMentions: [
        { text: 'cereal', typeHint: 'item' },
        { text: 'Costco', typeHint: 'store' },
      ],
      resolved: [
        { mention: 'cereal', entityId: 3, entityType: 'item', score: 0.92 },
        { mention: 'Costco', entityId: 101, entityType: 'store', score: 1.0 },
      ],
    });
    render(<StageSummary trace={trace} />);

    expect(screen.getByText(/cereal → item #3/)).toBeDefined();
    expect(screen.getByText(/Costco → store #101/)).toBeDefined();
  });

  it('renders all four stage rows as list items', () => {
    const { container } = render(<StageSummary trace={buildTrace()} />);

    const listItems = container.querySelectorAll('[role="listitem"]');
    expect(listItems).toHaveLength(4);
  });
});
