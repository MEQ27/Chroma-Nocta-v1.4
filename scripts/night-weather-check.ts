/**
 * scripts/night-weather-check.ts
 *
 * Unit tests for summarizeSiteNightWeather covering:
 * 1. Fallback sourceType with empty points -> hasData: false, Offline message
 * 2. High-latitude white night (Tromsø, summer solstice) -> hasData: false, White night message
 * 3. Out-of-range targetDateKey (>16 days) -> hasData: false, Out of range message
 * 4. Synthetic overcast night (avg cloud > 65%) -> hasData: true, cloudSummary: 'Overcast and opaque all night.'
 * 5. Synthetic crystal clear night (avg cloud < 15%) -> hasData: true, cloudSummary: 'Crystal clear and stable all night.'
 * 6. Edge case with exactly 3 cloud points (validCloudPoints.length < 4) -> hasData: true, cloudSummary: 'Insufficient cloud data', cloudLowStr: '--'
 */
import { summarizeSiteNightWeather } from '../src/lib/nightWeather';
import { LocationData, HourlyWeatherPoint } from '../src/types';
import { calculateNightEphemeris, horizonDipDegrees } from '../src/lib/ephemeris';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` (${detail})` : ''}`);
  }
}

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — NIGHT WEATHER SUMMARY UNIT TESTS');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// Reference now: 2026-10-10 12:00 UTC
const nowMs = Date.UTC(2026, 9, 10, 12, 0, 0); // October 10, 2026

// Standard mock site (Bakırlıtepe)
const mockSite: LocationData = {
  id: 'test-site',
  name: 'Test Site',
  latitude: 36.82,
  longitude: 30.33,
  elevation: 2500,
  horizonDip: horizonDipDegrees(2500),
  timeZone: 'Europe/Istanbul',
};

function createMockPoint(partial: Partial<HourlyWeatherPoint> & { time: Date }): HourlyWeatherPoint {
  return {
    time: partial.time,
    temp: partial.temp ?? 12,
    dewPoint: partial.dewPoint ?? 5,
    dewGap: partial.dewGap ?? 7,
    humidity: partial.humidity ?? 50,
    cloudCover: partial.cloudCover !== undefined ? partial.cloudCover : null,
    cloudCoverLow: partial.cloudCoverLow !== undefined ? partial.cloudCoverLow : null,
    cloudCoverMid: partial.cloudCoverMid !== undefined ? partial.cloudCoverMid : null,
    cloudCoverHigh: partial.cloudCoverHigh !== undefined ? partial.cloudCoverHigh : null,
    windSpeed: partial.windSpeed ?? 10,
    windDirectionDeg: partial.windDirectionDeg ?? 180,
    windDirectionCompass: partial.windDirectionCompass ?? 'G',
    isAstroDark: partial.isAstroDark ?? true,
    isDangerDew: partial.isDangerDew ?? false,
    sunAltitude: partial.sunAltitude ?? -25,
    precipitationProb: partial.precipitationProb ?? 0,
    precipitationAmount: partial.precipitationAmount ?? 0,
    windGust: partial.windGust ?? 15,
    missing: partial.missing ?? [],
  };
}

// --- Test Case 1: sourceType: 'fallback' with points: [] ---
console.log('[Test 1] Fallback source with empty points');
{
  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: [],
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'fallback',
    nowMs,
  });

  assert(result.hasData === false, 'hasData is false for fallback with empty points');
  assert(
    result.cloudSummary === 'Offline — No forecast data cached',
    'cloudSummary is "Offline — No forecast data cached"',
    `Got: ${result.cloudSummary}`
  );
}

// --- Test Case 2: High-latitude white night site ---
console.log('\n[Test 2] High-latitude white night (Tromsø, summer solstice)');
{
  const tromsoSite: LocationData = {
    id: 'tromso',
    name: 'Tromsø',
    latitude: 69.65,
    longitude: 18.96,
    elevation: 10,
    horizonDip: horizonDipDegrees(10),
    timeZone: 'Europe/Oslo',
  };

  const result = summarizeSiteNightWeather({
    site: tromsoSite,
    points: [
      createMockPoint({
        time: new Date('2026-06-21T22:00:00Z'),
        temp: 10,
        humidity: 80,
        cloudCover: 10,
      }),
    ],
    targetDateKey: '2026-06-21',
    siteTz: 'Europe/Oslo',
    units: 'metric',
    sourceType: 'live',
    nowMs: Date.UTC(2026, 5, 21, 12, 0, 0),
  });

  assert(result.hasData === false, 'hasData is false during White Night');
  assert(
    result.cloudSummary === 'White night / No darkness',
    'cloudSummary is "White night / No darkness"',
    `Got: ${result.cloudSummary}`
  );
  assert(result.windowLabel === '[White Night]', 'windowLabel is "[White Night]"');
}

// --- Test Case 3: Target date >16 days in the future ---
console.log('\n[Test 3] Target date out of forecast range (>16 days)');
{
  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: [
      createMockPoint({
        time: new Date('2026-11-01T20:00:00Z'),
        temp: 10,
        humidity: 60,
        cloudCover: 20,
      }),
    ],
    targetDateKey: '2026-11-01', // 22 days after Oct 10
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(result.hasData === false, 'hasData is false for out-of-range date');
  assert(
    result.cloudSummary === 'Forecast out of range (Ephemeris-based planning).',
    'cloudSummary is "Forecast out of range (Ephemeris-based planning)."',
    `Got: ${result.cloudSummary}`
  );
}

// Helper to generate hourly points across the night
function generateNightPoints(
  dateKey: string,
  site: LocationData,
  tz: string,
  cloudCover: number,
  low: number = 0,
  mid: number = 0,
  high: number = 0
): HourlyWeatherPoint[] {
  const ephem = calculateNightEphemeris(dateKey, site.latitude, site.longitude, site.elevation, tz);
  const dusk = ephem.astroDusk?.getTime() ?? ephem.nauticalDusk!.getTime();
  const dawn = ephem.astroDawn?.getTime() ?? ephem.nauticalDawn!.getTime();

  const points: HourlyWeatherPoint[] = [];
  // Generate points every hour covering the whole 24 hours of that night
  for (let t = dusk - 3600000; t <= dawn + 3600000; t += 3600000) {
    points.push(
      createMockPoint({
        time: new Date(t),
        temp: 12,
        humidity: 45,
        cloudCover,
        cloudCoverLow: low,
        cloudCoverMid: mid,
        cloudCoverHigh: high,
        windSpeed: 10,
        windGust: 15,
        precipitationProb: 0,
        precipitationAmount: 0,
      })
    );
  }
  return points;
}

// --- Test Case 4: Synthetic overcast night ---
console.log('\n[Test 4] Synthetic overcast night (>65% clouds)');
{
  const overcastPoints = generateNightPoints('2026-10-10', mockSite, 'Europe/Istanbul', 90, 20, 20, 20);
  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: overcastPoints,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(result.hasData === true, 'hasData is true with full forecast points');
  assert(result.avgNightCloud === 90, `avgNightCloud is 90 (got ${result.avgNightCloud})`);
  assert(
    result.cloudSummary === 'Overcast and opaque all night.',
    'cloudSummary is "Overcast and opaque all night."',
    `Got: ${result.cloudSummary}`
  );
}

// --- Test Case 5: Synthetic crystal clear night ---
console.log('\n[Test 5] Synthetic crystal clear night (<15% clouds)');
{
  const clearPoints = generateNightPoints('2026-10-10', mockSite, 'Europe/Istanbul', 5, 0, 0, 0);
  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: clearPoints,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(result.hasData === true, 'hasData is true with full forecast points');
  assert(result.avgNightCloud === 5, `avgNightCloud is 5 (got ${result.avgNightCloud})`);
  assert(
    result.cloudSummary === 'Crystal clear and stable all night.',
    'cloudSummary is "Crystal clear and stable all night."',
    `Got: ${result.cloudSummary}`
  );
}

// --- Test Case 6: Edge case with exactly 3 cloud points (validCloudPoints < 4) ---
console.log('\n[Test 6] Partial night edge case with exactly 3 cloud points');
{
  const ephem = calculateNightEphemeris('2026-10-10', mockSite.latitude, mockSite.longitude, mockSite.elevation, 'Europe/Istanbul');
  const dusk = ephem.astroDusk?.getTime() ?? ephem.nauticalDusk!.getTime();

  // Exactly 3 points within the night window
  const threePoints: HourlyWeatherPoint[] = [
    createMockPoint({
      time: new Date(dusk + 1000),
      temp: 10,
      humidity: 50,
      cloudCover: 5,
      cloudCoverLow: 2,
      cloudCoverMid: 1,
      cloudCoverHigh: 0,
      windSpeed: 8,
    }),
    createMockPoint({
      time: new Date(dusk + 3600000),
      temp: 9,
      humidity: 55,
      cloudCover: 5,
      cloudCoverLow: 2,
      cloudCoverMid: 1,
      cloudCoverHigh: 0,
      windSpeed: 8,
    }),
    createMockPoint({
      time: new Date(dusk + 7200000),
      temp: 8,
      humidity: 60,
      cloudCover: 5,
      cloudCoverLow: 2,
      cloudCoverMid: 1,
      cloudCoverHigh: 0,
      windSpeed: 8,
    }),
  ];

  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: threePoints,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(result.hasData === true, 'hasData is true (nightPoints.length >= 1)');
  assert(result.cloudLowStr === '--', `cloudLowStr is '--' when points < 4 (got '${result.cloudLowStr}')`);
  assert(result.cloudMidStr === '--', `cloudMidStr is '--' when points < 4 (got '${result.cloudMidStr}')`);
  assert(result.cloudHighStr === '--', `cloudHighStr is '--' when points < 4 (got '${result.cloudHighStr}')`);
  assert(
    result.cloudSummary === 'Insufficient cloud data',
    'cloudSummary is "Insufficient cloud data"',
    `Got: ${result.cloudSummary}`
  );
  // (a) Assert avgNightCloud is strictly null
  assert(result.avgNightCloud === null, `avgNightCloud is null when points < 4 (got ${result.avgNightCloud})`);
  assert(result.cloudLow === null, `cloudLow is null when points < 4 (got ${result.cloudLow})`);
  assert(result.cloudMid === null, `cloudMid is null when points < 4 (got ${result.cloudMid})`);
  assert(result.cloudHigh === null, `cloudHigh is null when points < 4 (got ${result.cloudHigh})`);
}

// --- Test Case 7: Partial Night Marker (3 valid points inside dark window) ---
console.log('\n[Test 7] Partial Night Marker (3 valid hourly points inside dark window)');
{
  const ephem = calculateNightEphemeris('2026-10-10', mockSite.latitude, mockSite.longitude, mockSite.elevation, 'Europe/Istanbul');
  const dusk = ephem.astroDusk?.getTime() ?? ephem.nauticalDusk!.getTime();
  const dawn = ephem.astroDawn?.getTime() ?? ephem.nauticalDawn!.getTime();
  const expectedHours = Math.floor((dawn - dusk) / 3600000);

  const threePoints: HourlyWeatherPoint[] = [
    createMockPoint({ time: new Date(dusk + 1000) }),
    createMockPoint({ time: new Date(dusk + 3600000) }),
    createMockPoint({ time: new Date(dusk + 7200000) }),
  ];

  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: threePoints,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(result.isPartial === true, 'isPartial === true for 3 points', `Got: ${result.isPartial}`);
  assert(result.validHours === 3, `validHours === 3 (got ${result.validHours})`);
  assert(
    result.expectedHours === expectedHours,
    `expectedHours === ${expectedHours} (got ${result.expectedHours})`
  );
}

// --- Test Case 8: Full coverage across dark window ---
console.log('\n[Test 8] Full coverage across dark window');
{
  const fullPoints = generateNightPoints('2026-10-10', mockSite, 'Europe/Istanbul', 20);
  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: fullPoints,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(result.isPartial === false, 'isPartial === false for full coverage', `Got: ${result.isPartial}`);
}

// --- Test Case 9: All hourly points have cloudCover: null ---
console.log('\n[Test 9] All hourly points have cloudCover: null, other fields valid');
{
  const ephem = calculateNightEphemeris('2026-10-10', mockSite.latitude, mockSite.longitude, mockSite.elevation, 'Europe/Istanbul');
  const dusk = ephem.astroDusk?.getTime() ?? ephem.nauticalDusk!.getTime();
  const dawn = ephem.astroDawn?.getTime() ?? ephem.nauticalDawn!.getTime();

  const pointsWithoutCloud: HourlyWeatherPoint[] = [];
  for (let t = dusk - 3600000; t <= dawn + 3600000; t += 3600000) {
    pointsWithoutCloud.push(
      createMockPoint({
        time: new Date(t),
        temp: 12,
        humidity: 45,
        cloudCover: null,
        cloudCoverLow: null,
        cloudCoverMid: null,
        cloudCoverHigh: null,
        windSpeed: 10,
        windGust: 15,
        precipitationProb: 0,
        precipitationAmount: 0,
      })
    );
  }

  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: pointsWithoutCloud,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(result.avgNightCloud === null, `avgNightCloud === null when all clouds are null (got ${result.avgNightCloud})`);
  assert(result.cloudLowStr === '--', `cloudLowStr === '--' (got '${result.cloudLowStr}')`);
  assert(result.cloudMidStr === '--', `cloudMidStr === '--' (got '${result.cloudMidStr}')`);
  assert(result.cloudHighStr === '--', `cloudHighStr === '--' (got '${result.cloudHighStr}')`);
}

// --- Test Case 10: Active-night regression (Bolu site, 00:30 on 2026-10-10 site time, targetDateKey 2026-10-09) ---
console.log('\n[Test 10] Active-night regression (Bolu, targetDateKey 2026-10-09, nowMs at 00:30 2026-10-10)');
{
  const boluSite: LocationData = {
    id: 'bolu-site',
    name: 'Bolu Observatory',
    latitude: 40.612,
    longitude: 31.684,
    elevation: 1550,
    horizonDip: horizonDipDegrees(1550),
    timeZone: 'Europe/Istanbul',
  };

  // 00:30 on 2026-10-10 in Europe/Istanbul is 21:30 UTC on 2026-10-09
  const boluNowMs = Date.UTC(2026, 9, 9, 21, 30, 0);

  // Live points available from 2026-10-09 00:00 UTC through 2026-10-10 12:00 UTC
  const points: HourlyWeatherPoint[] = [];
  const startMs = Date.UTC(2026, 9, 9, 0, 0, 0);
  const endMs = Date.UTC(2026, 9, 10, 12, 0, 0);
  for (let t = startMs; t <= endMs; t += 3600000) {
    points.push(
      createMockPoint({
        time: new Date(t),
        temp: 8,
        humidity: 60,
        cloudCover: 10,
        cloudCoverLow: 5,
        cloudCoverMid: 0,
        cloudCoverHigh: 0,
        windSpeed: 5,
        windGust: 10,
      })
    );
  }

  const result = summarizeSiteNightWeather({
    site: boluSite,
    points,
    targetDateKey: '2026-10-09',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs: boluNowMs,
  });

  assert(result.hasData === true, 'hasData === true for active night session', `Got hasData=${result.hasData}`);
}

// --- Test Case 11: Out-of-range guard priority (targetDateKey 17 days ahead, sourceType: 'fallback', points: []) ---
console.log('\n[Test 11] Guard order: targetDateKey 17 days ahead with fallback empty points');
{
  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: [],
    targetDateKey: '2026-10-27', // 17 days after Oct 10
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'fallback',
    nowMs,
  });

  assert(
    result.cloudSummary === 'Forecast out of range (Ephemeris-based planning).',
    'cloudSummary === "Forecast out of range (Ephemeris-based planning)."',
    `Got: ${result.cloudSummary}`
  );
}

// --- Test Case 12: Numeric cloud-band fields independently wired ---
console.log('\n[Test 12] Numeric cloud-band fields (cloudLow/cloudMid/cloudHigh) wired to distinct bands');
{
  const bandedPoints = generateNightPoints('2026-10-10', mockSite, 'Europe/Istanbul', 50, 70, 40, 10);
  const result = summarizeSiteNightWeather({
    site: mockSite,
    points: bandedPoints,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(result.cloudLow === 70, `cloudLow is 70 (got ${result.cloudLow})`);
  assert(result.cloudMid === 40, `cloudMid is 40 (got ${result.cloudMid})`);
  assert(result.cloudHigh === 10, `cloudHigh is 10 (got ${result.cloudHigh})`);
  assert(
    String(result.cloudLow) === result.cloudLowStr &&
      String(result.cloudMid) === result.cloudMidStr &&
      String(result.cloudHigh) === result.cloudHighStr,
    'numeric cloud fields and their *Str siblings never diverge',
    `cloudLow=${result.cloudLow}/${result.cloudLowStr}, cloudMid=${result.cloudMid}/${result.cloudMidStr}, cloudHigh=${result.cloudHigh}/${result.cloudHighStr}`
  );
}

// --- Test Case 13: Numeric temperature, humidity, dewGap, and precipitation fields ---
console.log('\n[Test 13] Numeric temperature, humidity, dewGap, and precipitation fields');
{
  const samplePts = generateNightPoints('2026-10-10', mockSite, 'Europe/Istanbul', 20, 10, 20, 30);
  const resLive = summarizeSiteNightWeather({
    site: mockSite,
    points: samplePts,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });
  const resEmpty = summarizeSiteNightWeather({
    site: mockSite,
    points: [],
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'fallback',
    nowMs,
  });
  assert(typeof resLive.nightMinTempC === 'number', `nightMinTempC is number on valid night (got ${resLive.nightMinTempC})`);
  assert(typeof resLive.minDewGapC === 'number', `minDewGapC is number on valid night (got ${resLive.minDewGapC})`);
  assert(typeof resLive.minHumidity === 'number' && typeof resLive.maxHumidity === 'number', 'minHumidity and maxHumidity are numbers');
  assert(typeof resLive.maxPrecipProb === 'number' && typeof resLive.totalPrecipMm === 'number', 'maxPrecipProb and totalPrecipMm are numbers');
  assert(
    resEmpty.nightMinTempC === null &&
      resEmpty.minDewGapC === null &&
      resEmpty.minHumidity === null &&
      resEmpty.maxPrecipProb === null,
    'numeric telemetry fields are strictly null when hasData is false'
  );
}

// --- Test Case 14: Pure Night Imaging Score & Tactical Briefing Engine ---
console.log('\n[Test 14] Pure Night Imaging Score & Tactical Briefing Engine');
{
  const resEmpty = summarizeSiteNightWeather({
    site: mockSite,
    points: [],
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'fallback',
    nowMs,
  });

  assert(
    resEmpty.nightScore.status === 'incomplete' &&
      resEmpty.nightScore.score === null &&
      resEmpty.nightScore.tacticalNotes.length >= 1,
    'resEmpty.nightScore is incomplete with score=null and tacticalNotes present',
    `status=${resEmpty.nightScore.status}, score=${resEmpty.nightScore.score}, notes=${resEmpty.nightScore.tacticalNotes.length}`
  );

  const clearPoints = generateNightPoints('2026-10-10', mockSite, 'Europe/Istanbul', 5, 0, 0, 0);
  const resClear = summarizeSiteNightWeather({
    site: mockSite,
    points: clearPoints,
    targetDateKey: '2026-10-10',
    siteTz: 'Europe/Istanbul',
    units: 'metric',
    sourceType: 'live',
    nowMs,
  });

  assert(
    resClear.nightScore.status === 'scored' &&
      typeof resClear.nightScore.score === 'number' &&
      resClear.nightScore.score >= 75,
    `resClear.nightScore is scored with numeric score >= 75 (got ${resClear.nightScore.score}, grade=${resClear.nightScore.grade})`
  );

  const tromsoSite: LocationData = {
    id: 'tromso',
    name: 'Tromsø',
    latitude: 69.65,
    longitude: 18.96,
    elevation: 10,
    horizonDip: horizonDipDegrees(10),
    timeZone: 'Europe/Oslo',
  };
  const resWhite = summarizeSiteNightWeather({
    site: tromsoSite,
    points: [
      createMockPoint({
        time: new Date('2026-06-21T22:00:00Z'),
        temp: 10,
        humidity: 80,
        cloudCover: 10,
      }),
    ],
    targetDateKey: '2026-06-21',
    siteTz: 'Europe/Oslo',
    units: 'metric',
    sourceType: 'live',
    nowMs: Date.UTC(2026, 5, 21, 12, 0, 0),
  });

  assert(
    resWhite.nightScore.status === 'no-darkness' && resWhite.nightScore.score === null,
    `resWhite.nightScore is no-darkness with score=null (got status=${resWhite.nightScore.status}, score=${resWhite.nightScore.score})`
  );
}

// Summary
console.log('\n───────────────────────────────────────────────────────────────────────');
console.log(`Sonuç: ${passedTests}/${totalTests} test geçti.`);
if (passedTests === totalTests) {
  console.log('🟢 GEÇTİ: summarizeSiteNightWeather tüm durumları başarıyla doğruladı.\n');
  process.exit(0);
} else {
  console.error('🔴 BAŞARISIZ: Bazı testler başarısız oldu.\n');
  process.exit(1);
}
