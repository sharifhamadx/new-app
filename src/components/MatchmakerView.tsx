import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  setDoc,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  Language,
  User,
  MatchmakerResult,
  SearchHistoryRecord,
  GuideCategory,
  AtmospherePreference,
  TripItinerary,
  FavoriteItem,
  FavoriteItemType,
} from '../types';
import {
  useUiTranslation,
  translatePayloadDetailed,
  getLanguageEnglishName,
} from '../hooks/useTranslatedContent';
import { IMG_HERO_AEGEAN } from '../data/greekCuratedData';
import { generateExecutivePdf } from '../utils/generateExecutivePdf';
import { apiUrl } from '../utils/apiBase';
import { PlaceActionLinks } from './PlaceActionLinks';
import {
  MapPin,
  Search,
  Wine,
  MessageSquare,
  Lock,
  RotateCcw,
  Clock,
  Star,
  ExternalLink,
  Volume2,
  AlertCircle,
  History,
  UtensilsCrossed,
  Building2,
  Landmark,
  Compass,
  Globe,
  Calendar,
  FileDown,
  Loader2,
  Sparkles,
  Languages,
  Heart,
  Waves,
  Umbrella,
  Moon,
  Sunset,
  Home,
  Music,
  Columns3,
  CheckCircle2,
} from 'lucide-react';

interface MatchmakerViewProps {
  currentLang: Language;
  user: User | null;
  onOpenSignIn: () => void;
  onOpenPremium: () => void;
  onOpenPartner?: () => void;
  onOpenTranslator?: () => void;
  onDecrementSearch: () => Promise<void>;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: Omit<FavoriteItem, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
}

const HERO_IMAGE = IMG_HERO_AEGEAN;

const INTL_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  ar: 'ar-EG',
  el: 'el-GR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  tr: 'tr-TR',
  ru: 'ru-RU',
  zh: 'zh-CN',
};

const CITY_KEYS = [
  'Athens',
  'Thessaloniki',
  'Chalkidiki',
  'Santorini',
  'Mykonos',
  'Naxos',
  'Paros',
  'Milos',
  'Syros',
  'Rhodes',
  'Kos',
  'Chania, Crete',
  'Heraklion, Crete',
  'Rethymno, Crete',
  'Agios Nikolaos, Crete',
  'Corfu',
  'Zakynthos',
  'Kefalonia',
  'Lefkada',
  'Nafplio',
  'Kalamata & Mani',
  'Monemvasia',
  'Olympia, Peloponnese',
  'Delphi',
  'Evia & Chalkida',
  'Meteora',
  'Volos & Pelion',
  'Skiathos & Sporades',
  'Ioannina & Zagori',
  'Parga & Syvota',
  'Patras & Achaea',
  'Kavala & Thassos',
  'Alexandroupoli & Thrace',
  'Lesvos, Chios & Samos',
  'Kastoria & Prespes',
  'All Greece',
];

function resultHasTargetScript(resData: MatchmakerResult | null | undefined, lang: string): boolean {
  if (!resData) return true;
  const norm = String(lang || 'en').trim().toLowerCase();
  const sampleTexts = [
    ...(resData.tavernas || []).map((x) => x.description || ''),
    ...(resData.hotels || []).map((x) => x.description || ''),
    ...(resData.archaeologicalSites || []).map((x) => x.description || ''),
    ...(resData.dishes || []).map((x) => x.description || ''),
  ].filter(Boolean);
  if (sampleTexts.length === 0) return true;
  const joined = sampleTexts.join(' ');
  if (norm === 'ar' || norm === 'arabic') return /[\u0600-\u06FF]/.test(joined);
  if (norm === 'el' || norm === 'greek') return /[\u0370-\u03FF\u1F00-\u1FFF]/.test(joined);
  if (norm === 'ru' || norm === 'russian') return /[\u0400-\u04FF]/.test(joined);
  if (norm === 'zh' || norm === 'chinese') return /[\u4E00-\u9FFF]/.test(joined);
  return true;
}

function formatLiveDate(lang: string): string {
  const norm = String(lang || 'en').trim().toLowerCase();
  const locale = INTL_LOCALE_MAP[norm] || norm || 'en-US';
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  }
}

export const MatchmakerView: React.FC<MatchmakerViewProps> = ({
  currentLang,
  user,
  onOpenSignIn,
  onOpenPremium,
  onOpenPartner,
  onOpenTranslator,
  onDecrementSearch,
  favorites = [],
  onToggleFavorite,
}) => {
  const [city, setCity] = useState('Athens');
  const [customCity, setCustomCity] = useState('');
  const [foodType, setFoodType] = useState('traditional');
  const [atmosphere, setAtmosphere] = useState<AtmospherePreference>('any');
  const [guideCategory, setGuideCategory] = useState<GuideCategory>('all');
  const [optionalNotes, setOptionalNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<MatchmakerResult | null>(null);
  const [isTranslatingResult, setIsTranslatingResult] = useState(false);
  const [playingPhrase, setPlayingPhrase] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryRecord[]>([]);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // VIP 3-Day Itinerary & Executive PDF state
  const [itinerary, setItinerary] = useState<TripItinerary | null>(null);
  const [isGeneratingItinerary, setIsGeneratingItinerary] = useState(false);
  const [isTranslatingItinerary, setIsTranslatingItinerary] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [itineraryError, setItineraryError] = useState<string | null>(null);

  const resultCacheRef = useRef<Record<string, MatchmakerResult>>({});
  const itineraryCacheRef = useRef<Record<string, TripItinerary>>({});

  const { t } = useUiTranslation(currentLang);
  const todayFormatted = formatLiveDate(currentLang);

  // Hydrate last cached guide automatically when opening offline (PWA offline support)
  useEffect(() => {
    if (typeof window === 'undefined' || result) return;
    if (navigator.onLine) return;
    try {
      const raw = localStorage.getItem('aegea_offline_last_guide_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.result) {
          if (parsed.city && typeof parsed.city === 'string') {
            setCity(parsed.city);
          }
          const normLang = String(currentLang || 'en').trim().toLowerCase();
          resultCacheRef.current = { [normLang]: parsed.result };
          setResult(parsed.result);
        }
      }
    } catch {
      // ignore offline cache read error
    }
  }, []);

  // Load user's real search history from Firestore across all devices
  useEffect(() => {
    if (!user?.uid || !auth.currentUser) {
      setRecentSearches([]);
      return;
    }

    const searchesPath = `users/${user.uid}/searches`;
    const q = query(
      collection(db, searchesPath),
      where('userId', '==', user.uid),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: SearchHistoryRecord[] = snapshot.docs
          .map((d) => ({
            ...(d.data() as SearchHistoryRecord),
            id: d.id,
          }))
          .sort((a: any, b: any) => {
            const aSec = a?.createdAt?.seconds ?? 0;
            const bSec = b?.createdAt?.seconds ?? 0;
            return bSec - aSec;
          })
          .slice(0, user.isAdmin ? 20 : 5);
        setRecentSearches(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, searchesPath);
      }
    );

    return () => unsub();
  }, [user?.uid, user?.isAdmin]);

  // Automatically translate live search results whenever user switches to ANY language (zero quota used)
  useEffect(() => {
    if (!result) return;
    const normLang = String(currentLang || 'en').trim().toLowerCase();
    const cached = resultCacheRef.current[normLang];
    if (cached) {
      if (result !== cached) {
        setResult(cached);
      }
      setIsTranslatingResult(false);
      return;
    }

    const controller = new AbortController();
    setIsTranslatingResult(true);

    translatePayloadDetailed(result, currentLang, 'result', undefined, controller.signal)
      .then(({ translated, quotaLimited }) => {
        if (!quotaLimited) {
          resultCacheRef.current[normLang] = translated;
          setResult(translated);
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error('Result translation failed:', err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsTranslatingResult(false);
        }
      });

    return () => controller.abort();
  }, [currentLang, result]);

  // Automatically translate generated 3-day itinerary when language changes
  useEffect(() => {
    if (!itinerary) return;
    const normLang = String(currentLang || 'en').trim().toLowerCase();
    const cached = itineraryCacheRef.current[normLang];
    if (cached) {
      if (itinerary !== cached) {
        setItinerary(cached);
      }
      setIsTranslatingItinerary(false);
      return;
    }

    const controller = new AbortController();
    setIsTranslatingItinerary(true);

    translatePayloadDetailed(itinerary, currentLang, 'itinerary', undefined, controller.signal)
      .then(({ translated, quotaLimited }) => {
        if (!quotaLimited) {
          itineraryCacheRef.current[normLang] = translated;
          setItinerary(translated);
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error('Itinerary translation failed:', err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsTranslatingItinerary(false);
        }
      });

    return () => controller.abort();
  }, [currentLang, itinerary]);

  const citiesList = CITY_KEYS.map((key) => ({
    value: key,
    label: t.cities?.[key] || (key === 'All Greece' ? t.matchmaker.allRegions : key),
  }));

  const foodTypesList = [
    { value: 'traditional', label: t.matchmaker.dietaryOptions.any },
    { value: 'seafood', label: t.matchmaker.dietaryOptions.seafood },
    { value: 'meat', label: t.matchmaker.dietaryOptions.meat },
    { value: 'vegetarian', label: t.matchmaker.dietaryOptions.vegetarian },
    { value: 'vegan', label: t.matchmaker.dietaryOptions.vegan },
    { value: 'halalFriendly', label: t.matchmaker.dietaryOptions.halalFriendly },
    { value: 'pastries', label: t.matchmaker.dietaryOptions.pastries },
    { value: 'glutenFree', label: t.matchmaker.dietaryOptions.glutenFree },
  ];

  const categoriesList: { value: GuideCategory; label: string }[] = [
    { value: 'all', label: t.matchmaker.categories.all },
    { value: 'tavernas', label: t.matchmaker.categories.tavernas },
    { value: 'hotels', label: t.matchmaker.categories.hotels },
    { value: 'archaeological', label: t.matchmaker.categories.archaeological },
  ];

  const atmospheresList: { value: AtmospherePreference; label: string }[] = [
    { value: 'any', label: t.matchmaker.atmospheres?.any || 'All Styles' },
    { value: 'seaside', label: t.matchmaker.atmospheres?.seaside || 'By the Sea' },
    { value: 'beach', label: t.matchmaker.atmospheres?.beach || 'On the Beach' },
    { value: 'quiet', label: t.matchmaker.atmospheres?.quiet || 'Quiet & Relaxing' },
    { value: 'romantic', label: t.matchmaker.atmospheres?.romantic || 'Romantic & Sunset' },
    { value: 'traditional', label: t.matchmaker.atmospheres?.traditional || 'Traditional Authentic' },
    { value: 'lively', label: t.matchmaker.atmospheres?.lively || 'Lively Bars & Nightlife' },
    { value: 'historic', label: t.matchmaker.atmospheres?.historic || 'Historic & Ruins View' },
  ];

  const handleSpeakPhrase = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'el-GR';
      utterance.rate = 0.85;
      utterance.onstart = () => setPlayingPhrase(text);
      utterance.onend = () => setPlayingPhrase(null);
      utterance.onerror = () => setPlayingPhrase(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSearch = async () => {
    if (!user || !auth.currentUser) {
      onOpenSignIn();
      return;
    }

    if (!user.isAdmin && !user.isPremium && user.searchesRemaining <= 0) {
      onOpenPremium();
      return;
    }

    const selectedCityObj = citiesList.find((c) => c.value === city) || citiesList[0];
    const effectiveCity = customCity.trim() || selectedCityObj.value;
    const effectiveCityLabel = customCity.trim() || selectedCityObj.label;
    const selectedFoodObj = foodTypesList.find((f) => f.value === foodType) || foodTypesList[0];
    const selectedAtmosphereObj =
      atmospheresList.find((a) => a.value === atmosphere) || atmospheresList[0];

    setIsLoading(true);
    setErrorMsg(null);
    setFailedImages({});
    setItinerary(null);
    setItineraryError(null);
    itineraryCacheRef.current = {};

    try {
      const idToken = await auth.currentUser.getIdToken();
      const requestBody = JSON.stringify({
        city: effectiveCity,
        foodType: selectedFoodObj.label,
        atmosphere: atmosphere === 'any' ? '' : selectedAtmosphereObj.label,
        guideCategory,
        freshOnly: true,
        prompt: optionalNotes.trim(),
        language: getLanguageEnglishName(currentLang),
      });

      const callRecommendApi = async () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 28000);
        try {
          const res = await fetch(apiUrl('/api/recommend'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: requestBody,
            signal: controller.signal,
          });
          const rawText = await res.text();
          let parsed: any = null;
          try {
            parsed = rawText ? JSON.parse(rawText) : null;
          } catch {
            parsed = null;
          }
          return { res, rawText, parsed };
        } finally {
          window.clearTimeout(timeoutId);
        }
      };

      const retryDelays = [1000, 2200];
      let attemptResult: { res: globalThis.Response | null; rawText: string; parsed: any } = {
        res: null,
        rawText: '',
        parsed: null,
      };

      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        const attemptStart = Date.now();
        try {
          attemptResult = await callRecommendApi();
          const isTransientHtml = !attemptResult.parsed && attemptResult.rawText.trim().toLowerCase().startsWith('<!doctype');
          const isTransientGateway =
            attemptResult.res !== null && attemptResult.res.status >= 502 && attemptResult.res.status <= 504;

          if ((!isTransientHtml && !isTransientGateway && attemptResult.parsed) || attempt === retryDelays.length) {
            break;
          }
        } catch (fetchErr: any) {
          const elapsed = Date.now() - attemptStart;
          const isTimeoutOrLongDrop = fetchErr?.name === 'AbortError' || elapsed >= 18000;
          if (attempt === retryDelays.length || isTimeoutOrLongDrop) {
            throw fetchErr;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      }

      const response = attemptResult.res;
      const data = attemptResult.parsed;

      if (!data) {
        throw new Error(t.matchmaker.warmingUpError);
      }

      if (!response || !response.ok) {
        const rawErr = String(data.error || '');
        const cleanErr = rawErr && !rawErr.includes('{') ? rawErr : t.matchmaker.searchFailedError;
        throw new Error(cleanErr);
      }

      // Keep only verified real photos resolved by the backend (never inject static stock placeholders)
      const finalResult: MatchmakerResult = {
        ...data,
        guideCategory,
      };
      const normLang = String(currentLang || 'en').trim().toLowerCase();
      resultCacheRef.current = resultHasTargetScript(finalResult, normLang) ? { [normLang]: finalResult } : {};
      setResult(finalResult);

      try {
        localStorage.setItem(
          'aegea_offline_last_guide_v1',
          JSON.stringify({ city: effectiveCity, result: finalResult })
        );
      } catch {
        // ignore storage quota errors
      }

      // Decrement trial search count in Firestore
      if (!user.isPremium && !user.isAdmin) {
        await onDecrementSearch();
      }

      // Persist search summary in Firestore for cross-device history
      const searchId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const searchPath = `users/${user.uid}/searches/${searchId}`;
      const historyLabel =
        atmosphere !== 'any'
          ? `${effectiveCityLabel} · ${selectedAtmosphereObj.label} · ${selectedFoodObj.label}`
          : `${effectiveCityLabel} · ${selectedFoodObj.label}`;
      const sanitizedLang = String(currentLang || 'en').trim().slice(0, 40);
      const safeFirestoreLang = sanitizedLang.length >= 2 ? sanitizedLang : 'en';

      try {
        await setDoc(doc(db, searchPath), {
          id: searchId,
          userId: user.uid,
          prompt: historyLabel.slice(0, 1000),
          region: effectiveCity.slice(0, 100),
          mood: `${guideCategory}|${atmosphere}`.slice(0, 100),
          dietary: foodType.slice(0, 100),
          language: safeFirestoreLang,
          summary: String(data.summary || '').slice(0, 4000),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, searchPath);
      }

      setTimeout(() => {
        const resultsEl = document.getElementById('matchmaker-results');
        if (resultsEl) {
          resultsEl.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    } catch (error: any) {
      const msg = String(error?.message || '');
      const isNetworkInterruption =
        error?.name === 'AbortError' ||
        /failed to fetch|networkerror|load failed|network request failed|aborted/i.test(msg);
      if (isNetworkInterruption) {
        console.warn('Live search connection interrupted:', msg || error?.name);
        setErrorMsg(t.matchmaker.warmingUpError);
      } else {
        console.error('Live search error:', error);
        setErrorMsg(msg && !msg.includes('{') ? msg : t.matchmaker.searchFailedError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateItinerary = async () => {
    if (!user || !auth.currentUser) {
      onOpenSignIn();
      return;
    }
    if (!user.isPremium && !user.isAdmin) {
      onOpenPremium();
      return;
    }
    if (!result) return;

    setIsGeneratingItinerary(true);
    setItineraryError(null);

    try {
      const idToken = await auth.currentUser.getIdToken();
      const selectedCityObj = citiesList.find((c) => c.value === city) || citiesList[0];
      const selectedFoodObj = foodTypesList.find((f) => f.value === foodType) || foodTypesList[0];
      const payloadBody = JSON.stringify({
        city: selectedCityObj.value,
        foodType: selectedFoodObj.label,
        language: getLanguageEnglishName(currentLang),
        guideResult: result,
      });

      const callItineraryApi = async () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 25000);
        try {
          const res = await fetch(apiUrl('/api/itinerary'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: payloadBody,
            signal: controller.signal,
          });
          const rawText = await res.text();
          let parsed: any = null;
          try {
            parsed = rawText ? JSON.parse(rawText) : null;
          } catch {
            parsed = null;
          }
          return { res, rawText, parsed };
        } finally {
          window.clearTimeout(timeoutId);
        }
      };

      let { res, rawText, parsed } = await callItineraryApi();
      if ((!parsed && rawText.trim().toLowerCase().startsWith('<!doctype')) || (res.status >= 502 && res.status <= 504)) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        ({ res, rawText, parsed } = await callItineraryApi());
      }

      if (!res.ok || !parsed?.itinerary) {
        throw new Error(parsed?.error || 'Could not generate 3-day itinerary.');
      }

      const normLang = String(currentLang || 'en').trim().toLowerCase();
      itineraryCacheRef.current = { [normLang]: parsed.itinerary };
      setItinerary(parsed.itinerary);
    } catch (err: any) {
      const msg = String(err?.message || '');
      const isNetworkInterruption =
        err?.name === 'AbortError' ||
        /failed to fetch|networkerror|load failed|network request failed|aborted/i.test(msg);
      if (isNetworkInterruption) {
        console.warn('Itinerary connection interrupted:', msg || err?.name);
        setItineraryError(t.matchmaker.warmingUpError);
      } else {
        console.error('Itinerary generation error:', err);
        setItineraryError(msg && !msg.includes('{') ? msg : t.matchmaker.searchFailedError);
      }
    } finally {
      setIsGeneratingItinerary(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!user || !auth.currentUser) {
      onOpenSignIn();
      return;
    }
    if (!user.isPremium && !user.isAdmin) {
      onOpenPremium();
      return;
    }
    if (!result) return;

    setIsDownloadingPdf(true);
    setItineraryError(null);
    try {
      const selectedCityObj = citiesList.find((c) => c.value === city) || citiesList[0];
      await generateExecutivePdf({
        result,
        itinerary,
        cityLabel: selectedCityObj.label,
        user,
        currentLang,
        todayFormatted,
        t,
      });
    } catch (err: any) {
      console.error('PDF generation error:', err);
      setItineraryError(err?.message || 'Could not generate PDF right now.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const hasVerifiedImage = (url: string | undefined, keyId: string): boolean => {
    return Boolean(url && url.trim().length > 0 && !failedImages[keyId]);
  };

  const normalizeWebsiteUrl = (url?: string): string | null => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return null;
  };

  const renderVerifiedCardImage = (
    url: string | undefined,
    alt: string,
    keyId: string,
    heightClass: string
  ) => {
    if (!hasVerifiedImage(url, keyId)) return null;
    return (
      <div className="bg-slate-100 dark:bg-slate-800">
        <img
          src={url}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailedImages((prev) => ({ ...prev, [keyId]: true }))}
          className={`w-full ${heightClass} object-cover`}
        />
      </div>
    );
  };

  const renderNoPhotoNotice = (
    isHotel: boolean,
    websiteUrl: string | null,
    mapsQuery: string
  ) => (
    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
        {isHotel ? t.matchmaker.noPhotoHotelNote : t.matchmaker.noPhotoPlaceNote}
      </p>
      <div className="flex flex-wrap items-center gap-4 pt-0.5 print:hidden">
        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sky-700 dark:text-sky-400 font-semibold hover:underline"
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>{t.matchmaker.visitWebsite}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        )}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sky-700 dark:text-sky-400 font-semibold hover:underline"
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{t.matchmaker.viewPhotosOnMaps}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      </div>
    </div>
  );

  const isFavorited = (itemType: FavoriteItemType, englishOrName: string, displayName: string): boolean => {
    const safeId = `${itemType}_${englishOrName}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 96);
    return favorites.some(
      (f) =>
        (safeId && f.id === safeId) ||
        (f.itemType === itemType && (f.englishName === englishOrName || f.name === displayName))
    );
  };

  const renderFavoriteButton = (payload: Omit<FavoriteItem, 'id' | 'userId' | 'createdAt'>) => {
    const saved = isFavorited(payload.itemType, payload.englishName, payload.name);
    return (
      <button
        type="button"
        onClick={() => onToggleFavorite?.(payload)}
        title={saved ? t.favorites?.savedBadge || 'Saved' : t.favorites?.saveBtn || 'Save to Trip'}
        aria-label={saved ? t.favorites?.savedBadge || 'Saved' : t.favorites?.saveBtn || 'Save to Trip'}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer print:hidden shrink-0 ${
          saved
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400'
            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400'
        }`}
      >
        <Heart className={`w-3.5 h-3.5 shrink-0 ${saved ? 'fill-rose-500 text-rose-500' : ''}`} />
        <span>{saved ? t.favorites?.savedBadge || 'Saved' : t.favorites?.saveBtn || 'Save'}</span>
      </button>
    );
  };

  // Section renderers ordered by rank (#1 best downward)
  const renderTavernasSection = () =>
    result && result.tavernas && result.tavernas.length > 0 ? (
      <div key="sec-tavernas" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <UtensilsCrossed className="w-6 h-6 text-sky-700 dark:text-sky-400 shrink-0" />
            <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {t.matchmaker.tavernasTitle}
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t.matchmaker.rankedNotice}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {result.tavernas.map((tavern, idx) => {
            const keyId = `tavern-${tavern.id}-${idx}`;
            const hasImg = hasVerifiedImage(tavern.imageUrl, keyId);
            const website = normalizeWebsiteUrl(tavern.officialWebsite);
            const mapsQuery = `${tavern.englishName || tavern.name} ${tavern.location}`;
            const rankNum = tavern.rank ?? idx + 1;

            return (
              <article
                key={tavern.id || keyId}
                className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                {renderVerifiedCardImage(tavern.imageUrl, tavern.name, keyId, 'h-52')}

                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-sky-700 dark:text-sky-400 tabular-nums shrink-0">
                          #{rankNum}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{tavern.region}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                          {tavern.rating}
                        </span>
                        {renderFavoriteButton({
                          itemType: 'taverna',
                          name: tavern.name,
                          englishName: tavern.englishName || tavern.name,
                          greekName: tavern.greekName || '',
                          region: tavern.region || tavern.location || '',
                          description: tavern.description || '',
                          officialWebsite: website || '',
                          imageUrl: hasImg ? tavern.imageUrl || '' : '',
                          priceLevel: tavern.priceLevel || '€€',
                        })}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                        {tavern.name}
                      </h3>
                      <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                        {tavern.greekName}
                      </p>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {tavern.description}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {tavern.atmosphere && (
                      <div className="text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-800 dark:text-slate-200">
                          {t.matchmaker.atmosphere}:
                        </strong>{' '}
                        {tavern.atmosphere}
                      </div>
                    )}

                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">
                        {t.matchmaker.signatureDishes}:
                      </span>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        {(tavern.signatureDishes || []).join(' · ')}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <span className="font-semibold text-slate-900 dark:text-white block">
                        {t.matchmaker.insiderTip}
                      </span>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                        {tavern.insiderTip}
                      </p>
                    </div>

                    {(tavern.operatingStatus || tavern.openingHours || tavern.establishedYear) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                        {tavern.operatingStatus && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{tavern.operatingStatus}</span>
                          </span>
                        )}
                        {tavern.establishedYear && (
                          <span className="text-slate-500 dark:text-slate-400">
                            · {tavern.establishedYear}
                          </span>
                        )}
                        {tavern.openingHours && (
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <Clock className="w-3 h-3 shrink-0 text-sky-600 dark:text-sky-400" />
                            <span>{tavern.openingHours}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {!hasImg && renderNoPhotoNotice(false, website, mapsQuery)}

                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                        {t.matchmaker.price}: {tavern.priceLevel}
                      </span>
                      <span className="truncate text-[11px]">{tavern.location}</span>
                    </div>

                    <PlaceActionLinks
                      kind="taverna"
                      name={tavern.name}
                      englishName={tavern.englishName}
                      location={tavern.location}
                      region={tavern.region}
                      officialWebsite={website}
                      bookingUrl={tavern.bookingUrl}
                      coordinates={tavern.coordinates}
                      labels={{
                        googleMapsLabel: t.matchmaker.googleMapsLabel,
                        previewAndBookSite: t.matchmaker.previewAndBookSite,
                        previewAndBookPlatform: t.matchmaker.previewAndBookPlatform,
                        otherPlatformsLabel: t.matchmaker.otherPlatformsLabel,
                        googleReviewsLabel: t.matchmaker.googleReviewsLabel,
                        checkHotelRates: t.matchmaker.checkHotelRates,
                        bookTicketsAndTours: t.matchmaker.bookTicketsAndTours,
                      }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    ) : null;

  const renderHotelsSection = () =>
    result && result.hotels && result.hotels.length > 0 ? (
      <div key="sec-hotels" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-sky-700 dark:text-sky-400 shrink-0" />
            <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {t.matchmaker.hotelsTitle}
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t.matchmaker.rankedNotice}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {result.hotels.map((hotel, idx) => {
            const keyId = `hotel-${hotel.id}-${idx}`;
            const hasImg = hasVerifiedImage(hotel.imageUrl, keyId);
            const website = normalizeWebsiteUrl(hotel.officialWebsite);
            const mapsQuery = `${hotel.englishName || hotel.name} ${hotel.location}`;
            const bookingQuery = `${hotel.englishName || hotel.name} ${hotel.region || hotel.location} Greece`;
            const rankNum = hotel.rank ?? idx + 1;

            return (
              <article
                key={hotel.id || keyId}
                className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                {renderVerifiedCardImage(hotel.imageUrl, hotel.name, keyId, 'h-52')}

                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-sky-700 dark:text-sky-400 tabular-nums shrink-0">
                          #{rankNum}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {hotel.category} · {hotel.region}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                          {hotel.rating}
                        </span>
                        {renderFavoriteButton({
                          itemType: 'hotel',
                          name: hotel.name,
                          englishName: hotel.englishName || hotel.name,
                          greekName: hotel.greekName || '',
                          region: hotel.region || hotel.location || '',
                          description: hotel.description || '',
                          officialWebsite: website || '',
                          imageUrl: hasImg ? hotel.imageUrl || '' : '',
                          priceLevel: hotel.priceLevel || '€€',
                        })}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                        {hotel.name}
                      </h3>
                      <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                        {hotel.greekName}
                      </p>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {hotel.description}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">
                        {t.matchmaker.amenitiesLabel}:
                      </span>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        {(hotel.amenities || []).join(' · ')}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <span className="font-semibold text-slate-900 dark:text-white block">
                        {t.matchmaker.insiderTip}
                      </span>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                        {hotel.insiderTip}
                      </p>
                    </div>

                    {(hotel.operatingStatus || hotel.openingHours || hotel.establishedYear) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                        {hotel.operatingStatus && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{hotel.operatingStatus}</span>
                          </span>
                        )}
                        {hotel.establishedYear && (
                          <span className="text-slate-500 dark:text-slate-400">
                            · {hotel.establishedYear}
                          </span>
                        )}
                        {hotel.openingHours && (
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <Clock className="w-3 h-3 shrink-0 text-sky-600 dark:text-sky-400" />
                            <span>{hotel.openingHours}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {!hasImg && renderNoPhotoNotice(true, website, mapsQuery)}

                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                        {t.matchmaker.price}: {hotel.priceLevel}
                      </span>
                      <span className="truncate text-[11px]">{hotel.location}</span>
                    </div>

                    <PlaceActionLinks
                      kind="hotel"
                      name={hotel.name}
                      englishName={hotel.englishName}
                      location={hotel.location}
                      region={hotel.region}
                      officialWebsite={website}
                      bookingUrl={hotel.bookingUrl}
                      labels={{
                        googleMapsLabel: t.matchmaker.googleMapsLabel,
                        previewAndBookSite: t.matchmaker.previewAndBookSite,
                        previewAndBookPlatform: t.matchmaker.previewAndBookPlatform,
                        otherPlatformsLabel: t.matchmaker.otherPlatformsLabel,
                        googleReviewsLabel: t.matchmaker.googleReviewsLabel,
                        checkHotelRates: t.matchmaker.checkHotelRates,
                        bookTicketsAndTours: t.matchmaker.bookTicketsAndTours,
                      }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    ) : null;

  const renderArchaeologicalSection = () =>
    result && result.archaeologicalSites && result.archaeologicalSites.length > 0 ? (
      <div key="sec-arch" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Landmark className="w-6 h-6 text-sky-700 dark:text-sky-400 shrink-0" />
            <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {t.matchmaker.archaeologicalTitle}
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t.matchmaker.rankedNotice}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {result.archaeologicalSites.map((site, idx) => {
            const keyId = `arch-${site.id}-${idx}`;
            const hasImg = hasVerifiedImage(site.imageUrl, keyId);
            const website = normalizeWebsiteUrl(site.officialWebsite);
            const mapsQuery = `${site.englishName || site.name} ${site.location}`;
            const tourQuery = `${site.englishName || site.name} ${site.region} skip the line`;
            const rankNum = site.rank ?? idx + 1;

            return (
              <article
                key={site.id || keyId}
                className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                {renderVerifiedCardImage(site.imageUrl, site.name, keyId, 'h-52')}

                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-sky-700 dark:text-sky-400 tabular-nums shrink-0">
                          #{rankNum}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{site.region}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-amber-700 dark:text-amber-400 truncate max-w-[140px]">
                          {site.era}
                        </span>
                        {renderFavoriteButton({
                          itemType: 'site',
                          name: site.name,
                          englishName: site.englishName || site.name,
                          greekName: site.greekName || '',
                          region: site.region || site.location || '',
                          description: site.description || '',
                          officialWebsite: website || '',
                          imageUrl: hasImg ? site.imageUrl || '' : '',
                          priceLevel: '',
                        })}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                        {site.name}
                      </h3>
                      <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                        {site.greekName}
                      </p>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {site.description}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">
                        {t.matchmaker.highlightsLabel}:
                      </span>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        {(site.highlights || []).join(' · ')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>
                        <strong>{t.matchmaker.bestTime}:</strong> {site.bestTimeToVisit}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <span className="font-semibold text-slate-900 dark:text-white block">
                        {t.matchmaker.insiderTip}
                      </span>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                        {site.insiderTip}
                      </p>
                    </div>

                    {((site.nearbyHotels && site.nearbyHotels.length > 0) ||
                      (site.nearbyRestaurants && site.nearbyRestaurants.length > 0)) && (
                      <div className="p-3.5 rounded-xl bg-sky-50/70 dark:bg-slate-800/90 border border-sky-200/80 dark:border-slate-700 space-y-2.5">
                        <span className="font-bold text-sky-900 dark:text-sky-300 flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5 shrink-0" />
                          <span>{t.matchmaker.aroundSiteTitle}</span>
                        </span>

                        {site.nearbyHotels && site.nearbyHotels.length > 0 && (
                          <div className="space-y-1">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>{t.matchmaker.nearbyHotelsTitle}:</span>
                            </span>
                            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                              {site.nearbyHotels.map((nh, hIdx) => (
                                <li key={hIdx} className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="min-w-0">
                                    <strong className="text-slate-900 dark:text-white">{nh.name}</strong>
                                    {nh.distance ? ` (${nh.distance})` : ''}
                                    {nh.note ? ` · ${nh.note}` : ''}
                                  </span>
                                  <div className="flex items-center gap-3 shrink-0 print:hidden">
                                    <a
                                      href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(
                                        `${nh.name} ${site.region} Greece`
                                      )}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-amber-700 dark:text-amber-400 font-semibold hover:underline"
                                    >
                                      {t.matchmaker.previewAndBookPlatform}
                                    </a>
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                        `${nh.name} ${site.region} Greece`
                                      )}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sky-700 dark:text-sky-400 font-semibold hover:underline"
                                    >
                                      {t.matchmaker.googleMapsLabel}
                                    </a>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {site.nearbyRestaurants && site.nearbyRestaurants.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-sky-200/60 dark:border-slate-700">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                              <UtensilsCrossed className="w-3 h-3 text-sky-700 dark:text-sky-400 shrink-0" />
                              <span>{t.matchmaker.nearbyRestaurantsTitle}:</span>
                            </span>
                            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                              {site.nearbyRestaurants.map((nr, rIdx) => (
                                <li key={rIdx} className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="min-w-0">
                                    <strong className="text-slate-900 dark:text-white">{nr.name}</strong>
                                    {nr.type ? ` · ${nr.type}` : ''}
                                    {nr.distance ? ` (${nr.distance})` : ''}
                                    {nr.specialty || nr.note ? ` — ${nr.specialty || nr.note}` : ''}
                                  </span>
                                  <div className="flex items-center gap-3 shrink-0 print:hidden">
                                    <a
                                      href={`https://www.tripadvisor.com/Search?q=${encodeURIComponent(
                                        `${nr.name} ${site.region} Greece`
                                      )}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-amber-700 dark:text-amber-400 font-semibold hover:underline"
                                    >
                                      {t.matchmaker.previewAndBookPlatform}
                                    </a>
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                        `${nr.name} ${site.region} Greece`
                                      )}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sky-700 dark:text-sky-400 font-semibold hover:underline"
                                    >
                                      {t.matchmaker.googleMapsLabel}
                                    </a>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {(site.operatingStatus || site.openingHours) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                        {site.operatingStatus && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{site.operatingStatus}</span>
                          </span>
                        )}
                        {site.openingHours && (
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <Clock className="w-3 h-3 shrink-0 text-sky-600 dark:text-sky-400" />
                            <span>{site.openingHours}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {!hasImg && renderNoPhotoNotice(false, website, mapsQuery)}

                    <div className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="truncate block" title={site.nearbyTavernaSuggestion}>
                        <strong>{t.matchmaker.nearbyTavernaLabel}:</strong> {site.nearbyTavernaSuggestion}
                      </span>
                    </div>

                    <PlaceActionLinks
                      kind="site"
                      name={site.name}
                      englishName={site.englishName}
                      location={site.location}
                      region={site.region}
                      officialWebsite={website}
                      bookingUrl={site.bookingUrl}
                      labels={{
                        googleMapsLabel: t.matchmaker.googleMapsLabel,
                        previewAndBookSite: t.matchmaker.previewAndBookSite,
                        previewAndBookPlatform: t.matchmaker.previewAndBookPlatform,
                        otherPlatformsLabel: t.matchmaker.otherPlatformsLabel,
                        googleReviewsLabel: t.matchmaker.googleReviewsLabel,
                        checkHotelRates: t.matchmaker.checkHotelRates,
                        bookTicketsAndTours: t.matchmaker.bookTicketsAndTours,
                      }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    ) : null;

  const activeFocus = result?.guideCategory || guideCategory;
  const hasVipAccess = Boolean(user?.isPremium || user?.isAdmin);

  return (
    <div className="space-y-12 pb-16">
      {/* 2-Column Editorial Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch print:hidden">
        <div className="lg:col-span-7 flex flex-col justify-between bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-10 space-y-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{todayFormatted}</span>
              <span aria-hidden="true">·</span>
              <span className="text-sky-700 dark:text-sky-400 font-semibold">
                {t.matchmaker.heroKicker}
              </span>
              <span aria-hidden="true">·</span>
              <span>{t.matchmaker.allDevicesTag}</span>
            </div>

            <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight text-balance">
              {t.matchmaker.heroTitle}
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
              {t.matchmaker.heroSubtitle}
            </p>

            {onOpenTranslator && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onOpenTranslator}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 text-sky-800 dark:text-sky-300 text-xs sm:text-sm font-semibold border border-sky-200/80 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  <Languages className="w-4 h-4 shrink-0" />
                  <span>{t.nav.translator || 'Live Translator'}</span>
                </button>
              </div>
            )}
          </div>

          {/* User Quota / Sign-In Bar */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            {user ? (
              user.isAdmin ? (
                <p className="text-xs sm:text-sm font-semibold text-sky-700 dark:text-sky-400">
                  {t.matchmaker.adminUnlimitedNotice}
                </p>
              ) : user.isPremium ? (
                <p className="text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {t.matchmaker.vipUnlimitedNotice}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                    {user.searchesRemaining > 0
                      ? String(t.monetization.freeSearchesLeftTemplate || '{count} / 2').replace(
                          '{count}',
                          String(user.searchesRemaining)
                        )
                      : t.monetization.outOfSearchesTitle}
                  </span>
                  <button
                    type="button"
                    onClick={onOpenPremium}
                    className="text-sky-700 dark:text-sky-400 font-bold underline hover:text-sky-800 cursor-pointer"
                  >
                    {t.monetization.upgradeButton}
                  </button>
                </div>
              )
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {t.auth.signInPrompt}
                </span>
                <button
                  type="button"
                  onClick={onOpenSignIn}
                  className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {t.auth.signInWithGoogle}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hero Photography */}
        <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 min-h-[240px]">
          <img
            src={HERO_IMAGE}
            alt="Authentic seaside Greek taverna overlooking the Aegean Sea"
            className="w-full h-full min-h-[240px] object-cover"
          />
        </div>
      </section>

      {/* Structured City + Preferred Food + Comprehensive Guide Search Console */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 space-y-6 print:hidden">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs sm:text-sm flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="text-xs font-bold underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.matchmaker.retryLabel}
            </button>
          </div>
        )}

        {/* Primary Two Selectors: Greek Region/Prefecture + Preferred Food Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label
              htmlFor="greek-city-select"
              className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"
            >
              <MapPin className="w-4 h-4 text-sky-700 dark:text-sky-400" />
              <span>{t.matchmaker.cityLabel}</span>
            </label>
            <select
              id="greek-city-select"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                if (customCity) setCustomCity('');
              }}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600 cursor-pointer"
            >
              {citiesList.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={customCity}
              onChange={(e) => setCustomCity(e.target.value)}
              placeholder={t.matchmaker.customCityPlaceholder}
              aria-label={t.matchmaker.customCityLabel}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="preferred-food-select"
              className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"
            >
              <UtensilsCrossed className="w-4 h-4 text-sky-700 dark:text-sky-400" />
              <span>{t.matchmaker.foodTypeLabel}</span>
            </label>
            <select
              id="preferred-food-select"
              value={foodType}
              onChange={(e) => setFoodType(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600 cursor-pointer"
            >
              {foodTypesList.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preferred Atmosphere & Style Selector (Seaside, Beach, Quiet, Romantic, Traditional, Lively, Historic) */}
        <div className="space-y-2.5">
          <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Waves className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <span>{t.matchmaker.atmosphereLabel}</span>
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {atmospheresList.map((item) => {
              const active = atmosphere === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setAtmosphere(item.value)}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors border text-start cursor-pointer flex items-center gap-2 ${
                    active
                      ? 'bg-sky-700 text-white border-sky-700'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {item.value === 'any' && <Sparkles className="w-4 h-4 shrink-0" />}
                  {item.value === 'seaside' && <Waves className="w-4 h-4 shrink-0" />}
                  {item.value === 'beach' && <Umbrella className="w-4 h-4 shrink-0" />}
                  {item.value === 'quiet' && <Moon className="w-4 h-4 shrink-0" />}
                  {item.value === 'romantic' && <Sunset className="w-4 h-4 shrink-0" />}
                  {item.value === 'traditional' && <Home className="w-4 h-4 shrink-0" />}
                  {item.value === 'lively' && <Music className="w-4 h-4 shrink-0" />}
                  {item.value === 'historic' && <Columns3 className="w-4 h-4 shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Guide Focus Selector (All / Tavernas & Bars / Hotels / Archaeological Sites) */}
        <div className="space-y-2.5">
          <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Compass className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <span>{t.matchmaker.guideCategoryLabel}</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {categoriesList.map((cat) => {
              const active = guideCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setGuideCategory(cat.value)}
                  className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors border text-start cursor-pointer flex items-center gap-2 ${
                    active
                      ? 'bg-sky-700 text-white border-sky-700'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat.value === 'all' && <Compass className="w-4 h-4 shrink-0" />}
                  {cat.value === 'tavernas' && <UtensilsCrossed className="w-4 h-4 shrink-0" />}
                  {cat.value === 'hotels' && <Building2 className="w-4 h-4 shrink-0" />}
                  {cat.value === 'archaeological' && <Landmark className="w-4 h-4 shrink-0" />}
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Extra Notes (not required) */}
        <div className="space-y-1.5">
          <label
            htmlFor="optional-notes-input"
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 block"
          >
            {t.matchmaker.optionalNotesLabel}
          </label>
          <input
            id="optional-notes-input"
            type="text"
            value={optionalNotes}
            onChange={(e) => setOptionalNotes(e.target.value)}
            placeholder={t.matchmaker.optionalNotesPlaceholder}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-600"
          />
        </div>

        {/* Submit Search Action */}
        <div className="pt-1">
          {user && !user.isAdmin && !user.isPremium && user.searchesRemaining <= 0 ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <span>{t.monetization.outOfSearchesTitle}</span>
                </p>
                <p className="text-xs text-amber-900 dark:text-amber-300">
                  {t.monetization.outOfSearchesDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenPremium}
                className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {t.monetization.upgradeButton}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSearch}
              className="w-full py-3.5 px-6 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t.matchmaker.findingButton}</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>{t.matchmaker.findButton}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Cross-Device Recent Search History */}
        {user && recentSearches.length > 0 && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <History className="w-3.5 h-3.5" />
              <span>{t.matchmaker.recentSearchesTitle}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.region) {
                      if (CITY_KEYS.includes(item.region)) {
                        setCity(item.region);
                        setCustomCity('');
                      } else {
                        setCustomCity(item.region);
                      }
                    }
                    if (item.dietary) setFoodType(item.dietary);
                    const [savedCat, savedAtmos] = String(item.mood || '').split('|');
                    if (
                      savedCat === 'all' ||
                      savedCat === 'tavernas' ||
                      savedCat === 'hotels' ||
                      savedCat === 'archaeological'
                    ) {
                      setGuideCategory(savedCat);
                    }
                    if (
                      savedAtmos === 'any' ||
                      savedAtmos === 'seaside' ||
                      savedAtmos === 'beach' ||
                      savedAtmos === 'quiet' ||
                      savedAtmos === 'romantic' ||
                      savedAtmos === 'traditional' ||
                      savedAtmos === 'lively' ||
                      savedAtmos === 'historic'
                    ) {
                      setAtmosphere(savedAtmos);
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[300px] cursor-pointer"
                >
                  {item.prompt}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* COMPREHENSIVE GREECE GUIDE RESULTS */}
      {result && (
        <section id="matchmaker-results" className="space-y-12">
          {/* Non-blocking Live Translation Indicator */}
          {isTranslatingResult && (
            <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 text-xs font-semibold flex items-center gap-2.5 print:hidden">
              <Languages className="w-4 h-4 animate-pulse shrink-0" />
              <span>{t.matchmaker.translatingResults}</span>
            </div>
          )}

          {/* Narrative Summary + Real Verified Google Search Sources */}
          <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-editorial text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {t.matchmaker.resultsTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-3 print:hidden">
                <button
                  type="button"
                  disabled={isDownloadingPdf}
                  onClick={handleDownloadPdf}
                  className="px-3.5 py-2 bg-slate-900 dark:bg-sky-700 hover:bg-slate-800 dark:hover:bg-sky-600 disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {isDownloadingPdf
                      ? t.matchmaker.itinerary?.downloadingPdfBtn || 'Generating PDF...'
                      : t.matchmaker.itinerary?.printGuideBtn || 'Download Executive PDF'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setItinerary(null);
                    resultCacheRef.current = {};
                    itineraryCacheRef.current = {};
                    setOptionalNotes('');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-xs text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-sky-400 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t.matchmaker.newSearch}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t.matchmaker.activeNowBadge}</span>
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <Calendar className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                <span>
                  {t.matchmaker.verifiedDateLabel}: {todayFormatted}
                </span>
              </span>
            </div>

            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
              {result.summary}
            </p>

            {/* Real Grounded Web Sources from Google Search when available */}
            {result.groundingSources && result.groundingSources.length > 0 && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 print:hidden">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t.matchmaker.googleSourcesTitle}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {result.groundingSources.slice(0, user?.isAdmin ? 12 : 6).map((src, i) => (
                    <a
                      key={i}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
                    >
                      <span className="truncate max-w-[220px]">{src.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Order Primary Guide Sections Based on Selected Guide Focus */}
          {activeFocus === 'hotels'
            ? [renderHotelsSection(), renderArchaeologicalSection(), renderTavernasSection()]
            : activeFocus === 'archaeological'
            ? [renderArchaeologicalSection(), renderTavernasSection(), renderHotelsSection()]
            : [renderTavernasSection(), renderHotelsSection(), renderArchaeologicalSection()]}

          {/* Recommended Traditional Dishes */}
          {result.dishes && result.dishes.length > 0 && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                  {t.matchmaker.dishesRecommendationTitle}
                </h2>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.matchmaker.rankedNotice}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {result.dishes.map((dish, idx) => {
                  const keyId = `dish-${dish.id}-${idx}`;
                  const rankNum = dish.rank ?? idx + 1;
                  return (
                    <article
                      key={dish.id || keyId}
                      className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
                    >
                      {renderVerifiedCardImage(dish.imageUrl, dish.name, keyId, 'h-44')}

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-sky-700 dark:text-sky-400 tabular-nums shrink-0">
                              #{rankNum}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{dish.regionOfOrigin}</span>
                          </div>

                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug">
                              {dish.name}
                            </h3>
                            <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                              {renderFavoriteButton({
                                itemType: 'dish',
                                name: dish.name,
                                englishName: dish.englishName || dish.name,
                                greekName: dish.greekName || '',
                                region: dish.regionOfOrigin || '',
                                description: dish.description || '',
                                officialWebsite: '',
                                imageUrl: hasVerifiedImage(dish.imageUrl, keyId) ? dish.imageUrl || '' : '',
                                priceLevel: '',
                              })}
                              <button
                                type="button"
                                onClick={() => handleSpeakPhrase(dish.greekName)}
                                className="p-1.5 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0 cursor-pointer"
                                title={t.matchmaker.pronounceLabel}
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                            <span className="font-serif font-bold text-sky-800 dark:text-sky-300">
                              {dish.greekName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px]">{dish.pronunciation}</span>
                          </div>

                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 pt-1 leading-relaxed">
                            {dish.description}
                          </p>
                        </div>

                        <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                          <p className="text-slate-600 dark:text-slate-400">
                            <strong className="text-slate-800 dark:text-slate-200">
                              {t.matchmaker.ingredients}:
                            </strong>{' '}
                            {(dish.ingredients || []).join(', ')}
                          </p>

                          <div className="flex items-center gap-1.5 text-sky-800 dark:text-sky-300 font-semibold">
                            <Wine className="w-3.5 h-3.5 shrink-0" />
                            <span>{dish.pairingDrink}</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hidden Scenic Gems */}
          {result.hiddenGems && result.hiddenGems.length > 0 && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                  {t.matchmaker.hiddenGemsTitle}
                </h2>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.matchmaker.rankedNotice}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {result.hiddenGems.map((gem, idx) => {
                  const keyId = `gem-${gem.id}-${idx}`;
                  const hasImg = hasVerifiedImage(gem.imageUrl, keyId);
                  const website = normalizeWebsiteUrl(gem.officialWebsite);
                  const mapsQuery = `${gem.englishName || gem.title} ${gem.region}`;
                  const rankNum = gem.rank ?? idx + 1;

                  return (
                    <article
                      key={gem.id || keyId}
                      className={`bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col ${
                        hasImg ? 'sm:flex-row' : ''
                      }`}
                    >
                      {hasImg && (
                        <div className="sm:w-2/5 bg-slate-100 dark:bg-slate-800">
                          <img
                            src={gem.imageUrl}
                            alt={gem.title}
                            referrerPolicy="no-referrer"
                            onError={() => setFailedImages((prev) => ({ ...prev, [keyId]: true }))}
                            className="w-full h-48 sm:h-full object-cover"
                          />
                        </div>
                      )}

                      <div
                        className={`p-5 ${
                          hasImg ? 'sm:w-3/5' : 'w-full'
                        } flex flex-col justify-between space-y-3`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-sky-700 dark:text-sky-400 tabular-nums shrink-0">
                                #{rankNum}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{gem.region}</span>
                            </div>
                            {renderFavoriteButton({
                              itemType: 'gem',
                              name: gem.title,
                              englishName: gem.englishName || gem.title,
                              greekName: gem.greekTitle || '',
                              region: gem.region || '',
                              description: gem.description || '',
                              officialWebsite: website || '',
                              imageUrl: hasImg ? gem.imageUrl || '' : '',
                              priceLevel: '',
                            })}
                          </div>
                          <h3 className="font-bold text-base text-slate-900 dark:text-white leading-tight">
                            {gem.title}
                          </h3>
                          <p className="text-xs text-sky-700 dark:text-sky-400 font-medium">
                            {gem.greekTitle}
                          </p>
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 pt-1 leading-relaxed">
                            {gem.description}
                          </p>
                        </div>

                        {!hasImg && renderNoPhotoNotice(false, website, mapsQuery)}

                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                          {(gem.operatingStatus || gem.openingHours) && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                              {gem.operatingStatus && (
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>{gem.operatingStatus}</span>
                                </span>
                              )}
                              {gem.openingHours && (
                                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                  <Clock className="w-3 h-3 shrink-0 text-sky-600 dark:text-sky-400" />
                                  <span>{gem.openingHours}</span>
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                            <span>
                              <strong>{t.matchmaker.bestTime}:</strong> {gem.bestTimeToVisit}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="truncate">{gem.nearbyTavernaSuggestion}</span>
                          </div>

                          <PlaceActionLinks
                            kind="gem"
                            name={gem.title}
                            englishName={gem.englishName}
                            location={gem.region}
                            region={gem.region}
                            officialWebsite={website}
                            bookingUrl={gem.bookingUrl}
                            labels={{
                              googleMapsLabel: t.matchmaker.googleMapsLabel,
                              previewAndBookSite: t.matchmaker.previewAndBookSite,
                              previewAndBookPlatform: t.matchmaker.previewAndBookPlatform,
                              otherPlatformsLabel: t.matchmaker.otherPlatformsLabel,
                              googleReviewsLabel: t.matchmaker.googleReviewsLabel,
                              checkHotelRates: t.matchmaker.checkHotelRates,
                              bookTicketsAndTours: t.matchmaker.bookTicketsAndTours,
                            }}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIP 3-DAY TRAVEL, CULINARY & ARCHAEOLOGY ITINERARY + PRINTABLE PDF GUIDE */}
          <div
            id="vip-itinerary-section"
            className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-300 dark:border-amber-700/70 p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Calendar className="w-5 h-5 shrink-0" />
                  <h2 className="font-editorial text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    {t.matchmaker.itinerary?.sectionTitle}
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                  {t.matchmaker.itinerary?.sectionSubtitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 print:hidden">
                {hasVipAccess ? (
                  <>
                    <button
                      type="button"
                      disabled={isGeneratingItinerary}
                      onClick={handleGenerateItinerary}
                      className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>
                        {isGeneratingItinerary
                          ? t.matchmaker.itinerary?.generatingBtn
                          : t.matchmaker.itinerary?.generateBtn}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isDownloadingPdf}
                      onClick={handleDownloadPdf}
                      className="px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                    >
                      {isDownloadingPdf ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <FileDown className="w-4 h-4 shrink-0" />
                      )}
                      <span>
                        {isDownloadingPdf
                          ? t.matchmaker.itinerary?.downloadingPdfBtn || 'Generating PDF...'
                          : t.matchmaker.itinerary?.printGuideBtn}
                      </span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenPremium}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>{t.matchmaker.itinerary?.unlockCta}</span>
                  </button>
                )}
              </div>
            </div>

            {itineraryError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{itineraryError}</span>
              </div>
            )}

            {isTranslatingItinerary && (
              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 text-xs font-semibold flex items-center gap-2 print:hidden">
                <Languages className="w-4 h-4 animate-pulse shrink-0" />
                <span>{t.matchmaker.translatingResults}</span>
              </div>
            )}

            {!hasVipAccess && !itinerary && (
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>{t.matchmaker.itinerary?.previewBadge}</span>
                </p>
                <p className="leading-relaxed">{t.matchmaker.itinerary?.previewNote}</p>
              </div>
            )}

            {itinerary && (
              <div className="space-y-6 pt-2">
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-editorial text-lg font-bold text-slate-900 dark:text-white">
                      {itinerary.headline}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{itinerary.city}</p>
                  </div>
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-300 tabular-nums">
                    {t.matchmaker.itinerary?.totalBudgetLabel}: {itinerary.budgetSummary}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {(itinerary.days || []).map((day) => (
                    <div
                      key={day.dayNumber}
                      className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
                        <span className="font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                          #{day.dayNumber}
                        </span>
                        <span className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                          {day.estimatedDailyCost}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
                        {day.title}
                      </h4>
                      <div className="space-y-2 text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                          <strong className="text-slate-800 dark:text-slate-100">
                            {t.matchmaker.itinerary?.morningLabel}:
                          </strong>{' '}
                          {day.morning}
                        </p>
                        <p>
                          <strong className="text-slate-800 dark:text-slate-100">
                            {t.matchmaker.itinerary?.lunchLabel}:
                          </strong>{' '}
                          {day.lunchTaverna}
                        </p>
                        <p>
                          <strong className="text-slate-800 dark:text-slate-100">
                            {t.matchmaker.itinerary?.afternoonLabel}:
                          </strong>{' '}
                          {day.afternoon}
                        </p>
                        <p>
                          <strong className="text-slate-800 dark:text-slate-100">
                            {t.matchmaker.itinerary?.sunsetLabel}:
                          </strong>{' '}
                          {day.sunsetGem}
                        </p>
                        <p>
                          <strong className="text-slate-800 dark:text-slate-100">
                            {t.matchmaker.itinerary?.dinnerStayLabel}:
                          </strong>{' '}
                          {day.dinnerAndStay}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Essential Local Greek Phrases */}
          {result.localPhrases && result.localPhrases.length > 0 && (
            <div className="bg-slate-900 dark:bg-slate-900 text-white rounded-2xl border border-slate-800 p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-sky-400" />
                <h3 className="text-xl font-bold font-editorial text-white">
                  {t.matchmaker.diningPhrasesTitle}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {result.localPhrases.map((phrase, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="font-serif text-base font-bold text-sky-200">{phrase.greek}</p>
                      <p className="text-xs text-slate-400 font-mono">/{phrase.phonetic}/</p>
                      <p className="text-xs text-white font-semibold pt-1">{phrase.translation}</p>
                      <p className="text-xs text-slate-400 leading-snug">{phrase.meaning}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSpeakPhrase(phrase.greek)}
                      className={`p-2 rounded-lg transition-colors shrink-0 cursor-pointer print:hidden ${
                        playingPhrase === phrase.greek
                          ? 'bg-sky-500 text-white'
                          : 'bg-white/10 text-sky-300 hover:bg-white/20'
                      }`}
                      title={t.matchmaker.pronounceLabel}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* B2B Sponsored Partner Placement Strip */}
          {onOpenPartner && (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
              <div className="space-y-1">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>{t.matchmaker.partnerStripTitle}</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {t.matchmaker.partnerStripDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenPartner}
                className="px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                {t.matchmaker.partnerStripCta}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
