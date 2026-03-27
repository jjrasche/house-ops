import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const { error: authError } = await supabase.auth.signInWithOtp({ email })
    if (authError) {
      setError(authError.message)
      return
    }
    setIsSent(true)
  }

  if (isSent) {
    return (
      <div className="login">
        <p>Check your email for a login link.</p>
      </div>
    )
  }

  return (
    <form className="login" onSubmit={handleSubmit}>
      <h1>HouseOps</h1>
      <p>Sign in with your email</p>
      <input
        type="email"
        value={email}
        onChange={event => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
      />
      <button type="submit">Send Magic Link</button>
      {error && <p className="login__error">{error}</p>}
    </form>
  )
}
