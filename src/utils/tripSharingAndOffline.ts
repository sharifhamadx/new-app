import { MatchmakerResult, TripItinerary, CityLiveConditions } from '../types';

export interface SharedTripPayload {
  city: string;
  result: MatchmakerResult;
  itinerary?: TripItinerary | null;
  sharedAt?: string;
}

export interface OfflineVaultPayload {
  city: string;
  result: MatchmakerResult;
  itinerary?: TripItinerary | null;
  weather?: CityLiveConditions | null;
  savedAt: string;
}

const OFFLINE_VAULT_STORAGE_KEY = 'aegea_offline_vault_v1';

export const GREECE_EMERGENCY_NUMBERS = [
  { number: '112', key: 'emergencyGeneral' as const },
  { number: '100', key: 'emergencyPolice' as const },
  { number: '166', key: 'emergencyAmbulance' as const },
  { number: '171', key: 'emergencyTouristPolice' as const },
  { number: '108', key: 'emergencyCoastGuard' as const },
];

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64Url: string): Uint8Array {
  const padded = b64Url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64Url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function compactTripForShareUrl(payload: SharedTripPayload): SharedTripPayload {
  const r = payload.result;
  return {
    city: payload.city,
    sharedAt: payload.sharedAt || new Date().toISOString(),
    result: {
      summary: r.summary,
      guideCategory: r.guideCategory,
      searchedAt: r.searchedAt,
      tavernas: (r.tavernas || []).slice(0, 4).map((t) => ({
        ...t,
        imageUrl: t.imageUrl || '',
        signatureDishes: (t.signatureDishes || []).slice(0, 3),
      })),
      hotels: (r.hotels || []).slice(0, 4).map((h) => ({
        ...h,
        imageUrl: h.imageUrl || '',
        amenities: (h.amenities || []).slice(0, 4),
      })),
      archaeologicalSites: (r.archaeologicalSites || []).slice(0, 3).map((s) => ({
        ...s,
        imageUrl: s.imageUrl || '',
        highlights: (s.highlights || []).slice(0, 3),
        nearbyHotels: (s.nearbyHotels || []).slice(0, 2),
        nearbyRestaurants: (s.nearbyRestaurants || []).slice(0, 2),
      })),
      dishes: (r.dishes || []).slice(0, 3).map((d) => ({
        ...d,
        imageUrl: d.imageUrl || '',
      })),
      hiddenGems: (r.hiddenGems || []).slice(0, 2).map((g) => ({
        ...g,
        imageUrl: g.imageUrl || '',
      })),
      localPhrases: (r.localPhrases || []).slice(0, 4),
      groundingSources: (r.groundingSources || []).slice(0, 5),
    },
    itinerary: payload.itinerary || null,
  };
}

export function encodeSharedTripUrl(payload: SharedTripPayload): string {
  const compact = compactTripForShareUrl(payload);
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  const encoded = bytesToBase64Url(bytes);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?trip=${encoded}`;
}

export function decodeSharedTripFromSearch(searchStr: string): SharedTripPayload | null {
  try {
    const params = new URLSearchParams(searchStr);
    const raw = params.get('trip');
    if (!raw) return null;
    const bytes = base64UrlToBytes(raw);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !parsed.result || typeof parsed.city !== 'string') {
      return null;
    }
    return parsed as SharedTripPayload;
  } catch {
    return null;
  }
}

export function buildWhatsappShareUrl(opts: {
  city: string;
  result: MatchmakerResult;
  shareUrl: string;
}): string {
  const { city, result, shareUrl } = opts;
  const topTaverna = result.tavernas?.[0]?.name;
  const topHotel = result.hotels?.[0]?.name;
  const topSite = result.archaeologicalSites?.[0]?.name;
  const lines = [
    `AEGEA · ${city}`,
    topTaverna ? `• ${topTaverna}` : '',
    topHotel ? `• ${topHotel}` : '',
    topSite ? `• ${topSite}` : '',
    '',
    shareUrl,
  ].filter(Boolean);
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function saveOfflineTripVault(payload: OfflineVaultPayload): boolean {
  try {
    localStorage.setItem(OFFLINE_VAULT_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(
      'aegea_offline_last_guide_v1',
      JSON.stringify({ city: payload.city, result: payload.result })
    );
    return true;
  } catch {
    return false;
  }
}

export function loadOfflineTripVault(): OfflineVaultPayload | null {
  try {
    const raw = localStorage.getItem(OFFLINE_VAULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.result || !parsed?.city) return null;
    return parsed as OfflineVaultPayload;
  } catch {
    return null;
  }
}

export function clearOfflineTripVault(): void {
  try {
    localStorage.removeItem(OFFLINE_VAULT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
