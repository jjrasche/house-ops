import type { ProposedAction } from '../lib/types'

interface ConfirmationCardProps {
  action: ProposedAction
  onApprove: (action: ProposedAction) => void
  onReject: (action: ProposedAction) => void
  isExecuting: boolean
}

export function ConfirmationCard({
  action,
  onApprove,
  onReject,
  isExecuting,
}: ConfirmationCardProps) {
  return (
    <div className="confirmation-card">
      <div className="confirmation-card__header">
        {formatToolName(action.toolName)}
      </div>
      <dl className="confirmation-card__args">
        {Object.entries(action.arguments).map(([key, value]) => (
          <div key={key} className="confirmation-card__arg">
            <dt>{key}</dt>
            <dd>{formatArgValue(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="confirmation-card__actions">
        <button
          className="btn-approve"
          onClick={() => onApprove(action)}
          disabled={isExecuting}
        >
          {isExecuting ? 'Executing...' : 'Approve'}
        </button>
        <button
          className="btn-reject"
          onClick={() => onReject(action)}
          disabled={isExecuting}
        >
          Reject
        </button>
      </div>
    </div>
  )
}

function formatToolName(toolName: string): string {
  return toolName.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function formatArgValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}
