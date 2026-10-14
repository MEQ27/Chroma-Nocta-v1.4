import {
  getSiteTimeZone,
  deviceTimeZoneSuggestion,
  isValidTimeZone,
  resolveSite,
  isResolvedSite,
  initialNightKeyForSite,
  partitionSitesByZone,
  siteParts,
  currentNightKey,
} from '../src/lib/siteTime';
import { calculateNightEphemeris, formatTimeHM } from '../src/lib/ephemeris';
import { LocationData, ResolvedSite } from '../src/types';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — SAHA SAAT DİLİMİ SINIR DENETİMİ (site-timezone-check)');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

function assert(description: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  🟢 [GEÇTİ] ${description}`);
    passCount++;
  } else {
    console.error(`  ❌ [BAŞARISIZ] ${description} ${detail ? `(${detail})` : ''}`);
    failCount++;
  }
}

console.log('─── TEST 1: getSiteTimeZone(site) Doğrulaması ───');

// Case 1: Valid timeZone
const site1 = { timeZone: 'Europe/Istanbul' } as LocationData;
assert(
  "getSiteTimeZone({ timeZone: 'Europe/Istanbul' }) === 'Europe/Istanbul'",
  getSiteTimeZone(site1) === 'Europe/Istanbul',
  `Bulunan: ${getSiteTimeZone(site1)}`
);

// Case 2: Empty object (no timeZone)
const site2 = {} as LocationData;
assert(
  'getSiteTimeZone({}) === null',
  getSiteTimeZone(site2) === null,
  `Bulunan: ${getSiteTimeZone(site2)}`
);

// Case 3: Empty string timeZone
const site3 = { timeZone: '' } as LocationData;
assert(
  "getSiteTimeZone({ timeZone: '' }) === null",
  getSiteTimeZone(site3) === null,
  `Bulunan: ${getSiteTimeZone(site3)}`
);

// Case 4: Invalid IANA timeZone
const site4 = { timeZone: 'Mars/Olympus' } as unknown as LocationData;
assert(
  "getSiteTimeZone({ timeZone: 'Mars/Olympus' }) === null",
  getSiteTimeZone(site4) === null,
  `Bulunan: ${getSiteTimeZone(site4)}`
);

// Case 5: undefined site
assert(
  'getSiteTimeZone(undefined) === null',
  getSiteTimeZone(undefined) === null,
  `Bulunan: ${getSiteTimeZone(undefined)}`
);

// Case 6: null site
assert(
  'getSiteTimeZone(null) === null',
  getSiteTimeZone(null) === null,
  `Bulunan: ${getSiteTimeZone(null)}`
);

console.log('\n─── TEST 2: deviceTimeZoneSuggestion() Doğrulaması ───');
const suggestion = deviceTimeZoneSuggestion();
assert(
  'deviceTimeZoneSuggestion() geçerli bir IANA string veya null dönmeli',
  suggestion === null || (typeof suggestion === 'string' && isValidTimeZone(suggestion)),
  `Dönen değer: ${suggestion}`
);

console.log('\n─── TEST 3: resolveSite(site) Doğrulaması ───');
const siteValid = {
  id: 'bolu-sarialan',
  name: 'Bolu Sarıalan Yaylası',
  latitude: 40.612,
  longitude: 31.684,
  elevation: 1550,
  horizonDip: 1.15,
  timeZone: 'Europe/Istanbul',
} as LocationData;
const resolvedValid = resolveSite(siteValid);
assert(
  'resolveSite(siteWithValidTz) returns the site object typed with timeZone string',
  resolvedValid !== null && resolvedValid.timeZone === 'Europe/Istanbul' && resolvedValid.name === 'Bolu Sarıalan Yaylası',
  `Bulunan: ${JSON.stringify(resolvedValid)}`
);

assert(
  'resolveSite({}) === null',
  resolveSite({} as LocationData) === null,
  `Bulunan: ${resolveSite({} as LocationData)}`
);

assert(
  'resolveSite(null) === null',
  resolveSite(null) === null,
  `Bulunan: ${resolveSite(null)}`
);

assert(
  "resolveSite({ timeZone: 'Invalid/Zone' }) === null",
  resolveSite({ timeZone: 'Invalid/Zone' } as unknown as LocationData) === null,
  `Bulunan: ${resolveSite({ timeZone: 'Invalid/Zone' } as unknown as LocationData)}`
);

console.log('\n─── TEST 4: initialNightKeyForSite(site, nowMs) Doğrulaması ───');
const testNowMs = Date.UTC(2026, 9, 10, 9, 0, 0); // 2026-10-10 09:00:00 UTC

const siteIstanbul = {
  id: 'site-ist',
  name: 'Istanbul Site',
  latitude: 41.0,
  longitude: 29.0,
  elevation: 100,
  horizonDip: 0.29,
  timeZone: 'Europe/Istanbul',
} as LocationData;
const istNightKey = initialNightKeyForSite(siteIstanbul, testNowMs);
assert(
  "initialNightKeyForSite(siteIstanbul, testNowMs) === '2026-10-10'",
  istNightKey === '2026-10-10',
  `Bulunan: ${istNightKey}`
);

const siteSantiago = {
  id: 'site-scl',
  name: 'Santiago Site',
  latitude: -33.4,
  longitude: -70.6,
  elevation: 500,
  horizonDip: 0.65,
  timeZone: 'America/Santiago',
} as LocationData;
const sclNightKey = initialNightKeyForSite(siteSantiago, testNowMs);
assert(
  "initialNightKeyForSite(siteSantiago, testNowMs) === '2026-10-09'",
  sclNightKey === '2026-10-09',
  `Bulunan: ${sclNightKey}`
);

const siteNoTz = {
  id: 'site-notz',
  name: 'No Timezone Site',
  latitude: 38.0,
  longitude: 35.0,
  elevation: 1000,
  horizonDip: 0.92,
} as LocationData;
const noTzNightKey = initialNightKeyForSite(siteNoTz, testNowMs);
assert(
  'initialNightKeyForSite(siteNoTz, testNowMs) === null',
  noTzNightKey === null,
  `Bulunan: ${noTzNightKey}`
);

console.log('\n─── TEST 5: partitionSitesByZone(sites) Doğrulaması ───');
const siteWithValidTz = {
  id: 'site-valid-1',
  name: 'Valid Zone Site',
  latitude: 40.0,
  longitude: 30.0,
  elevation: 1000,
  horizonDip: 0.9,
  timeZone: 'Europe/Istanbul',
} as LocationData;

const siteWithoutTz = {
  id: 'site-notz-2',
  name: 'Missing Zone Site',
  latitude: 39.0,
  longitude: 29.0,
  elevation: 500,
  horizonDip: 0.6,
} as LocationData;

const siteWithInvalidTz = {
  id: 'site-invtz-3',
  name: 'Mars Site',
  latitude: 38.0,
  longitude: 28.0,
  elevation: 800,
  horizonDip: 0.8,
  timeZone: 'Mars/Olympus',
} as unknown as LocationData;

const partitionInput = [siteWithValidTz, siteWithoutTz, siteWithInvalidTz];
const partitionResult = partitionSitesByZone(partitionInput);

assert(
  'partitionSitesByZone preserves order and splits resolved vs unresolved',
  partitionResult.resolved.length === 1 &&
    partitionResult.resolved[0].id === 'site-valid-1' &&
    typeof (partitionResult.resolved[0] as ResolvedSite).timeZone === 'string' &&
    partitionResult.resolved[0].timeZone === 'Europe/Istanbul' &&
    partitionResult.unresolved.length === 2 &&
    partitionResult.unresolved[0].id === 'site-notz-2' &&
    partitionResult.unresolved[1].id === 'site-invtz-3',
  `Bulunan: resolved=${partitionResult.resolved.map(s => s.id).join(',')} unresolved=${partitionResult.unresolved.map(s => s.id).join(',')}`
);

const emptyPartitionResult = partitionSitesByZone([]);
assert(
  'partitionSitesByZone([]) returns empty arrays',
  emptyPartitionResult.resolved.length === 0 && emptyPartitionResult.unresolved.length === 0,
  `Bulunan: resolved=${emptyPartitionResult.resolved.length} unresolved=${emptyPartitionResult.unresolved.length}`
);

console.log('\n─── TEST 6: Core Functions Timezone & Timestamp Doğrulaması (R1.7d-4b) ───');
let sitePartsThrew = false;
let sitePartsErrorMsg = '';
try {
  siteParts(Date.UTC(2026, 9, 10, 9, 0, 0), 'Mars/Olympus');
} catch (e: unknown) {
  sitePartsThrew = true;
  sitePartsErrorMsg = e instanceof Error ? e.message : String(e);
}
assert(
  "siteParts(..., 'Mars/Olympus') throws an Error naming the invalid timezone",
  sitePartsThrew && sitePartsErrorMsg === 'Invalid time zone: Mars/Olympus',
  `Threw: ${sitePartsThrew}, msg: ${sitePartsErrorMsg}`
);

let ephemThrew = false;
let ephemErrorMsg = '';
try {
  calculateNightEphemeris('2026-10-10', 40.6, 31.7, 100, '' as unknown as string);
} catch (e: unknown) {
  ephemThrew = true;
  ephemErrorMsg = e instanceof Error ? e.message : String(e);
}
assert(
  "calculateNightEphemeris(..., '') throws an Error",
  ephemThrew && ephemErrorMsg === 'Invalid time zone: ',
  `Threw: ${ephemThrew}, msg: ${ephemErrorMsg}`
);

const nightKeyRes = currentNightKey(Date.UTC(2026, 9, 10, 9, 0, 0), 'Europe/Istanbul');
assert(
  "currentNightKey(Date.UTC(2026, 9, 10, 9, 0, 0), 'Europe/Istanbul') === '2026-10-10'",
  nightKeyRes === '2026-10-10',
  `Bulunan: ${nightKeyRes}`
);

const timeHMRes = formatTimeHM(new Date(Date.UTC(2026, 9, 10, 9, 0, 0)), 'America/Santiago');
assert(
  "formatTimeHM(new Date(Date.UTC(2026, 9, 10, 9, 0, 0)), 'America/Santiago') === '06:00'",
  timeHMRes === '06:00',
  `Bulunan: ${timeHMRes}`
);

console.log('\n─── TEST 7: isResolvedSite Type Guard Doğrulaması (R1.7e-b) ───');

assert(
  'isResolvedSite(null) === false',
  isResolvedSite(null) === false
);

assert(
  'isResolvedSite(undefined) === false',
  isResolvedSite(undefined) === false
);

const siteNoTzFixture: LocationData = {
  id: 'site-no-tz-guard',
  name: 'No TZ Guard',
  latitude: 40.0,
  longitude: 30.0,
  elevation: 1000,
  horizonDip: 0.9,
};
assert(
  'isResolvedSite({}-shaped LocationData without timeZone) === false',
  isResolvedSite(siteNoTzFixture) === false
);

const siteEmptyTzFixture: LocationData = {
  id: 'site-empty-tz-guard',
  name: 'Empty TZ Guard',
  latitude: 40.0,
  longitude: 30.0,
  elevation: 1000,
  horizonDip: 0.9,
  timeZone: '',
};
assert(
  "isResolvedSite({ timeZone: '' }) === false",
  isResolvedSite(siteEmptyTzFixture) === false
);

const siteInvalidTzFixture: LocationData = {
  id: 'site-invalid-tz-guard',
  name: 'Invalid TZ Guard',
  latitude: 40.0,
  longitude: 30.0,
  elevation: 1000,
  horizonDip: 0.9,
  timeZone: 'Mars/Olympus',
};
assert(
  "isResolvedSite({ timeZone: 'Mars/Olympus' }) === false",
  isResolvedSite(siteInvalidTzFixture) === false
);

const siteValidTzFixture: LocationData = {
  id: 'site-valid-tz-guard',
  name: 'Valid TZ Guard',
  latitude: 41.0,
  longitude: 29.0,
  elevation: 100,
  horizonDip: 0.29,
  timeZone: 'Europe/Istanbul',
};
assert(
  "isResolvedSite({ timeZone: 'Europe/Istanbul' }) === true",
  isResolvedSite(siteValidTzFixture) === true
);

assert(
  'resolveSite(x) must return the same object reference when isResolvedSite(x) is true, and null otherwise',
  resolveSite(siteValidTzFixture) === siteValidTzFixture &&
    resolveSite(siteNoTzFixture) === null
);

// Compile-time narrowing proof
const maybe: LocationData | null = siteValidTzFixture;
let narrowedTz = '';
if (isResolvedSite(maybe)) {
  const tz: string = maybe.timeZone;
  narrowedTz = tz;
}

assert(
  'isResolvedSite compile-time narrowing proof (daraltılan timeZone string olarak okunur)',
  narrowedTz === 'Europe/Istanbul'
);

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`  SONUÇ: ${passCount} geçti, ${failCount} başarısız.`);
console.log('═══════════════════════════════════════════════════════════════════════\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
