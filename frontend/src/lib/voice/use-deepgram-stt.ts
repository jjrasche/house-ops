import { useState, useCallback, useRef, useEffect } from 'react';

// --- Public types ---

export type ListeningState = 'idle' | 'connecting' | 'listening';

export interface UseDeepgramSTTOptions {
  readonly onTranscript: (transcript: string) => void;
  readonly onInterim?: (transcript: string) => void;
  readonly endpointingMs?: number;
}

export interface UseDeepgramSTTResult {
  readonly state: ListeningState;
  readonly startListening: () => void;
  readonly stopListening: () => void;
}

// --- Constants ---

const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';
const SAMPLE_RATE = 16000;
const KEEPALIVE_INTERVAL_MS = 8000;

// --- Hook ---

export function useDeepgramSTT({
  onTranscript,
  onInterim,
  endpointingMs = 1000,
}: UseDeepgramSTTOptions): UseDeepgramSTTResult {
  const [state, setState] = useState<ListeningState>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef('');

  // Keep callback refs fresh without re-triggering effects
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onInterimRef = useRef(onInterim);
  onInterimRef.current = onInterim;

  const cleanup = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    accumulatedRef.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const startListening = useCallback(() => {
    const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY as string | undefined;
    if (!apiKey) {
      console.error('VITE_DEEPGRAM_API_KEY not set');
      return;
    }
    if (state !== 'idle') return;

    setState('connecting');
    accumulatedRef.current = '';

    const params = buildConnectionParams(endpointingMs);
    const ws = new WebSocket(`${DEEPGRAM_WS_URL}?${params}`, ['token', apiKey]);
    wsRef.current = ws;

    ws.onopen = async () => {
      try {
        await connectMicrophone(ws, mediaStreamRef, audioContextRef, processorRef);
        setState('listening');
        keepaliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, KEEPALIVE_INTERVAL_MS);
      } catch {
        cleanup();
        setState('idle');
      }
    };

    ws.onmessage = (event) => {
      const response = JSON.parse(event.data as string) as DeepgramResponse;
      if (response.type !== 'Results') return;

      const segment = extractTranscript(response);
      if (segment === '') return;

      if (response.is_final) {
        accumulatedRef.current += (accumulatedRef.current ? ' ' : '') + segment;
      }

      if (response.speech_final && accumulatedRef.current.trim()) {
        onTranscriptRef.current(accumulatedRef.current.trim());
        accumulatedRef.current = '';
      } else if (onInterimRef.current) {
        const preview = accumulatedRef.current
          ? accumulatedRef.current + ' ' + segment
          : segment;
        onInterimRef.current(preview);
      }
    };

    ws.onerror = () => {
      cleanup();
      setState('idle');
    };

    ws.onclose = () => {
      cleanup();
      setState('idle');
    };
  }, [state, endpointingMs, cleanup]);

  const stopListening = useCallback(() => {
    // Flush accumulated transcript before stopping
    if (accumulatedRef.current.trim()) {
      onTranscriptRef.current(accumulatedRef.current.trim());
    }
    cleanup();
    setState('idle');
  }, [cleanup]);

  return { state, startListening, stopListening };
}

// --- Types ---

interface DeepgramResponse {
  readonly type: string;
  readonly is_final?: boolean;
  readonly speech_final?: boolean;
  readonly channel?: {
    readonly alternatives?: ReadonlyArray<{ readonly transcript?: string }>;
  };
}

// --- Concept: build Deepgram WebSocket query parameters ---

function buildConnectionParams(endpointingMs: number): URLSearchParams {
  return new URLSearchParams({
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
}

// --- Concept: connect browser microphone and stream PCM chunks ---

async function connectMicrophone(
  ws: WebSocket,
  mediaStreamRef: React.MutableRefObject<MediaStream | null>,
  audioContextRef: React.MutableRefObject<AudioContext | null>,
  processorRef: React.MutableRefObject<ScriptProcessorNode | null>,
): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true },
  });
  mediaStreamRef.current = stream;

  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  audioContextRef.current = audioContext;

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  processorRef.current = processor;

  processor.onaudioprocess = (event) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const pcmData = convertFloat32ToInt16(event.inputBuffer.getChannelData(0));
    ws.send(pcmData.buffer);
  };

  source.connect(processor);
  processor.connect(audioContext.destination);
}

// --- Leaf: extract transcript text from Deepgram response ---

function extractTranscript(response: DeepgramResponse): string {
  return response.channel?.alternatives?.[0]?.transcript ?? '';
}

// --- Leaf: convert Float32 PCM to Int16 for Deepgram linear16 encoding ---

function convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Array[i]!));
    int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return int16Array;
}
