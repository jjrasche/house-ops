export type ActionType = 'speak' | 'display' | 'haptic' | 'silent';
export type ActionPriority = 'immediate' | 'queued';
export type ActionStatus = 'pending' | 'delivered' | 'expired';

export interface AgentAction {
  readonly user_id: string;
  readonly target_device: string;
  readonly action_type: ActionType;
  readonly payload: Record<string, unknown>;
  readonly priority: ActionPriority;
  readonly status: ActionStatus;
  readonly expires_at?: string;
}

export interface Observation {
  readonly id: string;
  readonly user_id: string;
  readonly device_id: string;
  readonly trigger_type: string;
  readonly location_lat?: number;
  readonly location_lon?: number;
  readonly location_accuracy?: number;
  readonly activity_type?: string;
  readonly heart_rate_bpm?: number;
  readonly ambient_db?: number;
  readonly speech_detected?: boolean;
  readonly transcript?: string;
  readonly visual_ref?: string;
  readonly audio_ref?: string;
  readonly occurred_at: string;
  readonly created_at: string;
}

export type ObservationHandler = (observation: Observation) => void;
export type Unsubscribe = () => void;
