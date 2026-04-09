import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey);
}

export function isLocalDev(url: string): boolean {
  return url.includes('127.0.0.1') || url.includes('localhost');
}
