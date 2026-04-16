import type { SupabaseClient } from '@supabase/supabase-js';
import type { WriteActionResult } from './write-action';
import type { MemoryClaim } from './query-claims';
import { writeAction } from './write-action';
import { searchClaims, extractSearchKeywords } from './query-claims';
import { matchBedtimeIntent, buildBedtimeActions } from './rules/bedtime';
import { matchPreheatIntent, buildPreheatActions } from './rules/preheat';

export interface IntentResult {
  readonly handled: boolean;
  readonly rule?: string;
  readonly actions: WriteActionResult[];
  readonly claims: MemoryClaim[];
}

/**
 * Query relevant memory claims, then check input against automation rules.
 * Claims provide context so rules can make smarter decisions.
 * Returns handled=false if no rule matched — caller should proceed with pipeline.
 */
export async function handleAutomationIntent(
  text: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<IntentResult> {
  const claims = await queryRelevantClaims(supabase, userId, text);

  if (matchBedtimeIntent(text)) {
    const actions = buildBedtimeActions(userId);
    const results = await writeAllActions(supabase, actions);
    return { handled: true, rule: 'bedtime', actions: results, claims };
  }

  const preheatMatch = matchPreheatIntent(text);
  if (preheatMatch) {
    const actions = buildPreheatActions(userId, preheatMatch);
    const results = await writeAllActions(supabase, actions);
    return { handled: true, rule: 'preheat', actions: results, claims };
  }

  return { handled: false, actions: [], claims };
}

async function queryRelevantClaims(
  supabase: SupabaseClient,
  userId: string,
  text: string,
): Promise<MemoryClaim[]> {
  const keywords = extractSearchKeywords(text);
  if (keywords.length === 0) return [];

  const result = await searchClaims(supabase, userId, keywords);
  return result.claims;
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
