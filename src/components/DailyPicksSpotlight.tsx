import React, { useState, useEffect, useCallback } from 'react';
import {
  DailyPicksResult,
  FavoriteItem,
  HealthProfile,
  Language,
} from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import {
  fetchDailyAiPicks,
  getCachedDailyPicks,
  getTodayLocalDateKey,
} from '../utils/sessionClient';
import { PlaceActionLinks } from './PlaceActionLinks';
import {
  Calendar,
  Sparkles,
  UtensilsCrossed,
  Building2,
  Compass,
  HeartPulse,
  RefreshCw,
  Star,
  Clock,
  Volume2,
  Heart,
  Wine,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
} from 'lucide-react';

interface DailyPicksSpotlightProps {
  currentLang: Language;
  healthProfile: HealthProfile;
  onOpenHealthSettings: () => void;
  mode?: 'all' | 'culinary' | 'dish' | 'hotel' | 'trip';
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: Omit<FavoriteItem, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  onSearchFocusCity?: (cityName: string) => void;
}

export const DailyPicksSpotlight: React.FC<DailyPicksSpotlightProps> = ({
  currentLang,
  healthProfile,
  onOpenHealthSettings,
  mode = 'all',
  favorites = [],
  onToggleFavorite,
  onSearchFocusCity,
}) => {
  const { t } = useUiTranslation(currentLang);
  const dp = t.dailyPicks || {};
  const hpLabels = t.healthProfile || {};
  const condLabels = (hpLabels.conditions || {}) as Record<string, string>;

  const [dailyPicks, setDailyPicks] = useState<DailyPicksResult | null>(() =>
    getCachedDailyPicks(getTodayLocalDateKey(), currentLang, healthProfile)
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [playingText, setPlayingText] = useState<string | null>(null);

  const loadPicks = useCallback(
    async (forceRefresh = false) => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchDailyAiPicks({
          language: currentLang,
          healthProfile,
          forceRefresh,
        });
        setDailyPicks(res);
      } catch (err: any) {
        setErrorMsg(err?.message || dp.errorTitle || 'Could not load today’s AI picks.');
      } finally {
        setIsLoading(false);
      }
    },
    [currentLang, healthProfile, dp.errorTitle]
  );

  useEffect(() => {
    const cached = getCachedDailyPicks(getTodayLocalDateKey(), currentLang, healthProfile);
    if (cached) {
      setDailyPicks(cached);
      setErrorMsg(null);
    } else {
      loadPicks(false);
    }
  }, [currentLang, healthProfile, loadPicks]);

  const handleSpeakGreek = (text: string) => {
    if (!text) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'el-GR';
      u.rate = 0.85;
      u.onstart = () => setPlayingText(text);
      u.onend = () => setPlayingText(null);
      u.onerror = () => setPlayingText(null);
      window.speechSynthesis.speak(u);
    }
  };

  const todayFormatted = (() => {
    try {
      return new Intl.DateTimeFormat(currentLang || 'en', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date());
    } catch {
      return getTodayLocalDateKey();
    }
  })();

  const activeHealthCount =
    (healthProfile?.conditions?.length || 0) + (healthProfile?.allergiesOrNotes ? 1 : 0);

  const isSaved = (itemType: FavoriteItem['itemType'], eng: string, title: string) => {
    const safeId = `${itemType}_${eng}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 96);
    return favorites.some(
      (f) => f.id === safeId || (f.itemType === itemType && (f.englishName === eng || f.name === title))
    );
  };

  const renderFavBtn = (payload: Omit<FavoriteItem, 'id' | 'userId' | 'createdAt'>) => {
    if (!onToggleFavorite) return null;
    const saved = isSaved(payload.itemType, payload.englishName, payload.name);
    return (
      <button
        type="button"
        onClick={() => onToggleFavorite(payload)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
          saved
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400'
            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-300 hover:text-rose-600'
        }`}
      >
        <Heart className={`w-3.5 h-3.5 ${saved ? 'fill-rose-500 text-rose-500' : ''}`} />
        <span>{saved ? t.favorites?.savedBadge || 'Saved' : t.favorites?.saveBtn || 'Save'}</span>
      </button>
    );
  };

  const renderHeaderBar = () => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#0D5EAF] dark:text-sky-400">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>{dp.kicker || 'AI Daily Greece Spotlight'}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-[#0D5EAF] dark:text-sky-400 shrink-0" />
            <span>{todayFormatted}</span>
          </span>
        </div>

        <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-[#082F5E] dark:text-white leading-tight">
          {dp.title || 'Today’s Smart AI Picks'}
          {dailyPicks?.focusCity ? ` · ${dailyPicks.focusCity}` : ''}
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
          {dailyPicks?.themeHeadline || dp.subtitle}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenHealthSettings}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
            activeHealthCount > 0
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-400'
          }`}
        >
          <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            {activeHealthCount > 0
              ? `${dp.healthEditCta || 'Health Profile'} (${activeHealthCount})`
              : dp.healthSetupCta || 'Set Health Profile'}
          </span>
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() => loadPicks(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-60"
          title={dp.refreshBtn || 'Refresh'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-600' : ''}`} />
          <span>{dp.refreshBtn || 'Refresh'}</span>
        </button>
      </div>
    </div>
  );

  const renderHealthStrip = () => {
    if (activeHealthCount === 0 && !dailyPicks?.healthAdaptationSummary) return null;
    return (
      <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-emerald-950 dark:text-emerald-100">
          <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          {activeHealthCount > 0 ? (
            <span>
              <strong>{dp.healthActivePrefix || 'Tailored to:'}</strong>{' '}
              {healthProfile.conditions.map((c) => condLabels[c] || c).join(' · ')}
              {healthProfile.allergiesOrNotes
                ? `${healthProfile.conditions.length ? ' · ' : ''}${healthProfile.allergiesOrNotes}`
                : ''}
            </span>
          ) : (
            <span>{dailyPicks?.healthAdaptationSummary}</span>
          )}
        </div>
      </div>
    );
  };

  if (isLoading && !dailyPicks) {
    return (
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
        {renderHeaderBar()}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs sm:text-sm font-semibold text-sky-900 dark:text-sky-200">
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-sky-700 dark:text-sky-400" />
          <span>{dp.loadingNotice || 'Curating today’s AI picks...'}</span>
        </div>
        <div className={`grid grid-cols-1 ${mode === 'all' ? 'lg:grid-cols-3' : ''} gap-6`}>
          {(mode === 'all' ? [1, 2, 3] : [1]).map((n) => (
            <div
              key={n}
              className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-800/70 animate-pulse border border-slate-200 dark:border-slate-800"
            />
          ))}
        </div>
      </section>
    );
  }

  if (errorMsg && !dailyPicks) {
    return (
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4">
        {renderHeaderBar()}
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => loadPicks(true)}
            className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
          >
            {dp.retryBtn || 'Retry'}
          </button>
        </div>
      </section>
    );
  }

  if (!dailyPicks) return null;

  const { culinaryPick, dishPick, hotelPick, tripPick } = dailyPicks;
  const actionLabels = {
    googleMapsLabel: t.matchmaker.googleMapsLabel,
    previewAndBookSite: t.matchmaker.previewAndBookSite,
    previewAndBookPlatform: t.matchmaker.previewAndBookPlatform,
    otherPlatformsLabel: t.matchmaker.otherPlatformsLabel,
    googleReviewsLabel: t.matchmaker.googleReviewsLabel,
    checkHotelRates: t.matchmaker.checkHotelRates,
    bookTicketsAndTours: t.matchmaker.bookTicketsAndTours,
  };

  const renderCulinaryCard = () => {
    const imgKey = `daily-culinary-${dailyPicks.dateKey}`;
    const hasImg = Boolean(culinaryPick.imageUrl && !failedImages[imgKey]);
    return (
      <article className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
        {hasImg && (
          <div className="h-48 bg-slate-100 dark:bg-slate-800 relative">
            <img
              src={culinaryPick.imageUrl}
              alt={culinaryPick.name}
              referrerPolicy="no-referrer"
              onError={() => setFailedImages((p) => ({ ...p, [imgKey]: true }))}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-sky-700 dark:text-sky-400">
                <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
                <span>{dp.foodBadge || 'Restaurant of the Day'}</span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  {culinaryPick.rating}
                </span>
                {renderFavBtn({
                  itemType: 'taverna',
                  name: culinaryPick.name,
                  englishName: culinaryPick.englishName || culinaryPick.name,
                  greekName: culinaryPick.greekName || '',
                  region: culinaryPick.region || culinaryPick.location || '',
                  description: culinaryPick.description || '',
                  officialWebsite: culinaryPick.officialWebsite || '',
                  imageUrl: hasImg ? culinaryPick.imageUrl || '' : '',
                  priceLevel: culinaryPick.priceLevel || '€€',
                })}
              </div>
            </div>

            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                {culinaryPick.name}
              </h3>
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                {culinaryPick.greekName} · {culinaryPick.region}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {culinaryPick.description}
            </p>

            {/* Featured Dish Pick */}
            {dishPick && (
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/60 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-amber-900 dark:text-amber-300">
                    {dp.featuredDishLabel || 'Dish of the Day'}: {dishPick.name}
                  </span>
                  {dishPick.greekName && (
                    <button
                      type="button"
                      onClick={() => handleSpeakGreek(dishPick.greekName)}
                      className={`p-1 rounded-md cursor-pointer ${
                        playingText === dishPick.greekName
                          ? 'bg-amber-600 text-white'
                          : 'text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                      }`}
                      title={t.matchmaker.pronounceLabel}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-snug">
                  {dishPick.description}
                </p>
              </div>
            )}

            {culinaryPick.healthFitReason && (
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-0.5">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5 shrink-0" />
                  <span>{dp.healthFitLabel || 'Health-Matched Reason'}</span>
                </span>
                <p className="text-emerald-900 dark:text-emerald-100 leading-snug">
                  {culinaryPick.healthFitReason}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {t.matchmaker.price}: {culinaryPick.priceLevel}
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium truncate">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{culinaryPick.openingHours}</span>
              </span>
            </div>

            <PlaceActionLinks
              kind="taverna"
              name={culinaryPick.name}
              englishName={culinaryPick.englishName}
              location={culinaryPick.location}
              region={culinaryPick.region}
              officialWebsite={culinaryPick.officialWebsite || null}
              bookingUrl={culinaryPick.bookingUrl}
              coordinates={culinaryPick.coordinates}
              labels={actionLabels}
            />
          </div>
        </div>
      </article>
    );
  };

  const renderDishCard = () => {
    const imgKey = `daily-dish-${dailyPicks.dateKey}`;
    const hasImg = Boolean(dishPick.imageUrl && !failedImages[imgKey]);
    return (
      <article className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
        {hasImg && (
          <div className="h-52 bg-slate-100 dark:bg-slate-800">
            <img
              src={dishPick.imageUrl}
              alt={dishPick.name}
              referrerPolicy="no-referrer"
              onError={() => setFailedImages((p) => ({ ...p, [imgKey]: true }))}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{dp.dishBadge || 'Dish to Try Today'}</span>
              </span>
              <div className="flex items-center gap-1.5">
                {renderFavBtn({
                  itemType: 'dish',
                  name: dishPick.name,
                  englishName: dishPick.englishName || dishPick.name,
                  greekName: dishPick.greekName || '',
                  region: dishPick.regionOfOrigin || '',
                  description: dishPick.description || '',
                  officialWebsite: '',
                  imageUrl: hasImg ? dishPick.imageUrl || '' : '',
                  priceLevel: '',
                })}
                <button
                  type="button"
                  onClick={() => handleSpeakGreek(dishPick.greekName)}
                  className="p-1.5 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  title={t.matchmaker.pronounceLabel}
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-xl text-slate-900 dark:text-white leading-snug">
                {dishPick.name}
              </h3>
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                {dishPick.greekName} · {dishPick.regionOfOrigin}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {dishPick.description}
            </p>

            {dishPick.healthFitReason && (
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-0.5">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5 shrink-0" />
                  <span>{dp.healthFitLabel || 'Health-Matched Reason'}</span>
                </span>
                <p className="text-emerald-900 dark:text-emerald-100 leading-snug">
                  {dishPick.healthFitReason}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              <strong className="text-slate-800 dark:text-slate-200">
                {t.matchmaker.ingredients}:
              </strong>{' '}
              {(dishPick.ingredients || []).join(', ')}
            </p>
            <div className="flex items-center gap-1.5 text-sky-800 dark:text-sky-300 font-semibold">
              <Wine className="w-3.5 h-3.5 shrink-0" />
              <span>{dishPick.pairingDrink}</span>
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderHotelCard = () => {
    const imgKey = `daily-hotel-${dailyPicks.dateKey}`;
    const hasImg = Boolean(hotelPick.imageUrl && !failedImages[imgKey]);
    return (
      <article className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
        {hasImg && (
          <div className="h-48 bg-slate-100 dark:bg-slate-800">
            <img
              src={hotelPick.imageUrl}
              alt={hotelPick.name}
              referrerPolicy="no-referrer"
              onError={() => setFailedImages((p) => ({ ...p, [imgKey]: true }))}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span>{dp.hotelBadge || 'Hotel of the Day'}</span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  {hotelPick.rating}
                </span>
                {renderFavBtn({
                  itemType: 'hotel',
                  name: hotelPick.name,
                  englishName: hotelPick.englishName || hotelPick.name,
                  greekName: hotelPick.greekName || '',
                  region: hotelPick.region || hotelPick.location || '',
                  description: hotelPick.description || '',
                  officialWebsite: hotelPick.officialWebsite || '',
                  imageUrl: hasImg ? hotelPick.imageUrl || '' : '',
                  priceLevel: hotelPick.priceLevel || '€€',
                })}
              </div>
            </div>

            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                {hotelPick.name}
              </h3>
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                {hotelPick.category} · {hotelPick.region}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {hotelPick.description}
            </p>

            {hotelPick.amenities && hotelPick.amenities.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <strong className="text-slate-700 dark:text-slate-200">
                  {t.matchmaker.amenitiesLabel}:
                </strong>{' '}
                {hotelPick.amenities.slice(0, 4).join(' · ')}
              </p>
            )}

            {hotelPick.healthFitReason && (
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-0.5">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5 shrink-0" />
                  <span>{dp.healthFitLabel || 'Health-Matched Reason'}</span>
                </span>
                <p className="text-emerald-900 dark:text-emerald-100 leading-snug">
                  {hotelPick.healthFitReason}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {t.matchmaker.price}: {hotelPick.priceLevel}
              </span>
              <span className="truncate">{hotelPick.location}</span>
            </div>

            <PlaceActionLinks
              kind="hotel"
              name={hotelPick.name}
              englishName={hotelPick.englishName}
              location={hotelPick.location}
              region={hotelPick.region}
              officialWebsite={hotelPick.officialWebsite || null}
              bookingUrl={hotelPick.bookingUrl}
              coordinates={hotelPick.coordinates}
              labels={actionLabels}
            />
          </div>
        </div>
      </article>
    );
  };

  const renderTripCard = () => {
    const imgKey = `daily-trip-${dailyPicks.dateKey}`;
    const hasImg = Boolean(tripPick.imageUrl && !failedImages[imgKey]);
    return (
      <article className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
        {hasImg && (
          <div className="h-48 bg-slate-100 dark:bg-slate-800">
            <img
              src={tripPick.imageUrl}
              alt={tripPick.title}
              referrerPolicy="no-referrer"
              onError={() => setFailedImages((p) => ({ ...p, [imgKey]: true }))}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span>{dp.tripBadge || 'Trip of the Day'}</span>
              </span>
              {renderFavBtn({
                itemType: 'gem',
                name: tripPick.title,
                englishName: tripPick.englishName || tripPick.title,
                greekName: tripPick.greekTitle || '',
                region: tripPick.tripCity || tripPick.region || '',
                description: tripPick.description || '',
                officialWebsite: tripPick.officialWebsite || '',
                imageUrl: hasImg ? tripPick.imageUrl || '' : '',
                priceLevel: '',
              })}
            </div>

            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                {tripPick.title}
              </h3>
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                {tripPick.greekTitle} · {tripPick.tripCity || tripPick.region}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {tripPick.description}
            </p>

            {tripPick.healthFitReason && (
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-0.5">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5 shrink-0" />
                  <span>{dp.healthFitLabel || 'Health-Matched Reason'}</span>
                </span>
                <p className="text-emerald-900 dark:text-emerald-100 leading-snug">
                  {tripPick.healthFitReason}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>{tripPick.bestTimeToVisit}</span>
              </span>
              {tripPick.estimatedDuration && (
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {tripPick.estimatedDuration}
                </span>
              )}
            </div>

            <PlaceActionLinks
              kind="gem"
              name={tripPick.title}
              englishName={tripPick.englishName}
              location={tripPick.tripCity || tripPick.region}
              region={tripPick.region}
              officialWebsite={tripPick.officialWebsite || null}
              bookingUrl={tripPick.bookingUrl}
              coordinates={tripPick.coordinates}
              labels={actionLabels}
            />
          </div>
        </div>
      </article>
    );
  };

  return (
    <section className="bg-white dark:bg-[#0B1D36] rounded-2xl border border-slate-200 dark:border-[#163256] p-5 sm:p-7 space-y-5 print:hidden">
      {renderHeaderBar()}
      {renderHealthStrip()}

      {mode === 'all' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {renderCulinaryCard()}
            {renderHotelCard()}
            {renderTripCard()}
          </div>

          {onSearchFocusCity && dailyPicks.focusCity && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => onSearchFocusCity(dailyPicks.focusCity)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4 shrink-0" />
                <span>
                  {dp.searchSimilarBtn || 'Explore Region in AI Guide'} ({dailyPicks.focusCity})
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {mode === 'culinary' && renderCulinaryCard()}
      {mode === 'dish' && renderDishCard()}
      {mode === 'hotel' && renderHotelCard()}
      {mode === 'trip' && renderTripCard()}
    </section>
  );
};
