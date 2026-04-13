import { AppState, Dimensions, Platform, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import type { CaptureAdapter, CaptureEvent } from "@factoredui/core";

const SESSION_KEY = "factoredui:session_id";

/**
 * React Native CaptureAdapter for Expo.
 * Captures: JS errors, app state transitions, device metadata.
 * Touch/navigation events flow through Page/Component context.
 */
export function createExpoCaptureAdapter(): CaptureAdapter {
  let emitEvent: ((event: CaptureEvent) => void) | null = null;
  let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  let previousErrorHandler: ((error: Error, isFatal?: boolean) => void) | null = null;

  function startListening(onEvent: (event: CaptureEvent) => void): void {
    emitEvent = onEvent;
    previousErrorHandler = ErrorUtils.getGlobalHandler();
    attachErrorCapture(onEvent);
    appStateSubscription = attachAppStateCapture(onEvent);
  }

  function stopListening(): void {
    detachErrorCapture(previousErrorHandler);
    previousErrorHandler = null;
    appStateSubscription?.remove();
    appStateSubscription = null;
    emitEvent = null;
  }

  function collectSessionMetadata(): Record<string, unknown> {
    const window = Dimensions.get("window");
    const screen = Dimensions.get("screen");
    return {
      platform: Platform.OS,
      os_version: Platform.Version,
      app_version: Application.nativeApplicationVersion ?? "dev",
      build_number: Application.nativeBuildVersion ?? "0",
      screen_width: screen.width,
      screen_height: screen.height,
      window_width: window.width,
      window_height: window.height,
      scale: screen.scale,
    };
  }

  function storeSessionId(id: string): void {
    AsyncStorage.setItem(SESSION_KEY, id).catch(logStorageError);
  }

  function loadSessionId(): string | null {
    // Synchronous return — AsyncStorage is async, so we return null on first load.
    // The session manager calls ensureSession() which creates a new one if needed.
    return null;
  }

  function clearSessionId(): void {
    AsyncStorage.removeItem(SESSION_KEY).catch(logStorageError);
  }

  function registerUnloadHandler(onUnload: () => void): void {
    AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        onUnload();
      }
    });
  }

  return {
    startListening,
    stopListening,
    collectSessionMetadata,
    storeSessionId,
    loadSessionId,
    clearSessionId,
    registerUnloadHandler,
  };
}

// --- Leaf functions ---

function attachErrorCapture(
  onEvent: (event: CaptureEvent) => void,
): void {
  const originalHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    onEvent({
      event_type: "error",
      component_path: "",
      payload: {
        message: error.message,
        stack: error.stack?.slice(0, 500),
        is_fatal: isFatal ?? false,
      },
    });

    originalHandler?.(error, isFatal);
  });
}

function detachErrorCapture(
  previousHandler: ((error: Error, isFatal?: boolean) => void) | null,
): void {
  if (previousHandler) {
    ErrorUtils.setGlobalHandler(previousHandler);
  }
}

function attachAppStateCapture(
  onEvent: (event: CaptureEvent) => void,
): ReturnType<typeof AppState.addEventListener> {
  return AppState.addEventListener("change", (nextState: AppStateStatus) => {
    onEvent({
      event_type: "visibility",
      component_path: "",
      payload: { visibility_state: nextState },
    });
  });
}

function logStorageError(err: unknown): void {
  console.warn("factoredui: AsyncStorage error:", err);
}
