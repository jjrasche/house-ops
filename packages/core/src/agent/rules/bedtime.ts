import type { AgentAction } from '../types';

const BEDTIME_PATTERNS = [
  /^bedtime$/i,
  /^bed\s*time$/i,
  /^story\s*time$/i,
  /^time\s+for\s+bed$/i,
  /^lights?\s+out$/i,
];

const DIM_ROOMS = ['kids_bedroom', 'living_room'] as const;

interface BedtimePayload {
  readonly command: 'dim';
  readonly rooms: readonly string[];
  readonly duration_minutes: number;
  readonly target_brightness: number;
  readonly color_temp: number;
}

/**
 * Detect bedtime intent from raw input text.
 */
export function matchBedtimeIntent(text: string): boolean {
  const trimmed = text.trim();
  return BEDTIME_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Build agent actions for bedtime mode.
 * Returns one silent action per target device with dim payload.
 */
export function buildBedtimeActions(userId: string): AgentAction[] {
  const payload: BedtimePayload = {
    command: 'dim',
    rooms: DIM_ROOMS,
    duration_minutes: 15,
    target_brightness: 5,
    color_temp: 2700,
  };

  return [{
    user_id: userId,
    target_device: 'home_hub',
    action_type: 'silent',
    payload: payload as unknown as Record<string, unknown>,
    priority: 'immediate',
    status: 'pending',
  }];
}
