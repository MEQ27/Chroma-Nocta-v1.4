import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Thermometer,
  CloudSun,
  Sun,
  Cloud,
  CloudRain,
  CloudOff,
  RefreshCw,
  Star,
  Home,
  Activity,
  Droplets,
  MapPin,
  Wind,
  Layers,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { HourlyWeatherPoint, LocationData, ResolvedSite, UnitSystem } from '../../types';
import { fetch16DayHourlyWeather, WeatherSourceType, isFieldMissing, degToCompass } from '../../lib/weatherService';
import { getStoredFavorites, saveStoredLocation } from '../../lib/coordinateParser';
import { openSiteNavigation } from '../../lib/navigationBridge';
import {
  siteDateKey,
  formatSiteTimeHM,
  siteHour,
  addDaysToDateKey,
  parseDateKey,
  currentNightKey,
  siteParts,
  zonedTimeToInstant,
  partitionSitesByZone,
  resolveSite,
} from '../../lib/siteTime';
import { MONTHS_EN, MONTHS_SHORT_EN, WEEKDAYS_SHORT_EN } from '../../lib/calendarNames';
import { getSmoothSplinePath } from '../../lib/splinePath';
import { summarizeSiteNightWeather } from '../../lib/nightWeather';

interface FieldWeatherTabProps {
  location: ResolvedSite;
  originFavoriteSite?: ResolvedSite | null;
  selectedNightKey?: string;
  onSelectNightKey?: (key: string) => void;
}

// Site timezone sensitive day comparator
function isSameSiteDay(instant: Date, targetDateKey: string, timeZone: string): boolean {
  return siteDateKey(instant, timeZone) === targetDateKey;
}

export const FieldWeatherTab: React.FC<FieldWeatherTabProps> = ({
  location: homeLocation,
  originFavoriteSite,
  selectedNightKey,
  onSelectNightKey,
}) => {
  const [favoriteLocations, setFavoriteLocations] = useState<LocationData[]>(() => getStoredFavorites());
  const [originFavoriteId, setOriginFavoriteId] = useState<string | null>(() => originFavoriteSite?.id || null);
  const [injectedSite, setInjectedSite] = useState<ResolvedSite | null>(() => originFavoriteSite || null);
  const [viewedIndex, setViewedIndex] = useState<number>(0);

  // Local site date state
  const [fieldTabDate, setFieldTabDate] = useState<Date>(() => {
    if (selectedNightKey) {
      try {
        const { year, month, day } = parseDateKey(selectedNightKey);
        const tz = homeLocation.timeZone;
        return zonedTimeToInstant(year, month, day, 12, 0, 0, tz);
      } catch {}
    }
    return new Date();
  });

  const contentScrollRef = useRef<HTMLDivElement>(null);

  // Temperature Chart Drag & Scrubber Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const [lockedIndex, setLockedIndex] = useState<number | null>(null);

  // Humidity Chart Drag & Scrubber Refs
  const humScrollContainerRef = useRef<HTMLDivElement>(null);
  const isHumDraggingRef = useRef(false);
  const humStartXRef = useRef(0);
  const humScrollLeftRef = useRef(0);
  const [lockedHumIndex, setLockedHumIndex] = useState<number | null>(null);

  // Cloud Matrix Strip Drag & Scrubber Refs
  const cloudScrollContainerRef = useRef<HTMLDivElement>(null);
  const isCloudDraggingRef = useRef(false);
  const cloudStartXRef = useRef(0);
  const cloudScrollLeftRef = useRef(0);
  const [lockedCloudIndex, setLockedCloudIndex] = useState<number | null>(null);

  // Wind Chart Drag & Scrubber Refs
  const windScrollContainerRef = useRef<HTMLDivElement>(null);
  const isWindDraggingRef = useRef(false);
  const windStartXRef = useRef(0);
  const windScrollLeftRef = useRef(0);
  const [lockedWindIndex, setLockedWindIndex] = useState<number | null>(null);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Sync favorites from localStorage
  useEffect(() => {
    const handleFavChange = () => {
      setFavoriteLocations(getStoredFavorites());
    };
    window.addEventListener('storage', handleFavChange);
    return () => window.removeEventListener('storage', handleFavChange);
  }, []);

  const partitionedFavorites = useMemo(
    () => partitionSitesByZone(favoriteLocations),
    [favoriteLocations]
  );

  const allLocations: ResolvedSite[] = useMemo(() => {
    const list: ResolvedSite[] = [homeLocation];
    const seenIds = new Set<string>([homeLocation.id]);

    const validInjected = injectedSite ? resolveSite(injectedSite) : null;
    if (validInjected && !seenIds.has(validInjected.id)) {
      list.push(validInjected);
      seenIds.add(validInjected.id);
    }

    partitionedFavorites.resolved.forEach((fav) => {
      if (!seenIds.has(fav.id)) {
        list.push(fav);
        seenIds.add(fav.id);
      }
    });

    return list;
  }, [homeLocation, partitionedFavorites.resolved, injectedSite]);

  useEffect(() => {
    if (originFavoriteSite) {
      setInjectedSite(originFavoriteSite);
      setOriginFavoriteId(originFavoriteSite.id);
      const idx = allLocations.findIndex((l) => l.id === originFavoriteSite.id);
      if (idx !== -1) {
        setViewedIndex(idx);
      }
    }
  }, [originFavoriteSite, allLocations]);

  // Deep linking listener
  useEffect(() => {
    const handleWeatherNav = (event: Event) => {
      const customEvent = event instanceof CustomEvent ? event : null;
      if (!customEvent) return;
      const detail = customEvent.detail;
      let activeSite = homeLocation;
      if (detail && typeof detail === 'object' && 'site' in detail && detail.site) {
        const resolved = resolveSite(detail.site);
        if (resolved) {
          activeSite = resolved;
          setInjectedSite(resolved);
          setOriginFavoriteId(resolved.id);
          const idx = allLocations.findIndex((l) => l.id === resolved.id);
          if (idx !== -1) {
            setViewedIndex(idx);
          }
        }
      }
      if (detail && typeof detail === 'object' && 'dateKey' in detail && typeof detail.dateKey === 'string') {
        try {
          const { year, month, day } = parseDateKey(detail.dateKey);
          const tz = activeSite.timeZone;
          setFieldTabDate(zonedTimeToInstant(year, month, day, 12, 0, 0, tz));
          if (onSelectNightKey) onSelectNightKey(detail.dateKey);
        } catch {}
      } else if (detail && typeof detail === 'object' && 'date' in detail && detail.date) {
        setFieldTabDate(new Date(detail.date));
      }
      if (detail && typeof detail === 'object' && 'targetSection' in detail && typeof detail.targetSection === 'string') {
        const targetId = detail.targetSection;
        setTimeout(() => {
          const el = document.getElementById(targetId);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    };
    window.addEventListener('chroma_navigate_weather_section', handleWeatherNav);
    return () => window.removeEventListener('chroma_navigate_weather_section', handleWeatherNav);
  }, [allLocations, homeLocation, onSelectNightKey]);

  const currentLocation = allLocations[viewedIndex] || homeLocation;

  useEffect(() => {
    if (selectedNightKey) {
      try {
        const { year, month, day } = parseDateKey(selectedNightKey);
        const tz = currentLocation.timeZone;
        const instant = zonedTimeToInstant(year, month, day, 12, 0, 0, tz);
        setFieldTabDate(instant);
      } catch {}
    }
  }, [selectedNightKey, currentLocation.timeZone]);

  const [loading, setLoading] = useState(true);
  const [weatherSource, setWeatherSource] = useState<WeatherSourceType | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [allWeatherPoints, setAllWeatherPoints] = useState<HourlyWeatherPoint[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(() => {
    try {
      const val = localStorage.getItem('chroma_nocta_unit_system');
      if (val === 'imperial') return 'imperial';
    } catch {}
    return 'metric';
  });

  useEffect(() => {
    const handleUnitChange = () => {
      try {
        const val = localStorage.getItem('chroma_nocta_unit_system');
        setUnitSystem(val === 'imperial' ? 'imperial' : 'metric');
      } catch {}
    };
    window.addEventListener('chroma_unit_system_changed', handleUnitChange);
    window.addEventListener('storage', handleUnitChange);
    return () => {
      window.removeEventListener('chroma_unit_system_changed', handleUnitChange);
      window.removeEventListener('storage', handleUnitChange);
    };
  }, []);

  const activeRequestIdRef = useRef<number>(0);

  const loadData = async (targetLoc: ResolvedSite, forceRefresh: boolean = false) => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    setAllWeatherPoints([]);

    try {
      const result = await fetch16DayHourlyWeather(targetLoc, forceRefresh);
      if (requestId === activeRequestIdRef.current) {
        setAllWeatherPoints(result.points);
        setWeatherSource(result.sourceType);
        setFetchedAt(result.fetchedAt);
        setLoading(false);
      }
    } catch {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData(currentLocation);
  }, [currentLocation.id, currentLocation.latitude, currentLocation.longitude]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const ageMs = fetchedAt ? Date.now() - fetchedAt : Infinity;
        if (ageMs > 30 * 60 * 1000) {
          loadData(currentLocation, false);
        }
      }
    };

    const handleOnline = () => {
      loadData(currentLocation, false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [currentLocation, fetchedAt]);

  const handleRefreshWeather = () => {
    loadData(currentLocation, true);
  };

  const handleReturnToOriginFavorite = () => {
    if (!originFavoriteId) return;
    const idx = allLocations.findIndex((l) => l.id === originFavoriteId);
    if (idx !== -1) {
      setViewedIndex(idx);
    }
  };

  const handleReturnToHome = () => {
    setViewedIndex(0);
  };

  const handlePrevDay = () => {
    const tz = currentLocation.timeZone;
    const curKey = siteDateKey(fieldTabDate, tz);
    const prevKey = addDaysToDateKey(curKey, -1);
    const { year, month, day } = parseDateKey(prevKey);
    setFieldTabDate(zonedTimeToInstant(year, month, day, 12, 0, 0, tz));
    if (onSelectNightKey) onSelectNightKey(prevKey);
  };

  const handleNextDay = () => {
    const tz = currentLocation.timeZone;
    const curKey = siteDateKey(fieldTabDate, tz);
    const nextKey = addDaysToDateKey(curKey, 1);
    const { year, month, day } = parseDateKey(nextKey);
    setFieldTabDate(zonedTimeToInstant(year, month, day, 12, 0, 0, tz));
    if (onSelectNightKey) onSelectNightKey(nextKey);
  };

  const handleResetToToday = () => {
    const tz = currentLocation.timeZone;
    const todayNight = currentNightKey(Date.now(), tz);
    const { year, month, day } = parseDateKey(todayNight);
    setFieldTabDate(zonedTimeToInstant(year, month, day, 12, 0, 0, tz));
    if (onSelectNightKey) onSelectNightKey(todayNight);
  };

  // Day offset from today without device clock calls
  const dayOffsetFromToday = useMemo(() => {
    const tz = currentLocation.timeZone;
    const todayKey = siteDateKey(Date.now(), tz);
    const selKey = siteDateKey(fieldTabDate, tz);
    const pToday = parseDateKey(todayKey);
    const pSel = parseDateKey(selKey);
    const t0 = Date.UTC(pToday.year, pToday.month - 1, pToday.day);
    const t1 = Date.UTC(pSel.year, pSel.month - 1, pSel.day);
    const diffDays = Math.round((t1 - t0) / 86400000);
    return Math.max(0, diffDays);
  }, [fieldTabDate, currentLocation.timeZone]);

  // Sub-Header fixed-width date: DD-MMM-YYYY | Day (e.g. 08-Oct-2026 | Thu)
  const subHeaderFormattedDate = useMemo(() => {
    const tz = currentLocation.timeZone;
    const p = siteParts(fieldTabDate, tz);
    const dayStr = String(p.day).padStart(2, '0');
    const monthStr = MONTHS_SHORT_EN[p.month - 1];
    const yearStr = p.year;
    const dUtc = new Date(Date.UTC(p.year, p.month - 1, p.day));
    const weekdayStr = WEEKDAYS_SHORT_EN[dUtc.getUTCDay()];
    return `${dayStr}-${monthStr}-${yearStr} | ${weekdayStr}`;
  }, [fieldTabDate, currentLocation.timeZone]);

  // Clean date string for card headers (e.g. 8 October 2026)
  const cleanDateString = useMemo(() => {
    const tz = currentLocation.timeZone;
    const p = siteParts(fieldTabDate, tz);
    return `${p.day} ${MONTHS_EN[p.month - 1]} ${p.year}`;
  }, [fieldTabDate, currentLocation.timeZone]);

  const tempVal = (tCelsius: number) => {
    if (unitSystem === 'imperial') {
      return Math.round((tCelsius * 9) / 5 + 32);
    }
    return Math.round(tCelsius);
  };

  const speedVal = (kph: number) => {
    if (unitSystem === 'imperial') {
      return Math.round(kph * 0.621371);
    }
    return Math.round(kph);
  };

  const speedUnit = unitSystem === 'imperial' ? 'mph' : 'km/h';
  const tempUnit = unitSystem === 'imperial' ? '°F' : '°C';

  // Memoized Night Weather Summaries (Astronomical Window for curDateKey, d1Key, d2Key)
  const nightSummaries = useMemo(() => {
    const tz = currentLocation.timeZone;
    const curDateKey = siteDateKey(fieldTabDate, tz);
    const d1Key = addDaysToDateKey(curDateKey, 1);
    const d2Key = addDaysToDateKey(curDateKey, 2);
    const epochNow = Date.now();

    const s0 = summarizeSiteNightWeather({
      site: currentLocation,
      points: allWeatherPoints,
      targetDateKey: curDateKey,
      siteTz: tz,
      units: 'metric',
      sourceType: weatherSource ?? undefined,
      nowMs: epochNow,
    });

    const s1 = summarizeSiteNightWeather({
      site: currentLocation,
      points: allWeatherPoints,
      targetDateKey: d1Key,
      siteTz: tz,
      units: 'metric',
      sourceType: weatherSource ?? undefined,
      nowMs: epochNow,
    });

    const s2 = summarizeSiteNightWeather({
      site: currentLocation,
      points: allWeatherPoints,
      targetDateKey: d2Key,
      siteTz: tz,
      units: 'metric',
      sourceType: weatherSource ?? undefined,
      nowMs: epochNow,
    });

    return { s0, s1, s2, curDateKey, d1Key, d2Key };
  }, [currentLocation, allWeatherPoints, fieldTabDate, weatherSource]);

  // ==========================================
  // 1. TEMPERATURE ANALYSIS LOGIC
  // ==========================================
  const todayAnalysis = useMemo(() => {
    const { s0 } = nightSummaries;
    const hasData = s0.hasData && s0.dayMaxTempC !== null && s0.nightMinTempC !== null && s0.avgNightCloud !== null;

    if (!hasData) {
      return {
        hasData: false,
        maxTemp: 0,
        minTemp: 0,
        weatherText: weatherSource === 'fallback' || allWeatherPoints.length === 0 ? 'Offline — No forecast data' : 'No Data',
        WeatherIcon: CloudOff,
      };
    }

    const maxHum = s0.maxHumidity ?? 0;
    const avgCloud = s0.avgNightCloud ?? 0;

    let weatherText = 'Clear & Steady';
    let WeatherIcon = Sun;
    if (maxHum > 85 && avgCloud > 60) {
      weatherText = 'Precipitation Risk';
      WeatherIcon = CloudRain;
    } else if (avgCloud > 65) {
      weatherText = 'Overcast';
      WeatherIcon = Cloud;
    } else if (avgCloud >= 25) {
      weatherText = 'Partly Cloudy';
      WeatherIcon = CloudSun;
    } else {
      weatherText = 'Clear & Steady';
      WeatherIcon = Sun;
    }

    return {
      hasData: true,
      maxTemp: s0.dayMaxTempC ?? 0,
      minTemp: s0.nightMinTempC ?? 0,
      weatherText,
      WeatherIcon,
    };
  }, [nightSummaries, weatherSource, allWeatherPoints.length]);

  const nextDaysForecast = useMemo(() => {
    const { s1, s2, d1Key, d2Key } = nightSummaries;

    const p1 = parseDateKey(d1Key);
    const p2 = parseDateKey(d2Key);
    const d1Utc = new Date(Date.UTC(p1.year, p1.month - 1, p1.day));
    const d2Utc = new Date(Date.UTC(p2.year, p2.month - 1, p2.day));
    const day1Short = WEEKDAYS_SHORT_EN[d1Utc.getUTCDay()];
    const day2Short = WEEKDAYS_SHORT_EN[d2Utc.getUTCDay()];

    const day1HasData = s1.hasData && s1.dayMaxTempC !== null && s1.nightMinTempC !== null;
    const day2HasData = s2.hasData && s2.dayMaxTempC !== null && s2.nightMinTempC !== null;

    return {
      hasData: day1HasData && day2HasData,
      day1HasData,
      day2HasData,
      day1Short,
      day1Max: Math.round(s1.dayMaxTempC ?? 0),
      day1Min: Math.round(s1.nightMinTempC ?? 0),
      day2Short,
      day2Max: Math.round(s2.dayMaxTempC ?? 0),
      day2Min: Math.round(s2.nightMinTempC ?? 0),
    };
  }, [nightSummaries]);

  // ==========================================
  // 2. HUMIDITY ANALYSIS LOGIC
  // ==========================================
  const todayHumidityAnalysis = useMemo(() => {
    const { s0 } = nightSummaries;
    const hasData =
      s0.hasData &&
      s0.minHumidity !== null &&
      s0.maxHumidity !== null &&
      s0.avgDewPointC !== null &&
      s0.minDewGapC !== null;

    if (!hasData) {
      return {
        hasData: false,
        minHum: 0,
        maxHum: 0,
        avgDewPoint: 0,
        minDewGap: 0,
      };
    }

    return {
      hasData: true,
      minHum: s0.minHumidity ?? 0,
      maxHum: s0.maxHumidity ?? 0,
      avgDewPoint: s0.avgDewPointC ?? 0,
      minDewGap: s0.minDewGapC ?? 0,
    };
  }, [nightSummaries]);

  const nextDaysHumidityForecast = useMemo(() => {
    const { s1, s2, d1Key, d2Key } = nightSummaries;

    const p1 = parseDateKey(d1Key);
    const p2 = parseDateKey(d2Key);
    const d1Utc = new Date(Date.UTC(p1.year, p1.month - 1, p1.day));
    const d2Utc = new Date(Date.UTC(p2.year, p2.month - 1, p2.day));
    const day1Short = WEEKDAYS_SHORT_EN[d1Utc.getUTCDay()];
    const day2Short = WEEKDAYS_SHORT_EN[d2Utc.getUTCDay()];

    const day1HasData = s1.hasData && s1.minHumidity !== null && s1.maxHumidity !== null;
    const day2HasData = s2.hasData && s2.minHumidity !== null && s2.maxHumidity !== null;

    return {
      hasData: day1HasData && day2HasData,
      day1Short,
      day1MinHum: s1.minHumidity ?? 0,
      day1MaxHum: s1.maxHumidity ?? 0,
      day2Short,
      day2MinHum: s2.minHumidity ?? 0,
      day2MaxHum: s2.maxHumidity ?? 0,
    };
  }, [nightSummaries]);

  // ==========================================
  // 3. CLOUD ANALYSIS LOGIC (3-TIER BREAKDOWN)
  // ==========================================
  const todayCloudAnalysis = useMemo(() => {
    const { s0 } = nightSummaries;
    const hasData = s0.hasData && s0.avgNightCloud !== null;

    if (!hasData) {
      return {
        hasData: false,
        cloudHigh: 0,
        cloudMid: 0,
        cloudLow: 0,
        avgTotalCloud: 0,
      };
    }

    return {
      hasData: true,
      cloudHigh: s0.cloudHigh ?? 0,
      cloudMid: s0.cloudMid ?? 0,
      cloudLow: s0.cloudLow ?? 0,
      avgTotalCloud: s0.avgNightCloud ?? 0,
    };
  }, [nightSummaries]);

  const nextDaysCloudForecast = useMemo(() => {
    const { s1, s2, d1Key, d2Key } = nightSummaries;

    const p1 = parseDateKey(d1Key);
    const p2 = parseDateKey(d2Key);
    const d1Utc = new Date(Date.UTC(p1.year, p1.month - 1, p1.day));
    const d2Utc = new Date(Date.UTC(p2.year, p2.month - 1, p2.day));
    const day1Short = WEEKDAYS_SHORT_EN[d1Utc.getUTCDay()];
    const day2Short = WEEKDAYS_SHORT_EN[d2Utc.getUTCDay()];

    const day1HasData = s1.hasData && s1.avgNightCloud !== null;
    const day2HasData = s2.hasData && s2.avgNightCloud !== null;

    return {
      hasData: day1HasData && day2HasData,
      day1Short,
      day1Avg: s1.avgNightCloud ?? 0,
      day2Short,
      day2Avg: s2.avgNightCloud ?? 0,
    };
  }, [nightSummaries]);

  // ==========================================
  // 4. WIND ANALYSIS LOGIC
  // ==========================================
  const todayWindAnalysis = useMemo(() => {
    const { s0 } = nightSummaries;
    const hasData = s0.hasData && s0.windSpeedStr !== '--';

    if (!hasData) {
      return {
        hasData: false,
        minWind: 0,
        maxWind: 0,
        maxGust: 0,
        windDir: '',
        statusLabel: dayOffsetFromToday > 15 ? 'Out of Range' : 'No Data',
        statusBg: 'bg-white/5 text-slate-400 border-white/10',
      };
    }

    const minW = s0.windMinSpeed;
    const maxW = s0.windMaxGust;
    const maxG = s0.windMaxGust;
    const windDir = s0.windDir || 'N';

    let statusLabel = 'Ideal (<10 km/h)';
    let statusBg = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

    if (maxG > 25 || minW > 25) {
      statusLabel = 'Vibration Risk (>25 km/h)';
      statusBg = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    } else if (maxG >= 10 || minW >= 10) {
      statusLabel = 'Acceptable (10-25 km/h)';
      statusBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }

    return {
      hasData: true,
      minWind: minW,
      maxWind: maxW,
      maxGust: maxG,
      windDir,
      statusLabel,
      statusBg,
    };
  }, [nightSummaries, dayOffsetFromToday]);

  const nextDaysWindForecast = useMemo(() => {
    const { s1, s2, d1Key, d2Key } = nightSummaries;

    const p1 = parseDateKey(d1Key);
    const p2 = parseDateKey(d2Key);
    const d1Utc = new Date(Date.UTC(p1.year, p1.month - 1, p1.day));
    const d2Utc = new Date(Date.UTC(p2.year, p2.month - 1, p2.day));
    const day1Short = WEEKDAYS_SHORT_EN[d1Utc.getUTCDay()];
    const day2Short = WEEKDAYS_SHORT_EN[d2Utc.getUTCDay()];

    const day1HasData = s1.hasData && s1.windSpeedStr !== '--';
    const day2HasData = s2.hasData && s2.windSpeedStr !== '--';

    return {
      hasData: day1HasData && day2HasData,
      day1Short,
      day1MinW: s1.windMinSpeed,
      day1MaxG: s1.windMaxGust,
      day2Short,
      day2MinW: s2.windMinSpeed,
      day2MaxG: s2.windMaxGust,
    };
  }, [nightSummaries]);

  // Dynamic 72-Hour slice synced with selected date
  const { dynamic72Points } = useMemo<{ dynamic72Points: HourlyWeatherPoint[] }>(() => {
    if (allWeatherPoints.length === 0 || dayOffsetFromToday > 15) {
      return { dynamic72Points: [] };
    }

    const tz = currentLocation.timeZone;
    const targetHour =
      dayOffsetFromToday === 0
        ? Math.max(0, siteHour(Date.now(), tz) - 1)
        : 12;

    const curDateKey = siteDateKey(fieldTabDate, tz);
    let targetIdx = allWeatherPoints.findIndex(
      (p) => isSameSiteDay(p.time, curDateKey, tz) && siteHour(p.time, tz) === targetHour
    );

    if (targetIdx === -1) {
      targetIdx = allWeatherPoints.findIndex((p) => isSameSiteDay(p.time, curDateKey, tz));
    }

    if (targetIdx === -1) {
      return { dynamic72Points: [] };
    }

    const points = allWeatherPoints.slice(targetIdx, targetIdx + 72);
    return { dynamic72Points: points };
  }, [allWeatherPoints, dayOffsetFromToday, fieldTabDate, currentLocation.timeZone]);

  // Canvas Geometry
  const chartWidth = 900;
  const padLeft = 30;
  const padRight = 24;
  const padTop = 18;
  const padBottom = 32;
  const plotH = 200;
  const plotW = chartWidth - padLeft - padRight;
  const chartHeight = padTop + plotH + padBottom;

  // Temperature Chart Calculations (-20°C to +40°C)
  const maxY = 40;
  const tempRange = 60;
  const getY = (val: number) => padTop + ((maxY - val) / tempRange) * plotH;
  const yZero = padTop + (40 / 60) * plotH;

  const {
    splineSegments,
    singlePoints,
    svgPoints,
    isModelBoundary,
    modelBoundaryX,
  } = useMemo(() => {
    if (dynamic72Points.length === 0) {
      return {
        splineSegments: [],
        singlePoints: [],
        svgPoints: [],
        isModelBoundary: false,
        modelBoundaryX: padLeft + plotW,
      };
    }

    const totalHours = Math.max(72, dynamic72Points.length);
    const pts = dynamic72Points.map((p, i) => {
      const isMissing = isFieldMissing(p, 'temp');
      const x = padLeft + (i / (totalHours - 1)) * plotW;
      const y = Math.max(padTop + 4, Math.min(padTop + plotH - 4, getY(p.temp)));
      return {
        x,
        y,
        temp: p.temp,
        time: p.time,
        isDark: p.isAstroDark,
        sunAltitude: p.sunAltitude ?? (p.isAstroDark ? -25 : 10),
        isMissing,
      };
    });

    const splineSegments: { path: string; area: string }[] = [];
    const singlePoints: { x: number; y: number }[] = [];
    let currentSeg: typeof pts = [];

    pts.forEach((pt) => {
      if (!pt.isMissing) {
        currentSeg.push(pt);
      } else {
        if (currentSeg.length === 1) {
          singlePoints.push(currentSeg[0]);
        } else if (currentSeg.length >= 2) {
          const path = getSmoothSplinePath(currentSeg);
          const plotBottom = padTop + plotH;
          const firstX = currentSeg[0].x;
          const lastX = currentSeg[currentSeg.length - 1].x;
          const area = `${path} L ${lastX.toFixed(2)} ${plotBottom} L ${firstX.toFixed(2)} ${plotBottom} Z`;
          splineSegments.push({ path, area });
        }
        currentSeg = [];
      }
    });

    if (currentSeg.length === 1) {
      singlePoints.push(currentSeg[0]);
    } else if (currentSeg.length >= 2) {
      const path = getSmoothSplinePath(currentSeg);
      const plotBottom = padTop + plotH;
      const firstX = currentSeg[0].x;
      const lastX = currentSeg[currentSeg.length - 1].x;
      const area = `${path} L ${lastX.toFixed(2)} ${plotBottom} L ${firstX.toFixed(2)} ${plotBottom} Z`;
      splineSegments.push({ path, area });
    }

    const isBoundary = dynamic72Points.length < 72;
    const boundaryX = pts.length > 0 ? pts[pts.length - 1].x : padLeft + plotW;

    return {
      splineSegments,
      singlePoints,
      svgPoints: pts,
      isModelBoundary: isBoundary,
      modelBoundaryX: boundaryX,
    };
  }, [dynamic72Points, plotW, plotH]);

  const dailyBadges = useMemo(() => {
    if (svgPoints.length === 0) return [];
    const tz = currentLocation.timeZone;
    const dayMap = new Map<string, typeof svgPoints>();
    svgPoints.forEach((pt) => {
      if (pt.isMissing) return;
      const dKey = siteDateKey(pt.time, tz);
      let list = dayMap.get(dKey);
      if (!list) {
        list = [];
        dayMap.set(dKey, list);
      }
      list.push(pt);
    });

    const result: { maxPt: (typeof svgPoints)[0]; minPt: (typeof svgPoints)[0] }[] = [];
    dayMap.forEach((dayPts) => {
      if (dayPts.length < 3) return;
      let maxPt = dayPts[0];
      let minPt = dayPts[0];
      dayPts.forEach((pt) => {
        if (pt.temp > maxPt.temp) maxPt = pt;
        if (pt.temp < minPt.temp) minPt = pt;
      });
      result.push({ maxPt, minPt });
    });
    return result;
  }, [svgPoints, currentLocation.timeZone]);

  // Humidity Chart Calculations (0% to 100%)
  const getYHum = (val: number) => padTop + (1 - Math.max(0, Math.min(100, val)) / 100) * plotH;

  const {
    humSegments,
    humSinglePoints,
    humSvgPoints,
    isHumModelBoundary,
    humModelBoundaryX,
  } = useMemo(() => {
    if (dynamic72Points.length === 0) {
      return {
        humSegments: [],
        humSinglePoints: [],
        humSvgPoints: [],
        isHumModelBoundary: false,
        humModelBoundaryX: padLeft + plotW,
      };
    }

    const totalHours = Math.max(72, dynamic72Points.length);
    const pts = dynamic72Points.map((p, i) => {
      const isMissing = isFieldMissing(p, 'humidity');
      const isDewMissing = isFieldMissing(p, 'dewPoint');
      const isDewGapMissing = isMissing || isDewMissing;
      const x = padLeft + (i / (totalHours - 1)) * plotW;
      const y = Math.max(padTop + 4, Math.min(padTop + plotH - 4, getYHum(p.humidity)));
      return {
        x,
        y,
        humidity: p.humidity,
        dewPoint: p.dewPoint,
        dewGap: p.dewGap,
        time: p.time,
        isDark: p.isAstroDark,
        sunAltitude: p.sunAltitude ?? (p.isAstroDark ? -25 : 10),
        isMissing,
        isDewMissing,
        isDewGapMissing,
      };
    });

    const humSegments: { path: string; area: string }[] = [];
    const humSinglePoints: { x: number; y: number }[] = [];
    let currentSeg: typeof pts = [];

    pts.forEach((pt) => {
      if (!pt.isMissing) {
        currentSeg.push(pt);
      } else {
        if (currentSeg.length === 1) {
          humSinglePoints.push(currentSeg[0]);
        } else if (currentSeg.length >= 2) {
          const path = getSmoothSplinePath(currentSeg);
          const plotBottom = padTop + plotH;
          const firstX = currentSeg[0].x;
          const lastX = currentSeg[currentSeg.length - 1].x;
          const area = `${path} L ${lastX.toFixed(2)} ${plotBottom} L ${firstX.toFixed(2)} ${plotBottom} Z`;
          humSegments.push({ path, area });
        }
        currentSeg = [];
      }
    });

    if (currentSeg.length === 1) {
      humSinglePoints.push(currentSeg[0]);
    } else if (currentSeg.length >= 2) {
      const path = getSmoothSplinePath(currentSeg);
      const plotBottom = padTop + plotH;
      const firstX = currentSeg[0].x;
      const lastX = currentSeg[currentSeg.length - 1].x;
      const area = `${path} L ${lastX.toFixed(2)} ${plotBottom} L ${firstX.toFixed(2)} ${plotBottom} Z`;
      humSegments.push({ path, area });
    }

    const isBoundary = dynamic72Points.length < 72;
    const boundaryX = pts.length > 0 ? pts[pts.length - 1].x : padLeft + plotW;

    return {
      humSegments,
      humSinglePoints,
      humSvgPoints: pts,
      isHumModelBoundary: isBoundary,
      humModelBoundaryX: boundaryX,
    };
  }, [dynamic72Points, plotW, plotH]);

  const dailyHumBadges = useMemo(() => {
    if (humSvgPoints.length === 0) return [];
    const tz = currentLocation.timeZone;
    const dayMap = new Map<string, typeof humSvgPoints>();
    humSvgPoints.forEach((pt) => {
      if (pt.isMissing) return;
      const dKey = siteDateKey(pt.time, tz);
      let list = dayMap.get(dKey);
      if (!list) {
        list = [];
        dayMap.set(dKey, list);
      }
      list.push(pt);
    });

    const result: (typeof humSvgPoints)[0][] = [];
    dayMap.forEach((dayPts) => {
      if (dayPts.length < 3) return;
      let maxPt = dayPts[0];
      dayPts.forEach((pt) => {
        if (pt.humidity > maxPt.humidity) maxPt = pt;
      });
      result.push(maxPt);
    });
    return result;
  }, [humSvgPoints, currentLocation.timeZone]);

  // Wind Chart Calculations (0 to 60 km/h)
  const maxWindY = 60;
  const getYWind = (val: number) => padTop + (1 - Math.max(0, Math.min(maxWindY, val)) / maxWindY) * plotH;

  const {
    windPoints,
    windSegments,
    gustSegments,
  } = useMemo(() => {
    if (dynamic72Points.length === 0) {
      return { windPoints: [], windSegments: [], gustSegments: [] };
    }

    const totalHours = Math.max(72, dynamic72Points.length);
    const pts = dynamic72Points.map((p, i) => {
      const isMissing = isFieldMissing(p, 'wind');
      const x = padLeft + (i / (totalHours - 1)) * plotW;
      const ySpeed = Math.max(padTop + 4, Math.min(padTop + plotH - 4, getYWind(p.windSpeed)));
      const yGust = Math.max(padTop + 4, Math.min(padTop + plotH - 4, getYWind(p.windGust ?? p.windSpeed)));
      return {
        x,
        ySpeed,
        yGust,
        windSpeed: p.windSpeed,
        windGust: p.windGust ?? p.windSpeed,
        windDirectionCompass: p.windDirectionCompass,
        time: p.time,
        isDark: p.isAstroDark,
        sunAltitude: p.sunAltitude ?? (p.isAstroDark ? -25 : 10),
        isMissing,
      };
    });

    const windSegs: { path: string; area: string }[] = [];
    const gustSegs: { path: string }[] = [];
    let curWindPts: { x: number; y: number }[] = [];
    let curGustPts: { x: number; y: number }[] = [];

    pts.forEach((pt) => {
      if (!pt.isMissing) {
        curWindPts.push({ x: pt.x, y: pt.ySpeed });
        curGustPts.push({ x: pt.x, y: pt.yGust });
      } else {
        if (curWindPts.length >= 2) {
          const path = getSmoothSplinePath(curWindPts);
          const plotBottom = padTop + plotH;
          const firstX = curWindPts[0].x;
          const lastX = curWindPts[curWindPts.length - 1].x;
          const area = `${path} L ${lastX.toFixed(2)} ${plotBottom} L ${firstX.toFixed(2)} ${plotBottom} Z`;
          windSegs.push({ path, area });
          gustSegs.push({ path: getSmoothSplinePath(curGustPts) });
        }
        curWindPts = [];
        curGustPts = [];
      }
    });

    if (curWindPts.length >= 2) {
      const path = getSmoothSplinePath(curWindPts);
      const plotBottom = padTop + plotH;
      const firstX = curWindPts[0].x;
      const lastX = curWindPts[curWindPts.length - 1].x;
      const area = `${path} L ${lastX.toFixed(2)} ${plotBottom} L ${firstX.toFixed(2)} ${plotBottom} Z`;
      windSegs.push({ path, area });
      gustSegs.push({ path: getSmoothSplinePath(curGustPts) });
    }

    return {
      windPoints: pts,
      windSegments: windSegs,
      gustSegments: gustSegs,
    };
  }, [dynamic72Points, plotW, plotH]);

  // Handlers for Temperature Chart
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    isDraggingRef.current = false;
    startXRef.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current || e.buttons !== 1) return;
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    if (Math.abs(walk) > 4) {
      isDraggingRef.current = true;
      scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
    }
  };

  const handleMouseUpOrLeave = () => {
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 60);
  };

  const getIndexFromClientX = (clientX: number) => {
    if (!scrollContainerRef.current || svgPoints.length === 0) return null;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left + scrollContainerRef.current.scrollLeft;
    const clampedX = Math.max(0, Math.min(plotW, x - padLeft));
    return Math.round((clampedX / plotW) * (svgPoints.length - 1));
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current) return;
    const idx = getIndexFromClientX(e.clientX);
    if (idx !== null) {
      setLockedIndex((prev) => (prev === idx ? null : idx));
    }
  };

  // Handlers for Humidity Chart
  const handleHumMouseDown = (e: React.MouseEvent) => {
    if (!humScrollContainerRef.current) return;
    isHumDraggingRef.current = false;
    humStartXRef.current = e.pageX - humScrollContainerRef.current.offsetLeft;
    humScrollLeftRef.current = humScrollContainerRef.current.scrollLeft;
  };

  const handleHumMouseMove = (e: React.MouseEvent) => {
    if (!humScrollContainerRef.current || e.buttons !== 1) return;
    const x = e.pageX - humScrollContainerRef.current.offsetLeft;
    const walk = (x - humStartXRef.current) * 1.5;
    if (Math.abs(walk) > 4) {
      isHumDraggingRef.current = true;
      humScrollContainerRef.current.scrollLeft = humScrollLeftRef.current - walk;
    }
  };

  const handleHumMouseUpOrLeave = () => {
    setTimeout(() => {
      isHumDraggingRef.current = false;
    }, 60);
  };

  const getHumIndexFromClientX = (clientX: number) => {
    if (!humScrollContainerRef.current || humSvgPoints.length === 0) return null;
    const rect = humScrollContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left + humScrollContainerRef.current.scrollLeft;
    const clampedX = Math.max(0, Math.min(plotW, x - padLeft));
    return Math.round((clampedX / plotW) * (humSvgPoints.length - 1));
  };

  const handleHumCanvasClick = (e: React.MouseEvent) => {
    if (isHumDraggingRef.current) return;
    const idx = getHumIndexFromClientX(e.clientX);
    if (idx !== null) {
      setLockedHumIndex((prev) => (prev === idx ? null : idx));
    }
  };

  // Handlers for Cloud Matrix Strip
  const handleCloudMouseDown = (e: React.MouseEvent) => {
    if (!cloudScrollContainerRef.current) return;
    isCloudDraggingRef.current = false;
    cloudStartXRef.current = e.pageX - cloudScrollContainerRef.current.offsetLeft;
    cloudScrollLeftRef.current = cloudScrollContainerRef.current.scrollLeft;
  };

  const handleCloudMouseMove = (e: React.MouseEvent) => {
    if (!cloudScrollContainerRef.current || e.buttons !== 1) return;
    const x = e.pageX - cloudScrollContainerRef.current.offsetLeft;
    const walk = (x - cloudStartXRef.current) * 1.5;
    if (Math.abs(walk) > 4) {
      isCloudDraggingRef.current = true;
      cloudScrollContainerRef.current.scrollLeft = cloudScrollLeftRef.current - walk;
    }
  };

  const handleCloudMouseUpOrLeave = () => {
    setTimeout(() => {
      isCloudDraggingRef.current = false;
    }, 60);
  };

  const getCloudIndexFromClientX = (clientX: number) => {
    if (!cloudScrollContainerRef.current || dynamic72Points.length === 0) return null;
    const rect = cloudScrollContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left + cloudScrollContainerRef.current.scrollLeft;
    const clampedX = Math.max(0, Math.min(plotW, x - padLeft));
    return Math.round((clampedX / plotW) * (dynamic72Points.length - 1));
  };

  const handleCloudCanvasClick = (e: React.MouseEvent) => {
    if (isCloudDraggingRef.current) return;
    const idx = getCloudIndexFromClientX(e.clientX);
    if (idx !== null) {
      setLockedCloudIndex((prev) => (prev === idx ? null : idx));
    }
  };

  // Handlers for Wind Chart
  const handleWindMouseDown = (e: React.MouseEvent) => {
    if (!windScrollContainerRef.current) return;
    isWindDraggingRef.current = false;
    windStartXRef.current = e.pageX - windScrollContainerRef.current.offsetLeft;
    windScrollLeftRef.current = windScrollContainerRef.current.scrollLeft;
  };

  const handleWindMouseMove = (e: React.MouseEvent) => {
    if (!windScrollContainerRef.current || e.buttons !== 1) return;
    const x = e.pageX - windScrollContainerRef.current.offsetLeft;
    const walk = (x - windStartXRef.current) * 1.5;
    if (Math.abs(walk) > 4) {
      isWindDraggingRef.current = true;
      windScrollContainerRef.current.scrollLeft = windScrollLeftRef.current - walk;
    }
  };

  const handleWindMouseUpOrLeave = () => {
    setTimeout(() => {
      isWindDraggingRef.current = false;
    }, 60);
  };

  const getWindIndexFromClientX = (clientX: number) => {
    if (!windScrollContainerRef.current || windPoints.length === 0) return null;
    const rect = windScrollContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left + windScrollContainerRef.current.scrollLeft;
    const clampedX = Math.max(0, Math.min(plotW, x - padLeft));
    return Math.round((clampedX / plotW) * (windPoints.length - 1));
  };

  const handleWindCanvasClick = (e: React.MouseEvent) => {
    if (isWindDraggingRef.current) return;
    const idx = getWindIndexFromClientX(e.clientX);
    if (idx !== null) {
      setLockedWindIndex((prev) => (prev === idx ? null : idx));
    }
  };

  const cleanName = currentLocation.name.replace(/\s*\(.*?\)\s*/g, '').trim();
  const isOfflineNoCache = !loading && (allWeatherPoints.length === 0 || weatherSource === 'fallback');

  // Hardware LED Beacon Status
  const sourceBadge = useMemo(() => {
    if (dayOffsetFromToday > 15) {
      return {
        ledClass: 'w-2 h-2 rounded-full bg-slate-500 ring-1 ring-amber-500/70 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)] inline-block shrink-0',
        title: `Out of Range: Forecast limited to 16 days (+${dayOffsetFromToday}d)`,
      };
    }

    if (loading || weatherSource === null || fetchedAt === null) {
      return {
        ledClass: 'w-2 h-2 rounded-full bg-sky-400 animate-pulse drop-shadow-[0_0_8px_rgba(56,189,248,1)] inline-block shrink-0',
        title: 'Verifying site telemetry...',
      };
    }

    if (weatherSource === 'fallback' || allWeatherPoints.length === 0) {
      return {
        ledClass: 'w-2 h-2 rounded-full bg-slate-500 inline-block shrink-0',
        title: 'Offline — No data cached',
      };
    }

    const tz = currentLocation.timeZone;
    const lastParts = siteParts(fetchedAt, tz);
    const timeStr = `${String(lastParts.hour).padStart(2, '0')}:${String(lastParts.minute).padStart(2, '0')}`;
    const dateStr = `${lastParts.day} ${MONTHS_SHORT_EN[lastParts.month - 1]}`;
    const tooltipText = `Last updated: ${dateStr} ${timeStr}`;

    const ageMs = Math.max(0, nowTick - fetchedAt);
    const ageMin = Math.floor(ageMs / 60000);

    const formatAge = (min: number): string => {
      if (min < 60) return `${min}m`;
      const hours = Math.floor(min / 60);
      if (hours < 24) return `${hours}h`;
      const days = Math.floor(hours / 24);
      return `${days}d`;
    };

    if (ageMin < 30) {
      return {
        ledClass: 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse drop-shadow-[0_0_8px_rgba(52,211,153,1)] inline-block shrink-0',
        title: `Live API (${ageMin}m ago | ${tooltipText})`,
      };
    }

    const ageText = formatAge(ageMin);
    return {
      ledClass: 'w-2 h-2 rounded-full bg-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,1)] inline-block shrink-0',
      title: `Cached (${ageText} ago | ${tooltipText})`,
    };
  }, [loading, weatherSource, fetchedAt, nowTick, dayOffsetFromToday, currentLocation.timeZone]);

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] select-none">
      {/* SUB-HEADER CONSOLE */}
      <div className="shrink-0 bg-[#090d16] border-b border-white/10 px-3 py-2 z-20 shadow-xl">
        {/* Line 1: Site Navigation */}
        <div className="flex items-center justify-between w-full">
          <button
            onClick={() =>
              setViewedIndex((prev) => (prev > 0 ? prev - 1 : allLocations.length - 1))
            }
            aria-label="Previous Site"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 active:scale-95 text-cyan-400 cursor-pointer transition-all"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M 16 5 L 7 12 L 16 19 Z" />
            </svg>
          </button>

          <div className="flex-1 px-2 flex items-center justify-center gap-1.5 truncate">
            <span className="text-sm sm:text-base font-bold font-mono text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)] truncate">
              {cleanName}
            </span>
            <button
              type="button"
              onClick={() => openSiteNavigation(currentLocation.latitude, currentLocation.longitude, cleanName)}
              title="Open in Maps"
              aria-label="Open in Maps"
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 active:scale-95 text-cyan-400 hover:text-cyan-300 transition-all shrink-0 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() =>
              setViewedIndex((prev) => (prev < allLocations.length - 1 ? prev + 1 : 0))
            }
            aria-label="Next Site"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 active:scale-95 text-cyan-400 cursor-pointer transition-all"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M 8 5 L 17 12 L 8 19 Z" />
            </svg>
          </button>
        </div>

        {/* Unresolved Favorites Notice & Action Chips */}
        {partitionedFavorites.unresolved.length > 0 && (
          <div className="mt-2 pt-2 border-t border-amber-500/20 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-medium text-amber-300/90">
              Favorites requiring time zone:
            </span>
            {partitionedFavorites.unresolved.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => {
                  saveStoredLocation(site);
                  try {
                    window.dispatchEvent(new Event('storage'));
                    window.dispatchEvent(
                      new CustomEvent('chroma_location_changed', { detail: site })
                    );
                  } catch {}
                }}
                className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{site.name}</span>
                <span className="text-amber-400/80 font-normal underline">Set time zone</span>
              </button>
            ))}
          </div>
        )}

        {/* Line 2: Date Navigation + Action Buttons */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 w-full select-none">
          <div className="flex items-center gap-1 font-mono shrink-0">
            <button
              onClick={handlePrevDay}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 text-xs cursor-pointer active:scale-95 shrink-0"
              title="Previous Day"
            >
              ◀
            </button>
            <span className="w-[124px] shrink-0 text-center font-mono text-[11px] sm:text-xs font-bold text-slate-200 truncate tracking-tight">
              {subHeaderFormattedDate}
            </span>
            <button
              onClick={handleNextDay}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 text-xs cursor-pointer active:scale-95 shrink-0"
              title="Next Day"
            >
              ▶
            </button>
            <button
              onClick={handleResetToToday}
              className="px-2 py-0.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold active:scale-95 cursor-pointer shrink-0 ml-0.5"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <button
              type="button"
              onClick={handleRefreshWeather}
              title={sourceBadge.title}
              aria-label={sourceBadge.title}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 transition-all cursor-pointer active:scale-95 shrink-0"
            >
              <span className={sourceBadge.ledClass} />
            </button>
            <button
              onClick={handleRefreshWeather}
              title="Refresh"
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-cyan-400 active:scale-95 cursor-pointer transition-all shrink-0"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {originFavoriteId && currentLocation.id !== originFavoriteId && (
              <button
                onClick={handleReturnToOriginFavorite}
                title="Return to Favorite"
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 active:scale-95 cursor-pointer transition-all shrink-0"
              >
                <Star className="w-3 h-3 fill-current" />
              </button>
            )}
            <button
              onClick={handleReturnToHome}
              disabled={currentLocation.id === homeLocation.id}
              title="Return to Home"
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-20 disabled:pointer-events-none border border-cyan-500/30 text-cyan-300 active:scale-95 cursor-pointer transition-all shrink-0"
            >
              <Home className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div
        ref={contentScrollRef}
        className="flex-1 overflow-y-auto px-3 pt-3.5 pb-8 space-y-4 custom-scrollbar"
      >
        {/* ========================================================================= */}
        {/* --- SECTION 1: 2x2 TELEMETRY CARDS ---                                    */}
        {/* ========================================================================= */}

        {/* A. TEMPERATURE ANALYSIS (id="section-temperature") */}
        <div
          id="section-temperature"
          className="scroll-mt-3 rounded-2xl border border-white/10 bg-[var(--theme-card)]/80 p-4 select-none shadow-xl transition-all"
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10 select-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold font-mono uppercase text-amber-400">
              <Thermometer className="w-4 h-4 text-amber-400 shrink-0" /> TEMPERATURE ANALYSIS
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-slate-200 shrink-0 whitespace-nowrap">
              {cleanDateString}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 select-none">
            {/* Top Left (h-72): Day Max | Night Min */}
            <div className="h-[72px] rounded-xl bg-black/40 border border-white/5 flex items-center justify-center gap-2.5 px-3">
              <Thermometer className="w-5 h-5 text-amber-400 shrink-0 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              <div className="flex items-center gap-1.5 font-mono font-bold text-lg sm:text-xl tracking-tight">
                {todayAnalysis.hasData ? (
                  <>
                    <span className="text-amber-300">{tempVal(todayAnalysis.maxTemp)}{tempUnit}</span>
                    <span className="text-slate-600 font-normal">|</span>
                    <span className="text-cyan-300">{tempVal(todayAnalysis.minTemp)}{tempUnit}</span>
                  </>
                ) : (
                  <span className="text-slate-500 font-bold">--</span>
                )}
              </div>
            </div>

            {/* Top Right (h-72): Atmospheric icon & status */}
            <div className="h-[72px] rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center text-center px-3">
              <todayAnalysis.WeatherIcon className="w-6 h-6 text-amber-400 shrink-0 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
              <div className="text-xs sm:text-sm font-bold font-mono text-white mt-1 truncate max-w-full">
                {isOfflineNoCache ? 'Offline — No forecast data' : todayAnalysis.weatherText}
              </div>
            </div>

            {/* Bottom Left (h-52): Next 2 days summary */}
            <div className="h-[52px] rounded-xl bg-black/40 border border-white/5 flex items-center justify-center px-2 select-none">
              <span className="text-[11px] font-mono font-bold text-slate-300 truncate">
                {nextDaysForecast.day1HasData && nextDaysForecast.day2HasData ? (
                  <>
                    <span>{nextDaysForecast.day1Short} {tempVal(nextDaysForecast.day1Max)}°|{tempVal(nextDaysForecast.day1Min)}°</span>
                    <span className="text-slate-600 mx-1.5">•</span>
                    <span>{nextDaysForecast.day2Short} {tempVal(nextDaysForecast.day2Max)}°|{tempVal(nextDaysForecast.day2Min)}°</span>
                  </>
                ) : (
                  <span className="text-slate-500 font-bold">--</span>
                )}
              </span>
            </div>

            {/* Bottom Right (h-52): Chart Button */}
            <button
              onClick={() =>
                document.getElementById('card-temperature-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="w-full h-[52px] px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 border border-amber-500/40 flex items-center justify-center gap-2 text-xs sm:text-sm font-mono font-bold text-amber-300 transition-all shadow-md cursor-pointer"
            >
              <Activity className="w-4 h-4 text-amber-400 shrink-0 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              <span>Chart</span>
            </button>
          </div>
        </div>

        {/* B. HUMIDITY ANALYSIS (id="section-humidity") */}
        <div
          id="section-humidity"
          className="scroll-mt-3 rounded-2xl border border-white/10 bg-[var(--theme-card)]/80 p-4 select-none shadow-xl transition-all"
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10 select-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold font-mono uppercase text-cyan-400">
              <Droplets className="w-4 h-4 text-cyan-400 shrink-0" /> HUMIDITY ANALYSIS
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-slate-200 shrink-0 whitespace-nowrap">
              {cleanDateString}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 select-none">
            {/* Top Left (h-72): Night relative humidity min & max */}
            <div className="h-[72px] rounded-xl bg-black/40 border border-white/5 flex items-center justify-center gap-2.5 px-3">
              <Droplets className="w-5 h-5 text-cyan-400 shrink-0 drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
              <div className="flex items-center gap-1.5 font-mono font-bold text-lg sm:text-xl tracking-tight">
                {todayHumidityAnalysis.hasData ? (
                  <>
                    <span className="text-cyan-300">%{todayHumidityAnalysis.minHum}</span>
                    <span className="text-slate-600 font-normal">|</span>
                    <span className="text-sky-400">%{todayHumidityAnalysis.maxHum}</span>
                  </>
                ) : (
                  <span className="text-slate-500 font-bold">--</span>
                )}
              </div>
            </div>

            {/* Top Right (h-72): Dew point & temperature depression */}
            <div className="h-[72px] rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center text-center px-3">
              {todayHumidityAnalysis.hasData ? (
                <div className="text-xs sm:text-sm font-mono font-bold text-slate-200 leading-snug">
                  <div>Dew: <span className="text-cyan-300">{todayHumidityAnalysis.avgDewPoint}°C</span></div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Δ<span className={todayHumidityAnalysis.minDewGap < 2 ? 'text-rose-400 font-bold' : 'text-slate-200'}>{todayHumidityAnalysis.minDewGap}°C</span>
                  </div>
                </div>
              ) : isOfflineNoCache ? (
                <span className="text-xs font-mono font-bold text-slate-400">Offline — No forecast data</span>
              ) : (
                <span className="text-slate-500 font-mono text-sm font-bold">--</span>
              )}
            </div>

            {/* Bottom Left (h-52): Next 2 days humidity range */}
            <div className="h-[52px] rounded-xl bg-black/40 border border-white/5 flex items-center justify-center px-2 select-none">
              <span className="text-[11px] font-mono font-bold text-slate-300 truncate">
                {nextDaysHumidityForecast.hasData ? (
                  <>
                    <span>{nextDaysHumidityForecast.day1Short} %{nextDaysHumidityForecast.day1MinHum}|%{nextDaysHumidityForecast.day1MaxHum}</span>
                    <span className="text-slate-600 mx-1.5">•</span>
                    <span>{nextDaysHumidityForecast.day2Short} %{nextDaysHumidityForecast.day2MinHum}|%{nextDaysHumidityForecast.day2MaxHum}</span>
                  </>
                ) : (
                  <span className="text-slate-500 font-bold">--</span>
                )}
              </span>
            </div>

            {/* Bottom Right (h-52): Chart Button */}
            <button
              onClick={() =>
                document.getElementById('card-humidity-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="w-full h-[52px] px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 active:scale-95 border border-cyan-500/40 flex items-center justify-center gap-2 text-xs sm:text-sm font-mono font-bold text-cyan-300 transition-all shadow-md cursor-pointer"
            >
              <Activity className="w-4 h-4 text-cyan-400 shrink-0 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
              <span>Chart</span>
            </button>
          </div>
        </div>

        {/* C. CLOUD ANALYSIS (id="section-cloud") */}
        <div
          id="section-cloud"
          className="scroll-mt-3 rounded-2xl border border-white/10 bg-[var(--theme-card)]/80 p-4 select-none shadow-xl transition-all"
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10 select-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold font-mono uppercase text-sky-400">
              <Cloud className="w-4 h-4 text-sky-400 shrink-0" /> CLOUD ANALYSIS
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-slate-200 shrink-0 whitespace-nowrap">
              {cleanDateString}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 select-none">
            {/* Top Left (h-72): 3-Tier horizontal cloud breakdown */}
            <div className="h-[72px] rounded-xl bg-black/40 border border-white/5 flex flex-col justify-center px-3 font-mono text-[11px] leading-tight space-y-1">
              {todayCloudAnalysis.hasData ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10px]">High (Cirrus):</span>
                    <span className="font-bold text-[#38bdf8]">%{todayCloudAnalysis.cloudHigh}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10px]">Mid (Altostratus):</span>
                    <span className="font-bold text-[#06b6d4]">%{todayCloudAnalysis.cloudMid}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10px]">Low (Stratus/Fog):</span>
                    <span className="font-bold text-[#818cf8]">%{todayCloudAnalysis.cloudLow}</span>
                  </div>
                </>
              ) : (
                <div className="text-center text-slate-500 font-mono text-xs font-bold">--</div>
              )}
            </div>

            {/* Top Right (h-72): Total Coverage */}
            <div className="h-[72px] rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center text-center px-3">
              {todayCloudAnalysis.hasData ? (
                <>
                  <div className="text-lg sm:text-xl font-bold font-mono text-white">
                    %{todayCloudAnalysis.avgTotalCloud}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Total Sky Cover
                  </div>
                </>
              ) : isOfflineNoCache ? (
                <span className="text-xs font-mono font-bold text-slate-400">Offline — No forecast data</span>
              ) : (
                <span className="text-slate-500 font-mono text-sm font-bold">--</span>
              )}
            </div>

            {/* Bottom Left (h-52): Next 2 days cloud summary */}
            <div className="h-[52px] rounded-xl bg-black/40 border border-white/5 flex items-center justify-center px-2 select-none">
              <span className="text-[11px] font-mono font-bold text-slate-300 truncate">
                {nextDaysCloudForecast.hasData ? (
                  <>
                    <span>{nextDaysCloudForecast.day1Short} %{nextDaysCloudForecast.day1Avg}</span>
                    <span className="text-slate-600 mx-1.5">•</span>
                    <span>{nextDaysCloudForecast.day2Short} %{nextDaysCloudForecast.day2Avg}</span>
                  </>
                ) : (
                  <span className="text-slate-500 font-bold">--</span>
                )}
              </span>
            </div>

            {/* Bottom Right (h-52): Matrix Strip Button */}
            <button
              onClick={() =>
                document.getElementById('card-cloud-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="w-full h-[52px] px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 active:scale-95 border border-sky-500/40 flex items-center justify-center gap-2 text-xs sm:text-sm font-mono font-bold text-sky-300 transition-all shadow-md cursor-pointer"
            >
              <Layers className="w-4 h-4 text-sky-400 shrink-0 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
              <span>Matrix</span>
            </button>
          </div>
        </div>

        {/* D. WIND ANALYSIS (id="section-wind") */}
        <div
          id="section-wind"
          className="scroll-mt-3 rounded-2xl border border-white/10 bg-[var(--theme-card)]/80 p-4 select-none shadow-xl transition-all"
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10 select-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold font-mono uppercase text-teal-400">
              <Wind className="w-4 h-4 text-teal-400 shrink-0" /> WIND ANALYSIS
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-slate-200 shrink-0 whitespace-nowrap">
              {cleanDateString}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 select-none">
            {/* Top Left (h-72): Speed & Gust range */}
            <div className="h-[72px] rounded-xl bg-black/40 border border-white/5 flex items-center justify-center gap-2 px-3 font-mono">
              <Wind className="w-5 h-5 text-teal-400 shrink-0" />
              <div className="text-center">
                {todayWindAnalysis.hasData ? (
                  <>
                    <div className="font-bold text-sm sm:text-base text-teal-200">
                      {speedVal(todayWindAnalysis.minWind)} - {speedVal(todayWindAnalysis.maxGust)} {speedUnit}
                    </div>
                    {todayWindAnalysis.windDir && (
                      <div className="text-[10px] text-amber-300 font-bold mt-0.5">
                        {todayWindAnalysis.windDir}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-slate-500 font-bold">--</span>
                )}
              </div>
            </div>

            {/* Top Right (h-72): Stability Status */}
            <div className="h-[72px] rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center text-center px-2">
              {todayWindAnalysis.hasData ? (
                <div className={`px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold ${todayWindAnalysis.statusBg}`}>
                  {todayWindAnalysis.statusLabel}
                </div>
              ) : isOfflineNoCache ? (
                <span className="text-xs font-mono font-bold text-slate-400">Offline — No forecast data</span>
              ) : (
                <span className="text-slate-500 font-mono text-sm font-bold">--</span>
              )}
            </div>

            {/* Bottom Left (h-52): Next 2 days wind summary */}
            <div className="h-[52px] rounded-xl bg-black/40 border border-white/5 flex items-center justify-center px-2 select-none">
              <span className="text-[11px] font-mono font-bold text-slate-300 truncate">
                {nextDaysWindForecast.hasData ? (
                  <>
                    <span>{nextDaysWindForecast.day1Short} {speedVal(nextDaysWindForecast.day1MinW)}-{speedVal(nextDaysWindForecast.day1MaxG)} {speedUnit}</span>
                    <span className="text-slate-600 mx-1.5">•</span>
                    <span>{nextDaysWindForecast.day2Short} {speedVal(nextDaysWindForecast.day2MinW)}-{speedVal(nextDaysWindForecast.day2MaxG)} {speedUnit}</span>
                  </>
                ) : (
                  <span className="text-slate-500 font-bold">--</span>
                )}
              </span>
            </div>

            {/* Bottom Right (h-52): Chart Button */}
            <button
              onClick={() =>
                document.getElementById('card-wind-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="w-full h-[52px] px-3 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 active:scale-95 border border-teal-500/40 flex items-center justify-center gap-2 text-xs sm:text-sm font-mono font-bold text-teal-300 transition-all shadow-md cursor-pointer"
            >
              <Activity className="w-4 h-4 text-teal-400 shrink-0 drop-shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
              <span>Chart</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* --- SECTION 2: 72-HOUR CHARTS & 3-TIER CLOUD MATRIX STRIP ---             */}
        {/* ========================================================================= */}

        {/* 1. TEMPERATURE CHART (id="card-temperature-chart") */}
        <div
          id="card-temperature-chart"
          className="scroll-mt-3 rounded-2xl border border-white/10 bg-[var(--theme-card)]/90 overflow-hidden shadow-xl select-none"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 text-xs sm:text-sm font-bold font-mono uppercase tracking-wider text-amber-400">
            <Activity className="w-4 h-4 text-amber-400 shrink-0" /> TEMPERATURE CHART (72h)
          </div>

          <div
            ref={scrollContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            className="p-2 sm:p-3 pb-1 overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing custom-scrollbar"
          >
            <div
              onClick={handleCanvasClick}
              className="min-w-[850px] relative"
              style={{ width: `${chartWidth}px`, height: `${chartHeight}px` }}
            >
              {dynamic72Points.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 space-y-2 select-none">
                  <CloudOff className="w-8 h-8 text-slate-500 stroke-[1.5]" />
                  <p className="font-mono text-xs sm:text-sm text-slate-400 font-medium">
                    No forecast data available offline. Connect to download telemetry.
                  </p>
                </div>
              ) : (
                <>
                  <svg width={chartWidth} height={chartHeight} className="block w-full h-full">
                <defs>
                  <linearGradient id="splineStrokeGrad72" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ea580c" />
                    <stop offset="30%" stopColor="#f59e0b" />
                    <stop offset="62%" stopColor="#fbbf24" />
                    <stop offset="66.6%" stopColor="#fbbf24" />
                    <stop offset="66.8%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>

                  <linearGradient id="splineAreaGrad72" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ea580c" stopOpacity="0.4" />
                    <stop offset="30%" stopColor="#f59e0b" stopOpacity="0.22" />
                    <stop offset="66.6%" stopColor="#f59e0b" stopOpacity="0.08" />
                    <stop offset="66.8%" stopColor="#38bdf8" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.04" />
                  </linearGradient>

                  <filter id="splineGlow72" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#f59e0b" floodOpacity="0.5" />
                  </filter>
                </defs>

                {svgPoints.map((pt, i) => {
                  const colW = plotW / 71;
                  const sunAlt = pt.sunAltitude;

                  if (sunAlt < -18) {
                    return (
                      <rect
                        key={`bg-stripe-${i}`}
                        x={pt.x - colW / 2}
                        y={padTop}
                        width={colW}
                        height={plotH}
                        fill="#020617"
                        opacity={0.85}
                      />
                    );
                  }

                  if (sunAlt <= 0) {
                    return (
                      <rect
                        key={`bg-stripe-${i}`}
                        x={pt.x - colW / 2}
                        y={padTop}
                        width={colW}
                        height={plotH}
                        fill="#1e1b4b"
                        opacity={0.35}
                      />
                    );
                  }

                  return (
                    <rect
                      key={`bg-stripe-${i}`}
                      x={pt.x - colW / 2}
                      y={padTop}
                      width={colW}
                      height={plotH}
                      fill="transparent"
                    />
                  );
                })}

                {[40, 20, -20].map((tempValGrid) => {
                  const y = getY(tempValGrid);
                  return (
                    <g key={`grid-y-${tempValGrid}`}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={padLeft + plotW}
                        y2={y}
                        stroke="rgba(255, 255, 255, 0.06)"
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 6}
                        y={y + 3.5}
                        textAnchor="end"
                        fill="rgba(255, 255, 255, 0.35)"
                        fontSize="8.5"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {tempVal(tempValGrid)}°
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={padLeft}
                  y1={yZero}
                  x2={padLeft + plotW}
                  y2={yZero}
                  stroke="rgba(56, 189, 248, 0.65)"
                  strokeDasharray="4 4"
                  strokeWidth="1.2"
                />
                <text
                  x={padLeft - 6}
                  y={yZero + 3.5}
                  textAnchor="end"
                  fill="#38bdf8"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tempVal(0)}°
                </text>
                <text
                  x={padLeft + plotW + 6}
                  y={yZero + 3.5}
                  fill="#38bdf8"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tempVal(0)}°
                </text>

                {svgPoints.map((pt, i) => {
                  if (i % 3 !== 0) return null;
                  const tz = currentLocation.timeZone;
                  const labelHour = siteHour(pt.time, tz);
                  const timeString = `${String(labelHour).padStart(2, '0')}:00`;
                  const isMidnight = labelHour === 0;
                  const pSite = siteParts(pt.time, tz);
                  const dayName = `${pSite.day} ${MONTHS_SHORT_EN[pSite.month - 1]}`;

                  return (
                    <g key={`x-guide-${i}`}>
                      <line
                        x1={pt.x}
                        y1={padTop}
                        x2={pt.x}
                        y2={padTop + plotH}
                        stroke={isMidnight ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)'}
                        strokeDasharray={isMidnight ? '4 3' : '2 3'}
                        strokeWidth={isMidnight ? 1.5 : 1}
                        opacity={isMidnight ? 0.8 : undefined}
                      />
                      <text
                        x={pt.x}
                        y={chartHeight - padBottom + 13}
                        textAnchor="middle"
                        fill={isMidnight ? '#38bdf8' : 'rgba(255, 255, 255, 0.6)'}
                        fontSize="9"
                        fontWeight={isMidnight ? 'bold' : 'normal'}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {timeString}
                      </text>
                      {isMidnight && (
                        <text
                          x={pt.x}
                          y={chartHeight - padBottom + 25}
                          textAnchor="middle"
                          fill="#38bdf8"
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                          className="drop-shadow-[0_0_6px_rgba(56,189,248,0.7)]"
                        >
                          {dayName}
                        </text>
                      )}
                    </g>
                  );
                })}

                {isModelBoundary ? (
                  <g>
                    <line
                      x1={modelBoundaryX}
                      y1={padTop}
                      x2={modelBoundaryX}
                      y2={padTop + plotH}
                      stroke="rgba(244, 63, 94, 0.8)"
                      strokeDasharray="3 3"
                      strokeWidth="1.5"
                    />
                    <text
                      x={modelBoundaryX - 6}
                      y={padTop + 18}
                      textAnchor="end"
                      fill="#fb7185"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      Model Limit
                    </text>
                  </g>
                ) : (
                  <g>
                    <line
                      x1={padLeft + plotW}
                      y1={padTop}
                      x2={padLeft + plotW}
                      y2={padTop + plotH}
                      stroke="rgba(255, 255, 255, 0.15)"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft + plotW - 6}
                      y={padTop + 14}
                      textAnchor="end"
                      fill="rgba(255, 255, 255, 0.35)"
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      72h Limit
                    </text>
                  </g>
                )}

                {splineSegments.map((seg, idx) => (
                  <path key={`temp-area-${idx}`} d={seg.area} fill="url(#splineAreaGrad72)" />
                ))}

                {splineSegments.map((seg, idx) => (
                  <path
                    key={`temp-path-${idx}`}
                    d={seg.path}
                    fill="none"
                    stroke="url(#splineStrokeGrad72)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#splineGlow72)"
                  />
                ))}

                {singlePoints.map((pt, idx) => (
                  <circle
                    key={`single-pt-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r="2"
                    fill="#fbbf24"
                    stroke="#ffffff"
                    strokeWidth="0.8"
                  />
                ))}

                {dailyBadges.map(({ maxPt, minPt }, idx) => (
                  <g key={`daily-badge-${idx}`}>
                    <g transform={`translate(${maxPt.x}, ${maxPt.y - 18})`}>
                      <circle r="3" cy="18" fill="#f59e0b" stroke="#ffffff" strokeWidth="1" />
                      <rect x="-16" y="-8" width="32" height="15" rx="3.5" fill="rgba(245, 158, 11, 0.9)" stroke="#ffffff" strokeWidth="0.7" />
                      <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        {tempVal(maxPt.temp)}°
                      </text>
                    </g>
                    <g transform={`translate(${minPt.x}, ${minPt.y + 18})`}>
                      <circle r="3" cy="-18" fill="#38bdf8" stroke="#ffffff" strokeWidth="1" />
                      <rect x="-16" y="-7" width="32" height="15" rx="3.5" fill="rgba(56, 189, 248, 0.9)" stroke="#ffffff" strokeWidth="0.7" />
                      <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        {tempVal(minPt.temp)}°
                      </text>
                    </g>
                  </g>
                ))}

                {lockedIndex !== null && svgPoints[lockedIndex] && (
                  <g>
                    <line
                      x1={svgPoints[lockedIndex].x}
                      y1={padTop}
                      x2={svgPoints[lockedIndex].x}
                      y2={padTop + plotH}
                      stroke="#ffffff"
                      strokeDasharray="2 2"
                      strokeWidth="1.2"
                    />
                    {!svgPoints[lockedIndex].isMissing && (
                      <circle
                        cx={svgPoints[lockedIndex].x}
                        cy={svgPoints[lockedIndex].y}
                        r="5"
                        fill="#ffffff"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                        className="drop-shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                      />
                    )}
                  </g>
                )}
              </svg>

              {lockedIndex !== null && svgPoints[lockedIndex] && (() => {
                const tempPt = svgPoints[lockedIndex];
                const tz = currentLocation.timeZone;
                const isNearRight = tempPt.x > chartWidth - 140;
                const isNearLeft = tempPt.x < 110;
                const translateX = isNearRight ? '-100%' : isNearLeft ? '0%' : '-50%';
                const leftPos = isNearRight
                  ? Math.min(chartWidth - padRight, tempPt.x + 8)
                  : isNearLeft
                  ? Math.max(padLeft, tempPt.x - 8)
                  : tempPt.x;

                return (
                  <div
                    className="absolute pointer-events-none px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-md border border-amber-500/40 text-xs font-mono font-bold text-white shadow-xl z-20 whitespace-nowrap"
                    style={{
                      left: `${leftPos}px`,
                      top: `${tempPt.y < 50 ? tempPt.y + 12 : tempPt.y - 36}px`,
                      transform: `translateX(${translateX})`,
                    }}
                  >
                    {tempPt.isMissing ? (
                      <span className="text-slate-400">Temperature: —</span>
                    ) : (
                      <>
                        {tempVal(tempPt.temp)}{tempUnit}{' '}
                        <span className="text-slate-500 font-normal">|</span>{' '}
                        {formatSiteTimeHM(tempPt.time, tz)}
                      </>
                    )}
                  </div>
                );
              })()}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 2. HUMIDITY & DEW RISK CHART (id="card-humidity-chart") */}
        <div
          id="card-humidity-chart"
          className="scroll-mt-3 rounded-2xl border border-white/10 bg-[var(--theme-card)]/90 overflow-hidden shadow-xl select-none"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 select-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold font-mono uppercase tracking-wider text-cyan-400 min-w-0">
              <Droplets className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">HUMIDITY & DEW RISK (72h)</span>
            </div>
            <div className="text-[10px] font-mono text-rose-400/90 font-bold shrink-0 ml-2 whitespace-nowrap flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-rose-400 inline-block border-b border-rose-400 border-dashed" /> %85 Critical Threshold
            </div>
          </div>

          <div
            ref={humScrollContainerRef}
            onMouseDown={handleHumMouseDown}
            onMouseMove={handleHumMouseMove}
            onMouseUp={handleHumMouseUpOrLeave}
            onMouseLeave={handleHumMouseUpOrLeave}
            className="p-2 sm:p-3 pb-1 overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing custom-scrollbar"
          >
            <div
              onClick={handleHumCanvasClick}
              className="min-w-[850px] relative"
              style={{ width: `${chartWidth}px`, height: `${chartHeight}px` }}
            >
              {dynamic72Points.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 space-y-2 select-none">
                  <CloudOff className="w-8 h-8 text-slate-500 stroke-[1.5]" />
                  <p className="font-mono text-xs sm:text-sm text-slate-400 font-medium">
                    No forecast data available offline. Connect to download telemetry.
                  </p>
                </div>
              ) : (
                <>
                  <svg width={chartWidth} height={chartHeight} className="block w-full h-full">
                <defs>
                  <linearGradient id="humStrokeGrad72" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="14.8%" stopColor="#f43f5e" />
                    <stop offset="15.2%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>

                  <linearGradient id="humAreaGrad72" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.45" />
                    <stop offset="15%" stopColor="#f43f5e" stopOpacity="0.25" />
                    <stop offset="15.5%" stopColor="#38bdf8" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.04" />
                  </linearGradient>

                  <filter id="humGlow72" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#38bdf8" floodOpacity="0.5" />
                  </filter>
                </defs>

                {humSvgPoints.map((pt, i) => {
                  const colW = plotW / 71;
                  const sunAlt = pt.sunAltitude;

                  if (sunAlt < -18) {
                    return (
                      <rect
                        key={`bg-stripe-hum-${i}`}
                        x={pt.x - colW / 2}
                        y={padTop}
                        width={colW}
                        height={plotH}
                        fill="#020617"
                        opacity={0.85}
                      />
                    );
                  }

                  if (sunAlt <= 0) {
                    return (
                      <rect
                        key={`bg-stripe-hum-${i}`}
                        x={pt.x - colW / 2}
                        y={padTop}
                        width={colW}
                        height={plotH}
                        fill="#1e1b4b"
                        opacity={0.35}
                      />
                    );
                  }

                  return (
                    <rect
                      key={`bg-stripe-hum-${i}`}
                      x={pt.x - colW / 2}
                      y={padTop}
                      width={colW}
                      height={plotH}
                      fill="transparent"
                    />
                  );
                })}

                {[100, 80, 50, 20].map((humVal) => {
                  const y = getYHum(humVal);
                  return (
                    <g key={`grid-hum-y-${humVal}`}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={padLeft + plotW}
                        y2={y}
                        stroke="rgba(255, 255, 255, 0.06)"
                        strokeWidth="1"
                      />
                      {humVal !== 80 && (
                        <text
                          x={padLeft - 6}
                          y={y + 3.5}
                          textAnchor="end"
                          fill="rgba(255, 255, 255, 0.35)"
                          fontSize="8.5"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          %{humVal}
                        </text>
                      )}
                    </g>
                  );
                })}

                <line
                  x1={padLeft}
                  y1={getYHum(85)}
                  x2={padLeft + plotW}
                  y2={getYHum(85)}
                  stroke="rgba(244, 63, 94, 0.65)"
                  strokeDasharray="4 4"
                  strokeWidth="1.2"
                />
                <text
                  x={padLeft - 6}
                  y={getYHum(85) + 3.5}
                  textAnchor="end"
                  fill="#fb7185"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  %85
                </text>
                <text
                  x={padLeft + plotW + 6}
                  y={getYHum(85) + 3.5}
                  fill="#fb7185"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  %85
                </text>

                {humSvgPoints.map((pt, i) => {
                  if (i % 3 !== 0) return null;
                  const tz = currentLocation.timeZone;
                  const labelHour = siteHour(pt.time, tz);
                  const timeString = `${String(labelHour).padStart(2, '0')}:00`;
                  const isMidnight = labelHour === 0;
                  const pSite = siteParts(pt.time, tz);
                  const dayName = `${pSite.day} ${MONTHS_SHORT_EN[pSite.month - 1]}`;

                  return (
                    <g key={`x-guide-hum-${i}`}>
                      <line
                        x1={pt.x}
                        y1={padTop}
                        x2={pt.x}
                        y2={padTop + plotH}
                        stroke={isMidnight ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)'}
                        strokeDasharray={isMidnight ? '4 3' : '2 3'}
                        strokeWidth={isMidnight ? 1.5 : 1}
                        opacity={isMidnight ? 0.8 : undefined}
                      />
                      <text
                        x={pt.x}
                        y={chartHeight - padBottom + 13}
                        textAnchor="middle"
                        fill={isMidnight ? '#38bdf8' : 'rgba(255, 255, 255, 0.6)'}
                        fontSize="9"
                        fontWeight={isMidnight ? 'bold' : 'normal'}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {timeString}
                      </text>
                      {isMidnight && (
                        <text
                          x={pt.x}
                          y={chartHeight - padBottom + 25}
                          textAnchor="middle"
                          fill="#38bdf8"
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                          className="drop-shadow-[0_0_6px_rgba(56,189,248,0.7)]"
                        >
                          {dayName}
                        </text>
                      )}
                    </g>
                  );
                })}

                {isHumModelBoundary ? (
                  <g>
                    <line
                      x1={humModelBoundaryX}
                      y1={padTop}
                      x2={humModelBoundaryX}
                      y2={padTop + plotH}
                      stroke="rgba(244, 63, 94, 0.8)"
                      strokeDasharray="3 3"
                      strokeWidth="1.5"
                    />
                    <text
                      x={humModelBoundaryX - 6}
                      y={padTop + 18}
                      textAnchor="end"
                      fill="#fb7185"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      Model Limit
                    </text>
                  </g>
                ) : (
                  <g>
                    <line
                      x1={padLeft + plotW}
                      y1={padTop}
                      x2={padLeft + plotW}
                      y2={padTop + plotH}
                      stroke="rgba(255, 255, 255, 0.15)"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft + plotW - 6}
                      y={padTop + 14}
                      textAnchor="end"
                      fill="rgba(255, 255, 255, 0.35)"
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      72h Limit
                    </text>
                  </g>
                )}

                {humSegments.map((seg, idx) => (
                  <path key={`hum-area-${idx}`} d={seg.area} fill="url(#humAreaGrad72)" />
                ))}

                {humSegments.map((seg, idx) => (
                  <path
                    key={`hum-path-${idx}`}
                    d={seg.path}
                    fill="none"
                    stroke="url(#humStrokeGrad72)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#humGlow72)"
                  />
                ))}

                {humSinglePoints.map((pt, idx) => (
                  <circle
                    key={`hum-single-pt-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r="2"
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth="0.8"
                  />
                ))}

                {dailyHumBadges.map((badgePt, idx) => {
                  const isNearTop = badgePt.y < padTop + 22;
                  const badgeY = isNearTop ? badgePt.y + 14 : badgePt.y - 18;
                  const circleCy = isNearTop ? -14 : 18;
                  const rectY = isNearTop ? -7 : -8;
                  const textY = isNearTop ? 4 : 3;

                  return (
                    <g key={`daily-hum-badge-${idx}`} transform={`translate(${badgePt.x}, ${badgeY})`}>
                      <circle r="3" cy={circleCy} fill="#38bdf8" stroke="#ffffff" strokeWidth="1" />
                      <rect
                        x="-18"
                        y={rectY}
                        width="36"
                        height="15"
                        rx="3.5"
                        fill={badgePt.humidity >= 85 ? 'rgba(244, 63, 94, 0.9)' : 'rgba(6, 182, 212, 0.9)'}
                        stroke="#ffffff"
                        strokeWidth="0.7"
                      />
                      <text
                        x="0"
                        y={textY}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="8.5"
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        %{badgePt.humidity}
                      </text>
                    </g>
                  );
                })}

                {lockedHumIndex !== null && humSvgPoints[lockedHumIndex] && (
                  <g>
                    <line
                      x1={humSvgPoints[lockedHumIndex].x}
                      y1={padTop}
                      x2={humSvgPoints[lockedHumIndex].x}
                      y2={padTop + plotH}
                      stroke="#ffffff"
                      strokeDasharray="2 2"
                      strokeWidth="1.2"
                    />
                    {!humSvgPoints[lockedHumIndex].isMissing && (
                      <circle
                        cx={humSvgPoints[lockedHumIndex].x}
                        cy={humSvgPoints[lockedHumIndex].y}
                        r="5"
                        fill="#ffffff"
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                        className="drop-shadow-[0_0_8px_rgba(56,189,248,0.9)]"
                      />
                    )}
                  </g>
                )}
              </svg>

              {lockedHumIndex !== null && humSvgPoints[lockedHumIndex] && (() => {
                const humPt = humSvgPoints[lockedHumIndex];
                const tz = currentLocation.timeZone;
                const isNearRight = humPt.x > chartWidth - 180;
                const isNearLeft = humPt.x < 140;
                const translateX = isNearRight ? '-100%' : isNearLeft ? '0%' : '-50%';
                const leftPos = isNearRight
                  ? Math.min(chartWidth - padRight, humPt.x + 8)
                  : isNearLeft
                  ? Math.max(padLeft, humPt.x - 8)
                  : humPt.x;

                return (
                  <div
                    className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg bg-black/90 backdrop-blur-md border border-cyan-500/40 text-xs font-mono font-bold text-white shadow-xl z-20"
                    style={{
                      left: `${leftPos}px`,
                      top: `${humPt.y < 60 ? humPt.y + 14 : humPt.y - 48}px`,
                      transform: `translateX(${translateX})`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span>Humidity: {humPt.isMissing ? '—' : `%${humPt.humidity}`}</span>
                      <span className="text-slate-500 font-normal">|</span>
                      <span>Dew: {humPt.isDewMissing ? '—' : `${humPt.dewPoint.toFixed(1)}°C`}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] mt-0.5 whitespace-nowrap">
                      <span
                        className={
                          humPt.isDewGapMissing
                            ? 'text-slate-400'
                            : humPt.dewGap < 2
                            ? 'text-rose-400 font-bold'
                            : 'text-cyan-300'
                        }
                      >
                        Depression: {humPt.isDewGapMissing ? '—' : `Δ${humPt.dewGap.toFixed(1)}°C`}
                      </span>
                      <span className="text-slate-500 font-normal">|</span>
                      <span className="text-slate-300">
                        {formatSiteTimeHM(humPt.time, tz)}
                      </span>
                    </div>
                  </div>
                );
              })()}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 3. 3-TIER CLOUD MATRIX STRIP (id="card-cloud-chart") */}
        <div
          id="card-cloud-chart"
          className="scroll-mt-3 rounded-2xl border border-white/10 bg-[var(--theme-card)]/90 overflow-hidden shadow-xl select-none"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 select-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold font-mono uppercase tracking-wider text-sky-400 min-w-0">
              <Layers className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate">3-TIER CLOUD MATRIX STRIP (72h)</span>
            </div>
            <div className="text-[10px] font-mono flex items-center gap-2.5 text-slate-300">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-[#38bdf8]" /> High
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-[#06b6d4]" /> Mid
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-[#818cf8]" /> Low
              </span>
            </div>
          </div>

          <div
            ref={cloudScrollContainerRef}
            onMouseDown={handleCloudMouseDown}
            onMouseMove={handleCloudMouseMove}
            onMouseUp={handleCloudMouseUpOrLeave}
            onMouseLeave={handleCloudMouseUpOrLeave}
            className="p-2 sm:p-3 pb-1 overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing custom-scrollbar"
          >
            <div
              onClick={handleCloudCanvasClick}
              className="min-w-[850px] relative"
              style={{ width: `${chartWidth}px`, height: '220px' }}
            >
              {dynamic72Points.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 space-y-2 select-none">
                  <CloudOff className="w-8 h-8 text-slate-500 stroke-[1.5]" />
                  <p className="font-mono text-xs sm:text-sm text-slate-400 font-medium">
                    No forecast data available offline. Connect to download telemetry.
                  </p>
                </div>
              ) : (
                <>
                  <svg width={chartWidth} height={220} className="block w-full h-full">
                <defs>
                  <pattern
                    id="cloudHatchPattern"
                    width="6"
                    height="6"
                    patternTransform="rotate(45 0 0)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(148, 163, 184, 0.45)" strokeWidth="1.5" />
                  </pattern>
                </defs>
                {/* Night / Twilight Background Strips */}
                {dynamic72Points.map((pt, i) => {
                  const colW = plotW / Math.max(1, dynamic72Points.length - 1);
                  const x = padLeft + (i / Math.max(1, dynamic72Points.length - 1)) * plotW;
                  const sunAlt = pt.sunAltitude ?? (pt.isAstroDark ? -25 : 10);

                  if (sunAlt < -18) {
                    return (
                      <rect
                        key={`cloud-bg-${i}`}
                        x={x - colW / 2}
                        y={padTop}
                        width={colW}
                        height={160}
                        fill="#020617"
                        opacity={0.85}
                      />
                    );
                  }
                  if (sunAlt <= 0) {
                    return (
                      <rect
                        key={`cloud-bg-${i}`}
                        x={x - colW / 2}
                        y={padTop}
                        width={colW}
                        height={160}
                        fill="#1e1b4b"
                        opacity={0.35}
                      />
                    );
                  }
                  return null;
                })}

                {/* 3 Tier Row Backgrounds and Labels */}
                {[
                  { label: 'HIGH', y: padTop + 5, color: '#38bdf8' },
                  { label: 'MID', y: padTop + 55, color: '#06b6d4' },
                  { label: 'LOW', y: padTop + 105, color: '#818cf8' },
                ].map((row, idx) => (
                  <g key={`cloud-row-lbl-${idx}`}>
                    <text
                      x={padLeft - 6}
                      y={row.y + 24}
                      textAnchor="end"
                      fill={row.color}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {row.label}
                    </text>
                    <line
                      x1={padLeft}
                      y1={row.y + 44}
                      x2={padLeft + plotW}
                      y2={row.y + 44}
                      stroke="rgba(255, 255, 255, 0.08)"
                      strokeWidth="1"
                    />
                  </g>
                ))}

                {/* Cloud Matrix Cells */}
                {dynamic72Points.map((pt, i) => {
                  const colW = Math.max(8, plotW / Math.max(1, dynamic72Points.length - 1));
                  const x = padLeft + (i / Math.max(1, dynamic72Points.length - 1)) * plotW - colW / 2;
                  const isHighMissing = isFieldMissing(pt, 'cloud') || pt.cloudCoverHigh === null;
                  const isMidMissing = isFieldMissing(pt, 'cloud') || pt.cloudCoverMid === null;
                  const isLowMissing = isFieldMissing(pt, 'cloud') || pt.cloudCoverLow === null;

                  const cHigh = Math.min(100, pt.cloudCoverHigh ?? 0);
                  const cMid = Math.min(100, pt.cloudCoverMid ?? 0);
                  const cLow = Math.min(100, pt.cloudCoverLow ?? 0);

                  const opHigh = Math.max(0.08, cHigh / 100);
                  const opMid = Math.max(0.08, cMid / 100);
                  const opLow = Math.max(0.08, cLow / 100);

                  return (
                    <g key={`matrix-col-${i}`}>
                      {/* High Tier Cell */}
                      <rect
                        x={x + 1}
                        y={padTop + 5}
                        width={colW - 2}
                        height={38}
                        rx="2"
                        fill={isHighMissing ? 'url(#cloudHatchPattern)' : '#38bdf8'}
                        opacity={isHighMissing ? 0.7 : opHigh}
                      >
                        {isHighMissing && <title>No Data</title>}
                      </rect>
                      {/* Mid Tier Cell */}
                      <rect
                        x={x + 1}
                        y={padTop + 55}
                        width={colW - 2}
                        height={38}
                        rx="2"
                        fill={isMidMissing ? 'url(#cloudHatchPattern)' : '#06b6d4'}
                        opacity={isMidMissing ? 0.7 : opMid}
                      >
                        {isMidMissing && <title>No Data</title>}
                      </rect>
                      {/* Low Tier Cell */}
                      <rect
                        x={x + 1}
                        y={padTop + 105}
                        width={colW - 2}
                        height={38}
                        rx="2"
                        fill={isLowMissing ? 'url(#cloudHatchPattern)' : '#818cf8'}
                        opacity={isLowMissing ? 0.7 : opLow}
                      >
                        {isLowMissing && <title>No Data</title>}
                      </rect>
                    </g>
                  );
                })}

                {/* Time Axis and Guides */}
                {dynamic72Points.map((pt, i) => {
                  if (i % 3 !== 0) return null;
                  const tz = currentLocation.timeZone;
                  const labelHour = siteHour(pt.time, tz);
                  const timeString = `${String(labelHour).padStart(2, '0')}:00`;
                  const isMidnight = labelHour === 0;
                  const x = padLeft + (i / Math.max(1, dynamic72Points.length - 1)) * plotW;
                  const pSite = siteParts(pt.time, tz);
                  const dayName = `${pSite.day} ${MONTHS_SHORT_EN[pSite.month - 1]}`;

                  return (
                    <g key={`cloud-x-guide-${i}`}>
                      <line
                        x1={x}
                        y1={padTop}
                        x2={x}
                        y2={padTop + 155}
                        stroke={isMidnight ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)'}
                        strokeDasharray={isMidnight ? '4 3' : '2 3'}
                        strokeWidth={isMidnight ? 1.5 : 1}
                      />
                      <text
                        x={x}
                        y={180}
                        textAnchor="middle"
                        fill={isMidnight ? '#38bdf8' : 'rgba(255, 255, 255, 0.6)'}
                        fontSize="9"
                        fontWeight={isMidnight ? 'bold' : 'normal'}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {timeString}
                      </text>
                      {isMidnight && (
                        <text
                          x={x}
                          y={194}
                          textAnchor="middle"
                          fill="#38bdf8"
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {dayName}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Scrubber indicator */}
                {lockedCloudIndex !== null && dynamic72Points[lockedCloudIndex] && (() => {
                  const x = padLeft + (lockedCloudIndex / Math.max(1, dynamic72Points.length - 1)) * plotW;
                  return (
                    <g>
                      <line
                        x1={x}
                        y1={padTop}
                        x2={x}
                        y2={padTop + 155}
                        stroke="#ffffff"
                        strokeDasharray="2 2"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })()}
              </svg>

              {/* Scrubber Tooltip */}
              {lockedCloudIndex !== null && dynamic72Points[lockedCloudIndex] && (() => {
                const pt = dynamic72Points[lockedCloudIndex];
                const tz = currentLocation.timeZone;
                const x = padLeft + (lockedCloudIndex / Math.max(1, dynamic72Points.length - 1)) * plotW;
                const isNearRight = x > chartWidth - 180;
                const isNearLeft = x < 140;
                const translateX = isNearRight ? '-100%' : isNearLeft ? '0%' : '-50%';
                const leftPos = isNearRight ? Math.min(chartWidth - padRight, x + 8) : isNearLeft ? Math.max(padLeft, x - 8) : x;

                const isMissing = isFieldMissing(pt, 'cloud') || pt.cloudCover === null;

                if (isMissing) {
                  return (
                    <div
                      className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg bg-black/95 backdrop-blur-md border border-amber-500/40 text-xs font-mono font-bold text-white shadow-xl z-20 space-y-0.5 whitespace-nowrap"
                      style={{
                        left: `${leftPos}px`,
                        top: '15px',
                        transform: `translateX(${translateX})`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 text-slate-300 border-b border-white/10 pb-0.5">
                        <span>Time: {formatSiteTimeHM(pt.time, tz)}</span>
                        <span className="text-amber-400 font-bold">No Data</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>High: --</span>
                        <span className="text-slate-600">|</span>
                        <span>Mid: --</span>
                        <span className="text-slate-600">|</span>
                        <span>Low: --</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg bg-black/95 backdrop-blur-md border border-sky-500/40 text-xs font-mono font-bold text-white shadow-xl z-20 space-y-0.5 whitespace-nowrap"
                    style={{
                      left: `${leftPos}px`,
                      top: '15px',
                      transform: `translateX(${translateX})`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 text-slate-300 border-b border-white/10 pb-0.5">
                      <span>Time: {formatSiteTimeHM(pt.time, tz)}</span>
                      <span className="text-white font-bold">Total: %{pt.cloudCover}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-[#38bdf8]">High: {pt.cloudCoverHigh === null ? '--' : `%${pt.cloudCoverHigh}`}</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-[#06b6d4]">Mid: {pt.cloudCoverMid === null ? '--' : `%${pt.cloudCoverMid}`}</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-[#818cf8]">Low: {pt.cloudCoverLow === null ? '--' : `%${pt.cloudCoverLow}`}</span>
                    </div>
                  </div>
                );
              })()}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 4. WIND & GUST STABILITY CHART (id="card-wind-chart") */}
        <div
          id="card-wind-chart"
          className="scroll-mt-3 rounded-2xl border border-white/10 bg-[var(--theme-card)]/90 overflow-hidden shadow-xl select-none"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 select-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold font-mono uppercase tracking-wider text-teal-400 min-w-0">
              <Wind className="w-4 h-4 text-teal-400 shrink-0" />
              <span className="truncate">WIND & GUST STABILITY (72h)</span>
            </div>
            <div className="text-[10px] font-mono flex items-center gap-3">
              <span className="flex items-center gap-1 text-teal-300">
                <span className="w-2.5 h-0.5 bg-teal-400 inline-block" /> Speed
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-0.5 bg-rose-400 inline-block" /> Gust
              </span>
            </div>
          </div>

          <div
            ref={windScrollContainerRef}
            onMouseDown={handleWindMouseDown}
            onMouseMove={handleWindMouseMove}
            onMouseUp={handleWindMouseUpOrLeave}
            onMouseLeave={handleWindMouseUpOrLeave}
            className="p-2 sm:p-3 pb-1 overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing custom-scrollbar"
          >
            <div
              onClick={handleWindCanvasClick}
              className="min-w-[850px] relative"
              style={{ width: `${chartWidth}px`, height: `${chartHeight}px` }}
            >
              {dynamic72Points.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 space-y-2 select-none">
                  <CloudOff className="w-8 h-8 text-slate-500 stroke-[1.5]" />
                  <p className="font-mono text-xs sm:text-sm text-slate-400 font-medium">
                    No forecast data available offline. Connect to download telemetry.
                  </p>
                </div>
              ) : (
                <>
                  <svg width={chartWidth} height={chartHeight} className="block w-full h-full">
                <defs>
                  <linearGradient id="windAreaGrad72" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity="0.04" />
                  </linearGradient>
                </defs>

                {/* Night Background Strips */}
                {windPoints.map((pt, i) => {
                  const colW = plotW / 71;
                  const sunAlt = pt.sunAltitude;

                  if (sunAlt < -18) {
                    return (
                      <rect
                        key={`bg-stripe-wind-${i}`}
                        x={pt.x - colW / 2}
                        y={padTop}
                        width={colW}
                        height={plotH}
                        fill="#020617"
                        opacity={0.85}
                      />
                    );
                  }

                  if (sunAlt <= 0) {
                    return (
                      <rect
                        key={`bg-stripe-wind-${i}`}
                        x={pt.x - colW / 2}
                        y={padTop}
                        width={colW}
                        height={plotH}
                        fill="#1e1b4b"
                        opacity={0.35}
                      />
                    );
                  }

                  return null;
                })}

                {/* Y Axis Guides */}
                {[50, 25, 10].map((wVal) => {
                  const y = getYWind(wVal);
                  const is10 = wVal === 10;
                  const is25 = wVal === 25;
                  return (
                    <g key={`grid-wind-y-${wVal}`}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={padLeft + plotW}
                        y2={y}
                        stroke={is25 ? 'rgba(244, 63, 94, 0.5)' : is10 ? 'rgba(52, 211, 153, 0.4)' : 'rgba(255, 255, 255, 0.06)'}
                        strokeDasharray={is25 || is10 ? '4 4' : undefined}
                        strokeWidth={is25 || is10 ? '1.2' : '1'}
                      />
                      <text
                        x={padLeft - 6}
                        y={y + 3.5}
                        textAnchor="end"
                        fill={is25 ? '#fb7185' : is10 ? '#34d399' : 'rgba(255, 255, 255, 0.35)'}
                        fontSize="8.5"
                        fontWeight={is25 || is10 ? 'bold' : 'normal'}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {speedVal(wVal)}
                      </text>
                    </g>
                  );
                })}

                {/* X Axis Guides */}
                {windPoints.map((pt, i) => {
                  if (i % 3 !== 0) return null;
                  const tz = currentLocation.timeZone;
                  const labelHour = siteHour(pt.time, tz);
                  const timeString = `${String(labelHour).padStart(2, '0')}:00`;
                  const isMidnight = labelHour === 0;
                  const pSite = siteParts(pt.time, tz);
                  const dayName = `${pSite.day} ${MONTHS_SHORT_EN[pSite.month - 1]}`;

                  return (
                    <g key={`x-guide-wind-${i}`}>
                      <line
                        x1={pt.x}
                        y1={padTop}
                        x2={pt.x}
                        y2={padTop + plotH}
                        stroke={isMidnight ? '#14b8a6' : 'rgba(255, 255, 255, 0.05)'}
                        strokeDasharray={isMidnight ? '4 3' : '2 3'}
                        strokeWidth={isMidnight ? 1.5 : 1}
                      />
                      <text
                        x={pt.x}
                        y={chartHeight - padBottom + 13}
                        textAnchor="middle"
                        fill={isMidnight ? '#14b8a6' : 'rgba(255, 255, 255, 0.6)'}
                        fontSize="9"
                        fontWeight={isMidnight ? 'bold' : 'normal'}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {timeString}
                      </text>
                      {isMidnight && (
                        <text
                          x={pt.x}
                          y={chartHeight - padBottom + 25}
                          textAnchor="middle"
                          fill="#14b8a6"
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {dayName}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Wind Area Fill */}
                {windSegments.map((seg, idx) => (
                  <path key={`wind-area-${idx}`} d={seg.area} fill="url(#windAreaGrad72)" />
                ))}

                {/* Gust Spline Path (Red/Rose) */}
                {gustSegments.map((seg, idx) => (
                  <path
                    key={`gust-path-${idx}`}
                    d={seg.path}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="1.8"
                    strokeDasharray="4 2"
                    strokeLinecap="round"
                  />
                ))}

                {/* Wind Speed Spline Path (Teal) */}
                {windSegments.map((seg, idx) => (
                  <path
                    key={`wind-path-${idx}`}
                    d={seg.path}
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                ))}

                {/* Scrubber Line */}
                {lockedWindIndex !== null && windPoints[lockedWindIndex] && (
                  <g>
                    <line
                      x1={windPoints[lockedWindIndex].x}
                      y1={padTop}
                      x2={windPoints[lockedWindIndex].x}
                      y2={padTop + plotH}
                      stroke="#ffffff"
                      strokeDasharray="2 2"
                      strokeWidth="1.2"
                    />
                    <circle
                      cx={windPoints[lockedWindIndex].x}
                      cy={windPoints[lockedWindIndex].ySpeed}
                      r="4.5"
                      fill="#ffffff"
                      stroke="#14b8a6"
                      strokeWidth="2"
                    />
                    <circle
                      cx={windPoints[lockedWindIndex].x}
                      cy={windPoints[lockedWindIndex].yGust}
                      r="4"
                      fill="#ffffff"
                      stroke="#f43f5e"
                      strokeWidth="2"
                    />
                  </g>
                )}
              </svg>

              {/* Scrubber Tooltip */}
              {lockedWindIndex !== null && windPoints[lockedWindIndex] && (() => {
                const pt = windPoints[lockedWindIndex];
                const tz = currentLocation.timeZone;
                const isNearRight = pt.x > chartWidth - 170;
                const isNearLeft = pt.x < 130;
                const translateX = isNearRight ? '-100%' : isNearLeft ? '0%' : '-50%';
                const leftPos = isNearRight ? Math.min(chartWidth - padRight, pt.x + 8) : isNearLeft ? Math.max(padLeft, pt.x - 8) : pt.x;

                return (
                  <div
                    className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg bg-black/95 backdrop-blur-md border border-teal-500/40 text-xs font-mono font-bold text-white shadow-xl z-20 whitespace-nowrap"
                    style={{
                      left: `${leftPos}px`,
                      top: `${pt.ySpeed < 60 ? pt.ySpeed + 14 : pt.ySpeed - 46}px`,
                      transform: `translateX(${translateX})`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-teal-300">Speed: {speedVal(pt.windSpeed)} {speedUnit}</span>
                      <span className="text-slate-500 font-normal">|</span>
                      <span className="text-rose-400">Gust: {speedVal(pt.windGust)} {speedUnit}</span>
                    </div>
                    <div className="text-[10.5px] text-slate-300 mt-0.5 flex items-center justify-between">
                      <span className="text-amber-300">Dir: {pt.windDirectionCompass || 'N'}</span>
                      <span className="text-slate-400">{formatSiteTimeHM(pt.time, tz)}</span>
                    </div>
                  </div>
                );
              })()}
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
