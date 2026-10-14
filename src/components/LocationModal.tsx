import React, { useState, useMemo } from 'react';
import {
  X,
  MapPin,
  Navigation,
  Mountain,
  Search,
  Check,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { LocationData } from '../types';
import {
  parseCoordinateInput,
  fetchElevation,
  fetchTimeZone,
  calculateHorizonDip,
  saveStoredLocation,
  saveFavorites,
  getStoredFavorites,
  PRESET_LOCATIONS,
} from '../lib/coordinateParser';
import { openSiteNavigation } from '../lib/navigationBridge';
import { HORIZON_DIP_COEFF_DEG } from '../lib/ephemeris';
import { errorMessage } from '../lib/errors';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLocation: LocationData;
  onSelectLocation: (loc: LocationData) => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  activeLocation,
  onSelectLocation,
}) => {
  const [rawInput, setRawInput] = useState('');
  const [customName, setCustomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<LocationData[]>(() => getStoredFavorites());
  const [stagedLocation, setStagedLocation] = useState<LocationData | null>(null);
  const [isElevationUnknown, setIsElevationUnknown] = useState(false);

  const allCandidateLocations = useMemo(() => {
    const map = new Map<string, LocationData>();
    for (const preset of PRESET_LOCATIONS) {
      map.set(preset.id, preset);
    }
    for (const fav of favorites) {
      map.set(fav.id, fav);
    }
    return Array.from(map.values());
  }, [favorites]);

  const nearbyMatch = useMemo(() => {
    if (!stagedLocation) return null;
    let closest: { loc: LocationData; dist: number } | null = null;
    for (const loc of allCandidateLocations) {
      const dLat = loc.latitude - stagedLocation.latitude;
      const dLng = loc.longitude - stagedLocation.longitude;
      const dist = Math.hypot(dLat, dLng);
      if (dist < 0.01) {
        if (!closest || dist < closest.dist) {
          closest = { loc, dist };
        }
      }
    }
    return closest;
  }, [stagedLocation, allCandidateLocations]);

  const isExactMatch = nearbyMatch ? nearbyMatch.dist < 0.0005 : false;

  const handleSelectExisting = (existingLoc: LocationData) => {
    onSelectLocation(existingLoc);
    saveStoredLocation(existingLoc);
    onClose();
  };

  if (!isOpen) return null;

  const handleParseAndResolve = async () => {
    setStagedLocation(null);
    setIsElevationUnknown(false);
    setErrorMsg(null);
    setWarningMsg(null);
    setSuccessInfo(null);
    if (!rawInput.trim()) {
      setErrorMsg('Please paste coordinates, DMS, or a Google Maps link.');
      return;
    }
    setIsLoading(true);
    try {
      const parseRes = parseCoordinateInput(rawInput);
      if (!parseRes.success || parseRes.latitude === undefined || parseRes.longitude === undefined) {
        setErrorMsg(parseRes.error || 'Failed to parse coordinates.');
        setIsLoading(false);
        return;
      }
      const lat = parseRes.latitude;
      const lng = parseRes.longitude;
      const [rawElevation, timeZone] = await Promise.all([
        fetchElevation(lat, lng),
        fetchTimeZone(lat, lng),
      ]);
      const elevationKnown = rawElevation !== null;
      const elevation = elevationKnown ? rawElevation : 0;
      const dip = calculateHorizonDip(elevation);
      const generatedName = customName.trim()
        ? customName.trim()
        : `Site Point (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;

      const newLoc: LocationData = {
        id: `loc-${Date.now()}`,
        name: generatedName,
        latitude: lat,
        longitude: lng,
        elevation,
        horizonDip: dip,
        isCustom: true,
        ...(!elevationKnown ? { elevationKnown: false } : {}),
        ...(timeZone ? { timeZone, timeZoneSource: 'lookup' } : {}),
      };
      setStagedLocation(newLoc);
      setIsElevationUnknown(!elevationKnown);

      const warnings: string[] = [];
      if (!elevationKnown) {
        warnings.push('Elevation could not be resolved; horizon dip and sunrise/sunset threshold are affected');
      }
      if (!timeZone) {
        warnings.push('Timezone could not be determined');
      }

      if (warnings.length > 0) {
        setWarningMsg(warnings.join('\n'));
      } else {
        setWarningMsg(null);
      }

      const elevationText = elevationKnown ? `${elevation}m` : 'unknown';
      const dipText = elevationKnown ? `-${dip.toFixed(2)}°` : 'unknown';
      const sunriseThresholdText = elevationKnown ? `${(-0.833 - dip).toFixed(2)}°` : 'unknown';
      setSuccessInfo(
        `Coordinates resolved! Elevation: ${elevationText}${timeZone ? `, Timezone: ${timeZone}` : ''}, Horizon Dip: ${dipText}, Threshold: ${sunriseThresholdText}`
      );
    } catch (e: unknown) {
      setErrorMsg('An error occurred: ' + (errorMessage(e) ?? 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyStaged = (andSaveFav = false) => {
    if (!stagedLocation) return;
    const finalLoc: LocationData = {
      ...stagedLocation,
      name: customName.trim() ? customName.trim() : stagedLocation.name,
    };
    onSelectLocation(finalLoc);
    saveStoredLocation(finalLoc);
    if (andSaveFav) {
      const updated = [finalLoc, ...favorites.filter((f) => f.id !== finalLoc.id)];
      setFavorites(updated);
      saveFavorites(updated);
    }
    onClose();
  };

  const handleGPSLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Your device does not support geolocation services.');
      return;
    }
    setIsLoading(true);
    setStagedLocation(null);
    setIsElevationUnknown(false);
    setErrorMsg(null);
    setWarningMsg(null);
    setSuccessInfo(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const elevationPromise: Promise<number | null> =
            pos.coords.altitude !== null &&
            pos.coords.altitude !== undefined &&
            !isNaN(pos.coords.altitude) &&
            pos.coords.altitude > 0
              ? Promise.resolve(Math.round(pos.coords.altitude))
              : fetchElevation(lat, lng);

          const [rawElevation, timeZone] = await Promise.all([
            elevationPromise,
            fetchTimeZone(lat, lng),
          ]);
          const elevationKnown = rawElevation !== null;
          const elevation = elevationKnown ? rawElevation : 0;
          const dip = calculateHorizonDip(elevation);
          const gpsLoc: LocationData = {
            id: `gps-${Date.now()}`,
            name: customName.trim() ? customName.trim() : 'Current Device Location (GPS)',
            latitude: lat,
            longitude: lng,
            elevation,
            horizonDip: dip,
            isCustom: true,
            ...(!elevationKnown ? { elevationKnown: false } : {}),
            ...(timeZone ? { timeZone, timeZoneSource: 'lookup' } : {}),
          };
          setStagedLocation(gpsLoc);
          setIsElevationUnknown(!elevationKnown);
          setRawInput(`${lat}, ${lng}`);

          const warnings: string[] = [];
          if (!elevationKnown) {
            warnings.push('Elevation could not be resolved; horizon dip and sunrise/sunset threshold are affected');
          }
          if (!timeZone) {
            warnings.push('Timezone could not be determined');
          }

          if (warnings.length > 0) {
            setWarningMsg(warnings.join('\n'));
          } else {
            setWarningMsg(null);
          }

          const elevationText = elevationKnown ? `${elevation}m` : 'unknown';
          const dipText = elevationKnown ? `-${dip.toFixed(2)}°` : 'unknown';
          const sunriseThresholdText = elevationKnown ? `${(-0.833 - dip).toFixed(2)}°` : 'unknown';
          setSuccessInfo(
            `GPS location acquired (${lat}, ${lng}) - Elevation: ${elevationText}${timeZone ? `, Timezone: ${timeZone}` : ''}, Horizon Dip: ${dipText}, Threshold: ${sunriseThresholdText}`
          );
        } catch (e: unknown) {
          setErrorMsg('Error fetching elevation: ' + (errorMessage(e) ?? 'Unknown error'));
        } finally {
          setIsLoading(false);
        }
      },
      (err) => {
        setIsLoading(false);
        setErrorMsg('GPS access error: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const handleDeleteFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = favorites.filter((f) => f.id !== id);
    setFavorites(updated);
    saveFavorites(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-theme bg-[var(--theme-card)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme bg-black/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-theme-primary/10 border border-theme flex items-center justify-center">
              <MapPin className="w-4 h-4 text-theme-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-[var(--theme-text)]">
                📍 OBSERVATION SITE SELECTION
              </h2>
              <p className="text-[10px] text-theme-muted">
                Smart Parser & Topographic Coordinate Resolver
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-theme-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-theme-accent flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" /> Smart Coordinate Input (Coords / Link)
            </label>
            <div className="relative">
              <textarea
                value={rawInput}
                onChange={(e) => {
                  setRawInput(e.target.value);
                  setStagedLocation(null);
                  setIsElevationUnknown(false);
                  setErrorMsg(null);
                  setWarningMsg(null);
                  setSuccessInfo(null);
                }}
                placeholder="Examples:&#10;  40.612, 31.684&#10;  40°36'43&quot;N 31°41'02&quot;E&#10;  https://maps.app.goo.gl/... or google.com/maps/@40.612,31.684"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-theme bg-black/50 text-[var(--theme-text)] font-mono text-xs placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)] resize-none"
              />
            </div>
            <div className="text-[10px] text-theme-muted flex items-center justify-between">
              <span>Enter Decimal, DMS or Google Maps link</span>
              <span className="font-mono">Regex v2.4</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-theme-muted">Custom Site Name (Optional):</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Bolu Sarıalan Camp Site"
              className="w-full px-3 py-1.5 rounded-lg border border-theme bg-black/40 text-[var(--theme-text)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleParseAndResolve}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-theme-primary/20 hover:bg-theme-primary/30 border border-theme text-theme-primary font-semibold transition-all glow-primary-subtle cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Parsing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse & Fetch Elevation</span>
                </>
              )}
            </button>
            <button
              onClick={handleGPSLocation}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-black/40 hover:bg-white/10 border border-theme text-[var(--theme-text)] font-medium transition-all cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-theme-accent" />
              <span>Use GPS Location</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div className="text-[11px]">{errorMsg}</div>
            </div>
          )}
          {warningMsg && (
            <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="text-[11px] font-medium space-y-1">
                {warningMsg.split('\n').map((w, idx) => (
                  <div key={idx}>{w}</div>
                ))}
              </div>
            </div>
          )}
          {successInfo && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div className="text-[11px]">{successInfo}</div>
            </div>
          )}

          {stagedLocation && (
            <div className="p-3 rounded-xl border border-theme bg-black/60 space-y-2 glow-primary-subtle">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-theme-primary text-xs uppercase tracking-wider flex items-center gap-1">
                  <Mountain className="w-3.5 h-3.5" /> Resolved Station Data
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  Ready
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-white/5 border border-white/10">
                  <div className="text-theme-muted text-[10px]">Coordinates:</div>
                  <div className="font-mono font-medium text-[var(--theme-text)]">
                    {stagedLocation.latitude.toFixed(4)}°, {stagedLocation.longitude.toFixed(4)}°
                  </div>
                </div>
                <div className="p-2 rounded bg-white/5 border border-white/10">
                  <div className="text-theme-muted text-[10px]">Topographic Elevation:</div>
                  {isElevationUnknown ? (
                    <div className="font-mono font-medium text-amber-400">
                      unknown
                    </div>
                  ) : (
                    <div className="font-mono font-medium text-[var(--theme-text)]">
                      {stagedLocation.elevation} m
                    </div>
                  )}
                </div>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-theme-muted">
                    Horizon Dip (Dip = {HORIZON_DIP_COEFF_DEG}×√h):
                  </div>
                  {isElevationUnknown ? (
                    <div className="text-xs font-mono font-medium text-amber-400">
                      unknown
                    </div>
                  ) : (
                    <div className="text-xs font-mono font-bold text-theme-accent">
                      -{stagedLocation.horizonDip.toFixed(3)}°
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-theme-muted text-right">
                  Sunrise/Sunset Threshold:
                  {isElevationUnknown ? (
                    <div className="text-xs font-mono font-medium text-amber-400">
                      unknown
                    </div>
                  ) : (
                    <div className="font-mono text-slate-300">
                      {(-0.833 - stagedLocation.horizonDip).toFixed(3)}°
                    </div>
                  )}
                </div>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10 flex items-center justify-between text-[11px]">
                <div className="text-[10px] text-theme-muted">Site Timezone:</div>
                {stagedLocation.timeZone ? (
                  <div className="font-mono text-emerald-400 font-medium">
                    {stagedLocation.timeZone}
                  </div>
                ) : (
                  <div className="font-mono text-amber-400 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Timezone not found</span>
                  </div>
                )}
              </div>
              {nearbyMatch && (
                <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-xs font-medium leading-relaxed">
                    Nearby saved site found: <b className="text-amber-100">{nearbyMatch.loc.name}</b>
                  </span>
                </div>
              )}

              {nearbyMatch ? (
                <div className="flex gap-2 pt-1">
                  {isExactMatch ? (
                    <>
                      <button
                        onClick={() => handleSelectExisting(nearbyMatch.loc)}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-theme-primary text-black font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1 cursor-pointer shadow-lg shadow-theme-primary/20"
                      >
                        <Check className="w-3.5 h-3.5" /> Select Existing Site
                      </button>
                      <button
                        onClick={() => handleApplyStaged(true)}
                        className="py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs text-theme-muted hover:text-[var(--theme-text)] transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" /> Add Anyway
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApplyStaged(true)}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-theme-primary text-black font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" /> Add Anyway
                      </button>
                      <button
                        onClick={() => handleSelectExisting(nearbyMatch.loc)}
                        className="py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-amber-500/40 text-amber-200 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-theme-accent" /> Select Existing Site
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleApplyStaged(false)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-theme-primary text-black font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Select This Site
                  </button>
                  <button
                    onClick={() => handleApplyStaged(true)}
                    className="py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-theme text-xs text-[var(--theme-text)] transition-all flex items-center gap-1 cursor-pointer"
                    title="Add to Favorites and Select"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 text-theme-accent" />
                    <span>Add to Favorites</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-theme-muted flex items-center gap-1">
                <Bookmark className="w-3.5 h-3.5 text-theme-primary" /> Saved & Scientific Sites
              </span>
              <span className="text-[10px] text-theme-muted font-mono">{favorites.length} Sites</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {favorites.map((loc) => {
                const isActive =
                  Math.abs(loc.latitude - activeLocation.latitude) < 0.001 &&
                  Math.abs(loc.longitude - activeLocation.longitude) < 0.001;
                return (
                  <div
                    key={loc.id}
                    onClick={() => {
                      onSelectLocation(loc);
                      saveStoredLocation(loc);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left cursor-pointer transition-all ${
                      isActive
                        ? 'border border-theme bg-theme-primary/10 glow-primary-subtle'
                        : 'border border-white/5 bg-black/40 hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate text-[var(--theme-text)]">
                          {loc.name}
                        </span>
                        {loc.bortleClass && (
                          <span className="text-[9px] font-mono px-1 rounded bg-black/60 border border-white/10 text-theme-accent">
                            Bortle {loc.bortleClass}
                          </span>
                        )}
                        {isActive && (
                          <span className="text-[9px] font-mono px-1 rounded bg-theme-primary text-black font-bold">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-theme-muted font-mono mt-0.5 flex items-center gap-2">
                        <span>
                          {loc.latitude.toFixed(2)}°, {loc.longitude.toFixed(2)}°
                        </span>
                        <span>•</span>
                        {loc.elevationKnown === false ? (
                          <span className="text-amber-400 font-medium">elevation unknown</span>
                        ) : (
                          <>
                            <span>{loc.elevation}m</span>
                            <span>•</span>
                            <span className="text-theme-accent">
                              Dip -{calculateHorizonDip(loc.elevation).toFixed(2)}°
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {loc.isCustom && (
                        <button
                          onClick={(e) => handleDeleteFavorite(loc.id, e)}
                          className="p-1 rounded text-red-400/70 hover:text-red-300 hover:bg-red-950/40 transition-colors cursor-pointer"
                          title="Remove from Favorites"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-theme bg-black/40 flex items-center justify-between text-[11px] text-theme-muted">
          <div className="flex items-center gap-3">
            <span>
              Active Horizon Threshold: <b>{(-0.833 - activeLocation.horizonDip).toFixed(2)}°</b>
            </span>
            <button
              type="button"
              onClick={() => openSiteNavigation(activeLocation.latitude, activeLocation.longitude, activeLocation.name)}
              title="Open in Maps (Apple Maps / Google Maps)"
              className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-cyan-300 flex items-center gap-1 transition-colors font-mono cursor-pointer"
            >
              <Navigation className="w-3 h-3 text-cyan-400" />
              <span>Open Maps</span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[var(--theme-text)] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
