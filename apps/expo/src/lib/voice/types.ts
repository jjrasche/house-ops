export type ListeningState = 'idle' | 'connecting' | 'listening';

export interface VoiceOptions {
  readonly onTranscript: (transcript: string) => void;
  readonly onInterim?: (transcript: string) => void;
  readonly endpointingMs?: number;
}

export interface VoiceResult {
  readonly state: ListeningState | undefined;
  readonly startListening: () => void;
  readonly stopListening: () => void;
}
