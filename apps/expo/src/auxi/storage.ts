import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SpecStorage, SignatureVerifier, DataSourceCache } from "auxi/sdui";
import type { SignedSpec, AuxiSpec } from "auxi/sdui";

/**
 * AsyncStorage-backed spec storage.
 * Stores the active signed spec as JSON.
 */

const ACTIVE_SPEC_KEY = "auxi:active-spec";

export const specStorage: SpecStorage = {
  async loadActive(): Promise<SignedSpec | null> {
    const raw = await AsyncStorage.getItem(ACTIVE_SPEC_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SignedSpec;
  },

  async saveActive(signed: SignedSpec): Promise<void> {
    await AsyncStorage.setItem(ACTIVE_SPEC_KEY, JSON.stringify(signed));
  },
};

/**
 * Dev signature verifier — always passes.
 * Replace with Ed25519 verification for production.
 */
export const devSignatureVerifier: SignatureVerifier = {
  async verify(_specHash: string, _signature: string): Promise<boolean> {
    return true;
  },

  async computeHash(spec: AuxiSpec): Promise<string> {
    const json = JSON.stringify(spec);
    // Simple hash for dev — production uses Ed25519 over SHA-256
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `dev:${hash.toString(16)}`;
  },
};

/**
 * AsyncStorage-backed data source cache.
 * Caches resolved source data for offline rendering.
 */

const SOURCE_CACHE_PREFIX = "auxi:source:";

export const dataSourceCache: DataSourceCache = {
  async load(key: string): Promise<unknown | null> {
    const raw = await AsyncStorage.getItem(SOURCE_CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  },

  async save(key: string, data: unknown): Promise<void> {
    await AsyncStorage.setItem(SOURCE_CACHE_PREFIX + key, JSON.stringify(data));
  },
};
