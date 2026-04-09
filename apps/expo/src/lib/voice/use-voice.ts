// Platform entry point — Metro/webpack resolves to .web.ts or .native.ts automatically.
// This file exists as a fallback and re-exports the types for direct import.

export { useVoice } from './use-voice.web';
export type { VoiceOptions, VoiceResult, ListeningState } from './types';
