/**
 * C2 ÇEKİRDEK DENETİMİ: UFUK DÜŞÜMÜ (DIP) TERCİHİ VE ARAZİ ENGELİ AYRIMI (horizon-dip-check.ts)
 *
 * Denetlenen Alanlar:
 *  1. NOAA 0m Uyumu (Dipsiz Test): useDip: false durumunda yüksek rakımlı sahanın
 *     (Erzurum DAG 2420m) 0m matematiksel referansıyla 1:1 saniyesine kadar örtüşmesi.
 *  2. Yüksek Rakım Geometrik Dip Testi: useDip: true durumunda dip etkisinin (~1.7°)
 *     gün batımını geciktirmesi ve gün doğumunu öne çekmesi.
 *  3. Dağ Maskesi Baskınlığı: Batı yönünde 3° dağ engeli varken geometric dip'in
 *     dağ tarafından ezilmesi ve batımın dağ irtifasına göre hesaplanması.
 *  4. Alacakaranlık İzolasyonu: useDip açık veya kapalı olsa da astroDusk ve astroDawn
 *     (-18°) anlarının milisaniyesine kadar değişmez kalması.
 */

import { calculateNightEphemeris, horizonDipDegrees } from '../src/lib/ephemeris';
import { formatSiteTimeHM } from '../src/lib/siteTime';
import { getStoredFavorites } from '../src/lib/coordinateParser';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — C2 UFUK DÜŞÜMÜ (DIP) VE ARAZİ ENGELİ DENETİMİ');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  🟢 [GEÇTİ] ${testName} ${detail ? `(${detail})` : ''}`);
  } else {
    console.error(`  🔴 [BAŞARISIZ] ${testName}: ${detail}`);
    process.exitCode = 1;
  }
}

const DATE_KEY = '2026-10-08';
const ERZURUM_LAT = 39.778;
const ERZURUM_LON = 41.228;
const ERZURUM_ELEV = 2420; // 2.420 metre rakım
const ERZURUM_TZ = 'Europe/Istanbul';

// ---------------------------------------------------------------------------
// TEST 1: NOAA 0m Uyumu (Dipsiz Matematiksel Eşitlik)
// ---------------------------------------------------------------------------
console.log('─── TEST 1: NOAA 0m Uyumu (useDip: false vs Elevation: 0m) ───');
// 2420m rakımda useDip: false ile hesaplanan ephemeris
const ephemDipFalse = calculateNightEphemeris(
  DATE_KEY,
  ERZURUM_LAT,
  ERZURUM_LON,
  ERZURUM_ELEV,
  ERZURUM_TZ,
  undefined,
  false // useDip = false
);

// 0m rakımda hesaplanan ephemeris
const ephem0m = calculateNightEphemeris(
  DATE_KEY,
  ERZURUM_LAT,
  ERZURUM_LON,
  0, // 0 metre
  ERZURUM_TZ,
  undefined,
  false
);

assert(
  ephemDipFalse.sunset !== null && ephem0m.sunset !== null,
  'T1.1 Sunset değerleri mevcut'
);
if (ephemDipFalse.sunset && ephem0m.sunset) {
  const diffSunsetMs = Math.abs(ephemDipFalse.sunset.getTime() - ephem0m.sunset.getTime());
  assert(
    diffSunsetMs < 1000,
    'T1.2 useDip: false yüksek rakımda 0m NOAA referansıyla saniyesine kadar aynı sunset üretiyor',
    `Fark: ${diffSunsetMs} ms`
  );
}

assert(
  ephemDipFalse.sunrise !== null && ephem0m.sunrise !== null,
  'T1.3 Sunrise değerleri mevcut'
);
if (ephemDipFalse.sunrise && ephem0m.sunrise) {
  const diffSunriseMs = Math.abs(ephemDipFalse.sunrise.getTime() - ephem0m.sunrise.getTime());
  assert(
    diffSunriseMs < 1000,
    'T1.4 useDip: false yüksek rakımda 0m NOAA referansıyla saniyesine kadar aynı sunrise üretiyor',
    `Fark: ${diffSunriseMs} ms`
  );
}

// ---------------------------------------------------------------------------
// TEST 2: Yüksek Rakım Geometrik Dip Testi (useDip: true)
// ---------------------------------------------------------------------------
console.log('\n─── TEST 2: Yüksek Rakım Geometrik Dip Etkisi (useDip: true) ───');
// 2420m rakımda geometrik dip aktif (dip ≈ 1.71°)
const ephemDipTrue = calculateNightEphemeris(
  DATE_KEY,
  ERZURUM_LAT,
  ERZURUM_LON,
  ERZURUM_ELEV,
  ERZURUM_TZ,
  undefined,
  true // useDip = true
);

if (ephemDipTrue.sunset && ephemDipFalse.sunset) {
  const sunsetDelaySec = (ephemDipTrue.sunset.getTime() - ephemDipFalse.sunset.getTime()) / 1000;
  assert(
    sunsetDelaySec > 300, // En az 5 dakika gecikmeli
    'T2.1 Geometrik dip (~1.7°) gün batımını geciktiriyor',
    `Gecikme: ${sunsetDelaySec.toFixed(1)} sn (${(sunsetDelaySec / 60).toFixed(1)} dk)`
  );
}

if (ephemDipTrue.sunrise && ephemDipFalse.sunrise) {
  const sunriseAdvanceSec = (ephemDipFalse.sunrise.getTime() - ephemDipTrue.sunrise.getTime()) / 1000;
  assert(
    sunriseAdvanceSec > 300, // En az 5 dakika erken doğmalı
    'T2.2 Geometrik dip (~1.7°) gün doğumunu öne çekiyor',
    `Erken Doğuş: ${sunriseAdvanceSec.toFixed(1)} sn (${(sunriseAdvanceSec / 60).toFixed(1)} dk)`
  );
}

// ---------------------------------------------------------------------------
// TEST 3: Dağ Maskesi Çakışması (Dağ Engeli Dip'i Ezer)
// ---------------------------------------------------------------------------
console.log('\n─── TEST 3: Dağ Maskesi Baskınlığı (Batı Yönünde 3° Dağ Engeli) ───');
// 8 yön profili: [K, KD, D, GD, G, GB, B, KB] -> B (Batı) = index 6
const westMountainProfile = [0, 0, 0, 0, 0, 0, 3.0, 0];

const ephemMountainDipTrue = calculateNightEphemeris(
  DATE_KEY,
  ERZURUM_LAT,
  ERZURUM_LON,
  ERZURUM_ELEV,
  ERZURUM_TZ,
  westMountainProfile,
  true // useDip = true
);

const ephemMountainDipFalse = calculateNightEphemeris(
  DATE_KEY,
  ERZURUM_LAT,
  ERZURUM_LON,
  ERZURUM_ELEV,
  ERZURUM_TZ,
  westMountainProfile,
  false // useDip = false
);

// a) Dağ varsa useDip açık da olsa kapalı da olsa sunset aynı olmalıdır (dağ dip'i ezer)
if (ephemMountainDipTrue.sunset && ephemMountainDipFalse.sunset) {
  const diffMountainSunsetMs = Math.abs(
    ephemMountainDipTrue.sunset.getTime() - ephemMountainDipFalse.sunset.getTime()
  );
  assert(
    diffMountainSunsetMs < 1000,
    'T3.1 Dağ engeli varken dip tamamen baskılanıyor (DipTrue ve DipFalse sunset eşit)',
    `Fark: ${diffMountainSunsetMs} ms`
  );
}

// b) Dağ arkasına batan Güneş, düz ufuk gün batımından çok daha erken batmalıdır
if (ephemMountainDipTrue.sunset && ephemDipTrue.sunset) {
  const mountainSunsetAdvanceSec =
    (ephemDipTrue.sunset.getTime() - ephemMountainDipTrue.sunset.getTime()) / 1000;
  assert(
    mountainSunsetAdvanceSec > 600, // 3° dağ batımı en az 10-15 dk öne çeker
    'T3.2 3° dağ arkasına batış, düz ufka göre belirgin erken gerçekleşiyor',
    `Erken batış: ${(mountainSunsetAdvanceSec / 60).toFixed(1)} dk`
  );
}

// ---------------------------------------------------------------------------
// TEST 4: Alacakaranlık İzolasyonu (astroDusk / astroDawn Değişmezliği)
// ---------------------------------------------------------------------------
console.log('\n─── TEST 4: Alacakaranlık İzolasyonu (Atmosferik Saçılma Kuralı) ───');
// -18° astronomik karanlık eşiğine dip asla eklenmemelidir
if (ephemDipTrue.astroDusk && ephemDipFalse.astroDusk) {
  const diffDuskMs = Math.abs(ephemDipTrue.astroDusk.getTime() - ephemDipFalse.astroDusk.getTime());
  assert(
    diffDuskMs === 0,
    'T4.1 astroDusk (-18°) useDip tercihinden 0 ms sapmayla tamamen izole',
    `Fark: ${diffDuskMs} ms`
  );
}

if (ephemDipTrue.astroDawn && ephemDipFalse.astroDawn) {
  const diffDawnMs = Math.abs(ephemDipTrue.astroDawn.getTime() - ephemDipFalse.astroDawn.getTime());
  assert(
    diffDawnMs === 0,
    'T4.2 astroDawn (-18°) useDip tercihinden 0 ms sapmayla tamamen izole',
    `Fark: ${diffDawnMs} ms`
  );
}

// Options nesne arayüzü testi ({ useDip: false })
const ephemOptionsObj = calculateNightEphemeris(
  DATE_KEY,
  ERZURUM_LAT,
  ERZURUM_LON,
  ERZURUM_ELEV,
  ERZURUM_TZ,
  undefined,
  { useDip: false }
);
assert(
  ephemOptionsObj.sunset?.getTime() === ephemDipFalse.sunset?.getTime(),
  'T4.3 { useDip: false } nesne formatı parametresi boolean ile özdeş sonuç veriyor'
);

// ---------------------------------------------------------------------------
// TEST 5: horizonDipDegrees Doğrulama ve Depolama Yeniden Hesabı
// ---------------------------------------------------------------------------
console.log('\n─── TEST 5: horizonDipDegrees Doğrulama ve Depolama Yeniden Hesabı ───');

// Check 12
assert(
  horizonDipDegrees(0) === 0,
  'T5.1 horizonDipDegrees(0) === 0',
  `Değer: ${horizonDipDegrees(0)}`
);

// Check 13
assert(
  Math.abs(horizonDipDegrees(100) - 0.293) <= 0.001,
  'T5.2 horizonDipDegrees(100) === 0.293 (±0.001)',
  `Değer: ${horizonDipDegrees(100)}`
);

// Check 14
assert(
  Math.abs(horizonDipDegrees(1000) - 0.9266) <= 0.001,
  'T5.3 horizonDipDegrees(1000) === 0.9266 (±0.001)',
  `Değer: ${horizonDipDegrees(1000)}`
);

// Check 15
assert(
  Math.abs(horizonDipDegrees(3170) - 1.6497) <= 0.001,
  'T5.4 horizonDipDegrees(3170) === 1.6497 (±0.001)',
  `Değer: ${horizonDipDegrees(3170)}`
);

// Check 16 (Storage recomputation test)
const mockStorage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, val: string) => mockStorage.set(key, String(val)),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
  key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
  get length() {
    return mockStorage.size;
  },
};
(globalThis as any).localStorage = mockLocalStorage;

mockStorage.set(
  'chroma_nocta_favorite_locations',
  JSON.stringify([
    {
      id: 'custom-site',
      name: 'Custom Site',
      latitude: 40.0,
      longitude: 30.0,
      elevation: 1550,
      horizonDip: 9.99,
      timeZone: 'Europe/Istanbul',
    },
  ])
);

const loadedFavorites = getStoredFavorites();
const expectedDip = horizonDipDegrees(1550);
const actualDip = loadedFavorites[0]?.horizonDip;
assert(
  actualDip === expectedDip,
  'T5.5 getStoredFavorites() recomputes horizonDip from elevation (not 9.99)',
  `Beklenen: ${expectedDip}, Bulunan: ${actualDip}`
);

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`  SONUÇ: ${passedTests}/${totalTests} BİRİM TEST TAM GEÇTİ`);
console.log('═══════════════════════════════════════════════════════════════════════\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
