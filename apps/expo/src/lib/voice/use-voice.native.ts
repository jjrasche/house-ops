import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceOptions, VoiceResult, ListeningState } from './types';
import {
  DEEPGRAM_WS_URL, KEEPALIVE_INTERVAL_MS,
  buildConnectionParams, extractTranscript,
  type DeepgramResponse,
} from './deepgram-protocol';
import { DEEPGRAM_API_KEY } from '../constants';

// Native implementation: uses expo-av or react-native-voice-processor for audio capture.
// For now, captures audio via the RN WebSocket + a placeholder for native audio.
//
// TODO: Wire @picovoice/react-native-voice-processor for raw PCM frames.
// TODO: Add Porcupine wake word detection before activating Deepgram.
// TODO: Add Android foreground service for background listening.
//
// Current state: functional STT via Deepgram, no wake word, no background.
// The architecture is ready — swap the audio source when Porcupine SDK is added.

export function useVoice({ onTranscript, onInterim, endpointingMs = 1000 }: VoiceOptions): VoiceResult {
  const [state, setState] = useState<ListeningState>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef('');

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onInterimRef = useRef(onInterim);
  onInterimRef.current = onInterim;

  const cleanup = useCallback(() => {
    if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      wsRef.current.close(); wsRef.current = null;
    }
    accumulatedRef.current = '';
    // TODO: stop native audio capture here
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

      // TODO: Start @picovoice/react-native-voice-processor here.
      // It provides raw PCM Int16 frames via a callback.
      // Each frame is sent directly to ws.send(frame.buffer).
      //
      // Placeholder: without native audio capture, the WebSocket stays open
      // but receives no audio. Install the voice processor to activate:
      //
      //   import { VoiceProcessor } from '@picovoice/react-native-voice-processor';
      //   VoiceProcessor.start(512, 16000).then(() => {
      //     VoiceProcessor.addFrameListener((frame: number[]) => {
      //       const int16 = new Int16Array(frame);
      //       if (ws.readyState === WebSocket.OPEN) ws.send(int16.buffer);
      //     });
      //   });

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
    // TODO: VoiceProcessor.stop();
  }, [cleanup]);

  return { state, startListening, stopListening };
}
