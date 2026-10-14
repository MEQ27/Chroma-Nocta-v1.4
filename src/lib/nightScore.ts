import { LocationData, SolarEphemerisDay } from '../types';
import { formatSiteTimeHM } from './siteTime';

export type NightScoreStatus = 'scored' | 'no-darkness' | 'incomplete';
export type NightScoreGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'N/A';

export interface NightScoreTelemetryInput {
  hasData: boolean;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  cloudSummary: string;
  nightMinTempC: number | null;
  minDewGapC: number | null;
  maxPrecipProb: number | null;
  totalPrecipMm: number | null;
  windMaxGust: number;
  windUnit: string;
  windDir: string;
}

export interface NightScoreInput {
  ephemeris: Pick<
    SolarEphemerisDay,
    | 'darkDurationMinutes'
    | 'moonlessDarkMinutes'
    | 'efficiencyPercent'
    | 'hasZifiriWindow'
    | 'astroDusk'
    | 'astroDawn'
    | 'moonrise'
    | 'moonset'
    | 'moonIllumination'
  >;
  weather: NightScoreTelemetryInput;
  site?: Pick<LocationData, 'bortleClass' | 'elevation' | 'name'>;
  siteTz?: string;
}

export interface NightScoreBreakdown {
  cloudScore: number;       // 0..40
  darknessScore: number;    // 0..25
  windScore: number;        // 0..15
  dewScore: number;         // 0..10
  siteComfortScore: number; // 0..10
}

export interface NightScoreResult {
  status: NightScoreStatus;
  score: number | null;
  grade: NightScoreGrade;
  label: string;
  vetoReason: string | null;
  breakdown: NightScoreBreakdown | null;
  tacticalNotes: readonly string[];
}

export function calculateNightScore(input: NightScoreInput): NightScoreResult {
  const tz = input.siteTz !== undefined && input.siteTz.length > 0 ? input.siteTz : 'Etc/UTC';
  const { ephemeris, weather, site } = input;

  if (!ephemeris.hasZifiriWindow || ephemeris.darkDurationMinutes <= 0) {
    return {
      status: 'no-darkness',
      score: null,
      grade: 'N/A',
      label: 'White Night',
      vetoReason: null,
      breakdown: null,
      tacticalNotes: ['No astronomical darkness (Sun stays above -18°) at this latitude and date.'],
    };
  }

  const ephemNotes: string[] = [
    `Moonless dark sky: ${(ephemeris.moonlessDarkMinutes / 60).toFixed(1)}h of ${(ephemeris.darkDurationMinutes / 60).toFixed(1)}h total astro night (%${ephemeris.efficiencyPercent} efficiency).`,
  ];

  if (ephemeris.astroDusk && ephemeris.astroDawn) {
    const duskMs = ephemeris.astroDusk.getTime();
    const dawnMs = ephemeris.astroDawn.getTime();
    if (ephemeris.moonrise && ephemeris.moonrise.getTime() >= duskMs && ephemeris.moonrise.getTime() <= dawnMs) {
      ephemNotes.push(
        `Moon rises at ${formatSiteTimeHM(ephemeris.moonrise, tz)} (%${ephemeris.moonIllumination} illum) — prioritize deep-sky targets before moonrise.`
      );
    } else if (ephemeris.moonset && ephemeris.moonset.getTime() >= duskMs && ephemeris.moonset.getTime() <= dawnMs) {
      ephemNotes.push(
        `Moon sets at ${formatSiteTimeHM(ephemeris.moonset, tz)} (%${ephemeris.moonIllumination} illum) — prime dark window opens after moonset.`
      );
    } else if (ephemeris.moonIllumination <= 10) {
      ephemNotes.push(`New Moon phase (%${ephemeris.moonIllumination} illum) — zero lunar interference all night.`);
    }
  }

  if (
    !weather.hasData ||
    weather.cloudLow === null ||
    weather.cloudMid === null ||
    weather.cloudHigh === null ||
    weather.nightMinTempC === null ||
    weather.minDewGapC === null
  ) {
    return {
      status: 'incomplete',
      score: null,
      grade: 'N/A',
      label: 'Ephemeris Only',
      vetoReason: null,
      breakdown: null,
      tacticalNotes: [...ephemNotes, weather.cloudSummary || 'Weather telemetry unavailable (offline or beyond 16-day forecast range).'],
    };
  }

  const effectiveCloud = Math.min(
    100,
    0.5 * weather.cloudLow + 0.35 * weather.cloudMid + 0.15 * weather.cloudHigh
  );
  const cloudScore = Math.round(40 * (1 - effectiveCloud / 100));

  const rawRatio = Math.max(0, Math.min(1, ephemeris.moonlessDarkMinutes / ephemeris.darkDurationMinutes));
  const darknessScore = Math.round(25 * rawRatio);

  const gustKph = weather.windUnit === 'mph' ? weather.windMaxGust / 0.621371 : weather.windMaxGust;
  const windScore =
    gustKph <= 10
      ? 15
      : gustKph >= 25
      ? 0
      : Math.round(15 * (1 - (gustKph - 10) / 15));

  const gap = weather.minDewGapC;
  const dewScore =
    gap >= 4
      ? 10
      : gap < 2
      ? 0
      : Math.round(5 + ((gap - 2) / 2) * 5);

  const bortle = site?.bortleClass !== undefined ? site.bortleClass : 3;
  const bortlePts = bortle <= 2 ? 6 : bortle <= 3 ? 5 : bortle <= 4 ? 4 : 2;
  const tempC = weather.nightMinTempC;
  const tempPts = tempC >= 0 ? 4 : tempC >= -10 ? 3 : tempC >= -15 ? 1 : 0;
  const siteComfortScore = bortlePts + tempPts;

  const rawTotal = cloudScore + darknessScore + windScore + dewScore + siteComfortScore;
  let finalScore = rawTotal;
  let vetoReason: string | null = null;
  const notes: string[] = [...ephemNotes];

  const pop = weather.maxPrecipProb !== null ? weather.maxPrecipProb : 0;
  const precipMm = weather.totalPrecipMm !== null ? weather.totalPrecipMm : 0;

  if (pop >= 40 || precipMm >= 0.5) {
    finalScore = Math.min(finalScore, 15);
    vetoReason = 'Precipitation Risk';
    notes.push(`VETO — Precipitation risk detected (%${pop} probability, ${precipMm.toFixed(1)}mm). Do not deploy open optics.`);
  } else if (gustKph > 35) {
    finalScore = Math.min(finalScore, 25);
    vetoReason = 'Severe Wind (>35 km/h)';
    notes.push(`VETO — Severe wind gusts up to ${Math.round(gustKph)} km/h. High risk of mount vibration and tripod instability.`);
  } else if (weather.cloudLow >= 60) {
    finalScore = Math.min(finalScore, 30);
    vetoReason = 'Low Fog / Stratus';
    notes.push(`Heavy low-altitude cloud/fog (%${weather.cloudLow}) will obstruct the sky.`);
  } else if (tempC <= -15) {
    finalScore = Math.min(finalScore, 45);
    vetoReason = 'Extreme Cold (≤-15°C)';
    notes.push(`Extreme cold warning (${Math.round(tempC)}°C min) — severe battery drain and cable stiffening risk.`);
  }

  notes.push(weather.cloudSummary);

  if (tempC <= 0 && tempC > -15) {
    notes.push(`Freezing night temperature (${Math.round(tempC)}°C min) — frost and battery capacity drop likely.`);
  } else if (tempC > 0) {
    notes.push(`Night minimum temperature: ${Math.round(tempC)}°C.`);
  }

  if (gap < 2) {
    notes.push(`Critical dew risk (min depression Δ${gap.toFixed(1)}°C) — run dew heaters at high power.`);
  } else if (gap < 4) {
    notes.push(`Moderate dew margin (Δ${gap.toFixed(1)}°C) — keep dew heaters active.`);
  }

  if (gustKph >= 15 && gustKph <= 35) {
    notes.push(`Peak wind gusts ${weather.windMaxGust} ${weather.windUnit} (${weather.windDir || 'N'}) — shield mount or shorten sub-exposures.`);
  }

  let grade: NightScoreGrade = 'D';
  let label = vetoReason !== null ? vetoReason : 'Unfavorable';
  if (finalScore >= 85) {
    grade = 'S';
    label = 'Prime Astro Night';
  } else if (finalScore >= 70) {
    grade = 'A';
    label = 'Good Imaging';
  } else if (finalScore >= 50) {
    grade = 'B';
    label = 'Marginal / Selective';
  } else if (finalScore >= 35) {
    grade = 'C';
    label = 'Poor Conditions';
  }

  return {
    status: 'scored',
    score: finalScore,
    grade,
    label,
    vetoReason,
    breakdown: {
      cloudScore,
      darknessScore,
      windScore,
      dewScore,
      siteComfortScore,
    },
    tacticalNotes: notes,
  };
}
