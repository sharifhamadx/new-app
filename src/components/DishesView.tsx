import React from 'react';
import { Language, HealthProfile, FavoriteItem } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { DailyPicksSpotlight } from './DailyPicksSpotlight';

interface DishesViewProps {
  currentLang: Language;
  healthProfile?: HealthProfile;
  onOpenHealthSettings?: () => void;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: Omit<FavoriteItem, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
}

export const DishesView: React.FC<DishesViewProps> = ({
  currentLang,
  healthProfile = { conditions: [], allergiesOrNotes: '' },
  onOpenHealthSettings,
  favorites = [],
  onToggleFavorite,
}) => {
  const { t } = useUiTranslation(currentLang);

  return (
    <div className="space-y-10 pb-16">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <p className="text-xs font-bold text-[#0D5EAF] dark:text-sky-400">
          {t.dishes.kicker}
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[#082F5E] dark:text-white text-balance">
          {t.dishes.title}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t.dishes.subtitle}
        </p>
      </div>

      {/* Today's Single AI Health-Matched Dish Pick */}
      <DailyPicksSpotlight
        currentLang={currentLang}
        healthProfile={healthProfile}
        onOpenHealthSettings={() => onOpenHealthSettings?.()}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        mode="dish"
      />
    </div>
  );
};
