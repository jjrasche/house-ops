import { useState, useCallback, useRef, useEffect } from 'react';
import {
  VoiceProcessor,
  type VoiceProcessorFrameListener,
} from '@picovoice/react-native-voice-processor';
import type { VoiceOptions, VoiceResult, ListeningState } from './types';
import {
  DEEPGRAM_WS_URL, KEEPALIVE_INTERVAL_MS,
  buildConnectionParams, extractTranscript,
  type DeepgramResponse,
} from './deepgram-protocol';
import { DEEPGRAM_API_KEY } from '../constants';

const VOICE_FRAME_LENGTH = 512;
const VOICE_SAMPLE_RATE = 16000;

export function useVoice({ onTranscript, onInterim, endpointingMs = 1000 }: VoiceOptions): VoiceResult {
  const [state, setState] = useState<ListeningState>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef('');
  const frameListenerRef = useRef<VoiceProcessorFrameListener | null>(null);

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onInterimRef = useRef(onInterim);
  onInterimRef.current = onInterim;

  const cleanup = useCallback(() => {
    if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }

    if (frameListenerRef.current) {
      const vp = VoiceProcessor.instance;
      vp.removeFrameListener(frameListenerRef.current);
      if (vp.numFrameListeners === 0) vp.stop();
      frameListenerRef.current = null;
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      wsRef.current.close(); wsRef.current = null;
    }
    accumulatedRef.current = '';
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startListening = useCallback(() => {
    if (!DEEPGRAM_API_KEY) { console.error('EXPO_PUBLIC_DEEPGRAM_API_KEY not set'); return; }
    if (state !== 'idle') return;

    setState('connecting');
    accumulatedRef.current = '';

    const params = buildConnectionParams(endpointingMs);
    const ws = new WebSocket(`${DEEPGRAM_WS_URL}?${params}`, ['token', DEEPGRAM_API_KEY]);
    wsRef.current = ws;

    ws.onopen = () => {
      setState('listening');

      const vp = VoiceProcessor.instance;
      const listener: VoiceProcessorFrameListener = (frame: number[]) => {
        const int16 = new Int16Array(frame);
        if (ws.readyState === WebSocket.OPEN) ws.send(int16.buffer);
      };
      frameListenerRef.current = listener;
      vp.addFrameListener(listener);
      vp.start(VOICE_FRAME_LENGTH, VOICE_SAMPLE_RATE);

      keepaliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }, KEEPALIVE_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      const response = JSON.parse(typeof event.data === 'string' ? event.data : '') as DeepgramResponse;
      if (response.type !== 'Results') return;

      const segment = extractTranscript(response);
      if (segment === '') return;

      if (response.is_final) accumulatedRef.current += (accumulatedRef.current ? ' ' : '') + segment;

      if (response.speech_final && accumulatedRef.current.trim()) {
        onTranscriptRef.current(accumulatedRef.current.trim());
        accumulatedRef.current = '';
      } else if (onInterimRef.current) {
        const preview = accumulatedRef.current ? accumulatedRef.current + ' ' + segment : segment;
        onInterimRef.current(preview);
      }
    };

    ws.onerror = () => { cleanup(); setState('idle'); };
    ws.onclose = () => { cleanup(); setState('idle'); };
  }, [state, endpointingMs, cleanup]);

  const stopListening = useCallback(() => {
    if (accumulatedRef.current.trim()) onTranscriptRef.current(accumulatedRef.current.trim());
    cleanup();
    setState('idle');
  }, [cleanup]);

  return { state, startListening, stopListening };
}
