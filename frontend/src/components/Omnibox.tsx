import { useState, useRef, type FormEvent } from 'react'

interface OmniboxProps {
  onSubmit: (message: string) => void
  isDisabled: boolean
}

export function Omnibox({ onSubmit, isDisabled }: OmniboxProps) {
  const [inputText, setInputText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed || isDisabled) return

    onSubmit(trimmed)
    setInputText('')
    inputRef.current?.focus()
  }

  return (
    <form className="omnibox" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        value={inputText}
        onChange={event => setInputText(event.target.value)}
        placeholder="Add milk to the shopping list..."
        disabled={isDisabled}
        autoFocus
      />
      <button type="submit" disabled={isDisabled || !inputText.trim()}>
        {isDisabled ? '...' : 'Send'}
      </button>
    </form>
  )
}
