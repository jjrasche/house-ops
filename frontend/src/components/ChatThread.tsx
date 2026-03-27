import { useState } from 'react'
import { ConfirmationCard } from './ConfirmationCard'
import { executeToolCall } from '../lib/execute-tool-call'
import type { ChatMessage, ProposedAction } from '../lib/types'

interface ChatThreadProps {
  messages: ChatMessage[]
  householdId: number
}

type ActionStatus = 'pending' | 'executing' | 'approved' | 'rejected' | 'failed'

export function ChatThread({ messages, householdId }: ChatThreadProps) {
  const [actionStatuses, setActionStatuses] = useState<Record<string, ActionStatus>>({})

  async function handleApprove(action: ProposedAction) {
    setActionStatuses(prev => ({ ...prev, [action.toolCallId]: 'executing' }))
    try {
      await executeToolCall(action, householdId)
      setActionStatuses(prev => ({ ...prev, [action.toolCallId]: 'approved' }))
    } catch {
      setActionStatuses(prev => ({ ...prev, [action.toolCallId]: 'failed' }))
    }
  }

  function handleReject(action: ProposedAction) {
    setActionStatuses(prev => ({ ...prev, [action.toolCallId]: 'rejected' }))
  }

  return (
    <div className="chat-thread">
      {messages.map((message, index) => (
        <div key={index} className={`chat-message chat-message--${message.role}`}>
          {message.content && <p>{message.content}</p>}
          {message.proposedActions?.map(action => {
            const status = actionStatuses[action.toolCallId] ?? 'pending'
            if (status === 'approved') return <p key={action.toolCallId} className="action-done">Approved</p>
            if (status === 'rejected') return <p key={action.toolCallId} className="action-rejected">Rejected</p>
            if (status === 'failed') return <p key={action.toolCallId} className="action-failed">Failed</p>
            return (
              <ConfirmationCard
                key={action.toolCallId}
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
                isExecuting={status === 'executing'}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
