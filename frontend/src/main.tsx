import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuxiProvider } from '@factoredui/react'
import { createWebAdapter } from '@factoredui/core'
import { auxiSupabase } from './lib/supabase.ts'
import './index.css'
import App from './App.tsx'

const adapter = createWebAdapter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuxiProvider supabase={auxiSupabase} adapter={adapter} platform="web">
      <App />
    </AuxiProvider>
  </StrictMode>,
)
