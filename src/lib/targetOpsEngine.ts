import {
  TARGET_CATALOG_30,
  ExtendedDeepSkyTarget as CelestialTarget,
} from './celestialData';
import {
  calculateNightEphemeris,
  getHorizontalCoordinates,
  getLunarCoordinates,
  getLST,
  formatTimeHM,
} from './ephemeris';
import { siteNoon, formatSiteTimeHM } from './siteTime';
import type { SolarEphemerisDay } from '../types';

export type { CelestialTarget };

export type TargetCategoryFilter =
  | 'all'
  | 'widefield'
  | 'nebula'
  | 'galaxy'
  | 'cluster';

export interface AstroTargetItem extends CelestialTarget {
  readonly categoryGroup: 'widefield' | 'nebula' | 'galaxy' | 'cluster';
  readonly isCustom?: boolean;
}

export interface TargetAltitudePoint {
  readonly time: Date;
  readonly timeMs: number;
  readonly timeLabel: string;
  readonly altitude: number;
  readonly azimuth: number;
  readonly terrainAltitude: number;
  readonly effectiveFloor: number;
  readonly isDark: boolean;
  readonly isAboveHorizon: boolean;
  readonly isObservable: boolean;
}

export interface TargetVisibilityCurve {
  readonly targetId: string;
  readonly points: readonly TargetAltitudePoint[];
  readonly peakAltitude: number;
  readonly peakTime: Date | null;
  readonly peakTimeLabel: string;
  readonly darkPeakAltitude: number;
  readonly darkPeakTime: Date | null;
  readonly darkPeakTimeLabel: string;
  readonly transitAltitude: number;
  readonly transitTime: Date | null;
  readonly transitTimeLabel: string;
  readonly observableHours: number;
  readonly observableWindowStart: Date | null;
  readonly observableWindowEnd: Date | null;
  readonly qualityScore: number;
}

export interface LunarSeparationResult {
  readonly separationDeg: number;
  readonly moonRa: number;
  readonly moonDec: number;
  readonly moonAltitude: number;
  readonly moonIllumination: number;
  readonly moonPhaseName: string;
  readonly isMoonUp: boolean;
  readonly warningLevel: 'optimal' | 'moderate' | 'severe';
  readonly warningNote: string;
}

export interface MeridianTransitInfo {
  readonly transitTime: Date;
  readonly transitTimeLabel: string;
  readonly transitAltitude: number;
  readonly isDuringDarkness: boolean;
  readonly timeToTransitMinutes: number;
  readonly inFlipWindow: boolean;
  readonly flipRisk: 'none' | 'imminent' | 'past';
  readonly description: string;
  readonly hourAngleHours: number;
  readonly axisSideLabel: string;
}

export interface ComprehensiveTargetAnalysis {
  readonly target: AstroTargetItem;
  readonly visibility: TargetVisibilityCurve;
  readonly lunar: LunarSeparationResult;
  readonly meridian: MeridianTransitInfo;
  readonly overallScore: number;
  readonly tacticalSummary: string;
}

export const WIDEFIELD_MILKY_WAY_TARGETS: readonly AstroTargetItem[] = [
  {
    id: 'mw-core',
    name: 'Galactic Core (Sagittarius / Scorpius)',
    catalog: 'Milky Way',
    type: 'Wide-Field Milky Way',
    ra: 17.76,
    dec: -29.0,
    magnitude: 1.0,
    sizeArcmin: 1800,
    constellation: 'Sagittarius',
    color: '#f59e0b',
    recommendedFocal: '14mm - 35mm',
    description: 'Brightest central bulge, dark dust lanes, Lagoon and Trifid region.',
    categoryGroup: 'widefield',
  },
  {
    id: 'mw-cygnus',
    name: 'Cygnus Star Cloud & Great Rift',
    catalog: 'Milky Way',
    type: 'Wide-Field Milky Way',
    ra: 20.5,
    dec: 42.0,
    magnitude: 1.8,
    sizeArcmin: 1500,
    constellation: 'Cygnus',
    color: '#38bdf8',
    recommendedFocal: '14mm - 50mm',
    description: 'Dense northern Milky Way arm rich in nebulosity and dark dust lanes.',
    categoryGroup: 'widefield',
  },
  {
    id: 'mw-rho-oph',
    name: 'Rho Ophiuchi & Antares Cloud',
    catalog: 'Milky Way',
    type: 'Wide-Field Milky Way',
    ra: 16.45,
    dec: -24.5,
    magnitude: 2.2,
    sizeArcmin: 720,
    constellation: 'Ophiuchus',
    color: '#fbbf24',
    recommendedFocal: '24mm - 85mm',
    description: 'Spectacular colorful complex of reflection and emission nebulae near Antares.',
    categoryGroup: 'widefield',
  },
  {
    id: 'mw-scutum',
    name: 'Scutum Star Cloud & Wild Duck',
    catalog: 'Milky Way',
    type: 'Wide-Field Milky Way',
    ra: 18.85,
    dec: -6.0,
    magnitude: 2.5,
    sizeArcmin: 900,
    constellation: 'Scutum',
    color: '#f59e0b',
    recommendedFocal: '24mm - 70mm',
    description: 'One of the brightest and densest star clouds along the Milky Way band.',
    categoryGroup: 'widefield',
  },
  {
    id: 'mw-cassiopeia',
    name: 'Cassiopeia & Perseus Milky Way Arm',
    catalog: 'Milky Way',
    type: 'Wide-Field Milky Way',
    ra: 2.5,
    dec: 60.0,
    magnitude: 2.2,
    sizeArcmin: 1200,
    constellation: 'Cassiopeia',
    color: '#ec4899',
    recommendedFocal: '14mm - 50mm',
    description: 'Outer Perseus arm rich in open star clusters and emission complexes.',
    categoryGroup: 'widefield',
  },
  {
    id: 'mw-winter',
    name: 'Winter Milky Way / Orion Arm',
    catalog: 'Milky Way',
    type: 'Wide-Field Milky Way',
    ra: 6.5,
    dec: 5.0,
    magnitude: 2.8,
    sizeArcmin: 1400,
    constellation: 'Monoceros',
    color: '#818cf8',
    recommendedFocal: '14mm - 50mm',
    description: 'Faint and delicate outer galactic band crossing Rosette and Monoceros regions.',
    categoryGroup: 'widefield',
  },
  {
    id: 'mw-carina-crux',
    name: 'Southern Milky Way (Carina / Crux / Coalsack)',
    catalog: 'Milky Way',
    type: 'Wide-Field Milky Way',
    ra: 11.5,
    dec: -61.0,
    magnitude: 0.8,
    sizeArcmin: 1800,
    constellation: 'Crux / Carina',
    color: '#34d399',
    recommendedFocal: '14mm - 50mm',
    description: 'Southern hemisphere jewel featuring the Southern Cross, Coalsack dark nebula, and Eta Carinae.',
    categoryGroup: 'widefield',
  },
];

export function getTerrainObstructionAtAzimuth(
  azimuthDeg: number,
  horizonProfile?: readonly number[]
): number {
  if (!horizonProfile || horizonProfile.length < 8) {
    return 0;
  }
  const normAz = ((azimuthDeg % 360) + 360) % 360;
  const frac = normAz / 45;
  const i0 = Math.floor(frac) % 8;
  const i1 = (i0 + 1) % 8;
  const t = frac - Math.floor(frac);
  const val0 = horizonProfile[i0] ?? 0;
  const val1 = horizonProfile[i1] ?? 0;
  const interp = val0 + (val1 - val0) * t;
  return Math.round(interp * 10) / 10;
}

export function getCategoryGroup(type: string): 'widefield' | 'nebula' | 'galaxy' | 'cluster' {
  const lower = type.toLowerCase();
  if (lower.includes('wide') || lower.includes('milky way')) {
    return 'widefield';
  }
  if (lower.includes('galaxy')) {
    return 'galaxy';
  }
  if (lower.includes('cluster')) {
    return 'cluster';
  }
  return 'nebula';
}

export function buildCatalogTargets(): AstroTargetItem[] {
  const list: AstroTargetItem[] = [];
  for (const item of WIDEFIELD_MILKY_WAY_TARGETS) {
    list.push(item);
  }
  for (const item of TARGET_CATALOG_30) {
    list.push({
      id: item.id,
      name: item.name,
      catalog: item.catalog,
      type: item.type,
      ra: item.ra,
      dec: item.dec,
      magnitude: item.magnitude,
      sizeArcmin: item.sizeArcmin,
      constellation: item.constellation,
      color: item.color,
      secondaryColor: item.secondaryColor,
      recommendedFocal: item.recommendedFocal,
      description: item.description,
      categoryGroup: getCategoryGroup(item.type),
    });
  }
  return list;
}

export const ALL_ASTRO_TARGETS: readonly AstroTargetItem[] = buildCatalogTargets();

export function getAllTargets(customTargets?: readonly AstroTargetItem[]): AstroTargetItem[] {
  const items: AstroTargetItem[] = [];
  for (const t of ALL_ASTRO_TARGETS) {
    items.push(t);
  }
  if (customTargets !== undefined) {
    for (const c of customTargets) {
      items.push(c);
    }
  }
  return items;
}

export function filterTargets(
  targets: readonly AstroTargetItem[],
  filter: TargetCategoryFilter,
  searchQuery?: string
): AstroTargetItem[] {
  const q = searchQuery !== undefined ? searchQuery.trim().toLowerCase() : '';
  const result: AstroTargetItem[] = [];
  for (const t of targets) {
    if (filter !== 'all' && t.categoryGroup !== filter) {
      continue;
    }
    if (q.length > 0) {
      const match =
        t.name.toLowerCase().includes(q) ||
        t.catalog.toLowerCase().includes(q) ||
        t.constellation.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q);
      if (!match) {
        continue;
      }
    }
    result.push(t);
  }
  return result;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function calculateAngularSeparation(
  ra1Hours: number,
  dec1Deg: number,
  ra2Hours: number,
  dec2Deg: number
): number {
  const ra1Rad = ra1Hours * 15 * DEG2RAD;
  const dec1Rad = dec1Deg * DEG2RAD;
  const ra2Rad = ra2Hours * 15 * DEG2RAD;
  const dec2Rad = dec2Deg * DEG2RAD;

  const sinDec1 = Math.sin(dec1Rad);
  const cosDec1 = Math.cos(dec1Rad);
  const sinDec2 = Math.sin(dec2Rad);
  const cosDec2 = Math.cos(dec2Rad);
  const deltaRaRad = Math.abs(ra1Rad - ra2Rad);

  const cosD = sinDec1 * sinDec2 + cosDec1 * cosDec2 * Math.cos(deltaRaRad);
  const boundedCosD = Math.max(-1, Math.min(1, cosD));
  return Math.acos(boundedCosD) * RAD2DEG;
}

export function calculateTargetLunarSeparation(
  target: { ra: number; dec: number },
  instant: Date,
  latitude: number,
  longitude: number
): LunarSeparationResult {
  const moon = getLunarCoordinates(instant);
  const moonH = getHorizontalCoordinates(instant, moon.ra, moon.dec, latitude, longitude);
  const sep = calculateAngularSeparation(target.ra, target.dec, moon.ra, moon.dec);
  const isMoonUp = moonH.altitude > 0;

  let warningLevel: 'optimal' | 'moderate' | 'severe' = 'optimal';
  let warningNote = 'Moon is below horizon or far enough to avoid glare.';

  if (isMoonUp) {
    if (sep < 30 && moon.illumination >= 20) {
      warningLevel = 'severe';
      warningNote = `Moon is within ${Math.round(sep)}° with ${moon.illumination}% illumination — severe gradient and contrast loss.`;
    } else if (sep < 60 && moon.illumination >= 35) {
      warningLevel = 'moderate';
      warningNote = `Moon is within ${Math.round(sep)}° with ${moon.illumination}% illumination — moderate sky background brightness.`;
    } else {
      warningLevel = 'optimal';
      warningNote = `Moon is at ${Math.round(sep)}° angular distance — minimal interference.`;
    }
  } else {
    warningNote = `Moon is below the horizon (alt ${Math.round(moonH.altitude)}°) — pristine dark sky conditions.`;
  }

  return {
    separationDeg: Math.round(sep * 10) / 10,
    moonRa: Math.round(moon.ra * 100) / 100,
    moonDec: Math.round(moon.dec * 100) / 100,
    moonAltitude: Math.round(moonH.altitude * 10) / 10,
    moonIllumination: moon.illumination,
    moonPhaseName: moon.phaseName,
    isMoonUp,
    warningLevel,
    warningNote,
  };
}

export function calculateMeridianTransit(
  target: { ra: number; dec: number },
  nightEphemeris: SolarEphemerisDay,
  latitude: number,
  longitude: number,
  timeZone: string,
  referenceTime?: Date | null,
  alarmLeadMinutes: number = 20
): MeridianTransitInfo {
  const noon = siteNoon(nightEphemeris.dateKey, timeZone);
  const noonLst = getLST(noon, longitude);

  let diffHours = target.ra - noonLst;
  while (diffHours < 0) {
    diffHours += 24;
  }
  while (diffHours >= 24) {
    diffHours -= 24;
  }

  const solarHoursFromNoon = diffHours / 1.00273790935;
  const transitTime = new Date(noon.getTime() + solarHoursFromNoon * 3600 * 1000);
  const transitTimeLabel = formatSiteTimeHM(transitTime, timeZone);

  const horiz = getHorizontalCoordinates(
    transitTime,
    target.ra,
    target.dec,
    latitude,
    longitude
  );
  const transitAltitude = Math.round(horiz.altitude * 10) / 10;

  let isDuringDarkness = false;
  if (nightEphemeris.astroDusk !== null && nightEphemeris.astroDawn !== null) {
    const tMs = transitTime.getTime();
    isDuringDarkness =
      tMs >= nightEphemeris.astroDusk.getTime() &&
      tMs <= nightEphemeris.astroDawn.getTime();
  }

  let refMs = noon.getTime();
  if (referenceTime !== null && referenceTime !== undefined) {
    refMs = referenceTime.getTime();
  } else if (nightEphemeris.astroDusk !== null) {
    refMs = nightEphemeris.astroDusk.getTime();
  } else if (nightEphemeris.sunset !== null) {
    refMs = nightEphemeris.sunset.getTime();
  }

  const deltaMins = Math.round((transitTime.getTime() - refMs) / 60000);
  const inFlipWindow = Math.abs(deltaMins) <= alarmLeadMinutes;

  const refLst = getLST(new Date(refMs), longitude);
  let signedHA = refLst - target.ra;
  while (signedHA < -12) {
    signedHA += 24;
  }
  while (signedHA >= 12) {
    signedHA -= 24;
  }
  const hourAngleHours = Math.round(signedHA * 100) / 100;
  const axisSideLabel = signedHA < 0 ? 'Pre-Meridian (East)' : 'Post-Meridian (West)';

  let flipRisk: 'none' | 'imminent' | 'past' = 'none';
  let description = '';

  if (inFlipWindow) {
    flipRisk = 'imminent';
    description = `Target transit within GEM flip window (±${alarmLeadMinutes} min, Δ=${deltaMins} min). Peak alt: ${transitAltitude}°.`;
  } else if (deltaMins < -alarmLeadMinutes) {
    flipRisk = 'past';
    description = `Target already crossed the meridian tonight at ${transitTimeLabel}.`;
  } else {
    flipRisk = 'none';
    const hoursTo = Math.round((deltaMins / 60) * 10) / 10;
    description = `Transit at ${transitTimeLabel} (${hoursTo}h from reference), peak alt ${transitAltitude}°.`;
  }

  return {
    transitTime,
    transitTimeLabel,
    transitAltitude,
    isDuringDarkness,
    timeToTransitMinutes: deltaMins,
    inFlipWindow,
    flipRisk,
    description,
    hourAngleHours,
    axisSideLabel,
  };
}

export function calculateTargetVisibilityCurve(
  target: AstroTargetItem,
  nightEphemeris: SolarEphemerisDay,
  latitude: number,
  longitude: number,
  timeZone: string,
  minAltitudeDeg: number = 30,
  horizonProfile?: readonly number[]
): TargetVisibilityCurve {
  const points: TargetAltitudePoint[] = [];

  const noon = siteNoon(nightEphemeris.dateKey, timeZone);
  let startMs = noon.getTime() + 6 * 3600 * 1000;
  let endMs = noon.getTime() + 19 * 3600 * 1000;

  if (nightEphemeris.sunset !== null) {
    startMs = nightEphemeris.sunset.getTime() - 30 * 60 * 1000;
  }
  if (nightEphemeris.sunrise !== null) {
    endMs = nightEphemeris.sunrise.getTime() + 30 * 60 * 1000;
  }

  const stepMs = 30 * 60 * 1000;
  let peakAlt = -90;
  let peakTime: Date | null = null;
  let peakTimeLabel = '--:--';

  let darkPeakAlt = -90;
  let darkPeakTime: Date | null = null;
  let darkPeakTimeLabel = '--:--';

  const obsAltitudes: number[] = [];
  let observableCount = 0;
  let firstObs: Date | null = null;
  let lastObs: Date | null = null;

  for (let tMs = startMs; tMs <= endMs; tMs += stepMs) {
    const instant = new Date(tMs);
    const horiz = getHorizontalCoordinates(
      instant,
      target.ra,
      target.dec,
      latitude,
      longitude
    );
    const alt = Math.round(horiz.altitude * 10) / 10;
    const az = Math.round(horiz.azimuth * 10) / 10;

    const terrainAltitude = getTerrainObstructionAtAzimuth(az, horizonProfile);
    const effectiveFloor = Math.max(minAltitudeDeg, terrainAltitude);

    let isDark = false;
    if (nightEphemeris.astroDusk !== null && nightEphemeris.astroDawn !== null) {
      isDark =
        tMs >= nightEphemeris.astroDusk.getTime() &&
        tMs <= nightEphemeris.astroDawn.getTime();
    }

    const isAboveHorizon = alt > 0;
    const isObservable = alt >= effectiveFloor && isDark;

    if (alt > peakAlt) {
      peakAlt = alt;
      peakTime = instant;
      peakTimeLabel = formatSiteTimeHM(instant, timeZone);
    }

    if (isDark) {
      if (alt > darkPeakAlt) {
        darkPeakAlt = alt;
        darkPeakTime = instant;
        darkPeakTimeLabel = formatSiteTimeHM(instant, timeZone);
      }
      if (isObservable) {
        obsAltitudes.push(alt);
      }
    }

    if (isObservable) {
      observableCount += 1;
      if (firstObs === null) {
        firstObs = instant;
      }
      lastObs = instant;
    }

    points.push({
      time: instant,
      timeMs: tMs,
      timeLabel: formatSiteTimeHM(instant, timeZone),
      altitude: alt,
      azimuth: az,
      terrainAltitude,
      effectiveFloor,
      isDark,
      isAboveHorizon,
      isObservable,
    });
  }

  const observableMinutes = observableCount * 30;
  const observableHours = Math.round((observableMinutes / 60) * 10) / 10;

  const transitInfo = calculateMeridianTransit(
    target,
    nightEphemeris,
    latitude,
    longitude,
    timeZone
  );

  const avgObsAlt =
    obsAltitudes.length > 0
      ? obsAltitudes.reduce((acc, v) => acc + v, 0) / obsAltitudes.length
      : 0;

  const finalDarkPeakAlt = darkPeakAlt > -90 ? darkPeakAlt : peakAlt;
  const finalDarkPeakTime = darkPeakTime ?? peakTime;
  const finalDarkPeakTimeLabel = darkPeakTimeLabel !== '--:--' ? darkPeakTimeLabel : peakTimeLabel;

  const effectivePeakAlt = darkPeakAlt > -90 ? darkPeakAlt : peakAlt;
  const effectivePeakTime = darkPeakTime ?? peakTime;
  const effectivePeakTimeLabel = darkPeakTimeLabel !== '--:--' ? darkPeakTimeLabel : peakTimeLabel;

  let qualityScore = 0;
  if (observableHours <= 0) {
    qualityScore = Math.max(0, Math.min(10, Math.round(effectivePeakAlt * 0.1)));
  } else {
    let darkHours = 8.0;
    if (nightEphemeris.astroDusk !== null && nightEphemeris.astroDawn !== null) {
      darkHours = Math.max(
        1.0,
        (nightEphemeris.astroDawn.getTime() - nightEphemeris.astroDusk.getTime()) / 3600000
      );
    }
    const durScore = Math.min(38, (observableHours / darkHours) * 38);

    const peakAltFactor = Math.max(0, (finalDarkPeakAlt - minAltitudeDeg) / (90 - minAltitudeDeg));
    const avgAltFactor = Math.max(0, (avgObsAlt - minAltitudeDeg) / (80 - minAltitudeDeg));
    const altScore = Math.min(38, peakAltFactor * 22 + avgAltFactor * 16);

    let transitScore = 4;
    if (transitInfo.isDuringDarkness) {
      let midnightMs = noon.getTime() + 12 * 3600 * 1000;
      if (nightEphemeris.astroDusk !== null && nightEphemeris.astroDawn !== null) {
        midnightMs = (nightEphemeris.astroDusk.getTime() + nightEphemeris.astroDawn.getTime()) / 2;
      }
      const distMidHours = Math.abs(transitInfo.transitTime.getTime() - midnightMs) / 3600000;
      transitScore = Math.max(12, 24 - distMidHours * 2.2);
    }

    const totalRaw = durScore + altScore + transitScore;
    qualityScore = Math.max(0, Math.min(100, Math.round(totalRaw)));
  }

  return {
    targetId: target.id,
    points,
    peakAltitude: effectivePeakAlt,
    peakTime: effectivePeakTime,
    peakTimeLabel: effectivePeakTimeLabel,
    darkPeakAltitude: finalDarkPeakAlt,
    darkPeakTime: finalDarkPeakTime,
    darkPeakTimeLabel: finalDarkPeakTimeLabel,
    transitAltitude: transitInfo.transitAltitude,
    transitTime: transitInfo.transitTime,
    transitTimeLabel: transitInfo.transitTimeLabel,
    observableHours,
    observableWindowStart: firstObs,
    observableWindowEnd: lastObs,
    qualityScore,
  };
}

export function analyzeTargetForNight(
  target: AstroTargetItem,
  nightEphemeris: SolarEphemerisDay,
  latitude: number,
  longitude: number,
  timeZone: string,
  minAltitudeDeg: number = 30,
  referenceTime?: Date | null,
  horizonProfile?: readonly number[],
  alarmLeadMinutes: number = 20
): ComprehensiveTargetAnalysis {
  const visibility = calculateTargetVisibilityCurve(
    target,
    nightEphemeris,
    latitude,
    longitude,
    timeZone,
    minAltitudeDeg,
    horizonProfile
  );

  let refInstant = visibility.peakTime;
  if (referenceTime !== null && referenceTime !== undefined) {
    refInstant = referenceTime;
  } else if (refInstant === null) {
    refInstant = siteNoon(nightEphemeris.dateKey, timeZone);
  }

  const lunar = calculateTargetLunarSeparation(target, refInstant, latitude, longitude);

  const meridian = calculateMeridianTransit(
    target,
    nightEphemeris,
    latitude,
    longitude,
    timeZone,
    referenceTime,
    alarmLeadMinutes
  );

  let moonPenalty = 0;
  if (lunar.warningLevel === 'severe') {
    moonPenalty = 30;
  } else if (lunar.warningLevel === 'moderate') {
    moonPenalty = 15;
  }

  const overallScore = Math.max(0, Math.min(100, visibility.qualityScore - moonPenalty));

  let tacticalSummary = '';
  if (overallScore >= 80) {
    tacticalSummary = `Prime imaging window: ${visibility.observableHours}h above ${minAltitudeDeg}° (Peak ${visibility.peakAltitude}° at ${visibility.peakTimeLabel}). Moon clearance optimal.`;
  } else if (overallScore >= 50) {
    tacticalSummary = `Viable observation opportunity: ${visibility.observableHours}h window. ${lunar.warningNote}`;
  } else {
    tacticalSummary = `Challenging conditions: max altitude ${visibility.peakAltitude}°, ${visibility.observableHours}h observable darkness.`;
  }

  return {
    target,
    visibility,
    lunar,
    meridian,
    overallScore,
    tacticalSummary,
  };
}
