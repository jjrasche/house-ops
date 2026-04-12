import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createSpecStorage,
  createDataSourceCache,
  devSignatureVerifier,
  type KVStorage,
} from "auxi";

/**
 * AsyncStorage adapter for auxi's generic KVStorage interface.
 */
const asyncKV: KVStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

export const specStorage = createSpecStorage(asyncKV);
export const dataSourceCache = createDataSourceCache(asyncKV);

export { devSignatureVerifier };
