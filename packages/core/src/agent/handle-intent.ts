import type { SupabaseClient } from '@supabase/supabase-js';
import type { WriteActionResult } from './write-action';
import { writeAction } from './write-action';
import { matchBedtimeIntent, buildBedtimeActions } from './rules/bedtime';

export interface IntentResult {
  readonly handled: boolean;
  readonly rule?: string;
  readonly actions: WriteActionResult[];
}

/**
 * Check raw input text against automation rules.
 * If a rule matches, write agent actions and return handled=true.
 * Returns handled=false if no rule matched — caller should proceed with pipeline.
 */
export async function handleAutomationIntent(
  text: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<IntentResult> {
  if (matchBedtimeIntent(text)) {
    const actions = buildBedtimeActions(userId);
    const results = await writeAllActions(supabase, actions);
    return { handled: true, rule: 'bedtime', actions: results };
  }

  return { handled: false, actions: [] };
}

async function writeAllActions(
  supabase: SupabaseClient,
  actions: Parameters<typeof writeAction>[1][],
): Promise<WriteActionResult[]> {
  const results: WriteActionResult[] = [];
  for (const action of actions) {
    results.push(await writeAction(supabase, action));
  }
  return results;
}
