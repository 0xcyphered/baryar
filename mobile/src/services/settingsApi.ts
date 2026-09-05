import { apiFetch } from './apiClient';
import type { PublicPlatformSettings } from '../types';

/** GET /api/settings (027). Public — token attached if present, not required. */
export async function getPublicSettings(): Promise<PublicPlatformSettings> {
  const res = await apiFetch<{ settings: PublicPlatformSettings }>('/api/settings');
  return res.settings;
}
