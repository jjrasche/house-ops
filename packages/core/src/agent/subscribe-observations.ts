import type { SupabaseClient } from '@supabase/supabase-js';
import type { Observation, ObservationHandler, Unsubscribe } from './types';

/**
 * Subscribe to new observations via Supabase Realtime.
 * Peripherals (phone, watch) insert rows; this fires the handler for each.
 */
export function subscribeObservations(
  supabase: SupabaseClient,
  onObservation: ObservationHandler,
): Unsubscribe {
  const channel = supabase
    .channel('observations-insert')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'observations' },
      (payload: { new: Record<string, unknown> }) => {
        onObservation(payload.new as unknown as Observation);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
