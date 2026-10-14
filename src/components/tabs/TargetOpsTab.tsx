import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Crosshair,
  Search,
  Filter,
  Sparkles,
  Compass,
  Clock,
  Layers,
  ChevronRight,
  Info,
  Bell,
  Volume2,
  AlertTriangle,
  Plus,
  Trash2,
  X,
  ShieldCheck,
  Mountain,
  Eye,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ResolvedSite } from '../../types';
import { siteDateKey, formatSiteTimeHM, formatSiteDateLabel } from '../../lib/siteTime';
import { calculateNightEphemeris } from '../../lib/ephemeris';
import { getSmoothSplinePath } from '../../lib/splinePath';
import {
  AstroTargetItem,
  TargetCategoryFilter,
  getAllTargets,
  filterTargets,
  analyzeTargetForNight,
  ComprehensiveTargetAnalysis,
  TargetAltitudePoint,
} from '../../lib/targetOpsEngine';

interface CategoryOption {
  readonly id: TargetCategoryFilter;
  readonly label: string;
}

const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  { id: 'all', label: 'All Targets' },
  { id: 'widefield', label: 'Wide-Field Milky Way' },
  { id: 'nebula', label: 'Nebulae' },
  { id: 'galaxy', label: 'Galaxies' },
  { id: 'cluster', label: 'Star Clusters' },
];

interface TargetOpsTabProps {
  location: ResolvedSite;
  selectedNightKey?: string;
}

function loadCustomTargets(): AstroTargetItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('chroma_nocta_custom_targets_v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: AstroTargetItem[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.ra === 'number' &&
        typeof item.dec === 'number' &&
        typeof item.categoryGroup === 'string'
      ) {
        const catGroup =
          item.categoryGroup === 'widefield' ||
          item.categoryGroup === 'nebula' ||
          item.categoryGroup === 'galaxy' ||
          item.categoryGroup === 'cluster'
            ? item.categoryGroup
            : 'nebula';
        valid.push({
          id: item.id,
          name: item.name,
          catalog: typeof item.catalog === 'string' ? item.catalog : 'Custom',
          type: typeof item.type === 'string' ? item.type : 'Custom Target',
          ra: item.ra,
          dec: item.dec,
          magnitude: typeof item.magnitude === 'number' ? item.magnitude : 6.0,
          sizeArcmin: typeof item.sizeArcmin === 'number' ? item.sizeArcmin : 30,
          constellation: typeof item.constellation === 'string' ? item.constellation : 'Custom',
          color: typeof item.color === 'string' ? item.color : '#38bdf8',
          secondaryColor: typeof item.secondaryColor === 'string' ? item.secondaryColor : undefined,
          recommendedFocal: typeof item.recommendedFocal === 'string' ? item.recommendedFocal : '50mm - 200mm',
          description: typeof item.description === 'string' ? item.description : 'Custom user target.',
          categoryGroup: catGroup,
          isCustom: true,
        });
      }
    }
    return valid;
  } catch {
    return [];
  }
}

function saveCustomTargets(targets: readonly AstroTargetItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('chroma_nocta_custom_targets_v1', JSON.stringify(targets));
  } catch {}
}

function playMeridianBeep(): void {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return;
  }
  try {
    const ctx = new window.AudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now + 0.15);
    gain2.gain.setValueAtTime(0.15, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.32);
  } catch {}
}

export const TargetOpsTab: React.FC<TargetOpsTabProps> = ({
  location,
  selectedNightKey,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<TargetCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minAltitudeDeg, setMinAltitudeDeg] = useState<number>(30);
  const [showAllTargets, setShowAllTargets] = useState<boolean>(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('mw-core');
  const [alarmLeadMinutes, setAlarmLeadMinutes] = useState<number>(20);
  const [audioAlarmEnabled, setAudioAlarmEnabled] = useState<boolean>(false);
  const [customTargets, setCustomTargets] = useState<AstroTargetItem[]>(() => loadCustomTargets());
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [scrubberIndex, setScrubberIndex] = useState<number | null>(null);

  // New Custom Target Form State
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<'widefield' | 'nebula' | 'galaxy' | 'cluster'>('nebula');
  const [newRa, setNewRa] = useState('5.59');
  const [newDec, setNewDec] = useState('-5.39');
  const [newConstellation, setNewConstellation] = useState('Orion');
  const [newFocal, setNewFocal] = useState('135mm - 300mm');
  const [newMag, setNewMag] = useState('5.0');
  const [newSize, setNewSize] = useState('60');
  const [newDescription, setNewDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const detailSectionRef = useRef<HTMLDivElement>(null);

  const [liveClockMs, setLiveClockMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClockMs(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const targetNightKey =
    selectedNightKey && selectedNightKey.length > 0
      ? selectedNightKey
      : siteDateKey(Date.now(), location.timeZone);

  const nightEphemeris = useMemo(() => {
    return calculateNightEphemeris(
      targetNightKey,
      location.latitude,
      location.longitude,
      location.elevation,
      location.timeZone,
      location.horizonProfile
    );
  }, [
    targetNightKey,
    location.latitude,
    location.longitude,
    location.elevation,
    location.timeZone,
    location.horizonProfile,
  ]);

  const todayKey = siteDateKey(liveClockMs, location.timeZone);
  const isViewingToday = !selectedNightKey || selectedNightKey === todayKey;
  const activeReferenceDate = useMemo(() => {
    if (isViewingToday) {
      return new Date(liveClockMs);
    }
    if (nightEphemeris.astroDusk !== null) {
      return nightEphemeris.astroDusk;
    }
    return new Date(nightEphemeris.date.getTime() + 20 * 3600 * 1000);
  }, [isViewingToday, liveClockMs, nightEphemeris]);

  const hasTerrainMask = Boolean(
    location.horizonProfile && location.horizonProfile.some((v) => v > 0)
  );

  const allAvailableTargets = useMemo(() => {
    return getAllTargets(customTargets);
  }, [customTargets]);

  const filteredTargets = useMemo(() => {
    return filterTargets(allAvailableTargets, categoryFilter, searchQuery);
  }, [allAvailableTargets, categoryFilter, searchQuery]);

  const analyzedTargets = useMemo(() => {
    const list: ComprehensiveTargetAnalysis[] = [];
    for (const target of filteredTargets) {
      list.push(
        analyzeTargetForNight(
          target,
          nightEphemeris,
          location.latitude,
          location.longitude,
          location.timeZone,
          minAltitudeDeg,
          activeReferenceDate,
          location.horizonProfile,
          alarmLeadMinutes
        )
      );
    }
    list.sort((a, b) => b.overallScore - a.overallScore);
    return list;
  }, [
    filteredTargets,
    nightEphemeris,
    location.latitude,
    location.longitude,
    location.timeZone,
    minAltitudeDeg,
    activeReferenceDate,
    location.horizonProfile,
    alarmLeadMinutes,
  ]);

  const displayedTargets = useMemo(() => {
    if (showAllTargets) {
      return analyzedTargets;
    }
    return analyzedTargets.slice(0, 5);
  }, [analyzedTargets, showAllTargets]);

  // Find active target analysis
  const activeAnalysis = useMemo(() => {
    let found = analyzedTargets.find((a) => a.target.id === selectedTargetId);
    if (!found && analyzedTargets.length > 0) {
      found = analyzedTargets[0];
    }
    if (!found) {
      const fallbackTarget = allAvailableTargets[0];
      return analyzeTargetForNight(
        fallbackTarget,
        nightEphemeris,
        location.latitude,
        location.longitude,
        location.timeZone,
        minAltitudeDeg,
        activeReferenceDate,
        location.horizonProfile,
        alarmLeadMinutes
      );
    }
    return found;
  }, [
    analyzedTargets,
    selectedTargetId,
    allAvailableTargets,
    nightEphemeris,
    location.latitude,
    location.longitude,
    location.timeZone,
    minAltitudeDeg,
    activeReferenceDate,
    location.horizonProfile,
    alarmLeadMinutes,
  ]);

  // Automatic Web Audio Alarm when in flip window
  const lastAlarmFiredRef = useRef<number>(0);
  useEffect(() => {
    if (!audioAlarmEnabled) return;
    if (activeAnalysis.meridian.inFlipWindow) {
      const currentEpochMs = Date.now();
      if (currentEpochMs - lastAlarmFiredRef.current > 60000) {
        lastAlarmFiredRef.current = currentEpochMs;
        playMeridianBeep();
      }
    }
  }, [audioAlarmEnabled, activeAnalysis.meridian.inFlipWindow]);

  const handleSelectTarget = (targetId: string) => {
    setSelectedTargetId(targetId);
    setScrubberIndex(null);
    if (detailSectionRef.current) {
      detailSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSaveCustomTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (cleanName.length === 0) {
      setFormError('Target name is required.');
      return;
    }
    const raNum = parseFloat(newRa);
    const decNum = parseFloat(newDec);
    if (isNaN(raNum) || raNum < 0 || raNum > 24) {
      setFormError('RA must be a valid hour number between 0 and 24.');
      return;
    }
    if (isNaN(decNum) || decNum < -90 || decNum > 90) {
      setFormError('Dec must be between -90° and +90°.');
      return;
    }

    const newTarget: AstroTargetItem = {
      id: `custom-${Date.now()}`,
      name: cleanName,
      catalog: 'Custom Catalog',
      type: `${newCategory.charAt(0).toUpperCase() + newCategory.slice(1)} Target`,
      ra: raNum,
      dec: decNum,
      magnitude: isNaN(parseFloat(newMag)) ? 5.0 : parseFloat(newMag),
      sizeArcmin: isNaN(parseFloat(newSize)) ? 60 : parseFloat(newSize),
      constellation: newConstellation.trim().length > 0 ? newConstellation.trim() : 'Custom',
      color: '#38bdf8',
      recommendedFocal: newFocal.trim().length > 0 ? newFocal.trim() : '135mm - 300mm',
      description: newDescription.trim().length > 0 ? newDescription.trim() : 'Custom user target.',
      categoryGroup: newCategory,
      isCustom: true,
    };

    const nextTargets = [newTarget, ...customTargets];
    setCustomTargets(nextTargets);
    saveCustomTargets(nextTargets);
    setSelectedTargetId(newTarget.id);
    setIsAddModalOpen(false);
    setFormError(null);
    setNewName('');
    setNewDescription('');
  };

  const handleDeleteCustomTarget = (targetId: string) => {
    const nextTargets = customTargets.filter((t) => t.id !== targetId);
    setCustomTargets(nextTargets);
    saveCustomTargets(nextTargets);
    if (selectedTargetId === targetId) {
      setSelectedTargetId('mw-core');
    }
  };

  const activePoints = activeAnalysis.visibility.points;
  const currentScrubPoint: TargetAltitudePoint | null =
    scrubberIndex !== null && scrubberIndex >= 0 && scrubberIndex < activePoints.length
      ? activePoints[scrubberIndex]
      : activePoints.length > 0
        ? activePoints[Math.floor(activePoints.length / 2)]
        : null;

  return (
    <div className="space-y-6 pb-28 text-slate-100 max-w-7xl mx-auto px-3 sm:px-6">
      {/* SECTION 1: HEADER & CONTROLS */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                <Crosshair className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  TARGET OPS & CELESTIAL TARGETING
                </h1>
                <p className="text-xs sm:text-sm text-slate-400">
                  {formatSiteDateLabel(targetNightKey)} • {location.name} ({location.latitude.toFixed(2)}°, {location.longitude.toFixed(2)}°, {location.elevation}m)
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {hasTerrainMask && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-300">
                <Mountain className="w-3.5 h-3.5" />
                8-Dir Terrain Mask Active
              </span>
            )}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add Target
            </button>
          </div>
        </div>

        {/* Filter Pills & Altitude Threshold Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Categories */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {CATEGORY_OPTIONS.map((cat) => {
              const isActive = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Min Altitude Deg Selector */}
          <div className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
            <span className="text-[11px] font-semibold text-slate-400 px-2 flex items-center gap-1">
              <Sliders className="w-3 h-3 text-slate-500" />
              Min Alt:
            </span>
            {[20, 25, 30, 40].map((deg) => (
              <button
                key={deg}
                onClick={() => setMinAltitudeDeg(deg)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                  minAltitudeDeg === deg
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                +{deg}°
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="mt-4 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search catalog by name, constellation (e.g. Orion, Cygnus, M31)..."
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-10 pr-10 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          {searchQuery.length > 0 && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>

      {/* SECTION 2: TOP TARGETS WITH MINI SPARKLINES */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              {showAllTargets ? `All Targets (${analyzedTargets.length})` : 'Top 5 Tonight — Recommended Opportunities'}
            </h2>
          </div>
          <button
            onClick={() => setShowAllTargets(!showAllTargets)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition py-1 px-2.5 rounded-lg hover:bg-slate-800"
          >
            {showAllTargets ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Show Top 5 Only
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Show All ({analyzedTargets.length})
              </>
            )}
          </button>
        </div>

        {displayedTargets.length === 0 ? (
          <div className="text-center py-10 bg-slate-950/40 rounded-xl border border-slate-800/80">
            <p className="text-sm text-slate-400">No targets found matching your criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {displayedTargets.map((analysis) => {
              const { target, visibility, lunar, meridian, overallScore } = analysis;
              const isSelected = target.id === selectedTargetId;

              // Build mini sparkline points (110x34)
              const pts = visibility.points;
              const sparklineCoords = pts.map((p, i) => {
                const x = pts.length > 1 ? (i / (pts.length - 1)) * 106 + 2 : 55;
                const clampedAlt = Math.max(0, Math.min(90, p.altitude));
                const y = 32 - (clampedAlt / 90) * 28;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              });
              const polylinePoints = sparklineCoords.join(' ');
              const threshY = 32 - (minAltitudeDeg / 90) * 28;

              return (
                <div
                  key={target.id}
                  onClick={() => handleSelectTarget(target.id)}
                  className={`cursor-pointer rounded-xl p-3.5 transition border text-left relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800/90 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div>
                    {/* Header: Score & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400 font-semibold block truncate">
                          {target.catalog} • {target.constellation}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-white truncate flex items-center gap-1.5 mt-0.5">
                          {target.name}
                          {target.isCustom && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              CUSTOM
                            </span>
                          )}
                        </h3>
                      </div>
                      <div
                        className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-tight shrink-0 border ${
                          overallScore >= 80
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : overallScore >= 50
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {overallScore} / 100
                      </div>
                    </div>

                    {/* Telemetry Row */}
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-800/70 text-[11px]">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-mono">Window</span>
                        <span className="font-bold text-emerald-400">{visibility.observableHours}h Dark</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-mono">Peak Alt</span>
                        <span className="font-semibold text-white">
                          {visibility.peakAltitude}° @ {visibility.peakTimeLabel}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-mono">Moon Sep</span>
                        <span
                          className={`font-semibold ${
                            lunar.warningLevel === 'severe'
                              ? 'text-rose-400'
                              : lunar.warningLevel === 'moderate'
                                ? 'text-amber-400'
                                : 'text-slate-300'
                          }`}
                        >
                          {lunar.separationDeg}°
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sparkline & Recommended Focal Footer */}
                  <div className="mt-3.5 pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 font-mono truncate">
                      Lens: {target.recommendedFocal}
                    </span>
                    <svg
                      width="110"
                      height="34"
                      viewBox="0 0 110 34"
                      className="shrink-0 bg-slate-900/80 rounded border border-slate-800/80"
                    >
                      {/* Threshold line */}
                      <line
                        x1="0"
                        y1={threshY}
                        x2="110"
                        y2={threshY}
                        stroke="#64748b"
                        strokeWidth="0.8"
                        strokeDasharray="2,2"
                      />
                      {/* Horizon line */}
                      <line x1="0" y1="32" x2="110" y2="32" stroke="#334155" strokeWidth="0.8" />
                      {/* Elevation path */}
                      <polyline
                        points={polylinePoints}
                        fill="none"
                        stroke={overallScore >= 70 ? '#34d399' : '#38bdf8'}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {meridian.inFlipWindow && (
                    <div className="mt-2 text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      GEM Flip Window Active
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 3: DETAILED CELESTIAL ALTITUDE & NET OBSERVABLE CURVE */}
      <section
        ref={detailSectionRef}
        className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {activeAnalysis.target.catalog}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                RA: {activeAnalysis.target.ra.toFixed(2)}h • Dec: {activeAnalysis.target.dec.toFixed(2)}° • Mag {activeAnalysis.target.magnitude}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
              {activeAnalysis.target.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 max-w-3xl">
              {activeAnalysis.target.description}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeAnalysis.target.isCustom && (
              <button
                onClick={() => handleDeleteCustomTarget(activeAnalysis.target.id)}
                className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition text-xs font-semibold flex items-center gap-1.5"
                title="Delete this custom target"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-right">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Overall Tactical Score</span>
              <span className="text-lg font-black text-emerald-400">
                {activeAnalysis.overallScore} / 100
              </span>
            </div>
          </div>
        </div>

        {/* Tactical Summary Banner */}
        <div className="mb-6 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-3">
          <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-white block">Flight Plan Tactical Briefing:</span>
            <p className="text-xs text-slate-300 mt-0.5">{activeAnalysis.tacticalSummary}</p>
          </div>
        </div>

        {/* Large Interactive SVG Chart */}
        <div className="relative bg-slate-950 rounded-2xl p-4 border border-slate-800 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 mb-3 gap-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              Night Altitude Profile & Imaging Window
            </span>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-sky-400 inline-block" />
                Altitude
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-slate-400 inline-block" />
                Min Floor (+{minAltitudeDeg}°)
              </span>
              {hasTerrainMask && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-amber-500 inline-block" />
                  Mountain Mask
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 bg-emerald-500/30 inline-block rounded-xs" />
                Net Dark Window
              </span>
            </div>
          </div>

          {/* SVG Canvas */}
          <div className="relative w-full aspect-[21/9] sm:aspect-[24/9]">
            <svg
              viewBox="0 0 600 220"
              className="w-full h-full select-none"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const xRel = Math.max(0, Math.min(1, (e.clientX - rect.left - 35 * rect.width / 600) / (555 * rect.width / 600)));
                const idx = Math.round(xRel * (activePoints.length - 1));
                if (idx >= 0 && idx < activePoints.length) {
                  setScrubberIndex(idx);
                }
              }}
              onTouchMove={(e) => {
                const touch = e.touches[0];
                if (!touch) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const xRel = Math.max(0, Math.min(1, (touch.clientX - rect.left - 35 * rect.width / 600) / (555 * rect.width / 600)));
                const idx = Math.round(xRel * (activePoints.length - 1));
                if (idx >= 0 && idx < activePoints.length) {
                  setScrubberIndex(idx);
                }
              }}
              onMouseLeave={() => setScrubberIndex(null)}
              onTouchEnd={() => setScrubberIndex(null)}
            >
              <defs>
                <linearGradient id="observableGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="mountainGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Horizontal Altitude Gridlines (0°, 30°, 60°, 90°) */}
              {[0, 30, 60, 90].map((deg) => {
                const y = 190 - (deg / 90) * 160;
                return (
                  <g key={deg}>
                    <line x1="35" y1={y} x2="590" y2={y} stroke="#1e293b" strokeWidth="0.8" />
                    <text x="25" y={y + 3} fill="#64748b" fontSize="9" textAnchor="end" fontFamily="monospace">
                      +{deg}°
                    </text>
                  </g>
                );
              })}

              {/* Threshold Line */}
              {(() => {
                const threshY = 190 - (minAltitudeDeg / 90) * 160;
                return (
                  <line
                    x1="35"
                    y1={threshY}
                    x2="590"
                    y2={threshY}
                    stroke="#475569"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                );
              })()}

              {/* Mountain Terrain Obstruction Polygon */}
              {hasTerrainMask && (() => {
                const terrainPts = activePoints.map((p, i) => {
                  const x = 35 + (i / (activePoints.length - 1)) * 555;
                  const y = 190 - (p.terrainAltitude / 90) * 160;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                const firstX = 35;
                const lastX = 590;
                const poly = `${firstX},190 ${terrainPts.join(' ')} ${lastX},190`;
                return (
                  <g>
                    <polygon points={poly} fill="url(#mountainGrad)" />
                    <polyline points={terrainPts.join(' ')} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,3" />
                  </g>
                );
              })()}

              {/* Observable Net Imaging Window Polygons */}
              {(() => {
                const polys: string[] = [];
                let currentChunk: { x: number; y: number }[] = [];
                activePoints.forEach((p, i) => {
                  const x = 35 + (i / (activePoints.length - 1)) * 555;
                  const clampedAlt = Math.max(0, Math.min(90, p.altitude));
                  const y = 190 - (clampedAlt / 90) * 160;
                  if (p.isObservable) {
                    currentChunk.push({ x, y });
                  } else {
                    if (currentChunk.length > 1) {
                      const top = currentChunk.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                      polys.push(`${currentChunk[0].x.toFixed(1)},190 ${top} ${currentChunk[currentChunk.length - 1].x.toFixed(1)},190`);
                    }
                    currentChunk = [];
                  }
                });
                if (currentChunk.length > 1) {
                  const top = currentChunk.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                  polys.push(`${currentChunk[0].x.toFixed(1)},190 ${top} ${currentChunk[currentChunk.length - 1].x.toFixed(1)},190`);
                }
                return polys.map((polyStr, idx) => (
                  <polygon key={idx} points={polyStr} fill="url(#observableGlow)" />
                ));
              })()}

              {/* Main Target Altitude Curve (Smooth Spline) */}
              {(() => {
                const splinePts = activePoints.map((p, i) => {
                  const x = 35 + (i / (activePoints.length - 1)) * 555;
                  const clampedAlt = Math.max(0, Math.min(90, p.altitude));
                  const y = 190 - (clampedAlt / 90) * 160;
                  return { x, y };
                });
                const splinePath = getSmoothSplinePath(splinePts);
                return (
                  <path
                    d={splinePath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()}

              {/* Peak marker */}
              {activeAnalysis.visibility.peakAltitude > 0 && (() => {
                let peakIdx = 0;
                let maxAlt = -90;
                activePoints.forEach((p, i) => {
                  if (p.altitude > maxAlt) {
                    maxAlt = p.altitude;
                    peakIdx = i;
                  }
                });
                const x = 35 + (peakIdx / (activePoints.length - 1)) * 555;
                const y = 190 - (Math.max(0, Math.min(90, maxAlt)) / 90) * 160;
                return (
                  <g>
                    <circle cx={x} cy={y} r="4" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
                    <text x={x} y={y - 8} fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                      Peak {maxAlt}°
                    </text>
                  </g>
                );
              })()}

              {/* Scrubber vertical line indicator */}
              {currentScrubPoint && scrubberIndex !== null && (() => {
                const x = 35 + (scrubberIndex / (activePoints.length - 1)) * 555;
                const y = 190 - (Math.max(0, Math.min(90, currentScrubPoint.altitude)) / 90) * 160;
                return (
                  <g>
                    <line x1={x} y1="30" x2={x} y2="190" stroke="#a78bfa" strokeWidth="1.2" strokeDasharray="3,3" />
                    <circle cx={x} cy={y} r="5" fill="#a78bfa" stroke="#ffffff" strokeWidth="1.5" />
                  </g>
                );
              })()}

              {/* Time tick labels along X axis */}
              {activePoints.map((p, i) => {
                // Show every 3rd or 4th label to avoid crowding
                if (i % 3 !== 0 && i !== activePoints.length - 1) return null;
                const x = 35 + (i / (activePoints.length - 1)) * 555;
                return (
                  <text
                    key={i}
                    x={x}
                    y="208"
                    fill="#64748b"
                    fontSize="9"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {p.timeLabel}
                  </text>
                );
              })}
            </svg>
          </div>

          {/* Interactive Scrubber Telemetry HUD */}
          {currentScrubPoint && (
            <div className="mt-3 bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs font-mono gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-white font-bold">{currentScrubPoint.timeLabel}</span>
              </div>
              <div>
                <span className="text-slate-400">Altitude: </span>
                <span className="text-sky-300 font-bold">{currentScrubPoint.altitude}°</span>
              </div>
              <div>
                <span className="text-slate-400">Azimuth: </span>
                <span className="text-slate-200 font-semibold">{currentScrubPoint.azimuth}°</span>
              </div>
              {(() => {
                const sIdx = scrubberIndex !== null ? scrubberIndex : Math.floor(activePoints.length / 2);
                const pIdx0 = Math.max(0, sIdx - 1);
                const pIdx1 = Math.min(activePoints.length - 1, sIdx + 1);
                const p0 = activePoints[pIdx0];
                const p1 = activePoints[pIdx1];
                if (p0 && p1 && pIdx1 > pIdx0) {
                  const dtHours = (p1.timeMs - p0.timeMs) / (3600 * 1000);
                  const rate = dtHours > 0 ? (p1.altitude - p0.altitude) / dtHours : 0;
                  const rateStr = `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}°/h`;
                  return (
                    <div>
                      <span className="text-slate-400">Rate: </span>
                      <span className={`font-semibold ${rate >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {rateStr}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
              {hasTerrainMask && (
                <div>
                  <span className="text-slate-400">Mountain Floor: </span>
                  <span className="text-amber-300 font-semibold">{currentScrubPoint.terrainAltitude}°</span>
                </div>
              )}
              <div>
                <span className="text-slate-400">Darkness: </span>
                <span className={currentScrubPoint.isDark ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {currentScrubPoint.isDark ? 'Astronomical Night' : 'Twilight / Daylight'}
                </span>
              </div>
              <div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    currentScrubPoint.isObservable
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {currentScrubPoint.isObservable ? 'SHOOTING WINDOW ACTIVE' : 'OBSTRUCTED / FAINT'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Lunar Interference & Glare Banner */}
        <div className="mt-5 p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={`p-2.5 rounded-xl border shrink-0 ${
                activeAnalysis.lunar.warningLevel === 'severe'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  : activeAnalysis.lunar.warningLevel === 'moderate'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}
            >
              <Compass className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Lunar Clearance & Glare Assessment
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    activeAnalysis.lunar.warningLevel === 'severe'
                      ? 'bg-rose-500/20 text-rose-300'
                      : activeAnalysis.lunar.warningLevel === 'moderate'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {activeAnalysis.lunar.warningLevel}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 font-medium mt-1">
                Angular Separation: <span className="font-bold text-white">{activeAnalysis.lunar.separationDeg}°</span> • Moon Illumination: <span className="font-bold text-white">{activeAnalysis.lunar.moonIllumination}% ({activeAnalysis.lunar.moonPhaseName})</span> • Moon Alt: <span className="font-bold text-white">{activeAnalysis.lunar.moonAltitude}°</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{activeAnalysis.lunar.warningNote}</p>
            </div>
          </div>

          {activeAnalysis.lunar.warningLevel !== 'optimal' && (
            <div className="sm:text-right shrink-0">
              <span className="text-[10px] uppercase font-mono text-amber-400 block font-semibold">
                Filter Recommendation
              </span>
              <span className="text-xs text-slate-300">Dual-Narrowband (SHO / Ha-OIII) or RGB Rejection</span>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: LIVE MERIDIAN FLIP WATCHDOG */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Clock className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Meridian Flip Watchdog & Pier Collision Guard
              </h2>
              <p className="text-xs text-slate-400">
                German Equatorial Mount (GEM) axis tracker, countdown timer & acoustic pier clearance warning.
              </p>
            </div>
          </div>

          {/* Alarm Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-purple-300">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>{isViewingToday ? 'Live Site' : 'Night'}: {formatSiteTimeHM(activeReferenceDate, location.timeZone)}</span>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 px-2">Lead Time:</span>
              {[15, 20, 30].map((lead) => (
                <button
                  key={lead}
                  onClick={() => setAlarmLeadMinutes(lead)}
                  className={`px-2 py-0.5 rounded text-xs font-semibold transition ${
                    alarmLeadMinutes === lead
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lead}m
                </button>
              ))}
            </div>

            <button
              onClick={() => setAudioAlarmEnabled(!audioAlarmEnabled)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                audioAlarmEnabled
                  ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              {audioAlarmEnabled ? 'Audio Alert On' : 'Audio Alert Off'}
            </button>

            <button
              onClick={playMeridianBeep}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Test Web Audio API buzzer tone"
            >
              <Volume2 className="w-3.5 h-3.5 text-purple-400" />
              Test Beep
            </button>
          </div>
        </div>

        {/* Meridian Flip Warning Banner */}
        {activeAnalysis.meridian.inFlipWindow && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex items-start gap-3 animate-pulse">
            <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-white">
                ⚠️ MERIDIAN FLIP IMMINENT — Check cable tension & tripod pier clearance!
              </h3>
              <p className="text-xs text-rose-200 mt-1">
                Target is within the critical ±{alarmLeadMinutes} min transition zone (Δ={activeAnalysis.meridian.timeToTransitMinutes} min). Halt long-exposure guiding or allow autonomous mount meridian flip sequence.
              </p>
            </div>
          </div>
        )}

        {/* Watchdog Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-4">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Transit Time</span>
            <span className="text-base sm:text-lg font-black text-white mt-0.5 block">
              {activeAnalysis.meridian.transitTimeLabel}
            </span>
            <span className="text-[10px] text-slate-400">Local Site Time</span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Hour Angle (HA)</span>
            <span className="text-base sm:text-lg font-black text-indigo-300 mt-0.5 block">
              {activeAnalysis.meridian.hourAngleHours}h
            </span>
            <span className="text-[10px] text-slate-400">{activeAnalysis.meridian.axisSideLabel}</span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Culmination Alt</span>
            <span className="text-base sm:text-lg font-black text-white mt-0.5 block">
              {activeAnalysis.meridian.transitAltitude}°
            </span>
            <span className="text-[10px] text-slate-400">Peak Zenith Proximity</span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-mono text-slate-500 block">Darkness Overlap</span>
            <span
              className={`text-base sm:text-lg font-black mt-0.5 block ${
                activeAnalysis.meridian.isDuringDarkness ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {activeAnalysis.meridian.isDuringDarkness ? 'In Darkness' : 'In Twilight'}
            </span>
            <span className="text-[10px] text-slate-400">Prime SHO / LRGB</span>
          </div>
        </div>

        {/* GEM Guidance notes */}
        <div className="mt-4 p-3 bg-slate-950/50 rounded-xl border border-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            Watchdog Status: {activeAnalysis.meridian.description}
          </span>
          <span className="font-mono text-[11px] text-slate-500 hidden md:inline">
            Flip threshold: ±{alarmLeadMinutes}m
          </span>
        </div>
      </section>

      {/* SECTION 5: ADD CUSTOM TARGET MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl relative text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">Add Custom Astro Target</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomTarget} className="mt-4 space-y-3.5">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Barnard 33 (Horsehead Nebula)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Category *
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'widefield' || v === 'nebula' || v === 'galaxy' || v === 'cluster') {
                        setNewCategory(v);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="nebula">Nebula</option>
                    <option value="galaxy">Galaxy</option>
                    <option value="cluster">Cluster</option>
                    <option value="widefield">Wide-Field Milky Way</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Constellation
                  </label>
                  <input
                    type="text"
                    value={newConstellation}
                    onChange={(e) => setNewConstellation(e.target.value)}
                    placeholder="e.g. Orion"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Right Ascension (RA Hours 0..24) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="24"
                    value={newRa}
                    onChange={(e) => setNewRa(e.target.value)}
                    placeholder="5.59"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Declination (Dec Degrees -90..+90) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="-90"
                    max="90"
                    value={newDec}
                    onChange={(e) => setNewDec(e.target.value)}
                    placeholder="-5.39"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Apparent Mag
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newMag}
                    onChange={(e) => setNewMag(e.target.value)}
                    placeholder="5.0"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Size (arcmin)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    placeholder="60"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Focal Length
                  </label>
                  <input
                    type="text"
                    value={newFocal}
                    onChange={(e) => setNewFocal(e.target.value)}
                    placeholder="200mm - 600mm"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tactical Notes & Description
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Prime dual-narrowband target. Watch for low eastern altitude early in session."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/30"
                >
                  Save Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
