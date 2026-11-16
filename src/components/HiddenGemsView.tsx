import React, { useState, useEffect } from 'react';
import { Language, HiddenGemSpot } from '../types';
import { curatedHiddenGems } from '../data/greekCuratedData';
import { translatePayloadViaServer, useUiTranslation } from '../hooks/useTranslatedContent';
import { Clock, Utensils, Loader2 } from 'lucide-react';

interface HiddenGemsViewProps {
  currentLang: Language;
}

export const HiddenGemsView: React.FC<HiddenGemsViewProps> = ({ currentLang }) => {
  const [localizedGems, setLocalizedGems] = useState<HiddenGemSpot[]>(curatedHiddenGems);
  const [isTranslating, setIsTranslating] = useState(false);
  const { t } = useUiTranslation(currentLang);

  useEffect(() => {
    if (currentLang.toLowerCase() === 'en') {
      setLocalizedGems(curatedHiddenGems);
      setIsTranslating(false);
      return;
    }

    const controller = new AbortController();
    setIsTranslating(true);

    translatePayloadViaServer(
      curatedHiddenGems,
      currentLang,
      'curated',
      'curated_gems_v1',
      controller.signal
    )
      .then((translated) => {
        if (!controller.signal.aborted && Array.isArray(translated)) {
          setLocalizedGems(translated);
        }
      })
      .catch(() => {
        // retain current items on abort
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsTranslating(false);
        }
      });

    return () => controller.abort();
  }, [currentLang]);

  return (
    <div className="space-y-10 pb-16">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
          {t.hiddenGems.kicker}
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white text-balance">
          {t.hiddenGems.title}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t.hiddenGems.subtitle}
        </p>
        {isTranslating && (
          <div className="inline-flex items-center gap-2 text-xs text-sky-700 dark:text-sky-400 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t.matchmaker.translatingResults}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {localizedGems.map((gem: HiddenGemSpot) => (
          <article
            key={gem.id}
            className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
          >
            <div className="h-60 overflow-hidden bg-slate-100 dark:bg-slate-800">
              <img
                src={gem.imageUrl}
                alt={gem.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {gem.region}
                </p>

                <div>
                  <h3 className="font-bold text-xl text-slate-900 dark:text-white leading-snug">
                    {gem.title}
                  </h3>
                  <p className="text-xs font-serif font-semibold text-sky-700 dark:text-sky-400 mt-0.5">
                    {gem.greekTitle}
                  </p>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {gem.description}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                  <strong className="text-slate-900 dark:text-white block mb-0.5">
                    {t.matchmaker.whyVisit}
                  </strong>
                  <p className="leading-relaxed">{gem.whyVisit}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                    <span>{gem.bestTimeToVisit}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Utensils className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="truncate">{gem.nearbyTavernaSuggestion}</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
