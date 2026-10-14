import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Eye,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Wind,
  Droplets,
  Thermometer,
  Moon,
  CloudRain,
  Orbit,
  X,
  MapPin,
  Settings,
  Plus,
  Check,
  Trash2,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Mountain,
} from 'lucide-react';
import { HorizonMaskModal } from '../HorizonMaskModal';
import { AltitudeCurve } from '../AltitudeCurve';
import { MiniCalendarModal, PreciseMoonIcon } from '../MiniCalendarModal';
export { PreciseMoonIcon } from '../MiniCalendarModal';
import { HourlyWeatherPoint, LocationData, ResolvedSite, SolarEphemerisDay, UnitSystem } from '../../types';
import {
  calculateNightEphemeris,
  formatTimeHM,
} from '../../lib/ephemeris';
import {
  siteDateKey,
  addDaysToDateKey,
  parseDateKey,
  zonedTimeToInstant,
  siteHour,
  currentNightKey,
  siteParts,
  siteNoon,
  formatSiteTimeHM,
  getSiteTimeZone,
  resolveSite,
} from '../../lib/siteTime';
import {
  getStoredFavorites,
  saveStoredLocation,
  PRESET_LOCATIONS,
} from '../../lib/coordinateParser';
import {
  fetch16DayHourlyWeather,
  WeatherSourceType,
} from '../../lib/weatherService';
import { summarizeSiteNightWeather } from '../../lib/nightWeather';
import type { NightScoreResult } from '../../lib/nightScore';
import { computeWindowClusters } from '../../lib/windowClusters';
import { buildClusterBuffer } from '../../lib/clusterBuffer';
import { MONTHS_EN, MONTHS_SHORT_EN, WEEKDAYS_EN } from '../../lib/calendarNames';

interface NightCalendarTabProps {
  location: ResolvedSite;
  onNavigateToSky: (selectedDate: Date) => void;
  onNavigateToWeather?: (site: LocationData, targetSection?: string, dateKey?: string) => void;
  selectedNightKey?: string;
  onSelectNightKey?: (dateKey: string) => void;
}



// ---------------------------------------------------------------------------
// YENİ ATMOSFERİK GÜNEŞ BİLEŞENİ (AtmosphericSunIcon)
// ---------------------------------------------------------------------------
export const AtmosphericSunIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 44,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`shrink-0 drop-shadow-[0_0_16px_rgba(245,158,11,0.75)] ${className}`}
    >
      <defs>
        {/* Pürüzsüz Dijital Renk Yumuşatıcı */}
        <filter id="sunSmoothBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>

        {/* Akkor Çekirdek & Kesintisiz Atmosferik Geçiş */}
        <radialGradient id="sunSmoothCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#ffffff" />
          <stop offset="68%" stopColor="#fffbeb" />
          <stop offset="82%" stopColor="#fef08a" />
          <stop offset="91%" stopColor="#f59e0b" />
          <stop offset="97%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
      </defs>

      {/* Dış Yumuşak Korona Parıltısı */}
      <circle cx="50" cy="50" r="48" fill="#ea580c" opacity="0.25" filter="url(#sunSmoothBlur)" />

      {/* Ana Güneş Gövdesi (Ay ile Pikseli Pikseline Eşit r=46 Çap, Sert Çizgisiz) */}
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="url(#sunSmoothCore)"
        filter="url(#sunSmoothBlur)"
      />
    </svg>
  );
};



// ---------------------------------------------------------------------------
// 2. YILLIK ZİFİRİ PENCERELER PLANLAYICISI (ANNUAL DARK SKY MODAL)
// ---------------------------------------------------------------------------
interface AnnualDarkSkyModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: ResolvedSite;
  onSelectWindow: (
    targetDate: Date,
    targetDateKey: string,
    viewingYear: number,
    viewingMonth: number
  ) => void;
}

const AnnualDarkSkyModal: React.FC<AnnualDarkSkyModalProps> = ({
  isOpen,
  onClose,
  location,
  onSelectWindow,
}) => {
  const annualList = useMemo(() => {
    if (!isOpen) return [];
    const tz = location.timeZone;
    const nowParts = siteParts(Date.now(), tz);
    const startY = nowParts.year;
    const startM = nowParts.month - 1;
    const list: {
      year: number;
      month: number;
      monthName: string;
      rangeStr: string;
      startDate: Date;
      dateKey: string;
      newMoonText: string;
      darkDurationText: string;
      avgRatio: number;
    }[] = [];

    for (let offset = 0; offset < 24; offset++) {
      const totalMonth = startM + offset;
      const y = startY + Math.floor(totalMonth / 12);
      const m = totalMonth % 12;
      const bufferDays = buildClusterBuffer(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          elevation: location.elevation,
          timeZone: location.timeZone,
          horizonProfile: location.horizonProfile,
        },
        y,
        m
      );

      const clusters = computeWindowClusters(bufferDays, m, tz, zonedTimeToInstant(y, m + 1, 1, 12, 0, 0, tz));
      const best = clusters.bestRun;

      if (best && clusters.best.available) {
        const sItem = bufferDays[best.startIdx];
        const eItem = bufferDays[best.endIdx];
        const sParts = siteParts(sItem.date, tz);
        const eParts = siteParts(eItem.date, tz);
        const sDay = sParts.day;
        const eDay = eParts.day;
        const sMonth = MONTHS_SHORT_EN[sParts.month - 1];
        const eMonth = MONTHS_SHORT_EN[eParts.month - 1];
        const fullMonthName = MONTHS_EN[m];
        const rangeStr =
          sParts.month === eParts.month
            ? `${sDay} - ${eDay} ${fullMonthName} ${y}`
            : `${sDay} ${sMonth} - ${eDay} ${eMonth} ${y}`;

        const slice = bufferDays.slice(best.startIdx, best.endIdx + 1);
        const sortedByIllum = [...slice].sort((a, b) => a.illum - b.illum);
        const newMoonItem = sortedByIllum[0];
        const nmParts = siteParts(newMoonItem.date, tz);
        const nmDay = nmParts.day;
        const nmMonth = MONTHS_SHORT_EN[nmParts.month - 1];

        const maxDarkMins = Math.max(...slice.map((d) => d.moonlessDarkMinutes));
        const hours = (maxDarkMins / 60).toFixed(1);

        list.push({
          year: y,
          month: m,
          monthName: fullMonthName,
          rangeStr,
          startDate: sItem.date,
          dateKey: sItem.dateKey,
          newMoonText: `${nmDay} ${nmMonth} New Moon`,
          darkDurationText: `~${hours}h Uninterrupted Darkness`,
          avgRatio: Math.round(best.avgRatio),
        });
      }
    }
    return list;
  }, [isOpen, location.latitude, location.longitude, location.elevation, location.timeZone, location.horizonProfile]);

  if (!isOpen) return null;

  const years = Array.from(new Set(annualList.map((item) => item.year)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl border border-theme bg-[var(--theme-card)] shadow-2xl p-4 sm:p-5 relative animate-in zoom-in-95 duration-150 text-[var(--theme-text)] flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-400/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold font-mono uppercase tracking-wider text-white">
                24-Month Dark Windows
              </h3>
              <p className="text-[10px] text-theme-muted font-mono">
                Jean Meeus Ephemeris Model (90% - 100% Window Efficiency)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-theme-muted hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto pr-1 mt-3 space-y-4 flex-1 select-none">
          {years.map((yr) => (
            <div key={yr} className="space-y-1.5">
              <div className="sticky top-0 bg-[var(--theme-card)]/90 backdrop-blur-sm py-1 z-10 flex items-center gap-2 border-b border-white/10">
                <span className="text-xs font-mono font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                  {yr} YEAR
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Monthly Optimal Imaging Windows
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 pt-1">
                {annualList
                  .filter((item) => item.year === yr)
                  .map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onSelectWindow(item.startDate, item.dateKey, item.year, item.month);
                        onClose();
                      }}
                      className="p-2.5 rounded-xl border border-white/10 bg-black/40 hover:bg-cyan-950/40 hover:border-cyan-400/60 transition-all text-left flex items-center justify-between group cursor-pointer active:scale-98"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs sm:text-sm font-mono font-bold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>{item.rangeStr}</span>
                        </div>
                        <div className="text-[10px] sm:text-xs font-mono text-theme-muted flex items-center gap-1.5">
                          <span className="text-slate-300">🌑 {item.newMoonText}</span>
                          <span>•</span>
                          <span className="text-cyan-200/90 font-semibold">{item.darkDurationText}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] sm:text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 whitespace-nowrap">
                          %{item.avgRatio} Efficiency
                        </span>
                        <ChevronRight className="w-4 h-4 text-theme-muted group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-theme-muted shrink-0">
          <span>* Selected month and window will load instantly</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/15 text-white font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// STANDART DİKEY KONUM ŞABLONU YARDIMCISI: Yer Adı / İlçe / İl
// ---------------------------------------------------------------------------
export function formatSiteLocationParts(site: LocationData): { place: string; districtCity: string } {
  const knownPlaces: Record<string, { place: string; districtCity: string }> = {
    'bolu-sarialan': { place: 'Sarıalan Yaylası', districtCity: 'Seben / BOLU' },
    'erzurum-dag': { place: 'DAG Observatory', districtCity: 'Palandöken / ERZURUM' },
    'antalya-tug': { place: 'TÜBİTAK TUG', districtCity: 'Saklıkent / ANTALYA' },
    'isparta-melikler': { place: 'Melikler Yaylası', districtCity: 'Yenişarbademli / ISPARTA' },
    'canakkale-kazdaglari': { place: 'Mount Ida', districtCity: 'Bayramiç / ÇANAKKALE' },
    'mugla-sandras': { place: 'Sandras Mountain', districtCity: 'Köyceğiz / MUĞLA' },
    'atacama-chile': { place: 'Paranal Observatory', districtCity: 'Atacama / CHILE' },
    'la-palma-roque': { place: 'Roque Observatory', districtCity: 'Garafía / LA PALMA' },
  };

  if (site.id && knownPlaces[site.id]) {
    return knownPlaces[site.id];
  }

  const name = site.name ? site.name.trim() : '';
  if (name.includes(' • ')) {
    const parts = name.split(' • ');
    return { place: parts[0].trim(), districtCity: parts.slice(1).join(' • ').trim() };
  }

  const parenMatch = name.match(/^(.*?)\s*\((.*?)\)$/);
  if (parenMatch) {
    const main = parenMatch[1].trim();
    const detail = parenMatch[2].trim();
    const words = main.split(' ');
    if (words.length > 1) {
      const city = words[0].toUpperCase();
      const place = words.slice(1).join(' ');
      return { place, districtCity: `${detail} / ${city}` };
    }
    return { place: main, districtCity: detail };
  }

  const words = name.split(' ');
  if (words.length >= 2) {
    const city = words[0].toUpperCase();
    const place = words.slice(1).join(' ');
    return { place, districtCity: city };
  }

  return { place: name, districtCity: `${site.latitude.toFixed(2)}°, ${site.longitude.toFixed(2)}°` };
}

// ---------------------------------------------------------------------------
// CANLI SAAT ALT BİLEŞENİ (LiveSiteClock)
// ---------------------------------------------------------------------------
const LiveSiteClock: React.FC<{ tz: string; timeFormat: '24h' | '12h' }> = ({ tz, timeFormat }) => {
  const [siteLiveNow, setSiteLiveNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setSiteLiveNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const liveSiteClockString = useMemo(() => {
    const p = siteParts(siteLiveNow, tz);
    const pad = (n: number) => String(n).padStart(2, '0');
    if (timeFormat === '12h') {
      const h12 = p.hour % 12 || 12;
      const ampm = p.hour >= 12 ? 'PM' : 'AM';
      return `${pad(h12)}:${pad(p.minute)}:${pad(p.second)} ${ampm}`;
    }
    return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  }, [siteLiveNow, tz, timeFormat]);

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 font-mono text-xs shadow-[0_0_8px_rgba(6,182,212,0.2)] shrink-0"
      title="Site Live Clock"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
      <span>{liveSiteClockString}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// NIGHT CALENDAR TAB ANA BİLEŞENİ
// ---------------------------------------------------------------------------
export const NightCalendarTab: React.FC<NightCalendarTabProps> = ({
  location,
  onNavigateToSky,
  onNavigateToWeather,
  selectedNightKey,
  onSelectNightKey,
}) => {
  const horizontalScrollRef = useRef<HTMLDivElement>(null);

  const tz = location.timeZone;
  const [siteTodayKey, setSiteTodayKey] = useState<string>(() => currentNightKey(Date.now(), tz));

  useEffect(() => {
    setSiteTodayKey(currentNightKey(Date.now(), tz));
    const interval = setInterval(() => {
      const currentSiteKey = currentNightKey(Date.now(), tz);
      setSiteTodayKey((prev) => (prev !== currentSiteKey ? currentSiteKey : prev));
    }, 60000);
    return () => clearInterval(interval);
  }, [tz]);

  // Live Site Clock & Format preference
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>(() => {
    try {
      const val = localStorage.getItem('chroma_nocta_time_format');
      if (val === '12h') return '12h';
    } catch {}
    return '24h';
  });

  useEffect(() => {
    const handleTimeFormatChange = () => {
      try {
        const val = localStorage.getItem('chroma_nocta_time_format');
        setTimeFormat(val === '12h' ? '12h' : '24h');
      } catch {}
    };
    window.addEventListener('chroma_time_format_changed', handleTimeFormatChange);
    window.addEventListener('storage', handleTimeFormatChange);
    return () => {
      window.removeEventListener('chroma_time_format_changed', handleTimeFormatChange);
      window.removeEventListener('storage', handleTimeFormatChange);
    };
  }, []);

  const initialParts = parseDateKey(siteTodayKey);
  const [currentViewingMonth, setCurrentViewingMonth] = useState<{ year: number; month: number }>(() => ({
    year: initialParts.year,
    month: initialParts.month - 1,
  }));

  const [selectedDateKey, setSelectedDateKey] = useState<string>(() =>
    selectedNightKey || currentNightKey(Date.now(), tz)
  );

  useEffect(() => {
    if (selectedNightKey && selectedNightKey !== selectedDateKey) {
      setSelectedDateKey(selectedNightKey);
      try {
        const parts = parseDateKey(selectedNightKey);
        setCurrentViewingMonth({ year: parts.year, month: parts.month - 1 });
      } catch {
        // fallback
      }
    }
  }, [selectedNightKey]);

  const [selectedWindowGroup, setSelectedWindowGroup] = useState<'early' | 'best' | 'late'>('best');
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isAnnualModalOpen, setIsAnnualModalOpen] = useState(false);
  const [isHorizonModalOpen, setIsHorizonModalOpen] = useState(false);
  const [activeBriefingModal, setActiveBriefingModal] = useState<{
    place: string;
    districtCity: string;
    dateLabel: string;
    windowLabel: string;
    isTomorrow: boolean;
    nightScore: NightScoreResult;
  } | null>(null);

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(() => {
    try {
      const val = localStorage.getItem('chroma_nocta_unit_system');
      if (val === 'imperial') return 'imperial';
    } catch {
      // fallback
    }
    return 'metric';
  });

  useEffect(() => {
    const handler = () => {
      try {
        const val = localStorage.getItem('chroma_nocta_unit_system');
        setUnitSystem(val === 'imperial' ? 'imperial' : 'metric');
      } catch {
        // fallback
      }
    };
    window.addEventListener('chroma_unit_system_changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('chroma_unit_system_changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const scrollLeftStart = useRef(0);
  const hasDragged = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!horizontalScrollRef.current) return;
    setIsDragging(true);
    hasDragged.current = false;
    dragStartX.current = e.pageX - horizontalScrollRef.current.offsetLeft;
    scrollLeftStart.current = horizontalScrollRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !horizontalScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - horizontalScrollRef.current.offsetLeft;
    const walk = (x - dragStartX.current) * 1.5;
    if (Math.abs(x - dragStartX.current) > 5) {
      hasDragged.current = true;
    }
    horizontalScrollRef.current.scrollLeft = scrollLeftStart.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleDayItemClick = (dateKey: string) => {
    if (hasDragged.current) return;
    setSelectedDateKey(dateKey);
    if (onSelectNightKey) {
      onSelectNightKey(dateKey);
    }
    try {
      const parts = dateKey.split('-');
      if (parts.length === 3) {
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        setCurrentViewingMonth({ year: y, month: m });
      }
    } catch {
      // fallback
    }
  };

  const ephemerisDays = useMemo(() => {
    const days: SolarEphemerisDay[] = [];
    const pastDays = 60;
    const futureDays = 365;
    for (let i = -pastDays; i <= futureDays; i++) {
      const targetKey = addDaysToDateKey(siteTodayKey, i);
      const ephem = calculateNightEphemeris(
        targetKey,
        location.latitude,
        location.longitude,
        location.elevation,
        tz,
        location.horizonProfile
      );
      days.push(ephem);
    }
    return days;
  }, [siteTodayKey, location.latitude, location.longitude, location.elevation, tz, location.horizonProfile]);

  const selectedDay = useMemo(() => {
    const match = ephemerisDays.find((d) => d.dateKey === selectedDateKey);
    if (match) return match;
    return calculateNightEphemeris(
      selectedDateKey,
      location.latitude,
      location.longitude,
      location.elevation,
      tz,
      location.horizonProfile
    );
  }, [ephemerisDays, selectedDateKey, location.latitude, location.longitude, location.elevation, tz, location.horizonProfile]);

  const fullDateString = useMemo(() => {
    const p = siteParts(selectedDay.date, tz);
    const dayOfWeek = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    return `${p.day} ${MONTHS_EN[p.month - 1]} ${p.year} ${WEEKDAYS_EN[dayOfWeek]}`;
  }, [selectedDay.date, tz]);

  const handlePrevDay = () => {
    const curIdx = ephemerisDays.findIndex((d) => d.dateKey === selectedDateKey);
    if (curIdx > 0) {
      const prevDay = ephemerisDays[curIdx - 1];
      const p = siteParts(prevDay.date, tz);
      setSelectedDateKey(prevDay.dateKey);
      onSelectNightKey?.(prevDay.dateKey);
      setCurrentViewingMonth({ year: p.year, month: p.month - 1 });
    } else {
      const key = addDaysToDateKey(selectedDateKey, -1);
      const { year, month } = parseDateKey(key);
      setSelectedDateKey(key);
      onSelectNightKey?.(key);
      setCurrentViewingMonth({ year, month: month - 1 });
    }
  };

  const handleNextDay = () => {
    const curIdx = ephemerisDays.findIndex((d) => d.dateKey === selectedDateKey);
    if (curIdx >= 0 && curIdx < ephemerisDays.length - 1) {
      const nextDay = ephemerisDays[curIdx + 1];
      const p = siteParts(nextDay.date, tz);
      setSelectedDateKey(nextDay.dateKey);
      onSelectNightKey?.(nextDay.dateKey);
      setCurrentViewingMonth({ year: p.year, month: p.month - 1 });
    } else {
      const key = addDaysToDateKey(selectedDateKey, 1);
      const { year, month } = parseDateKey(key);
      setSelectedDateKey(key);
      onSelectNightKey?.(key);
      setCurrentViewingMonth({ year, month: month - 1 });
    }
  };

  const clusters = useMemo(() => {
    const year = currentViewingMonth.year;
    const month = currentViewingMonth.month;
    const monthDate = zonedTimeToInstant(year, month + 1, 1, 12, 0, 0, tz);

    return computeWindowClusters(
      buildClusterBuffer(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          elevation: location.elevation,
          timeZone: location.timeZone,
          horizonProfile: location.horizonProfile,
        },
        year,
        month
      ),
      month,
      tz,
      monthDate
    );
  }, [currentViewingMonth, location.latitude, location.longitude, location.elevation, location.timeZone, location.horizonProfile]);

  const activeWindowDateKeys = useMemo(() => {
    const currentCluster = clusters[selectedWindowGroup];
    if (!currentCluster || !currentCluster.available || !currentCluster.dateKeys) return new Set<string>();
    return new Set(currentCluster.dateKeys);
  }, [clusters, selectedWindowGroup]);

  const handleSelectCluster = (group: 'early' | 'best' | 'late') => {
    setSelectedWindowGroup(group);
    const targetCluster = clusters[group];
    if (!targetCluster || !targetCluster.available || !targetCluster.dateKey) return;
    setSelectedDateKey(targetCluster.dateKey);
    onSelectNightKey?.(targetCluster.dateKey);
    setTimeout(() => {
      const targetEl = horizontalScrollRef.current?.querySelector(`[data-datekey="${targetCluster.dateKey}"]`);
      targetEl?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }, 60);
  };

  // ---------------------------------------------------------------------------
  // SAHA SEÇİMİ VE ÇOKLU SAHA HAVA DURUMU İSTASYONU
  // ---------------------------------------------------------------------------
  const [selectedSites, setSelectedSites] = useState<LocationData[]>(() => {
    const favs = getStoredFavorites();
    if (favs.length >= 2) {
      return [favs[0], favs[1]];
    } else if (favs.length === 1) {
      const second = PRESET_LOCATIONS.find((p) => p.id !== favs[0].id) || PRESET_LOCATIONS[1];
      return [favs[0], second];
    }
    return [PRESET_LOCATIONS[0], PRESET_LOCATIONS[1]];
  });

  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [previewNextNightSiteIds, setPreviewNextNightSiteIds] = useState<Set<string>>(new Set());

  const handleToggleNextNightPreview = (siteId: string) => {
    setPreviewNextNightSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        next.add(siteId);
      }
      return next;
    });
  };

  const handleNavigateToWeather = (site: LocationData, targetSection: string = 'section-temperature') => {
    saveStoredLocation(site);
    try {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('chroma_location_changed', { detail: site }));
      window.dispatchEvent(
        new CustomEvent('chroma_navigate_weather_section', {
          detail: { site, targetSection, dateKey: selectedDateKey },
        })
      );
    } catch {}
    if (onNavigateToWeather) {
      onNavigateToWeather(site, targetSection, selectedDateKey);
    } else {
      window.location.hash = '#tabWeather';
      setTimeout(() => {
        document.getElementById(targetSection)?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    }
  };

  const allAvailableLocations = useMemo(() => {
    const favs = getStoredFavorites();
    const map = new Map<string, LocationData>();
    if (location && location.id) {
      map.set(location.id, location);
    }
    favs.forEach((f) => map.set(f.id, f));
    PRESET_LOCATIONS.forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p);
    });
    return Array.from(map.values());
  }, [location]);

  const handleRemoveSite = (siteId: string) => {
    if (selectedSites.length <= 1) return;
    setSelectedSites((prev) => prev.filter((s) => s.id !== siteId));
  };

  const handleAddSite = (site: LocationData) => {
    setSelectedSites((prev) => {
      if (prev.some((s) => s.id === site.id)) return prev;
      return [...prev, site];
    });
  };

  const handleMoveSiteUp = (index: number) => {
    if (index <= 0) return;
    setSelectedSites((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  };

  const handleMoveSiteDown = (index: number) => {
    setSelectedSites((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  };

  const [sitesWeatherMap, setSitesWeatherMap] = useState<
    Record<string, { points: HourlyWeatherPoint[]; sourceType: WeatherSourceType }>
  >({});

  const sitesKey = useMemo(() => {
    return selectedSites.map((s) => `${s.id}-${s.latitude}-${s.longitude}`).join(';');
  }, [selectedSites]);

  useEffect(() => {
    let isMounted = true;
    async function loadAllSitesWeather() {
      const fallbackSource: WeatherSourceType = 'fallback';
      try {
        const promises = selectedSites.map(async (site) => {
          const resolved = resolveSite(site);
          if (!resolved) {
            return {
              id: site.id,
              points: [],
              sourceType: fallbackSource,
            };
          }
          try {
            const w = await fetch16DayHourlyWeather(resolved);
            return { id: site.id, points: w.points, sourceType: w.sourceType };
          } catch {
            return {
              id: site.id,
              points: [],
              sourceType: fallbackSource,
            };
          }
        });
        const results = await Promise.all(promises);
        if (isMounted) {
          const newMap: Record<string, { points: HourlyWeatherPoint[]; sourceType: WeatherSourceType }> = {};
          results.forEach((r) => {
            newMap[r.id] = { points: r.points, sourceType: r.sourceType };
          });
          setSitesWeatherMap(newMap);
        }
      } catch {
        // fallback
      }
    }
    loadAllSitesWeather();
    return () => {
      isMounted = false;
    };
  }, [sitesKey]);

  const formattedSelectedDate = useMemo(() => {
    const p = siteParts(selectedDay.date, tz);
    return `${p.day} ${MONTHS_SHORT_EN[p.month - 1]} ${p.year}`;
  }, [selectedDay.date, tz]);

  const handleCalendarModalSelect = (date: Date) => {
    const key = siteDateKey(date, tz);
    const { year, month } = parseDateKey(key);
    setCurrentViewingMonth({ year, month: month - 1 });
    setSelectedDateKey(key);
    if (onSelectNightKey) {
      onSelectNightKey(key);
    }
    setTimeout(() => {
      const targetEl = horizontalScrollRef.current?.querySelector(`[data-datekey="${key}"]`);
      targetEl?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 60);
  };

  const handleResetToToday = () => {
    const currentSiteKey = currentNightKey(Date.now(), tz);
    const parts = parseDateKey(currentSiteKey);
    setCurrentViewingMonth({ year: parts.year, month: parts.month - 1 });
    setSelectedDateKey(currentSiteKey);
    if (onSelectNightKey) {
      onSelectNightKey(currentSiteKey);
    }
    setSelectedWindowGroup('best');
    setTimeout(() => {
      const targetEl = horizontalScrollRef.current?.querySelector(`[data-datekey="${currentSiteKey}"]`);
      targetEl?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }, 60);
  };

  useEffect(() => {
    const scrollToSelected = () => {
      if (!horizontalScrollRef.current) return;
      const targetEl = horizontalScrollRef.current.querySelector(
        `[data-datekey="${selectedDateKey}"]`
      );
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    };

    // DOM çizimini beklemek için çift kare + kısa gecikme
    const rafId = requestAnimationFrame(() => {
      const timer = setTimeout(scrollToSelected, 150);
      return () => clearTimeout(timer);
    });

    return () => cancelAnimationFrame(rafId);
  }, [selectedDateKey, ephemerisDays.length]);

  const handleSelectAnnualWindow = (
    _targetDate: Date,
    targetDateKey: string,
    viewingYear: number,
    viewingMonth: number
  ) => {
    setCurrentViewingMonth({ year: viewingYear, month: viewingMonth });
    setSelectedDateKey(targetDateKey);
    if (onSelectNightKey) {
      onSelectNightKey(targetDateKey);
    }
    setTimeout(() => {
      const targetEl = horizontalScrollRef.current?.querySelector(`[data-datekey="${targetDateKey}"]`);
      targetEl?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 60);
  };

  return (
    <div id="tabCalendar" className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* 1. BAŞLIK VE KONTROLLER */}
      <div className="p-3 rounded-2xl border border-theme bg-black/40 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <CalendarIcon className="w-5 h-5 text-theme-primary shrink-0" />
            <h1 className="text-sm sm:text-base font-extrabold uppercase tracking-wider font-mono text-theme-primary">
              NIGHT CALENDAR
            </h1>
            <LiveSiteClock tz={tz} timeFormat={timeFormat} />
          </div>
          <button
            onClick={() => setIsAnnualModalOpen(true)}
            className="p-2 rounded-xl border border-amber-400/50 bg-amber-950/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.3)] hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center group"
            title="24-Month Dark Windows Planner"
          >
            <Sparkles className="w-5 h-5 text-amber-300 group-hover:rotate-12 transition-transform" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCalendarModalOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-white/20 bg-black/60 hover:border-cyan-400 hover:bg-white/5 text-white transition-all cursor-pointer group shadow-sm active:scale-95"
            title="Open Touch Calendar"
          >
            <CalendarIcon className="w-4 h-4 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="text-xs sm:text-sm font-mono font-bold text-white whitespace-nowrap">
              {formattedSelectedDate}
            </span>
          </button>
          <button
            onClick={handleResetToToday}
            className="px-4 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs sm:text-sm transition-all shadow-sm shrink-0 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            Today
          </button>
        </div>
      </div>

      {/* 2. 1 AYLIK YATAY GÜN KAYDIRMA */}
      <div className="w-full">
        <div
          ref={horizontalScrollRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className={`flex items-center gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory touch-pan-x select-none pb-1.5 pt-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {ephemerisDays.map((day) => {
            const isSelected = day.dateKey === selectedDateKey;
            const isInActiveWindow = activeWindowDateKeys.has(day.dateKey);

            let containerStyle =
              'bg-black/40 text-slate-200 border border-white/10 hover:bg-white/10 hover:border-white/20';
            if (isSelected) {
              containerStyle =
                'bg-cyan-400 text-black font-bold border-cyan-300 shadow-md scale-102 ring-2 ring-cyan-300/60 z-10';
            } else if (isInActiveWindow) {
              if (selectedWindowGroup === 'best') {
                containerStyle =
                  'border-2 border-cyan-400 bg-cyan-950/20 shadow-[0_0_8px_rgba(6,182,212,0.3)] text-cyan-200 hover:bg-cyan-900/30';
              } else {
                containerStyle =
                  'border-2 border-amber-400/80 bg-amber-950/20 shadow-[0_0_8px_rgba(251,191,36,0.3)] text-amber-200 hover:bg-amber-900/30';
              }
            }

            return (
              <button
                key={day.dateKey}
                data-datekey={day.dateKey}
                onClick={() => handleDayItemClick(day.dateKey)}
                className={`snap-start flex flex-col items-center justify-center min-w-[78px] sm:min-w-[86px] px-2 py-2 rounded-xl transition-all shrink-0 cursor-pointer ${containerStyle}`}
              >
                <span
                  className={`text-[11px] font-mono leading-tight whitespace-nowrap ${
                    isSelected
                      ? 'text-black font-bold'
                      : isInActiveWindow
                      ? 'font-bold'
                      : 'text-slate-200'
                  }`}
                >
                  {day.dayLabel}
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <PreciseMoonIcon phase={day.moonPhase} size={15} latitude={location.latitude} />
                  <span
                    className={`text-[9px] font-mono ${
                      isSelected
                        ? 'text-black font-bold'
                        : isInActiveWindow
                        ? selectedWindowGroup === 'best'
                          ? 'text-cyan-300 font-bold'
                          : 'text-amber-300 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    %{day.moonIllumination}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. TEK BAKIŞTA KARAR PANELİ */}
      <div className="p-3 sm:p-4 rounded-2xl border border-theme bg-[var(--theme-card)] shadow-lg space-y-2">
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
          <div className="text-xs uppercase font-mono font-bold tracking-wider text-theme-primary flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-theme-primary shrink-0" />
            <span className="font-bold tracking-wider font-mono">
              IMAGING WINDOWS | {clusters.monthName.toUpperCase()} {currentViewingMonth.year}
            </span>
          </div>
          <span className="text-[10px] font-mono text-cyan-300 font-semibold hidden sm:inline">
            Dark Sky Efficiency = (Moonless Darkness / Astro Darkness) * 100
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 w-full select-none">
          <button
            type="button"
            disabled={!clusters.early.available}
            onClick={() => clusters.early.available && handleSelectCluster('early')}
            className={`text-center flex flex-col items-center justify-center p-2 rounded-xl border transition-all relative overflow-hidden group ${
              !clusters.early.available
                ? 'opacity-40 cursor-not-allowed border-white/5 bg-black/20 select-none'
                : selectedWindowGroup === 'early'
                ? 'ring-2 ring-cyan-400 bg-cyan-950/40 border-cyan-400 shadow-md cursor-pointer'
                : 'border-white/10 bg-black/40 hover:bg-white/5 hover:border-white/20 cursor-pointer'
            }`}
          >
            <span className="text-[11px] font-mono font-bold text-slate-300">
              Early
            </span>
            <div className="text-xs font-bold font-mono text-white mt-1 leading-tight truncate">
              {clusters.early.available ? clusters.early.text : '-'}
            </div>
            <div className={`text-[10px] font-mono mt-1 ${clusters.early.available ? 'text-amber-300' : 'text-slate-500 font-bold'}`}>
              {clusters.early.available ? '%70-%89' : '—'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelectCluster('best')}
            className={`text-center flex flex-col items-center justify-center p-2 rounded-xl border transition-all relative overflow-hidden group cursor-pointer ${
              selectedWindowGroup === 'best'
                ? 'ring-2 ring-cyan-400 bg-cyan-950/50 border-cyan-400 shadow-lg shadow-cyan-950/60'
                : 'border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-950/30'
            }`}
          >
            <span className="text-[11px] font-mono font-bold text-cyan-300">
              Optimal
            </span>
            <div className="text-xs font-bold font-mono text-white mt-1 leading-tight truncate">
              {clusters.best.text}
            </div>
            <div className="text-[10px] font-mono text-cyan-400 mt-1 font-bold">
              %90-%100
            </div>
          </button>

          <button
            type="button"
            disabled={!clusters.late.available}
            onClick={() => clusters.late.available && handleSelectCluster('late')}
            className={`text-center flex flex-col items-center justify-center p-2 rounded-xl border transition-all relative overflow-hidden group ${
              !clusters.late.available
                ? 'opacity-40 cursor-not-allowed border-white/5 bg-black/20 select-none'
                : selectedWindowGroup === 'late'
                ? 'ring-2 ring-cyan-400 bg-cyan-950/40 border-cyan-400 shadow-md cursor-pointer'
                : 'border-white/10 bg-black/40 hover:bg-white/5 hover:border-white/20 cursor-pointer'
            }`}
          >
            <span className="text-[11px] font-mono font-bold text-slate-300">
              Late
            </span>
            <div className="text-xs font-bold font-mono text-white mt-1 leading-tight truncate">
              {clusters.late.available ? clusters.late.text : '-'}
            </div>
            <div className={`text-[10px] font-mono mt-1 ${clusters.late.available ? 'text-amber-300' : 'text-slate-500 font-bold'}`}>
              {clusters.late.available ? '%70-%89' : '—'}
            </div>
          </button>
        </div>
      </div>

      {/* 4. SAHA SEÇİMİ */}
      <div className="p-4 rounded-2xl border border-theme bg-[var(--theme-card)] shadow-md space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-theme-primary shrink-0" />
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider font-mono text-theme-primary flex items-center gap-2">
              TARGET SITES
            </span>
          </div>
          <button
            onClick={() => setIsManageModalOpen(true)}
            className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-xs font-mono text-theme-primary cursor-pointer flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="Reorder, add, and manage sites"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Manage</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {selectedSites.map((site) => {
            if (getSiteTimeZone(site) === null) {
              const siteInfo = formatSiteLocationParts(site);
              return (
                <div
                  key={site.id}
                  className="p-3.5 rounded-xl bg-black/40 border border-amber-500/30 space-y-2.5 relative flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg text-white font-mono font-bold text-xs inline-block shadow-inner truncate max-w-full">
                        {siteInfo.place}
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 shrink-0">
                      Time Zone Required
                    </span>
                  </div>

                  <div className="py-2.5 text-center space-y-2">
                    <p className="text-xs text-theme-muted">
                      This site has no time zone. Ephemeris and forecasts need one.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        saveStoredLocation(site);
                        try {
                          window.dispatchEvent(new Event('storage'));
                          window.dispatchEvent(new CustomEvent('chroma_location_changed', { detail: site }));
                        } catch {}
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition-colors inline-flex items-center gap-1.5"
                    >
                      Set time zone
                    </button>
                  </div>
                </div>
              );
            }

            const siteEntry = sitesWeatherMap[site.id];
            const sitePoints = siteEntry?.points;
            const siteSourceType = siteEntry?.sourceType;
            const siteTz = site.timeZone || tz;
            const tonightWeather = summarizeSiteNightWeather({
              site,
              points: sitePoints,
              targetDateKey: selectedDay.dateKey,
              siteTz,
              units: unitSystem,
              sourceType: siteSourceType,
              nowMs: Date.now(),
            });
            const tomorrowKey = addDaysToDateKey(selectedDay.dateKey, 1);
            const tomorrowWeather = summarizeSiteNightWeather({
              site,
              points: sitePoints,
              targetDateKey: tomorrowKey,
              siteTz,
              units: unitSystem,
              sourceType: siteSourceType,
              nowMs: Date.now(),
            });
            const isPreviewing = previewNextNightSiteIds.has(site.id);
            const activeWeather = isPreviewing ? tomorrowWeather : tonightWeather;
            const siteInfo = formatSiteLocationParts(site);

            let comparisonSvgClass = 'text-slate-500 stroke-slate-500';
            if (
              tonightWeather.hasData &&
              tomorrowWeather.hasData &&
              tonightWeather.avgNightCloud !== null &&
              tomorrowWeather.avgNightCloud !== null
            ) {
              const delta = tomorrowWeather.avgNightCloud - tonightWeather.avgNightCloud;
              if (delta <= -8) {
                comparisonSvgClass = 'text-emerald-950/70 stroke-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]';
              } else if (delta >= 8) {
                comparisonSvgClass = 'text-rose-950/70 stroke-rose-400';
              } else {
                comparisonSvgClass = 'text-amber-950/70 stroke-amber-400';
              }
            }

            return (
              <div
                key={site.id}
                className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2.5 relative group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg text-white font-mono font-bold text-xs inline-block shadow-inner truncate max-w-full">
                      {siteInfo.place}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeWeather.hasData && activeWeather.isPartial && (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[9px] font-bold"
                        title={`Partial night coverage (${activeWeather.validHours}/${activeWeather.expectedHours} hrs)`}
                      >
                        {activeWeather.validHours}/{activeWeather.expectedHours} h
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveBriefingModal({
                          place: siteInfo.place,
                          districtCity: siteInfo.districtCity,
                          dateLabel: formattedSelectedDate,
                          windowLabel: activeWeather.windowLabel,
                          isTomorrow: isPreviewing,
                          nightScore: activeWeather.nightScore,
                        });
                      }}
                      className={`px-1.5 py-0.5 rounded-md font-mono text-[9px] font-bold border transition-colors cursor-pointer active:scale-95 flex items-center gap-1 shrink-0 ${
                        activeWeather.nightScore.score !== null
                          ? activeWeather.nightScore.score >= 85
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                            : activeWeather.nightScore.score >= 70
                            ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                            : activeWeather.nightScore.score >= 50
                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                            : 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                          : 'bg-white/10 border-white/20 text-slate-300'
                      }`}
                      title="Click for Tactical Night Briefing"
                    >
                      {activeWeather.nightScore.score !== null ? (
                        <>
                          <span>
                            {activeWeather.nightScore.vetoReason !== null ? '⚠️' : '★'} {activeWeather.nightScore.score}
                          </span>
                          <span className="opacity-80 font-semibold">{activeWeather.nightScore.grade}</span>
                        </>
                      ) : (
                        <span>{activeWeather.nightScore.label}</span>
                      )}
                    </button>
                    {isPreviewing ? (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-[9px] font-bold"
                        title="Tomorrow Night Window Telemetry"
                      >
                        {activeWeather.windowLabel}
                      </span>
                    ) : (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-400 font-mono text-[9px]"
                        title={`${activeWeather.windowLabel} Night Window Telemetry`}
                      >
                        {activeWeather.windowLabel}
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleNextNightPreview(site.id);
                      }}
                      className="w-12 h-12 shrink-0 relative flex items-center justify-center cursor-pointer active:scale-95 select-none transition-transform"
                      title={
                        isPreviewing
                          ? "Click to return to selected date"
                          : "Preview tomorrow night's weather for this site only"
                      }
                    >
                      <svg
                        viewBox="0 0 48 48"
                        className={`absolute inset-0 w-full h-full ${
                          isPreviewing
                            ? "text-cyan-950/70 stroke-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                            : comparisonSvgClass
                        }`}
                      >
                        <path
                          d="M 12 8 C 12 5, 16 3, 19 5 L 41 21 C 44 23, 44 25, 41 27 L 19 43 C 16 45, 12 43, 12 40 Z"
                          fill="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                      {isPreviewing ? (
                        <RotateCcw className="w-5 h-5 text-cyan-300 stroke-[2.5] relative z-10 animate-pulse" />
                      ) : (
                        <Moon className="w-4 h-4 text-sky-100 fill-sky-200/50 drop-shadow-[0_0_6px_#38bdf8] relative z-10" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-[43%_57%] gap-2 text-[11px] font-mono select-none pt-0.5">
                  <div
                    onClick={() => handleNavigateToWeather(site, 'section-temperature')}
                    className="cursor-pointer hover:bg-white/10 active:scale-95 transition-all p-2 rounded-xl border border-white/5 bg-black/40 flex items-center gap-1.5 shadow-sm"
                    title="Switch to Site Weather and view Temperature"
                  >
                    <Thermometer className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="leading-tight whitespace-nowrap">
                      {activeWeather.hasData ? (
                        <>
                          <span className="text-amber-300 font-bold">
                            {activeWeather.dayMaxStr}{activeWeather.dayMaxStr !== '--' ? activeWeather.tempUnit : ''}
                          </span>{" "}
                          <span className="text-slate-500">/</span>{" "}
                          <span className="text-cyan-300 font-bold">
                            {activeWeather.nightMinStr}{activeWeather.nightMinStr !== '--' ? activeWeather.tempUnit : ''}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400 font-bold">--</span>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => handleNavigateToWeather(site, 'section-humidity')}
                    className="cursor-pointer hover:bg-white/10 active:scale-95 transition-all p-2 rounded-xl border border-white/5 bg-black/40 flex items-center gap-1.5 shadow-sm"
                    title="Switch to Site Weather and view Humidity & Dew"
                  >
                    <Droplets className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="text-sky-300 font-bold whitespace-nowrap text-[10.5px] font-mono leading-tight">
                      {activeWeather.hasData ? activeWeather.humidityStr : "--"}
                    </span>
                  </div>

                  <div
                    onClick={() => handleNavigateToWeather(site, 'section-humidity')}
                    className="cursor-pointer hover:bg-white/10 active:scale-95 transition-all p-2 rounded-xl border border-white/5 bg-black/40 flex items-center gap-1.5 shadow-sm"
                    title="Switch to Site Weather and view details"
                  >
                    <CloudRain className="w-4 h-4 text-sky-300 shrink-0" />
                    <span className="text-sky-200 font-bold whitespace-nowrap leading-tight">
                      {activeWeather.hasData ? activeWeather.precipStr : "--"}
                    </span>
                  </div>

                  <div
                    onClick={() => handleNavigateToWeather(site, 'section-wind')}
                    className="cursor-pointer hover:bg-white/10 active:scale-95 transition-all p-2 rounded-xl border border-white/5 bg-black/40 flex items-center gap-1 shadow-sm overflow-hidden"
                    title="Switch to Site Weather and view details"
                  >
                    <Wind className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div className="text-[10.5px] font-mono whitespace-nowrap overflow-hidden flex items-center gap-1">
                      {activeWeather.hasData ? (
                        <>
                          <span className="text-cyan-300 font-bold">{activeWeather.windMinSpeed}</span>
                          <span className="text-slate-400">-</span>
                          <span className="text-rose-400 font-bold">{activeWeather.windMaxGust}</span>
                          <span className="text-slate-300">{activeWeather.windUnit}</span>
                          {activeWeather.windDir && (
                            <>
                              <span className="text-slate-500 mx-0.5">|</span>
                              <span className="text-amber-400 font-bold">{activeWeather.windDir}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400 font-bold">--</span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => handleNavigateToWeather(site, 'section-cloud')}
                  className="cursor-pointer hover:bg-white/10 active:scale-95 transition-all select-none shadow-sm"
                  title="Switch to Site Weather and view details"
                >
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-black/50 border border-white/5 font-mono text-[10.5px]">
                    <span>Low: <b className="text-white">{activeWeather.cloudLowStr === '--' ? '--' : `%${activeWeather.cloudLowStr}`}</b></span>
                    <span className="text-slate-600">|</span>
                    <span>Mid: <b className="text-white">{activeWeather.cloudMidStr === '--' ? '--' : `%${activeWeather.cloudMidStr}`}</b></span>
                    <span className="text-slate-600">|</span>
                    <span>
                      High:{" "}
                      <b
                        className={
                          activeWeather.cloudHighStr !== '--' && Number(activeWeather.cloudHighStr) > 30 ? "text-amber-300 font-bold" : "text-white"
                        }
                      >
                        {activeWeather.cloudHighStr === '--' ? '--' : `%${activeWeather.cloudHighStr}`}
                      </b>
                    </span>
                  </div>
                  <div className="h-6 flex items-center justify-center mt-1 px-1 overflow-hidden select-none">
                    <p className="text-[10px] font-mono text-theme-muted whitespace-nowrap truncate text-center">
                      {activeWeather.cloudSummary}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4.5. 72h Sun & Moon Altitude Curve */}
      {(() => {
        const idx = ephemerisDays.findIndex((d) => d.dateKey === selectedDay.dateKey);
        const consecutive3Days =
          idx === -1
            ? [selectedDay]
            : idx + 3 <= ephemerisDays.length
            ? ephemerisDays.slice(idx, idx + 3)
            : ephemerisDays.slice(Math.max(0, ephemerisDays.length - 3));

        return (
          <AltitudeCurve
            days={consecutive3Days}
            latitude={location.latitude}
            longitude={location.longitude}
            timeZone={location.timeZone}
            horizonProfile={location.horizonProfile}
          />
        );
      })()}

      {/* 5. EFEMERİS VERİLERİ (EPHEMERIS DATA) */}
      <div className="p-3 sm:p-4 rounded-2xl border border-theme bg-[var(--theme-card)] shadow-md space-y-3">
        {/* A. BAŞLIK SATIRI */}
        <div className="border-b border-white/10 pb-2 flex items-center">
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-theme-primary flex items-center gap-2">
            <Orbit className="w-4 h-4 text-theme-primary shrink-0" />
            <span>EPHEMERIS DATA</span>
          </span>
          <button
            onClick={() => setIsHorizonModalOpen(true)}
            className="ml-auto px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-900/40 text-[10px] font-mono text-cyan-300 flex items-center gap-1 cursor-pointer"
            title="Define surrounding mountain and hill obstacles"
          >
            <Mountain className="w-3 h-3 text-cyan-400" />
            <span>{location.horizonProfile?.some((v) => v > 0) ? 'Horizon: Active' : 'Horizon Mask'}</span>
          </button>
        </div>

        {/* B. TARİH GEZİNME KONTROL ÇUBUĞU */}
        {(() => {
          const eff = selectedDay.efficiencyPercent;
          const badgeColor =
            eff >= 85
              ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40'
              : eff >= 65
              ? 'text-sky-300 bg-sky-950/60 border-sky-500/40'
              : eff >= 40
              ? 'text-amber-300 bg-amber-950/60 border-amber-500/40'
              : 'text-rose-400 bg-rose-950/60 border-rose-500/40';

          return (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/60 border border-white/10 w-full select-none mt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePrevDay();
                }}
                aria-label="Previous Day"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 cursor-pointer active:scale-95 transition-all text-cyan-300"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                  <path d="M 16 5 L 7 12 L 16 19 Z" />
                </svg>
              </button>

              <div className="flex-1 flex flex-col items-center justify-center text-center px-2 min-w-0 gap-1">
                <div className="text-xs sm:text-sm font-bold font-mono text-white truncate">
                  {fullDateString}
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-bold ${badgeColor}`}
                >
                  <span className="w-2 h-2 rounded-full animate-pulse bg-current" />
                  Night Efficiency: %{eff}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleNextDay();
                }}
                aria-label="Next Day"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 cursor-pointer active:scale-95 transition-all text-cyan-300"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                  <path d="M 8 5 L 17 12 L 8 19 Z" />
                </svg>
              </button>
            </div>
          );
        })()}

        {/* C. VİZÖR BUTONU (GENİŞ) */}
        <button
          onClick={() => onNavigateToSky(selectedDay.date)}
          className="w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-extrabold text-xs shadow-md mt-2.5 cursor-pointer active:scale-[0.99] flex items-center justify-center gap-2 transition-all"
        >
          <Eye className="w-4 h-4 shrink-0" />
          <span>Open Sky Viewfinder</span>
        </button>

        {/* D. EFEMERİS SÜTUNLARI: GÜNEŞ VE AY BİREBİR EŞİTLENMİŞ PUNTO & BOŞLUKLAR */}
        <div className="grid grid-cols-2 gap-2.5 mt-3 select-none">
          {/* SOL SÜTUN: GÜNEŞ */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-[var(--theme-card)]/80 overflow-hidden shadow-md">
            {/* Ortalanmış İkon Header Bölmesi (h-20) */}
            <div className="h-20 w-full shrink-0 flex items-center justify-center border-b border-white/10 bg-black/40">
              <AtmosphericSunIcon size={44} />
            </div>

            {/* Çizginin Altındaki Sol Sütun Gövdesi */}
            <div className="p-3 flex flex-col justify-between select-none font-mono text-center flex-1">
              {/* Akşam Geçişleri (1. Grup): 3 veri bloku arasına space-y-2 */}
              <div className="space-y-2">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight block">Sunset</span>
                  <span className="text-sm font-mono font-bold text-slate-100 mt-0.5 block">
                    {formatTimeHM(selectedDay.sunset, location.timeZone)}
                  </span>
                  {selectedDay.sunsetAzimuthDeg !== undefined && selectedDay.sunsetCardinal && (
                    <span className="text-[10px] font-mono text-amber-300/90 font-semibold block mt-0.5">
                      {selectedDay.sunsetAzimuthDeg}° {selectedDay.sunsetCardinal} {selectedDay.hasActiveTerrainMask ? '🏔️' : ''}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight block">Nautical Dusk</span>
                  <span className="text-sm font-mono font-bold text-slate-100 mt-0.5 block">
                    {formatTimeHM(selectedDay.nauticalDusk, location.timeZone)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight block">Astro Night Start</span>
                  <span className="text-sm font-mono font-bold text-slate-100 mt-0.5 block">
                    {formatTimeHM(selectedDay.astroDusk, location.timeZone)}
                  </span>
                </div>
              </div>

              {/* Orta Ayırıcı: my-3.5 border-t border-white/10 */}
              <div className="my-3.5 border-t border-white/10" />

              {/* Sabah Geçişleri (2. Grup): 3 veri bloku arasına space-y-2 */}
              <div className="space-y-2">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight block">Astro Night End</span>
                  <span className="text-sm font-mono font-bold text-slate-100 mt-0.5 block">
                    {formatTimeHM(selectedDay.astroDawn, location.timeZone)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight block">Nautical Dawn</span>
                  <span className="text-sm font-mono font-bold text-slate-100 mt-0.5 block">
                    {formatTimeHM(selectedDay.nauticalDawn, location.timeZone)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight block">Sunrise</span>
                  <span className="text-sm font-mono font-bold text-slate-100 mt-0.5 block">
                    {formatTimeHM(selectedDay.sunrise, location.timeZone)}
                  </span>
                  {selectedDay.sunriseAzimuthDeg !== undefined && selectedDay.sunriseCardinal && (
                    <span className="text-[10px] font-mono text-amber-300/90 font-semibold block mt-0.5">
                      {selectedDay.sunriseAzimuthDeg}° {selectedDay.sunriseCardinal} {selectedDay.hasActiveTerrainMask ? '🏔️' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SAĞ SÜTUN: AY */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-[var(--theme-card)]/80 overflow-hidden shadow-md">
            {/* Ortalanmış Ay İkon Header Bölmesi (h-20) */}
            <div className="h-20 w-full shrink-0 flex items-center justify-center border-b border-white/10 bg-black/40">
              <PreciseMoonIcon
                phase={selectedDay.moonPhase}
                latitude={location.latitude}
                size={44}
                className="drop-shadow-[0_0_12px_rgba(226,232,240,0.6)]"
              />
            </div>

            {/* Çizginin Altındaki Sağ Sütun Gövdesi: h-full flex flex-col justify-around py-3 text-center select-none */}
            <div className="p-3 flex-1 flex flex-col">
              <div className="h-full flex flex-col justify-around py-3 text-center select-none font-mono">
                <div>
                  <div className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight">Moonrise</div>
                  <div className="text-sm font-mono font-bold text-slate-100 mt-0.5">
                    {formatTimeHM(selectedDay.moonrise, location.timeZone)}
                  </div>
                  {selectedDay.moonriseAzimuthDeg !== undefined && selectedDay.moonriseCardinal && (
                    <span className="text-[10px] font-mono text-cyan-300/90 font-semibold block mt-0.5">
                      {selectedDay.moonriseAzimuthDeg}° {selectedDay.moonriseCardinal} {selectedDay.hasActiveTerrainMask ? '🏔️' : ''}
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight">Moon Phase</div>
                  <div className="text-xs font-mono font-bold text-cyan-300 mt-0.5 whitespace-nowrap">
                    {selectedDay.moonPhaseName}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono text-slate-400 tracking-tight leading-tight">Moonset</div>
                  <div className="text-sm font-mono font-bold text-slate-100 mt-0.5">
                    {formatTimeHM(selectedDay.moonset, location.timeZone)}
                  </div>
                  {selectedDay.moonsetAzimuthDeg !== undefined && selectedDay.moonsetCardinal && (
                    <span className="text-[10px] font-mono text-cyan-300/90 font-semibold block mt-0.5">
                      {selectedDay.moonsetAzimuthDeg}° {selectedDay.moonsetCardinal} {selectedDay.hasActiveTerrainMask ? '🏔️' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dokunmatik Takvim Modalı */}
      <MiniCalendarModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        selectedDate={selectedDay.date}
        onSelectDate={handleCalendarModalSelect}
        latitude={location.latitude}
        longitude={location.longitude}
        elevation={location.elevation}
        timeZone={location.timeZone}
        siteTodayKey={siteTodayKey}
        activeWindowDateKeys={activeWindowDateKeys}
        windowGroup={selectedWindowGroup}
      />

      {/* 24 Aylık Zifiri Pencereler Modalı */}
      <AnnualDarkSkyModal
        isOpen={isAnnualModalOpen}
        onClose={() => setIsAnnualModalOpen(false)}
        location={location}
        onSelectWindow={handleSelectAnnualWindow}
      />

      {/* 8 Yönlü Arazi Ufuk Maskesi Modalı */}
      <HorizonMaskModal
        isOpen={isHorizonModalOpen}
        onClose={() => setIsHorizonModalOpen(false)}
        location={location}
        onUpdateHorizon={(newProfile) => {
          location.horizonProfile = newProfile;
        }}
      />

      {/* SAHA SIRALAMA, EKLEME & YÖNETİM MODALI */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg rounded-2xl border border-theme bg-[var(--theme-card)] shadow-2xl p-4 sm:p-5 relative animate-in zoom-in-95 duration-150 text-[var(--theme-text)] flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-theme-primary/20 border border-theme flex items-center justify-center text-theme-primary">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold font-mono uppercase tracking-wider text-white">
                    Target Site Management
                  </h3>
                  <p className="text-[10px] text-theme-muted font-mono">
                    Order, remove, or add new target sites
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsManageModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-theme-muted hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto pr-1 space-y-4 mt-3 flex-1">
              <div>
                <div className="text-[11px] font-mono text-cyan-300 font-bold mb-2 flex items-center justify-between">
                  <span>SELECTED SITES ({selectedSites.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal">Use ▲▼ to change order</span>
                </div>
                <div className="space-y-1.5">
                  {selectedSites.map((site, index) => {
                    const info = formatSiteLocationParts(site);
                    const isFirst = index === 0;
                    const isLast = index === selectedSites.length - 1;
                    const isOnlyOne = selectedSites.length <= 1;

                    return (
                      <div
                        key={site.id}
                        className="p-2.5 rounded-xl border border-white/10 bg-black/40 flex items-center justify-between gap-2 transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-white/10 text-slate-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>
                            <span className="text-xs font-mono font-bold text-white truncate">
                              {info.place}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 truncate">
                              • {info.districtCity}
                            </span>
                          </div>
                          <div className="text-[10px] text-theme-muted font-mono mt-0.5 ml-7 flex items-center gap-2">
                            <span>▲ {site.elevation}m</span>
                            <span>•</span>
                            <span className="text-theme-accent">★ B{site.bortleClass ?? 3}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleMoveSiteUp(index)}
                            disabled={isFirst}
                            className={`p-1.5 rounded-lg border text-xs transition-all ${
                              isFirst
                                ? 'border-white/5 text-slate-600 cursor-not-allowed opacity-30'
                                : 'border-white/10 bg-white/5 hover:bg-white/15 text-slate-200 cursor-pointer active:scale-90'
                            }`}
                            title="Move Up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveSiteDown(index)}
                            disabled={isLast}
                            className={`p-1.5 rounded-lg border text-xs transition-all ${
                              isLast
                                ? 'border-white/5 text-slate-600 cursor-not-allowed opacity-30'
                                : 'border-white/10 bg-white/5 hover:bg-white/15 text-slate-200 cursor-pointer active:scale-90'
                            }`}
                            title="Move Down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveSite(site.id)}
                            disabled={isOnlyOne}
                            className={`p-1.5 rounded-lg border text-xs ml-1 transition-all ${
                              isOnlyOne
                                ? 'border-white/5 text-slate-600 cursor-not-allowed opacity-30'
                                : 'border-rose-500/20 bg-rose-950/20 hover:bg-rose-900/40 text-rose-300 cursor-pointer active:scale-90'
                            }`}
                            title={isOnlyOne ? 'At least 1 site required' : 'Remove site'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-white/10">
                <div className="text-[11px] font-mono text-cyan-300 font-bold mb-2 flex items-center justify-between">
                  <span>+ ADD SITE TO LIST</span>
                  <span className="text-[10px] text-slate-400 font-normal">Include with one click</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {allAvailableLocations.map((site) => {
                    const isAlreadySelected = selectedSites.some((s) => s.id === site.id);
                    const info = formatSiteLocationParts(site);

                    return (
                      <button
                        key={site.id}
                        disabled={isAlreadySelected}
                        onClick={() => handleAddSite(site)}
                        className={`w-full p-2 rounded-xl border text-left flex items-center justify-between transition-all ${
                          isAlreadySelected
                            ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                            : 'border-white/10 bg-black/40 hover:bg-cyan-950/40 hover:border-cyan-400/50 cursor-pointer active:scale-98'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-bold text-white truncate">
                              {info.place}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 truncate">
                              • {info.districtCity}
                            </span>
                            {isAlreadySelected && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-slate-400 flex items-center gap-1 shrink-0 ml-1">
                                <Check className="w-2.5 h-2.5 text-cyan-400" /> In List
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-theme-muted font-mono mt-0.5 flex items-center gap-2">
                            <span>▲ {site.elevation}m</span>
                            <span>•</span>
                            <span className="text-theme-accent">★ B{site.bortleClass ?? 3}</span>
                          </div>
                        </div>
                        {!isAlreadySelected && (
                          <div className="ml-2 px-2 py-1 rounded-lg bg-cyan-400/15 border border-cyan-400/30 text-cyan-300 text-[10px] font-mono font-bold flex items-center gap-1 shrink-0">
                            <Plus className="w-3 h-3" /> Add
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-theme-muted shrink-0">
              <button
                onClick={() => {
                  const favs = getStoredFavorites();
                  const def = favs.length >= 2 ? [favs[0], favs[1]] : [PRESET_LOCATIONS[0], PRESET_LOCATIONS[1]];
                  setSelectedSites(def);
                }}
                className="text-slate-400 hover:text-white underline cursor-pointer"
              >
                Reset to Default Sites
              </button>
              <button
                onClick={() => setIsManageModalOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-300 font-bold cursor-pointer transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Taktiksel Gece Brifingi Modalı (Tactical Night Briefing Modal) */}
      {activeBriefingModal !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setActiveBriefingModal(null)}
        >
          <div
            className="bg-[#0b101b] border border-white/20 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3 bg-black/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-white">
                    {activeBriefingModal.place}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    • {activeBriefingModal.districtCity}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-cyan-300 mt-1 flex items-center gap-2">
                  <span>{activeBriefingModal.dateLabel}</span>
                  <span className="text-slate-500">|</span>
                  <span className="font-bold">{activeBriefingModal.windowLabel}</span>
                  {activeBriefingModal.isTomorrow && (
                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">
                      Tomorrow Night
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveBriefingModal(null)}
                className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 font-mono text-xs">
              {/* Üst Özet Kutusu */}
              <div className="p-3.5 rounded-xl border border-white/10 bg-black/40 space-y-2">
                {activeBriefingModal.nightScore.score !== null ? (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                        Astro Imaging Score
                      </span>
                      <span className="text-2xl font-black text-white">
                        SCORE: {activeBriefingModal.nightScore.score}/100
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 text-cyan-300 inline-block">
                        Grade {activeBriefingModal.nightScore.grade}
                      </span>
                      <span className="text-[11px] text-slate-300 block mt-1">
                        {activeBriefingModal.nightScore.label}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                        Night Assessment
                      </span>
                      <span className="text-xl font-bold text-slate-200">
                        {activeBriefingModal.nightScore.label}
                      </span>
                    </div>
                    <span className="text-sm font-bold px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-slate-300">
                      Grade {activeBriefingModal.nightScore.grade}
                    </span>
                  </div>
                )}

                {activeBriefingModal.nightScore.vetoReason !== null && (
                  <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold flex items-center gap-2">
                    <span className="text-sm">⚠️</span>
                    <span>VETO: {activeBriefingModal.nightScore.vetoReason}</span>
                  </div>
                )}
              </div>

              {/* Puan Kırılım Çubukları (breakdown !== null) */}
              {activeBriefingModal.nightScore.breakdown !== null && (
                <div className="p-3.5 rounded-xl border border-white/10 bg-black/40 space-y-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Multi-Factor Score Breakdown
                  </span>

                  {/* Cloud Layer Quality */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Cloud Layer Quality</span>
                      <span className="text-cyan-300 font-bold">
                        {activeBriefingModal.nightScore.breakdown.cloudScore} / 40
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-cyan-400 transition-all"
                        style={{ width: `${Math.round((activeBriefingModal.nightScore.breakdown.cloudScore / 40) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Moonless Darkness */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Moonless Darkness</span>
                      <span className="text-cyan-300 font-bold">
                        {activeBriefingModal.nightScore.breakdown.darknessScore} / 25
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-indigo-400 transition-all"
                        style={{ width: `${Math.round((activeBriefingModal.nightScore.breakdown.darknessScore / 25) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Wind & Mount Stability */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Wind & Mount Stability</span>
                      <span className="text-cyan-300 font-bold">
                        {activeBriefingModal.nightScore.breakdown.windScore} / 15
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-emerald-400 transition-all"
                        style={{ width: `${Math.round((activeBriefingModal.nightScore.breakdown.windScore / 15) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Dew & Frost Safety */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Dew & Frost Safety</span>
                      <span className="text-cyan-300 font-bold">
                        {activeBriefingModal.nightScore.breakdown.dewScore} / 10
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-sky-400 transition-all"
                        style={{ width: `${Math.round((activeBriefingModal.nightScore.breakdown.dewScore / 10) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Site Bortle & Thermal */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">Site Bortle & Thermal</span>
                      <span className="text-cyan-300 font-bold">
                        {activeBriefingModal.nightScore.breakdown.siteComfortScore} / 10
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-amber-400 transition-all"
                        style={{ width: `${Math.round((activeBriefingModal.nightScore.breakdown.siteComfortScore / 10) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tactical Field Notes */}
              <div className="p-3.5 rounded-xl border border-white/10 bg-black/40 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Tactical Field Briefing
                </span>
                {activeBriefingModal.nightScore.tacticalNotes.length > 0 ? (
                  <ul className="space-y-1.5 text-slate-200">
                    {activeBriefingModal.nightScore.tacticalNotes.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-cyan-400 select-none mt-0.5">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400">No tactical notes recorded for this night session.</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-white/10 bg-black/40 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveBriefingModal(null)}
                className="px-4 py-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-300 font-bold font-mono text-xs cursor-pointer transition-all active:scale-95"
              >
                Close Briefing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
