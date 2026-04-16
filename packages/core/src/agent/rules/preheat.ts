import type { AgentAction } from '../types';

const DEFAULT_TEMP = 350;
const DEFAULT_UNIT = 'F';

/**
 * Regex captures: "preheat [the] oven [to] <temp> [degrees] [F/C]"
 * Also matches: "oven to 375", "preheat to 400", "preheat 425"
 */
const PREHEAT_PATTERN =
  /^(?:pre[- ]?heat|warm\s+up)\s+(?:the\s+)?(?:oven\s+)?(?:to\s+)?(\d{2,3})\s*(?:degrees?\s*)?([fc])?$/i;

const OVEN_PREHEAT_PATTERN =
  /^(?:set\s+)?(?:the\s+)?oven\s+(?:to\s+)?(\d{2,3})\s*(?:degrees?\s*)?([fc])?$/i;

export interface PreheatParams {
  readonly targetTemp: number;
  readonly unit: 'F' | 'C';
}

interface PreheatPayload {
  readonly command: 'preheat';
  readonly target_temp: number;
  readonly unit: 'F' | 'C';
}

/**
 * Detect preheat intent and extract temperature parameter.
 * Returns extracted params on match, null on no match.
 */
export function matchPreheatIntent(text: string): PreheatParams | null {
  const trimmed = text.trim();
  const match = PREHEAT_PATTERN.exec(trimmed) ?? OVEN_PREHEAT_PATTERN.exec(trimmed);

  if (!match) return null;

  const rawTemp = parseInt(match[1], 10);
  const rawUnit = match[2]?.toUpperCase();
  const unit = rawUnit === 'C' ? 'C' as const : DEFAULT_UNIT;
  const targetTemp = isReasonableTemp(rawTemp, unit) ? rawTemp : DEFAULT_TEMP;

  return { targetTemp, unit };
}

/**
 * Build agent actions for oven preheat.
 * Returns one silent action targeting home_hub with preheat payload.
 */
export function buildPreheatActions(
  userId: string,
  params: PreheatParams,
): AgentAction[] {
  const payload: PreheatPayload = {
    command: 'preheat',
    target_temp: params.targetTemp,
    unit: params.unit,
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

function isReasonableTemp(temp: number, unit: 'F' | 'C'): boolean {
  if (unit === 'F') return temp >= 150 && temp <= 550;
  return temp >= 65 && temp <= 290;
}
