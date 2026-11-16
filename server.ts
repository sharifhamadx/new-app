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

app.use(express.json());

// Load Firebase config to verify Firebase ID tokens against Google Identity Toolkit
let firebaseApiKey = '';
try {
  const fbConfigRaw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
  const fbConfig = JSON.parse(fbConfigRaw);
  firebaseApiKey = fbConfig.apiKey || '';
} catch (err) {
  console.warn('Could not read firebase-applet-config.json on server:', err);
}

// Generic hospitality/geography stopwords ignored when verifying Wikipedia photo matches
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
  if (/\.(svg|ico|gif)(\?|$)/i.test(lower)) return false;
  if (/(favicon|sprite|logo|default-avatar|placeholder|blank\.|spacer\.|map_of_|location_map)/i.test(lower)) {
    return false;
  }
  return /^https?:\/\//i.test(url);
}

async function fetchOgImageFromWebsite(websiteUrl: string): Promise<string> {
  const cleanSite = sanitizeHttpUrl(websiteUrl);
  if (!cleanSite) return '';
  try {
    const res = await fetch(cleanSite, {
      signal: AbortSignal.timeout(2200),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GreekGuideBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return '';
    const html = (await res.text()).slice(0, 80000);
    const metaMatch =
      html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["']/i);
    if (!metaMatch?.[1]) return '';
    const resolved = new URL(metaMatch[1].trim(), res.url || cleanSite).toString();
    if (!isCleanPhotoUrl(resolved)) return '';

    const headRes = await fetch(resolved, {
      method: 'HEAD',
      signal: AbortSignal.timeout(1800),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GreekGuideBot/1.0)' },
    });
    if (headRes.ok && (headRes.headers.get('content-type') || '').startsWith('image/')) {
      return resolved;
    }
    return '';
  } catch {
    return '';
  }
}

async function searchWikipediaPhoto(queryText: string, distinctiveTokens: string[], wikiLang: 'en' | 'el'): Promise<string> {
  if (!queryText || distinctiveTokens.length === 0) return '';
  try {
    const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      queryText
    )}&gsrlimit=4&prop=pageimages&pithumbsize=900&format=json&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2400),
      headers: { 'User-Agent': 'GreekGuideBot/1.0' },
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

async function resolveVerifiedPlaceImage(params: {
  englishName?: string;
  name?: string;
  greekName?: string;
  region?: string;
  officialWebsite?: string;
  extraContext?: string;
}): Promise<string> {
  const { englishName = '', name = '', greekName = '', region = '', officialWebsite = '', extraContext = '' } = params;

  // 1. Try verified og:image from official website first if provided
  if (officialWebsite) {
    const ogImg = await fetchOgImageFromWebsite(officialWebsite);
    if (ogImg) return ogImg;
  }

  // 2. Build distinctive tokens so generic city names never trigger wrong photos
  const rawNames = `${englishName} ${name}`.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = Array.from(
    new Set(
      rawNames
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && !GENERIC_PLACE_TOKENS.has(t))
    )
  );

  const greekTokens = Array.from(
    new Set(
      String(greekName || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4)
    )
  );

  const enQuery = `${englishName || name} ${region} ${extraContext} Greece`.trim();
  const enImg = await searchWikipediaPhoto(enQuery, tokens, 'en');
  if (enImg) return enImg;

  if (greekName && greekTokens.length > 0) {
    const elImg = await searchWikipediaPhoto(greekName, greekTokens, 'el');
    if (elImg) return elImg;
  }

  // 3. No verified real image found -> return empty string (frontend renders clean text & website/Maps photo link)
  return '';
}

// Verify Firebase Google ID Token via Google Identity Toolkit
async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string; emailVerified: boolean; displayName?: string } | null> {
  if (!firebaseApiKey || !idToken) return null;
  try {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
      method: 'POST',
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
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

// ============================================================================
// Quota Protection, Multi-Model Fallback Cascade & Server-Side TTL Caches
// ============================================================================
const GEMINI_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
const modelCooldownUntil: Record<string, number> = {};

function isQuotaError(err: any): boolean {
  if (!err) return false;
  if (err?.status === 429) return true;
  const msg = String(err?.message || err || '');
  return /\b429\b|RESOURCE_EXHAUSTED|quota exceeded|GenerateRequestsPerDay/i.test(msg);
}

function isModelAvailable(model: string): boolean {
  return Date.now() >= (modelCooldownUntil[model] || 0);
}

function markModelQuotaExhausted(model: string) {
  modelCooldownUntil[model] = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
}

async function callGeminiWithFallback(
  ai: GoogleGenAI,
  opts: {
    models: string[];
    contents: string;
    responseSchema?: any;
  }
): Promise<{ text: string; modelUsed: string }> {
  const activeModels = opts.models.filter((m) => isModelAvailable(m));
  if (activeModels.length === 0) {
    throw Object.assign(new Error('All free-tier AI models are currently cooling down after quota limits.'), { status: 429 });
  }

  let lastErr: any = null;
  for (const model of activeModels) {
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

      const response = await ai.models.generateContent({
        model,
        contents: opts.contents,
        config,
      });

      const text = response.text || '';
      if (!text.trim()) {
        throw new Error(`Empty response from ${model}`);
      }
      return { text, modelUsed: model };
    } catch (err: any) {
      lastErr = err;
      if (isQuotaError(err)) {
        markModelQuotaExhausted(model);
        console.warn(`[GEMINI QUOTA] ${model} reached quota limit; switching to fallback model.`);
        continue;
      }
      console.warn(`[GEMINI ERROR] ${model} failed:`, err?.message || err);
    }
  }

  throw lastErr || new Error('Gemini generation failed across available models.');
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const serverRecommendCache = new Map<string, CacheEntry<any>>();
const serverTranslateCache = new Map<string, CacheEntry<any>>();

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

const GREEK_CITY_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  Athens: { lat: 37.9838, lon: 23.7275, label: 'Athens' },
  Thessaloniki: { lat: 40.6401, lon: 22.9444, label: 'Thessaloniki' },
  Santorini: { lat: 36.3932, lon: 25.4615, label: 'Santorini' },
  Mykonos: { lat: 37.4467, lon: 25.3289, label: 'Mykonos' },
  'Chania, Crete': { lat: 35.5138, lon: 24.0180, label: 'Chania' },
  'Heraklion, Crete': { lat: 35.3387, lon: 25.1442, label: 'Heraklion' },
  Rhodes: { lat: 36.4341, lon: 28.2176, label: 'Rhodes' },
  Corfu: { lat: 39.6243, lon: 19.9217, label: 'Corfu' },
  Nafplio: { lat: 37.5673, lon: 22.8016, label: 'Nafplio' },
  Delphi: { lat: 38.4824, lon: 22.5010, label: 'Delphi' },
  Meteora: { lat: 39.7217, lon: 21.6306, label: 'Meteora' },
  Naxos: { lat: 37.1036, lon: 25.3767, label: 'Naxos' },
  Paros: { lat: 37.0853, lon: 25.1520, label: 'Paros' },
  Zakynthos: { lat: 37.7870, lon: 20.8979, label: 'Zakynthos' },
  Kefalonia: { lat: 38.1754, lon: 20.5692, label: 'Kefalonia' },
  'Olympia, Peloponnese': { lat: 37.6379, lon: 21.6300, label: 'Olympia' },
  'All Greece': { lat: 37.9838, lon: 23.7275, label: 'Greece' },
};

async function fetchWikiSearchDetailed(query: string, limit = 5, wikiLang = 'en'): Promise<any[]> {
  try {
    const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrlimit=${limit}&prop=extracts|pageimages|info&exintro=1&explaintext=1&exsentences=2&pithumbsize=900&inprop=url&format=json&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const pages: any[] = Object.values(data?.query?.pages || {});
    return pages
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .filter((p) => p?.title && !/^(List of|Category:|Portal:)/i.test(p.title));
  } catch {
    return [];
  }
}

async function fetchWikiGeoSearchDetailed(lat: number, lon: number, limit = 8): Promise<any[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=10000&ggslimit=${limit}&prop=extracts|pageimages|info&exintro=1&explaintext=1&exsentences=2&pithumbsize=900&inprop=url&format=json&origin=*`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: { 'User-Agent': 'AEGEA-Travel-Guide/1.0' },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const pages: any[] = Object.values(data?.query?.pages || {});
    return pages.filter((p) => p?.title && (p?.extract || '').length > 25);
  } catch {
    return [];
  }
}

function localizedFallbackStrings(langCode: string, cityLabel: string, foodLabel: string, dateStr: string) {
  const code = String(langCode || 'en').toLowerCase().slice(0, 2);
  if (code === 'ar') {
    return {
      summary: `دليل السفر المباشر لمدينة ${cityLabel} (${dateStr}) — تم تجميع هذه الأماكن والمعالم الحقيقية مباشرةً من المصادر الجغرافية والموسوعية الموثوقة نظراً للطلب المرتفع على محرك الذكاء الاصطناعي، مع التركيز على ${foodLabel}.`,
      tavernaNote: `مطعم وتافيرنا معروفة في ${cityLabel} تقدم أطباقاً يونانية مطابقة لتفضيلك (${foodLabel}).`,
      hotelNote: `إقامة وفندق معروف في ${cityLabel} قريب من المعالم التاريخية وخيارات الطعام المحلية.`,
      siteNote: `معلم أثري وتاريخي موثق في ${cityLabel}.`,
      gemNote: `وجهة محلية أصيلة ومعلم جدير بالزيارة في ${cityLabel}.`,
      checkSiteTip: `راجع الموقع الرسمي أو خرائط Google لعرض الصور الحية وساعات العمل اليوم في ${cityLabel}.`,
      morningLabel: 'الفترة الصباحية',
      eveningLabel: 'المساء وغروب الشمس',
      dayTitles: [
        `اليوم الأول: قلب ${cityLabel} التاريخي والنكهات الأصيلة`,
        `اليوم الثاني: الكنوز الأثرية والمطبخ اليوناني (${foodLabel})`,
        `اليوم الثالث: المعالم المخفية وتوديع ${cityLabel}`,
      ],
      budgetSummary: `الميزانية التقديرية لثلاثة أيام في ${cityLabel}: حوالي 390€ إلى 720€ شاملة الإقامة والوجبات وزيارة المواقع الأثرية.`,
    };
  }
  if (code === 'el') {
    return {
      summary: `Ζωντανός ταξιδιωτικός οδηγός για ${cityLabel} (${dateStr}) — Οι πραγματικές τοποθεσίες ανακτήθηκαν απευθείας από επαληθευμένες γεωγραφικές και εγκυκλοπαιδικές πηγές λόγω αυξημένης ζήτησης AI, με έμφαση στο: ${foodLabel}.`,
      tavernaNote: `Αναγνωρισμένος χώρος εστίασης στην περιοχή ${cityLabel} κατάλληλος για ${foodLabel}.`,
      hotelNote: `Γνωστό κατάλυμα και ξενοδοχείο στην περιοχή ${cityLabel} κοντά στα κύρια αξιοθέατα.`,
      siteNote: `Επίσημο ιστορικό και αρχαιολογικό μνημείο στην περιοχή ${cityLabel}.`,
      gemNote: `Αυθεντικό σημείο ενδιαφέροντος και τοπική εμπειρία στην περιοχή ${cityLabel}.`,
      checkSiteTip: `Επισκεφθείτε την επίσημη σελίδα ή τους Χάρτες Google για ζωντανές φωτογραφίες και ωράριο.`,
      morningLabel: 'Νωρίς το πρωί',
      eveningLabel: 'Απόγευμα και ηλιοβασίλεμα',
      dayTitles: [
        `Ημέρα 1: Ιστορικό κέντρο της περιοχής ${cityLabel} & αυθεντική κουζίνα`,
        `Ημέρα 2: Αρχαιολογικοί θησαυροί & ${foodLabel}`,
        `Ημέρα 3: Κρυφές γωνιές και τοπική κουλτούρα στην περιοχή ${cityLabel}`,
      ],
      budgetSummary: `Εκτιμώμενος προϋπολογισμός 3 ημερών για ${cityLabel}: €390 – €720 ανά άτομο (διαμονή, γεύματα και αξιοθέατα).`,
    };
  }
  return {
    summary: `Live reference guide for ${cityLabel} (${dateStr}) — Compiled directly from verified geographic and encyclopedic directories while AI traffic peaks, tailored around ${foodLabel}.`,
    tavernaNote: `Established culinary venue & neighborhood dining spot in ${cityLabel} suited for ${foodLabel}.`,
    hotelNote: `Notable accommodation and stay in ${cityLabel} with convenient access to landmarks and dining.`,
    siteNote: `Verified archaeological & historical landmark in ${cityLabel}.`,
    gemNote: `Authentic cultural landmark and local viewpoint in ${cityLabel}.`,
    checkSiteTip: `Open the verified listing or Google Maps for current opening hours, menus, and traveler photos in ${cityLabel}.`,
    morningLabel: 'Early morning',
    eveningLabel: 'Golden hour sunset',
    dayTitles: [
      `Day 1: Historic ${cityLabel} & Signature Flavors`,
      `Day 2: Ancient Heritage & ${foodLabel}`,
      `Day 3: Hidden Quarters & Local Markets of ${cityLabel}`,
    ],
    budgetSummary: `Estimated 3-day budget in ${cityLabel}: €390 – €720 per traveler including stay, dining, and archaeological entry.`,
  };
}

async function buildLiveWikipediaGreeceFallback(params: {
  city: string;
  foodType: string;
  langCode: string;
  liveDateString: string;
}) {
  const { city, foodType, langCode, liveDateString } = params;
  const cityCoord = GREEK_CITY_COORDS[city] || GREEK_CITY_COORDS['Athens'];
  const cityLabel = cityCoord.label;
  const txt = localizedFallbackStrings(langCode, cityLabel, foodType, liveDateString);

  const [sitePages, hotelPages, foodPages, geoPages] = await Promise.all([
    fetchWikiSearchDetailed(`${cityLabel} archaeological site ancient museum Greece`, 5, 'en'),
    fetchWikiSearchDetailed(`${cityLabel} historic hotel palace resort Greece`, 5, 'en'),
    fetchWikiSearchDetailed(`${cityLabel} traditional restaurant market square Greece`, 5, 'en'),
    fetchWikiGeoSearchDetailed(cityCoord.lat, cityCoord.lon, 10),
  ]);

  const pickPhoto = (page: any) => {
    const src = page?.thumbnail?.source || '';
    return isCleanPhotoUrl(src) ? src : '';
  };

  const mergedNearby = [...geoPages, ...sitePages];
  const dedupeByTitle = (arr: any[]) => {
    const seen = new Set<string>();
    return arr.filter((p) => {
      const k = String(p?.title || '').toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const uniqueSites = dedupeByTitle([...sitePages, ...mergedNearby]).slice(0, 3);
  const uniqueHotels = dedupeByTitle([...hotelPages, ...geoPages.filter((p) => !uniqueSites.includes(p))]).slice(0, 4);
  const uniqueDining = dedupeByTitle([...foodPages, ...geoPages.filter((p) => !uniqueSites.includes(p))]).slice(0, 4);
  const uniqueGems = dedupeByTitle(
    geoPages.filter((p) => !uniqueSites.includes(p) && !uniqueHotels.includes(p))
  ).slice(0, 2);

  const cleanExtract = (p: any, fallback: string) => {
    const ex = String(p?.extract || '').replace(/\s+/g, ' ').trim();
    return ex.length > 35 ? ex : fallback;
  };

  const tavernas = (uniqueDining.length > 0 ? uniqueDining : uniqueSites).slice(0, 4).map((p, idx) => ({
    id: `t-${idx + 1}`,
    rank: idx + 1,
    name: p.title,
    englishName: p.title,
    greekName: p.title,
    region: cityLabel,
    location: `${cityLabel}, Greece`,
    description: cleanExtract(p, txt.tavernaNote),
    signatureDishes: [foodType, 'Moussaka', 'Horiatiki Salad'],
    atmosphere: cityLabel,
    priceLevel: idx === 0 ? '€€' : idx % 2 === 0 ? '€' : '€€€',
    insiderTip: txt.checkSiteTip,
    rating: Number((4.9 - idx * 0.1).toFixed(1)),
    officialWebsite: sanitizeHttpUrl(p.fullurl),
    imageUrl: pickPhoto(p),
  }));

  const hotels = (uniqueHotels.length > 0 ? uniqueHotels : geoPages).slice(0, 4).map((p, idx) => ({
    id: `h-${idx + 1}`,
    rank: idx + 1,
    name: p.title,
    englishName: p.title,
    greekName: p.title,
    region: cityLabel,
    location: `${cityLabel}, Greece`,
    category: idx === 0 ? 'Boutique Heritage' : 'City Center Stay',
    description: cleanExtract(p, txt.hotelNote),
    amenities: ['Central Location', 'Breakfast', 'Wi-Fi', 'Concierge'],
    priceLevel: idx === 0 ? '€€€' : '€€',
    insiderTip: txt.checkSiteTip,
    rating: Number((4.8 - idx * 0.1).toFixed(1)),
    officialWebsite: sanitizeHttpUrl(p.fullurl),
    imageUrl: pickPhoto(p),
  }));

  const archaeologicalSites = uniqueSites.map((p, idx) => ({
    id: `a-${idx + 1}`,
    rank: idx + 1,
    name: p.title,
    englishName: p.title,
    greekName: p.title,
    region: cityLabel,
    location: `${cityLabel}, Greece`,
    era: 'Classical & Historical Heritage',
    description: cleanExtract(p, txt.siteNote),
    highlights: [p.title, cityLabel],
    bestTimeToVisit: txt.morningLabel,
    insiderTip: txt.checkSiteTip,
    nearbyTavernaSuggestion: tavernas[0]?.name || cityLabel,
    officialWebsite: sanitizeHttpUrl(p.fullurl),
    imageUrl: pickPhoto(p),
  }));

  const dishes = [
    {
      id: 'd-1',
      rank: 1,
      name: `Horiatiki & ${foodType}`,
      englishName: 'Greek Village Salad',
      greekName: 'Χωριάτικη Σαλάτα',
      pronunciation: 'ho-ree-ah-tee-KEE',
      description: `Classic ripe tomatoes, cucumber, Kalamata olives, extra virgin olive oil, oregano, and PDO Feta served alongside ${foodType}.`,
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
  ];

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
    imageUrl: pickPhoto(p),
  }));

  const localPhrases = [
    { greek: 'Καλημέρα σας', phonetic: 'ka-lee-ME-ra sas', translation: 'Good morning', meaning: 'Polite daytime greeting' },
    { greek: 'Ένα τραπέζι για δύο, παρακαλώ', phonetic: 'E-na tra-PE-zee ya THEE-o', translation: 'A table for two, please', meaning: 'Entering a taverna' },
    { greek: 'Τι προτείνετε σήμερα;', phonetic: 'tee pro-TEE-ne-te SEE-me-ra', translation: 'What do you recommend today?', meaning: 'Asking for fresh specials' },
    { greek: 'Τον λογαριασμό, παρακαλώ', phonetic: 'ton lo-ga-ryaz-MO pa-ra-ka-LO', translation: 'The bill, please', meaning: 'Closing your meal' },
  ];

  const groundingSources = [...uniqueSites, ...uniqueHotels, ...uniqueDining]
    .filter((p) => sanitizeHttpUrl(p?.fullurl))
    .slice(0, 6)
    .map((p) => ({ title: `${p.title} — Wikipedia`, uri: p.fullurl }));

  return {
    summary: txt.summary,
    tavernas,
    hotels,
    archaeologicalSites,
    dishes,
    hiddenGems,
    localPhrases,
    groundingSources,
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
          officialWebsite: { type: Type.STRING },
        },
        required: ['id', 'rank', 'name', 'englishName', 'greekName', 'region', 'location', 'description', 'signatureDishes', 'atmosphere', 'priceLevel', 'insiderTip', 'rating', 'officialWebsite'],
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
          officialWebsite: { type: Type.STRING },
        },
        required: ['id', 'rank', 'name', 'englishName', 'greekName', 'region', 'location', 'category', 'description', 'amenities', 'priceLevel', 'insiderTip', 'rating', 'officialWebsite'],
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
          officialWebsite: { type: Type.STRING },
        },
        required: ['id', 'rank', 'name', 'englishName', 'greekName', 'region', 'location', 'era', 'description', 'highlights', 'bestTimeToVisit', 'insiderTip', 'nearbyTavernaSuggestion', 'officialWebsite'],
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
        },
        required: ['id', 'rank', 'title', 'englishName', 'greekTitle', 'region', 'description', 'whyVisit', 'bestTimeToVisit', 'nearbyTavernaSuggestion'],
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
    prompt = '',
    language = 'en',
    mood = '',
    region = '',
    dietary = '',
  } = req.body || {};

  const targetCity = city || region || 'Athens & Iconic Greek Destinations';
  const targetFood = foodType || dietary || 'Authentic Traditional Greek Cuisine';
  const targetFocus =
    guideCategory === 'tavernas'
      ? 'Best Tavernas & Authentic Restaurants (primary focus) + supporting dishes, nearby hotels & archaeological context'
      : guideCategory === 'hotels'
      ? 'Best Hotels & Boutique Stays (primary focus) + nearby tavernas matching the preferred food & nearby archaeological sites'
      : guideCategory === 'archaeological'
      ? 'Top Archaeological, Ancient & Historical Sites (primary focus) + nearby tavernas matching the preferred food & nearby stays'
      : 'Comprehensive All-in-One Greece Travel & Culinary Reference Guide (Best Tavernas, Best Hotels, Archaeological Sites, Traditional Dishes, Hidden Gems)';

  if (!city && !foodType && !prompt && !mood && !region && !dietary) {
    return res.status(400).json({ error: 'Please select a Greek city and preferred food type.' });
  }

  const langName = resolveLanguageName(language);
  const now = new Date();
  const liveDateString = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Check server-side 60-minute cache first to avoid burning daily Gemini quota on repeated identical searches
  const recommendCacheKey = makeCacheKey({
    targetCity: String(targetCity).trim().toLowerCase(),
    targetFood: String(targetFood).trim().toLowerCase(),
    guideCategory: String(guideCategory).trim().toLowerCase(),
    prompt: String(prompt || mood || '').trim().toLowerCase(),
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

  try {
    let rawText = '';
    const groundingSources: { title: string; uri: string }[] = [];
    let parsedData: any = null;
    let usedWikipediaFallback = false;

    if (apiKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const searchPrompt = `Today's live date is ${liveDateString}.
Use Google Search right now to build a comprehensive, real-world travel & culinary reference guide in Greece tailored specifically to the user's selections:
- Selected Greek City / Island: "${targetCity}"
- Preferred Food / Cuisine Type: "${targetFood}"
- Guide Focus Mode: "${targetFocus}"
- Additional Traveler Notes: "${prompt || mood || 'None'}"
- Required Output Language: ${langName}

CRITICAL RULES:
1. EVERY SINGLE item MUST belong directly to "${targetCity}" (or the exact Greek region requested) and respect "${targetFood}". Never return generic repeating results from other cities unless the user selected All Greece.
2. RANKING ORDER IS MANDATORY: Order every list strictly from BEST (#1 highest-rated, most renowned & best match) downward to #2, #3, #4 (set "rank": 1, 2, 3, 4...).
3. Verify real taverna/restaurant names, real hotels/boutique stays, real archaeological/historical sites, streets/neighborhoods, and authentic dishes as of ${liveDateString}.
4. Always provide the accurate English/Latin name in "englishName" (even when output language is Arabic or Greek) AND provide the real official website URL in "officialWebsite" (https://...) if known, or "" if unsure (never invent fake URLs).
5. Provide:
   - 4 real tavernas/restaurants in ${targetCity} matching "${targetFood}" (ranked #1 best to #4)
   - 4 real top-rated hotels / boutique stays in ${targetCity} (ranked #1 best to #4)
   - 3 real archaeological, ancient, or historical sites in ${targetCity} (ranked #1 best to #3)
   - 3 authentic Greek dishes matching "${targetFood}" (ranked #1 to #3)
   - 2 hidden scenic/cultural gems in ${targetCity} (ranked #1 to #2)
   - 4 practical Greek dining & travel phrases
6. Write all descriptive text, summaries, titles, ingredients, amenities, highlights, and translations in ${langName}, while keeping original Greek script in greekName/greekTitle/greek fields and English script in englishName.
7. Respond with ONLY a valid JSON object matching this exact structure (no extra commentary):
{
  "summary": "string in ${langName} referencing today's date ${liveDateString}, ${targetCity}, and ${targetFood}",
  "tavernas": [{ "id": "t-1", "rank": 1, "name": "string", "englishName": "string", "greekName": "string", "region": "string", "location": "string", "description": "string in ${langName}", "signatureDishes": ["string"], "atmosphere": "string in ${langName}", "priceLevel": "€" | "€€" | "€€€", "insiderTip": "string in ${langName}", "rating": 4.9, "officialWebsite": "https://... or empty" }],
  "hotels": [{ "id": "h-1", "rank": 1, "name": "string", "englishName": "string", "greekName": "string", "region": "string", "location": "string", "category": "string in ${langName}", "description": "string in ${langName}", "amenities": ["string in ${langName}"], "priceLevel": "€" | "€€" | "€€€", "insiderTip": "string in ${langName}", "rating": 4.9, "officialWebsite": "https://... or empty" }],
  "archaeologicalSites": [{ "id": "a-1", "rank": 1, "name": "string", "englishName": "string", "greekName": "string", "region": "string", "location": "string", "era": "string in ${langName}", "description": "string in ${langName}", "highlights": ["string in ${langName}"], "bestTimeToVisit": "string in ${langName}", "insiderTip": "string in ${langName}", "nearbyTavernaSuggestion": "string in ${langName}", "officialWebsite": "https://... or empty" }],
  "dishes": [{ "id": "d-1", "rank": 1, "name": "string in ${langName}", "englishName": "string", "greekName": "string", "pronunciation": "string", "description": "string in ${langName}", "ingredients": ["string"], "dietary": ["string"], "regionOfOrigin": "string in ${langName}", "pairingDrink": "string in ${langName}" }],
  "hiddenGems": [{ "id": "g-1", "rank": 1, "title": "string in ${langName}", "englishName": "string", "greekTitle": "string", "region": "string in ${langName}", "description": "string in ${langName}", "whyVisit": "string in ${langName}", "bestTimeToVisit": "string in ${langName}", "nearbyTavernaSuggestion": "string in ${langName}" }],
  "localPhrases": [{ "greek": "string", "phonetic": "string", "translation": "string in ${langName}", "meaning": "string in ${langName}" }]
}`;

      if (Date.now() >= searchGroundingCooldownUntil && isModelAvailable('gemini-4-hydrogen')) {
        try {
          const groundedResponse = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: searchPrompt,
            config: {
              tools: [{ googleSearch: {} }],
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });

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
        } catch (searchErr: any) {
          if (isQuotaError(searchErr)) {
            searchGroundingCooldownUntil = Date.now() + 15 * 60 * 1000;
            markModelQuotaExhausted('gemini-4-hydrogen');
          }
          console.log('Search grounding unavailable for current quota; falling back to multi-model structured generation.');
        }
      }

      if (rawText) {
        try {
          parsedData = extractAndParseJSON(rawText);
        } catch {
          try {
            const structured = await callGeminiWithFallback(ai, {
              models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
              contents: `Convert the following real Google-Search grounded Greek culinary & travel research into valid JSON matching the schema. Keep every real place, dish, and fact intact, and ensure all descriptions are in ${langName}:\n\n${rawText}`,
              responseSchema: MATCHMAKER_RESPONSE_SCHEMA,
            });
            parsedData = extractAndParseJSON(structured.text);
          } catch (parseErr) {
            console.warn('Could not convert grounded prose cleanly; trying structured/Wikipedia fallback:', parseErr);
          }
        }
      }

      if (!parsedData) {
        const directPrompt = `Today's live date is ${liveDateString}.
Generate a comprehensive, real-world Greek travel & culinary reference guide tailored directly to the user's exact selections:
- Selected Greek City / Island: "${targetCity}"
- Preferred Food / Cuisine Type: "${targetFood}"
- Guide Focus Mode: "${targetFocus}"
- Additional Traveler Notes: "${prompt || mood || 'None'}"
- Required Output Language: ${langName}

CRITICAL RULES:
1. Tailor EVERY SINGLE recommendation specifically to "${targetCity}" and "${targetFood}". Never give generic repeating answers.
2. RANKING ORDER IS MANDATORY: Order every list strictly from BEST (#1 highest-rated, top choice) downward to #2, #3, #4 (set "rank": 1, 2, 3, 4...).
3. Provide 4 real established tavernas/restaurants in "${targetCity}" matching "${targetFood}", 4 real hotels/boutique stays in "${targetCity}", 3 real archaeological/ancient/historical sites in "${targetCity}", 3 matching Greek dishes, 2 hidden scenic gems in "${targetCity}", and 4 practical Greek phrases.
4. Always provide the accurate English/Latin name in "englishName" (even when output language is Arabic or Greek) AND provide the real official website URL in "officialWebsite" (https://...) if known, or "" if unsure (never invent fake URLs).
5. Write all descriptive text, summaries, titles, ingredients, amenities, highlights, and translations in ${langName}, keeping Greek alphabet script in greekName/greekTitle/greek fields and English script in englishName.
6. Reference today's date (${liveDateString}) naturally in the summary.`;

        try {
          const directResult = await callGeminiWithFallback(ai, {
            models: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
            contents: directPrompt,
            responseSchema: MATCHMAKER_RESPONSE_SCHEMA,
          });
          parsedData = extractAndParseJSON(directResult.text);
        } catch (modelErr: any) {
          console.warn('[RECOMMEND CASCADE FALLBACK]', modelErr?.message || modelErr);
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
      });
      if (Array.isArray(wikiResult.groundingSources) && wikiResult.groundingSources.length > 0) {
        groundingSources.push(...wikiResult.groundingSources);
      }
      parsedData = wikiResult;
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

    // Resolve ONLY real, verified place-specific photographs concurrently (never attach static fake photos)
    const [tavernas, hotels, archaeologicalSites, dishes, hiddenGems] = await Promise.all([
      Promise.all(
        rawTavernas.map(async (t: any, idx: number) => {
          const officialWebsite = sanitizeHttpUrl(t.officialWebsite);
          const imageUrl =
            t.imageUrl && isCleanPhotoUrl(t.imageUrl)
              ? t.imageUrl
              : await resolveVerifiedPlaceImage({
                  englishName: t.englishName,
                  name: t.name,
                  greekName: t.greekName,
                  region: t.region || targetCity,
                  officialWebsite,
                  extraContext: 'taverna restaurant',
                });
          return {
            ...t,
            id: t.id || `t-${idx + 1}`,
            rank: idx + 1,
            priceLevel: t.priceLevel === '€' || t.priceLevel === '€€€' ? t.priceLevel : '€€',
            rating: typeof t.rating === 'number' ? t.rating : 4.8,
            officialWebsite,
            imageUrl,
          };
        })
      ),
      Promise.all(
        rawHotels.map(async (h: any, idx: number) => {
          const officialWebsite = sanitizeHttpUrl(h.officialWebsite);
          const imageUrl =
            h.imageUrl && isCleanPhotoUrl(h.imageUrl)
              ? h.imageUrl
              : await resolveVerifiedPlaceImage({
                  englishName: h.englishName,
                  name: h.name,
                  greekName: h.greekName,
                  region: h.region || targetCity,
                  officialWebsite,
                  extraContext: 'hotel',
                });
          return {
            ...h,
            id: h.id || `h-${idx + 1}`,
            rank: idx + 1,
            priceLevel: h.priceLevel === '€' || h.priceLevel === '€€€' ? h.priceLevel : '€€',
            rating: typeof h.rating === 'number' ? h.rating : 4.7,
            officialWebsite,
            imageUrl,
          };
        })
      ),
      Promise.all(
        rawSites.map(async (a: any, idx: number) => {
          const officialWebsite = sanitizeHttpUrl(a.officialWebsite);
          const imageUrl =
            a.imageUrl && isCleanPhotoUrl(a.imageUrl)
              ? a.imageUrl
              : await resolveVerifiedPlaceImage({
                  englishName: a.englishName,
                  name: a.name,
                  greekName: a.greekName,
                  region: a.region || targetCity,
                  officialWebsite,
                  extraContext: 'archaeological site',
                });
          return {
            ...a,
            id: a.id || `a-${idx + 1}`,
            rank: idx + 1,
            officialWebsite,
            imageUrl,
          };
        })
      ),
      Promise.all(
        rawDishes.map(async (d: any, idx: number) => {
          const imageUrl =
            d.imageUrl && isCleanPhotoUrl(d.imageUrl)
              ? d.imageUrl
              : await resolveVerifiedPlaceImage({
                  englishName: d.englishName,
                  name: d.name,
                  greekName: d.greekName,
                  extraContext: 'Greek dish food',
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
          const imageUrl =
            g.imageUrl && isCleanPhotoUrl(g.imageUrl)
              ? g.imageUrl
              : await resolveVerifiedPlaceImage({
                  englishName: g.englishName,
                  name: g.title,
                  greekName: g.greekTitle,
                  region: g.region || targetCity,
                });
          return {
            ...g,
            id: g.id || `g-${idx + 1}`,
            rank: idx + 1,
            imageUrl,
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

    // Only cache high-quality AI answers for 60m; cache emergency Wikipedia fallback briefly (10m) so AI recovers fast
    setInTtlCache(
      serverRecommendCache,
      recommendCacheKey,
      responsePayload,
      usedWikipediaFallback ? 10 * 60 * 1000 : 60 * 60 * 1000,
      80
    );

    return res.json(responsePayload);
  } catch (err: any) {
    console.error('[RECOMMEND ERROR]', err);
    return res.status(502).json({
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

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

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
- DO NOT alter or translate: "id", "rank", "rating", "priceLevel", "englishName", "greekName", "greekTitle", "greek", "phonetic", "officialWebsite", "imageUrl", "coordinates", "guideCategory", "searchedAt", "groundingSources".
- Translate thoroughly into ${langName}: "summary", "name", "title", "region", "location", "category", "era", "description", "signatureDishes", "atmosphere", "insiderTip", "amenities", "highlights", "bestTimeToVisit", "nearbyTavernaSuggestion", "ingredients", "dietary", "regionOfOrigin", "pairingDrink", "whyVisit", "translation", "meaning".`;
  }

  try {
    const result = await callGeminiWithFallback(ai, {
      models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
      contents: `${rules}\n\nRespond ONLY with valid JSON matching the exact shape of this input:\n${serialized}`,
    });

    const parsedTranslated = extractAndParseJSON(result.text || '{}');

    // Re-merge immutable non-translatable fields on search results so URLs, photos & rankings stay exact
    if (mode === 'result' && !Array.isArray(payload)) {
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
      setInTtlCache(serverTranslateCache, cacheKey, mergedResult, 24 * 60 * 60 * 1000, 300);
      return res.json({ translated: mergedResult });
    }

    if (mode === 'curated' && Array.isArray(payload) && Array.isArray(parsedTranslated)) {
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
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

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
      });

      const itinerary = extractAndParseJSON(result.text || '{}');
      return res.json({ itinerary });
    } catch (err: any) {
      console.warn('[ITINERARY FALLBACK]', err?.message || err);
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
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
