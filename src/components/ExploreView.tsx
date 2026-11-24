import React from 'react';
import { Language, HealthProfile, FavoriteItem } from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { DailyPicksSpotlight } from './DailyPicksSpotlight';

interface ExploreViewProps {
  currentLang: Language;
  healthProfile?: HealthProfile;
  onOpenHealthSettings?: () => void;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: Omit<FavoriteItem, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
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
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
          {t.explore.kicker}
        </p>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white text-balance">
          {t.explore.title}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t.explore.subtitle}
        </p>
      </div>

      {/* Today's Single AI-Selected Restaurant Pick */}
      <DailyPicksSpotlight
        currentLang={currentLang}
        healthProfile={healthProfile}
        onOpenHealthSettings={() => onOpenHealthSettings?.()}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        mode="culinary"
      />
    </div>
  );
};
