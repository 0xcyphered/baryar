export const TOKEN_KEY = 'baryar' + '_' + 'admin' + '_' + 'token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface ApiError {
  error: string;
  message?: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw { error: 'unauthorized' } satisfies ApiError;
  }
  const json = (await res.json()) as T & ApiError;
  if (!res.ok) {
    throw json as ApiError;
  }
  return json as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export type { ApiError };
