import React, { useState, useMemo } from 'react';
import {
  Heart,
  Building2,
  Trash2,
  UtensilsCrossed,
  Landmark,
  Compass,
  Sparkles,
} from 'lucide-react';
import {
  FavoriteItem,
  FavoriteItemType,
  Language,
  User,
} from '../types';
import { useUiTranslation } from '../hooks/useTranslatedContent';
import { PlaceActionLinks } from './PlaceActionLinks';

interface FavoritesViewProps {
  currentLang: Language;
  user: User | null;
  favorites: FavoriteItem[];
  onRemoveFavorite: (favId: string) => Promise<void>;
  onOpenSignIn: () => void;
  onGoToMatchmaker: () => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  currentLang,
  user,
  favorites,
  onRemoveFavorite,
  onOpenSignIn,
  onGoToMatchmaker,
}) => {
  const [filterType, setFilterType] = useState<'all' | FavoriteItemType>('all');
  const { t } = useUiTranslation(currentLang);

  const filtered = useMemo(() => {
    if (filterType === 'all') return favorites;
    return favorites.filter((f) => f.itemType === filterType);
  }, [favorites, filterType]);

  const getTypeIcon = (type: FavoriteItemType) => {
    switch (type) {
      case 'hotel':
        return <Building2 className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />;
      case 'site':
        return <Landmark className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />;
      case 'gem':
        return <Compass className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'dish':
        return <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />;
      default:
        return <UtensilsCrossed className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />;
    }
  };

  return (
    <div className="space-y-8 pb-16">
      <div className="bg-white dark:bg-[#0B1D36] rounded-2xl border border-slate-200 dark:border-[#163256] overflow-hidden">
        <div className="aegean-meander-border w-full" />
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[#0D5EAF] dark:text-sky-400 text-xs font-bold">
            <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
            <span>{t.navbar.syncedDevicesLabel}</span>
          </div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#082F5E] dark:text-white">
            {t.favorites?.title || 'Saved Greece Trip Favorites'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {t.favorites?.subtitle ||
              'Your personal shortlist of restaurants, hotels, ancient sites, and scenic gems — synced offline.'}
          </p>
        </div>

        <div className="text-xs font-bold text-[#082F5E] dark:text-slate-200 tabular-nums px-4 py-2 rounded-xl bg-[#F7FAFE] dark:bg-[#061325] border border-slate-200 dark:border-[#163256] self-start sm:self-center">
          {favorites.length} {t.favorites?.countLabel || 'Saved'}
        </div>
        </div>
      </div>

      {/* Category Filter */}
      {favorites.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(['all', 'taverna', 'hotel', 'site', 'gem', 'dish'] as const).map((typeKey) => {
            const active = filterType === typeKey;
            const label =
              typeKey === 'all'
                ? t.favorites?.allFilter || 'All Saved'
                : t.favorites?.types?.[typeKey] || typeKey;
            return (
              <button
                key={typeKey}
                type="button"
                onClick={() => setFilterType(typeKey)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0D5EAF] text-white border-[#0D5EAF]'
                    : 'bg-white dark:bg-[#0B1D36] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#163256] hover:bg-slate-50 dark:hover:bg-[#082F5E]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#0B1D36] rounded-2xl border border-slate-200 dark:border-[#163256] p-10 text-center space-y-4">
          <Heart className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <h2 className="font-bold text-lg text-[#082F5E] dark:text-white">
              {t.favorites?.emptyTitle || 'No saved places yet'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {t.favorites?.emptyDesc ||
                'Tap the heart icon on any taverna, hotel, archaeological site, or hidden gem after searching.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToMatchmaker}
            className="px-5 py-2.5 bg-[#0D5EAF] hover:bg-[#0A4A8B] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            {t.favorites?.exploreNowBtn || 'Search Greece Guide'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((item) => {
            const actionKind =
              item.itemType === 'hotel'
                ? 'hotel'
                : item.itemType === 'site'
                ? 'site'
                : item.itemType === 'gem'
                ? 'gem'
                : 'taverna';

            return (
              <article
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                {item.imageUrl && (
                  <div className="h-44 bg-slate-100 dark:bg-slate-800">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                        {getTypeIcon(item.itemType)}
                        <span>{t.favorites?.types?.[item.itemType] || item.itemType}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-[160px]">{item.region}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveFavorite(item.id)}
                        className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title={t.favorites?.removeBtn || 'Remove'}
                        aria-label="Remove favorite"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">
                        {item.name}
                      </h3>
                      {item.greekName && (
                        <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                          {item.greekName}
                        </p>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                      {item.description}
                    </p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {item.priceLevel && (
                      <div className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        {t.matchmaker.price}: {item.priceLevel}
                      </div>
                    )}

                    {item.itemType !== 'dish' && (
                      <PlaceActionLinks
                        kind={actionKind}
                        name={item.name}
                        englishName={item.englishName}
                        location={item.region}
                        region={item.region}
                        officialWebsite={item.officialWebsite}
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
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
