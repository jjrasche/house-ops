import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54421'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Local dev uses RLS-disabled Supabase (migration 006), no auth needed
export const isLocalDev = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')
