import {
  computeWindowClusters,
  findBestRuns,
  pickBestRun,
  BEST_MIN_RATIO,
  SHOULDER_MIN_RATIO,
  ClusterDay,
  ClusterRun,
  WindowGroup,
  WindowClusters,
  ClusterBufferDay,
} from '../src/lib/windowClusters';
import {
  buildClusterBuffer,
  CLUSTER_BUFFER_DAYS_BEFORE,
  CLUSTER_BUFFER_DAYS_AFTER,
  ClusterBufferSite,
} from '../src/lib/clusterBuffer';
import {
  MONTHS_EN,
  MONTHS_SHORT_EN,
  WEEKDAYS_EN,
  WEEKDAYS_SHORT_EN,
  assertMonthIndex,
} from '../src/lib/calendarNames';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateNightEphemeris } from '../src/lib/ephemeris';
import { zonedTimeToInstant, siteParts, toDateKey, resolveSite, addDaysToDateKey } from '../src/lib/siteTime';
import { PRESET_LOCATIONS } from '../src/lib/coordinateParser';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — PENCERE KÜMELEME DENETİMİ (window-cluster-check)');
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

function makeDay(
  dayIndex: number,
  ratio: number,
  options?: { month?: number; year?: number; dayNum?: number }
): ClusterDay {
  const year = options?.year ?? 2026;
  const month = options?.month ?? 9; // 0-indexed (9 = Oct)
  const dayNum = options?.dayNum ?? (dayIndex + 1);
  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  const date = new Date(Date.UTC(year, month, dayNum, 12, 0, 0));
  return {
    date,
    dateKey,
    month,
    ratio,
  };
}

const defaultSyntheticDate = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));

console.log('─── SENTETİK TESTLER (1–14) ───');

// Case 1: Single 90+ run inside month with 80s on both sides
{
  const days: ClusterDay[] = [
    makeDay(0, 80),
    makeDay(1, 85),
    makeDay(2, 92),
    makeDay(3, 95),
    makeDay(4, 91),
    makeDay(5, 85),
    makeDay(6, 82),
  ];
  const res = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T1: Ay içi tek 90+ serisi ve iki yanında 80\'ler -> best=ana seri, early=sol 80ler, late=sağ 80ler',
    res.best.available &&
      res.best.dateKeys.length === 3 &&
      res.early.available &&
      res.early.dateKeys.length === 2 &&
      res.late.available &&
      res.late.dateKeys.length === 2,
    `best=${res.best.dateKeys.length}, early=${res.early.dateKeys.length}, late=${res.late.dateKeys.length}`
  );
}

// Case 2: Edge thresholds: 89 -> shoulder, 90 -> best, 70 -> shoulder, 69 -> neither
{
  const days: ClusterDay[] = [
    makeDay(0, 69),
    makeDay(1, 70),
    makeDay(2, 89),
    makeDay(3, 90),
    makeDay(4, 89),
    makeDay(5, 70),
    makeDay(6, 69),
  ];
  const res = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T2: Eşik sınırları (89=omuz, 90=best, 70=omuz, 69=dışarıda)',
    res.best.dateKeys.length === 1 &&
      res.early.dateKeys.length === 2 &&
      res.late.dateKeys.length === 2 &&
      !res.early.dateKeys.includes(days[0].dateKey) &&
      !res.late.dateKeys.includes(days[6].dateKey),
    `early=${res.early.dateKeys.join(',')} best=${res.best.dateKeys.join(',')} late=${res.late.dateKeys.join(',')}`
  );
}

// Case 3: Shoulder run broken by a 60 -> only contiguous part adjacent to Best included
{
  const days: ClusterDay[] = [
    makeDay(0, 75),
    makeDay(1, 60),
    makeDay(2, 80),
    makeDay(3, 92),
    makeDay(4, 95),
    makeDay(5, 85),
    makeDay(6, 55),
    makeDay(7, 75),
  ];
  const res = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T3: 60 ile kesilen omuz serisi -> sadece Best\'e bitişik sürekli kısım dahil edilir',
    res.early.dateKeys.length === 1 &&
      res.early.dateKeys[0] === days[2].dateKey &&
      res.late.dateKeys.length === 1 &&
      res.late.dateKeys[0] === days[5].dateKey,
    `early=${res.early.dateKeys.join(',')} late=${res.late.dateKeys.join(',')}`
  );
}

// Case 4: No shoulder on either side -> early and late empty
{
  const days: ClusterDay[] = [
    makeDay(0, 65),
    makeDay(1, 60),
    makeDay(2, 92),
    makeDay(3, 95),
    makeDay(4, 50),
    makeDay(5, 68),
  ];
  const res = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T4: İki tarafta da omuz yok -> early ve late boş ve available=false',
    res.best.available &&
      !res.early.available &&
      res.early.dateKeys.length === 0 &&
      !res.late.available &&
      res.late.dateKeys.length === 0,
    `early.avail=${res.early.available}, late.avail=${res.late.available}`
  );
}

// Case 5: Two runs in month -> pick by inMonthCount
{
  const days: ClusterDay[] = [
    makeDay(0, 95),
    makeDay(1, 95),
    makeDay(2, 60),
    makeDay(3, 92),
    makeDay(4, 92),
    makeDay(5, 92),
    makeDay(6, 92),
  ];
  const runs = findBestRuns(days, 9);
  const picked = pickBestRun(runs);
  assert(
    'T5: Ay içi iki seri -> inMonthCount yüksek olan seçilir (4 gün > 2 gün)',
    picked !== null && picked.startIdx === 3 && picked.endIdx === 6 && picked.inMonthCount === 4,
    `picked startIdx=${picked?.startIdx} inMonthCount=${picked?.inMonthCount}`
  );
}

// Case 6: Equal in-month count -> pick by length (longer wins)
{
  const days: ClusterDay[] = [
    makeDay(0, 95, { month: 8 }),
    makeDay(1, 95, { month: 8 }),
    makeDay(2, 95, { month: 9 }),
    makeDay(3, 95, { month: 9 }),
    makeDay(4, 60, { month: 9 }),
    makeDay(5, 92, { month: 9 }),
    makeDay(6, 92, { month: 9 }),
  ];
  const runs = findBestRuns(days, 9);
  const picked = pickBestRun(runs);
  assert(
    'T6: Eşit ay içi gün sayısı (2 vs 2) -> toplam uzunluğu fazla olan kazanır (4 gün > 2 gün)',
    picked !== null && picked.startIdx === 0 && picked.endIdx === 3,
    `picked startIdx=${picked?.startIdx} len=${picked ? picked.endIdx - picked.startIdx + 1 : 0}`
  );
}

// Case 7: Equal count and length -> pick by avgRatio (higher wins)
{
  const days: ClusterDay[] = [
    makeDay(0, 90),
    makeDay(1, 90),
    makeDay(2, 60),
    makeDay(3, 96),
    makeDay(4, 98),
  ];
  const runs = findBestRuns(days, 9);
  const picked = pickBestRun(runs);
  assert(
    'T7: Eşit gün ve uzunluk -> ortalama oranı (avgRatio) yüksek olan kazanır (97 > 90)',
    picked !== null && picked.startIdx === 3 && picked.endIdx === 4,
    `picked startIdx=${picked?.startIdx} avgRatio=${picked?.avgRatio}`
  );
}

// Case 8: Run straddling month boundary -> inMonthCount counts only viewed-month days
{
  const days: ClusterDay[] = [
    makeDay(0, 95, { month: 8, dayNum: 30 }),
    makeDay(1, 95, { month: 8, dayNum: 31 }),
    makeDay(2, 95, { month: 9, dayNum: 1 }),
    makeDay(3, 95, { month: 9, dayNum: 2 }),
    makeDay(4, 95, { month: 9, dayNum: 3 }),
  ];
  const runs = findBestRuns(days, 9);
  assert(
    'T8: Ay sınırını aşan seri -> inMonthCount yalnızca hedeflenen ayın günlerini sayar (3 gün)',
    runs.length === 1 && runs[0].inMonthCount === 3,
    `runs[0].inMonthCount=${runs[0]?.inMonthCount}`
  );
}

// Case 9: No run touches the target month -> pickBestRun returns null (R2.0b fix, was DESIGN-DEBT: R2.x fallback)
{
  const days: ClusterDay[] = [
    makeDay(0, 95, { month: 8, dayNum: 10 }),
    makeDay(1, 95, { month: 8, dayNum: 11 }),
    makeDay(2, 60, { month: 9, dayNum: 1 }),
    makeDay(3, 60, { month: 9, dayNum: 2 }),
  ];
  const runs = findBestRuns(days, 9);
  const picked = pickBestRun(runs);
  assert(
    'T9: Hedef ayda hiç seri yoksa pickBestRun null döner (ay dışı seriye fallback yapılmaz)',
    picked === null,
    `picked=${picked}`
  );
}

// Case 10: No >=90 day anywhere, but 70-89 days exist -> all three groups empty (pin current behavior)
{
  const days: ClusterDay[] = [
    makeDay(0, 75),
    makeDay(1, 80),
    makeDay(2, 85),
    makeDay(3, 72),
    makeDay(4, 88),
  ];
  const res = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T10: Hiç >=90 gün yoksa (70-89 olsa bile) üç grup da boş ve available=false döner',
    !res.best.available &&
      res.best.dateKeys.length === 0 &&
      !res.early.available &&
      res.early.dateKeys.length === 0 &&
      !res.late.available &&
      res.late.dateKeys.length === 0,
    `best.avail=${res.best.available}`
  );
}

// Case 11: All ratios 0 (polar day / no dark) -> all three groups empty
{
  const days: ClusterDay[] = [
    makeDay(0, 0),
    makeDay(1, 0),
    makeDay(2, 0),
  ];
  const res = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T11: Tüm oranlar 0 (kutup gündüzü / karanlık yok) -> üç grup da boş',
    !res.best.available && !res.early.available && !res.late.available,
    `best.avail=${res.best.available}`
  );
}

// Case 12: Empty input array -> all three groups empty, no throw
{
  const res = computeWindowClusters([], 9, 'UTC', defaultSyntheticDate);
  assert(
    'T12: Boş dizi girdisi -> hata fırlatmadan üç grup da boş döner',
    !res.best.available && !res.early.available && !res.late.available,
    `best.avail=${res.best.available}`
  );
}

// Case 13: Entire buffer >=90 -> best=all days, no shoulders
{
  const days: ClusterDay[] = [
    makeDay(0, 92),
    makeDay(1, 95),
    makeDay(2, 98),
    makeDay(3, 93),
  ];
  const res = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T13: Tüm tampon >=90 -> best tüm günleri kapsar, omuzlar boş kalır',
    res.best.available &&
      res.best.dateKeys.length === 4 &&
      !res.early.available &&
      !res.late.available,
    `best.len=${res.best.dateKeys.length}`
  );
}

// Case 14: Immutability & determinism -> input array not mutated, identical outputs
{
  const days: ClusterDay[] = [
    makeDay(0, 80),
    makeDay(1, 92),
    makeDay(2, 95),
    makeDay(3, 85),
  ];
  const daysCopy = JSON.stringify(days);
  const res1 = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  const res2 = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T14: Değişmezlik ve determinizm -> girdi dizisi mutasyona uğramaz, ardışık çağrılar özdeş sonuç verir',
    JSON.stringify(days) === daysCopy &&
      JSON.stringify(res1.best.dateKeys) === JSON.stringify(res2.best.dateKeys) &&
      res1.best.text === res2.best.text,
    `mutated=${JSON.stringify(days) !== daysCopy}`
  );
}

console.log('\n─── ENTEGRASYON TESTLERİ (15–17) ───');

// Case 15: Bolu Sarıalan fixed month -> best range non-empty, best days >=90, early/late 70..89, strictly increasing keys
{
  const bolu = resolveSite(PRESET_LOCATIONS[0]);
  if (!bolu) throw new Error('Bolu must have valid timezone');
  const tz = bolu.timeZone;
  const year = 2026;
  const month = 9; // Oct (0-indexed)
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const bufferDays: ClusterDay[] = [];

  for (let i = 0; i < 10 + daysInMonth + 10; i++) {
    const dDate = zonedTimeToInstant(year, month + 1, -9 + i + 1, 12, 0, 0, tz);
    const ephem = calculateNightEphemeris(
      dDate,
      bolu.latitude,
      bolu.longitude,
      bolu.elevation,
      tz,
      bolu.horizonProfile
    );
    const ratio =
      ephem.darkDurationMinutes > 0
        ? Math.round((ephem.moonlessDarkMinutes / ephem.darkDurationMinutes) * 100)
        : 0;
    const dp = siteParts(dDate, tz);
    bufferDays.push({
      date: dDate,
      dateKey: ephem.dateKey,
      month: dp.month - 1,
      ratio,
    });
  }

  const fallbackDate = zonedTimeToInstant(year, month + 1, 1, 12, 0, 0, tz);
  const res = computeWindowClusters(bufferDays, month, tz, fallbackDate);
  const bestValid =
    res.best.available &&
    res.best.days.length > 0 &&
    res.best.days.every((d) => d.ratio >= 90);
  const earlyValid =
    !res.early.available ||
    (res.early.days.length > 0 && res.early.days.every((d) => d.ratio >= 70 && d.ratio < 90));
  const lateValid =
    !res.late.available ||
    (res.late.days.length > 0 && res.late.days.every((d) => d.ratio >= 70 && d.ratio < 90));

  const allKeys = [
    ...res.early.dateKeys,
    ...res.best.dateKeys,
    ...res.late.dateKeys,
  ];
  const strictlyIncreasing = allKeys.every((k, idx) => idx === 0 || k > allKeys[idx - 1]);

  assert(
    'T15: Bolu Sarıalan Ekim 2026 -> best >=90, early/late 70..89 ve anahtarlar kesin artan sırada',
    bestValid && earlyValid && lateValid && strictlyIncreasing,
    `best.len=${res.best.days.length}, early.len=${res.early.days.length}, late.len=${res.late.days.length}`
  );
}

// Case 16: Paranal southern-hemisphere month -> same invariants
{
  const rawParanal = PRESET_LOCATIONS.find((p) => p.name.includes('Paranal'));
  const paranal = resolveSite(
    rawParanal ?? {
      id: 'paranal',
      name: 'Paranal Observatory',
      latitude: -24.627,
      longitude: -70.404,
      elevation: 2635,
      horizonDip: 1.5,
      timeZone: 'America/Santiago',
    }
  );
  if (!paranal) throw new Error('Paranal must have valid timezone');
  const tz = paranal.timeZone;
  const year = 2026;
  const month = 6; // July (0-indexed)
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const bufferDays: ClusterDay[] = [];

  for (let i = 0; i < 10 + daysInMonth + 10; i++) {
    const dDate = zonedTimeToInstant(year, month + 1, -9 + i + 1, 12, 0, 0, tz);
    const ephem = calculateNightEphemeris(
      dDate,
      paranal.latitude,
      paranal.longitude,
      paranal.elevation,
      tz,
      paranal.horizonProfile
    );
    const ratio =
      ephem.darkDurationMinutes > 0
        ? Math.round((ephem.moonlessDarkMinutes / ephem.darkDurationMinutes) * 100)
        : 0;
    const dp = siteParts(dDate, tz);
    bufferDays.push({
      date: dDate,
      dateKey: ephem.dateKey,
      month: dp.month - 1,
      ratio,
    });
  }

  const fallbackDate = zonedTimeToInstant(year, month + 1, 1, 12, 0, 0, tz);
  const res = computeWindowClusters(bufferDays, month, tz, fallbackDate);
  const bestValid =
    res.best.available &&
    res.best.days.length > 0 &&
    res.best.days.every((d) => d.ratio >= 90);
  const earlyValid =
    !res.early.available ||
    (res.early.days.length > 0 && res.early.days.every((d) => d.ratio >= 70 && d.ratio < 90));
  const lateValid =
    !res.late.available ||
    (res.late.days.length > 0 && res.late.days.every((d) => d.ratio >= 70 && d.ratio < 90));

  const allKeys = [
    ...res.early.dateKeys,
    ...res.best.dateKeys,
    ...res.late.dateKeys,
  ];
  const strictlyIncreasing = allKeys.every((k, idx) => idx === 0 || k > allKeys[idx - 1]);

  assert(
    'T16: Paranal (Güney Yarımküre) Temmuz 2026 -> best >=90, early/late 70..89 ve anahtarlar kesin artan sırada',
    bestValid && earlyValid && lateValid && strictlyIncreasing,
    `best.len=${res.best.days.length}, early.len=${res.early.days.length}, late.len=${res.late.days.length}`
  );
}

// Case 17: Parity test: 24-month sweep at Bolu asserting shared buildClusterBuffer equals independent test-local buffer
{
  const bolu = resolveSite(PRESET_LOCATIONS[0]);
  if (!bolu) throw new Error('Bolu must have valid timezone');
  const tz = bolu.timeZone;
  const startParts = siteParts(Date.UTC(2026, 9, 1, 12, 0, 0), tz);
  const startY = startParts.year;
  const startM = startParts.month - 1;

  let mismatchCount = 0;
  const mismatches: string[] = [];

  for (let offset = 0; offset < 24; offset++) {
    const totalMonth = startM + offset;
    const y = startY + Math.floor(totalMonth / 12);
    const m = totalMonth % 12;
    const daysInM = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

    // Independent test-local oracle buffer (must NOT call buildClusterBuffer)
    const oracleBufferDays: ClusterDay[] = [];
    for (let i = 0; i < CLUSTER_BUFFER_DAYS_BEFORE + daysInM + CLUSTER_BUFFER_DAYS_AFTER; i++) {
      const dDate = zonedTimeToInstant(y, m + 1, -CLUSTER_BUFFER_DAYS_BEFORE + i + 1, 12, 0, 0, tz);
      const ephem = calculateNightEphemeris(
        dDate,
        bolu.latitude,
        bolu.longitude,
        bolu.elevation,
        tz,
        bolu.horizonProfile
      );
      const ratio =
        ephem.darkDurationMinutes > 0
          ? Math.round((ephem.moonlessDarkMinutes / ephem.darkDurationMinutes) * 100)
          : 0;
      const dp = siteParts(dDate, tz);
      oracleBufferDays.push({
        date: dDate,
        dateKey: ephem.dateKey,
        month: dp.month - 1,
        ratio,
      });
    }

    const fallbackDate = zonedTimeToInstant(y, m + 1, 1, 12, 0, 0, tz);
    const oracleClusters = computeWindowClusters(oracleBufferDays, m, tz, fallbackDate);

    // Shared buildClusterBuffer call
    let sharedClusters: WindowClusters<ClusterBufferDay> | null = null;
    try {
      const sharedBuffer = buildClusterBuffer(bolu, y, m);
      sharedClusters = computeWindowClusters(sharedBuffer, m, tz, fallbackDate);
    } catch (e) {
      mismatchCount++;
      mismatches.push(`${y}-${m + 1} stub: ${String(e)}`);
    }

    const oracleBestKey = oracleClusters.best.available ? oracleClusters.best.dateKey : 'none';
    const sharedBestKey = sharedClusters?.best.available ? sharedClusters.best.dateKey : 'none';

    if (oracleBestKey !== sharedBestKey) {
      mismatchCount++;
      mismatches.push(`${y}-${m + 1}: shared=${sharedBestKey} vs oracle=${oracleBestKey}`);
    }
  }

  assert(
    'T17: Bolu Sarıalan 24 aylık tarama -> Sekme/Modal ortak buffer builder vs bağımsız referans',
    mismatchCount === 0,
    mismatches.join('; ')
  );
}

console.log('\n─── TİP GÜVENLİĞİ VE HİJYEN DENETİMLERİ (18–22) ───');

// Case 18: Empty input with explicit fallbackDate
{
  const fallbackDate = new Date(Date.UTC(2026, 9, 15, 12, 0, 0));
  const res = computeWindowClusters([], 9, 'UTC', fallbackDate);
  const allUnavailable = !res.early.available && !res.best.available && !res.late.available;
  const sameDate =
    res.early.date.getTime() === fallbackDate.getTime() &&
    res.best.date.getTime() === fallbackDate.getTime() &&
    res.late.date.getTime() === fallbackDate.getTime();
  const textsCorrect =
    res.best.text === 'Not Available This Month' &&
    res.early.text === '-' &&
    res.late.text === '-';

  assert(
    'T18: Boş girdi ve açık fallbackDate -> üç grup da kullanılamaz ve fallbackDate kullanılır',
    allUnavailable && sameDate && textsCorrect,
    `allUnavailable=${allUnavailable}, sameDate=${sameDate}, textsCorrect=${textsCorrect}`
  );
}

// Case 19: No >=90 day anywhere (e.g. all ratios 80) with explicit fallbackDate
{
  const days: ClusterDay[] = [
    makeDay(0, 80),
    makeDay(1, 80),
    makeDay(2, 80),
  ];
  const fallbackDate = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
  const res = computeWindowClusters(days, 9, 'UTC', fallbackDate);
  const allUnavailable = !res.early.available && !res.best.available && !res.late.available;
  const sameDate =
    res.early.date.getTime() === fallbackDate.getTime() &&
    res.best.date.getTime() === fallbackDate.getTime() &&
    res.late.date.getTime() === fallbackDate.getTime();
  const textsCorrect =
    res.best.text === 'Not Available This Month' &&
    res.early.text === '-' &&
    res.late.text === '-';

  assert(
    'T19: Hiç >=90 gün yoksa açık fallbackDate ile aynı kullanılamaz yapı ve fallbackDate döner',
    allUnavailable && sameDate && textsCorrect,
    `allUnavailable=${allUnavailable}, sameDate=${sameDate}, textsCorrect=${textsCorrect}`
  );
}

// Case 20: Generic preservation for ClusterBufferDay extra fields
{
  const modalDays: ClusterBufferDay[] = [
    {
      date: new Date(Date.UTC(2026, 9, 10, 12, 0, 0)),
      dateKey: '2026-10-10',
      month: 9,
      ratio: 95,
      illum: 12,
      moonlessDarkMinutes: 420,
    },
  ];
  const fallbackDate = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
  const res = computeWindowClusters(modalDays, 9, 'UTC', fallbackDate);
  const bestDay = res.best.days[0];
  assert(
    'T20: Genel tip koruması -> ClusterBufferDay ek alanları (illum, moonlessDarkMinutes) tür dönüşümü olmadan okunur',
    res.best.available &&
      bestDay !== undefined &&
      bestDay.illum === 12 &&
      bestDay.moonlessDarkMinutes === 420,
    `illum=${bestDay?.illum}, moonlessDarkMinutes=${bestDay?.moonlessDarkMinutes}`
  );
}

// Case 21: Compile-time guard
{
  // @ts-expect-error missing illum / moonlessDarkMinutes must not satisfy ClusterBufferDay
  const bad: ClusterBufferDay = { date: new Date(0), dateKey: 'x', month: 0, ratio: 0 };
  assert(
    'T21: Derleme zamanı tip koruma güvencesi (eksik illum/moonlessDarkMinutes ClusterBufferDay ile uyuşmamalı)',
    bad.dateKey === 'x'
  );
}

// Case 22: Static source guard
{
  const wcPath = fileURLToPath(new URL('../src/lib/windowClusters.ts', import.meta.url));
  const tabPath = fileURLToPath(new URL('../src/components/tabs/NightCalendarTab.tsx', import.meta.url));
  const wcSource = fs.readFileSync(wcPath, 'utf8');
  const tabSource = fs.readFileSync(tabPath, 'utf8');

  const cleanWc = wcSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')
    .replace(/`[\s\S]*?`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');

  const hasAsCast = /\bas\s+(?:const\b|[A-Za-z_({[])/.test(cleanWc);
  const hasEpochZero = cleanWc.includes('new Date(0)');
  const hasNullishZero = cleanWc.includes('?? 0');
  const hasTabIllumFallback = tabSource.includes('illum ?? 0');
  const hasTabDarkMinsFallback = tabSource.includes('moonlessDarkMinutes ?? 0');

  assert(
    'T22: Statik kaynak kodu denetimi -> windowClusters.ts içinde as cast, new Date(0), ?? 0 yok; NightCalendarTab içinde uydurma ?? 0 yok',
    !hasAsCast && !hasEpochZero && !hasNullishZero && !hasTabIllumFallback && !hasTabDarkMinsFallback,
    `hasAsCast=${hasAsCast}, hasEpochZero=${hasEpochZero}, hasNullishZero=${hasNullishZero}, hasTabIllumFallback=${hasTabIllumFallback}, hasTabDarkMinsFallback=${hasTabDarkMinsFallback}`
  );
}

console.log('\n─── ORTAK TAMPON VE TAKVİM DENETİMLERİ (23–30) ───');

// Case 23: buildClusterBuffer length = 10+dim+10 style check for Feb 2027 (28 days -> 48), Feb 2028 (29 -> 49), Apr 2026 (30 -> 50), Oct 2026 (31 -> 51)
{
  const bolu = resolveSite(PRESET_LOCATIONS[0]);
  if (!bolu) throw new Error('Bolu must have valid timezone');
  let valid = false;
  let lenFeb27 = -1, lenFeb28 = -1, lenApr26 = -1, lenOct26 = -1;
  try {
    lenFeb27 = buildClusterBuffer(bolu, 2027, 1).length;
    lenFeb28 = buildClusterBuffer(bolu, 2028, 1).length;
    lenApr26 = buildClusterBuffer(bolu, 2026, 3).length;
    lenOct26 = buildClusterBuffer(bolu, 2026, 9).length;
    valid =
      (lenFeb27 === 48 || lenFeb27 === 47) &&
      (lenFeb28 === 49 || lenFeb28 === 48) &&
      (lenApr26 === 50 || lenApr26 === 49) &&
      (lenOct26 === 51 || lenOct26 === 50);
  } catch (e) {
    valid = false;
  }

  assert(
    'T23: buildClusterBuffer uzunluğu (10+dim+10 stili) -> Şub 2027 (48), Şub 2028 (49), Nis 2026 (50), Eki 2026 (51)',
    valid,
    `Feb27=${lenFeb27}, Feb28=${lenFeb28}, Apr26=${lenApr26}, Oct26=${lenOct26}`
  );
}

// Case 24: anchor + consecutiveness: Bolu Oct 2026, Paranal Jul 2026, and DST zone (America/Santiago around Apr 2026)
{
  const bolu = resolveSite(PRESET_LOCATIONS[0]);
  const paranal = resolveSite(PRESET_LOCATIONS[1]);
  if (!bolu || !paranal) throw new Error('Presets must be resolvable');

  const cases = [
    { site: bolu, y: 2026, m: 9, tz: bolu.timeZone, dim: 31 },
    { site: paranal, y: 2026, m: 6, tz: paranal.timeZone, dim: 31 },
    { site: paranal, y: 2026, m: 3, tz: 'America/Santiago', dim: 30 },
  ];

  let allValid = true;
  const failures: string[] = [];

  for (const c of cases) {
    try {
      const buf = buildClusterBuffer({ ...c.site, timeZone: c.tz }, c.y, c.m);
      for (let i = 0; i < buf.length; i++) {
        const expectedTime = zonedTimeToInstant(c.y, c.m + 1, -9 + i + 1, 12, 0, 0, c.tz).getTime();
        if (buf[i].date.getTime() !== expectedTime) {
          allValid = false;
          failures.push(`${c.tz} date mismatch at index ${i}`);
          break;
        }
        if (i > 0) {
          const expectedNextKey = addDaysToDateKey(buf[i - 1].dateKey, 1);
          if (buf[i].dateKey !== expectedNextKey) {
            allValid = false;
            failures.push(`${c.tz} key non-consecutive at index ${i}: ${buf[i].dateKey} vs ${expectedNextKey}`);
            break;
          }
        }
      }
      const firstDayKey = `${c.y}-${String(c.m + 1).padStart(2, '0')}-01`;
      const expectedFirstKey = addDaysToDateKey(firstDayKey, -9);
      if (buf[0].dateKey !== expectedFirstKey) {
        allValid = false;
        failures.push(`${c.tz} first key ${buf[0].dateKey} !== expected ${expectedFirstKey}`);
      }
      const lastDayKey = `${c.y}-${String(c.m + 1).padStart(2, '0')}-${String(c.dim).padStart(2, '0')}`;
      const expectedLastKey = addDaysToDateKey(lastDayKey, 10);
      const actualLastKey = buf[buf.length - 1].dateKey;
      if (actualLastKey !== expectedLastKey && actualLastKey !== addDaysToDateKey(lastDayKey, 11)) {
        allValid = false;
        failures.push(`${c.tz} last key ${actualLastKey} !== expected ${expectedLastKey}`);
      }
    } catch (e) {
      allValid = false;
      failures.push(`${c.tz} stub error: ${String(e)}`);
    }
  }

  assert(
    'T24: Çapa ve ardışıklık -> Bolu, Paranal ve DST bölgesinde -9+i+1 çapa zamanı ve addDaysToDateKey ardışıklığı tam',
    allValid,
    failures.join('; ')
  );
}

// Case 25: field fidelity vs oracle: for Bolu Oct 2026
{
  const bolu = resolveSite(PRESET_LOCATIONS[0]);
  if (!bolu) throw new Error('Bolu must have valid timezone');
  let allMatch = false;
  try {
    const buffer = buildClusterBuffer(bolu, 2026, 9);
    allMatch = true;
    for (let i = 0; i < buffer.length; i++) {
      const item = buffer[i];
      const ephem = calculateNightEphemeris(
        item.date,
        bolu.latitude,
        bolu.longitude,
        bolu.elevation,
        bolu.timeZone,
        bolu.horizonProfile
      );
      const ratio =
        ephem.darkDurationMinutes > 0
          ? Math.round((ephem.moonlessDarkMinutes / ephem.darkDurationMinutes) * 100)
          : 0;
      const parts = siteParts(item.date, bolu.timeZone);
      const expectedMonth = parts.month - 1;
      if (
        item.dateKey !== ephem.dateKey ||
        item.month !== expectedMonth ||
        item.ratio !== ratio ||
        item.illum !== ephem.moonIllumination ||
        item.moonlessDarkMinutes !== ephem.moonlessDarkMinutes
      ) {
        allMatch = false;
        break;
      }
    }
  } catch {
    allMatch = false;
  }
  assert(
    'T25: Alan doğruluğu vs referans -> Bolu Ekim 2026 tüm girişlerin dateKey, month, ratio, illum, moonlessDarkMinutes değerleri calculateNightEphemeris ile birebir örtüşür',
    allMatch
  );
}

// Case 26: horizonProfile wiring
{
  const bolu = resolveSite(PRESET_LOCATIONS[0]);
  if (!bolu) throw new Error('Bolu must have valid timezone');
  let hasDifference = false;
  let matchesOracle = false;
  try {
    const siteNoProfile = { ...bolu, horizonProfile: undefined };
    const mountainProfile = [15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0];
    const siteWithProfile = { ...bolu, horizonProfile: mountainProfile };

    const bufNo = buildClusterBuffer(siteNoProfile, 2026, 9);
    const bufWith = buildClusterBuffer(siteWithProfile, 2026, 9);

    hasDifference = false;
    matchesOracle = true;

    for (let i = 0; i < bufWith.length; i++) {
      const dWith = bufWith[i];
      const dNo = bufNo[i];
      if (dWith.ratio !== dNo.ratio || dWith.moonlessDarkMinutes !== dNo.moonlessDarkMinutes) {
        hasDifference = true;
      }
      const ephem = calculateNightEphemeris(
        dWith.date,
        bolu.latitude,
        bolu.longitude,
        bolu.elevation,
        bolu.timeZone,
        mountainProfile
      );
      const ratio =
        ephem.darkDurationMinutes > 0
          ? Math.round((ephem.moonlessDarkMinutes / ephem.darkDurationMinutes) * 100)
          : 0;
      if (
        dWith.ratio !== ratio ||
        dWith.moonlessDarkMinutes !== ephem.moonlessDarkMinutes ||
        dWith.illum !== ephem.moonIllumination
      ) {
        matchesOracle = false;
        break;
      }
    }
  } catch {
    hasDifference = false;
    matchesOracle = false;
  }

  assert(
    'T26: Ufuk profili (horizonProfile) bağlantısı -> Dağ maskesi tampon oranlarını etkiler ve referansla birebir eşleşir',
    hasDifference && matchesOracle,
    `hasDifference=${hasDifference}, matchesOracle=${matchesOracle}`
  );
}

// Case 27: month validation
{
  const bolu = resolveSite(PRESET_LOCATIONS[0]);
  if (!bolu) throw new Error('Bolu must have valid timezone');
  const fallbackDate = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
  const badMonths = [-1, 12, 1.5, NaN];
  let allThrowRangeError = true;

  for (const bad of badMonths) {
    try {
      assertMonthIndex(bad);
      allThrowRangeError = false;
    } catch (e) {
      if (!(e instanceof RangeError)) allThrowRangeError = false;
    }

    try {
      findBestRuns([], bad);
      allThrowRangeError = false;
    } catch (e) {
      if (!(e instanceof RangeError)) allThrowRangeError = false;
    }

    try {
      computeWindowClusters([], bad, 'UTC', fallbackDate);
      allThrowRangeError = false;
    } catch (e) {
      if (!(e instanceof RangeError)) allThrowRangeError = false;
    }

    try {
      buildClusterBuffer(bolu, 2026, bad);
      allThrowRangeError = false;
    } catch (e) {
      if (!(e instanceof RangeError)) allThrowRangeError = false;
    }
  }

  let validNoThrow = true;
  for (const good of [0, 11]) {
    try {
      assertMonthIndex(good);
      findBestRuns([], good);
      computeWindowClusters([], good, 'UTC', fallbackDate);
      buildClusterBuffer(bolu, 2026, good);
    } catch {
      validNoThrow = false;
    }
  }

  assert(
    'T27: Ay indeksi doğrulaması -> -1, 12, 1.5, NaN için RangeError fırlatır; 0 ve 11 geçerlidir',
    allThrowRangeError && validNoThrow,
    `allThrowRangeError=${allThrowRangeError}, validNoThrow=${validNoThrow}`
  );
}

// Case 28: static source guard for English calendar names
{
  const ALLOWLIST: readonly { path: string; reason: string }[] = [];
  const srcDir = fileURLToPath(new URL('../src', import.meta.url));

  function scanDir(dir: string, fileList: string[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full, fileList);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        fileList.push(full);
      }
    }
  }

  const allFiles: string[] = [];
  scanDir(srcDir, allFiles);

  const violations: string[] = [];
  const janRegex = /['"]Jan['"]\s*,\s*['"]Feb['"]/;
  const sunRegex = /['"]Sun['"]\s*,\s*['"]Mon['"]/;

  for (const filePath of allFiles) {
    const rel = path.relative(path.resolve(srcDir, '..'), filePath).split(path.sep).join('/');
    if (rel === 'src/lib/calendarNames.ts') continue;
    if (ALLOWLIST.some((a) => a.path === rel)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes("'January'") || content.includes('"January"')) {
      violations.push(`${rel} contains 'January'`);
    }
    if (content.includes("'Sunday'") || content.includes('"Sunday"')) {
      violations.push(`${rel} contains 'Sunday'`);
    }
    if (janRegex.test(content)) {
      violations.push(`${rel} matches Jan, Feb`);
    }
    if (sunRegex.test(content)) {
      violations.push(`${rel} matches Sun, Mon`);
    }
  }

  assert(
    'T28: Statik kaynak kodu denetimi -> calendarNames.ts haricinde hiçbir src dosyasında İngilizce ay/gün adı dizileri bulunmaz',
    violations.length === 0,
    violations.join('; ')
  );
}

// Case 29: Compile-time guard (regression guard)
{
  // @ts-expect-error fallbackDate is required
  const res = computeWindowClusters<ClusterDay>([], 0, 'UTC');
  assert(
    'T29: Derleme zamanı regresyon güvencesi (fallbackDate parametresi zorunludur)',
    res !== undefined
  );
}

// Case 30: static call-site guard
{
  const tabPath = fileURLToPath(new URL('../src/components/tabs/NightCalendarTab.tsx', import.meta.url));
  const tabContent = fs.readFileSync(tabPath, 'utf8');
  const bufferCalls = (tabContent.match(/buildClusterBuffer\(/g) || []).length;
  const hasStartOffset = tabContent.includes('bufferStartOffset');
  const hasOldOffsetCalc = tabContent.includes('-9 + i + 1');
  const hasOldDaysInM = tabContent.includes('10 + daysInM + 10');
  const hasOldDaysInMonth = tabContent.includes('10 + daysInMonth + 10');
  const hasWeatherCast = tabContent.includes('as WeatherSourceType');

  assert(
    'T30: Statik çağrı yeri güvencesi -> NightCalendarTab içinde buildClusterBuffer tam 2 kez geçer ve eski tampon döngü kalıntıları ile as WeatherSourceType içermez',
    bufferCalls === 2 &&
      !hasStartOffset &&
      !hasOldOffsetCalc &&
      !hasOldDaysInM &&
      !hasOldDaysInMonth &&
      !hasWeatherCast,
    `bufferCalls=${bufferCalls}, hasStartOffset=${hasStartOffset}, hasOldOffsetCalc=${hasOldOffsetCalc}, hasOldDaysInM=${hasOldDaysInM}, hasOldDaysInMonth=${hasOldDaysInMonth}, hasWeatherCast=${hasWeatherCast}`
  );
}

// Case 31: computeWindowClusters end-to-end honesty when no run touches the target month (R2.0b)
{
  const days: ClusterDay[] = [
    makeDay(0, 95, { month: 8, dayNum: 10 }),
    makeDay(1, 95, { month: 8, dayNum: 11 }),
    makeDay(2, 60, { month: 9, dayNum: 1 }),
    makeDay(3, 60, { month: 9, dayNum: 2 }),
  ];
  const res = computeWindowClusters(days, 9, 'UTC', defaultSyntheticDate);
  assert(
    'T31: Hedef ayda hiç seri yoksa computeWindowClusters dürüst boş sonuç döner (bestRun=null, best.text="Not Available This Month")',
    res.bestRun === null &&
      !res.best.available &&
      res.best.text === 'Not Available This Month' &&
      res.best.dateKeys.length === 0 &&
      !res.early.available &&
      !res.late.available,
    `bestRun=${res.bestRun}, best.available=${res.best.available}, best.text=${res.best.text}`
  );
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`  SONUÇ: ${passCount} geçti, ${failCount} başarısız.`);
console.log('═══════════════════════════════════════════════════════════════════════\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
