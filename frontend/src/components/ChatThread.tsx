import { useState } from 'react'
import { ConfirmationCard } from './ConfirmationCard'
import { executeToolCall } from '../lib/execute-tool-call'
import { logActionConfirmation } from '../lib/action-log'
import type { ChatMessage, ProposedAction } from '../lib/types'

interface ChatThreadProps {
  messages: ChatMessage[]
  householdId: number
  conversationId: number | undefined
  onToolExecuted?: () => void
}

type ActionStatus = 'pending' | 'executing' | 'approved' | 'rejected' | 'failed'

interface ActionState {
  status: ActionStatus
  errorMessage?: string
}

export function ChatThread({ messages, householdId, conversationId, onToolExecuted }: ChatThreadProps) {
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({})

  async function handleApprove(action: ProposedAction) {
    setActionStates(prev => ({ ...prev, [action.toolCallId]: { status: 'executing' } }))
    try {
      await executeToolCall(action, householdId)
      setActionStates(prev => ({ ...prev, [action.toolCallId]: { status: 'approved' } }))
      await logActionConfirmation(action, true, householdId, conversationId)
      onToolExecuted?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setActionStates(prev => ({
        ...prev,
        [action.toolCallId]: { status: 'failed', errorMessage },
      }))
    }
  }

  async function handleReject(action: ProposedAction) {
    setActionStates(prev => ({ ...prev, [action.toolCallId]: { status: 'rejected' } }))
    await logActionConfirmation(action, false, householdId, conversationId)
  }

  return (
    <div className="chat-thread">
      {messages.map((message, index) => (
        <div key={index} className={`chat-message chat-message--${message.role}`}>
          {message.content && <p>{message.content}</p>}
          {message.proposedActions?.map(action => {
            const state = actionStates[action.toolCallId] ?? { status: 'pending' }
            if (state.status === 'approved') return <p key={action.toolCallId} className="action-done">Approved</p>
            if (state.status === 'rejected') return <p key={action.toolCallId} className="action-rejected">Rejected</p>
            if (state.status === 'failed') return (
              <div key={action.toolCallId} className="action-error">
                <p className="action-error__message">Failed: {state.errorMessage}</p>
                <button className="btn-retry" onClick={() => handleApprove(action)}>Retry</button>
              </div>
            )
            return (
              <ConfirmationCard
                key={action.toolCallId}
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
                isExecuting={state.status === 'executing'}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
