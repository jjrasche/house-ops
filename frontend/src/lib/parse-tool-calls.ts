import type { ToolCall, ProposedAction } from './types'

export function parseToolCalls(toolCalls: ToolCall[]): ProposedAction[] {
  return toolCalls.map(parseOneToolCall)
}

function parseOneToolCall(toolCall: ToolCall): ProposedAction {
  return {
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    arguments: JSON.parse(toolCall.function.arguments),
  }
}
