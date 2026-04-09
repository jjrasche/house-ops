import { Platform } from 'react-native';

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
  // Dynamic require: PorcupineManager pulls in native modules that crash web
  const { PorcupineManager, BuiltInKeywords } =
    require('@picovoice/porcupine-react-native') as typeof import('@picovoice/porcupine-react-native');

  let manager: InstanceType<typeof PorcupineManager> | null = null;

  return {
    async start(onDetected) {
      const accessKey = process.env.EXPO_PUBLIC_PORCUPINE_ACCESS_KEY;
      if (!accessKey) {
        console.error('EXPO_PUBLIC_PORCUPINE_ACCESS_KEY not set');
        return;
      }

      // JARVIS built-in keyword as placeholder until custom "Hey House" .ppn is trained
      manager = await PorcupineManager.fromBuiltInKeywords(
        accessKey,
        [BuiltInKeywords.JARVIS],
        () => onDetected(),
        (error) => console.error('[wake-word]', error.message),
      );
      await manager.start();
    },

    async stop() {
      await manager?.stop();
      manager?.delete();
      manager = null;
    },

    isAvailable: true,
  };
}

export const wakeWord: WakeWordService =
  Platform.OS === 'web' ? createNoopService() : createNativeService();
