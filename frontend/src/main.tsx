import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuxiProvider } from 'auxi/react'
import { supabase } from './lib/supabase.ts'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuxiProvider supabase={supabase}>
      <App />
    </AuxiProvider>
  </StrictMode>,
)
