/**
 * Runtime configuration.
 * Default API_BASE points to the Android emulator's localhost alias.
 * iOS simulator uses http://localhost:4000.
 * Production builds override via environment variables (future plan).
 */

import { Platform } from 'react-native';

const DEV_API_BASE =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:4000'
    : 'http://localhost:4000';

// Set at bundle time, e.g.:
//   EXPO_PUBLIC_API_BASE=http://192.168.1.20:4000 yarn build:apk
// (the machine running the backend must be reachable from the phone).
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? DEV_API_BASE;
