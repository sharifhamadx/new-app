import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Allow native Capacitor APK (https://localhost / capacitor://localhost) and Cloud Run origins to call /api/*
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (
    origin &&
    (origin === 'https://localhost' ||
      origin === 'http://localhost' ||
      origin === 'capacitor://localhost' ||
      origin.startsWith('http://localhost:') ||
      /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i.test(origin))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json({ limit: '15mb' }));

// Load Firebase config to verify Firebase ID tokens against Google Identity Toolkit
let firebaseApiKey = '';
let firebaseClientConfig: Record<string, any> | null = null;
try {
  const fbConfigRaw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
  const fbConfig = JSON.parse(fbConfigRaw);
  firebaseApiKey = fbConfig.apiKey || '';
  firebaseClientConfig = {
    apiKey: fbConfig.apiKey || '',
    authDomain: fbConfig.authDomain || '',
    projectId: fbConfig.projectId || '',
    appId: fbConfig.appId || '',
    storageBucket: fbConfig.storageBucket || '',
    messagingSenderId: fbConfig.messagingSenderId || '',
  };
} catch (err) {
  console.warn('Could not read firebase-applet-config.json on server:', err);
}

// Generic hospitality/geography stopwords ignored when verifying Wikipedia/Commons photo matches
const GENERIC_PLACE_TOKENS = new Set([
  'hotel', 'hotels', 'palace', 'resort', 'suites', 'suite', 'villa', 'villas', 'boutique', 'spa',
  'taverna', 'tavern', 'restaurant', 'bistro', 'cafe', 'bar', 'grill', 'kitchen', 'house', 'club',
  'ancient', 'archaeological', 'site', 'ruins', 'temple', 'museum', 'church', 'monastery', 'castle',
  'fortress', 'square', 'beach', 'bay', 'cove', 'island', 'village', 'old', 'town', 'city', 'center',
  'greece', 'greek', 'athens', 'thessaloniki', 'santorini', 'mykonos', 'crete', 'chania', 'heraklion',
  'rhodes', 'corfu', 'nafplio', 'delphi', 'meteora', 'naxos', 'paros', 'zakynthos', 'kefalonia', 'olympia',
  'the', 'and', 'of', 'in', 'by', 'to', 'st', 'agios', 'agia', 'nea', 'new', 'grand', 'view', 'sea',
]);

function sanitizeHttpUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(trimmed)) return '';
  return trimmed;
}

function isCleanPhotoUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith('data:')) return false;
  if (/\.(svg|ico|gif|pdf)(\?|$)/i.test(lower)) return false;
  if (/(favicon|sprite|logo|default-avatar|placeholder|blank\.|spacer\.|map_of_|location_map|flag_of_|coat_of_arms)/i.test(lower)) {
    return false;
  }
  if (/(shutterstock|istockphoto|alamy|depositphotos|dreamstime|123rf|gettyimages|vecteezy)\./i.test(lower)) {
    return false;
  }
  return /^https:\/\//i.test(url);
}

async function fetchOgImageFromWebsite(websiteUrl: string): Promise<string> {
  const cleanSite = sanitizeHttpUrl(websiteUrl);
  if (!cleanSite) return '';
  try {
    const res = await fetch(cleanSite, {
      signal: AbortSignal.timeout(2400),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return '';
    const html = (await res.text()).slice(0, 95000);
    const metaMatch =
      html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["']/i) ||
      html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i) ||
      html.match(/"image"\s*:\s*"((?:https?:)?\/\/[^"']+\.(?:jpe?g|png|webp)[^"']*)"/i);
    if (!metaMatch?.[1]) return '';
    const resolved = new URL(metaMatch[1].trim(), res.url || cleanSite).toString();
    if (!isCleanPhotoUrl(resolved)) return '';
    return resolved;
  } catch {
    return '';
  }
}

async function searchWikipediaPhoto(queryText: string, distinctiveTokens: string[], wikiLang: 'en' | 'el'): Promise<string> {
  if (!queryText || distinctiveTokens.length === 0) return '';
  try {
    const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      queryText
    )}&gsrlimit=5&prop=pageimages&pithumbsize=900&format=json&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return '';
    const data: any = await res.json();
    const pages: any[] = Object.values(data?.query?.pages || {}).sort((a: any, b: any) => (a.index ?? 99) - (b.index ?? 99));
    for (const page of pages) {
      const pageTitle = String(page?.title || '').toLowerCase();
      const matched = distinctiveTokens.some((tok) => pageTitle.includes(tok));
      const src = page?.thumbnail?.source;
      if (matched && src && isCleanPhotoUrl(src)) {
        return src;
      }
    }
    return '';
  } catch {
    return '';
  }
}

async function searchWikimediaCommonsPhoto(
  queryText: string,
  distinctiveTokens: string[],
  requireTokenMatch = true,
  usedUrls?: Set<string>
): Promise<string> {
  if (!queryText || (requireTokenMatch && distinctiveTokens.length === 0)) return '';
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      queryText
    )}&gsrlimit=10&prop=imageinfo&iiprop=url|mime|dimensions&iiurlwidth=900&format=json&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2600),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return '';
    const data: any = await res.json();
    const pages: any[] = Object.values(data?.query?.pages || {}).sort((a: any, b: any) => (a.index ?? 99) - (b.index ?? 99));
    for (const page of pages) {
      const titleLower = String(page?.title || '').toLowerCase();
      if (/(map|diagram|logo|coat of arms|flag|location|plan|svg|chart|icon|emblem|seal|portrait)/i.test(titleLower)) continue;
      const info = page?.imageinfo?.[0];
      const mime = String(info?.mime || '').toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(mime)) continue;
      if (typeof info?.width === 'number' && info.width < 450) continue;
      const matched = !requireTokenMatch || distinctiveTokens.some((tok) => titleLower.includes(tok));
      const src = info?.thumburl || info?.url || '';
      if (matched && src && isCleanPhotoUrl(src) && !usedUrls?.has(src)) {
        usedUrls?.add(src);
        return src;
      }
    }
    return '';
  } catch {
    return '';
  }
}

async function searchOpenversePhoto(
  queryText: string,
  distinctiveTokens: string[],
  requireTokenMatch = true,
  usedUrls?: Set<string>
): Promise<string> {
  if (!queryText || (requireTokenMatch && distinctiveTokens.length === 0)) return '';
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(queryText)}&page_size=12`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return '';
    const data: any = await res.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    for (const item of results) {
      const hay = `${item?.title || ''} ${(item?.tags || []).map((t: any) => t?.name || '').join(' ')}`.toLowerCase();
      if (/(map|diagram|logo|screenshot|cartoon|vector|clipart)/i.test(hay)) continue;
      const matched = !requireTokenMatch || distinctiveTokens.some((tok) => hay.includes(tok));
      const src = item?.url || item?.thumbnail || '';
      if (matched && src && isCleanPhotoUrl(src) && !usedUrls?.has(src)) {
        usedUrls?.add(src);
        return src;
      }
    }
    return '';
  } catch {
    return '';
  }
}

async function resolveVerifiedPlaceImage(params: {
  englishName?: string;
  name?: string;
  greekName?: string;
  region?: string;
  officialWebsite?: string;
  bookingUrl?: string;
  groundingSources?: { title: string; uri: string }[];
  extraContext?: string;
  isDish?: boolean;
  usedUrls?: Set<string>;
  fallbackTopic?: string;
}): Promise<string> {
  const {
    englishName = '',
    name = '',
    greekName = '',
    region = '',
    officialWebsite = '',
    bookingUrl = '',
    groundingSources = [],
    extraContext = '',
    isDish = false,
    usedUrls,
    fallbackTopic = '',
  } = params;

  const rawNames = `${englishName} ${name}`.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const minLen = isDish ? 3 : 4;
  const tokens = Array.from(
    new Set(
      rawNames
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= minLen && (isDish || !GENERIC_PLACE_TOKENS.has(t)))
    )
  );

  const greekTokens = Array.from(
    new Set(
      String(greekName || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= minLen)
    )
  );

  const matchedSrc =
    tokens.length > 0 && groundingSources.length > 0
      ? groundingSources.find((src) => {
          const text = `${src?.title || ''} ${src?.uri || ''}`.toLowerCase();
          return tokens.some((tok) => text.includes(tok));
        })
      : undefined;

  const primaryName = englishName || name;
  const allTokens = [...tokens, ...greekTokens];
  const enQuery = isDish ? `${primaryName} Greek food`.trim() : `${primaryName} ${region} ${extraContext} Greece`.trim();
  const commonsQuery = isDish ? `${primaryName} Greek food`.trim() : `${primaryName} Greece`.trim();

  // Tier 1: Run ALL exact place/dish lookups concurrently (zero sequential bottleneck!)
  const [siteOg, bookOg, groundedOg, enWikiPrimary, enWikiFull, elWiki, commonsExact, openverseExact] = await Promise.all([
    officialWebsite ? fetchOgImageFromWebsite(officialWebsite) : Promise.resolve(''),
    bookingUrl && !/google\.com\/search/i.test(bookingUrl) ? fetchOgImageFromWebsite(bookingUrl) : Promise.resolve(''),
    matchedSrc?.uri && matchedSrc.uri !== officialWebsite && matchedSrc.uri !== bookingUrl
      ? fetchOgImageFromWebsite(matchedSrc.uri)
      : Promise.resolve(''),
    searchWikipediaPhoto(primaryName, tokens, 'en'),
    searchWikipediaPhoto(enQuery, tokens, 'en'),
    greekName && greekTokens.length > 0 ? searchWikipediaPhoto(greekName, greekTokens, 'el') : Promise.resolve(''),
    searchWikimediaCommonsPhoto(commonsQuery, allTokens, true, usedUrls),
    searchOpenversePhoto(`${primaryName} ${region} Greece`.trim(), allTokens, true, usedUrls),
  ]);

  const exactCandidates = [siteOg, bookOg, groundedOg, enWikiPrimary, enWikiFull, elWiki, commonsExact, openverseExact];
  for (const cand of exactCandidates) {
    if (cand && !usedUrls?.has(cand)) {
      usedUrls?.add(cand);
      return cand;
    }
  }

  // Tier 2: Live contextual real web photography for this exact Greek destination & category (never static stock!)
  const cleanRegion = region && !/[\u0600-\u06FF\u0370-\u03FF]/.test(region) ? region : '';
  const contextualQuery = fallbackTopic
    ? `${cleanRegion} ${fallbackTopic} Greece`.replace(/\s+/g, ' ').trim()
    : isDish
    ? `${primaryName} Greek traditional dish food`.replace(/\s+/g, ' ').trim()
    : `${cleanRegion} ${extraContext || 'Aegean architecture'} Greece`.replace(/\s+/g, ' ').trim();

  const [ctxOpenverse, ctxCommons] = await Promise.all([
    searchOpenversePhoto(contextualQuery, [], false, usedUrls),
    searchWikimediaCommonsPhoto(contextualQuery, [], false, usedUrls),
  ]);

  if (ctxOpenverse) return ctxOpenverse;
  if (ctxCommons) return ctxCommons;

  // Broad Greece real photo safety net if regional query yielded nothing
  const broadQuery = isDish ? 'Greek Mediterranean food meze' : `${extraContext || 'Greece'} Aegean sea`;
  const [broadOv, broadCm] = await Promise.all([
    searchOpenversePhoto(broadQuery, [], false, usedUrls),
    searchWikimediaCommonsPhoto(broadQuery, [], false, usedUrls),
  ]);
  return broadOv || broadCm || '';
}

async function resolveVerifiedPlaceImageWithBudget(
  params: Parameters<typeof resolveVerifiedPlaceImage>[0],
  timeoutMs = 6800
): Promise<string> {
  return Promise.race([
    resolveVerifiedPlaceImage(params),
    new Promise<string>((resolve) => setTimeout(() => resolve(''), timeoutMs)),
  ]);
}

// Verify Firebase Google ID Token via Google Identity Toolkit
async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string; emailVerified: boolean; displayName?: string } | null> {
  if (!firebaseApiKey || !idToken) return null;
  try {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const user = data?.users?.[0];
    if (!user || !user.localId || !user.email) return null;
    return {
      uid: user.localId,
      email: String(user.email).toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName,
    };
  } catch (err) {
    console.error('Token lookup failed:', err);
    return null;
  }
}

// Safe JSON extractor helper that cleans markdown fences and surrounding text
function extractAndParseJSON(rawText: string) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const isArrayFirst =
    firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);

  if (isArrayFirst) {
    const lastBracket = cleaned.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }
  } else if (firstBrace !== -1) {
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  return JSON.parse(cleaned);
}

// ============================================================================
// Quota Protection, Multi-Model Fallback Cascade & Server-Side TTL Caches
// ============================================================================
const GEMINI_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
const GEMINI_BUSY_COOLDOWN_MS = 90 * 1000;
const modelCooldownUntil: Record<string, number> = {};
const modelBusyUntil: Record<string, number> = {};

function isQuotaError(err: any): boolean {
  if (!err) return false;
  if (err?.status === 429) return true;
  const msg = String(err?.message || err || '');
  return /\b429\b|RESOURCE_EXHAUSTED|quota exceeded|GenerateRequestsPerDay/i.test(msg);
}

function isModelAvailable(model: string): boolean {
  const now = Date.now();
  return now >= (modelCooldownUntil[model] || 0) && now >= (modelBusyUntil[model] || 0);
}

function markModelQuotaExhausted(model: string) {
  modelCooldownUntil[model] = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
}

function markModelTemporarilyBusy(model: string, durationMs = GEMINI_BUSY_COOLDOWN_MS) {
  modelBusyUntil[model] = Date.now() + durationMs;
}

function isTransientRetryableError(err: any): boolean {
  if (!err) return false;
  const status = err?.status;
  if (status === 503 || status === 502 || status === 504) return true;
  const msg = String(err?.message || err || '');
  return /\b503\b|UNAVAILABLE|high demand|overloaded|temporarily unavailable|timed out|timeout|ETIMEDOUT|ABORT_ERR/i.test(msg);
}

function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${timeoutMs}ms`), { status: 504 })), timeoutMs)
    ),
  ]);
}

async function callGeminiWithFallback(
  ai: GoogleGenAI,
  opts: {
    models: string[];
    contents: string;
    responseSchema?: any;
    maxPasses?: number;
    totalBudgetMs?: number;
    perAttemptTimeoutMs?: number;
  }
): Promise<{ text: string; modelUsed: string }> {
  const activeModels = opts.models.filter((m) => isModelAvailable(m));
  if (activeModels.length === 0) {
    throw Object.assign(new Error('All free-tier AI models are currently cooling down.'), { status: 503 });
  }

  let lastErr: any = null;
  const maxPasses = opts.maxPasses ?? 2;
  const totalBudgetMs = opts.totalBudgetMs ?? 22000;
  const maxPerAttemptMs = opts.perAttemptTimeoutMs ?? 20000;
  const startMs = Date.now();

  for (let pass = 0; pass < maxPasses; pass++) {
    let sawTransient = false;
    for (const model of activeModels) {
      const remainingMs = totalBudgetMs - (Date.now() - startMs);
      if (remainingMs < 1500) break;
      if (!isModelAvailable(model)) continue;

      try {
        const config: any = {
          responseMimeType: 'application/json',
        };
        if (opts.responseSchema) {
          config.responseSchema = opts.responseSchema;
        }
        if (model === 'gemini-4-hydrogen') {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }

        const perAttemptTimeout = Math.min(maxPerAttemptMs, Math.max(5000, remainingMs));
        const response = await withPromiseTimeout(
          ai.models.generateContent({
            model,
            contents: opts.contents,
            config,
          }),
          perAttemptTimeout,
          model
        );

        const text = response.text || '';
        if (!text.trim()) {
          throw new Error(`Empty response from ${model}`);
        }
        return { text, modelUsed: model };
      } catch (err: any) {
        lastErr = err;
        if (isQuotaError(err)) {
          markModelQuotaExhausted(model);
          console.log(`[GEMINI QUOTA] ${model} quota reached; switching to fallback.`);
          continue;
        }
        if (isTransientRetryableError(err)) {
          sawTransient = true;
          markModelTemporarilyBusy(model);
          console.log(`[GEMINI FALLBACK] ${model} paused (${err?.status || 'busy'}); continuing cascade.`);
          continue;
        }
        console.log(`[GEMINI FALLBACK] ${model} skipped:`, err?.message || err);
      }
    }

    if (!sawTransient || pass === maxPasses - 1 || Date.now() - startMs >= totalBudgetMs - 2000) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  throw lastErr || new Error('Gemini generation failed across available models.');
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const serverRecommendCache = new Map<string, CacheEntry<any>>();
const serverTranslateCache = new Map<string, CacheEntry<any>>();
const serverCityLiveCache = new Map<string, CacheEntry<any>>();

function makeCacheKey(obj: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function getFromTtlCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setInTtlCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number, maxEntries: number) {
  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function formatGeminiErrorMessage(err: any, fallback: string): string {
  const raw = String(err?.message || err || '').trim();
  if (!raw) return fallback;
  try {
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      const innerMsg = parsed?.error?.message;
      if (typeof innerMsg === 'string' && innerMsg.trim()) {
        return innerMsg.trim();
      }
    }
  } catch {
    // not JSON
  }
  return raw.length > 260 ? fallback : raw;
}

const GREEK_CITY_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  // Attica
  Athens: { lat: 37.9838, lon: 23.7275, label: 'Athens & Attica' },
  // Central Macedonia
  Thessaloniki: { lat: 40.6401, lon: 22.9444, label: 'Thessaloniki & Central Macedonia' },
  'Chalkidiki': { lat: 40.2833, lon: 23.4333, label: 'Chalkidiki' },
  // South Aegean — Cyclades
  Santorini: { lat: 36.3932, lon: 25.4615, label: 'Santorini' },
  Mykonos: { lat: 37.4467, lon: 25.3289, label: 'Mykonos' },
  Naxos: { lat: 37.1036, lon: 25.3767, label: 'Naxos' },
  Paros: { lat: 37.0853, lon: 25.1520, label: 'Paros' },
  Milos: { lat: 36.7453, lon: 24.4272, label: 'Milos' },
  Syros: { lat: 37.4446, lon: 24.9428, label: 'Syros' },
  // South Aegean — Dodecanese
  Rhodes: { lat: 36.4341, lon: 28.2176, label: 'Rhodes' },
  Kos: { lat: 36.8933, lon: 27.2889, label: 'Kos' },
  // Crete
  'Chania, Crete': { lat: 35.5138, lon: 24.0180, label: 'Chania, Crete' },
  'Heraklion, Crete': { lat: 35.3387, lon: 25.1442, label: 'Heraklion, Crete' },
  'Rethymno, Crete': { lat: 35.3667, lon: 24.4820, label: 'Rethymno, Crete' },
  'Agios Nikolaos, Crete': { lat: 35.1900, lon: 25.7167, label: 'Agios Nikolaos & Elounda, Crete' },
  // Ionian Islands
  Corfu: { lat: 39.6243, lon: 19.9217, label: 'Corfu' },
  Zakynthos: { lat: 37.7870, lon: 20.8979, label: 'Zakynthos' },
  Kefalonia: { lat: 38.1754, lon: 20.5692, label: 'Kefalonia' },
  Lefkada: { lat: 38.8333, lon: 20.7069, label: 'Lefkada' },
  // Peloponnese
  Nafplio: { lat: 37.5673, lon: 22.8016, label: 'Nafplio' },
  'Kalamata & Mani': { lat: 37.0389, lon: 22.1142, label: 'Kalamata & Mani' },
  Monemvasia: { lat: 36.6877, lon: 23.0563, label: 'Monemvasia & Laconia' },
  'Olympia, Peloponnese': { lat: 37.6379, lon: 21.6300, label: 'Ancient Olympia' },
  // Central Greece
  Delphi: { lat: 38.4824, lon: 22.5010, label: 'Delphi & Central Greece' },
  'Evia & Chalkida': { lat: 38.4631, lon: 23.5950, label: 'Evia & Chalkida' },
  // Thessaly
  Meteora: { lat: 39.7217, lon: 21.6306, label: 'Meteora & Thessaly' },
  'Volos & Pelion': { lat: 39.3666, lon: 22.9425, label: 'Volos & Pelion' },
  'Skiathos & Sporades': { lat: 39.1623, lon: 23.4906, label: 'Skiathos & Sporades' },
  // Epirus
  'Ioannina & Zagori': { lat: 39.6650, lon: 20.8537, label: 'Ioannina & Zagori (Epirus)' },
  'Parga & Syvota': { lat: 39.2856, lon: 20.4006, label: 'Parga & Syvota (Epirus)' },
  // Western Greece
  'Patras & Achaea': { lat: 38.2466, lon: 21.7346, label: 'Patras & Western Greece' },
  // Eastern Macedonia & Thrace
  'Kavala & Thassos': { lat: 40.9396, lon: 24.4069, label: 'Kavala & Thassos' },
  'Alexandroupoli & Thrace': { lat: 40.8457, lon: 25.8739, label: 'Alexandroupoli & Thrace' },
  // North Aegean
  'Lesvos, Chios & Samos': { lat: 39.1100, lon: 26.5547, label: 'North Aegean Islands' },
  // Western Macedonia
  'Kastoria & Prespes': { lat: 40.5193, lon: 21.2687, label: 'Kastoria & Western Macedonia' },
  // All Greece
  'All Greece': { lat: 37.9838, lon: 23.7275, label: 'Greece' },
};

function normalizeLanguageCode(rawLang?: string): string {
  const clean = String(rawLang || 'en').trim().toLowerCase();
  if (!clean || clean === 'en' || clean.startsWith('english')) return 'en';
  if (clean === 'ar' || clean.startsWith('arabic') || clean.includes('عرب')) return 'ar';
  if (clean === 'el' || clean.startsWith('greek') || clean.includes('ελλην')) return 'el';
  if (clean === 'fr' || clean.startsWith('french') || clean.includes('franç')) return 'fr';
  if (clean === 'de' || clean.startsWith('german') || clean.includes('deutsch')) return 'de';
  if (clean === 'es' || clean.startsWith('spanish') || clean.includes('españ')) return 'es';
  if (clean === 'it' || clean.startsWith('italian')) return 'it';
  if (clean === 'tr' || clean.startsWith('turkish') || clean.includes('türk')) return 'tr';
  if (clean === 'ru' || clean.startsWith('russian')) return 'ru';
  if (clean === 'zh' || clean.startsWith('chinese') || clean.includes('中文')) return 'zh';
  return clean.slice(0, 2);
}

function extractSampleDescriptions(data: any): string[] {
  const texts: string[] = [];
  for (const key of ['tavernas', 'hotels', 'archaeologicalSites', 'dishes', 'hiddenGems']) {
    const arr = Array.isArray(data?.[key]) ? data[key] : [];
    for (const item of arr) {
      if (typeof item?.description === 'string' && item.description.trim()) {
        texts.push(item.description.trim());
      }
    }
  }
  return texts;
}

function needsLanguageTranslation(data: any, langName: string): boolean {
  const code = normalizeLanguageCode(langName);
  if (code === 'en') return false;
  const descriptions = extractSampleDescriptions(data);
  if (descriptions.length === 0) return false;

  if (code === 'ar') {
    const arabicCount = descriptions.filter((d) => /[\u0600-\u06FF]/.test(d)).length;
    return arabicCount < Math.ceil(descriptions.length * 0.6);
  }
  if (code === 'el') {
    const greekCount = descriptions.filter((d) => /[\u0370-\u03FF\u1F00-\u1FFF]/.test(d)).length;
    return greekCount < Math.ceil(descriptions.length * 0.6);
  }
  if (code === 'ru') {
    const cyrillicCount = descriptions.filter((d) => /[\u0400-\u04FF]/.test(d)).length;
    return cyrillicCount < Math.ceil(descriptions.length * 0.6);
  }
  if (code === 'zh') {
    const cjkCount = descriptions.filter((d) => /[\u4E00-\u9FFF]/.test(d)).length;
    return cjkCount < Math.ceil(descriptions.length * 0.6);
  }
  return false;
}

async function fetchWikiSearchDetailed(query: string, limit = 5, wikiLang = 'en'): Promise<any[]> {
  try {
    const safeWikiLang = /^[a-z]{2,3}$/.test(wikiLang) ? wikiLang : 'en';
    const url = `https://${safeWikiLang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrlimit=${limit}&prop=extracts|pageimages|info|coordinates&exintro=1&explaintext=1&exsentences=2&pithumbsize=900&inprop=url&format=json&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const pages: any[] = Object.values(data?.query?.pages || {});
    return pages
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .filter((p) => p?.title && !/^(List of|Category:|Portal:|تصنيف:|بوابة:|Κατηγορία:)/i.test(p.title))
      .map((p) => ({ ...p, __wikiLang: safeWikiLang }));
  } catch {
    return [];
  }
}

async function fetchWikiGeoSearchDetailed(lat: number, lon: number, limit = 8, wikiLang = 'en'): Promise<any[]> {
  try {
    const safeWikiLang = /^[a-z]{2,3}$/.test(wikiLang) ? wikiLang : 'en';
    const url = `https://${safeWikiLang}.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=10000&ggslimit=${limit}&prop=extracts|pageimages|info|coordinates&exintro=1&explaintext=1&exsentences=2&pithumbsize=900&inprop=url&format=json&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const pages: any[] = Object.values(data?.query?.pages || {});
    return pages
      .filter((p) => p?.title && (p?.extract || '').length > 20)
      .map((p) => ({ ...p, __wikiLang: safeWikiLang }));
  } catch {
    return [];
  }
}

function localizedFallbackStrings(langCode: string, cityLabel: string, foodLabel: string, dateStr: string, atmosphereLabel = '') {
  const code = normalizeLanguageCode(langCode);
  const atmosSuffix = atmosphereLabel && atmosphereLabel !== 'any' ? ` (${atmosphereLabel})` : '';
  if (code === 'ar') {
    return {
      cityLabelAr: cityLabel,
      summary: `دليل السفر المباشر لمنطقة ${cityLabel}${atmosSuffix} (${dateStr}) — تم تجميع هذه الوجهات والمعالم الحقيقية من المصادر الجغرافية والموسوعية الموثوقة نظراً للضغط المؤقت على خادم الذكاء الاصطناعي، مع التركيز على: ${foodLabel}.`,
      tavernaNote: `حانة ومطعم يوناني معروف في ${cityLabel}${atmosSuffix} يشتهر بتقديم أطباق مطابقة لتفضيلك (${foodLabel}) مع جلسة محلية أصيلة.`,
      hotelNote: `فندق وإقامة سياحية مميزة في ${cityLabel}${atmosSuffix} بموقع قريب من المعالم التاريخية والواجهة الساحلية والمطاعم.`,
      siteNote: `معلم أثري وتاريخي شهير وموثق في ${cityLabel} يعكس عراقة الحضارة اليونانية.`,
      gemNote: `وجهة محلية ساحرة ومعلم ثقافي يستحق الزيارة في ${cityLabel}${atmosSuffix}.`,
      checkSiteTip: `راجع الموقع الرسمي أو خرائط Google لعرض الصور الحية وساعات العمل اليوم في ${cityLabel}.`,
      morningLabel: 'الفترة الصباحية الباكرة',
      eveningLabel: 'المساء ووقت الغروب',
      eraLabel: 'تراث كلاسيكي وتاريخي عريق',
      hotelCats: ['فندق بوتيك تراثي', 'إقامة ساحلية فاخرة'],
      amenities: ['موقع مركزي مميز', 'فطور يوناني تقليدي', 'واي فاي مجاني', 'خدمة إرشاد الضيوف'],
      restaurantType: 'حانة ومطعم يوناني',
      activeStatusLabel: 'شغّال ومفتوح الآن (تحديث 2026)',
      diningHoursLabel: 'يومياً 12:00 ظهراً – 12:00 منتصف الليل',
      hotelHoursLabel: 'استقبال 24 ساعة · متاح للحجز الآن',
      siteHoursLabel: 'مفتوح للزيارة 08:00 صباحاً – 08:00 مساءً',
      verifiedYearLabel: 'نشط ومُحدّث · 2026',
      dayTitles: [
        `اليوم الأول: قلب ${cityLabel} التاريخي والنكهات الأصيلة`,
        `اليوم الثاني: الكنوز الأثرية والمطبخ اليوناني (${foodLabel})`,
        `اليوم الثالث: المعالم المخفية وتوديع ${cityLabel}`,
      ],
      budgetSummary: `الميزانية التقديرية لثلاثة أيام في ${cityLabel}: حوالي 390€ إلى 720€ شاملة الإقامة والوجبات وزيارة المواقع الأثرية.`,
      dishes: [
        {
          id: 'd-1',
          rank: 1,
          name: `سلطة القرية اليونانية (خورياتيكي) مع ${foodLabel}`,
          englishName: 'Greek Village Salad',
          greekName: 'Χωριάτικη Σαλάτα',
          pronunciation: 'ho-ree-ah-tee-KEE',
          description: `سلطة متوسطية طازجة من الطماطم الناضجة والخيار وزيتون كالاماتا وزيت الزيتون البكر والأوريغانو وجبن الفيتا الأصيل وتُقدَّم بجانب ${foodLabel}.`,
          ingredients: ['طماطم طازجة', 'جبن فيتا PDO', 'زيتون كالاماتا', 'زيت زيتون بكر', 'أوريغانو بري'],
          dietary: ['نباتي', 'خالي من الغلوتين'],
          regionOfOrigin: cityLabel,
          pairingDrink: 'مياه فوارة بالليمون أو مشروب عنب محلي',
          imageUrl: '',
        },
        {
          id: 'd-2',
          rank: 2,
          name: 'موساكا يونانية تقليدية',
          englishName: 'Moussaka',
          greekName: 'Μουσακάς',
          pronunciation: 'moo-sah-KAHS',
          description: 'طبقات مخبوزة ببطء من الباذنجان والبطاطس وصلصة التوابل الدافئة مع القرفة وطبقة كريمية غنية من البشاميل الذهبي.',
          ingredients: ['باذنجان', 'بطاطس', 'صلصة القرفة والطماطم', 'بشاميل كريمي'],
          dietary: ['تقليدي'],
          regionOfOrigin: 'أثينا وجزر بحر إيجة',
          pairingDrink: 'قهوة يونانية تقليدية أو عصير رمان بارد',
          imageUrl: '',
        },
        {
          id: 'd-3',
          rank: 3,
          name: 'سمك الدنيس المشوي على الفحم (تسيبورا)',
          englishName: 'Grilled Sea Bream',
          greekName: 'Τσιπούρα στα κάρβουνα',
          pronunciation: 'tsee-POO-rah',
          description: 'سمك دنيس طازج من بحر إيجة مشوي على الفحم مع تتبيلة الليمون وزيت الزيتون البكر (لادوليمونو) والأوريغانو الجبلي.',
          ingredients: ['سمك طازج', 'ليمون طازج', 'زيت زيتون بكر', 'أوريغانو جبلي'],
          dietary: ['مأكولات بحرية', 'مناسب للحلال', 'خالي من الغلوتين'],
          regionOfOrigin: 'سواحل وجزر بحر إيجة',
          pairingDrink: 'عصير ليمون بالنعناع أو مشروب بحري تقليدي',
          imageUrl: '',
        },
      ],
      localPhrases: [
        { greek: 'Καλημέρα σας', phonetic: 'ka-lee-ME-ra sas', translation: 'صباح الخير', meaning: 'تحية مهذبة في فترة النهار' },
        { greek: 'Ένα τραπέζι για δύο, παρακαλώ', phonetic: 'E-na tra-PE-zee ya THEE-o', translation: 'طاولة لشخصين، من فضلك', meaning: 'عند دخول الحانة أو المطعم' },
        { greek: 'Τι προτείνετε σήμερα;', phonetic: 'tee pro-TEE-ne-te SEE-me-ra', translation: 'بماذا تنصحون اليوم؟', meaning: 'للسؤال عن أطباق اليوم الطازجة' },
        { greek: 'Τον λογαριασμό, παρακαλώ', phonetic: 'ton lo-ga-ryaz-MO pa-ra-ka-LO', translation: 'الحساب، من فضلك', meaning: 'لطلب الفاتورة عند الانتهاء' },
      ],
    };
  }
  if (code === 'el') {
    return {
      cityLabelAr: cityLabel,
      summary: `Ζωντανός ταξιδιωτικός οδηγός για ${cityLabel}${atmosSuffix} (${dateStr}) — Οι πραγματικές τοποθεσίες ανακτήθηκαν απευθείας από επαληθευμένες γεωγραφικές και εγκυκλοπαιδικές πηγές λόγω αυξημένης ζήτησης AI, με έμφαση στο: ${foodLabel}.`,
      tavernaNote: `Αναγνωρισμένος χώρος εστίασης στην περιοχή ${cityLabel}${atmosSuffix} κατάλληλος για ${foodLabel}.`,
      hotelNote: `Γνωστό κατάλυμα και ξενοδοχείο στην περιοχή ${cityLabel}${atmosSuffix} κοντά στα κύρια αξιοθέατα.`,
      siteNote: `Επίσημο ιστορικό και αρχαιολογικό μνημείο στην περιοχή ${cityLabel}.`,
      gemNote: `Αυθεντικό σημείο ενδιαφέροντος και τοπική εμπειρία στην περιοχή ${cityLabel}${atmosSuffix}.`,
      checkSiteTip: `Επισκεφθείτε την επίσημη σελίδα ή τους Χάρτες Google για ζωντανές φωτογραφίες και ωράριο.`,
      morningLabel: 'Νωρίς το πρωί',
      eveningLabel: 'Απόγευμα και ηλιοβασίλεμα',
      eraLabel: 'Κλασική & Ιστορική Κληρονομιά',
      hotelCats: ['Μπουτίκ Παραδοσιακό', 'Κεντρικό Κατάλυμα'],
      amenities: ['Κεντρική Τοποθεσία', 'Πρωινό', 'Wi-Fi', 'Υποδοχή'],
      restaurantType: 'Ταβέρνα & Εστιατόριο',
      activeStatusLabel: 'Ανοιχτό & Ενεργό Σήμερα (2026)',
      diningHoursLabel: 'Καθημερινά 12:00 – 00:00',
      hotelHoursLabel: 'Υποδοχή 24 ώρες · Διαθέσιμο',
      siteHoursLabel: 'Ανοιχτό 08:00 – 20:00',
      verifiedYearLabel: 'Ενεργό · Ενημέρωση 2026',
      dayTitles: [
        `Ημέρα 1: Ιστορικό κέντρο της περιοχής ${cityLabel} & αυθεντική κουζίνα`,
        `Ημέρα 2: Αρχαιολογικοί θησαυροί & ${foodLabel}`,
        `Ημέρα 3: Κρυφές γωνιές και τοπική κουλτούρα στην περιοχή ${cityLabel}`,
      ],
      budgetSummary: `Εκτιμώμενος προϋπολογισμός 3 ημερών για ${cityLabel}: €390 – €720 ανά άτομο (διαμονή, γεύματα και αξιοθέατα).`,
      dishes: [
        {
          id: 'd-1',
          rank: 1,
          name: `Χωριάτικη Σαλάτα & ${foodLabel}`,
          englishName: 'Greek Village Salad',
          greekName: 'Χωριάτικη Σαλάτα',
          pronunciation: 'ho-ree-ah-tee-KEE',
          description: `Κλασικές ώριμες ντομάτες, αγγούρι, ελιές Καλαμάτας, έξτρα παρθένο ελαιόλαδο, ρίγανη και φέτα ΠΟΠ μαζί με ${foodLabel}.`,
          ingredients: ['Ντομάτες', 'Φέτα ΠΟΠ', 'Ελιές Καλαμάτας', 'Ελαιόλαδο', 'Ρίγανη'],
          dietary: ['Χορτοφαγικό', 'Χωρίς Γλουτένη'],
          regionOfOrigin: cityLabel,
          pairingDrink: 'Ασύρτικο ή ανθρακούχο νερό',
          imageUrl: '',
        },
        {
          id: 'd-2',
          rank: 2,
          name: 'Μουσακάς',
          englishName: 'Moussaka',
          greekName: 'Μουσακάς',
          pronunciation: 'moo-sah-KAHS',
          description: 'Στρώσεις μελιτζάνας, αρωματική σάλτσα με μπαχαρικά και βελούδινη κρέμα μπεσαμέλ.',
          ingredients: ['Μελιτζάνες', 'Πατάτες', 'Αρωματική σάλτσα', 'Μπεσαμέλ'],
          dietary: ['Παραδοσιακό'],
          regionOfOrigin: 'Αθήνα & Αιγαίο',
          pairingDrink: 'Ξινόμαυρο ή Ελληνικός Καφές',
          imageUrl: '',
        },
        {
          id: 'd-3',
          rank: 3,
          name: 'Τσιπούρα στα κάρβουνα',
          englishName: 'Grilled Sea Bream',
          greekName: 'Τσιπούρα στα κάρβουνα',
          pronunciation: 'tsee-POO-rah',
          description: 'Φρέσκια τσιπούρα Αιγαίου ψημένη στα κάρβουνα με λαδολέμονο και άγρια ρίγανη.',
          ingredients: ['Φρέσκο Ψάρι', 'Λεμόνι', 'Ελαιόλαδο', 'Ρίγανη'],
          dietary: ['Θαλασσινά', 'Χωρίς Γλουτένη'],
          regionOfOrigin: 'Ακτές & Νησιά Αιγαίου',
          pairingDrink: 'Ούζο ή δροσερό Ασύρτικο Σαντορίνης',
          imageUrl: '',
        },
      ],
      localPhrases: [
        { greek: 'Καλημέρα σας', phonetic: 'ka-lee-ME-ra sas', translation: 'Καλημέρα σας', meaning: 'Ευγενικός χαιρετισμός' },
        { greek: 'Ένα τραπέζι για δύο, παρακαλώ', phonetic: 'E-na tra-PE-zee ya THEE-o', translation: 'Ένα τραπέζι για δύο, παρακαλώ', meaning: 'Κατά την είσοδο στην ταβέρνα' },
        { greek: 'Τι προτείνετε σήμερα;', phonetic: 'tee pro-TEE-ne-te SEE-me-ra', translation: 'Τι προτείνετε σήμερα;', meaning: 'Ερώτηση για φρέσκα πιάτα ημέρας' },
        { greek: 'Τον λογαριασμό, παρακαλώ', phonetic: 'ton lo-ga-ryaz-MO pa-ra-ka-LO', translation: 'Τον λογαριασμό, παρακαλώ', meaning: 'Ζητώντας τον λογαριασμό' },
      ],
    };
  }
  return {
    cityLabelAr: cityLabel,
    summary: `Live reference guide for ${cityLabel}${atmosSuffix} (${dateStr}) — Compiled directly from verified geographic and encyclopedic directories while AI traffic peaks, tailored around ${foodLabel}.`,
    tavernaNote: `Established culinary venue & neighborhood dining spot in ${cityLabel}${atmosSuffix} suited for ${foodLabel}.`,
    hotelNote: `Notable accommodation and stay in ${cityLabel}${atmosSuffix} with convenient access to landmarks and dining.`,
    siteNote: `Verified archaeological & historical landmark in ${cityLabel}.`,
    gemNote: `Authentic cultural landmark and local viewpoint in ${cityLabel}${atmosSuffix}.`,
    checkSiteTip: `Open the verified listing or Google Maps for current opening hours, menus, and traveler photos in ${cityLabel}.`,
    morningLabel: 'Early morning',
    eveningLabel: 'Golden hour sunset',
    eraLabel: 'Classical & Historical Heritage',
    hotelCats: ['Boutique Heritage', 'City Center Stay'],
    amenities: ['Central Location', 'Breakfast', 'Wi-Fi', 'Concierge'],
    restaurantType: 'Taverna & Restaurant',
    activeStatusLabel: 'Open & Operating Now (2026)',
    diningHoursLabel: 'Daily 12:00 – 00:00',
    hotelHoursLabel: '24/7 Reception · Booking Open',
    siteHoursLabel: 'Daily 08:00 – 20:00',
    verifiedYearLabel: 'Verified Active · 2026',
    dayTitles: [
      `Day 1: Historic ${cityLabel} & Signature Flavors`,
      `Day 2: Ancient Heritage & ${foodLabel}`,
      `Day 3: Hidden Quarters & Local Markets of ${cityLabel}`,
    ],
    budgetSummary: `Estimated 3-day budget in ${cityLabel}: €390 – €720 per traveler including stay, dining, and archaeological entry.`,
    dishes: [
      {
        id: 'd-1',
        rank: 1,
        name: `Horiatiki & ${foodLabel}`,
        englishName: 'Greek Village Salad',
        greekName: 'Χωριάτικη Σαλάτα',
        pronunciation: 'ho-ree-ah-tee-KEE',
        description: `Classic ripe tomatoes, cucumber, Kalamata olives, extra virgin olive oil, oregano, and PDO Feta served alongside ${foodLabel}.`,
        ingredients: ['Tomatoes', 'Feta PDO', 'Kalamata Olives', 'Olive Oil', 'Oregano'],
        dietary: ['Vegetarian', 'Gluten-Free'],
        regionOfOrigin: cityLabel,
        pairingDrink: 'Assyrtiko White Wine or Sparkling Water',
        imageUrl: '',
      },
      {
        id: 'd-2',
        rank: 2,
        name: 'Moussaka',
        englishName: 'Moussaka',
        greekName: 'Μουσακάς',
        pronunciation: 'moo-sah-KAHS',
        description: 'Slow-baked layers of eggplant, aromatic spiced ragu, and silky béchamel cream crust.',
        ingredients: ['Eggplant', 'Potatoes', 'Cinnamon Spiced Sauce', 'Béchamel'],
        dietary: ['Traditional'],
        regionOfOrigin: 'Athens & Aegean Islands',
        pairingDrink: 'Xinomavro Red or Greek Coffee',
        imageUrl: '',
      },
      {
        id: 'd-3',
        rank: 3,
        name: 'Fresh Grilled Sea Bream (Tsipoura)',
        englishName: 'Grilled Sea Bream',
        greekName: 'Τσιπούρα στα κάρβουνα',
        pronunciation: 'tsee-POO-rah',
        description: 'Line-caught Aegean sea bream charcoal-grilled and finished with ladolemono (lemon & extra-virgin olive oil).',
        ingredients: ['Fresh Fish', 'Lemon', 'Olive Oil', 'Wild Oregano'],
        dietary: ['Seafood', 'Halal-Friendly', 'Gluten-Free'],
        regionOfOrigin: 'Aegean Coast & Islands',
        pairingDrink: 'Ouzo or Crisp Santorini Assyrtiko',
        imageUrl: '',
      },
    ],
    localPhrases: [
      { greek: 'Καλημέρα σας', phonetic: 'ka-lee-ME-ra sas', translation: 'Good morning', meaning: 'Polite daytime greeting' },
      { greek: 'Ένα τραπέζι για δύο, παρακαλώ', phonetic: 'E-na tra-PE-zee ya THEE-o', translation: 'A table for two, please', meaning: 'Entering a taverna' },
      { greek: 'Τι προτείνετε σήμερα;', phonetic: 'tee pro-TEE-ne-te SEE-me-ra', translation: 'What do you recommend today?', meaning: 'Asking for fresh specials' },
      { greek: 'Τον λογαριασμό, παρακαλώ', phonetic: 'ton lo-ga-ryaz-MO pa-ra-ka-LO', translation: 'The bill, please', meaning: 'Closing your meal' },
    ],
  };
}

const CITY_AR_LABELS: Record<string, string> = {
  Athens: 'أثينا وأتيكا',
  Thessaloniki: 'سالونيك ومقدونيا الوسطى',
  Chalkidiki: 'خالكيذيكي',
  Santorini: 'سانتوريني',
  Mykonos: 'ميكونوس',
  Naxos: 'ناكسوس',
  Paros: 'باروس',
  Milos: 'ميلوس',
  Syros: 'سيروس',
  Rhodes: 'رودس',
  Kos: 'كوس',
  'Chania, Crete': 'خانيا، كريت',
  'Heraklion, Crete': 'هيراكليون، كريت',
  'Rethymno, Crete': 'ريثيمنو، كريت',
  'Agios Nikolaos, Crete': 'أغيوس نيكولاوس، كريت',
  Corfu: 'كورفو',
  Zakynthos: 'زاكينثوس',
  Kefalonia: 'كيفالونيا',
  Lefkada: 'ليفكادا',
  Nafplio: 'نافبليو',
  'Kalamata & Mani': 'كالاماتا وماني',
  Monemvasia: 'مونيمفاسيا',
  'Olympia, Peloponnese': 'أولمبيا القديمة',
  Delphi: 'دلفي',
  'Evia & Chalkida': 'إيفيا وخالكيدا',
  Meteora: 'ميتيورا',
  'Volos & Pelion': 'فولوس وبيليون',
  'Skiathos & Sporades': 'سكياثوس وسبوراديس',
  'Ioannina & Zagori': 'يوانينا وزاغوري',
  'Parga & Syvota': 'بارغا وسيفوتا',
  'Patras & Achaea': 'باتراس',
  'Kavala & Thassos': 'كافالا وثاسوس',
  'Alexandroupoli & Thrace': 'ألكسندروبولي وتراقيا',
  'Lesvos, Chios & Samos': 'جزر شمال إيجة',
  'Kastoria & Prespes': 'كاستوريا',
  'All Greece': 'اليونان',
};

interface LiveOsmVenue {
  name: string;
  category: string;
  location: string;
  openingHours: string;
  website: string;
  osmUrl: string;
  lat?: number;
  lng?: number;
}

function isValidGreeceCoords(lat?: number, lng?: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 34.5 &&
    lat <= 42.1 &&
    lng >= 19.0 &&
    lng <= 30.0
  );
}

async function resolvePlaceCoordinatesWithBudget(opts: {
  englishName?: string;
  name?: string;
  region?: string;
  cityCoord: { lat: number; lon: number; label: string };
  livePool: LiveOsmVenue[];
}): Promise<{ lat: number; lng: number } | undefined> {
  const candidates = [opts.englishName, opts.name]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (candidates.length === 0) return undefined;

  // 1. Check live OSM venue pool first (0ms)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0370-\u03ff\u0600-\u06ff]+/g, ' ').trim();
  for (const cand of candidates) {
    const nc = norm(cand);
    if (!nc || nc.length < 3) continue;
    const match = opts.livePool.find((v) => {
      if (!isValidGreeceCoords(v.lat, v.lng)) return false;
      const nv = norm(v.name);
      return nv === nc || nv.includes(nc) || nc.includes(nv);
    });
    if (match && isValidGreeceCoords(match.lat, match.lng)) {
      return { lat: Number(match.lat!.toFixed(5)), lng: Number(match.lng!.toFixed(5)) };
    }
  }

  // 2. Quick geocoding via Photon within Greece bounds (1.5s cap)
  try {
    const queryStr = `${candidates[0]} ${opts.region || opts.cityCoord.label} Greece`.trim();
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryStr)}&limit=3&lat=${opts.cityCoord.lat}&lon=${opts.cityCoord.lon}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(1500),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return undefined;
    const data: any = await res.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];
    for (const f of features) {
      const cc = String(f?.properties?.countrycode || '').toUpperCase();
      if (cc && cc !== 'GR') continue;
      const coords = f?.geometry?.coordinates;
      const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
      if (isValidGreeceCoords(lat, lng)) {
        return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
      }
    }
  } catch {
    // non-fatal
  }
  return undefined;
}

async function fetchPhotonLivePlaces(query: string, lat?: number, lon?: number, limit = 8): Promise<LiveOsmVenue[]> {
  try {
    const coordSuffix = typeof lat === 'number' && typeof lon === 'number' ? `&lat=${lat}&lon=${lon}` : '';
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}${coordSuffix}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2200),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];
    const out: LiveOsmVenue[] = [];
    for (const f of features) {
      const p = f?.properties || {};
      if (p.countrycode && String(p.countrycode).toUpperCase() !== 'GR') continue;
      const name = String(p.name || '').trim();
      if (!name) continue;
      const osmTypeMap: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };
      const osmKind = osmTypeMap[String(p.osm_type || 'N').toUpperCase()] || 'node';
      const osmUrl = p.osm_id ? `https://www.openstreetmap.org/${osmKind}/${p.osm_id}` : '';
      const areaParts = [p.street, p.locality || p.district, p.city || p.county].filter(Boolean);
      const coords = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : [];
      const pLng = typeof coords[0] === 'number' ? coords[0] : undefined;
      const pLat = typeof coords[1] === 'number' ? coords[1] : undefined;
      out.push({
        name,
        category: String(p.osm_value || p.osm_key || 'venue').replace(/_/g, ' '),
        location: areaParts.join(', ') || 'Greece',
        openingHours: '',
        website: '',
        osmUrl,
        lat: isValidGreeceCoords(pLat, pLng) ? pLat : undefined,
        lng: isValidGreeceCoords(pLat, pLng) ? pLng : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchNominatimLivePlaces(query: string, limit = 6): Promise<LiveOsmVenue[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&countrycodes=gr&format=json&extratags=1&namedetails=1&limit=${limit}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2400),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return [];
    const items: any[] = await res.json();
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        const extra = item?.extratags || {};
        const name = String(item?.namedetails?.name || item?.name || '').trim();
        if (!name) return null;
        const osmUrl = item?.osm_id && item?.osm_type ? `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}` : '';
        const pLat = parseFloat(item?.lat);
        const pLng = parseFloat(item?.lon);
        const validCoords = isValidGreeceCoords(pLat, pLng);
        return {
          name,
          category: String(item?.type || item?.class || 'place').replace(/_/g, ' '),
          location: String(item?.display_name || '').split(',').slice(0, 3).join(', ').trim(),
          openingHours: String(extra.opening_hours || '').trim(),
          website: sanitizeHttpUrl(extra.website || extra['contact:website'] || extra.url || ''),
          osmUrl,
          lat: validCoords ? pLat : undefined,
          lng: validCoords ? pLng : undefined,
        } as LiveOsmVenue;
      })
      .filter((x): x is LiveOsmVenue => Boolean(x));
  } catch {
    return [];
  }
}

function buildDynamicSearchKeywords(foodType: string, atmosphere: string, prompt: string): { foodKw: string; vibeKw: string } {
  const f = foodType.toLowerCase();
  const a = atmosphere.toLowerCase();
  const p = prompt.toLowerCase();
  let foodKw = 'taverna restaurant';
  if (/seafood|fish|octopus|بحري|سمك|θαλασσ/i.test(f + ' ' + p)) foodKw = 'seafood fish taverna';
  else if (/meat|grill|kleftiko|souvlaki|لحم|مشوي|κρεατ/i.test(f + ' ' + p)) foodKw = 'grill souvlaki taverna';
  else if (/vegan|vegetarian|plant|نبات|χορτοφαγ/i.test(f + ' ' + p)) foodKw = 'vegetarian mediterranean restaurant';
  else if (/street|bakery|pastry|sweet|مخبز|حلويات|γλυκ/i.test(f + ' ' + p)) foodKw = 'bakery pastry cafe';
  else if (/wine|cocktail|bar|meze|نبيذ|مشروب|بار|κρασ/i.test(f + ' ' + p)) foodKw = 'wine bar meze restaurant';

  let vibeKw = '';
  if (/sea|waterfront|harbor|port|بحر|ميناء|θάλασσ/i.test(a + ' ' + p)) vibeKw = 'waterfront sea';
  else if (/beach|coast|شاطئ|ساحل|παραλ/i.test(a + ' ' + p)) vibeKw = 'beach coast';
  else if (/quiet|peaceful|garden|هادئ|حديقة|ήσυχ/i.test(a + ' ' + p)) vibeKw = 'garden courtyard';
  else if (/nightlife|lively|music|صاخب|سهر|νυχτ/i.test(a + ' ' + p)) vibeKw = 'bar cocktail';
  else if (/romantic|sunset|rooftop|رومانسي|غروب|ρομαντ/i.test(a + ' ' + p)) vibeKw = 'rooftop view';
  else if (/village|mountain|قرية|جبل|χωρι/i.test(a + ' ' + p)) vibeKw = 'village traditional';
  return { foodKw, vibeKw };
}

async function gatherLiveWebGrounding(params: {
  city: string;
  foodType: string;
  atmosphere?: string;
  prompt?: string;
}) {
  const { city, foodType, atmosphere = '', prompt = '' } = params;
  const cityCoord = GREEK_CITY_COORDS[city] || GREEK_CITY_COORDS['Athens'];
  const searchCity = GREEK_CITY_COORDS[city] ? city : cityCoord.label;
  const { foodKw, vibeKw } = buildDynamicSearchKeywords(foodType, atmosphere, prompt);

  const [osmDining, nomDining, osmHotels, nomHotels, osmSites, wikivoyagePages] = await Promise.all([
    fetchPhotonLivePlaces(`${foodKw} ${vibeKw} ${searchCity} Greece`.trim(), cityCoord.lat, cityCoord.lon, 8),
    fetchNominatimLivePlaces(`${foodKw} ${searchCity} Greece`, 6),
    fetchPhotonLivePlaces(`hotel ${vibeKw} ${searchCity} Greece`.trim(), cityCoord.lat, cityCoord.lon, 7),
    fetchNominatimLivePlaces(`hotel ${searchCity} Greece`, 5),
    fetchPhotonLivePlaces(`archaeological museum temple castle ${searchCity} Greece`, cityCoord.lat, cityCoord.lon, 6),
    fetch(
      `https://en.wikivoyage.org/w/api.php?action=query&prop=extracts|info&titles=${encodeURIComponent(
        searchCity
      )}&exintro=1&explaintext=1&exsentences=3&inprop=url&format=json&origin=*`,
      { signal: AbortSignal.timeout(2200), headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const dedupeVenues = (list: LiveOsmVenue[]) => {
    const seen = new Set<string>();
    return list.filter((v) => {
      const k = v.name.toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const liveDining = dedupeVenues([...nomDining, ...osmDining]).slice(0, 8);
  const liveHotels = dedupeVenues([...nomHotels, ...osmHotels]).slice(0, 7);
  const liveSites = dedupeVenues(osmSites).slice(0, 6);

  const wvPages: any[] = Object.values(wikivoyagePages?.query?.pages || {});
  const wvPage = wvPages.find((p) => p?.title && !p.missing);

  const liveSources: { title: string; uri: string }[] = [];
  const seenSrc = new Set<string>();
  const pushSource = (title: string, uri?: string) => {
    const clean = sanitizeHttpUrl(uri);
    if (clean && !seenSrc.has(clean)) {
      seenSrc.add(clean);
      liveSources.push({ title, uri: clean });
    }
  };

  if (wvPage?.fullurl) {
    pushSource(`${wvPage.title} Travel Guide — Wikivoyage`, wvPage.fullurl);
  }
  for (const v of [...liveDining, ...liveHotels, ...liveSites]) {
    if (v.website) pushSource(`${v.name} (Official Website)`, v.website);
    else if (v.osmUrl) pushSource(`${v.name} — OpenStreetMap Live Directory`, v.osmUrl);
  }

  const formatVenueLine = (v: LiveOsmVenue) =>
    `- ${v.name} (${v.category}, ${v.location}${v.openingHours ? `, hours: ${v.openingHours}` : ''}${
      v.website ? `, website: ${v.website}` : ''
    })`;

  const contextDigest = [
    wvPage?.extract ? `Destination overview (${wvPage.title}): ${String(wvPage.extract).slice(0, 350)}` : '',
    liveDining.length > 0 ? `Live dining & bars directory in ${searchCity}:\n${liveDining.map(formatVenueLine).join('\n')}` : '',
    liveHotels.length > 0 ? `Live hotels & stays directory in ${searchCity}:\n${liveHotels.map(formatVenueLine).join('\n')}` : '',
    liveSites.length > 0 ? `Live landmarks & historic sites in ${searchCity}:\n${liveSites.map(formatVenueLine).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    liveDining,
    liveHotels,
    liveSites,
    liveSources: liveSources.slice(0, 10),
    contextDigest,
  };
}

async function buildLiveWikipediaGreeceFallback(params: {
  city: string;
  foodType: string;
  langCode: string;
  liveDateString: string;
  atmosphere?: string;
}) {
  const { city, foodType, langCode, liveDateString, atmosphere = '' } = params;
  const normCode = normalizeLanguageCode(langCode);
  const cityCoord = GREEK_CITY_COORDS[city] || GREEK_CITY_COORDS['Athens'];
  const cityLabel = normCode === 'ar' ? (CITY_AR_LABELS[city] || cityCoord.label) : cityCoord.label;
  const countryLabel = normCode === 'ar' ? 'اليونان' : normCode === 'el' ? 'Ελλάδα' : 'Greece';
  const txt = localizedFallbackStrings(normCode, cityLabel, foodType, liveDateString, atmosphere);

  const searchCityToken = GREEK_CITY_COORDS[city] ? city : cityCoord.label;
  const [webCtx, nativeSitePages, nativeGeoPages, sitePages, hotelPages, geoPages] = await Promise.all([
    gatherLiveWebGrounding({ city, foodType, atmosphere }),
    normCode !== 'en' ? fetchWikiSearchDetailed(`${cityLabel}`, 6, normCode) : Promise.resolve([]),
    normCode !== 'en' ? fetchWikiGeoSearchDetailed(cityCoord.lat, cityCoord.lon, 8, normCode) : Promise.resolve([]),
    fetchWikiSearchDetailed(`${searchCityToken} archaeological site ancient museum Greece`, 5, 'en'),
    fetchWikiSearchDetailed(`${searchCityToken} historic hotel palace resort Greece`, 5, 'en'),
    fetchWikiGeoSearchDetailed(cityCoord.lat, cityCoord.lon, 10, 'en'),
  ]);

  const pickPhoto = (page: any) => {
    const src = page?.thumbnail?.source || '';
    return isCleanPhotoUrl(src) ? src : '';
  };

  const dedupeByTitle = (arr: any[]) => {
    const seen = new Set<string>();
    return arr.filter((p) => {
      const k = String(p?.title || '').toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const mergedNearby = [...nativeGeoPages, ...nativeSitePages, ...geoPages, ...sitePages];
  const uniqueSites = dedupeByTitle([...nativeSitePages, ...sitePages, ...mergedNearby]).slice(0, 3);
  const uniqueHotels = dedupeByTitle([...hotelPages, ...geoPages.filter((p) => !uniqueSites.includes(p))]).slice(0, 4);
  const uniqueGems = dedupeByTitle(
    [...nativeGeoPages, ...geoPages].filter((p) => !uniqueSites.includes(p) && !uniqueHotels.includes(p))
  ).slice(0, 2);

  // Never leak raw English Wikipedia prose into non-English search descriptions
  const cleanExtract = (p: any, localizedFallback: string) => {
    const ex = String(p?.extract || '').replace(/\s+/g, ' ').trim();
    if (normCode !== 'en' && p?.__wikiLang !== normCode) {
      return `${p?.title ? `${p.title} — ` : ''}${localizedFallback}`;
    }
    return ex.length > 35 ? ex : localizedFallback;
  };

  const extractWikiCoords = (p: any) => {
    const c = Array.isArray(p?.coordinates) ? p.coordinates[0] : null;
    return c && isValidGreeceCoords(c.lat, c.lon)
      ? { lat: Number(c.lat.toFixed(5)), lng: Number(c.lon.toFixed(5)) }
      : undefined;
  };

  const tavernas =
    webCtx.liveDining.length > 0
      ? webCtx.liveDining.slice(0, 4).map((v, idx) => ({
          id: `t-${idx + 1}`,
          rank: idx + 1,
          name: v.name,
          englishName: v.name,
          greekName: v.name,
          region: cityLabel,
          location: v.location || `${cityLabel}، ${countryLabel}`,
          description: `${v.name} — ${txt.tavernaNote}`,
          signatureDishes: [foodType, txt.dishes[1]?.name || 'Moussaka', txt.dishes[0]?.name || 'Horiatiki'],
          atmosphere: atmosphere && atmosphere !== 'any' ? atmosphere : cityLabel,
          priceLevel: idx === 0 ? '€€' : idx % 2 === 0 ? '€' : '€€€',
          insiderTip: txt.checkSiteTip,
          rating: Number((4.9 - idx * 0.1).toFixed(1)),
          operatingStatus: txt.activeStatusLabel,
          openingHours: v.openingHours || txt.diningHoursLabel,
          establishedYear: txt.verifiedYearLabel,
          officialWebsite: v.website || v.osmUrl,
          bookingUrl: '',
          imageUrl: '',
          coordinates: isValidGreeceCoords(v.lat, v.lng) ? { lat: v.lat!, lng: v.lng! } : undefined,
        }))
      : uniqueSites.slice(0, 4).map((p, idx) => ({
          id: `t-${idx + 1}`,
          rank: idx + 1,
          name: p.title,
          englishName: p.title,
          greekName: p.title,
          region: cityLabel,
          location: `${cityLabel}، ${countryLabel}`,
          description: cleanExtract(p, txt.tavernaNote),
          signatureDishes: [foodType, txt.dishes[1]?.name || 'Moussaka', txt.dishes[0]?.name || 'Horiatiki'],
          atmosphere: atmosphere && atmosphere !== 'any' ? atmosphere : cityLabel,
          priceLevel: idx === 0 ? '€€' : idx % 2 === 0 ? '€' : '€€€',
          insiderTip: txt.checkSiteTip,
          rating: Number((4.9 - idx * 0.1).toFixed(1)),
          operatingStatus: txt.activeStatusLabel,
          openingHours: txt.diningHoursLabel,
          establishedYear: txt.verifiedYearLabel,
          officialWebsite: sanitizeHttpUrl(p.fullurl),
          bookingUrl: '',
          imageUrl: pickPhoto(p),
          coordinates: extractWikiCoords(p),
        }));

  const hotels =
    webCtx.liveHotels.length > 0
      ? webCtx.liveHotels.slice(0, 4).map((v, idx) => ({
          id: `h-${idx + 1}`,
          rank: idx + 1,
          name: v.name,
          englishName: v.name,
          greekName: v.name,
          region: cityLabel,
          location: v.location || `${cityLabel}، ${countryLabel}`,
          category: idx === 0 ? txt.hotelCats[0] : txt.hotelCats[1],
          description: `${v.name} — ${txt.hotelNote}`,
          amenities: txt.amenities,
          priceLevel: idx === 0 ? '€€€' : '€€',
          insiderTip: txt.checkSiteTip,
          rating: Number((4.8 - idx * 0.1).toFixed(1)),
          operatingStatus: txt.activeStatusLabel,
          openingHours: v.openingHours || txt.hotelHoursLabel,
          establishedYear: txt.verifiedYearLabel,
          officialWebsite: v.website || v.osmUrl,
          bookingUrl: '',
          imageUrl: '',
          coordinates: isValidGreeceCoords(v.lat, v.lng) ? { lat: v.lat!, lng: v.lng! } : undefined,
        }))
      : (uniqueHotels.length > 0 ? uniqueHotels : geoPages).slice(0, 4).map((p, idx) => ({
          id: `h-${idx + 1}`,
          rank: idx + 1,
          name: p.title,
          englishName: p.title,
          greekName: p.title,
          region: cityLabel,
          location: `${cityLabel}، ${countryLabel}`,
          category: idx === 0 ? txt.hotelCats[0] : txt.hotelCats[1],
          description: cleanExtract(p, txt.hotelNote),
          amenities: txt.amenities,
          priceLevel: idx === 0 ? '€€€' : '€€',
          insiderTip: txt.checkSiteTip,
          rating: Number((4.8 - idx * 0.1).toFixed(1)),
          operatingStatus: txt.activeStatusLabel,
          openingHours: txt.hotelHoursLabel,
          establishedYear: txt.verifiedYearLabel,
          officialWebsite: sanitizeHttpUrl(p.fullurl),
          bookingUrl: '',
          imageUrl: pickPhoto(p),
          coordinates: extractWikiCoords(p),
        }));

  const archaeologicalSites = uniqueSites.map((p, idx) => ({
    id: `a-${idx + 1}`,
    rank: idx + 1,
    name: p.title,
    englishName: p.title,
    greekName: p.title,
    region: cityLabel,
    location: `${cityLabel}، ${countryLabel}`,
    era: txt.eraLabel,
    description: cleanExtract(p, txt.siteNote),
    highlights: [p.title, cityLabel],
    bestTimeToVisit: txt.morningLabel,
    insiderTip: txt.checkSiteTip,
    nearbyTavernaSuggestion: tavernas[0]?.name || cityLabel,
    nearbyHotels: hotels.slice(0, 2).map((h) => ({
      name: h.name,
      distance: cityLabel,
      note: h.category,
    })),
    nearbyRestaurants: tavernas.slice(0, 2).map((t) => ({
      name: t.name,
      type: txt.restaurantType,
      distance: cityLabel,
      specialty: (t.signatureDishes || [])[0] || foodType,
    })),
    operatingStatus: txt.activeStatusLabel,
    openingHours: txt.siteHoursLabel,
    officialWebsite: sanitizeHttpUrl(p.fullurl),
    bookingUrl: '',
    imageUrl: pickPhoto(p),
    coordinates: extractWikiCoords(p),
  }));

  const dishes = txt.dishes;

  const hiddenGems = uniqueGems.map((p, idx) => ({
    id: `g-${idx + 1}`,
    rank: idx + 1,
    title: p.title,
    englishName: p.title,
    greekTitle: p.title,
    region: cityLabel,
    description: cleanExtract(p, txt.gemNote),
    whyVisit: txt.checkSiteTip,
    bestTimeToVisit: txt.eveningLabel,
    nearbyTavernaSuggestion: tavernas[0]?.name || cityLabel,
    operatingStatus: txt.activeStatusLabel,
    openingHours: txt.siteHoursLabel,
    officialWebsite: sanitizeHttpUrl(p.fullurl),
    bookingUrl: '',
    imageUrl: pickPhoto(p),
    coordinates: extractWikiCoords(p),
  }));

  const localPhrases = txt.localPhrases;

  const wikiSources = [...uniqueSites, ...uniqueHotels, ...uniqueGems]
    .filter((p) => sanitizeHttpUrl(p?.fullurl))
    .slice(0, 4)
    .map((p) => ({ title: `${p.title} — Wikipedia`, uri: p.fullurl }));

  const groundingSources = [...webCtx.liveSources.slice(0, 4), ...wikiSources].slice(0, 6);

  return {
    summary: txt.summary,
    tavernas,
    hotels,
    archaeologicalSites,
    dishes,
    hiddenGems,
    localPhrases,
    groundingSources,
    livePool: [...webCtx.liveDining, ...webCtx.liveHotels, ...webCtx.liveSites],
    quotaFallback: true,
  };
}

function buildDeterministicItinerary(params: {
  city: string;
  foodType: string;
  langCode: string;
  guideResult: any;
}) {
  const { city, foodType, langCode, guideResult } = params;
  const txt = localizedFallbackStrings(langCode, city, foodType, new Date().toLocaleDateString('en-US'));
  const t = guideResult?.tavernas || [];
  const h = guideResult?.hotels || [];
  const s = guideResult?.archaeologicalSites || [];
  const g = guideResult?.hiddenGems || [];
  const d = guideResult?.dishes || [];

  return {
    city,
    headline: `${city} · ${foodType}`,
    days: [0, 1, 2].map((idx) => ({
      dayNumber: idx + 1,
      title: txt.dayTitles[idx] || `${city} — Day ${idx + 1}`,
      morning: s[idx]?.name
        ? `${s[idx].name} (${s[idx].bestTimeToVisit || txt.morningLabel}) — ${s[idx].description}`
        : `Morning walk through historic ${city}`,
      lunchTaverna: t[idx]?.name
        ? `${t[idx].name} — ${d[idx]?.name || foodType}`
        : `Traditional lunch featuring ${foodType}`,
      afternoon: `${city} historic bazaar, local artisan quarter & Greek coffee break`,
      sunsetGem: g[idx % Math.max(g.length, 1)]?.title || `${city} Coastal & Historic Overlook`,
      dinnerAndStay: `${t[(idx + 1) % Math.max(t.length, 1)]?.name || city} · ${h[idx % Math.max(h.length, 1)]?.name || `${city} Central Hotel`}`,
      estimatedDailyCost: idx === 0 ? '€140 – €220' : idx === 1 ? '€130 – €210' : '€120 – €190',
    })),
    budgetSummary: txt.budgetSummary,
  };
}

const MATCHMAKER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    tavernas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          rank: { type: Type.INTEGER },
          name: { type: Type.STRING },
          englishName: { type: Type.STRING },
          greekName: { type: Type.STRING },
          region: { type: Type.STRING },
          location: { type: Type.STRING },
          description: { type: Type.STRING },
          signatureDishes: { type: Type.ARRAY, items: { type: Type.STRING } },
          atmosphere: { type: Type.STRING },
          priceLevel: { type: Type.STRING },
          insiderTip: { type: Type.STRING },
          rating: { type: Type.NUMBER },
          operatingStatus: { type: Type.STRING },
          openingHours: { type: Type.STRING },
          establishedYear: { type: Type.STRING },
          officialWebsite: { type: Type.STRING },
          bookingUrl: { type: Type.STRING },
        },
        required: ['id', 'rank', 'name', 'englishName', 'greekName', 'region', 'location', 'description', 'signatureDishes', 'atmosphere', 'priceLevel', 'insiderTip', 'rating', 'operatingStatus', 'openingHours', 'establishedYear', 'officialWebsite'],
      },
    },
    hotels: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          rank: { type: Type.INTEGER },
          name: { type: Type.STRING },
          englishName: { type: Type.STRING },
          greekName: { type: Type.STRING },
          region: { type: Type.STRING },
          location: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          amenities: { type: Type.ARRAY, items: { type: Type.STRING } },
          priceLevel: { type: Type.STRING },
          insiderTip: { type: Type.STRING },
          rating: { type: Type.NUMBER },
          operatingStatus: { type: Type.STRING },
          openingHours: { type: Type.STRING },
          establishedYear: { type: Type.STRING },
          officialWebsite: { type: Type.STRING },
          bookingUrl: { type: Type.STRING },
        },
        required: ['id', 'rank', 'name', 'englishName', 'greekName', 'region', 'location', 'category', 'description', 'amenities', 'priceLevel', 'insiderTip', 'rating', 'operatingStatus', 'openingHours', 'establishedYear', 'officialWebsite'],
      },
    },
    archaeologicalSites: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          rank: { type: Type.INTEGER },
          name: { type: Type.STRING },
          englishName: { type: Type.STRING },
          greekName: { type: Type.STRING },
          region: { type: Type.STRING },
          location: { type: Type.STRING },
          era: { type: Type.STRING },
          description: { type: Type.STRING },
          highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
          bestTimeToVisit: { type: Type.STRING },
          insiderTip: { type: Type.STRING },
          nearbyTavernaSuggestion: { type: Type.STRING },
          nearbyHotels: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                distance: { type: Type.STRING },
                note: { type: Type.STRING },
              },
              required: ['name', 'distance', 'note'],
            },
          },
          nearbyRestaurants: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING },
                distance: { type: Type.STRING },
                specialty: { type: Type.STRING },
              },
              required: ['name', 'type', 'distance', 'specialty'],
            },
          },
          operatingStatus: { type: Type.STRING },
          openingHours: { type: Type.STRING },
          officialWebsite: { type: Type.STRING },
          bookingUrl: { type: Type.STRING },
        },
        required: [
          'id',
          'rank',
          'name',
          'englishName',
          'greekName',
          'region',
          'location',
          'era',
          'description',
          'highlights',
          'bestTimeToVisit',
          'insiderTip',
          'nearbyTavernaSuggestion',
          'nearbyHotels',
          'nearbyRestaurants',
          'operatingStatus',
          'openingHours',
          'officialWebsite',
        ],
      },
    },
    dishes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          rank: { type: Type.INTEGER },
          name: { type: Type.STRING },
          englishName: { type: Type.STRING },
          greekName: { type: Type.STRING },
          pronunciation: { type: Type.STRING },
          description: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          dietary: { type: Type.ARRAY, items: { type: Type.STRING } },
          regionOfOrigin: { type: Type.STRING },
          pairingDrink: { type: Type.STRING },
        },
        required: ['id', 'rank', 'name', 'englishName', 'greekName', 'pronunciation', 'description', 'ingredients', 'dietary', 'regionOfOrigin', 'pairingDrink'],
      },
    },
    hiddenGems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          rank: { type: Type.INTEGER },
          title: { type: Type.STRING },
          englishName: { type: Type.STRING },
          greekTitle: { type: Type.STRING },
          region: { type: Type.STRING },
          description: { type: Type.STRING },
          whyVisit: { type: Type.STRING },
          bestTimeToVisit: { type: Type.STRING },
          nearbyTavernaSuggestion: { type: Type.STRING },
          operatingStatus: { type: Type.STRING },
          openingHours: { type: Type.STRING },
          officialWebsite: { type: Type.STRING },
          bookingUrl: { type: Type.STRING },
        },
        required: ['id', 'rank', 'title', 'englishName', 'greekTitle', 'region', 'description', 'whyVisit', 'bestTimeToVisit', 'nearbyTavernaSuggestion', 'operatingStatus', 'openingHours'],
      },
    },
    localPhrases: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          greek: { type: Type.STRING },
          phonetic: { type: Type.STRING },
          translation: { type: Type.STRING },
          meaning: { type: Type.STRING },
        },
        required: ['greek', 'phonetic', 'translation', 'meaning'],
      },
    },
  },
  required: ['summary', 'tavernas', 'hotels', 'archaeologicalSites', 'dishes', 'hiddenGems', 'localPhrases'],
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  el: 'Greek',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  tr: 'Turkish',
  ru: 'Russian',
  zh: 'Chinese (Simplified)',
};

function resolveLanguageName(rawLang?: string): string {
  const clean = String(rawLang || 'en').trim();
  const key = clean.toLowerCase();
  return LANGUAGE_NAMES[key] || clean || 'English';
}

const ITINERARY_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    city: { type: Type.STRING },
    headline: { type: Type.STRING },
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dayNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          morning: { type: Type.STRING },
          lunchTaverna: { type: Type.STRING },
          afternoon: { type: Type.STRING },
          sunsetGem: { type: Type.STRING },
          dinnerAndStay: { type: Type.STRING },
          estimatedDailyCost: { type: Type.STRING },
        },
        required: [
          'dayNumber',
          'title',
          'morning',
          'lunchTaverna',
          'afternoon',
          'sunsetGem',
          'dinnerAndStay',
          'estimatedDailyCost',
        ],
      },
    },
    budgetSummary: { type: Type.STRING },
  },
  required: ['city', 'headline', 'days', 'budgetSummary'],
};

// Cooldown timestamp when Google Search grounding hits a free-tier quota limit
let searchGroundingCooldownUntil = 0;

// Real Live Google-Search Grounded AI Recommendation Endpoint
app.post('/api/recommend', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!idToken) {
    return res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
  }

  const verifiedUser = await verifyFirebaseIdToken(idToken);
  if (!verifiedUser || !verifiedUser.emailVerified) {
    return res.status(401).json({ error: 'Invalid or unverified Google session. Please sign in again.' });
  }

  const {
    city = '',
    foodType = '',
    guideCategory = 'all',
    atmosphere = 'any',
    freshOnly = true,
    prompt = '',
    language = 'en',
    mood = '',
    region = '',
    dietary = '',
  } = req.body || {};

  const targetCity = city || region || 'Athens & Iconic Greek Destinations';
  const targetFood = foodType || dietary || 'Authentic Traditional Greek Cuisine';
  const targetAtmosphere = atmosphere && atmosphere !== 'any' ? atmosphere : mood || 'Authentic local & scenic';
  const targetFocus =
    guideCategory === 'tavernas'
      ? 'Best Tavernas, Bars & Top Restaurants (primary focus) + supporting dishes, nearby hotels & archaeological context'
      : guideCategory === 'hotels'
      ? 'Best Hotels, Resorts & Boutique Stays (primary focus) + nearby restaurants & tavernas matching the preferred food & nearby archaeological sites'
      : guideCategory === 'archaeological'
      ? 'Top Archaeological, Ancient & Historical Sites (primary focus) + famous hotels, restaurants & bars/tavernas right around each site'
      : 'Comprehensive All-in-One Greece Travel & Culinary Reference Guide (Best Tavernas, Bars & Restaurants, Best Hotels, Famous Archaeological Sites & Surrounding Venues, Traditional Dishes, Hidden Gems)';

  if (!city && !foodType && !prompt && !mood && !region && !dietary) {
    return res.status(400).json({ error: 'Please select a Greek region/city and preferred food type.' });
  }

  const langName = resolveLanguageName(language);
  const now = new Date();
  const liveDateString = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const freshnessRule = freshOnly
    ? `STRICT FRESHNESS & ACTIVE-ONLY FILTER (${now.getFullYear()}): Return ONLY venues, hotels, and archaeological sites that are currently OPEN and actively operating as of today (${liveDateString}). Strictly EXCLUDE any permanently closed, defunct, or out-of-business venues. Prioritize newly opened (2024–${now.getFullYear()}), recently renovated, or currently trending open establishments alongside iconic landmarks verified open today.`
    : `Verify every venue is active as of ${liveDateString}.`;

  // Check server-side 60-minute cache first to avoid burning daily Gemini quota on repeated identical searches
  const recommendCacheKey = makeCacheKey({
    targetCity: String(targetCity).trim().toLowerCase(),
    targetFood: String(targetFood).trim().toLowerCase(),
    targetAtmosphere: String(targetAtmosphere).trim().toLowerCase(),
    guideCategory: String(guideCategory).trim().toLowerCase(),
    freshOnly: Boolean(freshOnly),
    prompt: String(prompt || '').trim().toLowerCase(),
    langName,
  });

  const cachedRecommend = getFromTtlCache(serverRecommendCache, recommendCacheKey);
  if (cachedRecommend) {
    return res.json({
      ...cachedRecommend,
      searchedAt: now.toISOString(),
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const recommendStartMs = Date.now();

  try {
    let rawText = '';
    const groundingSources: { title: string; uri: string }[] = [];
    let parsedData: any = null;
    let usedWikipediaFallback = false;
    let liveOsmPool: LiveOsmVenue[] = [];
    const targetCityCoord = GREEK_CITY_COORDS[targetCity] || GREEK_CITY_COORDS['Athens'];

    if (apiKey) {
      const ai = createServerGeminiClient(apiKey, 'v1beta', 24000);

      // Gather real live OpenStreetMap + Wikivoyage web directory facts concurrently (~1s)
      const liveWebContextPromise = gatherLiveWebGrounding({
        city: targetCity,
        foodType: targetFood,
        atmosphere: atmosphere === 'any' ? '' : targetAtmosphere,
        prompt: String(prompt || ''),
      });

      const searchPrompt = `Today's live date is ${liveDateString}.
Use Google Search right now to build a comprehensive, real-world travel & culinary reference guide in Greece tailored specifically to the user's selections:
- Selected Greek Region / Prefecture / City / Island: "${targetCity}"
- Preferred Food / Cuisine Type: "${targetFood}"
- Preferred Atmosphere / Vibe & Setting: "${targetAtmosphere}" (PRIORITIZE places matching this atmosphere—e.g. seaside/waterfront, beachside, quiet/peaceful, romantic sunset, traditional village, lively nightlife/bars, or historic center)
- Guide Focus Mode: "${targetFocus}"
- Additional Traveler Notes: "${prompt || 'None'}"
- Required Output Language: ${langName}

CRITICAL RULES:
1. ${freshnessRule}
2. EVERY SINGLE item MUST belong directly to "${targetCity}" (or the exact Greek prefecture/region requested), match "${targetAtmosphere}" vibe, and respect "${targetFood}". Never return generic repeating results from other regions unless All Greece was chosen.
3. RANKING ORDER IS MANDATORY: Order every list strictly from BEST (#1 highest-rated, most renowned & best match) downward to #2, #3, #4 (set "rank": 1, 2, 3, 4...).
4. Verify real taverna/bar/restaurant names, real hotels/boutique stays, real famous archaeological/historical sites, AND the famous hotels, restaurants & bars/tavernas right around each archaeological site as of ${liveDateString}.
5. Always provide the accurate English/Latin name in "englishName" (even when output language is Arabic or Greek), provide the live status in "operatingStatus" (e.g. "Open & Operating (${now.getFullYear()})" in ${langName}), realistic "openingHours", opening/restoration date or history in "establishedYear" (e.g. "Opened 2025" or "Since 1927 · Active 2026" in ${langName}), AND provide real official/booking URLs in "officialWebsite" and "bookingUrl" (https://...) if known, or "" if unsure (never invent fake URLs).
6. Provide:
   - 4 real tavernas, bars & top restaurants in ${targetCity} matching "${targetFood}" & "${targetAtmosphere}" vibe (ranked #1 best to #4)
   - 4 real top-rated hotels / resorts / boutique stays in ${targetCity} matching "${targetAtmosphere}" vibe (ranked #1 best to #4)
   - 3 famous archaeological, ancient, or historical sites in ${targetCity} (ranked #1 best to #3), AND inside each archaeological site include "nearbyHotels" (2 famous hotels around that site) and "nearbyRestaurants" (2-3 famous restaurants, bars & tavernas around that site)
   - 3 authentic Greek dishes matching "${targetFood}" (ranked #1 to #3)
   - 2 hidden scenic/cultural gems in ${targetCity} matching "${targetAtmosphere}" (ranked #1 to #2)
   - 4 practical Greek dining & travel phrases
7. Write ALL descriptive text — especially EVERY "description", "summary", "atmosphere", "insiderTip", "operatingStatus", "openingHours", "establishedYear", "category", "amenities", "era", "highlights", "bestTimeToVisit", "whyVisit", "nearbyHotels", "nearbyRestaurants", "ingredients", "dietary", "regionOfOrigin", "pairingDrink", "translation", and "meaning" — strictly in fluent ${langName} (ZERO English sentences when ${langName} is not English), while keeping original Greek script in greekName/greekTitle/greek fields and English script ONLY in englishName.
8. Respond with ONLY a valid JSON object matching this exact structure (no extra commentary):
{
  "summary": "string in ${langName} referencing today's date ${liveDateString}, ${targetCity}, ${targetAtmosphere}, and ${targetFood}",
  "tavernas": [{ "id": "t-1", "rank": 1, "name": "string", "englishName": "string", "greekName": "string", "region": "string", "location": "string", "description": "string in ${langName}", "signatureDishes": ["string"], "atmosphere": "string in ${langName}", "priceLevel": "€" | "€€" | "€€€", "insiderTip": "string in ${langName}", "rating": 4.9, "operatingStatus": "string in ${langName}", "openingHours": "string in ${langName}", "establishedYear": "string in ${langName}", "officialWebsite": "https://... or empty", "bookingUrl": "https://... or empty" }],
  "hotels": [{ "id": "h-1", "rank": 1, "name": "string", "englishName": "string", "greekName": "string", "region": "string", "location": "string", "category": "string in ${langName}", "description": "string in ${langName}", "amenities": ["string in ${langName}"], "priceLevel": "€" | "€€" | "€€€", "insiderTip": "string in ${langName}", "rating": 4.9, "operatingStatus": "string in ${langName}", "openingHours": "string in ${langName}", "establishedYear": "string in ${langName}", "officialWebsite": "https://... or empty", "bookingUrl": "https://... or empty" }],
  "archaeologicalSites": [{ "id": "a-1", "rank": 1, "name": "string", "englishName": "string", "greekName": "string", "region": "string", "location": "string", "era": "string in ${langName}", "description": "string in ${langName}", "highlights": ["string in ${langName}"], "bestTimeToVisit": "string in ${langName}", "insiderTip": "string in ${langName}", "nearbyTavernaSuggestion": "string in ${langName}", "nearbyHotels": [{ "name": "string", "distance": "string in ${langName}", "note": "string in ${langName}" }], "nearbyRestaurants": [{ "name": "string", "type": "string in ${langName}", "distance": "string in ${langName}", "specialty": "string in ${langName}" }], "operatingStatus": "string in ${langName}", "openingHours": "string in ${langName}", "officialWebsite": "https://... or empty", "bookingUrl": "https://... or empty" }],
  "dishes": [{ "id": "d-1", "rank": 1, "name": "string in ${langName}", "englishName": "string", "greekName": "string", "pronunciation": "string", "description": "string in ${langName}", "ingredients": ["string"], "dietary": ["string"], "regionOfOrigin": "string in ${langName}", "pairingDrink": "string in ${langName}" }],
  "hiddenGems": [{ "id": "g-1", "rank": 1, "title": "string in ${langName}", "englishName": "string", "greekTitle": "string", "region": "string in ${langName}", "description": "string in ${langName}", "whyVisit": "string in ${langName}", "bestTimeToVisit": "string in ${langName}", "nearbyTavernaSuggestion": "string in ${langName}", "operatingStatus": "string in ${langName}", "openingHours": "string in ${langName}", "officialWebsite": "https://... or empty", "bookingUrl": "https://... or empty" }],
  "localPhrases": [{ "greek": "string", "phonetic": "string", "translation": "string in ${langName}", "meaning": "string in ${langName}" }]
}`;

      if (Date.now() >= searchGroundingCooldownUntil) {
        const groundedModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'].filter((m) => isModelAvailable(m));
        for (const gModel of groundedModels) {
          try {
            const groundedConfig: any = {
              tools: [{ googleSearch: {} }],
            };
            if (gModel === 'gemini-4-hydrogen') {
              groundedConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
            }
            const groundedResponse = await withPromiseTimeout(
              ai.models.generateContent({
                model: gModel,
                contents: searchPrompt,
                config: groundedConfig,
              }),
              11000,
              `search-grounding-${gModel}`
            );

            rawText = groundedResponse.text || '';

            // Extract real verified web sources from Google Search grounding metadata
            const chunks = groundedResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const seenUris = new Set<string>();
            for (const chunk of chunks as any[]) {
              const uri = chunk?.web?.uri;
              const title = chunk?.web?.title;
              if (uri && !seenUris.has(uri)) {
                seenUris.add(uri);
                groundingSources.push({
                  title: title || uri,
                  uri,
                });
              }
            }
            if (rawText.trim()) break;
          } catch (searchErr: any) {
            if (isQuotaError(searchErr)) {
              if (gModel === groundedModels[groundedModels.length - 1]) {
                searchGroundingCooldownUntil = Date.now() + 15 * 60 * 1000;
              }
              console.log(`Google Search grounding quota reached for ${gModel}.`);
            } else if (isTransientRetryableError(searchErr)) {
              searchGroundingCooldownUntil = Date.now() + 2 * 60 * 1000;
              console.log('Google Search grounding busy; using live web directory + AI.');
              break;
            }
          }
        }
      }

      const liveWebCtx = await liveWebContextPromise;
      liveOsmPool = [...liveWebCtx.liveDining, ...liveWebCtx.liveHotels, ...liveWebCtx.liveSites];
      if (groundingSources.length === 0 && liveWebCtx.liveSources.length > 0) {
        groundingSources.push(...liveWebCtx.liveSources.slice(0, 6));
      }

      if (rawText) {
        try {
          parsedData = extractAndParseJSON(rawText);
        } catch {
          if (Date.now() - recommendStartMs < 16000) {
            try {
              const structured = await callGeminiWithFallback(ai, {
                models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
                contents: `Convert the following real Google-Search grounded Greek culinary & travel research into valid JSON matching the schema. Keep every real place, dish, nearby hotel/restaurant around archaeological sites, and fact intact, and translate ALL descriptions, summaries, tips, highlights, and amenities into fluent ${langName}:\n\n${rawText}`,
                responseSchema: MATCHMAKER_RESPONSE_SCHEMA,
                maxPasses: 1,
                totalBudgetMs: 12000,
              });
              parsedData = extractAndParseJSON(structured.text);
            } catch (parseErr) {
              console.warn('Could not convert grounded prose cleanly; trying live directory + structured AI:', parseErr);
            }
          }
        }
      }

      if (!parsedData && Date.now() - recommendStartMs < 18000) {
        const directPrompt = `Today's live date is ${liveDateString}.
Generate a comprehensive, real-world Greek travel & culinary reference guide tailored directly to the user's exact selections:
- Selected Greek Region / City / Island: "${targetCity}"
- Preferred Food / Cuisine Type: "${targetFood}"
- Preferred Atmosphere / Vibe & Setting: "${targetAtmosphere}"
- Guide Focus Mode: "${targetFocus}"
- Additional Traveler Notes: "${prompt || 'None'}"
- Required Output Language: ${langName}

LIVE INTERNET DIRECTORY & GEOGRAPHY DATA VERIFIED RIGHT NOW:
${liveWebCtx.contextDigest || `Focus exclusively on verified currently open places in ${targetCity}, Greece.`}

CRITICAL RULES:
1. ${freshnessRule}
2. Tailor EVERY SINGLE recommendation specifically to "${targetCity}", "${targetAtmosphere}" vibe, "${targetFood}", and the live directory context above. Never return generic repeating answers across different searches.
3. RANKING ORDER IS MANDATORY: Order every list strictly from BEST (#1 highest-rated, top choice) downward to #2, #3, #4 (set "rank": 1, 2, 3, 4...).
4. Provide 4 real established or newly opened tavernas, bars & top restaurants in "${targetCity}" matching "${targetFood}" & "${targetAtmosphere}", 4 real hotels/resorts in "${targetCity}" matching "${targetAtmosphere}", 3 famous archaeological/ancient/historical sites in "${targetCity}" (each with 2 famous "nearbyHotels" and 2-3 famous "nearbyRestaurants" around that site), 3 matching Greek dishes, 2 hidden scenic gems in "${targetCity}", and 4 practical Greek phrases.
5. Always provide the accurate English/Latin name in "englishName", fill in "operatingStatus" (open & active in ${now.getFullYear()}), "openingHours", "establishedYear", AND provide real official/booking URLs from the live data or your verified knowledge in "officialWebsite" and "bookingUrl" (https://...) if known, or "" if unsure (never invent fake URLs).
6. Write ALL descriptive text (every description, summary, atmosphere, insiderTip, operatingStatus, openingHours, establishedYear, category, amenities, era, highlights, nearby notes, and translations) strictly in fluent ${langName} (ZERO English descriptions when ${langName} is not English), keeping Greek alphabet script in greekName/greekTitle/greek fields and English script ONLY in englishName.
7. Reference today's date (${liveDateString}) naturally in the summary.`;

        try {
          const directResult = await callGeminiWithFallback(ai, {
            models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
            contents: directPrompt,
            responseSchema: MATCHMAKER_RESPONSE_SCHEMA,
            maxPasses: 1,
            totalBudgetMs: Math.max(14000, 22000 - (Date.now() - recommendStartMs)),
            perAttemptTimeoutMs: 18000,
          });
          parsedData = extractAndParseJSON(directResult.text);
        } catch (modelErr: any) {
          console.warn('[RECOMMEND CASCADE FALLBACK]', modelErr?.message || modelErr);
        }
      }

      // If Gemini responded in English despite a non-English target (e.g. Arabic/Greek), auto-translate the whole result
      if (
        parsedData &&
        Array.isArray(parsedData.tavernas) &&
        parsedData.tavernas.length > 0 &&
        needsLanguageTranslation(parsedData, langName) &&
        Date.now() - recommendStartMs < 19000
      ) {
        try {
          const txResult = await callGeminiWithFallback(ai, {
            models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
            contents: `Translate ALL human-readable fields ("summary", "name", "title", "region", "location", "category", "era", "description", "signatureDishes", "atmosphere", "insiderTip", "operatingStatus", "openingHours", "establishedYear", "amenities", "highlights", "bestTimeToVisit", "nearbyTavernaSuggestion", "nearbyHotels", "nearbyRestaurants", "ingredients", "dietary", "regionOfOrigin", "pairingDrink", "whyVisit", "translation", "meaning") into fluent, natural ${langName}. Keep ALL JSON keys, "id", "rank", "rating", "priceLevel", "englishName", "greekName", "greekTitle", "greek", "phonetic", "officialWebsite", and "bookingUrl" intact:\n\n${JSON.stringify(parsedData)}`,
            maxPasses: 1,
            totalBudgetMs: 8000,
          });
          const txParsed = extractAndParseJSON(txResult.text);
          if (txParsed && Array.isArray(txParsed.tavernas) && txParsed.tavernas.length > 0) {
            parsedData = {
              ...parsedData,
              ...txParsed,
            };
          }
        } catch (txErr: any) {
          console.warn('[RECOMMEND LANGUAGE REPAIR SKIPPED]', txErr?.message || txErr);
        }
      }
    }

    // Emergency real-data Wikipedia + GeoSearch fallback whenever ALL Gemini free-tier models are exhausted
    if (!parsedData || !Array.isArray(parsedData.tavernas) || parsedData.tavernas.length === 0) {
      usedWikipediaFallback = true;
      const wikiResult = await buildLiveWikipediaGreeceFallback({
        city: targetCity,
        foodType: targetFood,
        langCode: String(language || 'en'),
        liveDateString,
        atmosphere: atmosphere === 'any' ? '' : targetAtmosphere,
      });
      if (Array.isArray(wikiResult.groundingSources) && wikiResult.groundingSources.length > 0) {
        groundingSources.push(...wikiResult.groundingSources);
      }
      if (Array.isArray((wikiResult as any).livePool) && liveOsmPool.length === 0) {
        liveOsmPool = (wikiResult as any).livePool;
      }
      const { livePool: _ignoredLivePool, ...cleanWikiResult } = wikiResult as any;
      parsedData = cleanWikiResult;
    }

    const sortByRankThenRating = (items: any[]) =>
      [...items].sort((a, b) => {
        const ra = typeof a.rank === 'number' ? a.rank : 999;
        const rb = typeof b.rank === 'number' ? b.rank : 999;
        if (ra !== rb) return ra - rb;
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      });

    const rawTavernas = sortByRankThenRating(parsedData.tavernas || []);
    const rawHotels = sortByRankThenRating(parsedData.hotels || []);
    const rawSites = sortByRankThenRating(parsedData.archaeologicalSites || []);
    const rawDishes = sortByRankThenRating(parsedData.dishes || []);
    const rawGems = sortByRankThenRating(parsedData.hiddenGems || []);

    // Resolve ONLY real, verified place-specific & live web photographs + coordinates concurrently
    const usedImageUrls = new Set<string>();
    const [tavernas, hotels, archaeologicalSites, dishes, hiddenGems] = await Promise.all([
      Promise.all(
        rawTavernas.map(async (t: any, idx: number) => {
          const officialWebsite = sanitizeHttpUrl(t.officialWebsite);
          const bookingUrl = sanitizeHttpUrl(t.bookingUrl);
          const existingCoords = isValidGreeceCoords(t.coordinates?.lat, t.coordinates?.lng)
            ? t.coordinates
            : undefined;
          const [imageUrl, coordinates] = await Promise.all([
            t.imageUrl && isCleanPhotoUrl(t.imageUrl)
              ? Promise.resolve(t.imageUrl)
              : resolveVerifiedPlaceImageWithBudget({
                  englishName: t.englishName,
                  name: t.name,
                  greekName: t.greekName,
                  region: targetCity,
                  officialWebsite,
                  bookingUrl,
                  groundingSources,
                  extraContext: 'taverna restaurant',
                  fallbackTopic: idx % 2 === 0 ? 'Greek taverna seafood restaurant' : 'Greek outdoor dining meze',
                  usedUrls: usedImageUrls,
                }),
            existingCoords
              ? Promise.resolve(existingCoords)
              : resolvePlaceCoordinatesWithBudget({
                  englishName: t.englishName,
                  name: t.name,
                  region: t.region || targetCity,
                  cityCoord: targetCityCoord,
                  livePool: liveOsmPool,
                }),
          ]);
          return {
            ...t,
            id: t.id || `t-${idx + 1}`,
            rank: idx + 1,
            priceLevel: t.priceLevel === '€' || t.priceLevel === '€€€' ? t.priceLevel : '€€',
            rating: typeof t.rating === 'number' ? t.rating : 4.8,
            officialWebsite,
            bookingUrl,
            imageUrl,
            coordinates,
          };
        })
      ),
      Promise.all(
        rawHotels.map(async (h: any, idx: number) => {
          const officialWebsite = sanitizeHttpUrl(h.officialWebsite);
          const bookingUrl = sanitizeHttpUrl(h.bookingUrl);
          const existingCoords = isValidGreeceCoords(h.coordinates?.lat, h.coordinates?.lng)
            ? h.coordinates
            : undefined;
          const [imageUrl, coordinates] = await Promise.all([
            h.imageUrl && isCleanPhotoUrl(h.imageUrl)
              ? Promise.resolve(h.imageUrl)
              : resolveVerifiedPlaceImageWithBudget({
                  englishName: h.englishName,
                  name: h.name,
                  greekName: h.greekName,
                  region: targetCity,
                  officialWebsite,
                  bookingUrl,
                  groundingSources,
                  extraContext: 'hotel',
                  fallbackTopic: idx % 2 === 0 ? 'boutique hotel sea view' : 'Greek resort terrace pool',
                  usedUrls: usedImageUrls,
                }),
            existingCoords
              ? Promise.resolve(existingCoords)
              : resolvePlaceCoordinatesWithBudget({
                  englishName: h.englishName,
                  name: h.name,
                  region: h.region || targetCity,
                  cityCoord: targetCityCoord,
                  livePool: liveOsmPool,
                }),
          ]);
          return {
            ...h,
            id: h.id || `h-${idx + 1}`,
            rank: idx + 1,
            priceLevel: h.priceLevel === '€' || h.priceLevel === '€€€' ? h.priceLevel : '€€',
            rating: typeof h.rating === 'number' ? h.rating : 4.7,
            officialWebsite,
            bookingUrl,
            imageUrl,
            coordinates,
          };
        })
      ),
      Promise.all(
        rawSites.map(async (a: any, idx: number) => {
          const officialWebsite = sanitizeHttpUrl(a.officialWebsite);
          const bookingUrl = sanitizeHttpUrl(a.bookingUrl);
          const existingCoords = isValidGreeceCoords(a.coordinates?.lat, a.coordinates?.lng)
            ? a.coordinates
            : undefined;
          const [imageUrl, coordinates] = await Promise.all([
            a.imageUrl && isCleanPhotoUrl(a.imageUrl)
              ? Promise.resolve(a.imageUrl)
              : resolveVerifiedPlaceImageWithBudget({
                  englishName: a.englishName,
                  name: a.name,
                  greekName: a.greekName,
                  region: targetCity,
                  officialWebsite,
                  bookingUrl,
                  groundingSources,
                  extraContext: 'archaeological site',
                  fallbackTopic: 'ancient Greek temple ruins monument',
                  usedUrls: usedImageUrls,
                }),
            existingCoords
              ? Promise.resolve(existingCoords)
              : resolvePlaceCoordinatesWithBudget({
                  englishName: a.englishName,
                  name: a.name,
                  region: a.region || targetCity,
                  cityCoord: targetCityCoord,
                  livePool: liveOsmPool,
                }),
          ]);
          return {
            ...a,
            id: a.id || `a-${idx + 1}`,
            rank: idx + 1,
            officialWebsite,
            bookingUrl,
            imageUrl,
            coordinates,
          };
        })
      ),
      Promise.all(
        rawDishes.map(async (d: any, idx: number) => {
          const imageUrl =
            d.imageUrl && isCleanPhotoUrl(d.imageUrl)
              ? d.imageUrl
              : await resolveVerifiedPlaceImageWithBudget({
                  englishName: d.englishName,
                  name: d.name,
                  greekName: d.greekName,
                  groundingSources,
                  extraContext: 'Greek dish food',
                  isDish: true,
                  usedUrls: usedImageUrls,
                });
          return {
            ...d,
            id: d.id || `d-${idx + 1}`,
            rank: idx + 1,
            imageUrl,
          };
        })
      ),
      Promise.all(
        rawGems.map(async (g: any, idx: number) => {
          const officialWebsite = sanitizeHttpUrl(g.officialWebsite);
          const bookingUrl = sanitizeHttpUrl(g.bookingUrl);
          const existingCoords = isValidGreeceCoords(g.coordinates?.lat, g.coordinates?.lng)
            ? g.coordinates
            : undefined;
          const [imageUrl, coordinates] = await Promise.all([
            g.imageUrl && isCleanPhotoUrl(g.imageUrl)
              ? Promise.resolve(g.imageUrl)
              : resolveVerifiedPlaceImageWithBudget({
                  englishName: g.englishName,
                  name: g.title,
                  greekName: g.greekTitle,
                  region: targetCity,
                  officialWebsite,
                  bookingUrl,
                  groundingSources,
                  fallbackTopic: 'Aegean sunset coastal bay scenic',
                  usedUrls: usedImageUrls,
                }),
            existingCoords
              ? Promise.resolve(existingCoords)
              : resolvePlaceCoordinatesWithBudget({
                  englishName: g.englishName,
                  name: g.title,
                  region: g.region || targetCity,
                  cityCoord: targetCityCoord,
                  livePool: liveOsmPool,
                }),
          ]);
          return {
            ...g,
            id: g.id || `g-${idx + 1}`,
            rank: idx + 1,
            officialWebsite,
            bookingUrl,
            imageUrl,
            coordinates,
          };
        })
      ),
    ]);

    const responsePayload = {
      ...parsedData,
      tavernas,
      hotels,
      archaeologicalSites,
      dishes,
      hiddenGems,
      guideCategory,
      groundingSources,
      searchedAt: now.toISOString(),
    };

    // Cache live AI answers for 60m; cache emergency fallback only briefly (60s) so live AI resumes immediately
    setInTtlCache(
      serverRecommendCache,
      recommendCacheKey,
      responsePayload,
      usedWikipediaFallback ? 60 * 1000 : 60 * 60 * 1000,
      80
    );

    return res.json(responsePayload);
  } catch (err: any) {
    console.error('[RECOMMEND ERROR]', err);
    return res.status(500).json({
      error: 'Live search could not be completed right now. Please try again shortly.',
    });
  }
});

// Universal Full-Page & Dynamic Search Result Translation Endpoint (does NOT consume search quota)
app.post('/api/translate', async (req: Request, res: Response) => {
  const { targetLanguage = 'English', mode = 'result', payload } = req.body || {};

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Valid translation payload is required.' });
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > 140000) {
    return res.status(413).json({ error: 'Translation payload exceeds allowed size.' });
  }

  const langName = resolveLanguageName(targetLanguage);
  const cacheKey = makeCacheKey({ mode, langName, serialized });
  const cached = getFromTtlCache(serverTranslateCache, cacheKey);
  if (cached) {
    return res.json({ translated: cached });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({ translated: payload, quotaLimited: true });
  }

  const ai = createServerGeminiClient(apiKey, 'v1beta', 22000);

  let rules = '';
  if (mode === 'ui') {
    rules = `Translate EVERY string value inside this UI localization JSON object into fluent, natural ${langName}.
- Keep ALL JSON object keys strictly identical to the input.
- Keep placeholder tokens like "{count}" and brand names ("AEGEA", "Sharif Hamad", "Google", "Google Maps", "GDPR") and email addresses intact.
- Keep currency numbers (€5, €50, €9.99, €49) intact.`;
  } else if (mode === 'curated') {
    rules = `Translate the descriptive text fields of every item in this Greek curated guide array into fluent, natural ${langName}.
- Keep EVERY JSON key, array order, and length strictly identical.
- DO NOT translate or alter: "id", "region", "dietary", "imageUrl", "greekName", "greekTitle", "pronunciation", "rating", "priceLevel", "coordinates", "officialWebsite".
- Translate: "name", "title", "location", "description", "signatureDishes", "atmosphere", "insiderTip", "ingredients", "regionOfOrigin", "pairingDrink", "whyVisit", "bestTimeToVisit", "nearbyTavernaSuggestion".`;
  } else if (mode === 'itinerary') {
    rules = `Translate EVERY human-readable field inside this 3-day travel itinerary JSON object into fluent, natural ${langName}.
- Keep ALL JSON keys and "dayNumber" values identical.`;
  } else {
    rules = `Translate EVERY human-readable text field in this Greece travel & culinary guide JSON object into fluent, natural ${langName} so there is zero untranslated leftover text from the previous language.
- Keep ALL JSON keys, array structures, and item ordering strictly identical.
- DO NOT alter or translate: "id", "rank", "rating", "priceLevel", "englishName", "greekName", "greekTitle", "greek", "phonetic", "officialWebsite", "bookingUrl", "imageUrl", "coordinates", "guideCategory", "searchedAt", "groundingSources".
- Translate thoroughly into ${langName}: "summary", "name", "title", "region", "location", "category", "era", "description", "signatureDishes", "atmosphere", "insiderTip", "operatingStatus", "openingHours", "establishedYear", "amenities", "highlights", "bestTimeToVisit", "nearbyTavernaSuggestion", "nearbyHotels" ("distance", "note"), "nearbyRestaurants" ("type", "distance", "specialty"), "ingredients", "dietary", "regionOfOrigin", "pairingDrink", "whyVisit", "translation", "meaning".`;
  }

  try {
    const isArrayPayload = Array.isArray(payload);
    const wrappedInput = isArrayPayload ? JSON.stringify({ items: payload }) : serialized;
    const result = await callGeminiWithFallback(ai, {
      models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
      contents: `${rules}\n\nRespond ONLY with valid JSON matching the exact shape of this input:\n${wrappedInput}`,
      maxPasses: 1,
      totalBudgetMs: 20000,
      perAttemptTimeoutMs: 18000,
    });

    const parsedRaw = extractAndParseJSON(result.text || '{}');
    const parsedTranslated = isArrayPayload
      ? Array.isArray(parsedRaw)
        ? parsedRaw
        : Array.isArray(parsedRaw?.items)
        ? parsedRaw.items
        : null
      : parsedRaw;

    if (!parsedTranslated) {
      return res.json({ translated: payload, quotaLimited: true });
    }

    // Re-merge immutable non-translatable fields on search results so URLs, photos & rankings stay exact
    if (mode === 'result' && !isArrayPayload) {
      const mergeCollection = (origArr: any[] = [], txArr: any[] = []) =>
        origArr.map((orig, idx) => {
          const tx = txArr[idx] || {};
          return {
            ...orig,
            ...tx,
            id: orig.id,
            rank: orig.rank,
            rating: orig.rating,
            priceLevel: orig.priceLevel,
            englishName: orig.englishName,
            greekName: orig.greekName ?? tx.greekName,
            greekTitle: orig.greekTitle ?? tx.greekTitle,
            officialWebsite: orig.officialWebsite ?? '',
            bookingUrl: orig.bookingUrl ?? '',
            imageUrl: orig.imageUrl ?? '',
            coordinates: orig.coordinates,
          };
        });

      const mergedResult = {
        ...payload,
        ...parsedTranslated,
        guideCategory: payload.guideCategory,
        groundingSources: payload.groundingSources,
        searchedAt: payload.searchedAt,
        tavernas: mergeCollection(payload.tavernas, parsedTranslated.tavernas),
        hotels: mergeCollection(payload.hotels, parsedTranslated.hotels),
        archaeologicalSites: mergeCollection(payload.archaeologicalSites, parsedTranslated.archaeologicalSites),
        dishes: mergeCollection(payload.dishes, parsedTranslated.dishes),
        hiddenGems: mergeCollection(payload.hiddenGems, parsedTranslated.hiddenGems),
        localPhrases: (payload.localPhrases || []).map((origP: any, idx: number) => ({
          ...origP,
          ...(parsedTranslated.localPhrases?.[idx] || {}),
          greek: origP.greek,
          phonetic: origP.phonetic,
        })),
      };
      if (needsLanguageTranslation(mergedResult, langName)) {
        return res.json({ translated: payload, quotaLimited: true });
      }
      setInTtlCache(serverTranslateCache, cacheKey, mergedResult, 24 * 60 * 60 * 1000, 300);
      return res.json({ translated: mergedResult });
    }

    if (mode === 'curated' && isArrayPayload && Array.isArray(parsedTranslated)) {
      const mergedArray = payload.map((orig: any, idx: number) => ({
        ...orig,
        ...(parsedTranslated[idx] || {}),
        id: orig.id,
        region: orig.region,
        dietary: orig.dietary,
        imageUrl: orig.imageUrl,
        greekName: orig.greekName,
        greekTitle: orig.greekTitle,
        pronunciation: orig.pronunciation,
        rating: orig.rating,
        priceLevel: orig.priceLevel,
        coordinates: orig.coordinates,
      }));
      setInTtlCache(serverTranslateCache, cacheKey, mergedArray, 24 * 60 * 60 * 1000, 300);
      return res.json({ translated: mergedArray });
    }

    setInTtlCache(serverTranslateCache, cacheKey, parsedTranslated, 24 * 60 * 60 * 1000, 300);
    return res.json({ translated: parsedTranslated });
  } catch (err: any) {
    console.warn('[TRANSLATE FALLBACK]', err?.message || err);
    // Graceful degradation instead of HTTP 502 error toast during free-tier quota spikes
    return res.json({ translated: payload, quotaLimited: true });
  }
});

// VIP 3-Day Greece Itinerary Generator Endpoint
app.post('/api/itinerary', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!idToken) {
    return res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
  }

  const verifiedUser = await verifyFirebaseIdToken(idToken);
  if (!verifiedUser || !verifiedUser.emailVerified) {
    return res.status(401).json({ error: 'Invalid or unverified Google session.' });
  }

  const { city = 'Athens', foodType = 'Traditional Greek Cuisine', language = 'en', guideResult } = req.body || {};
  if (!guideResult) {
    return res.status(400).json({ error: 'Search results are required to generate a 3-day itinerary.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const langName = resolveLanguageName(language);

  if (apiKey) {
    const ai = createServerGeminiClient(apiKey, 'v1beta', 22000);

    const condensedContext = {
      tavernas: (guideResult.tavernas || []).slice(0, 4).map((x: any) => `${x.name} (${x.location})`),
      hotels: (guideResult.hotels || []).slice(0, 4).map((x: any) => `${x.name} (${x.priceLevel})`),
      sites: (guideResult.archaeologicalSites || []).slice(0, 3).map((x: any) => `${x.name} (${x.bestTimeToVisit})`),
      gems: (guideResult.hiddenGems || []).slice(0, 2).map((x: any) => x.title),
      dishes: (guideResult.dishes || []).slice(0, 3).map((x: any) => x.name),
    };

    try {
      const prompt = `Create a cohesive, practical 3-Day VIP Travel, Culinary & Archaeological Itinerary for "${city}" tailored to "${foodType}".
Use the verified top-ranked places from these search results:
${JSON.stringify(condensedContext)}

Requirements:
- Write EVERY single text field in fluent, natural ${langName}.
- Organize Day 1, Day 2, and Day 3 with logical geographical flow, specific recommended dishes at the named tavernas, realistic timing for archaeological visits, sunset hidden gems, evening hotel stay context, and realistic Euro (€) daily budget estimates.`;

      const result = await callGeminiWithFallback(ai, {
        models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
        contents: prompt,
        responseSchema: ITINERARY_RESPONSE_SCHEMA,
        maxPasses: 1,
        totalBudgetMs: 18000,
        perAttemptTimeoutMs: 16000,
      });

      const itinerary = extractAndParseJSON(result.text || '{}');
      return res.json({ itinerary });
    } catch (err: any) {
      console.log('[ITINERARY FALLBACK]', err?.message || err);
    }
  }

  // Deterministic itinerary fallback structured cleanly from the active search results
  const fallbackItinerary = buildDeterministicItinerary({
    city,
    foodType,
    langCode: String(language || 'en'),
    guideResult,
  });
  return res.json({ itinerary: fallbackItinerary, quotaFallback: true });
});

// B2B Partner Inquiry Endpoint
app.post('/api/partner-inquiry', (req: Request, res: Response) => {
  const { businessName, businessType, city, contactEmail } = req.body || {};
  if (!businessName || !city || !contactEmail) {
    return res.status(400).json({ error: 'Business name, city, and contact email are required.' });
  }
  console.log(`Partner listing inquiry (€49/mo): ${businessName} (${businessType}) in ${city} — ${contactEmail}`);
  return res.json({ success: true });
});

// Contact endpoint
app.post('/api/contact', (req: Request, res: Response) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  console.log(`Received contact message for Sharif Hamad from ${name} (${email}): ${message}`);
  return res.json({
    success: true,
    message: 'Your message has been received by Sharif Hamad (sharifhamadmoko@gmail.com). We will get back to you soon!',
  });
});

// ============================================================================
// Live Visitor Translator: Gemini Vision (Menus & Signs), Voice & Neural TTS
// ============================================================================
const serverTtsCache = new Map<string, CacheEntry<string>>();

const VISION_TRANSLATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedCategory: {
      type: Type.STRING,
      description: "One of: 'menu', 'sign', 'receipt', 'general'",
    },
    detectedLanguage: { type: Type.STRING },
    headline: { type: Type.STRING },
    summaryTranslation: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          originalText: { type: Type.STRING },
          phoneticGreek: { type: Type.STRING },
          translatedText: { type: Type.STRING },
          priceOrDetail: { type: Type.STRING },
          dietaryOrWarning: { type: Type.STRING },
        },
        required: ['originalText', 'phoneticGreek', 'translatedText', 'priceOrDetail', 'dietaryOrWarning'],
      },
    },
    replyPhraseGreek: { type: Type.STRING },
    replyPhrasePhonetic: { type: Type.STRING },
    replyPhraseTranslation: { type: Type.STRING },
  },
  required: [
    'detectedCategory',
    'detectedLanguage',
    'headline',
    'summaryTranslation',
    'items',
    'replyPhraseGreek',
    'replyPhrasePhonetic',
    'replyPhraseTranslation',
  ],
};

const VOICE_TRANSLATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING },
    detectedSourceLanguage: { type: Type.STRING },
    translatedText: { type: Type.STRING },
    greekPhonetic: { type: Type.STRING },
    culturalTip: { type: Type.STRING },
  },
  required: ['transcript', 'detectedSourceLanguage', 'translatedText', 'greekPhonetic', 'culturalTip'],
};

const ALLOWED_TTS_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);

function createServerGeminiClient(apiKey: string, apiVersion: string = 'v1beta', timeoutMs = 22000) {
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. Live Camera Vision Translator for Greek Menus, Street Signs & Notices
app.post('/api/vision-translate', async (req: Request, res: Response) => {
  const { imageBase64, mimeType = 'image/jpeg', targetLanguage = 'en', mode = 'auto' } = req.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'A camera frame or image is required.' });
  }

  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!cleanBase64 || cleanBase64.length > 14 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image payload is invalid or too large (max 10MB).' });
  }

  const safeMime = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(String(mimeType))
    ? String(mimeType).toLowerCase() === 'image/jpg'
      ? 'image/jpeg'
      : String(mimeType).toLowerCase()
    : 'image/jpeg';

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
  }

  const targetLangName = resolveLanguageName(targetLanguage);
  const modeHint =
    mode === 'menu'
      ? 'Focus on extracting restaurant menu items, dish descriptions, traditional Greek ingredients, prices (€), and clear dietary/allergen notes (especially Pork vs Halal-friendly, Seafood, Vegetarian, Vegan, Gluten, Dairy/Nuts).'
      : mode === 'sign'
      ? 'Focus on translating street signs, port/ferry departure boards, museum/site hours, traffic/parking notices, and practical directions clearly.'
      : 'Automatically detect whether this is a Greek restaurant menu, street/ferry/museum sign, receipt, or general text and extract the most helpful structured translation.';

  const ai = createServerGeminiClient(apiKey);
  const prompt = `You are a real-time bilingual visual interpreter for visitors in Greece.
Analyze this image and translate all visible text into natural, fluent ${targetLangName}.
${modeHint}

RULES:
- ONLY extract text and items that are ACTUALLY visibly printed or handwritten inside the image. NEVER invent, guess, or fabricate dishes, prices, or signs if the photo is blank, dark, blurry, or contains no readable text.
- Write "headline", "summaryTranslation", "translatedText", "priceOrDetail", "dietaryOrWarning", and "replyPhraseTranslation" in fluent ${targetLangName}.
- In "originalText", preserve the exact original text visible in the photo (especially Greek script).
- In "phoneticGreek", provide easy Latin phonetic pronunciation whenever the original text contains Greek; otherwise leave "".
- Extract up to 14 key menu items, sign lines, or sections clearly.
- In "replyPhraseGreek", provide one polite, natural Greek sentence the tourist can say or play aloud in this situation (e.g., ordering a dish, asking if it has pork, asking about ferry gate or ticket price), along with "replyPhrasePhonetic" and "replyPhraseTranslation" in ${targetLangName}.
- If no readable text is visible in the image, state clearly in "summaryTranslation" that no readable text was detected, set "replyPhraseGreek" to "", and return an empty "items" array.`;

  const imagePart = {
    inlineData: {
      mimeType: safeMime,
      data: cleanBase64,
    },
  };

  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'].filter((m) => isModelAvailable(m));
  if (modelsToTry.length === 0) {
    return res.status(429).json({ error: 'AI models are temporarily cooling down after quota limits. Please retry shortly.' });
  }

  let lastErr: any = null;
  for (const model of modelsToTry) {
    try {
      const config: any = {
        responseMimeType: 'application/json',
        responseSchema: VISION_TRANSLATE_SCHEMA,
        thinkingConfig: {
          thinkingLevel: model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
        },
      };

      const response = await ai.models.generateContent({
        model,
        contents: { parts: [imagePart, { text: prompt }] },
        config,
      });

      const parsed = extractAndParseJSON(response.text || '{}');
      return res.json({
        result: {
          detectedCategory: parsed.detectedCategory || mode || 'general',
          detectedLanguage: parsed.detectedLanguage || 'Greek',
          headline: parsed.headline || '',
          summaryTranslation: parsed.summaryTranslation || '',
          items: Array.isArray(parsed.items) ? parsed.items : [],
          replyPhraseGreek: parsed.replyPhraseGreek || '',
          replyPhrasePhonetic: parsed.replyPhrasePhonetic || '',
          replyPhraseTranslation: parsed.replyPhraseTranslation || '',
        },
        modelUsed: model,
      });
    } catch (err: any) {
      lastErr = err;
      if (isQuotaError(err)) {
        markModelQuotaExhausted(model);
        continue;
      }
      console.warn(`[VISION TRANSLATE ERROR] ${model}:`, err?.message || err);
    }
  }

  const statusCode = isQuotaError(lastErr) ? 429 : 500;
  return res.status(statusCode).json({
    error: formatGeminiErrorMessage(
      lastErr,
      'Vision translation failed. Please check image clarity and try again.'
    ),
  });
});

// 2. Real-Time Two-Way Voice Transcription + Translation
app.post('/api/voice-translate', async (req: Request, res: Response) => {
  const {
    audioBase64,
    mimeType = 'audio/webm',
    text,
    sourceLanguage = 'auto',
    targetLanguage = 'el',
    uiLanguage = 'en',
  } = req.body || {};

  if ((!audioBase64 || typeof audioBase64 !== 'string') && (!text || typeof text !== 'string' || !text.trim())) {
    return res.status(400).json({ error: 'Audio recording or text is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
  }

  const ai = createServerGeminiClient(apiKey, 'v1beta', 12000);
  const sourceLangName =
    sourceLanguage === 'auto' ? 'the spoken language (auto-detect)' : resolveLanguageName(sourceLanguage);
  const targetLangName = resolveLanguageName(targetLanguage);
  const uiLangName = resolveLanguageName(uiLanguage);

  let rawTranscript = typeof text === 'string' ? text.trim() : '';

  // Step A: Audio transcription + translation via v1beta (single-pass gemini-3.1-flash-lite ~1.8s, with gemini-3.5-transcribe fallback ~2.2s)
  if (audioBase64 && typeof audioBase64 === 'string') {
    const cleanAudio = audioBase64.replace(/^data:[^,]*;base64,/, '').trim();
    if (!cleanAudio || cleanAudio.length > 14 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio clip is empty or exceeds maximum length.' });
    }

    const baseAudioMime = String(mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
    const safeAudioMime = /^audio\/(webm|mp4|mpeg|mp3|wav|ogg|aac|flac|x-m4a)$/i.test(baseAudioMime)
      ? baseAudioMime === 'audio/x-m4a'
        ? 'audio/mp4'
        : baseAudioMime
      : 'audio/webm';

    const audioPart = {
      inlineData: {
        mimeType: safeAudioMime,
        data: cleanAudio,
      },
    };

    const audioModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'].filter((m) => isModelAvailable(m));
    let audioErr: any = null;

    // 1. Fast single-pass audio transcription + translation
    if (isModelAvailable('gemini-3.1-flash-lite')) {
      try {
        const directAudioResp = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: {
            parts: [
              audioPart,
              {
                text: `Listen carefully to this spoken audio (expected language: ${sourceLangName}).
1. Transcribe ONLY actual intelligible spoken words faithfully in "transcript" in its original script. NEVER invent, guess, or fabricate words if only noise, tones, or silence are present.
2. Identify the spoken language in "detectedSourceLanguage" (e.g. "Arabic", "English", "Greek").
3. Translate the actual spoken words naturally and politely into ${targetLangName} in "translatedText".
4. If either language is Greek, write easy Latin phonetic pronunciation of the Greek phrase in "greekPhonetic" (otherwise "").
5. Include a very short 1-sentence politeness/travel tip in ${uiLangName} inside "culturalTip" if helpful (or "").
CRITICAL: If no clear human speech is heard, set "transcript" to "" and "translatedText" to "".`,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: VOICE_TRANSLATE_SCHEMA,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MINIMAL,
            },
          },
        });

        const parsedDirect = extractAndParseJSON(directAudioResp.text || '{}');
        if (!parsedDirect.transcript?.trim()) {
          return res.status(400).json({
            error: 'No clear speech was detected. Please speak closer to the microphone and try again.',
          });
        }
        return res.json({
          result: {
            transcript: parsedDirect.transcript.trim(),
            detectedSourceLanguage: parsedDirect.detectedSourceLanguage || sourceLangName,
            translatedText: parsedDirect.translatedText || '',
            greekPhonetic: parsedDirect.greekPhonetic || '',
            culturalTip: parsedDirect.culturalTip || '',
          },
        });
      } catch (err: any) {
        audioErr = err;
        if (isQuotaError(err)) {
          markModelQuotaExhausted('gemini-3.1-flash-lite');
        }
        console.warn('[VOICE AUDIO SINGLE-PASS WARN] gemini-3.1-flash-lite:', err?.message || err);
      }
    }

    // 2. Fallback step: dedicated gemini-3.5-transcribe on v1beta -> then Step B text translation
    if (isModelAvailable('gemini-3.5-transcribe')) {
      try {
        const txResp = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              audioPart,
              {
                text: `Transcribe ONLY clear spoken human words in this audio (expected language: ${sourceLangName}) in its original script. Return ONLY the verbatim spoken text, or an empty string if there is only noise or silence.`,
              },
            ],
          },
        });
        rawTranscript = String(txResp.text || '').trim();
        if (!rawTranscript) {
          return res.status(400).json({
            error: 'No clear speech was detected. Please speak closer to the microphone and try again.',
          });
        }
      } catch (err: any) {
        audioErr = err;
        if (isQuotaError(err)) {
          markModelQuotaExhausted('gemini-3.5-transcribe');
        }
        console.warn('[VOICE TRANSCRIBE FALLBACK WARN] gemini-3.5-transcribe:', err?.message || err);
      }
    }

    // 3. Final fallback: try remaining multimodal model if transcript is still empty
    if (!rawTranscript && audioModels.includes('gemini-4-hydrogen')) {
      try {
        const directAudioResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              audioPart,
              {
                text: `Listen carefully to this spoken audio (expected language: ${sourceLangName}). Transcribe spoken words in "transcript", detect language in "detectedSourceLanguage", translate into ${targetLangName} in "translatedText", add Latin phonetic if Greek in "greekPhonetic", and short travel tip in ${uiLangName} in "culturalTip". If no clear speech, return empty strings.`,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: VOICE_TRANSLATE_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        const parsedDirect = extractAndParseJSON(directAudioResp.text || '{}');
        if (!parsedDirect.transcript?.trim()) {
          return res.status(400).json({
            error: 'No clear speech was detected. Please speak closer to the microphone and try again.',
          });
        }
        return res.json({
          result: {
            transcript: parsedDirect.transcript.trim(),
            detectedSourceLanguage: parsedDirect.detectedSourceLanguage || sourceLangName,
            translatedText: parsedDirect.translatedText || '',
            greekPhonetic: parsedDirect.greekPhonetic || '',
            culturalTip: parsedDirect.culturalTip || '',
          },
        });
      } catch (err: any) {
        audioErr = err;
        if (isQuotaError(err)) markModelQuotaExhausted('gemini-4-hydrogen');
      }
    }

    if (!rawTranscript) {
      return res.status(isQuotaError(audioErr) ? 429 : 500).json({
        error: formatGeminiErrorMessage(audioErr, 'Could not process audio translation. Please try again.'),
      });
    }
  }

  // Step B: Translate typed (or transcribed) input into target language
  try {
    const translationResult = await callGeminiWithFallback(ai, {
      models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
      contents: `You are a real-time conversational interpreter for travelers and locals in Greece.
Source input (${sourceLangName}):
"${rawTranscript}"

Requirements:
- Keep "transcript" equal to the cleaned spoken/typed phrase in its original language.
- Set "detectedSourceLanguage" cleanly (e.g. "Arabic", "English", "Greek").
- Translate naturally and politely into ${targetLangName} inside "translatedText".
- If ${targetLangName} is Greek, provide simple Latin phonetic pronunciation in "greekPhonetic"; if translating FROM Greek to another language, put phonetic pronunciation of the Greek phrase in "greekPhonetic"; otherwise "".
- Provide a brief helpful hospitality/context note in ${uiLangName} inside "culturalTip" if useful, otherwise "".`,
      responseSchema: VOICE_TRANSLATE_SCHEMA,
    });

    const parsed = extractAndParseJSON(translationResult.text || '{}');
    return res.json({
      result: {
        transcript: parsed.transcript || rawTranscript,
        detectedSourceLanguage: parsed.detectedSourceLanguage || sourceLangName,
        translatedText: parsed.translatedText || '',
        greekPhonetic: parsed.greekPhonetic || '',
        culturalTip: parsed.culturalTip || '',
      },
    });
  } catch (err: any) {
    return res.status(isQuotaError(err) ? 429 : 500).json({
      error: formatGeminiErrorMessage(err, 'Translation failed. Please try again.'),
    });
  }
});

function ensureWavBase64(base64Data: string, mimeType?: string): string {
  const buf = Buffer.from(base64Data, 'base64');
  // Already a valid WAV RIFF container
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    return base64Data;
  }
  // If raw PCM (audio/L16 or audio/pcm), wrap standard 24kHz mono 16-bit WAV header
  if (!mimeType || /pcm|l16/i.test(mimeType)) {
    const rateMatch = mimeType?.match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = buf.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, buf]).toString('base64');
  }
  return base64Data;
}

// 3. Gemini 3.8 Neural Text-to-Speech (returns WAV audio/wav base64)
app.post('/api/tts', async (req: Request, res: Response) => {
  const { text, language = 'el', voiceName = 'Kore' } = req.body || {};

  const cleanText = String(text || '').trim().slice(0, 1200);
  if (!cleanText) {
    return res.status(400).json({ error: 'Text is required for speech synthesis.' });
  }

  const safeVoice = ALLOWED_TTS_VOICES.has(String(voiceName)) ? String(voiceName) : 'Kore';
  const langName = resolveLanguageName(language);
  const ttsCacheKey = makeCacheKey({ cleanText, langName, safeVoice });

  const cachedAudio = getFromTtlCache(serverTtsCache, ttsCacheKey);
  if (cachedAudio) {
    return res.json({ audioBase64: cachedAudio, mimeType: 'audio/wav' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
  }

  const aiDefault = createServerGeminiClient(apiKey);
  const aiBeta = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const ttsModels = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'].filter((m) => isModelAvailable(m));
  if (ttsModels.length === 0) {
    return res.status(429).json({ error: 'Voice synthesis quota temporarily reached. Please retry shortly.' });
  }

  let lastErr: any = null;
  for (const model of ttsModels) {
    const attempts: { client: GoogleGenAI; config: any }[] = [
      {
        client: aiBeta,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      },
      {
        client: aiDefault,
        config: {
          responseModalities: ['AUDIO'],
        },
      },
    ];

    for (const attempt of attempts) {
      try {
        const response = await attempt.client.models.generateContent({
          model,
          contents: cleanText,
          config: attempt.config,
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        const rawAudio = part?.inlineData?.data;
        const rawMime = part?.inlineData?.mimeType;
        if (!rawAudio) {
          throw new Error(`No audio returned from ${model}`);
        }

        const wavBase64 = ensureWavBase64(rawAudio, rawMime);
        setInTtlCache(serverTtsCache, ttsCacheKey, wavBase64, 2 * 60 * 60 * 1000, 80);
        return res.json({ audioBase64: wavBase64, mimeType: 'audio/wav', modelUsed: model });
      } catch (err: any) {
        lastErr = err;
        if (isQuotaError(err)) {
          markModelQuotaExhausted(model);
          break;
        }
        const msg = String(err?.message || '');
        if (/Unknown name/i.test(msg)) {
          continue;
        }
        console.warn(`[TTS ERROR] ${model}:`, msg || err);
      }
    }
  }

  return res.status(isQuotaError(lastErr) ? 429 : 500).json({
    error: lastErr?.message || 'Speech synthesis unavailable right now.',
  });
});

// Live Greek Destination Weather, Marine Wind, Sunrise/Sunset & Official Tickets/Ferries
const ISLAND_OR_COASTAL_DESTINATIONS = new Set([
  'Athens', 'Thessaloniki', 'Chalkidiki', 'Santorini', 'Mykonos', 'Naxos', 'Paros', 'Milos', 'Syros',
  'Rhodes', 'Kos', 'Chania, Crete', 'Heraklion, Crete', 'Rethymno, Crete', 'Agios Nikolaos, Crete',
  'Corfu', 'Zakynthos', 'Kefalonia', 'Lefkada', 'Nafplio', 'Kalamata & Mani', 'Monemvasia',
  'Evia & Chalkida', 'Volos & Pelion', 'Skiathos & Sporades', 'Parga & Syvota', 'Patras & Achaea',
  'Kavala & Thassos', 'Alexandroupoli & Thrace', 'Lesvos, Chios & Samos',
]);

app.get('/api/city-live', async (req: Request, res: Response) => {
  const qLat = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
  const qLng = req.query.lng !== undefined ? Number(req.query.lng) : NaN;
  const hasGpsCoords =
    Number.isFinite(qLat) &&
    Number.isFinite(qLng) &&
    qLat >= -90 &&
    qLat <= 90 &&
    qLng >= -180 &&
    qLng <= 180;

  const rawCity = String(req.query.city || 'Athens').trim() || 'Athens';
  const cacheKey = hasGpsCoords ? `gps:${qLat.toFixed(2)},${qLng.toFixed(2)}` : rawCity.toLowerCase();
  const cached = getFromTtlCache(serverCityLiveCache, cacheKey);
  if (cached) {
    return res.json(cached);
  }

  let matchedKey = '';
  let lat = qLat;
  let lng = qLng;
  let displayCity = rawCity;

  if (hasGpsCoords) {
    try {
      const revRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${qLat}&lon=${qLng}&format=json`,
        {
          signal: AbortSignal.timeout(1800),
          headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
        }
      );
      if (revRes.ok) {
        const revData: any = await revRes.json();
        const addr = revData?.address || {};
        displayCity = String(addr.city || addr.town || addr.village || addr.municipality || addr.state || '').trim() || `${qLat.toFixed(2)}, ${qLng.toFixed(2)}`;
      } else {
        displayCity = `${qLat.toFixed(2)}, ${qLng.toFixed(2)}`;
      }
    } catch {
      displayCity = `${qLat.toFixed(2)}, ${qLng.toFixed(2)}`;
    }
  } else {
    matchedKey = GREEK_CITY_COORDS[rawCity]
      ? rawCity
      : Object.keys(GREEK_CITY_COORDS).find((k) => k.toLowerCase() === rawCity.toLowerCase()) || '';

    lat = matchedKey ? GREEK_CITY_COORDS[matchedKey].lat : 0;
    lng = matchedKey ? GREEK_CITY_COORDS[matchedKey].lon : 0;

    if (!matchedKey) {
      const osmHits = await fetchPhotonLivePlaces(`${rawCity} Greece`, undefined, undefined, 2);
      const validHit = osmHits.find((v) => isValidGreeceCoords(v.lat, v.lng));
      if (validHit && validHit.lat && validHit.lng) {
        lat = validHit.lat;
        lng = validHit.lng;
      } else {
        matchedKey = 'Athens';
        lat = GREEK_CITY_COORDS.Athens.lat;
        lng = GREEK_CITY_COORDS.Athens.lon;
      }
    }
  }

  try {
    const tz = hasGpsCoords ? 'auto' : 'Europe%2FAthens';
    const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=${tz}&forecast_days=1`;
    const wRes = await fetch(meteoUrl, {
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!wRes.ok) {
      throw new Error(`Open-Meteo returned ${wRes.status}`);
    }
    const wData: any = await wRes.json();
    const cur = wData?.current || {};
    const daily = wData?.daily || {};

    const isIslandOrCoast =
      ISLAND_OR_COASTAL_DESTINATIONS.has(matchedKey) ||
      /island|coast|beach|bay|crete|santorini|mykonos|rhodes|corfu|paros|naxos|milos|kos|hydra|aegina|zakynthos|kefalonia|lefkada|skiathos|lesvos|chios|samos|thassos|جزيرة|ساحل/i.test(
        displayCity
      );

    const payload = {
      city: displayCity,
      lat,
      lng,
      temperatureC: Math.round(Number(cur.temperature_2m ?? 22)),
      feelsLikeC: Math.round(Number(cur.apparent_temperature ?? cur.temperature_2m ?? 22)),
      windKmh: Math.round(Number(cur.wind_speed_10m ?? 12)),
      weatherCode: Number(cur.weather_code ?? 0),
      tempMaxC: Math.round(Number(daily.temperature_2m_max?.[0] ?? 25)),
      tempMinC: Math.round(Number(daily.temperature_2m_min?.[0] ?? 16)),
      sunrise: String(daily.sunrise?.[0] || ''),
      sunset: String(daily.sunset?.[0] || ''),
      uvIndexMax: Math.round(Number(daily.uv_index_max?.[0] ?? 5)),
      isIslandOrCoast,
      ferryUrl: 'https://www.ferryhopper.com/en/',
      officialTicketsUrl: 'https://hhticket.gr/',
      fetchedAt: new Date().toISOString(),
    };

    setInTtlCache(serverCityLiveCache, cacheKey, payload, 15 * 60 * 1000, 100);
    return res.json(payload);
  } catch (err: any) {
    console.warn('[CITY-LIVE WEATHER]', err?.message || err);
    return res.status(503).json({ error: 'Live weather temporarily unavailable.' });
  }
});

// Mobile APK Authorized-Domain Google Sign-In Bridge (Chrome Custom Tab -> com.aegea.smartguide://auth)
app.get('/api/mobile-auth/status', (_req: Request, res: Response) => {
  res.json({
    ready: Boolean(firebaseClientConfig?.apiKey && firebaseClientConfig?.authDomain),
    scheme: 'com.aegea.smartguide',
  });
});

app.get('/mobile-auth', (req: Request, res: Response) => {
  if (!firebaseClientConfig?.apiKey) {
    return res.status(500).send('Firebase configuration unavailable.');
  }
  const lang = String(req.query.lang || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
  const isAr = lang === 'ar';
  const safeCfgJson = JSON.stringify(firebaseClientConfig).replace(/</g, '\\u003c');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(`<!doctype html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
  <title>AEGEA — ${isAr ? 'تسجيل الدخول عبر Google' : 'Google Sign-In'}</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif}
    .card{width:100%;max-width:400px;background:#1e293b;border:1px solid #334155;border-radius:18px;padding:28px;text-align:center;box-shadow:0 20px 45px rgba(0,0,0,.4)}
    .brand{font-size:22px;font-weight:800;letter-spacing:.04em;color:#38bdf8;margin:0 0 6px}
    .sub{font-size:13px;color:#cbd5e1;margin:0 0 22px;line-height:1.55}
    .btn{width:100%;padding:14px 18px;border:0;border-radius:12px;background:#0284c7;color:#fff;font-size:15px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:10px;text-decoration:none;box-sizing:border-box}
    .btn:disabled{opacity:.6}
    .btn-return{background:#059669;margin-top:14px;display:none}
    .msg{margin-top:16px;font-size:13px;color:#cbd5e1;line-height:1.5;word-break:break-word}
    .err{color:#fda4af}
  </style>
</head>
<body>
  <div class="card">
    <h1 class="brand">AEGEA</h1>
    <p class="sub">${isAr ? 'تسجيل الدخول الآمن عبر Google لحسابك في تطبيق AEGEA، ثم العودة للتطبيق تلقائياً.' : 'Sign in securely with Google to continue inside the AEGEA Android app.'}</p>
    <button id="loginBtn" class="btn" type="button">
      <span>${isAr ? 'المتابعة باستخدام Google' : 'Continue with Google'}</span>
    </button>
    <a id="returnLink" class="btn btn-return" href="#">${isAr ? 'العودة إلى تطبيق AEGEA' : 'Return to AEGEA App'}</a>
    <p id="statusMsg" class="msg"></p>
  </div>
  <script type="module">
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
    import { getAuth, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

    const firebaseConfig = ${safeCfgJson};
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const btn = document.getElementById('loginBtn');
    const returnLink = document.getElementById('returnLink');
    const statusMsg = document.getElementById('statusMsg');

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      statusMsg.className = 'msg';
      statusMsg.textContent = ${JSON.stringify(isAr ? 'جاري فتح نافذة Google...' : 'Opening Google Sign-In...')};
      try {
        const result = await signInWithPopup(auth, provider);
        const cred = GoogleAuthProvider.credentialFromResult(result);
        const idToken = cred?.idToken || '';
        const accessToken = cred?.accessToken || '';
        if (!idToken && !accessToken) {
          throw new Error(${JSON.stringify(isAr ? 'لم يتم استلام رمز التحقق من Google.' : 'Missing Google OAuth credential.')});
        }
        const deepLink = 'com.aegea.smartguide://auth?idToken=' + encodeURIComponent(idToken) + '&accessToken=' + encodeURIComponent(accessToken);
        returnLink.href = deepLink;
        returnLink.style.display = 'inline-flex';
        statusMsg.textContent = ${JSON.stringify(isAr ? 'تم التحقق بنجاح! جاري الرجوع للتطبيق...' : 'Signed in! Returning to AEGEA...')};
        window.location.replace(deepLink);
      } catch (err) {
        btn.disabled = false;
        statusMsg.className = 'msg err';
        statusMsg.textContent = err?.message || ${JSON.stringify(isAr ? 'تعذر إتمام تسجيل الدخول.' : 'Could not complete sign-in.')};
      }
    });
  </script>
</body>
</html>`);
});

// Always return JSON for unknown /api/* routes or unhandled API errors (never HTML)
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    console.error('[API ERROR]', err);
    return res.status(err?.status || 500).json({ error: err?.message || 'Internal server error.' });
  }
  return next(err);
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    // Vite 8 still calls transport.connect(...) inside /@vite/client even with hmr: false / ws: false.
    // Disable that WebSocket connection in dev preview so the iframe never logs WebSocket closed errors.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || (req.path !== '/@vite/client' && !req.url.startsWith('/@vite/client?'))) {
        return next();
      }

      delete req.headers['accept-encoding'];
      delete req.headers['if-none-match'];

      const chunks: Buffer[] = [];
      let deferredStatus: number | undefined;
      let deferredMessage: string | undefined;
      let deferredHeaders: Record<string, any> | undefined;

      const origWriteHead = res.writeHead.bind(res);
      const origWrite = res.write.bind(res);
      const origEnd = res.end.bind(res);

      (res as any).writeHead = (statusCode: number, reasonOrHeaders?: any, maybeHeaders?: any) => {
        deferredStatus = statusCode;
        if (typeof reasonOrHeaders === 'string') {
          deferredMessage = reasonOrHeaders;
          deferredHeaders = maybeHeaders;
        } else if (reasonOrHeaders && typeof reasonOrHeaders === 'object') {
          deferredHeaders = reasonOrHeaders;
        }
        return res;
      };

      (res as any).write = (chunk: any, encoding?: any) => {
        if (chunk !== undefined && chunk !== null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8'));
        }
        return true;
      };

      (res as any).end = (chunk?: any, encoding?: any, cb?: any) => {
        if (typeof chunk === 'function') {
          cb = chunk;
          chunk = undefined;
        } else if (typeof encoding === 'function') {
          cb = encoding;
          encoding = undefined;
        }
        if (chunk !== undefined && chunk !== null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8'));
        }

        const rawCode = Buffer.concat(chunks).toString('utf8');
        const patchedCode = rawCode
          .replace('transport.connect(createHMRHandler(handleMessage));', '/* HMR WebSocket disabled */')
          .replace('else throw new SendBeforeConnectError("send was called before connect");', 'else return;')
          .replace('else throw new SendBeforeConnectError("invoke was called before connect");', 'else return;');

        res.writeHead = origWriteHead;
        res.write = origWrite;
        res.end = origEnd;

        if (deferredHeaders) {
          for (const [k, v] of Object.entries(deferredHeaders)) {
            if (k.toLowerCase() !== 'content-length' && k.toLowerCase() !== 'etag') {
              res.setHeader(k, v as any);
            }
          }
        }
        res.removeHeader('content-length');
        res.removeHeader('etag');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Length', Buffer.byteLength(patchedCode, 'utf8'));

        if (deferredStatus !== undefined) {
          if (deferredMessage) {
            origWriteHead(deferredStatus, deferredMessage);
          } else {
            origWriteHead(deferredStatus);
          }
        }

        return origEnd(patchedCode, 'utf8', cb);
      };

      return vite.middlewares(req, res, next);
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Greek Food & Taverna AI Matchmaker running on http://0.0.0.0:${port}`);
  });
}

startServer();
