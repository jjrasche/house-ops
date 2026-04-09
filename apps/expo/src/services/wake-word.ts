import { Platform } from 'react-native';

// Wake word detection via Picovoice Porcupine.
// Native-only — no-op on web (browsers can't do always-listening).
//
// To activate:
// 1. npm install @picovoice/porcupine-react-native @picovoice/react-native-voice-processor
// 2. Get an access key from console.picovoice.ai
// 3. Set EXPO_PUBLIC_PORCUPINE_ACCESS_KEY in .env
// 4. Train a custom wake word ("Hey House") at console.picovoice.ai
// 5. Download the .ppn file and add to assets/
// 6. Uncomment the implementation below

export type WakeWordCallback = () => void;

interface WakeWordService {
  start: (onDetected: WakeWordCallback) => Promise<void>;
  stop: () => Promise<void>;
  isAvailable: boolean;
}

function createNoopService(): WakeWordService {
  return {
    start: async () => {},
    stop: async () => {},
    isAvailable: false,
  };
}

function createNativeService(): WakeWordService {
  // TODO: Uncomment when Porcupine SDK is installed
  //
  // import { Porcupine, BuiltInKeywords } from '@picovoice/porcupine-react-native';
  //
  // let porcupine: Porcupine | null = null;
  //
  // return {
  //   async start(onDetected) {
  //     const accessKey = process.env.EXPO_PUBLIC_PORCUPINE_ACCESS_KEY;
  //     if (!accessKey) { console.error('PORCUPINE_ACCESS_KEY not set'); return; }
  //
  //     porcupine = await Porcupine.fromBuiltInKeywords(accessKey, [BuiltInKeywords.JARVIS]);
  //     // Or use custom keyword: Porcupine.fromKeywordPaths(accessKey, ['assets/hey-house.ppn'])
  //
  //     const { VoiceProcessor } = require('@picovoice/react-native-voice-processor');
  //     await VoiceProcessor.start(porcupine.frameLength, porcupine.sampleRate);
  //     VoiceProcessor.addFrameListener((frame: number[]) => {
  //       const keywordIndex = porcupine?.process(frame);
  //       if (keywordIndex !== undefined && keywordIndex >= 0) onDetected();
  //     });
  //   },
  //   async stop() {
  //     const { VoiceProcessor } = require('@picovoice/react-native-voice-processor');
  //     await VoiceProcessor.stop();
  //     await porcupine?.delete();
  //     porcupine = null;
  //   },
  //   isAvailable: true,
  // };

  return createNoopService();
}

export const wakeWord: WakeWordService =
  Platform.OS === 'web' ? createNoopService() : createNativeService();
