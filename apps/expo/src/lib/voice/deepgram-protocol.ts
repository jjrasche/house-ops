// Shared Deepgram WebSocket protocol — platform-agnostic.
// Both web and native voice implementations use this for message framing.

export const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';
export const SAMPLE_RATE = 16000;
export const KEEPALIVE_INTERVAL_MS = 8000;

export interface DeepgramResponse {
  readonly type: string;
  readonly is_final?: boolean;
  readonly speech_final?: boolean;
  readonly channel?: {
    readonly alternatives?: ReadonlyArray<{ readonly transcript?: string }>;
  };
}

export function buildConnectionParams(endpointingMs: number): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en',
    punctuate: 'true',
    interim_results: 'true',
    endpointing: String(endpointingMs),
    utterance_end_ms: '1500',
    vad_events: 'true',
    encoding: 'linear16',
    sample_rate: String(SAMPLE_RATE),
    channels: '1',
  });
  return params.toString();
}

export function extractTranscript(response: DeepgramResponse): string {
  return response.channel?.alternatives?.[0]?.transcript ?? '';
}

export function convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Array[i]!));
    int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return int16Array;
}
