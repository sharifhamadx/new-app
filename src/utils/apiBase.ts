import { Capacitor } from '@capacitor/core';

const CUSTOM_API_BASE_KEY = 'aegea_custom_api_base_v1';

export function isNativeAppPlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function normalizeBaseUrl(raw?: string | null): string {
  const cleaned = String(raw || '').trim().replace(/\/+$/, '');
  if (!cleaned) return '';
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(cleaned)) return '';
  return cleaned;
}

export function getCustomApiBaseUrl(): string {
  try {
    return normalizeBaseUrl(localStorage.getItem(CUSTOM_API_BASE_KEY));
  } catch {
    return '';
  }
}

export function setCustomApiBaseUrl(rawUrl: string): string {
  const clean = normalizeBaseUrl(rawUrl);
  if (!clean) {
    throw new Error('Please enter a valid server URL starting with https:// (for example https://your-app.onrender.com).');
  }
  try {
    localStorage.setItem(CUSTOM_API_BASE_KEY, clean);
  } catch {
    // ignore storage errors
  }
  return clean;
}

export function clearCustomApiBaseUrl(): void {
  try {
    localStorage.removeItem(CUSTOM_API_BASE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getEnvApiBaseUrl(): string {
  return normalizeBaseUrl(String(import.meta.env.VITE_API_BASE_URL || ''));
}

export function getActiveApiBaseUrl(): string {
  const custom = getCustomApiBaseUrl();
  if (custom && isNativeAppPlatform()) return custom;
  const envBase = getEnvApiBaseUrl();
  if (envBase) return envBase;
  if (custom) return custom;
  return '';
}

export function hasNativeApiBaseConfigured(): boolean {
  if (!isNativeAppPlatform()) return true;
  return Boolean(getActiveApiBaseUrl());
}

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getActiveApiBaseUrl();
  if (base) {
    return `${base}${cleanPath}`;
  }
  return cleanPath;
}
