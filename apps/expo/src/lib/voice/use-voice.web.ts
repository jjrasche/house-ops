import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceOptions, VoiceResult, ListeningState } from './types';
import {
  DEEPGRAM_WS_URL, SAMPLE_RATE, KEEPALIVE_INTERVAL_MS,
  buildConnectionParams, extractTranscript, convertFloat32ToInt16,
  type DeepgramResponse,
} from './deepgram-protocol';
import { DEEPGRAM_API_KEY } from '../constants';

// Web implementation: getUserMedia + AudioContext + WebSocket to Deepgram.
// Runs on Expo web and mirrors the original PWA voice hook.

export function useVoice({ onTranscript, onInterim, endpointingMs = 1000 }: VoiceOptions): VoiceResult {
  const [state, setState] = useState<ListeningState>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedRef = useRef('');

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onInterimRef = useRef(onInterim);
  onInterimRef.current = onInterim;

  const cleanup = useCallback(() => {
    if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
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

    ws.onopen = async () => {
      try {
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
          ws.send(convertFloat32ToInt16(event.inputBuffer.getChannelData(0)).buffer);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
        setState('listening');

        keepaliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }));
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
