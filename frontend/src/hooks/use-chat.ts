import { useState, useCallback } from 'react'
import { sendChatMessage } from '../lib/chat-api'
import { parseToolCalls } from '../lib/parse-tool-calls'
import type { ChatMessage } from '../lib/types'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<number | undefined>()
  const [isSending, setIsSending] = useState(false)

  const sendMessage = useCallback(async (text: string) => {
    setIsSending(true)
    setMessages(prev => [...prev, { role: 'user', content: text }])

    try {
      const response = await sendChatMessage(text, conversationId)
      setConversationId(response.conversation_id)

      const proposedActions = response.message.tool_calls
        ? parseToolCalls(response.message.tool_calls)
        : undefined

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: response.message.content,
          proposedActions,
        },
      ])
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong'
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${errorMessage}` },
      ])
    } finally {
      setIsSending(false)
    }
  }, [conversationId])

  return { messages, isSending, sendMessage }
}
