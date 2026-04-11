import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock RN modules before importing adapter
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  Dimensions: {
    get: vi.fn((type: string) =>
      type === "window"
        ? { width: 375, height: 812 }
        : { width: 375, height: 812, scale: 3 },
    ),
  },
  Platform: { OS: "android", Version: 34 },
}));

vi.mock("expo-application", () => ({
  nativeApplicationVersion: "0.1.0",
  nativeBuildVersion: "1",
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: vi.fn(() => Promise.resolve()),
    getItem: vi.fn(() => Promise.resolve(null)),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}));

// ErrorUtils is a RN global — define it for the test environment
const mockOriginalHandler = vi.fn();
(globalThis as Record<string, unknown>).ErrorUtils = {
  getGlobalHandler: vi.fn(() => mockOriginalHandler),
  setGlobalHandler: vi.fn(),
};

import { createExpoCaptureAdapter } from "../capture-adapter";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

describe("createExpoCaptureAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object implementing CaptureAdapter", () => {
    const adapter = createExpoCaptureAdapter();
    expect(adapter.startListening).toBeTypeOf("function");
    expect(adapter.stopListening).toBeTypeOf("function");
    expect(adapter.collectSessionMetadata).toBeTypeOf("function");
    expect(adapter.storeSessionId).toBeTypeOf("function");
    expect(adapter.loadSessionId).toBeTypeOf("function");
    expect(adapter.clearSessionId).toBeTypeOf("function");
    expect(adapter.registerUnloadHandler).toBeTypeOf("function");
  });

  it("collectSessionMetadata returns device info", () => {
    const adapter = createExpoCaptureAdapter();
    const metadata = adapter.collectSessionMetadata();

    expect(metadata.platform).toBe("android");
    expect(metadata.os_version).toBe(34);
    expect(metadata.app_version).toBe("0.1.0");
    expect(metadata.build_number).toBe("1");
    expect(metadata.window_width).toBe(375);
    expect(metadata.screen_height).toBe(812);
    expect(metadata.scale).toBe(3);
  });

  it("startListening attaches error handler and app state listener", () => {
    const adapter = createExpoCaptureAdapter();
    const onEvent = vi.fn();

    adapter.startListening(onEvent);

    expect(ErrorUtils.setGlobalHandler).toHaveBeenCalled();
    expect(AppState.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("stopListening removes app state subscription", () => {
    const mockRemove = vi.fn();
    vi.mocked(AppState.addEventListener).mockReturnValue({ remove: mockRemove });

    const adapter = createExpoCaptureAdapter();
    adapter.startListening(vi.fn());
    adapter.stopListening();

    expect(mockRemove).toHaveBeenCalled();
  });

  it("storeSessionId writes to AsyncStorage", () => {
    const adapter = createExpoCaptureAdapter();
    adapter.storeSessionId("sess-123");

    expect(AsyncStorage.setItem).toHaveBeenCalledWith("auxi:session_id", "sess-123");
  });

  it("loadSessionId returns null (async storage is non-blocking)", () => {
    const adapter = createExpoCaptureAdapter();
    expect(adapter.loadSessionId()).toBeNull();
  });

  it("clearSessionId removes from AsyncStorage", () => {
    const adapter = createExpoCaptureAdapter();
    adapter.clearSessionId();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("auxi:session_id");
  });

  it("registerUnloadHandler listens for app state background", () => {
    const adapter = createExpoCaptureAdapter();
    const onUnload = vi.fn();

    adapter.registerUnloadHandler(onUnload);

    expect(AppState.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
