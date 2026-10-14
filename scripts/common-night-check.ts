/**
 * E1 ÇEKİRDEK TESTİ: ÇOKLU SAHA ORTAK GECE PENCERESİ KESİŞİMİ (common-night-check.ts)
 *
 * Denetlenen Uç Durumlar:
 *  1. Aynı boylamdaki iki saha (Kuzey & Güney) -> Başarılı kesişim
 *  2. Saat dilimi farkı yüksek olan iki saha (Asya & Amerika) -> Kesişim yok (null)
 *  3. Beyaz gece / kutup gündüzü yaşayan saha (null içeren girdi) -> Kesişim yok (null)
 *  4. Geçersiz aralık (dawn <= dusk) veya boş girdi -> Kesişim yok (null)
 *  5. Gerçek efemeris hesaplamalarıyla (Bolu Sarıalan & Erzurum Konaklı) ortak pencere testi
 */

import {
  calculateCommonNightWindow,
  findCommonNightWindowFromEphemeris,
  SiteDarkInterval,
} from '../src/lib/nightWindow';
import { calculateNightEphemeris } from '../src/lib/ephemeris';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — E1 ORTAK GECE PENCERESİ KESİŞİM DENETİMİ');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let passedTests = 0;
let totalTests = 0;

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

// ---------------------------------------------------------------------------
// TEST 1: Aynı Boylamdaki İki Saha (Kuzey & Güney - Kesişim Var)
// ---------------------------------------------------------------------------
console.log('─── TEST 1: Aynı Boylamdaki İki Saha (Kesişen Gece Pencereleri) ───');
// Saha A: 19:00 UTC - 03:00 UTC (8 saat)
// Saha B: 20:30 UTC - 04:30 UTC (8 saat)
// Beklenen Kesişim: 20:30 UTC - 03:00 UTC (6.5 saat = 390 dakika)
const siteNorth: SiteDarkInterval = {
  siteId: 'site-north',
  siteName: 'Kuzey İstasyonu (Boylam 32°E)',
  astroDusk: new Date('2026-10-08T19:00:00Z'),
  astroDawn: new Date('2026-10-09T03:00:00Z'),
};
const siteSouth: SiteDarkInterval = {
  siteId: 'site-south',
  siteName: 'Güney İstasyonu (Boylam 32°E)',
  astroDusk: new Date('2026-10-08T20:30:00Z'),
  astroDawn: new Date('2026-10-09T04:30:00Z'),
};

const res1 = calculateCommonNightWindow([siteNorth, siteSouth]);
assert(res1 !== null, 'T1.1 Ortak pencere null dönmemeli');
assert(
  res1?.start.toISOString() === '2026-10-08T20:30:00.000Z',
  'T1.2 Başlangıç en geç dusk olmalı',
  `Alınan: ${res1?.start.toISOString()}`
);
assert(
  res1?.end.toISOString() === '2026-10-09T03:00:00.000Z',
  'T1.3 Bitiş en erken dawn olmalı',
  `Alınan: ${res1?.end.toISOString()}`
);
assert(
  res1?.durationMinutes === 390,
  'T1.4 Kesişim süresi tam 390 dk olmalı',
  `Alınan: ${res1?.durationMinutes} dk (${res1?.durationHours} sa)`
);

// ---------------------------------------------------------------------------
// TEST 2: Saat Dilimi Farkı Yüksek Olan İki Saha (Kesişmeyen Aralık -> null)
// ---------------------------------------------------------------------------
console.log('\n─── TEST 2: Saat Dilimi Farkı Yüksek İki Saha (Kesişmeyen Aralık) ───');
// Saha Tokyo: 09:30 UTC - 19:30 UTC
// Saha New York: 23:30 UTC - 09:00 UTC (ertesi gün)
// max(dusk) = 23:30, min(dawn) = 19:30 -> max >= min -> kesişim yok
const siteTokyo: SiteDarkInterval = {
  siteId: 'site-tokyo',
  siteName: 'Tokyo Sahası (UTC+9)',
  astroDusk: new Date('2026-10-08T09:30:00Z'),
  astroDawn: new Date('2026-10-08T19:30:00Z'),
};
const siteNewYork: SiteDarkInterval = {
  siteId: 'site-ny',
  siteName: 'New York Sahası (UTC-4)',
  astroDusk: new Date('2026-10-08T23:30:00Z'),
  astroDawn: new Date('2026-10-09T09:00:00Z'),
};

const res2 = calculateCommonNightWindow([siteTokyo, siteNewYork]);
assert(
  res2 === null,
  'T2.1 Kesişmeyen uzak saat dilimlerinde sonuç kesinlikle null olmalı',
  `Dönen: ${JSON.stringify(res2)}`
);

// ---------------------------------------------------------------------------
// TEST 3: Beyaz Gece / Kutup Gündüzü Yaşayan Saha (astroDusk = null)
// ---------------------------------------------------------------------------
console.log('\n─── TEST 3: Beyaz Gece / Zifiri Karanlık Olmayan Saha (null Girdi) ───');
const siteTromsoSummer: SiteDarkInterval = {
  siteId: 'site-tromso',
  siteName: 'Tromsø (Yaz Zifiri Karanlık Yok)',
  astroDusk: null,
  astroDawn: null,
};
const siteBoluNormal: SiteDarkInterval = {
  siteId: 'bolu',
  siteName: 'Bolu Sarıalan',
  astroDusk: new Date('2026-10-08T17:00:00Z'),
  astroDawn: new Date('2026-10-09T02:30:00Z'),
};

const res3 = calculateCommonNightWindow([siteBoluNormal, siteTromsoSummer]);
assert(
  res3 === null,
  'T3.1 Beyaz gece yaşayan saha dahil olduğunda uydurma değer verilmemeli, null dönmeli',
  `Dönen: ${JSON.stringify(res3)}`
);

// ---------------------------------------------------------------------------
// TEST 4: Sınır Koşulları (Boş Girdi, Ters Aralık, Tekil Saha)
// ---------------------------------------------------------------------------
console.log('\n─── TEST 4: Sınır Koşulları ve Hata Koruması ───');
assert(calculateCommonNightWindow([]) === null, 'T4.1 Boş dizi için null');
assert(calculateCommonNightWindow([null, undefined]) === null, 'T4.2 Null/undefined elemanlar için null');

const invalidSite: SiteDarkInterval = {
  siteId: 'inv',
  siteName: 'Ters Saatli Hatalı İstasyon',
  astroDusk: new Date('2026-10-09T05:00:00Z'),
  astroDawn: new Date('2026-10-09T04:00:00Z'), // Dawn dusk'tan önce
};
assert(calculateCommonNightWindow([invalidSite]) === null, 'T4.3 Dawn <= Dusk için null');

// Tekil geçerli saha kendi aralığını dönmeli
const singleRes = calculateCommonNightWindow([siteNorth]);
assert(
  singleRes !== null && singleRes.durationMinutes === 480,
  'T4.4 Tek saha verildiğinde kendi aralığını kesişim olarak dönmeli',
  `Süre: ${singleRes?.durationMinutes} dk`
);

// ---------------------------------------------------------------------------
// TEST 5: Gerçek calculateNightEphemeris Entegrasyonu (Bolu & Erzurum)
// ---------------------------------------------------------------------------
console.log('\n─── TEST 5: Gerçek Efemeris Çıktılarıyla Entegrasyon (Bolu & Erzurum) ───');
const boluEphem = calculateNightEphemeris(
  '2026-10-08',
  40.612,
  31.684,
  1530,
  'Europe/Istanbul'
);
const erzurumEphem = calculateNightEphemeris(
  '2026-10-08',
  39.782,
  41.246,
  2420,
  'Europe/Istanbul'
);

const realCommon = findCommonNightWindowFromEphemeris([boluEphem, erzurumEphem]);
assert(realCommon !== null, 'T5.1 Bolu ve Erzurum ortak zifiri karanlık penceresi hesaplandı');
if (realCommon && boluEphem.astroDusk && erzurumEphem.astroDusk && boluEphem.astroDawn && erzurumEphem.astroDawn) {
  const maxDusk = Math.max(boluEphem.astroDusk.getTime(), erzurumEphem.astroDusk.getTime());
  const minDawn = Math.min(boluEphem.astroDawn.getTime(), erzurumEphem.astroDawn.getTime());
  assert(
    realCommon.start.getTime() === maxDusk,
    'T5.2 Ortak başlangıç en batıdaki (en geç kararan) sahanın dusk zamanı',
    `Start: ${realCommon.start.toISOString()}`
  );
  assert(
    realCommon.end.getTime() === minDawn,
    'T5.3 Ortak bitiş en doğudaki (en erken aydınlanan) sahanın dawn zamanı',
    `End: ${realCommon.end.toISOString()}`
  );
  assert(
    realCommon.durationMinutes > 0,
    'T5.4 Ortak pencere süresi pozitif dakika',
    `Ortak süre: ${realCommon.durationMinutes} dk (${realCommon.durationHours} sa)`
  );
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`  SONUÇ: ${passedTests}/${totalTests} BİRİM TEST TAM GEÇTİ`);
console.log('═══════════════════════════════════════════════════════════════════════\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
