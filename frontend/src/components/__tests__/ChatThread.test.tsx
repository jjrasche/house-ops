import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ChatThread } from '../ChatThread'
import type { ChatMessage } from '../../lib/types'

// -- Mocks --

const mockExecuteToolCall = vi.fn()
const mockLogActionConfirmation = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/execute-tool-call', () => ({
  executeToolCall: (...args: unknown[]) => mockExecuteToolCall(...args),
}))

vi.mock('../../lib/action-log', () => ({
  logActionConfirmation: (...args: unknown[]) => mockLogActionConfirmation(...args),
}))

// -- Fixtures --

function buildMessagesWithAction(): ChatMessage[] {
  return [
    {
      role: 'assistant',
      content: 'I will add milk to your shopping list.',
      proposedActions: [
        {
          toolCallId: 'call_001',
          toolName: 'add_shopping_list_item',
          arguments: { name: 'Milk', quantity: 1 },
        },
      ],
    },
  ]
}

// -- Tests --

describe('ChatThread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows error message when tool execution fails', async () => {
    mockExecuteToolCall.mockRejectedValueOnce(new Error('Row not found'))

    render(
      <ChatThread
        messages={buildMessagesWithAction()}
        householdId={1}
        conversationId={1}
        onToolExecuted={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Approve'))

    await waitFor(() => {
      expect(screen.getByText('Failed: Row not found')).toBeTruthy()
    })
  })

  it('shows "Unknown error" when non-Error is thrown', async () => {
    mockExecuteToolCall.mockRejectedValueOnce('string error')

    render(
      <ChatThread
        messages={buildMessagesWithAction()}
        householdId={1}
        conversationId={1}
      />,
    )

    fireEvent.click(screen.getByText('Approve'))

    await waitFor(() => {
      expect(screen.getByText('Failed: Unknown error')).toBeTruthy()
    })
  })

  it('renders retry button on failure', async () => {
    mockExecuteToolCall.mockRejectedValueOnce(new Error('Network error'))

    render(
      <ChatThread
        messages={buildMessagesWithAction()}
        householdId={1}
        conversationId={1}
      />,
    )

    fireEvent.click(screen.getByText('Approve'))

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeTruthy()
    })
  })

  it('retries execution when retry button is clicked', async () => {
    mockExecuteToolCall
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ id: 1 })

    const onToolExecuted = vi.fn()

    render(
      <ChatThread
        messages={buildMessagesWithAction()}
        householdId={1}
        conversationId={1}
        onToolExecuted={onToolExecuted}
      />,
    )

    fireEvent.click(screen.getByText('Approve'))

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Retry'))

    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeTruthy()
    })

    expect(mockExecuteToolCall).toHaveBeenCalledTimes(2)
    expect(onToolExecuted).toHaveBeenCalledTimes(1)
  })

  it('does not show error banner for successful execution', async () => {
    mockExecuteToolCall.mockResolvedValueOnce({ id: 1 })

    render(
      <ChatThread
        messages={buildMessagesWithAction()}
        householdId={1}
        conversationId={1}
        onToolExecuted={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Approve'))

    await waitFor(() => {
      expect(screen.getByText('Approved')).toBeTruthy()
    })

    expect(screen.queryByText(/Failed:/)).toBeNull()
    expect(screen.queryByText('Retry')).toBeNull()
  })
})
