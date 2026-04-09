import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54421'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

// Local dev uses RLS-disabled Supabase (migration 006), no auth needed
export const isLocalDev = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')

// App client — queries house_ops schema (prod) or public (local dev)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: (isLocalDev ? 'public' : 'house_ops') as 'public' },
})

// Auxi client — queries auxi schema for behavioral capture
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auxiSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'auxi' as 'public' },
})
