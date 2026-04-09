import { Platform } from 'react-native';

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

const CHANNEL_ID = 'houseops-wake-word';
const NOTIFICATION_ID = 'wake-word-listening';

function createAndroidService(): ForegroundServiceHandle {
  const notifee = require('@notifee/react-native').default as typeof import('@notifee/react-native')['default'];
  const { AndroidForegroundServiceType } =
    require('@notifee/react-native') as typeof import('@notifee/react-native');

  let isRunning = false;

  notifee.registerForegroundService(() => {
    // Keep-alive promise — resolves when stop() cancels the notification
    return new Promise<void>(() => {});
  });

  return {
    async start() {
      if (isRunning) return;

      await notifee.createChannel({
        id: CHANNEL_ID,
        name: 'Wake Word Listening',
        importance: 2, // LOW — persistent but not intrusive
      });

      await notifee.displayNotification({
        id: NOTIFICATION_ID,
        title: 'HouseOps is listening',
        body: 'Say "Jarvis" to activate',
        android: {
          channelId: CHANNEL_ID,
          asForegroundService: true,
          foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE],
          ongoing: true,
          pressAction: { id: 'default' },
        },
      });

      isRunning = true;
    },

    async stop() {
      if (!isRunning) return;
      await notifee.stopForegroundService();
      isRunning = false;
    },

    isAvailable: true,
  };
}

export const foregroundService: ForegroundServiceHandle =
  Platform.OS === 'android' ? createAndroidService() : createNoopService();
