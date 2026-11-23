import { SubscriptionPlan, User } from '../types';
import { apiUrl } from './apiBase';

// Strict in-memory token store (never saved to localStorage or sessionStorage)
let inMemoryBearerToken: string | null = null;

export function setInMemorySessionToken(token?: string | null) {
  inMemoryBearerToken = token ? String(token).trim() : null;
}

export function clearInMemorySessionToken() {
  inMemoryBearerToken = null;
}

export interface SessionStateResponse {
  user: User;
  sessionToken?: string;
  adminSetupRequired: boolean;
}

export interface MaskedActivationCode {
  id: string;
  codePrefix: string;
  label: string;
  plan: SubscriptionPlan;
  durationDays: number;
  maxUses: number;
  usesCount: number;
  revoked: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface AdminInquiriesResponse {
  partners: {
    id: string;
    businessName: string;
    businessType: string;
    city: string;
    contactEmail: string;
    websiteUrl?: string;
    notes?: string;
    createdAt: string;
  }[];
  messages: {
    id: string;
    name: string;
    email: string;
    message: string;
    createdAt: string;
  }[];
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/json');
  headers.set('X-Requested-With', 'AEGEA-App');
  if (inMemoryBearerToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryBearerToken}`);
  }

  return fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  });
}

async function parseJsonSafe(res: Response) {
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : {};
  } catch {
    return {};
  }
}

export async function fetchSessionState(): Promise<SessionStateResponse> {
  const res = await apiFetch('/api/auth/session', { method: 'GET' });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.user) {
    throw new Error(data?.error || 'Could not initialize session.');
  }
  if (data.sessionToken) {
    setInMemorySessionToken(data.sessionToken);
  }
  return {
    user: data.user,
    sessionToken: data.sessionToken,
    adminSetupRequired: Boolean(data.adminSetupRequired),
  };
}

export async function redeemActivationCode(
  code: string,
  termsAccepted: boolean
): Promise<SessionStateResponse> {
  const res = await apiFetch('/api/auth/redeem-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), termsAccepted }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.user) {
    throw new Error(data?.error || 'Invalid or expired activation code.');
  }
  if (data.sessionToken) {
    setInMemorySessionToken(data.sessionToken);
  }
  return {
    user: data.user,
    sessionToken: data.sessionToken,
    adminSetupRequired: Boolean(data.adminSetupRequired),
  };
}

export async function acceptTermsSession(): Promise<SessionStateResponse> {
  const res = await apiFetch('/api/auth/accept-terms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ termsAccepted: true }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.user) {
    throw new Error(data?.error || 'Could not record agreement.');
  }
  if (data.sessionToken) {
    setInMemorySessionToken(data.sessionToken);
  }
  return {
    user: data.user,
    sessionToken: data.sessionToken,
    adminSetupRequired: Boolean(data.adminSetupRequired),
  };
}

export async function signOutSession(): Promise<SessionStateResponse> {
  const res = await apiFetch('/api/auth/signout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await parseJsonSafe(res);
  if (data?.sessionToken) {
    setInMemorySessionToken(data.sessionToken);
  } else {
    clearInMemorySessionToken();
  }
  if (!res.ok || !data?.user) {
    throw new Error(data?.error || 'Could not sign out.');
  }
  return {
    user: data.user,
    sessionToken: data.sessionToken,
    adminSetupRequired: Boolean(data.adminSetupRequired),
  };
}

export async function adminSetupPasscode(passcode: string): Promise<SessionStateResponse> {
  const res = await apiFetch('/api/admin/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.user) {
    throw new Error(data?.error || 'Could not configure Admin passcode.');
  }
  if (data.sessionToken) {
    setInMemorySessionToken(data.sessionToken);
  }
  return {
    user: data.user,
    sessionToken: data.sessionToken,
    adminSetupRequired: false,
  };
}

export async function adminLoginPasscode(passcode: string): Promise<SessionStateResponse> {
  const res = await apiFetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.user) {
    throw new Error(data?.error || 'Invalid Admin passcode.');
  }
  if (data.sessionToken) {
    setInMemorySessionToken(data.sessionToken);
  }
  return {
    user: data.user,
    sessionToken: data.sessionToken,
    adminSetupRequired: false,
  };
}

export async function adminFetchCodes(): Promise<MaskedActivationCode[]> {
  const res = await apiFetch('/api/admin/codes', { method: 'GET' });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.error || 'Could not load activation codes.');
  }
  return Array.isArray(data?.codes) ? data.codes : [];
}

export async function adminCreateCode(params: {
  label: string;
  plan: SubscriptionPlan;
  durationDays: number;
  maxUses: number;
  customCode?: string;
}): Promise<{ rawCode: string; item: MaskedActivationCode }> {
  const res = await apiFetch('/api/admin/codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.rawCode || !data?.item) {
    throw new Error(data?.error || 'Could not create activation code.');
  }
  return { rawCode: data.rawCode, item: data.item };
}

export async function adminRevokeCode(id: string): Promise<void> {
  const res = await apiFetch(`/api/admin/codes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.error || 'Could not revoke activation code.');
  }
}

export async function adminFetchInquiries(): Promise<AdminInquiriesResponse> {
  const res = await apiFetch('/api/admin/inquiries', { method: 'GET' });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.error || 'Could not load inbox.');
  }
  return {
    partners: Array.isArray(data?.partners) ? data.partners : [],
    messages: Array.isArray(data?.messages) ? data.messages : [],
  };
}

export async function adminDeleteInquiry(type: 'partners' | 'messages', id: string): Promise<void> {
  const res = await apiFetch(
    `/api/admin/inquiries/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.error || 'Could not delete item.');
  }
}
