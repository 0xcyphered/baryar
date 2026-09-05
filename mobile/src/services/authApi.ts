import { apiFetch, setAuthToken } from './apiClient';
import type { UserProfile } from '../types';

interface RequestOtpResponse {
  ok: true;
}

interface VerifyOtpResponse {
  token: string;
  user: UserProfile;
}

interface MeResponse {
  user: UserProfile;
}

/**
 * Request an OTP code for the given phone number.
 * The phone is normalized on the backend.
 */
export async function requestOtp(phone: string): Promise<void> {
  await apiFetch<RequestOtpResponse>('/api/auth/request-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/**
 * Verify the OTP code. On success, stores the JWT
 * and returns the user profile.
 */
export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ token: string; user: UserProfile }> {
  const res = await apiFetch<VerifyOtpResponse>('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
  await setAuthToken(res.token);
  return { token: res.token, user: res.user };
}

/**
 * PATCH the current user profile (027). Returns the updated profile.
 */
export async function updateMe(body: {
  name?: string;
  email?: string;
  nationalId?: string;
}): Promise<UserProfile> {
  const res = await apiFetch<MeResponse>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.user;
}

/**
 * Fetch the current user profile using the stored JWT.
 * Returns null if the token is invalid/expired (401).
 */
export async function getMe(): Promise<UserProfile | null> {
  try {
    const res = await apiFetch<MeResponse>('/api/auth/me');
    return res.user;
  } catch (err) {
    if (err && typeof err === 'object' && 'error' in err) {
      return null;
    }
    throw err;
  }
}
