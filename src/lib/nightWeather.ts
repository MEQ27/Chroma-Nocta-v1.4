import { HourlyWeatherPoint, LocationData, UnitSystem } from '../types';
import { calculateNightEphemeris } from './ephemeris';
import {
  parseDateKey,
  zonedTimeToInstant,
  siteHour,
  currentNightKey,
  formatSiteTimeHM,
} from './siteTime';
import {
  degToCompass,
  isFieldMissing,
  WeatherSourceType,
} from './weatherService';
import { calculateNightScore, NightScoreResult } from './nightScore';

export interface SiteNightWeatherSummaryInput {
  site: LocationData;
  points: HourlyWeatherPoint[] | undefined;
  targetDateKey: string;
  siteTz: string;
  units: UnitSystem;
  sourceType?: WeatherSourceType;
  nowMs: number;
}

export interface SiteNightWeatherSummaryResult {
  hasData: boolean;
  dayMaxStr: string;
  nightMinStr: string;
  tempUnit: string;
  humidityStr: string;
  precipStr: string;
  windSpeedStr: string;
  windMinSpeed: number;
  windMaxGust: number;
  windUnit: string;
  windDir: string;
  windStr: string;
  cloudLowStr: string;
  cloudMidStr: string;
  cloudHighStr: string;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  cloudSummary: string;
  avgNightCloud: number | null;
  windowLabel: string;
  isPartial: boolean;
  validHours: number;
  expectedHours: number;
  dayMaxTempC: number | null;
  nightMinTempC: number | null;
  minHumidity: number | null;
  maxHumidity: number | null;
  avgDewPointC: number | null;
  minDewGapC: number | null;
  maxPrecipProb: number | null;
  totalPrecipMm: number | null;
  nightScore: NightScoreResult;
}

export function summarizeSiteNightWeather(
  input: SiteNightWeatherSummaryInput
): SiteNightWeatherSummaryResult {
  const { site, points, targetDateKey, siteTz, units, sourceType, nowMs } = input;

  const ephem = calculateNightEphemeris(
    targetDateKey,
    site.latitude,
    site.longitude,
    site.elevation,
    siteTz,
    site.horizonProfile
  );

  const nightStart = ephem.astroDusk?.getTime() ?? ephem.nauticalDusk?.getTime();
  const nightEnd = ephem.astroDawn?.getTime() ?? ephem.nauticalDawn?.getTime();

  const windowLabel =
    nightStart !== undefined && nightEnd !== undefined
      ? `[${formatSiteTimeHM(nightStart, siteTz)} - ${formatSiteTimeHM(nightEnd, siteTz)}]`
      : '[White Night]';

  if (nightStart === undefined || nightEnd === undefined || nightEnd <= nightStart) {
    return {
      hasData: false,
      dayMaxStr: '--',
      nightMinStr: '--',
      tempUnit: units === 'imperial' ? '°F' : '°C',
      humidityStr: '--',
      precipStr: '--',
      windSpeedStr: '--',
      windMinSpeed: 0,
      windMaxGust: 0,
      windUnit: units === 'imperial' ? 'mph' : 'km/h',
      windDir: '',
      windStr: '--',
      cloudLowStr: '--',
      cloudMidStr: '--',
      cloudHighStr: '--',
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      cloudSummary: 'White night / No darkness',
      avgNightCloud: null,
      windowLabel,
      isPartial: false,
      validHours: 0,
      expectedHours: 0,
      dayMaxTempC: null,
      nightMinTempC: null,
      minHumidity: null,
      maxHumidity: null,
      avgDewPointC: null,
      minDewGapC: null,
      maxPrecipProb: null,
      totalPrecipMm: null,
      nightScore: calculateNightScore({
        ephemeris: ephem,
        weather: {
          hasData: false,
          cloudLow: null,
          cloudMid: null,
          cloudHigh: null,
          cloudSummary: 'White night / No darkness',
          nightMinTempC: null,
          minDewGapC: null,
          maxPrecipProb: null,
          totalPrecipMm: null,
          windMaxGust: 0,
          windUnit: units === 'imperial' ? 'mph' : 'km/h',
          windDir: '',
        },
        site,
        siteTz,
      }),
    };
  }

  const expectedHours = Math.floor((nightEnd - nightStart) / 3600000);

  const { year: selY, month: selM, day: selD } = parseDateKey(targetDateKey);

  const todayParts = parseDateKey(currentNightKey(nowMs, siteTz));
  const nowUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const selUtc = Date.UTC(selY, selM - 1, selD);
  const diffDays = Math.round((selUtc - nowUtc) / 86400000);
  const isBeyond = diffDays < 0 || diffDays >= 16;

  // Guard 2: Out of range check (takes priority over offline status)
  if (isBeyond) {
    return {
      hasData: false,
      dayMaxStr: '--',
      nightMinStr: '--',
      tempUnit: units === 'imperial' ? '°F' : '°C',
      humidityStr: '--',
      precipStr: '--',
      windSpeedStr: '--',
      windMinSpeed: 0,
      windMaxGust: 0,
      windUnit: units === 'imperial' ? 'mph' : 'km/h',
      windDir: '',
      windStr: '--',
      cloudLowStr: '--',
      cloudMidStr: '--',
      cloudHighStr: '--',
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      cloudSummary: 'Forecast out of range (Ephemeris-based planning).',
      avgNightCloud: null,
      windowLabel,
      isPartial: false,
      validHours: 0,
      expectedHours,
      dayMaxTempC: null,
      nightMinTempC: null,
      minHumidity: null,
      maxHumidity: null,
      avgDewPointC: null,
      minDewGapC: null,
      maxPrecipProb: null,
      totalPrecipMm: null,
      nightScore: calculateNightScore({
        ephemeris: ephem,
        weather: {
          hasData: false,
          cloudLow: null,
          cloudMid: null,
          cloudHigh: null,
          cloudSummary: 'Forecast out of range (Ephemeris-based planning).',
          nightMinTempC: null,
          minDewGapC: null,
          maxPrecipProb: null,
          totalPrecipMm: null,
          windMaxGust: 0,
          windUnit: units === 'imperial' ? 'mph' : 'km/h',
          windDir: '',
        },
        site,
        siteTz,
      }),
    };
  }

  // Guard 3: Offline check
  const hasLiveOrCached = (sourceType === 'live' || sourceType === 'cached') && !!points && points.length > 0;
  if (!hasLiveOrCached) {
    return {
      hasData: false,
      dayMaxStr: '--',
      nightMinStr: '--',
      tempUnit: units === 'imperial' ? '°F' : '°C',
      humidityStr: '--',
      precipStr: '--',
      windSpeedStr: '--',
      windMinSpeed: 0,
      windMaxGust: 0,
      windUnit: units === 'imperial' ? 'mph' : 'km/h',
      windDir: '',
      windStr: '--',
      cloudLowStr: '--',
      cloudMidStr: '--',
      cloudHighStr: '--',
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      cloudSummary: 'Offline — No forecast data cached',
      avgNightCloud: null,
      windowLabel,
      isPartial: false,
      validHours: 0,
      expectedHours,
      dayMaxTempC: null,
      nightMinTempC: null,
      minHumidity: null,
      maxHumidity: null,
      avgDewPointC: null,
      minDewGapC: null,
      maxPrecipProb: null,
      totalPrecipMm: null,
      nightScore: calculateNightScore({
        ephemeris: ephem,
        weather: {
          hasData: false,
          cloudLow: null,
          cloudMid: null,
          cloudHigh: null,
          cloudSummary: 'Offline — No forecast data cached',
          nightMinTempC: null,
          minDewGapC: null,
          maxPrecipProb: null,
          totalPrecipMm: null,
          windMaxGust: 0,
          windUnit: units === 'imperial' ? 'mph' : 'km/h',
          windDir: '',
        },
        site,
        siteTz,
      }),
    };
  }

  // Dynamic Astronomical Twilight Window: [nightStart, nightEnd]
  const dayStart = zonedTimeToInstant(selY, selM, selD, 8, 0, 0, siteTz).getTime();
  const dayEnd = zonedTimeToInstant(selY, selM, selD, 19, 0, 0, siteTz).getTime();

  const nightPoints = points.filter(
    (p) => p.time.getTime() >= nightStart && p.time.getTime() <= nightEnd
  );
  const dayPoints = points.filter(
    (p) => p.time.getTime() >= dayStart && p.time.getTime() <= dayEnd
  );

  const validHours = nightPoints.length;
  const isPartial = validHours < expectedHours;

  if (nightPoints.length === 0) {
    return {
      hasData: false,
      dayMaxStr: '--',
      nightMinStr: '--',
      tempUnit: units === 'imperial' ? '°F' : '°C',
      humidityStr: '--',
      precipStr: '--',
      windSpeedStr: '--',
      windMinSpeed: 0,
      windMaxGust: 0,
      windUnit: units === 'imperial' ? 'mph' : 'km/h',
      windDir: '',
      windStr: '--',
      cloudLowStr: '--',
      cloudMidStr: '--',
      cloudHighStr: '--',
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      cloudSummary: 'No forecast data found.',
      avgNightCloud: null,
      windowLabel,
      isPartial: false,
      validHours: 0,
      expectedHours,
      dayMaxTempC: null,
      nightMinTempC: null,
      minHumidity: null,
      maxHumidity: null,
      avgDewPointC: null,
      minDewGapC: null,
      maxPrecipProb: null,
      totalPrecipMm: null,
      nightScore: calculateNightScore({
        ephemeris: ephem,
        weather: {
          hasData: false,
          cloudLow: null,
          cloudMid: null,
          cloudHigh: null,
          cloudSummary: 'No forecast data found.',
          nightMinTempC: null,
          minDewGapC: null,
          maxPrecipProb: null,
          totalPrecipMm: null,
          windMaxGust: 0,
          windUnit: units === 'imperial' ? 'mph' : 'km/h',
          windDir: '',
        },
        site,
        siteTz,
      }),
    };
  }

  const tempUnit = units === 'imperial' ? '°F' : '°C';

  // Sıcaklık eksik veri kontrolü (< 4 nokta ise '--')
  const validDayTempPoints = dayPoints.filter((p) => !isFieldMissing(p, 'temp'));
  const validNightTempPoints = nightPoints.filter((p) => !isFieldMissing(p, 'temp'));

  let dayMaxStr = '--';
  let nightMinStr = '--';

  if (validDayTempPoints.length >= 1) {
    const dayMaxC = Math.max(...validDayTempPoints.map((p) => p.temp));
    dayMaxStr = units === 'imperial' ? `${Math.round((dayMaxC * 9) / 5 + 32)}` : `${Math.round(dayMaxC)}`;
  } else if (validNightTempPoints.length >= 1) {
    const dayMaxC = Math.max(...validNightTempPoints.map((p) => p.temp));
    dayMaxStr = units === 'imperial' ? `${Math.round((dayMaxC * 9) / 5 + 32)}` : `${Math.round(dayMaxC)}`;
  }

  if (validNightTempPoints.length >= 1) {
    const nightMinC = Math.min(...validNightTempPoints.map((p) => p.temp));
    nightMinStr = units === 'imperial' ? `${Math.round((nightMinC * 9) / 5 + 32)}` : `${Math.round(nightMinC)}`;
  }

  // Nem eksik veri kontrolü
  const validHumPoints = nightPoints.filter((p) => !isFieldMissing(p, 'humidity'));
  let humidityStr = '--';
  if (validHumPoints.length >= 1) {
    const minHum = Math.min(...validHumPoints.map((p) => p.humidity));
    const maxHum = Math.max(...validHumPoints.map((p) => p.humidity));
    humidityStr = `Min %${minHum} - Max %${maxHum}`;
  }

  // Gerçek Yağış Telemetrisi
  const validPrecipPoints = nightPoints.filter((p) => !isFieldMissing(p, 'precipitation'));
  let precipStr = '--';
  if (validPrecipPoints.length > 0) {
    const maxPop = Math.max(...validPrecipPoints.map((p) => p.precipitationProb ?? 0));
    const totalPrecip = validPrecipPoints.reduce((acc, p) => acc + (p.precipitationAmount ?? 0), 0);
    if (maxPop < 10 && totalPrecip === 0) {
      precipStr = '%0 | Dry';
    } else {
      precipStr = units === 'imperial'
        ? `%${maxPop} | ${(totalPrecip * 0.0393701).toFixed(1)} in`
        : `%${maxPop} | ${totalPrecip.toFixed(1)}mm`;
    }
  }

  // Gerçek Rüzgâr ve Hamle Telemetrisi
  const validWindPoints = nightPoints.filter((p) => !isFieldMissing(p, 'wind'));
  let windStr = '--';
  let windSpeedStr = '--';
  let windMinSpeed = 0;
  let windMaxGust = 0;
  let windDir = '';
  const windUnit = units === 'imperial' ? 'mph' : 'km/h';

  if (validWindPoints.length > 0) {
    const minWind = Math.min(...validWindPoints.map((p) => p.windSpeed));
    const maxWind = Math.max(...validWindPoints.map((p) => p.windGust ?? p.windSpeed));
    const midPt =
      validWindPoints.find((p) => siteHour(p.time, siteTz) === 0 || siteHour(p.time, siteTz) === 23) ||
      validWindPoints[Math.floor(validWindPoints.length / 2)];
    windDir =
      midPt?.windDirectionCompass ||
      (typeof midPt?.windDirectionDeg === 'number' ? degToCompass(midPt.windDirectionDeg) : '');

    windMinSpeed = units === 'imperial' ? Math.round(minWind * 0.621371) : Math.round(minWind);
    windMaxGust = units === 'imperial' ? Math.round(maxWind * 0.621371) : Math.round(maxWind);

    if (units === 'imperial') {
      windSpeedStr = `${windMinSpeed} - ${windMaxGust} mph`;
      windStr = windDir ? `${windMinSpeed} - ${windMaxGust} mph ${windDir}` : `${windMinSpeed} - ${windMaxGust} mph`;
    } else {
      windSpeedStr = `${windMinSpeed} - ${windMaxGust} km/h`;
      windStr = windDir ? `${windMinSpeed} - ${windMaxGust} km/h ${windDir}` : `${windMinSpeed} - ${windMaxGust} km/h`;
    }
  }

  // Bulut Katmanı Tutarlılığı (Tüm Gece Ortalaması)
  const validCloudPoints = nightPoints.filter(
    (p) => !isFieldMissing(p, 'cloud') && p.cloudCover !== null
  );
  let cloudLowStr = '--';
  let cloudMidStr = '--';
  let cloudHighStr = '--';
  let cloudLow: number | null = null;
  let cloudMid: number | null = null;
  let cloudHigh: number | null = null;
  let avgNightCloud: number | null = null;
  let cloudSummary = 'Insufficient cloud data';

  if (validCloudPoints.length >= 4) {
    cloudLow = Math.round(validCloudPoints.reduce((a, b) => a + (b.cloudCoverLow ?? 0), 0) / validCloudPoints.length);
    cloudMid = Math.round(validCloudPoints.reduce((a, b) => a + (b.cloudCoverMid ?? 0), 0) / validCloudPoints.length);
    cloudHigh = Math.round(validCloudPoints.reduce((a, b) => a + (b.cloudCoverHigh ?? 0), 0) / validCloudPoints.length);
    avgNightCloud = Math.round(validCloudPoints.reduce((a, b) => a + (b.cloudCover ?? 0), 0) / validCloudPoints.length);
    cloudLowStr = `${cloudLow}`;
    cloudMidStr = `${cloudMid}`;
    cloudHighStr = `${cloudHigh}`;
    const maxCloudLow = Math.max(...validCloudPoints.map((p) => p.cloudCoverLow ?? 0));

    const firstHalf = validCloudPoints.filter((p) => {
      const h = siteHour(p.time, siteTz);
      return h >= 18 || h === 0;
    });
    const secondHalf = validCloudPoints.filter((p) => {
      const h = siteHour(p.time, siteTz);
      return h >= 1 && h <= 5;
    });
    const dawnHalf = validCloudPoints.filter((p) => {
      const h = siteHour(p.time, siteTz);
      return h >= 3 && h <= 6;
    });

    const firstHalfAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + (b.cloudCover ?? 0), 0) / firstHalf.length : avgNightCloud;
    const secondHalfAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + (b.cloudCover ?? 0), 0) / secondHalf.length : avgNightCloud;
    const secondHalfHigh = secondHalf.length > 0 ? Math.max(...secondHalf.map((p) => p.cloudCoverHigh ?? 0)) : 0;
    const dawnHalfAvg = dawnHalf.length > 0 ? dawnHalf.reduce((a, b) => a + (b.cloudCover ?? 0), 0) / dawnHalf.length : avgNightCloud;

    if (maxCloudLow > 35) {
      cloudSummary = 'Low fog/stratus; horizon obscured.';
    } else if (firstHalfAvg >= 45 && dawnHalfAvg <= 25) {
      cloudSummary = 'Cloudy overnight; clearing after 03:00.';
    } else if (firstHalfAvg < 20 && (secondHalfAvg > 35 || secondHalfHigh > 35)) {
      cloudSummary = 'Clear first half; cirrus after 02:00.';
    } else if (avgNightCloud < 15) {
      cloudSummary = 'Crystal clear and stable all night.';
    } else if (avgNightCloud > 65) {
      cloudSummary = 'Overcast and opaque all night.';
    } else {
      cloudSummary = 'Variable clouds; local windows open.';
    }
  }

  if (validCloudPoints.length < 4) {
    cloudLowStr = '--';
    cloudMidStr = '--';
    cloudHighStr = '--';
    cloudLow = null;
    cloudMid = null;
    cloudHigh = null;
    cloudSummary = 'Insufficient cloud data';
    avgNightCloud = null;
  }

  // Raw numeric telemetry calculations
  let dayMaxTempC: number | null = null;
  if (validDayTempPoints.length >= 1) {
    dayMaxTempC = Math.max(...validDayTempPoints.map((p) => p.temp));
  } else if (validNightTempPoints.length >= 1) {
    dayMaxTempC = Math.max(...validNightTempPoints.map((p) => p.temp));
  }

  let nightMinTempC: number | null = null;
  if (validNightTempPoints.length >= 1) {
    nightMinTempC = Math.min(...validNightTempPoints.map((p) => p.temp));
  }

  let minHumidity: number | null = null;
  let maxHumidity: number | null = null;
  if (validHumPoints.length >= 1) {
    minHumidity = Math.min(...validHumPoints.map((p) => p.humidity));
    maxHumidity = Math.max(...validHumPoints.map((p) => p.humidity));
  }

  const validDewPoints = nightPoints.filter((p) => !isFieldMissing(p, 'dewPoint'));
  let avgDewPointC: number | null = null;
  if (validDewPoints.length >= 1) {
    avgDewPointC = Number(
      (validDewPoints.reduce((acc, p) => acc + p.dewPoint, 0) / validDewPoints.length).toFixed(1)
    );
  }

  const validDewGapPoints = nightPoints.filter(
    (p) => !isFieldMissing(p, 'temp') && !isFieldMissing(p, 'dewPoint')
  );
  let minDewGapC: number | null = null;
  if (validDewGapPoints.length >= 1) {
    minDewGapC = Number(Math.min(...validDewGapPoints.map((p) => p.dewGap)).toFixed(1));
  }

  let maxPrecipProb: number | null = null;
  let totalPrecipMm: number | null = null;
  if (validPrecipPoints.length >= 1) {
    maxPrecipProb = Math.max(...validPrecipPoints.map((p) => p.precipitationProb ?? 0));
    totalPrecipMm = Number(
      validPrecipPoints.reduce((acc, p) => acc + (p.precipitationAmount ?? 0), 0).toFixed(1)
    );
  }

  return {
    hasData: true,
    dayMaxStr,
    nightMinStr,
    tempUnit,
    humidityStr,
    precipStr,
    windSpeedStr,
    windMinSpeed,
    windMaxGust,
    windUnit,
    windDir,
    windStr,
    cloudLowStr,
    cloudMidStr,
    cloudHighStr,
    cloudLow,
    cloudMid,
    cloudHigh,
    cloudSummary,
    avgNightCloud,
    windowLabel,
    isPartial,
    validHours,
    expectedHours,
    dayMaxTempC,
    nightMinTempC,
    minHumidity,
    maxHumidity,
    avgDewPointC,
    minDewGapC,
    maxPrecipProb,
    totalPrecipMm,
    nightScore: calculateNightScore({
      ephemeris: ephem,
      weather: {
        hasData: true,
        cloudLow,
        cloudMid,
        cloudHigh,
        cloudSummary,
        nightMinTempC,
        minDewGapC,
        maxPrecipProb,
        totalPrecipMm,
        windMaxGust,
        windUnit,
        windDir,
      },
      site,
      siteTz,
    }),
  };
}
