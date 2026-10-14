import React, { useState, useMemo } from 'react';
import { Clock, Globe, Search, Check, AlertCircle, MapPin } from 'lucide-react';
import { LocationData, ResolvedSite } from '../types';
import { deviceTimeZoneSuggestion, isValidTimeZone } from '../lib/siteTime';
import { saveStoredLocation, getStoredFavorites, saveFavorites } from '../lib/coordinateParser';

interface NeedsTimeZoneProps {
  site: LocationData;
  onResolved: (resolved: ResolvedSite) => void;
}

export const NeedsTimeZone: React.FC<NeedsTimeZoneProps> = ({ site, onResolved }) => {
  const suggestedZone = useMemo(() => deviceTimeZoneSuggestion(), []);

  const allSupportedZones = useMemo(() => {
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
        return Intl.supportedValuesOf('timeZone');
      }
    } catch {
      // Fallback list of common IANA timezones if environment doesn't support supportedValuesOf
    }
    return [
      'Europe/Istanbul',
      'UTC',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Athens',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Santiago',
      'Asia/Tokyo',
      'Asia/Dubai',
      'Australia/Sydney',
      'Pacific/Auckland',
    ];
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedZone, setSelectedZone] = useState<string>(() => {
    if (suggestedZone && isValidTimeZone(suggestedZone)) {
      return suggestedZone;
    }
    return allSupportedZones[0] || '';
  });

  const filteredZones = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return allSupportedZones.slice(0, 80);
    return allSupportedZones.filter((z) => z.toLowerCase().includes(term)).slice(0, 80);
  }, [allSupportedZones, searchTerm]);

  const handleConfirm = (zone: string) => {
    if (!isValidTimeZone(zone)) return;

    const resolved: ResolvedSite = {
      ...site,
      timeZone: zone,
      timeZoneSource: 'manual',
    };

    saveStoredLocation(resolved);

    try {
      const favs = getStoredFavorites();
      const updatedFavs = favs.map((f) =>
        f.id === site.id ? { ...f, timeZone: zone, timeZoneSource: 'manual' } : f
      );
      saveFavorites(updatedFavs);
    } catch (e) {
      console.warn('Could not update favorites', e);
    }

    try {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('chroma_location_changed', { detail: resolved }));
    } catch {}

    onResolved(resolved);
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-8 px-4">
      <div className="rounded-2xl border border-amber-500/30 bg-black/60 backdrop-blur-md p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow ambient accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex items-start gap-4 mb-6 relative">
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                Time Zone Required
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Time zone required for {site.name}
            </h2>
            <p className="text-sm text-theme-muted mt-1 leading-relaxed">
              Astronomical ephemeris, solar crossings, and night weather windows require an exact local IANA time zone.
            </p>
          </div>
        </div>

        {/* Site coordinates summary */}
        <div className="flex items-center gap-4 text-xs font-mono text-theme-muted bg-white/5 border border-white/10 rounded-lg px-3.5 py-2 mb-6">
          <div className="flex items-center gap-1.5 text-white/80">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>{site.name}</span>
          </div>
          <span>•</span>
          <span>{site.latitude.toFixed(4)}°, {site.longitude.toFixed(4)}°</span>
          <span>•</span>
          <span>{Math.round(site.elevation)}m</span>
        </div>

        {/* Quick select: Device timezone */}
        {suggestedZone && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-xs text-amber-200/80">Suggested: Device time zone</div>
                <div className="text-sm font-semibold text-white font-mono">{suggestedZone}</div>
                <div className="text-[11px] text-theme-muted mt-0.5">
                  Your phone is set to {suggestedZone}. Use it only if the site is in the same time zone.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleConfirm(suggestedZone)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs tracking-wide transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 shrink-0"
            >
              <Check className="w-4 h-4" />
              Use device time zone ({suggestedZone})
            </button>
          </div>
        )}

        {/* Manual Search & Select */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-theme-muted flex items-center gap-2">
            <Globe className="w-4 h-4 text-theme-muted" />
            Or choose an IANA time zone:
          </label>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search city or region (e.g. Istanbul, London, Chicago)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/15 text-white placeholder-theme-muted text-sm focus:outline-none focus:border-amber-400/60 focus:bg-white/10 transition-colors"
            />
          </div>

          <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-black/40 divide-y divide-white/5 scrollbar-thin">
            {filteredZones.length === 0 ? (
              <div className="p-4 text-center text-xs text-theme-muted font-mono">
                No matching time zone found.
              </div>
            ) : (
              filteredZones.map((zone) => {
                const isSelected = zone === selectedZone;
                return (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => setSelectedZone(zone)}
                    className={`w-full text-left px-3.5 py-2 text-xs font-mono flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                        : 'text-white/80 hover:bg-white/5'
                    }`}
                  >
                    <span>{zone}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={!selectedZone || !isValidTimeZone(selectedZone)}
              onClick={() => handleConfirm(selectedZone)}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs tracking-wide transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <Check className="w-4 h-4" />
              Confirm time zone ({selectedZone})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
