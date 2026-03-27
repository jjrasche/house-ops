import { useState, useCallback } from 'react'
import { useAuth } from './hooks/use-auth'
import { useHousehold } from './hooks/use-household'
import { useChat } from './hooks/use-chat'
import { LoginForm } from './components/LoginForm'
import { Omnibox } from './components/Omnibox'
import { ChatThread } from './components/ChatThread'
import { PanelLayout } from './components/PanelLayout'
import './App.css'

export default function App() {
  const { session, isLoading } = useAuth()

  if (isLoading) return <div className="loading">Loading...</div>
  if (!session) return <LoginForm />

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const { householdId, isLoading: isHouseholdLoading } = useHousehold()
  const { messages, isSending, sendMessage, conversationId } = useChat()
  const [panelRefreshKey, setPanelRefreshKey] = useState(0)

  const handleToolExecuted = useCallback(() => {
    setPanelRefreshKey(prev => prev + 1)
  }, [])

  if (isHouseholdLoading) return <div className="loading">Loading household...</div>
  if (!householdId) return <div className="error">No household found for your account.</div>

  return (
    <div className="app">
      <header className="app__header">
        <h1>HouseOps</h1>
      </header>
      <main className="app__main">
        <PanelLayout householdId={householdId} refreshKey={panelRefreshKey} />
        <ChatThread
          messages={messages}
          householdId={householdId}
          conversationId={conversationId}
          onToolExecuted={handleToolExecuted}
        />
      </main>
      <footer className="app__footer">
        <Omnibox onSubmit={sendMessage} isDisabled={isSending} />
      </footer>
    </div>
  )
}
