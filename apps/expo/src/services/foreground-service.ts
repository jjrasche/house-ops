import { Platform } from 'react-native';

// Android foreground service for always-on wake word listening.
// Keeps the app alive with a persistent notification when screen is off.
//
// To activate:
// 1. npm install react-native-foreground-service (or notifee for better Expo compat)
// 2. Add to AndroidManifest.xml:
//    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
//    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
//    <service android:name="..." android:foregroundServiceType="microphone" />
// 3. Uncomment the implementation below

interface ForegroundServiceHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isAvailable: boolean;
}

function createNoopService(): ForegroundServiceHandle {
  return {
    start: async () => {},
    stop: async () => {},
    isAvailable: false,
  };
}

// TODO: Uncomment when foreground service package is installed
//
// function createAndroidService(): ForegroundServiceHandle {
//   return {
//     async start() {
//       // Start foreground service with "HouseOps is listening" notification
//       // Then start Porcupine wake word detection in the service context
//     },
//     async stop() {
//       // Stop wake word detection and remove notification
//     },
//     isAvailable: true,
//   };
// }

export const foregroundService: ForegroundServiceHandle =
  Platform.OS === 'android' ? createNoopService() : createNoopService();
