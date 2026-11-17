import { useState, useEffect } from 'react';
import { translations } from '../translations';
import { Language } from '../types';
import { apiUrl } from '../utils/apiBase';

export interface LanguageOption {
  code: string;
  nativeName: string;
  englishName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic' },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'zh', nativeName: '中文', englishName: 'Chinese' },
];

export function isRtlLanguage(lang: Language): boolean {
  const norm = String(lang || '').trim().toLowerCase();
  return (
    norm === 'ar' ||
    norm === 'arabic' ||
    norm === 'العربية' ||
    norm === 'he' ||
    norm === 'hebrew' ||
    norm === 'fa' ||
    norm === 'persian' ||
    norm === 'ur' ||
    norm === 'urdu'
  );
}

export function getLanguageEnglishName(lang: Language): string {
  const trimmed = String(lang || 'en').trim();
  const found = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === trimmed.toLowerCase() || l.nativeName.toLowerCase() === trimmed.toLowerCase()
  );
  return found ? found.englishName : trimmed;
}

export function getLanguageShortLabel(lang: Language): string {
  const trimmed = String(lang || 'en').trim();
  const found = SUPPORTED_LANGUAGES.find((l) => l.code.toLowerCase() === trimmed.toLowerCase());
  if (found) return found.code.toUpperCase();
  return trimmed.slice(0, 6).toUpperCase();
}

const UI_CACHE_PREFIX = 'greek_guide_ui_v5_';
const DATA_CACHE_PREFIX = 'greek_guide_data_v3_';

const memoryUiCache: Record<string, any> = {};
const uiInFlight: Record<string, Promise<any>> = {};
const uiListeners = new Set<() => void>();

function notifyUiListeners() {
  uiListeners.forEach((fn) => fn());
}

function getCachedUiDict(lang: string): any | null {
  if (translations[lang]) return translations[lang];
  const key = lang.trim().toLowerCase();
  if (memoryUiCache[key]) return memoryUiCache[key];
  try {
    const stored = localStorage.getItem(`${UI_CACHE_PREFIX}${key}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      memoryUiCache[key] = parsed;
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export async function translatePayloadDetailed<T>(
  payload: T,
  targetLang: Language,
  mode: 'result' | 'itinerary' | 'curated' | 'ui',
  cacheKey?: string,
  signal?: AbortSignal
): Promise<{ translated: T; quotaLimited: boolean }> {
  const normLang = String(targetLang || 'en').trim().toLowerCase();

  if (cacheKey) {
    try {
      const cached = localStorage.getItem(`${DATA_CACHE_PREFIX}${cacheKey}_${normLang}`);
      if (cached) {
        return { translated: JSON.parse(cached) as T, quotaLimited: false };
      }
    } catch {
      // ignore storage errors
    }
  }

  const doFetch = async () => {
    const res = await fetch(apiUrl('/api/translate'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        targetLanguage: getLanguageEnglishName(targetLang),
        mode,
        payload,
      }),
      signal,
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { res, text, parsed };
  };

  let { res, text, parsed } = await doFetch();
  if ((!parsed && text.trim().toLowerCase().startsWith('<!doctype')) || (res.status >= 502 && res.status <= 504)) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    ({ res, text, parsed } = await doFetch());
  }

  if (!res.ok || !parsed?.translated) {
    throw new Error(parsed?.error || 'Translation temporarily unavailable.');
  }

  const quotaLimited = Boolean(parsed.quotaLimited);

  if (cacheKey && !quotaLimited) {
    try {
      localStorage.setItem(
        `${DATA_CACHE_PREFIX}${cacheKey}_${normLang}`,
        JSON.stringify(parsed.translated)
      );
    } catch {
      // ignore quota errors
    }
  }

  return { translated: parsed.translated as T, quotaLimited };
}

export async function translatePayloadViaServer<T>(
  payload: T,
  targetLang: Language,
  mode: 'result' | 'itinerary' | 'curated' | 'ui',
  cacheKey?: string,
  signal?: AbortSignal
): Promise<T> {
  const { translated } = await translatePayloadDetailed(payload, targetLang, mode, cacheKey, signal);
  return translated;
}

export function useUiTranslation(currentLang: Language) {
  const [, setTick] = useState(0);
  const key = String(currentLang || 'en').trim().toLowerCase();
  const cached = getCachedUiDict(currentLang);
  const [isTranslatingUi, setIsTranslatingUi] = useState<boolean>(() => !cached);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    uiListeners.add(listener);
    return () => {
      uiListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const existing = getCachedUiDict(currentLang);
    if (existing) {
      setIsTranslatingUi(false);
      return;
    }

    let cancelled = false;
    setIsTranslatingUi(true);

    if (!uiInFlight[key]) {
      uiInFlight[key] = translatePayloadDetailed(translations.en, currentLang, 'ui')
        .then(({ translated: translatedUi, quotaLimited }) => {
          const merged = { ...translations.en, ...translatedUi };
          if (!quotaLimited) {
            memoryUiCache[key] = merged;
            try {
              localStorage.setItem(`${UI_CACHE_PREFIX}${key}`, JSON.stringify(merged));
            } catch {
              // ignore storage errors
            }
          }
          notifyUiListeners();
          return merged;
        })
        .finally(() => {
          delete uiInFlight[key];
        });
    }

    uiInFlight[key]
      .then(() => {
        if (!cancelled) setIsTranslatingUi(false);
      })
      .catch(() => {
        if (!cancelled) setIsTranslatingUi(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentLang, key]);

  return {
    t: cached || translations.en,
    isTranslatingUi,
  };
}
