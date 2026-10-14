import { HourlyWeatherPoint, LocationData, ResolvedSite, MissingField, WeatherKPIs } from '../types';
import { getHorizontalCoordinates, getSolarCoordinates } from './ephemeris';
import { siteHour, siteParts, zonedTimeToInstant } from './siteTime';

export type WeatherSourceType = 'live' | 'cached' | 'fallback';

export interface WeatherFetchResult {
  points: HourlyWeatherPoint[];
  sourceType: WeatherSourceType;
  cacheAgeMinutes: number;
  fetchedAt: number;
  isFallback: boolean;
}

const WEATHER_CACHE_VERSION = 'v5';
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 Dakika
const weatherMemoryCache = new Map<string, { timestamp: number; points: HourlyWeatherPoint[] }>();
const inFlightRequests = new Map<string, Promise<WeatherFetchResult>>();

function isValidNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function parseValidDate(value: unknown): Date | null {
  if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }
  return null;
}

const VALID_MISSING_FIELDS: readonly MissingField[] = [
  'temp',
  'dewPoint',
  'humidity',
  'cloud',
  'wind',
  'precipitation',
  'cloudCover',
];

function isMissingField(value: unknown): value is MissingField {
  if (typeof value !== 'string') return false;
  for (const valid of VALID_MISSING_FIELDS) {
    if (valid === value) return true;
  }
  return false;
}

function validateAndConvertPoint(raw: unknown): HourlyWeatherPoint | null {
  if (!isRecord(raw)) return null;

  const timeDate = parseValidDate(raw.time);
  if (timeDate === null) return null;

  if (
    !isFiniteNumber(raw.temp) ||
    !isFiniteNumber(raw.dewPoint) ||
    !isFiniteNumber(raw.dewGap) ||
    !isFiniteNumber(raw.humidity) ||
    !isFiniteNumber(raw.windSpeed) ||
    !isFiniteNumber(raw.windDirectionDeg) ||
    !isFiniteNumber(raw.sunAltitude)
  ) {
    return null;
  }

  if (
    !isFiniteOrNull(raw.cloudCover) ||
    !isFiniteOrNull(raw.cloudCoverLow) ||
    !isFiniteOrNull(raw.cloudCoverMid) ||
    !isFiniteOrNull(raw.cloudCoverHigh)
  ) {
    return null;
  }

  if (typeof raw.windDirectionCompass !== 'string') return null;
  if (typeof raw.isAstroDark !== 'boolean') return null;
  if (typeof raw.isDangerDew !== 'boolean') return null;

  let precipitationProb: number | undefined;
  if (raw.precipitationProb !== undefined) {
    if (!isFiniteNumber(raw.precipitationProb)) return null;
    precipitationProb = raw.precipitationProb;
  }

  let precipitationAmount: number | undefined;
  if (raw.precipitationAmount !== undefined) {
    if (!isFiniteNumber(raw.precipitationAmount)) return null;
    precipitationAmount = raw.precipitationAmount;
  }

  let windGust: number | undefined;
  if (raw.windGust !== undefined) {
    if (!isFiniteNumber(raw.windGust)) return null;
    windGust = raw.windGust;
  }

  let missing: MissingField[] | undefined;
  if (raw.missing !== undefined) {
    if (!Array.isArray(raw.missing)) return null;
    missing = [];
    for (const item of raw.missing) {
      if (!isMissingField(item)) return null;
      missing.push(item);
    }
  }

  return {
    time: timeDate,
    temp: raw.temp,
    dewPoint: raw.dewPoint,
    dewGap: raw.dewGap,
    humidity: raw.humidity,
    cloudCover: raw.cloudCover,
    cloudCoverLow: raw.cloudCoverLow,
    cloudCoverMid: raw.cloudCoverMid,
    cloudCoverHigh: raw.cloudCoverHigh,
    windSpeed: raw.windSpeed,
    windDirectionDeg: raw.windDirectionDeg,
    windDirectionCompass: raw.windDirectionCompass,
    isAstroDark: raw.isAstroDark,
    isDangerDew: raw.isDangerDew,
    sunAltitude: raw.sunAltitude,
    precipitationProb,
    precipitationAmount,
    windGust,
    missing,
  };
}

export function restoreCachedPoints(raw: unknown): HourlyWeatherPoint[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const restored: HourlyWeatherPoint[] = [];
  for (const item of raw) {
    const pt = validateAndConvertPoint(item);
    if (pt === null) {
      return null;
    }
    restored.push(pt);
  }

  return restored;
}

export function isFieldMissing(p: HourlyWeatherPoint, f: MissingField): boolean {
  if (p.missing?.includes(f)) return true;
  if (f === 'cloud' || f === 'cloudCover') {
    return (
      (p.missing?.includes('cloud') ?? false) ||
      (p.missing?.includes('cloudCover') ?? false) ||
      p.cloudCover === null ||
      p.cloudCover === undefined ||
      p.cloudCoverLow === null ||
      p.cloudCoverLow === undefined ||
      p.cloudCoverMid === null ||
      p.cloudCoverMid === undefined ||
      p.cloudCoverHigh === null ||
      p.cloudCoverHigh === undefined
    );
  }
  return false;
}

function cleanupWeatherLocalStorage(): void {
  try {
    const validVersionPrefix = `chroma_weather_${WEATHER_CACHE_VERSION}_`;
    const keysToRemove: string[] = [];
    const currentVersionEntries: { key: string; timestamp: number }[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('chroma_weather_')) continue;

      if (!key.startsWith(validVersionPrefix)) {
        keysToRemove.push(key);
      } else {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            const ts = typeof parsed?.timestamp === 'number' ? parsed.timestamp : 0;
            currentVersionEntries.push({ key, timestamp: ts });
          } else {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }

    if (currentVersionEntries.length > 6) {
      currentVersionEntries.sort((a, b) => b.timestamp - a.timestamp);
      const toRemove = currentVersionEntries.slice(6);
      for (const entry of toRemove) {
        try {
          localStorage.removeItem(entry.key);
        } catch {}
      }
    }
  } catch (e) {
    console.warn('Error during weather localStorage cleanup:', e);
  }
}

export function degToCompass(deg: number): string {
  const val = Math.floor(deg / 22.5 + 0.5);
  const directions = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  return directions[val % 16] || 'N';
}

export async function fetch16DayHourlyWeather(
  location: ResolvedSite,
  forceRefresh: boolean = false
): Promise<WeatherFetchResult> {
  const now = new Date();
  const lat = location.latitude;
  const lng = location.longitude;
  const elevation = location.elevation;
  const tz = location.timeZone;
  const cacheKey = `chroma_weather_${WEATHER_CACHE_VERSION}_${lat.toFixed(4)}_${lng.toFixed(4)}_${Math.round(elevation)}_${tz}`;
  const nowTime = Date.now();

  // 1. & 2. Aşamalar (Önbellek Kontrolü - forceRefresh kapalıysa)
  if (!forceRefresh) {
    // 1. Aşama (Bellek / RAM Kontrolü)
    const memCached = weatherMemoryCache.get(cacheKey);
    if (memCached && nowTime - memCached.timestamp < WEATHER_CACHE_TTL_MS) {
      const cacheAgeMinutes = Math.floor((nowTime - memCached.timestamp) / 60000);
      return {
        points: memCached.points,
        sourceType: 'cached',
        cacheAgeMinutes,
        fetchedAt: memCached.timestamp,
        isFallback: false,
      };
    }

    // 2. Aşama (LocalStorage Kontrolü)
    try {
      const rawLocal = localStorage.getItem(cacheKey);
      if (rawLocal !== null) {
        const parsed: unknown = JSON.parse(rawLocal);
        if (
          isRecord(parsed) &&
          typeof parsed.timestamp === 'number' &&
          nowTime - parsed.timestamp < WEATHER_CACHE_TTL_MS
        ) {
          const restoredPoints = restoreCachedPoints(parsed.points);
          if (restoredPoints !== null) {
            weatherMemoryCache.set(cacheKey, { timestamp: parsed.timestamp, points: restoredPoints });
            const cacheAgeMinutes = Math.floor((nowTime - parsed.timestamp) / 60000);
            return {
              points: restoredPoints,
              sourceType: 'cached',
              cacheAgeMinutes,
              fetchedAt: parsed.timestamp,
              isFallback: false,
            };
          }
        }
      }
    } catch (e) {
      console.warn('Could not read weather from localStorage:', e);
    }
  }

  // Sürmekte olan bir istek varsa mevcut Promise'i dön (Yarış durumunu engelle)
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight !== undefined) {
    return inFlight;
  }

  // 3. Aşama (Canlı İstek & Önbelleğe Kayıt)
  const fetchPromise = (async (): Promise<WeatherFetchResult> => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&elevation=${Math.round(elevation)}&hourly=temperature_2m,dew_point_2m,relative_humidity_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,precipitation_probability,precipitation,wind_gusts_10m&forecast_days=16&past_days=1&timezone=auto&timeformat=unixtime`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('API did not respond: ' + res.status);
      const data = await res.json();
      if (!data?.hourly?.time || !Array.isArray(data.hourly.time)) {
        throw new Error('Invalid Open-Meteo data format');
      }
      const times: (string | number)[] = data.hourly.time;
      const temps: number[] = data.hourly.temperature_2m;
      const dews: number[] = data.hourly.dew_point_2m;
      const humids: number[] = data.hourly.relative_humidity_2m;
      const clouds: number[] = data.hourly.cloud_cover;
      const cloudLows: number[] = data.hourly.cloud_cover_low || [];
      const cloudMids: number[] = data.hourly.cloud_cover_mid || [];
      const cloudHighs: number[] = data.hourly.cloud_cover_high || [];
      const winds: number[] = data.hourly.wind_speed_10m;
      const windDirs: number[] = data.hourly.wind_direction_10m || [];
      const pops: number[] = data.hourly.precipitation_probability || [];
      const precips: number[] = data.hourly.precipitation || [];
      const gusts: number[] = data.hourly.wind_gusts_10m || [];

      const points: HourlyWeatherPoint[] = [];
      for (let i = 0; i < times.length; i++) {
        const epochSec = Number(times[i]);
        const t = !isNaN(epochSec) && epochSec > 0 ? new Date(epochSec * 1000) : new Date(times[i]);

        let rawTemp = temps[i];
        let rawDew = dews[i];
        let rawHum = humids[i];
        let rawCloud = clouds[i];
        let rawCloudLow = cloudLows[i];
        let rawCloudMid = cloudMids[i];
        let rawCloudHigh = cloudHighs[i];
        let rawWind = winds[i];
        let rawWindDir = windDirs[i];
        let rawPop = pops[i];
        let rawPrecip = precips[i];
        let rawGust = gusts[i];

        const missingFields: MissingField[] = [];

        // temp
        const hasTemp = isValidNumber(rawTemp);
        if (!hasTemp) {
          missingFields.push('temp');
        }
        const temp = hasTemp ? Number(rawTemp.toFixed(1)) : 0;

        // dewPoint
        const hasDew = isValidNumber(rawDew);
        if (!hasDew) {
          missingFields.push('dewPoint');
        }
        const dewPoint = hasDew ? Number(rawDew.toFixed(1)) : 0;

        // dewGap & isDangerDew
        let dewGap = 0;
        let isDangerDew = false;
        if (hasTemp && hasDew) {
          dewGap = Number((temp - dewPoint).toFixed(1));
          isDangerDew = dewGap < 2.0;
        }

        // humidity
        const hasHum = isValidNumber(rawHum);
        if (!hasHum) {
          missingFields.push('humidity');
        }
        const humidity = hasHum ? Math.round(rawHum) : 0;

        // cloud: toplam, alçak, orta veya yüksek bulutun herhangi biri eksikse
        const hasCloudTotal = isValidNumber(rawCloud);
        const hasCloudLow = isValidNumber(rawCloudLow);
        const hasCloudMid = isValidNumber(rawCloudMid);
        const hasCloudHigh = isValidNumber(rawCloudHigh);
        const hasCloud = hasCloudTotal && hasCloudLow && hasCloudMid && hasCloudHigh;

        if (!hasCloud) {
          missingFields.push('cloud');
          missingFields.push('cloudCover');
        }
        const cloudCover = hasCloudTotal ? Math.round(rawCloud) : null;
        const cloudCoverLow = hasCloudLow ? Math.round(rawCloudLow) : null;
        const cloudCoverMid = hasCloudMid ? Math.round(rawCloudMid) : null;
        const cloudCoverHigh = hasCloudHigh ? Math.round(rawCloudHigh) : null;

        // wind: hız veya yön eksikse
        const hasWindSpeed = isValidNumber(rawWind);
        const hasWindDir = isValidNumber(rawWindDir);
        const hasWind = hasWindSpeed && hasWindDir;

        if (!hasWind) {
          missingFields.push('wind');
        }
        const windSpeed = hasWindSpeed ? Math.round(rawWind) : 0;
        const windDirectionDeg = hasWindDir ? Math.round(rawWindDir) : 0;
        const windDirectionCompass = hasWindDir ? degToCompass(windDirectionDeg) : 'N';

        // precipitation: yağış olasılığı ve yağış miktarı eksikse
        const hasPop = isValidNumber(rawPop);
        const hasPrecipAmount = isValidNumber(rawPrecip);
        if (!hasPop || !hasPrecipAmount) {
          missingFields.push('precipitation');
        }

        const hasGust = isValidNumber(rawGust);

        const sunCoords = getSolarCoordinates(t);
        const sunHoriz = getHorizontalCoordinates(t, sunCoords.ra, sunCoords.dec, lat, lng);
        const sunAltitude = sunHoriz.altitude;
        const isAstroDark = sunAltitude < -18.0;

        const point: HourlyWeatherPoint = {
          time: t,
          temp,
          dewPoint,
          dewGap,
          humidity,
          cloudCover,
          cloudCoverLow,
          cloudCoverMid,
          cloudCoverHigh,
          windSpeed,
          windDirectionDeg,
          windDirectionCompass,
          isAstroDark,
          isDangerDew,
          sunAltitude,
          precipitationProb: isValidNumber(rawPop) ? Math.round(rawPop) : undefined,
          precipitationAmount: isValidNumber(rawPrecip) ? Number(rawPrecip.toFixed(1)) : undefined,
          windGust: isValidNumber(rawGust) ? Math.round(rawGust) : undefined,
          ...(missingFields.length > 0 ? { missing: missingFields } : {}),
        };

        points.push(point);
      }

      const cachePayload = { timestamp: nowTime, points };
      weatherMemoryCache.set(cacheKey, cachePayload);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
        cleanupWeatherLocalStorage();
      } catch (e) {
        console.warn('Could not write weather to localStorage:', e);
      }

      return {
        points,
        sourceType: 'live',
        cacheAgeMinutes: 0,
        fetchedAt: nowTime,
        isFallback: false,
      };
    } catch (err) {
      console.warn('Open-Meteo fetch failed or offline, checking cached real data:', err);
      // 4. Aşama (Çevrimdışı / Ağ Hatası Kurtarma)
      try {
        const rawLocal = localStorage.getItem(cacheKey);
        if (rawLocal !== null) {
          const parsed: unknown = JSON.parse(rawLocal);
          if (isRecord(parsed)) {
            const restoredPoints = restoreCachedPoints(parsed.points);
            if (restoredPoints !== null) {
              const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : nowTime;
              const cacheAgeMinutes = Math.floor((nowTime - ts) / 60000);
              return {
                points: restoredPoints,
                sourceType: 'cached',
                cacheAgeMinutes,
                fetchedAt: ts,
                isFallback: false,
              };
            }
          }
        }
      } catch (e) {
        console.warn('Could not read cached weather from localStorage:', e);
      }

      return {
        points: [],
        sourceType: 'fallback',
        cacheAgeMinutes: 0,
        fetchedAt: nowTime,
        isFallback: true,
      };
    }
  })();

  const trackedPromise = fetchPromise.finally(() => {
    inFlightRequests.delete(cacheKey);
  });

  inFlightRequests.set(cacheKey, trackedPromise);
  return trackedPromise;
}

export function calculateWeatherKPIs(points: HourlyWeatherPoint[]): WeatherKPIs {
  const darkHours = points.slice(0, 36).filter((p) => p.isAstroDark);
  const targetSample = darkHours.length > 0 ? darkHours : points.slice(0, 24);

  let minDewGap = 99;
  let totalCloud = 0;
  let tempMin = 99;
  let tempMax = -99;
  let humidityMin = 100;
  let humidityMax = 0;
  let totalWind = 0;
  let maxWind = 0;

  // Eksik işaretli noktaları ilgili alan için örneklemeden çıkar
  const validDewPoints = targetSample.filter(
    (p) => !isFieldMissing(p, 'temp') && !isFieldMissing(p, 'dewPoint')
  );
  const validTempPoints = targetSample.filter((p) => !isFieldMissing(p, 'temp'));
  const validCloudPoints = targetSample.filter((p) => !isFieldMissing(p, 'cloud'));
  const validHumidityPoints = targetSample.filter((p) => !isFieldMissing(p, 'humidity'));
  const validWindPoints = targetSample.filter((p) => !isFieldMissing(p, 'wind'));

  // Dew gap (Geçerli nokta kalmazsa mevcut davranışı koru)
  const dewSample = validDewPoints.length > 0 ? validDewPoints : targetSample;
  for (const p of dewSample) {
    if (p.dewGap < minDewGap) minDewGap = p.dewGap;
  }

  // Temp
  const tempSample = validTempPoints.length > 0 ? validTempPoints : targetSample;
  for (const p of tempSample) {
    if (p.temp < tempMin) tempMin = p.temp;
    if (p.temp > tempMax) tempMax = p.temp;
  }

  // Cloud
  const cloudSample = validCloudPoints.length > 0 ? validCloudPoints : targetSample;
  let validCloudCount = 0;
  for (const p of cloudSample) {
    if (p.cloudCover !== null && p.cloudCover !== undefined) {
      totalCloud += p.cloudCover;
      validCloudCount++;
    }
  }

  // Humidity
  const humSample = validHumidityPoints.length > 0 ? validHumidityPoints : targetSample;
  for (const p of humSample) {
    if (p.humidity < humidityMin) humidityMin = p.humidity;
    if (p.humidity > humidityMax) humidityMax = p.humidity;
  }

  // Wind
  const windSample = validWindPoints.length > 0 ? validWindPoints : targetSample;
  for (const p of windSample) {
    totalWind += p.windSpeed;
    if (p.windSpeed > maxWind) maxWind = p.windSpeed;
  }

  const avgNightCloud = Math.round(totalCloud / Math.max(1, validCloudCount > 0 ? validCloudCount : cloudSample.length));
  const avgWind = Math.round(totalWind / Math.max(1, windSample.length));

  let dewRiskLevel: WeatherKPIs['dewRiskLevel'] = 'safe';
  if (minDewGap < 2.0) {
    dewRiskLevel = 'high';
  } else if (minDewGap < 4.0) {
    dewRiskLevel = 'medium';
  } else {
    dewRiskLevel = 'safe';
  }

  let cloudCategory: WeatherKPIs['cloudCategory'] = 'low';
  if (avgNightCloud > 60) {
    cloudCategory = 'high';
  } else if (avgNightCloud >= 25) {
    cloudCategory = 'mid';
  } else {
    cloudCategory = 'low';
  }

  let windStatus: WeatherKPIs['windStatus'] = 'Ideal (<10 km/h)';
  if (maxWind > 25) {
    windStatus = 'Vibration Risk (>25 km/h)';
  } else if (maxWind >= 10) {
    windStatus = 'Acceptable (10-25 km/h)';
  } else {
    windStatus = 'Ideal (<10 km/h)';
  }

  return {
    dewRiskLevel,
    minDewGap: Number(minDewGap.toFixed(1)),
    avgNightCloud,
    cloudCategory,
    tempMin: Number(tempMin.toFixed(1)),
    tempMax: Number(tempMax.toFixed(1)),
    humidityMin,
    humidityMax,
    windAvg: avgWind,
    windMax: maxWind,
    windStatus,
  };
}

