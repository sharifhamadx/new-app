import { Browser } from '@capacitor/browser';
import { signInWithGoogleMobileTokens, syncSignedInUserProfile } from '../firebase';
import { User } from '../types';

const PENDING_MOBILE_AUTH_KEY = 'aegea_pending_mobile_auth_v1';

interface PendingMobileAuth {
  session: string;
  baseUrl: string;
  createdAt: number;
}

let activeClaimPromise: Promise<User | null> | null = null;
let activePollTimer: number | null = null;

function generateMobileSessionNonce(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function savePendingMobileAuth(session: string, baseUrl: string): void {
  try {
    const payload: PendingMobileAuth = {
      session,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      createdAt: Date.now(),
    };
    localStorage.setItem(PENDING_MOBILE_AUTH_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

export function loadPendingMobileAuth(): PendingMobileAuth | null {
  try {
    const raw = localStorage.getItem(PENDING_MOBILE_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingMobileAuth;
    if (!parsed?.session || !parsed?.baseUrl) return null;
    // Expire after 6 minutes
    if (Date.now() - Number(parsed.createdAt || 0) > 6 * 60 * 1000) {
      localStorage.removeItem(PENDING_MOBILE_AUTH_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingMobileAuth(): void {
  if (activePollTimer !== null) {
    window.clearInterval(activePollTimer);
    activePollTimer = null;
  }
  try {
    localStorage.removeItem(PENDING_MOBILE_AUTH_KEY);
  } catch {
    // ignore
  }
}

async function claimWithTokens(idToken?: string | null, accessToken?: string | null): Promise<User> {
  clearPendingMobileAuth();
  await Browser.close().catch(() => {});
  const fbUser = await signInWithGoogleMobileTokens(idToken, accessToken);
  return syncSignedInUserProfile(fbUser);
}

export async function pollAndClaimMobileAuth(
  session: string,
  baseUrl: string
): Promise<User | null> {
  if (activeClaimPromise) {
    return activeClaimPromise;
  }

  activeClaimPromise = (async () => {
    try {
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const resp = await fetch(
        `${cleanBase}/api/mobile-auth/poll?session=${encodeURIComponent(session)}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }
      );
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      if (data?.ready && (data?.idToken || data?.accessToken)) {
        return await claimWithTokens(data.idToken, data.accessToken);
      }
      return null;
    } catch {
      return null;
    } finally {
      activeClaimPromise = null;
    }
  })();

  return activeClaimPromise;
}

export async function handleMobileAuthCallbackUrl(
  url: string,
  fallbackBaseUrl?: string
): Promise<User | null> {
  if (!url || !url.toLowerCase().startsWith('com.aegea.smartguide://auth')) {
    return null;
  }
  if (activeClaimPromise) {
    return activeClaimPromise;
  }

  activeClaimPromise = (async () => {
    try {
      const queryPart = url.split('?')[1] || '';
      const params = new URLSearchParams(queryPart.split('#')[0]);
      const idToken = params.get('idToken');
      const accessToken = params.get('accessToken');
      const session = params.get('session');

      if (idToken || accessToken) {
        return await claimWithTokens(idToken, accessToken);
      }

      if (session) {
        const pending = loadPendingMobileAuth();
        const base = pending?.baseUrl || fallbackBaseUrl || '';
        if (base) {
          const cleanBase = base.replace(/\/+$/, '');
          const resp = await fetch(
            `${cleanBase}/api/mobile-auth/poll?session=${encodeURIComponent(session)}`,
            {
              method: 'GET',
              headers: { Accept: 'application/json' },
            }
          );
          if (resp.ok) {
            const data = await resp.json().catch(() => null);
            if (data?.ready && (data?.idToken || data?.accessToken)) {
              return await claimWithTokens(data.idToken, data.accessToken);
            }
          }
        }
      }
      return null;
    } finally {
      activeClaimPromise = null;
    }
  })();

  return activeClaimPromise;
}

export async function launchNativeMobileGoogleAuth(params: {
  baseUrl: string;
  lang: string;
  onAuthenticated: (user: User) => void;
  onError?: (err: unknown) => void;
}): Promise<void> {
  const cleanBase = params.baseUrl.replace(/\/+$/, '');
  const session = generateMobileSessionNonce();
  savePendingMobileAuth(session, cleanBase);

  if (activePollTimer !== null) {
    window.clearInterval(activePollTimer);
    activePollTimer = null;
  }

  const startedAt = Date.now();
  activePollTimer = window.setInterval(async () => {
    if (Date.now() - startedAt > 5 * 60 * 1000) {
      clearPendingMobileAuth();
      return;
    }
    const pending = loadPendingMobileAuth();
    if (!pending) {
      clearPendingMobileAuth();
      return;
    }
    try {
      const user = await pollAndClaimMobileAuth(pending.session, pending.baseUrl);
      if (user) {
        params.onAuthenticated(user);
      }
    } catch (err) {
      if (params.onError) params.onError(err);
    }
  }, 1500);

  await Browser.open({
    url: `${cleanBase}/mobile-auth?session=${encodeURIComponent(session)}&lang=${encodeURIComponent(
      params.lang
    )}`,
  });
}
