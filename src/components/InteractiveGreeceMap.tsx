import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MatchmakerResult } from '../types';
import {
  MapPin,
  Navigation,
  ExternalLink,
  Loader2,
  Eye,
  EyeOff,
  Compass,
  UtensilsCrossed,
  Building2,
  Landmark,
  Sparkles,
  X,
} from 'lucide-react';

export type MapPinCategory = 'all' | 'taverna' | 'hotel' | 'site' | 'gem';

export interface MappedPlace {
  id: string;
  category: Exclude<MapPinCategory, 'all'>;
  name: string;
  englishName?: string;
  subtitle: string;
  lat: number;
  lng: number;
  mapsUrl: string;
}

interface InteractiveGreeceMapProps {
  result: MatchmakerResult;
  cityLabel: string;
  fallbackCenter?: { lat: number; lng: number };
  onClose?: () => void;
  labels: {
    mapSectionTitle: string;
    mapShowBtn: string;
    mapHideBtn: string;
    closePanelBtn?: string;
    mapAllPins: string;
    mapTavernasPins: string;
    mapHotelsPins: string;
    mapSitesPins: string;
    mapGemsPins: string;
    nearMeBtn: string;
    nearMeLocating: string;
    nearMeActiveLabel: string;
    nearMeDenied: string;
    awayKm: string;
    awayMeters: string;
    walkMin: string;
    openDirections: string;
  };
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PIN_COLORS: Record<MappedPlace['category'], string> = {
  taverna: '#0284c7',
  hotel: '#d97706',
  site: '#059669',
  gem: '#7c3aed',
};

export const InteractiveGreeceMap: React.FC<InteractiveGreeceMapProps> = ({
  result,
  cityLabel,
  fallbackCenter,
  onClose,
  labels,
}) => {
  const [isMapOpen, setIsMapOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState<MapPinCategory>('all');
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const allPlaces: MappedPlace[] = useMemo(() => {
    const items: MappedPlace[] = [];

    (result.tavernas || []).forEach((t, idx) => {
      if (typeof t.coordinates?.lat === 'number' && typeof t.coordinates?.lng === 'number') {
        items.push({
          id: `t-${t.id || idx}`,
          category: 'taverna',
          name: t.name,
          englishName: t.englishName,
          subtitle: t.location || t.region || cityLabel,
          lat: t.coordinates.lat,
          lng: t.coordinates.lng,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${t.coordinates.lat},${t.coordinates.lng}`,
        });
      }
    });

    (result.hotels || []).forEach((h, idx) => {
      if (typeof h.coordinates?.lat === 'number' && typeof h.coordinates?.lng === 'number') {
        items.push({
          id: `h-${h.id || idx}`,
          category: 'hotel',
          name: h.name,
          englishName: h.englishName,
          subtitle: h.location || h.region || cityLabel,
          lat: h.coordinates.lat,
          lng: h.coordinates.lng,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${h.coordinates.lat},${h.coordinates.lng}`,
        });
      }
    });

    (result.archaeologicalSites || []).forEach((s, idx) => {
      if (typeof s.coordinates?.lat === 'number' && typeof s.coordinates?.lng === 'number') {
        items.push({
          id: `s-${s.id || idx}`,
          category: 'site',
          name: s.name,
          englishName: s.englishName,
          subtitle: s.location || s.region || cityLabel,
          lat: s.coordinates.lat,
          lng: s.coordinates.lng,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${s.coordinates.lat},${s.coordinates.lng}`,
        });
      }
    });

    (result.hiddenGems || []).forEach((g, idx) => {
      if (typeof g.coordinates?.lat === 'number' && typeof g.coordinates?.lng === 'number') {
        items.push({
          id: `g-${g.id || idx}`,
          category: 'gem',
          name: g.title,
          englishName: g.englishName,
          subtitle: g.region || cityLabel,
          lat: g.coordinates.lat,
          lng: g.coordinates.lng,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${g.coordinates.lat},${g.coordinates.lng}`,
        });
      }
    });

    return items;
  }, [result, cityLabel]);

  const filteredPlaces = useMemo(() => {
    if (activeFilter === 'all') return allPlaces;
    return allPlaces.filter((p) => p.category === activeFilter);
  }, [allPlaces, activeFilter]);

  const nearestSpots = useMemo(() => {
    if (!userPos || allPlaces.length === 0) return [];
    return [...allPlaces]
      .map((place) => {
        const km = haversineDistanceKm(userPos.lat, userPos.lng, place.lat, place.lng);
        const walkMinutes = Math.max(1, Math.round(km * 12));
        return {
          ...place,
          distanceKm: km,
          walkMinutes,
          directionsUrl: `https://www.google.com/maps/dir/?api=1&origin=${userPos.lat},${userPos.lng}&destination=${place.lat},${place.lng}`,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);
  }, [userPos, allPlaces]);

  const handleRequestGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(labels.nearMeDenied);
      return;
    }
    setIsLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsLocating(false);
        setIsMapOpen(true);
      },
      () => {
        setIsLocating(false);
        setGeoError(labels.nearMeDenied);
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  };

  // Initialize Leaflet map once container is mounted
  useEffect(() => {
    if (!isMapOpen || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
      return;
    }

    const centerLat = fallbackCenter?.lat ?? allPlaces[0]?.lat ?? 37.9838;
    const centerLng = fallbackCenter?.lng ?? allPlaces[0]?.lng ?? 23.7275;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: allPlaces.length > 0 ? 13 : 11,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, [isMapOpen]);

  // Update markers & bounds whenever filteredPlaces or userPos changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group || !isMapOpen) return;

    group.clearLayers();
    const boundsPoints: [number, number][] = [];

    filteredPlaces.forEach((place) => {
      const color = PIN_COLORS[place.category];
      const icon = L.divIcon({
        className: 'aegea-map-pin',
        html: `<div style="width:26px;height:26px;border-radius:9999px;background:${color};border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(15,23,42,0.38);display:flex;align-items:center;justify-content:center;"><div style="width:7px;height:7px;border-radius:9999px;background:#ffffff;"></div></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -14],
      });

      const dirHref = userPos
        ? `https://www.google.com/maps/dir/?api=1&origin=${userPos.lat},${userPos.lng}&destination=${place.lat},${place.lng}`
        : place.mapsUrl;

      const distHtml = userPos
        ? (() => {
            const km = haversineDistanceKm(userPos.lat, userPos.lng, place.lat, place.lng);
            const label =
              km < 1 ? `${Math.round(km * 1000)} ${labels.awayMeters}` : `${km.toFixed(1)} ${labels.awayKm}`;
            return `<div style="font-size:11px;color:#0284c7;font-weight:700;margin-top:4px;">${escapeHtml(label)}</div>`;
          })()
        : '';

      const popupHtml = `
        <div style="min-width:170px;font-family:system-ui,sans-serif;line-height:1.4;">
          <div style="font-weight:700;font-size:13px;color:#0f172a;">${escapeHtml(place.name)}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(place.subtitle)}</div>
          ${distHtml}
          <a href="${escapeHtml(dirHref)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;margin-top:8px;padding:4px 9px;background:${color};color:#fff;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;">
             ${escapeHtml(labels.openDirections)} ↗
          </a>
        </div>
      `;

      L.marker([place.lat, place.lng], { icon }).bindPopup(popupHtml).addTo(group);
      boundsPoints.push([place.lat, place.lng]);
    });

    if (userPos) {
      const gpsIcon = L.divIcon({
        className: 'aegea-user-pin',
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:#ef4444;border:3px solid #ffffff;box-shadow:0 0 0 6px rgba(239,68,68,0.28);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker([userPos.lat, userPos.lng], { icon: gpsIcon })
        .bindPopup(`<div style="font-weight:700;font-size:12px;">GPS · ${userPos.lat.toFixed(4)}, ${userPos.lng.toFixed(4)}</div>`)
        .addTo(group);
      boundsPoints.push([userPos.lat, userPos.lng]);
    }

    if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, { padding: [36, 36], maxZoom: 15 });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 14);
    } else if (fallbackCenter) {
      map.setView([fallbackCenter.lat, fallbackCenter.lng], 12);
    }
  }, [filteredPlaces, userPos, isMapOpen, fallbackCenter, labels]);

  if (allPlaces.length === 0 && !fallbackCenter) return null;

  const filterButtons: {
    key: MapPinCategory;
    label: string;
    count: number;
    dotColor?: string;
    Icon: React.FC<{ className?: string }>;
  }[] = [
    { key: 'all', label: labels.mapAllPins, count: allPlaces.length, Icon: Compass },
    {
      key: 'taverna',
      label: labels.mapTavernasPins,
      count: allPlaces.filter((p) => p.category === 'taverna').length,
      dotColor: 'bg-sky-600',
      Icon: UtensilsCrossed,
    },
    {
      key: 'hotel',
      label: labels.mapHotelsPins,
      count: allPlaces.filter((p) => p.category === 'hotel').length,
      dotColor: 'bg-amber-600',
      Icon: Building2,
    },
    {
      key: 'site',
      label: labels.mapSitesPins,
      count: allPlaces.filter((p) => p.category === 'site').length,
      dotColor: 'bg-emerald-600',
      Icon: Landmark,
    },
    {
      key: 'gem',
      label: labels.mapGemsPins,
      count: allPlaces.filter((p) => p.category === 'gem').length,
      dotColor: 'bg-violet-600',
      Icon: Sparkles,
    },
  ];

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-sky-700 dark:text-sky-400 shrink-0" />
          <h3 className="font-editorial text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            {labels.mapSectionTitle}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isLocating}
            onClick={handleRequestGps}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer transition-colors"
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <Navigation className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{isLocating ? labels.nearMeLocating : labels.nearMeBtn}</span>
          </button>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.closePanelBtn || 'Close'}
              title={labels.closePanelBtn || 'Close'}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsMapOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
            >
              {isMapOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isMapOpen ? labels.mapHideBtn : labels.mapShowBtn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {filterButtons
          .filter((b) => b.key === 'all' || b.count > 0)
          .map((btn) => {
            const isSelected = activeFilter === btn.key;
            return (
              <button
                key={btn.key}
                type="button"
                onClick={() => setActiveFilter(btn.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 dark:bg-sky-700 text-white border-slate-900 dark:border-sky-700'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {btn.dotColor ? (
                  <span className={`w-2 h-2 rounded-full ${btn.dotColor} shrink-0`} />
                ) : (
                  <btn.Icon className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{btn.label}</span>
                <span className="opacity-70 tabular-nums">({btn.count})</span>
              </button>
            );
          })}
      </div>

      {geoError && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs">
          {geoError}
        </div>
      )}

      {/* Closest Spots Calculated From Browser GPS */}
      {userPos && nearestSpots.length > 0 && (
        <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-3">
          <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span>{labels.nearMeActiveLabel}</span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {nearestSpots.map((spot) => {
              const distLabel =
                spot.distanceKm < 1
                  ? `${Math.max(50, Math.round(spot.distanceKm * 1000))} ${labels.awayMeters}`
                  : `${spot.distanceKm.toFixed(1)} ${labels.awayKm}`;
              return (
                <a
                  key={spot.id}
                  href={spot.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-800/60 hover:border-emerald-500 transition-colors flex items-start justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{spot.name}</p>
                    <p className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                      {distLabel} · ~{spot.walkMinutes} {labels.walkMin}
                    </p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Leaflet Map Canvas */}
      {isMapOpen && (
        <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 z-0">
          <div ref={mapContainerRef} className="w-full h-[360px] sm:h-[400px] bg-slate-100 dark:bg-slate-800" />
        </div>
      )}
    </div>
  );
};
