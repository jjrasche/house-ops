import { supabase } from './supabase'
import type { ChatResponse } from './types'

export async function sendChatMessage(
  message: string,
  conversationId?: number,
): Promise<ChatResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ message, conversation_id: conversationId }),
    },
  )

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error ?? `Chat failed: ${response.status}`)
  }

  return response.json()
}
