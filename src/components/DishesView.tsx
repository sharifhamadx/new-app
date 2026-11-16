import React, { useState, useEffect } from 'react';
import { Language, DishRecommendation } from '../types';
import { curatedDishes } from '../data/greekCuratedData';
import { translatePayloadViaServer, useUiTranslation } from '../hooks/useTranslatedContent';
import { Volume2, Wine, Loader2 } from 'lucide-react';

interface DishesViewProps {
  currentLang: Language;
}

export const DishesView: React.FC<DishesViewProps> = ({ currentLang }) => {
  const [selectedDietary, setSelectedDietary] = useState<string>('all');
  const [playingDish, setPlayingDish] = useState<string | null>(null);
  const [localizedDishes, setLocalizedDishes] = useState<DishRecommendation[]>(curatedDishes);
  const [isTranslating, setIsTranslating] = useState(false);

  const { t } = useUiTranslation(currentLang);

  useEffect(() => {
    if (currentLang.toLowerCase() === 'en') {
      setLocalizedDishes(curatedDishes);
      setIsTranslating(false);
      return;
    }

    const controller = new AbortController();
    setIsTranslating(true);

    translatePayloadViaServer(
      curatedDishes,
      currentLang,
      'curated',
      'curated_dishes_v1',
      controller.signal
    )
      .then((translated) => {
        if (!controller.signal.aborted && Array.isArray(translated)) {
          setLocalizedDishes(translated);
        }
      })
      .catch(() => {
        // retain current view on abort
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsTranslating(false);
        }
      });

    return () => controller.abort();
  }, [currentLang]);

  const handleSpeak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'el-GR';
      utterance.rate = 0.85;
      utterance.onstart = () => setPlayingDish(text);
      utterance.onend = () => setPlayingDish(null);
      utterance.onerror = () => setPlayingDish(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const filteredDishes =
    selectedDietary === 'all'
      ? localizedDishes
      : localizedDishes.filter((d) =>
          d.dietary.some((diet) => diet.toLowerCase().includes(selectedDietary.toLowerCase()))
        );

  return (
    <div className="space-y-10 pb-16">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
          {t.dishes.kicker}
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white text-balance">
          {t.dishes.title}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t.dishes.subtitle}
        </p>
        {isTranslating && (
          <div className="inline-flex items-center gap-2 text-xs text-sky-700 dark:text-sky-400 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t.matchmaker.translatingResults}</span>
          </div>
        )}
      </div>

      {/* Dietary Filter Controls */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-w-full">
          {[
            { id: 'all', label: t.dishes.all },
            { id: 'meat', label: t.matchmaker.dietaryOptions.meat },
            { id: 'seafood', label: t.matchmaker.dietaryOptions.seafood },
            { id: 'vegetarian', label: t.matchmaker.dietaryOptions.vegetarian },
            { id: 'vegan', label: t.matchmaker.dietaryOptions.vegan },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedDietary(tab.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedDietary === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dishes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDishes.map((dish: DishRecommendation) => (
          <article
            key={dish.id}
            className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
          >
            <div className="h-48 overflow-hidden bg-slate-100 dark:bg-slate-800">
              <img
                src={dish.imageUrl}
                alt={dish.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {dish.regionOfOrigin}
                </p>

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                      {dish.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs">
                      <span className="font-serif font-bold text-sky-800 dark:text-sky-400">
                        {dish.greekName}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        {dish.pronunciation}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSpeak(dish.greekName)}
                    className={`p-2 rounded-lg transition-colors shrink-0 cursor-pointer ${
                      playingDish === dish.greekName
                        ? 'bg-sky-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-sky-700 dark:text-sky-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title={t.dishes.pronounceHint}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {dish.description}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <p className="text-slate-600 dark:text-slate-400">
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t.matchmaker.ingredients}:
                  </strong>{' '}
                  {dish.ingredients.join(', ')}
                </p>

                <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300 font-semibold">
                  <Wine className="w-4 h-4 shrink-0" />
                  <span>{dish.pairingDrink}</span>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
