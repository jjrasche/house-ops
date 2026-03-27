// Mirrors backend types from supabase/functions/_shared/groq-messages.ts

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface AssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: ToolCall[]
}

export interface ChatResponse {
  conversation_id: number
  message: AssistantMessage
  model: string
}

// Parsed tool call with deserialized arguments for display
export interface ProposedAction {
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | null
  proposedActions?: ProposedAction[]
}
