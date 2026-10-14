import { EphemerisKPIs, SolarEphemerisDay, TimelineSegment } from '../types';
import {
  siteNoon,
  siteDateKey,
  weekdayOfDateKey,
  parseDateKey,
  addDaysToDateKey,
  formatSiteTimeHM,
  toDateKey,
  isValidTimeZone,
} from './siteTime';
import { MONTHS_SHORT_EN, WEEKDAYS_SHORT_EN } from './calendarNames';
import { findLunarCrossingBisection } from './moonEphemeris';
import { degToCompass } from './weatherService';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function getTerrainAltitude(azimuthDeg: number, profile?: number[]): number {
  if (!profile || profile.length !== 8) return 0;
  const normAz = ((azimuthDeg % 360) + 360) % 360;
  const indexFloat = normAz / 45;
  const i0 = Math.floor(indexFloat) % 8;
  const i1 = (i0 + 1) % 8;
  const frac = indexFloat - Math.floor(indexFloat);
  const alt = profile[i0] * (1 - frac) + profile[i1] * frac;
  return Math.max(0, alt);
}

// Bellek İçi Efemeris Önbelleği (Deterministik Memoization Cache)
const ephemerisCache = new Map<string, SolarEphemerisDay>();

function toJulianDay(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

function normalizeDegrees(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function normalizeHours(h: number): number {
  let hr = h % 24;
  if (hr < 0) hr += 24;
  return hr;
}

export function getSolarCoordinates(date: Date) {
  const jd = toJulianDay(date);
  const n = jd - 2451545.0; // Days since J2000.0

  const M = normalizeDegrees(357.5291 + 0.98560028 * n);
  const Mrad = M * DEG2RAD;

  const L = normalizeDegrees(280.46646 + 0.98564736 * n);

  const C =
    (1.9146 - 0.00005 * (n / 36525)) * Math.sin(Mrad) +
    (0.019993 - 0.000101 * (n / 36525)) * Math.sin(2 * Mrad) +
    0.000289 * Math.sin(3 * Mrad);

  const lambda = normalizeDegrees(L + C);
  const lambdaRad = lambda * DEG2RAD;

  const eps = 23.43929 - 0.0000004 * n;
  const epsRad = eps * DEG2RAD;

  const sinDec = Math.sin(epsRad) * Math.sin(lambdaRad);
  const dec = Math.asin(sinDec);
  const decDeg = dec * RAD2DEG;

  const y = Math.cos(epsRad) * Math.sin(lambdaRad);
  const x = Math.cos(lambdaRad);
  let ra = Math.atan2(y, x) * RAD2DEG;
  ra = normalizeDegrees(ra) / 15; // in hours

  return { ra, dec: decDeg, decRad: dec };
}

export function getLunarCoordinates(date: Date) {
  const jd = toJulianDay(date);
  const T = (jd - 2451545.0) / 36525.0;

  const L0 = normalizeDegrees(218.3164477 + 481267.88123421 * T);
  const D = normalizeDegrees(297.8501921 + 445267.11422 * T);
  const M = normalizeDegrees(357.5291092 + 35999.0502909 * T);
  const Mprime = normalizeDegrees(134.9633964 + 477198.8675055 * T);
  const F = normalizeDegrees(93.272095 + 483202.0175233 * T);

  const Drad = D * DEG2RAD;
  const Mrad = M * DEG2RAD;
  const Mprad = Mprime * DEG2RAD;
  const Frad = F * DEG2RAD;

  const lPerturb =
    6.288774 * Math.sin(Mprad) +
    1.274027 * Math.sin(2 * Drad - Mprad) +
    0.658314 * Math.sin(2 * Drad) +
    0.213618 * Math.sin(2 * Mprad) -
    0.185116 * Math.sin(Mrad) -
    0.114332 * Math.sin(2 * Frad);

  const lambda = normalizeDegrees(L0 + lPerturb);
  const lambdaRad = lambda * DEG2RAD;

  const bPerturb =
    5.128154 * Math.sin(Frad) +
    0.280606 * Math.sin(Mprad + Frad) +
    0.277693 * Math.sin(Mprad - Frad) +
    0.173237 * Math.sin(2 * Drad - Frad);

  const beta = bPerturb;
  const betaRad = beta * DEG2RAD;

  const eps = 23.43929 - 0.0130042 * T;
  const epsRad = eps * DEG2RAD;

  const sinDec =
    Math.sin(betaRad) * Math.cos(epsRad) +
    Math.cos(betaRad) * Math.sin(epsRad) * Math.sin(lambdaRad);
  const decRad = Math.asin(sinDec);
  const dec = decRad * RAD2DEG;

  const y =
    Math.sin(lambdaRad) * Math.cos(epsRad) - Math.tan(betaRad) * Math.sin(epsRad);
  const x = Math.cos(lambdaRad);
  let ra = Math.atan2(y, x) * RAD2DEG;
  ra = normalizeDegrees(ra) / 15;

  const sun = getSolarCoordinates(date);
  const sunRaDeg = sun.ra * 15;
  const moonRaDeg = ra * 15;

  const cosPsi =
    Math.sin(sun.dec * DEG2RAD) * Math.sin(decRad) +
    Math.cos(sun.dec * DEG2RAD) *
      Math.cos(decRad) *
      Math.cos((sunRaDeg - moonRaDeg) * DEG2RAD);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)));

  let elongationDiff = normalizeDegrees(moonRaDeg - sunRaDeg);
  const phaseCycle = elongationDiff / 360;

  const illuminatedFraction = (1 + Math.cos(Math.PI - psi)) / 2;
  const phaseName = getMoonPhaseName(phaseCycle);

  return {
    ra,
    dec,
    decRad,
    phase: phaseCycle,
    phaseName,
    illumination: Math.round(illuminatedFraction * 100),
  };
}

export function getMoonPhaseName(phaseCycle: number): string {
  const p = ((phaseCycle % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return 'New Moon';
  if (p < 0.22) return 'Waxing Crescent';
  if (p < 0.28) return 'First Quarter';
  if (p < 0.47) return 'Waxing Gibbous';
  if (p < 0.53) return 'Full Moon';
  if (p < 0.72) return 'Waning Gibbous';
  if (p < 0.78) return 'Last Quarter';
  return 'Waning Crescent';
}

function getGMST(date: Date): number {
  const jd = toJulianDay(date);
  const d = jd - 2451545.0;
  let gmst = 18.697374558 + 24.06570982441908 * d;
  return normalizeHours(gmst);
}

export function getLST(date: Date, longitude: number): number {
  const gmst = getGMST(date);
  return normalizeHours(gmst + longitude / 15);
}

export function getHorizontalCoordinates(
  date: Date,
  raHours: number,
  decDeg: number,
  latDeg: number,
  lngDeg: number
) {
  const lst = getLST(date, lngDeg);
  const haHours = normalizeHours(lst - raHours);
  const haRad = haHours * 15 * DEG2RAD;
  const latRad = latDeg * DEG2RAD;
  const decRad = decDeg * DEG2RAD;

  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const altDeg = altRad * RAD2DEG;

  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * Math.sin(altRad)) /
    (Math.cos(latRad) * Math.cos(altRad));
  let azRad = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(haRad) > 0) {
    azRad = 2 * Math.PI - azRad;
  }
  const azDeg = azRad * RAD2DEG;

  return { altitude: altDeg, azimuth: azDeg };
}

export const HORIZON_DIP_COEFF_DEG = 0.0293;

export function horizonDipDegrees(elevationMeters: number): number {
  return HORIZON_DIP_COEFF_DEG * Math.sqrt(Math.max(0, elevationMeters));
}

export function calculateNightEphemeris(
  dayDate: Date | string,
  latitude: number,
  longitude: number,
  elevationMeters: number,
  timeZone: string,
  horizonProfile?: number[],
  useDipOrOptions: boolean | { useDip?: boolean } = true
): SolarEphemerisDay {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid time zone: ${timeZone}`);
  }
  const useDip =
    typeof useDipOrOptions === 'boolean'
      ? useDipOrOptions
      : (useDipOrOptions?.useDip ?? true);

  const targetDateKey =
    typeof dayDate === 'string'
      ? dayDate
      : siteDateKey(dayDate, timeZone);

  const resolvedDate =
    typeof dayDate === 'string'
      ? (() => {
          const { year, month, day } = parseDateKey(dayDate);
          return new Date(year, month - 1, day);
        })()
      : dayDate;

  const horizonKey =
    horizonProfile && horizonProfile.some((v) => v > 0)
      ? horizonProfile.map((v) => v.toFixed(1)).join(',')
      : 'flat';
  const cacheKey = `${targetDateKey}_${latitude.toFixed(4)}_${longitude.toFixed(4)}_${elevationMeters}_${timeZone}_${horizonKey}_${useDip ? 'dip' : 'nodip'}`;
  const cached = ephemerisCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const dip = useDip ? horizonDipDegrees(elevationMeters) : 0;
  const standardSunHorizon = -0.833;
  const civilThreshold = -6.0;
  const nauticalThreshold = -12.0;
  const astroThreshold = -18.0;

  const startOfPeriod = siteNoon(targetDateKey, timeZone);
  const endOfPeriod = new Date(startOfPeriod.getTime() + 24 * 3600 * 1000);

  const stepsCount = 49;
  const stepMs = (24 * 3600 * 1000) / (stepsCount - 1);
  const timeline: TimelineSegment[] = [];
  let darkMins = 0;

  for (let i = 0; i < stepsCount; i++) {
    const time = new Date(startOfPeriod.getTime() + i * stepMs);
    const hourFraction = (i * 24) / (stepsCount - 1);

    const sunCoords = getSolarCoordinates(time);
    const sunHoriz = getHorizontalCoordinates(
      time,
      sunCoords.ra,
      sunCoords.dec,
      latitude,
      longitude
    );

    const moonCoords = getLunarCoordinates(time);
    const moonHoriz = getHorizontalCoordinates(
      time,
      moonCoords.ra,
      moonCoords.dec,
      latitude,
      longitude
    );

    const sunAlt = sunHoriz.altitude;
    const moonAlt = moonHoriz.altitude;

    const sTerrain = getTerrainAltitude(sunHoriz.azimuth, horizonProfile);
    const effectiveSunThreshold = sTerrain > 0 ? -0.833 + sTerrain : -0.833 - dip;
    const isSunDown = sunAlt < effectiveSunThreshold;

    let twilightState: TimelineSegment['twilightState'] = 'day';
    if (isSunDown) {
      if (sunAlt >= civilThreshold) {
        twilightState = 'civil';
      } else if (sunAlt >= nauticalThreshold) {
        twilightState = 'nautical';
      } else if (sunAlt >= astroThreshold) {
        twilightState = 'astro';
      } else {
        twilightState = 'dark';
      }
    }

    const mTerrain = getTerrainAltitude(moonHoriz.azimuth, horizonProfile);
    const effectiveMoonThreshold = mTerrain > 0 ? mTerrain : -dip;
    const isMoonUp = moonAlt > effectiveMoonThreshold;
    const isZifiriDark = sunAlt <= astroThreshold && (!isMoonUp || moonCoords.illumination < 5);

    timeline.push({
      time,
      hourFraction,
      sunAltitude: Number(sunAlt.toFixed(2)),
      moonAltitude: Number(moonAlt.toFixed(2)),
      isSunDown,
      twilightState,
      isMoonUp,
      isZifiriDark,
    });
  }

  const sunset = findSolarCrossing(
    startOfPeriod,
    endOfPeriod,
    standardSunHorizon,
    'setting',
    latitude,
    longitude,
    horizonProfile,
    dip
  );
  const civilDusk = findSolarCrossing(
    startOfPeriod,
    endOfPeriod,
    civilThreshold,
    'setting',
    latitude,
    longitude,
    horizonProfile,
    0
  );
  const nauticalDusk = findSolarCrossing(
    startOfPeriod,
    endOfPeriod,
    nauticalThreshold,
    'setting',
    latitude,
    longitude,
    horizonProfile,
    0
  );
  const astroDusk = findSolarCrossing(
    startOfPeriod,
    endOfPeriod,
    astroThreshold,
    'setting',
    latitude,
    longitude,
    horizonProfile,
    0
  );
  const astroDawn = findSolarCrossing(
    startOfPeriod,
    endOfPeriod,
    astroThreshold,
    'rising',
    latitude,
    longitude,
    horizonProfile,
    0
  );
  const nauticalDawn = findSolarCrossing(
    startOfPeriod,
    endOfPeriod,
    nauticalThreshold,
    'rising',
    latitude,
    longitude,
    horizonProfile,
    0
  );
  const civilDawn = findSolarCrossing(
    startOfPeriod,
    endOfPeriod,
    civilThreshold,
    'rising',
    latitude,
    longitude,
    horizonProfile,
    0
  );
  const sunrise = findSolarCrossing(
    startOfPeriod,
    endOfPeriod,
    standardSunHorizon,
    'rising',
    latitude,
    longitude,
    horizonProfile,
    dip
  );

  const midnightTime = new Date(startOfPeriod.getTime() + 12 * 3600 * 1000);
  const midnightMoon = getLunarCoordinates(midnightTime);

  const moonrise = findLunarCrossing(
    startOfPeriod,
    endOfPeriod,
    0,
    'rising',
    latitude,
    longitude,
    horizonProfile,
    0
  );
  const moonset = findLunarCrossing(
    startOfPeriod,
    endOfPeriod,
    0,
    'setting',
    latitude,
    longitude,
    horizonProfile,
    0
  );

  if (astroDusk && astroDawn && astroDawn.getTime() > astroDusk.getTime()) {
    darkMins = Math.round((astroDawn.getTime() - astroDusk.getTime()) / 60000);
  } else {
    darkMins = 0;
  }

  // Astronomik karanlık [astroDusk, astroDawn] aralığı ile Ay'ın gökyüzünde olmadığı aralığın kesişimi
  let exactMoonlessMins = 0;
  let zifiriStart: Date | undefined;
  let zifiriEnd: Date | undefined;

  if (astroDusk && astroDawn && astroDawn.getTime() > astroDusk.getTime()) {
    const nightStartMs = astroDusk.getTime();
    const nightEndMs = astroDawn.getTime();

    // Geceyi 1'er dakikalık adımlarla tara (Gece boyu ~400-600 dakika, CPU maliyeti <0.2ms)
    let countMins = 0;
    let firstZifiriMs: number | null = null;
    let lastZifiriMs: number | null = null;

    // Ay aydınlanması gece boyunca neredeyse sabittir, gece yarısındaki aydınlanmayı kontrol et
    const isMoonTooBright = midnightMoon.illumination >= 5;

    for (let minuteIdx = 0; minuteIdx < darkMins; minuteIdx++) {
      const tMs = nightStartMs + minuteIdx * 60000;
      const curTime = new Date(tMs);
      let isMoonUp = false;

      if (isMoonTooBright) {
        const mCoords = getLunarCoordinates(curTime);
        const mHoriz = getHorizontalCoordinates(curTime, mCoords.ra, mCoords.dec, latitude, longitude);
        const mTerrain = getTerrainAltitude(mHoriz.azimuth, horizonProfile);
        isMoonUp = mHoriz.altitude > mTerrain;
      }

      if (!isMoonUp) {
        countMins++;
        if (firstZifiriMs === null) firstZifiriMs = tMs;
        lastZifiriMs = tMs;
      }
    }

    exactMoonlessMins = countMins;
    if (firstZifiriMs !== null && lastZifiriMs !== null && countMins >= 15) {
      zifiriStart = new Date(firstZifiriMs);
      zifiriEnd = new Date(lastZifiriMs);
    }
  }

  const efficiency = darkMins > 0 ? Math.min(100, Math.round((exactMoonlessMins / darkMins) * 100)) : 0;

  const dateKey = targetDateKey;
  const { month: pkMonth, day: pkDay } = parseDateKey(targetDateKey);
  const weekday = weekdayOfDateKey(targetDateKey);
  const dayLabel = `${pkDay} ${MONTHS_SHORT_EN[pkMonth - 1]} ${WEEKDAYS_SHORT_EN[weekday]}`;

  let sunriseAzimuthDeg: number | undefined;
  let sunriseCardinal: string | undefined;
  if (sunrise) {
    const sunCoords = getSolarCoordinates(sunrise);
    const sunHoriz = getHorizontalCoordinates(sunrise, sunCoords.ra, sunCoords.dec, latitude, longitude);
    sunriseAzimuthDeg = Math.round(((sunHoriz.azimuth % 360) + 360) % 360) % 360;
    sunriseCardinal = degToCompass(sunriseAzimuthDeg);
  }

  let sunsetAzimuthDeg: number | undefined;
  let sunsetCardinal: string | undefined;
  if (sunset) {
    const sunCoords = getSolarCoordinates(sunset);
    const sunHoriz = getHorizontalCoordinates(sunset, sunCoords.ra, sunCoords.dec, latitude, longitude);
    sunsetAzimuthDeg = Math.round(((sunHoriz.azimuth % 360) + 360) % 360) % 360;
    sunsetCardinal = degToCompass(sunsetAzimuthDeg);
  }

  let moonriseAzimuthDeg: number | undefined;
  let moonriseCardinal: string | undefined;
  if (moonrise) {
    const moonCoords = getLunarCoordinates(moonrise);
    const moonHoriz = getHorizontalCoordinates(moonrise, moonCoords.ra, moonCoords.dec, latitude, longitude);
    moonriseAzimuthDeg = Math.round(((moonHoriz.azimuth % 360) + 360) % 360) % 360;
    moonriseCardinal = degToCompass(moonriseAzimuthDeg);
  }

  let moonsetAzimuthDeg: number | undefined;
  let moonsetCardinal: string | undefined;
  if (moonset) {
    const moonCoords = getLunarCoordinates(moonset);
    const moonHoriz = getHorizontalCoordinates(moonset, moonCoords.ra, moonCoords.dec, latitude, longitude);
    moonsetAzimuthDeg = Math.round(((moonHoriz.azimuth % 360) + 360) % 360) % 360;
    moonsetCardinal = degToCompass(moonsetAzimuthDeg);
  }

  const hasActiveTerrainMask = Boolean(horizonProfile && horizonProfile.some((h) => h > 0));

  const result: SolarEphemerisDay = {
    date: resolvedDate,
    dateKey,
    dayLabel,
    sunset: sunset || null,
    civilDusk: civilDusk || null,
    nauticalDusk: nauticalDusk || null,
    astroDusk: astroDusk || null,
    astroDawn: astroDawn || null,
    nauticalDawn: nauticalDawn || null,
    civilDawn: civilDawn || null,
    sunrise: sunrise || null,
    darkDurationMinutes: Math.max(0, darkMins),
    moonlessDarkMinutes: exactMoonlessMins,
    efficiencyPercent: efficiency,
    moonrise,
    moonset,
    moonPhase: midnightMoon.phase,
    moonPhaseName: midnightMoon.phaseName,
    moonIllumination: midnightMoon.illumination,
    timeline,
    hasZifiriWindow: exactMoonlessMins >= 60,
    bestWindowStart: zifiriStart,
    bestWindowEnd: zifiriEnd,
    sunriseAzimuthDeg,
    sunriseCardinal,
    sunsetAzimuthDeg,
    sunsetCardinal,
    moonriseAzimuthDeg,
    moonriseCardinal,
    moonsetAzimuthDeg,
    moonsetCardinal,
    hasActiveTerrainMask,
  };

  // Bellek şişmesine karşı koruma (2000 kayıt sınırı)
  if (ephemerisCache.size > 2000) {
    let count = 0;
    for (const key of ephemerisCache.keys()) {
      ephemerisCache.delete(key);
      count++;
      if (count >= 500) break;
    }
  }

  ephemerisCache.set(cacheKey, result);
  return result;
}

function findSolarCrossing(
  start: Date,
  end: Date,
  targetAlt: number,
  type: 'rising' | 'setting',
  lat: number,
  lng: number,
  horizonProfile?: number[],
  dip: number = 0
): Date | null {
  const steps = 96;
  const stepMs = (end.getTime() - start.getTime()) / steps;
  let prevAlt = 0;
  let prevThreshold = targetAlt;
  let prevTime = start;

  for (let i = 0; i <= steps; i++) {
    const t = new Date(start.getTime() + i * stepMs);
    const sun = getSolarCoordinates(t);
    const horiz = getHorizontalCoordinates(t, sun.ra, sun.dec, lat, lng);
    const alt = horiz.altitude;

    // Alacakaranlık eşikleri (-6°, -12°, -18°): Geometrik dip ASLA uygulanmaz
    // Optik gün doğumu/batımı (-0.833°): Dağ engeli varsa dip baskılanır, yoksa dip uygulanır
    let effectiveThreshold: number;
    if (targetAlt < -5.0) {
      effectiveThreshold = targetAlt;
    } else {
      const tTerrain = getTerrainAltitude(horiz.azimuth, horizonProfile);
      effectiveThreshold = tTerrain > 0 ? -0.833 + tTerrain : -0.833 - dip;
    }

    if (i > 0) {
      if (type === 'setting' && prevAlt >= prevThreshold && alt < effectiveThreshold) {
        const prevDiff = prevAlt - prevThreshold;
        const curDiff = alt - effectiveThreshold;
        const factor = prevDiff / (prevDiff - curDiff);
        return new Date(prevTime.getTime() + factor * stepMs);
      }
      if (type === 'rising' && prevAlt <= prevThreshold && alt > effectiveThreshold) {
        const prevDiff = prevThreshold - prevAlt;
        const curDiff = effectiveThreshold - alt;
        const factor = prevDiff / (prevDiff - curDiff);
        return new Date(prevTime.getTime() + factor * stepMs);
      }
    }
    prevAlt = alt;
    prevThreshold = effectiveThreshold;
    prevTime = t;
  }
  return null;
}

function findLunarCrossing(
  start: Date,
  end: Date,
  targetAlt: number,
  type: 'rising' | 'setting',
  lat: number,
  lng: number,
  horizonProfile?: number[],
  dip: number = 0
): Date | null {
  return findLunarCrossingBisection(start, end, targetAlt, type, lat, lng, horizonProfile, dip);
}

export {
  findLunarCrossingBisection,
  calculateMoonDayCrossings,
  getMoonEffectiveAltitudeDiff,
} from './moonEphemeris';

export function calculateWindowKPIs(days: SolarEphemerisDay[]): EphemerisKPIs {
  if (days.length === 0) {
    return {
      totalDarkHours: 0,
      dailyAverageHours: 0,
      bestNightLabel: '-',
      bestNightHours: 0,
      efficiencyPercent: 0,
    };
  }

  let totalMoonlessMins = 0;
  let totalDarkMins = 0;
  let bestDay = days[0];
  let maxMoonless = -1;

  for (const day of days) {
    totalMoonlessMins += day.moonlessDarkMinutes;
    totalDarkMins += day.darkDurationMinutes;
    if (day.moonlessDarkMinutes > maxMoonless) {
      maxMoonless = day.moonlessDarkMinutes;
      bestDay = day;
    }
  }

  const totalDarkHours = Number((totalMoonlessMins / 60).toFixed(1));
  const dailyAverageHours = Number((totalMoonlessMins / days.length / 60).toFixed(1));
  const bestNightHours = Number((maxMoonless / 60).toFixed(1));
  const efficiencyPercent =
    totalDarkMins > 0 ? Math.round((totalMoonlessMins / totalDarkMins) * 100) : 0;

  return {
    totalDarkHours,
    dailyAverageHours,
    bestNightLabel: bestDay.dayLabel,
    bestNightHours,
    efficiencyPercent,
  };
}

export function formatTimeHM(date: Date | null, timeZone: string): string {
  if (!date || isNaN(date.getTime())) return '--:--';
  return formatSiteTimeHM(date, timeZone);
}

export function formatMinutesToHM(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
