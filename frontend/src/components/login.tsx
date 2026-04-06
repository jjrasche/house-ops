import { type FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Button } from './ui/button'

type LoginState =
  | { step: 'email' }
  | { step: 'sending' }
  | { step: 'sent'; email: string }
  | { step: 'error'; message: string }

export function Login() {
  const [loginState, setLoginState] = useState<LoginState>({ step: 'email' })
  const [email, setEmail] = useState('')

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault()
    setLoginState({ step: 'sending' })

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    if (error) {
      setLoginState({ step: 'error', message: error.message })
      return
    }

    setLoginState({ step: 'sent', email })
  }

  if (loginState.step === 'sent') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Magic link sent to <strong>{loginState.email}</strong>. Click the link to sign in.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isSending = loginState.step === 'sending'

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>HouseOps</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={sendMagicLink} className="flex flex-col gap-4">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSending}
              autoFocus
            />
            {loginState.step === 'error' && (
              <p className="text-sm text-destructive">{loginState.message}</p>
            )}
            <Button type="submit" disabled={isSending}>
              {isSending ? 'Sending…' : 'Send magic link'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
