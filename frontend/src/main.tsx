import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from '@factoredui/react'
import { auxiSupabase } from './lib/supabase.ts'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider supabase={auxiSupabase}>
      <App />
    </Provider>
  </StrictMode>,
)
