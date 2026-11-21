import React from 'react';
import { CityLiveConditions } from '../types';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudLightning,
  Wind,
  Sunrise,
  Sunset,
  Ship,
  Ticket,
  ExternalLink,
  Thermometer,
  MapPin,
  Navigation,
  X,
  AlertCircle,
} from 'lucide-react';

interface LiveDestinationConditionsProps {
  destinationConditions: CityLiveConditions | null;
  gpsConditions: CityLiveConditions | null;
  isLoadingDestination: boolean;
  isLoadingGps: boolean;
  gpsError: string | null;
  weatherMode: 'destination' | 'gps';
  onSelectMode: (mode: 'destination' | 'gps') => void;
  onClose?: () => void;
  cityLabel: string;
  labels: {
    weatherTitle: string;
    weatherDestinationTab: string;
    weatherCurrentLocationTab: string;
    currentLocationLabel: string;
    gpsWeatherDenied: string;
    gpsWeatherFetching: string;
    closePanelBtn?: string;
    feelsLike: string;
    windLabel: string;
    windCalm: string;
    windBreezy: string;
    windStrongMeltemi: string;
    sunriseLabel: string;
    sunsetLabel: string;
    uvLabel: string;
    ferryScheduleBtn: string;
    officialMonumentTicketsBtn: string;
    weatherClear: string;
    weatherPartlyCloudy: string;
    weatherCloudy: string;
    weatherRain: string;
    weatherStorm: string;
  };
}

function formatClockTime(isoTime?: string): string {
  if (!isoTime) return '--:--';
  const match = isoTime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : isoTime.slice(-5);
}

function describeWeatherCode(
  code: number,
  labels: LiveDestinationConditionsProps['labels']
): { text: string; Icon: React.FC<{ className?: string }> } {
  if (code === 0 || code === 1) {
    return { text: labels.weatherClear, Icon: Sun };
  }
  if (code === 2) {
    return { text: labels.weatherPartlyCloudy, Icon: CloudSun };
  }
  if (code === 3 || code === 45 || code === 48) {
    return { text: labels.weatherCloudy, Icon: Cloud };
  }
  if (code >= 95) {
    return { text: labels.weatherStorm, Icon: CloudLightning };
  }
  return { text: labels.weatherRain, Icon: CloudRain };
}

export const LiveDestinationConditions: React.FC<LiveDestinationConditionsProps> = ({
  destinationConditions,
  gpsConditions,
  isLoadingDestination,
  isLoadingGps,
  gpsError,
  weatherMode,
  onSelectMode,
  onClose,
  cityLabel,
  labels,
}) => {
  const activeConditions = weatherMode === 'gps' ? gpsConditions : destinationConditions;
  const activeLoading = weatherMode === 'gps' ? isLoadingGps : isLoadingDestination;
  const activeLocationLabel =
    weatherMode === 'gps'
      ? gpsConditions?.city || labels.currentLocationLabel
      : cityLabel;

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-sky-50 via-white to-amber-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950/30 border border-sky-200/80 dark:border-slate-800 space-y-4">
      {/* Header + Segmented Mode Switcher (Searched Place vs Current GPS Location) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700">
          <button
            type="button"
            onClick={() => onSelectMode('destination')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              weatherMode === 'destination'
                ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{labels.weatherDestinationTab}</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('gps')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              weatherMode === 'gps'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span>{labels.weatherCurrentLocationTab}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {destinationConditions && (
            <>
              <a
                href={destinationConditions.ferryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold transition-colors"
              >
                <Ship className="w-3.5 h-3.5 shrink-0" />
                <span>{labels.ferryScheduleBtn}</span>
                <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
              </a>

              <a
                href={destinationConditions.officialTicketsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors"
              >
                <Ticket className="w-3.5 h-3.5 shrink-0" />
                <span>{labels.officialMonumentTicketsBtn}</span>
                <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
              </a>
            </>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.closePanelBtn || 'Close'}
              title={labels.closePanelBtn || 'Close'}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {activeLoading && !activeConditions && (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 w-56 bg-sky-200/70 dark:bg-slate-800 rounded">
            <span className="sr-only">{labels.gpsWeatherFetching}</span>
          </div>
          {weatherMode === 'gps' && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {labels.gpsWeatherFetching}
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="h-16 bg-white/80 dark:bg-slate-800 rounded-xl" />
            <div className="h-16 bg-white/80 dark:bg-slate-800 rounded-xl" />
            <div className="h-16 bg-white/80 dark:bg-slate-800 rounded-xl" />
            <div className="h-16 bg-white/80 dark:bg-slate-800 rounded-xl" />
          </div>
        </div>
      )}

      {/* GPS error state */}
      {weatherMode === 'gps' && gpsError && !activeConditions && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{gpsError}</span>
        </div>
      )}

      {/* Active Weather Metrics */}
      {activeConditions && (() => {
        const { text: conditionText, Icon: WeatherIcon } = describeWeatherCode(
          activeConditions.weatherCode,
          labels
        );
        const windAdvisory =
          activeConditions.windKmh >= 30
            ? labels.windStrongMeltemi
            : activeConditions.windKmh >= 16
            ? labels.windBreezy
            : labels.windCalm;

        const windSeverityColor =
          activeConditions.windKmh >= 30
            ? 'text-amber-700 dark:text-amber-400'
            : activeConditions.windKmh >= 16
            ? 'text-sky-700 dark:text-sky-400'
            : 'text-emerald-700 dark:text-emerald-400';

        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <WeatherIcon className="w-5 h-5 text-amber-500 shrink-0" />
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                {labels.weatherTitle} ·{' '}
                <span className="text-sky-700 dark:text-sky-400">{activeLocationLabel}</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Temperature */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">{conditionText}</p>
                  <p className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {activeConditions.temperatureC}°C
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {labels.feelsLike} {activeConditions.feelsLikeC}°C · {activeConditions.tempMinC}°/
                    {activeConditions.tempMaxC}°
                  </p>
                </div>
                <Thermometer className="w-6 h-6 text-amber-500 shrink-0" />
              </div>

              {/* Marine & Meltemi Wind */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">{labels.windLabel}</p>
                  <p className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {activeConditions.windKmh} <span className="text-xs font-semibold">km/h</span>
                  </p>
                  <p className={`text-[11px] font-semibold leading-snug ${windSeverityColor}`}>
                    {windAdvisory}
                  </p>
                </div>
                <Wind className="w-6 h-6 text-sky-600 dark:text-sky-400 shrink-0" />
              </div>

              {/* Golden Hour / Sunrise & Sunset */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-3">
                <div className="space-y-1.5 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <Sunrise className="w-3.5 h-3.5 text-amber-500" />
                      {labels.sunriseLabel}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatClockTime(activeConditions.sunrise)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <Sunset className="w-3.5 h-3.5 text-orange-500" />
                      {labels.sunsetLabel}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatClockTime(activeConditions.sunset)}
                    </span>
                  </div>
                </div>
              </div>

              {/* UV Index */}
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">{labels.uvLabel}</p>
                  <p className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                    UV {activeConditions.uvIndexMax}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {activeConditions.lat.toFixed(2)}°N · {activeConditions.lng.toFixed(2)}°E
                  </p>
                </div>
                <Sun className="w-6 h-6 text-amber-500 shrink-0" />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
