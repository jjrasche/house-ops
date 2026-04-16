import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentAction } from './types';

export interface WriteActionResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

/**
 * Insert a single agent action into the agent_actions table.
 * Devices subscribe to this table via Realtime and execute pending actions.
 */
export async function writeAction(
  supabase: SupabaseClient,
  action: AgentAction,
): Promise<WriteActionResult> {
  const { data, error } = await supabase
    .from('agent_actions')
    .insert(action)
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, id: (data as { id: string }).id };
}
