import { supabase } from './supabase'
import type { ProposedAction } from './types'

export async function logActionConfirmation(
  action: ProposedAction,
  confirmed: boolean,
  householdId: number,
  conversationId: number | undefined,
): Promise<void> {
  const row = {
    input_text: action.toolName,
    proposed_action: { tool: action.toolName, arguments: action.arguments },
    confirmed,
    executed_at: confirmed ? new Date().toISOString() : null,
    household_id: householdId,
    conversation_id: conversationId ?? null,
  }
  const { error } = await supabase.from('action_log').insert(row)
  if (error) console.error('Failed to log action:', error.message)
}
