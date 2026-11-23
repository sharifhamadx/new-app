import { Capacitor } from '@capacitor/core';

const DEFAULT_HOSTED_BACKEND =
  'https://ais-pre-z6rujnvxk65z7zmypdzh7l-288600478609.europe-west2.run.app';

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const envBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

  if (envBase) {
    return `${envBase}${cleanPath}`;
  }

  try {
    if (Capacitor.isNativePlatform()) {
      return `${DEFAULT_HOSTED_BACKEND}${cleanPath}`;
    }
  } catch {
    // Fallback gracefully on standard web
  }

  return cleanPath;
}
