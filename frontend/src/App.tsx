import { useAuth } from './hooks/use-auth'
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
  const { messages, isSending, sendMessage } = useChat()

  // Hardcoded until profile query resolves household_id from session user
  const householdId = 1

  return (
    <div className="app">
      <header className="app__header">
        <h1>HouseOps</h1>
      </header>
      <main className="app__main">
        <PanelLayout householdId={householdId} />
        <ChatThread messages={messages} householdId={householdId} />
      </main>
      <footer className="app__footer">
        <Omnibox onSubmit={sendMessage} isDisabled={isSending} />
      </footer>
    </div>
  )
}
