import React from 'react';
import { MapPin, Globe, ExternalLink, CalendarCheck } from 'lucide-react';

export type PlaceActionKind = 'taverna' | 'hotel' | 'site' | 'gem';

interface PlaceActionLinksProps {
  kind: PlaceActionKind;
  name: string;
  englishName?: string;
  location: string;
  region?: string;
  officialWebsite?: string | null;
  bookingUrl?: string | null;
  coordinates?: { lat: number; lng: number };
  labels: {
    googleMapsLabel: string;
    previewAndBookSite: string;
    previewAndBookPlatform: string;
    otherPlatformsLabel: string;
    googleReviewsLabel: string;
    checkHotelRates?: string;
    bookTicketsAndTours?: string;
  };
}

function cleanHttpUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export const PlaceActionLinks: React.FC<PlaceActionLinksProps> = ({
  kind,
  name,
  englishName,
  location,
  region,
  officialWebsite,
  bookingUrl,
  coordinates,
  labels,
}) => {
  const searchName = (englishName || name || '').trim();
  const area = (location || region || 'Greece').trim();
  const fullQuery = `${searchName} ${area}`.includes('Greece')
    ? `${searchName} ${area}`
    : `${searchName} ${area} Greece`;

  const mapsHref = coordinates
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${coordinates.lat},${coordinates.lng} (${searchName})`
      )}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullQuery)}`;

  const siteUrl = cleanHttpUrl(officialWebsite);
  const directBookUrl = cleanHttpUrl(bookingUrl);

  const bookingComHref = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(fullQuery)}`;
  const tripadvisorHref = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(fullQuery)}`;
  const theForkHref = `https://www.thefork.com/search?cityId=&queryText=${encodeURIComponent(fullQuery)}`;
  const expediaHref = `https://www.expedia.com/Hotel-Search?destination=${encodeURIComponent(fullQuery)}`;
  const getYourGuideHref = `https://www.getyourguide.com/s/?q=${encodeURIComponent(fullQuery)}`;
  const viatorHref = `https://www.viator.com/searchResults/all?text=${encodeURIComponent(fullQuery)}`;
  const googleSearchPreviewHref = `https://www.google.com/search?q=${encodeURIComponent(`${fullQuery} official booking reviews`)}`;

  const primaryPreviewHref =
    siteUrl ||
    directBookUrl ||
    (kind === 'hotel'
      ? bookingComHref
      : kind === 'site' || kind === 'gem'
      ? getYourGuideHref
      : tripadvisorHref);

  const primaryPreviewLabel =
    siteUrl || directBookUrl
      ? labels.previewAndBookSite
      : kind === 'hotel'
      ? labels.checkHotelRates || labels.previewAndBookPlatform
      : kind === 'site' || kind === 'gem'
      ? labels.bookTicketsAndTours || labels.previewAndBookPlatform
      : labels.previewAndBookPlatform;

  const otherPlatforms: { label: string; href: string }[] =
    kind === 'hotel'
      ? [
          { label: 'Booking.com', href: bookingComHref },
          { label: 'Tripadvisor', href: tripadvisorHref },
          { label: 'Expedia', href: expediaHref },
          ...(siteUrl && directBookUrl && directBookUrl !== siteUrl
            ? [{ label: 'Booking Link', href: directBookUrl }]
            : []),
        ].filter((p) => p.href !== primaryPreviewHref)
      : kind === 'taverna'
      ? [
          { label: 'Tripadvisor', href: tripadvisorHref },
          { label: 'TheFork', href: theForkHref },
          { label: labels.googleReviewsLabel || 'Google', href: googleSearchPreviewHref },
          ...(siteUrl && directBookUrl && directBookUrl !== siteUrl
            ? [{ label: 'Reserve', href: directBookUrl }]
            : []),
        ].filter((p) => p.href !== primaryPreviewHref)
      : [
          { label: 'GetYourGuide', href: getYourGuideHref },
          { label: 'Viator', href: viatorHref },
          { label: 'Tripadvisor', href: tripadvisorHref },
        ].filter((p) => p.href !== primaryPreviewHref);

  return (
    <div className="space-y-2 pt-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{labels.googleMapsLabel}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>

        <a
          href={primaryPreviewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors"
        >
          {siteUrl || directBookUrl ? (
            <Globe className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{primaryPreviewLabel}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          {labels.otherPlatformsLabel}
        </span>
        {otherPlatforms.map((platform) => (
          <a
            key={platform.label}
            href={platform.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-sky-700 dark:text-sky-400 hover:underline font-medium"
          >
            <span>{platform.label}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-75" />
          </a>
        ))}
      </div>
    </div>
  );
};
