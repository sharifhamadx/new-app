import React, { useState, useEffect } from 'react';
import { Language, TavernaRecommendation } from '../types';
import { curatedTavernas, curatedTavernasAr } from '../data/greekCuratedData';
import { translatePayloadViaServer, useUiTranslation } from '../hooks/useTranslatedContent';
import { PlaceActionLinks } from './PlaceActionLinks';
import { Star, Loader2, CheckCircle2 } from 'lucide-react';

interface ExploreViewProps {
  currentLang: Language;
}

export const ExploreView: React.FC<ExploreViewProps> = ({ currentLang }) => {
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [localizedTavernas, setLocalizedTavernas] = useState<TavernaRecommendation[]>(curatedTavernas);
  const [isTranslating, setIsTranslating] = useState(false);
  const { t } = useUiTranslation(currentLang);

  useEffect(() => {
    const norm = currentLang.trim().toLowerCase();
    if (norm === 'en' || norm === 'english') {
      setLocalizedTavernas(curatedTavernas);
      setIsTranslating(false);
      return;
    }

    if (norm === 'ar' || norm === 'arabic') {
      setLocalizedTavernas(curatedTavernasAr);
      setIsTranslating(false);
      return;
    }

    const controller = new AbortController();
    setIsTranslating(true);

    translatePayloadViaServer(
      curatedTavernas,
      currentLang,
      'curated',
      'curated_tavernas_v2',
      controller.signal
    )
      .then((translated) => {
        if (!controller.signal.aborted && Array.isArray(translated)) {
          setLocalizedTavernas(translated);
        }
      })
      .catch(() => {
        // Keep current items gracefully if translation is aborted or network unavailable
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsTranslating(false);
        }
      });

    return () => controller.abort();
  }, [currentLang]);

  const regionTabs = [
    { id: 'all', label: t.explore.all },
    { id: 'athens', label: t.explore.athens },
    { id: 'cyclades', label: t.explore.cyclades },
    { id: 'crete', label: t.explore.crete },
    { id: 'thessaloniki', label: t.explore.thessaloniki },
    { id: 'peloponnese', label: t.explore.peloponnese },
  ];

  const filteredTavernas =
    selectedRegion === 'all'
      ? localizedTavernas
      : localizedTavernas.filter((item) => item.region === selectedRegion);

  return (
    <div className="space-y-10 pb-16">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
          {t.explore.kicker}
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white text-balance">
          {t.explore.title}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t.explore.subtitle}
        </p>
        {isTranslating && (
          <div className="inline-flex items-center gap-2 text-xs text-sky-700 dark:text-sky-400 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t.matchmaker.translatingResults}</span>
          </div>
        )}
      </div>

      {/* Region Filter Controls */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-w-full">
          {regionTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedRegion(tab.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedRegion === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Taverna Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTavernas.map((tavern: TavernaRecommendation) => (
          <article
            key={tavern.id}
            className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
          >
            <div className="h-52 overflow-hidden bg-slate-100 dark:bg-slate-800">
              <img
                src={tavern.imageUrl}
                alt={tavern.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate">{tavern.location}</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    {tavern.rating}
                  </span>
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
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    {t.matchmaker.signatureDishes}:
                  </span>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {tavern.signatureDishes.join(' · ')}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white block">
                    {t.matchmaker.insiderTip}
                  </strong>
                  <p className="mt-0.5 leading-snug">{tavern.insiderTip}</p>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                    {t.matchmaker.price}: {tavern.priceLevel}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{tavern.operatingStatus || t.matchmaker.activeNowBadge}</span>
                  </span>
                </div>

                <PlaceActionLinks
                  kind="taverna"
                  name={tavern.name}
                  englishName={tavern.englishName}
                  location={tavern.location}
                  region={tavern.region}
                  officialWebsite={tavern.officialWebsite}
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
        ))}
      </div>
    </div>
  );
};
