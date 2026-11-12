import { getApiBase } from '@/config';

export interface AccountStatus {
  connected: boolean;
  source: 'extension' | 'manual' | null;
  channelName?: string;
  avatarUrl?: string;
  expiresAt: number | null;
  note?: string;
}

async function request<T>(path: string, method: string = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error || '')
      : `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

export function fetchAccountStatus(): Promise<AccountStatus> {
  return request<AccountStatus>('/accounts/status');
}

export function connectAccount(cookies: Record<string, string>, source: 'extension' | 'manual'): Promise<AccountStatus> {
  return request<AccountStatus>('/accounts/session', 'POST', { cookies, source });
}

export function disconnectAccount(): Promise<AccountStatus> {
  return request<AccountStatus>('/accounts/session', 'DELETE');
}
