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

export const API_BASE = DEV_API_BASE;
