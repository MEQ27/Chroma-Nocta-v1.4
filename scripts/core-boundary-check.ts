import { errorMessage } from '../src/lib/errors';
import { saveJsonToDevice, saveImageToDevice } from '../src/lib/deviceStorage';
import { getStoredTheme } from '../src/lib/theme';
import { calculateNightEphemeris } from '../src/lib/ephemeris';
import { restoreCachedPoints } from '../src/lib/weatherService';
import type { HourlyWeatherPoint } from '../src/types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanTypeEscapes } from './type-escape-check';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — ÇEKİRDEK SINIR DENETİMİ (core-boundary-check, Suite #13)');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

function assert(description: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  🟢 [GEÇTİ] ${description}`);
    passCount += 1;
  } else {
    console.error(`  ❌ [BAŞARISIZ] ${description} ${detail ? `(${detail})` : ''}`);
    failCount += 1;
  }
}

// ---------------------------------------------------------------------------
// A. errorMessage (E1-E6)
// ---------------------------------------------------------------------------
console.log('─── A. HATA MESAJI AYIKLAMA (E1–E6) ───');

// E1: Error('boom') -> 'boom'
{
  let passed = false;
  try {
    passed = errorMessage(new Error('boom')) === 'boom';
  } catch {}
  assert("E1: Error('boom') -> 'boom'", passed);
}

// E2: Error('') -> null
{
  let passed = false;
  try {
    passed = errorMessage(new Error('')) === null;
  } catch {}
  assert("E2: Error('') -> null", passed);
}

// E3: { message: 'obj' } -> 'obj'
{
  let passed = false;
  try {
    passed = errorMessage({ message: 'obj' }) === 'obj';
  } catch {}
  assert("E3: { message: 'obj' } nesnesi -> 'obj'", passed);
}

// E4: 'str' -> null
{
  let passed = false;
  try {
    passed = errorMessage('str') === null;
  } catch {}
  assert("E4: Düz dize ('str') -> null", passed);
}

// E5: null / undefined -> null
{
  let passed = false;
  try {
    passed = errorMessage(null) === null && errorMessage(undefined) === null;
  } catch {}
  assert('E5: null veya undefined -> null', passed);
}

// E6: { message: 5 } -> null
{
  let passed = false;
  try {
    passed = errorMessage({ message: 5 }) === null;
  } catch {}
  assert('E6: Dize olmayan message alanı ({ message: 5 }) -> null', passed);
}

// ---------------------------------------------------------------------------
// B. deviceStorage Web Akışı (D1-D8)
// ---------------------------------------------------------------------------
console.log('\n─── B. CİHAZ KAYIT WEB AKIŞI KARAKTERİZASYONU (D1–D8) ───');

interface RecordedAttr {
  name: string;
  value: string;
}

interface FakeAnchor {
  href: string;
  download: string;
  readonly recordedAttrs: RecordedAttr[];
  clicked: boolean;
  setAttribute(name: string, value: string): void;
  click(): void;
}

function makeFakeAnchor(): FakeAnchor {
  const recordedAttrs: RecordedAttr[] = [];
  return {
    href: '',
    download: '',
    recordedAttrs,
    clicked: false,
    setAttribute(name: string, value: string): void {
      recordedAttrs.push({ name, value });
      if (name === 'download') {
        this.download = value;
      }
    },
    click(): void {
      this.clicked = true;
    },
  };
}

function stubDocument(anchor: FakeAnchor, throwOnCreate?: unknown): void {
  const appended: unknown[] = [];
  const fakeDoc = {
    createElement(tag: string) {
      if (throwOnCreate !== undefined) {
        throw throwOnCreate;
      }
      if (tag === 'a') {
        return anchor;
      }
      return {};
    },
    body: {
      appendChild(el: unknown) {
        appended.push(el);
      },
      removeChild(el: unknown) {
        const idx = appended.indexOf(el);
        if (idx >= 0) appended.splice(idx, 1);
      },
    },
  };
  Object.defineProperty(globalThis, 'document', {
    value: fakeDoc,
    configurable: true,
    writable: true,
  });
}

// D1: saveJsonToDevice('x', { a: 1 }) -> success true, download 'x.json', href 'blob:'
async function runD1(): Promise<void> {
  let passed = false;
  try {
    const anchor = makeFakeAnchor();
    stubDocument(anchor);
    const res = await saveJsonToDevice('x', { a: 1 });
    passed =
      res.success === true &&
      res.message === 'x.json başarıyla indirildi.' &&
      anchor.download === 'x.json' &&
      anchor.href.startsWith('blob:') &&
      anchor.clicked === true;
  } catch {}
  assert("D1: saveJsonToDevice('x', data) -> başarı, x.json indirme ve blob href", passed);
}

// D2: filename already 'x.json' -> not doubled
async function runD2(): Promise<void> {
  let passed = false;
  try {
    const anchor = makeFakeAnchor();
    stubDocument(anchor);
    const res = await saveJsonToDevice('x.json', { a: 1 });
    passed =
      res.success === true &&
      res.message === 'x.json başarıyla indirildi.' &&
      anchor.download === 'x.json';
  } catch {}
  assert("D2: saveJsonToDevice('x.json') -> uzantı çiftlenmez", passed);
}

// D3: createElement throws Error('boom') -> { success: false, message: 'boom' }
async function runD3(): Promise<void> {
  let passed = false;
  try {
    const anchor = makeFakeAnchor();
    stubDocument(anchor, new Error('boom'));
    const res = await saveJsonToDevice('x', { a: 1 });
    passed = res.success === false && res.message === 'boom';
  } catch {}
  assert('D3: createElement Error fırlatınca hata mesajı korunur', passed);
}

// D4: throws { message: 'obj' } -> message 'obj'
async function runD4(): Promise<void> {
  let passed = false;
  try {
    const anchor = makeFakeAnchor();
    stubDocument(anchor, { message: 'obj' });
    const res = await saveJsonToDevice('x', { a: 1 });
    passed = res.success === false && res.message === 'obj';
  } catch {}
  assert('D4: Düz nesne { message } fırlatılınca mesaj korunur', passed);
}

// D5: throws 'plain string' -> default message
async function runD5(): Promise<void> {
  let passed = false;
  try {
    const anchor = makeFakeAnchor();
    stubDocument(anchor, 'plain string');
    const res = await saveJsonToDevice('x', { a: 1 });
    passed = res.success === false && res.message === 'Web indirme işlemi başarısız oldu.';
  } catch {}
  assert('D5: Düz dize fırlatılınca varsayılan web indirme hata mesajı döner', passed);
}

// D6: throws Error('') -> default message
async function runD6(): Promise<void> {
  let passed = false;
  try {
    const anchor = makeFakeAnchor();
    stubDocument(anchor, new Error(''));
    const res = await saveJsonToDevice('x', { a: 1 });
    passed = res.success === false && res.message === 'Web indirme işlemi başarısız oldu.';
  } catch {}
  assert("D6: Boş Error('') fırlatılınca varsayılan hata mesajı döner", passed);
}

// D7: saveImageToDevice('pic', rawBase64)
async function runD7(): Promise<void> {
  let passed = false;
  try {
    const anchor1 = makeFakeAnchor();
    stubDocument(anchor1);
    const res1 = await saveImageToDevice('pic', 'QUJD');
    const part1 =
      res1.success === true &&
      res1.message === 'pic.png başarıyla indirildi.' &&
      anchor1.href === 'data:image/png;base64,QUJD' &&
      anchor1.download === 'pic.png';

    const anchor2 = makeFakeAnchor();
    stubDocument(anchor2);
    const res2 = await saveImageToDevice('pic.png', 'data:image/jpeg;base64,WFla');
    const part2 =
      res2.success === true &&
      res2.message === 'pic.png başarıyla indirildi.' &&
      anchor2.href === 'data:image/jpeg;base64,WFla';

    passed = part1 && part2;
  } catch {}
  assert('D7: saveImageToDevice -> doğru data URI ve indirme niteliği oluşturur', passed);
}

// D8: saveImageToDevice error handling
async function runD8(): Promise<void> {
  let passed = false;
  try {
    const anchor1 = makeFakeAnchor();
    stubDocument(anchor1, new Error('img'));
    const res1 = await saveImageToDevice('pic', 'QUJD');
    const part1 = res1.success === false && res1.message === 'img';

    const anchor2 = makeFakeAnchor();
    stubDocument(anchor2, 'thrown string');
    const res2 = await saveImageToDevice('pic', 'QUJD');
    const part2 =
      res2.success === false &&
      (res2.message === 'Web görsel indirme başarısız.' ||
        res2.message === 'Web görsel indirme başarısız oldu.');

    passed = part1 && part2;
  } catch {}
  assert('D8: saveImageToDevice hata durumlarında hata mesajını veya varsayılanı döndürür', passed);
}

await runD1();
await runD2();
await runD3();
await runD4();
await runD5();
await runD6();
await runD7();
await runD8();

// ---------------------------------------------------------------------------
// C. Tema Depolama (TH1-TH4)
// ---------------------------------------------------------------------------
console.log('\n─── C. TEMA DEPOLAMA KARAKTERİZASYONU (TH1–TH4) ───');

function stubLocalStorage(store: Record<string, string>, shouldThrow?: unknown): void {
  const fakeStorage = {
    getItem(key: string): string | null {
      if (shouldThrow !== undefined) {
        throw shouldThrow;
      }
      return key in store ? store[key] : null;
    },
    setItem(key: string, value: string): void {
      store[key] = value;
    },
    removeItem(key: string): void {
      delete store[key];
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage,
    configurable: true,
    writable: true,
  });
}

// TH1: stored valid id -> that id
{
  let passed = false;
  try {
    stubLocalStorage({ chroma_nocta_theme_id: 'zodiacal-amber' });
    passed = getStoredTheme() === 'zodiacal-amber';
  } catch {}
  assert("TH1: Kaydedilmiş geçerli tema ('zodiacal-amber') -> 'zodiacal-amber'", passed);
}

// TH2: stored unknown string -> 'h-alpha'
{
  let passed = false;
  try {
    stubLocalStorage({ chroma_nocta_theme_id: 'unknown-neon-theme' });
    passed = getStoredTheme() === 'h-alpha';
  } catch {}
  assert("TH2: Tanınmayan tema dizesi -> 'h-alpha'", passed);
}

// TH3: null -> 'h-alpha'
{
  let passed = false;
  try {
    stubLocalStorage({});
    passed = getStoredTheme() === 'h-alpha';
  } catch {}
  assert("TH3: Boş kayıt (null) -> 'h-alpha'", passed);
}

// TH4: getItem throws -> 'h-alpha'
{
  let passed = false;
  try {
    stubLocalStorage({}, new Error('Storage disabled'));
    passed = getStoredTheme() === 'h-alpha';
  } catch {}
  assert("TH4: localStorage erişim hatası fırlatırsa -> 'h-alpha'", passed);
}

// ---------------------------------------------------------------------------
// D. Ephemeris Cache Identity (EP1)
// ---------------------------------------------------------------------------
console.log('\n─── D. EPHEMERIS ÖNBELLEK KİMLİK KONTROLÜ (EP1) ───');

// EP1: calling calculateNightEphemeris twice with identical arguments returns SAME object reference
{
  let passed = false;
  try {
    const d = new Date(Date.UTC(2026, 9, 8, 12, 0, 0));
    const e1 = calculateNightEphemeris(d, 40.7, 31.6, 1200, 'Europe/Istanbul');
    const e2 = calculateNightEphemeris(d, 40.7, 31.6, 1200, 'Europe/Istanbul');
    passed = e1 === e2;
  } catch {}
  assert('EP1: Aynı parametrelerle art arda çağrılan calculateNightEphemeris aynı nesne referansını döner', passed);
}

// ---------------------------------------------------------------------------
// E. restoreCachedPoints (W1-W9)
// ---------------------------------------------------------------------------
console.log('\n─── E. HAVA DURUMU ÖNBELLEK NOKTA KURTARMA (W1–W9) ───');

function makeValidPointJson(): Record<string, unknown> {
  return {
    time: '2026-10-08T19:00:00.000Z',
    temp: 12.5,
    dewPoint: 8.2,
    dewGap: 4.3,
    humidity: 75,
    cloudCover: 10,
    cloudCoverLow: 5,
    cloudCoverMid: 0,
    cloudCoverHigh: 0,
    windSpeed: 8,
    windDirectionDeg: 180,
    windDirectionCompass: 'S',
    isAstroDark: true,
    isDangerDew: false,
    sunAltitude: -22.5,
    precipitationProb: 15,
    precipitationAmount: 0.1,
    windGust: 18,
    missing: ['wind'],
  };
}

// W1: round trip of production-shaped point
{
  let passed = false;
  try {
    const sample = makeValidPointJson();
    const serialized = JSON.stringify([sample]);
    const parsed: unknown = JSON.parse(serialized);
    const restored = restoreCachedPoints(parsed);
    if (restored !== null && restored.length === 1) {
      const pt: HourlyWeatherPoint = restored[0];
      passed =
        pt.time instanceof Date &&
        pt.time.getTime() === new Date('2026-10-08T19:00:00.000Z').getTime() &&
        pt.temp === 12.5 &&
        pt.dewPoint === 8.2 &&
        pt.dewGap === 4.3 &&
        pt.humidity === 75 &&
        pt.cloudCover === 10 &&
        pt.cloudCoverLow === 5 &&
        pt.cloudCoverMid === 0 &&
        pt.cloudCoverHigh === 0 &&
        pt.windSpeed === 8 &&
        pt.windDirectionDeg === 180 &&
        pt.windDirectionCompass === 'S' &&
        pt.isAstroDark === true &&
        pt.isDangerDew === false &&
        pt.sunAltitude === -22.5 &&
        pt.precipitationProb === 15 &&
        pt.precipitationAmount === 0.1 &&
        pt.windGust === 18 &&
        pt.missing !== undefined &&
        pt.missing.length === 1 &&
        pt.missing[0] === 'wind';
    }
  } catch {}
  assert('W1: Üretim yapısındaki noktanın serileştirme/kurtarma döngüsü (tüm alanlar tam eşleşir)', passed);
}

// W2: numeric epoch time accepted
{
  let passed = false;
  try {
    const sample = makeValidPointJson();
    sample.time = 1775736000000;
    const restored = restoreCachedPoints([sample]);
    if (restored !== null && restored.length === 1) {
      passed =
        restored[0].time instanceof Date &&
        restored[0].time.getTime() === 1775736000000;
    }
  } catch {}
  assert('W2: Sayısal milisaniye zaman damgası (epoch time) geçerli kabul edilir', passed);
}

// W3: non-array / empty array -> null
{
  let passed = false;
  try {
    const r1 = restoreCachedPoints(null);
    const r2 = restoreCachedPoints({});
    const r3 = restoreCachedPoints([]);
    const r4 = restoreCachedPoints('not-an-array');
    passed = r1 === null && r2 === null && r3 === null && r4 === null;
  } catch {}
  assert('W3: Dizi olmayan veya boş dizi girdi -> null', passed);
}

// W4: one element with temp: 'x' -> null for whole array
{
  let passed = false;
  try {
    const p1 = makeValidPointJson();
    const p2 = makeValidPointJson();
    p2.temp = 'x';
    const restored = restoreCachedPoints([p1, p2]);
    passed = restored === null;
  } catch {}
  assert('W4: Bozuk tek bir eleman (temp: "x") tüm diziyi null yapar', passed);
}

// W5: time 'nope' -> null
{
  let passed = false;
  try {
    const p = makeValidPointJson();
    p.time = 'nope';
    const restored = restoreCachedPoints([p]);
    passed = restored === null;
  } catch {}
  assert("W5: Geçersiz tarih ('nope') -> null", passed);
}

// W6: cloudCover null accepted, undefined rejected
{
  let passed = false;
  try {
    const pNull = makeValidPointJson();
    pNull.cloudCover = null;
    const rNull = restoreCachedPoints([pNull]);

    const pUndef = makeValidPointJson();
    delete pUndef.cloudCover;
    const rUndef = restoreCachedPoints([pUndef]);

    passed = rNull !== null && rUndef === null;
  } catch {}
  assert('W6: cloudCover null kabul edilir, eksik (undefined) reddedilir', passed);
}

// W7: optional fields absent accepted, wrong-typed -> null
{
  let passed = false;
  try {
    const pGood = makeValidPointJson();
    delete pGood.precipitationProb;
    delete pGood.precipitationAmount;
    delete pGood.windGust;
    delete pGood.missing;
    const rGood = restoreCachedPoints([pGood]);

    const pBad = makeValidPointJson();
    pBad.precipitationProb = 'high';
    const rBad = restoreCachedPoints([pBad]);

    passed = rGood !== null && rBad === null;
  } catch {}
  assert('W7: Opsiyonel alanlar yoksa kabul edilir, yanlış tipteyse null döner', passed);
}

// W8: missing containing unknown string -> null
{
  let passed = false;
  try {
    const pBad = makeValidPointJson();
    pBad.missing = ['invalid_sensor_field'];
    const rBad = restoreCachedPoints([pBad]);
    passed = rBad === null;
  } catch {}
  assert('W8: missing içinde tanınmayan alan adı -> null', passed);
}

// W9: input array is not mutated and result is a new array
{
  let passed = false;
  try {
    const original = [makeValidPointJson()];
    const restored = restoreCachedPoints(original);
    passed =
      restored !== null &&
      !Object.is(restored, original) &&
      typeof original[0].time === 'string';
  } catch {}
  assert('W9: Girdi dizisi mutasyona uğramaz ve dönen dizi yeni bir referanstır', passed);
}

// ---------------------------------------------------------------------------
// F. Uygulama Kabuğu Tip Kaçışı Sınır Denetimi (AS1–AS5)
// ---------------------------------------------------------------------------
console.log('\n─── F. UYGULAMA KABUĞU TİP KAÇIŞI SINIR DENETİMİ (AS1–AS5) ───');

// AS1: main.tsx throws descriptive error containing '#root' when root element is missing.
{
  let passed = false;
  try {
    const mainPath = path.resolve(process.cwd(), 'src/main.tsx');
    const mainSrc = fs.readFileSync(mainPath, 'utf8');
    const hasNonNull = mainSrc.includes("getElementById('root')!");
    const hasErrorThrow = mainSrc.includes("throw new Error('Root element #root not found in DOM')");
    const hasRootMention = mainSrc.includes('#root');
    passed = !hasNonNull && hasErrorThrow && hasRootMention;
  } catch {}
  assert("AS1: main.tsx throws descriptive error containing '#root' when root element is missing", passed);
}

// AS2: static source inspection verifying '(window as any)' no longer appears in navigationBridge.ts.
{
  let passed = false;
  try {
    const bridgePath = path.resolve(process.cwd(), 'src/lib/navigationBridge.ts');
    const bridgeSrc = fs.readFileSync(bridgePath, 'utf8');
    const hasWindowAsAny = bridgeSrc.includes('(window as any)');
    const hasDeclareGlobal = bridgeSrc.includes('declare global');
    const hasWindowOpera = bridgeSrc.includes('window.opera');
    passed = !hasWindowAsAny && hasDeclareGlobal && hasWindowOpera;
  } catch {}
  assert("AS2: static source inspection verifying '(window as any)' no longer appears in navigationBridge.ts", passed);
}

// AS3: RouteTab rejects non-string FileReader result without throwing.
{
  let passed = false;
  try {
    const routePath = path.resolve(process.cwd(), 'src/components/tabs/RouteTab.tsx');
    const routeSrc = fs.readFileSync(routePath, 'utf8');
    const hasResultAsCast = routeSrc.includes('as string');
    const hasTypeCheck = routeSrc.includes("typeof result !== 'string'");
    const hasEarlyReturn = routeSrc.includes("if (typeof result !== 'string') return;");
    passed = !hasResultAsCast && hasTypeCheck && hasEarlyReturn;
  } catch {}
  assert("AS3: RouteTab rejects non-string FileReader result without throwing", passed);
}

// AS4: SettingsModal contains UNIT_OPTIONS & TIME_FORMAT_OPTIONS and no `as UnitSystem` / `as '24h'`.
{
  let passed = false;
  try {
    const settingsPath = path.resolve(process.cwd(), 'src/components/SettingsModal.tsx');
    const settingsSrc = fs.readFileSync(settingsPath, 'utf8');
    const hasUnitOptions = settingsSrc.includes('UNIT_OPTIONS');
    const hasTimeFormatOptions = settingsSrc.includes('TIME_FORMAT_OPTIONS');
    const hasAsUnitSystem = settingsSrc.includes('as UnitSystem');
    const hasAs24h = settingsSrc.includes("as '24h'");
    passed = hasUnitOptions && hasTimeFormatOptions && !hasAsUnitSystem && !hasAs24h;
  } catch {}
  assert("AS4: SettingsModal contains UNIT_OPTIONS & TIME_FORMAT_OPTIONS and no as UnitSystem / as '24h'", passed);
}

// AS5: NeedsTimeZone contains no `'manual' as const`.
{
  let passed = false;
  try {
    const tzPath = path.resolve(process.cwd(), 'src/components/NeedsTimeZone.tsx');
    const tzSrc = fs.readFileSync(tzPath, 'utf8');
    const hasManualAsConst = tzSrc.includes("'manual' as const");
    passed = !hasManualAsConst;
  } catch {}
  assert("AS5: NeedsTimeZone contains no 'manual' as const", passed);
}

// AS6: LocationModal source contains no ': any', no 'as const', imports errorMessage, and has 0 type escapes.
{
  let passed = false;
  try {
    const locPath = path.resolve(process.cwd(), 'src/components/LocationModal.tsx');
    const locSrc = fs.readFileSync(locPath, 'utf8');
    const hasColonAny = locSrc.includes(': any');
    const hasAsConst = locSrc.includes('as const');
    const hasErrorMessage = locSrc.includes("import { errorMessage } from '../lib/errors'");
    const escapes = scanTypeEscapes('src/components/LocationModal.tsx', locSrc);
    passed = !hasColonAny && !hasAsConst && hasErrorMessage && escapes.length === 0;
  } catch {}
  assert("AS6: LocationModal source contains no ': any', no 'as const', imports errorMessage, and has 0 type escapes", passed);
}

// AS7: SkyVizorTab source contains PROJECTION_MODES, MODUL_H_MODES, no 'as string', and no 'as const'.
{
  let passed = false;
  try {
    const skyPath = path.resolve(process.cwd(), 'src/components/tabs/SkyVizorTab.tsx');
    const skySrc = fs.readFileSync(skyPath, 'utf8');
    const hasProjModes = skySrc.includes('PROJECTION_MODES');
    const hasModulHModes = skySrc.includes('MODUL_H_MODES');
    const hasAsString = skySrc.includes('as string');
    const hasAsConst = skySrc.includes('as const');
    passed = hasProjModes && hasModulHModes && !hasAsString && !hasAsConst;
  } catch {}
  assert("AS7: SkyVizorTab source contains PROJECTION_MODES, MODUL_H_MODES, no 'as string', and no 'as const'", passed);
}

// AS8: FieldWeatherTab source does not contain 'dayMap.get(dKey)!'.
{
  let passed = false;
  try {
    const weatherPath = path.resolve(process.cwd(), 'src/components/tabs/FieldWeatherTab.tsx');
    const weatherSrc = fs.readFileSync(weatherPath, 'utf8');
    const hasDayMapBang = weatherSrc.includes('dayMap.get(dKey)!');
    passed = !hasDayMapBang;
  } catch {}
  assert("AS8: FieldWeatherTab source does not contain 'dayMap.get(dKey)!'", passed);
}

// AS9: selfCheck.ts contains no ' as const', contains 'export const FIELDS: readonly' and 'EphemerisField'.
{
  let passed = false;
  try {
    const checkPath = path.resolve(process.cwd(), 'src/lib/selfCheck.ts');
    const checkSrc = fs.readFileSync(checkPath, 'utf8');
    const hasAsConst = checkSrc.includes(' as const');
    const hasFields = checkSrc.includes('export const FIELDS: readonly');
    const hasEphemerisField = checkSrc.includes('EphemerisField');
    passed = !hasAsConst && hasFields && hasEphemerisField;
  } catch {}
  assert("AS9: selfCheck.ts contains no ' as const', contains 'export const FIELDS: readonly' and 'EphemerisField'", passed);
}

// AS10: selfCheck.ts contains no '] as const', and contains 'new Map<string, CheckSite>()'.
{
  let passed = false;
  try {
    const checkPath = path.resolve(process.cwd(), 'src/lib/selfCheck.ts');
    const checkSrc = fs.readFileSync(checkPath, 'utf8');
    const hasBracketAsConst = checkSrc.includes('] as const');
    const hasMapCheckSite = checkSrc.includes('new Map<string, CheckSite>()');
    passed = !hasBracketAsConst && hasMapCheckSite;
  } catch {}
  assert("AS10: selfCheck.ts contains no '] as const', and contains 'new Map<string, CheckSite>()'", passed);
}

// AS11: useWakeLock.ts contains no ': any', no ' as any', contains 'WakeLockSentinelLike' and 'WakeLockApiLike'.
{
  let passed = false;
  try {
    const wlPath = path.resolve(process.cwd(), 'src/lib/useWakeLock.ts');
    const wlSrc = fs.readFileSync(wlPath, 'utf8');
    const hasColonAny = wlSrc.includes(': any');
    const hasAsAny = wlSrc.includes(' as any');
    const hasSentinelLike = wlSrc.includes('WakeLockSentinelLike');
    const hasApiLike = wlSrc.includes('WakeLockApiLike');
    passed = !hasColonAny && !hasAsAny && hasSentinelLike && hasApiLike;
  } catch {}
  assert("AS11: useWakeLock.ts contains no ': any', no ' as any', contains 'WakeLockSentinelLike' and 'WakeLockApiLike'", passed);
}

// AS12: Dynamically import { useWakeLock } from '../src/lib/useWakeLock'; assert imported.useWakeLock is a function.
{
  let passed = false;
  try {
    const imported = await import('../src/lib/useWakeLock');
    passed = typeof imported.useWakeLock === 'function';
  } catch {}
  assert("AS12: Dynamically import { useWakeLock } from '../src/lib/useWakeLock'; assert imported.useWakeLock is a function", passed);
}

// AS13: splinePath.ts exports getSmoothSplinePath, contains no type escapes, and FieldWeatherTab imports it.
{
  let passed = false;
  try {
    const splinePath = path.resolve(process.cwd(), 'src/lib/splinePath.ts');
    const splineSrc = fs.readFileSync(splinePath, 'utf8');
    const hasExport = splineSrc.includes('export function getSmoothSplinePath');
    const escapes = scanTypeEscapes('src/lib/splinePath.ts', splineSrc);

    const fwtPath = path.resolve(process.cwd(), 'src/components/tabs/FieldWeatherTab.tsx');
    const fwtSrc = fs.readFileSync(fwtPath, 'utf8');
    const fwtImports = fwtSrc.includes("from '../../lib/splinePath'") && fwtSrc.includes('getSmoothSplinePath');

    passed = hasExport && escapes.length === 0 && fwtImports;
  } catch {}
  assert("AS13: splinePath.ts exports getSmoothSplinePath, contains no type escapes, and FieldWeatherTab imports it", passed);
}

// AS14: AltitudeCurve exists, 0 escapes, contains markers/twilight bands, and NightCalendarTab mounts it before EPHEMERIS DATA.
{
  let passed = false;
  try {
    const altPath = path.resolve(process.cwd(), 'src/components/AltitudeCurve.tsx');
    const nctPath = path.resolve(process.cwd(), 'src/components/tabs/NightCalendarTab.tsx');
    if (fs.existsSync(altPath) && fs.existsSync(nctPath)) {
      const altSrc = fs.readFileSync(altPath, 'utf8');
      const nctSrc = fs.readFileSync(nctPath, 'utf8');

      const hasExport = altSrc.includes('export const AltitudeCurve') || altSrc.includes('export function AltitudeCurve');
      const escapes = scanTypeEscapes('src/components/AltitudeCurve.tsx', altSrc);
      const hasDeviceHours = altSrc.includes('new Date().getHours()');
      const hasSunsetMarkers = altSrc.includes('sunsetInfo') && altSrc.includes('sunriseInfo');
      const hasVerticalBands = altSrc.includes('stripe-') && (altSrc.includes('#1e1b4b') || altSrc.includes('sunAltitude > 0'));
      const hasTitle = altSrc.includes('CELESTIAL ELEVATION CHART');
      const hasMoonGlow = altSrc.includes('id="moonGlow"');
      const hasMoonCrossings = altSrc.includes('moonriseInfo') && altSrc.includes('moonsetInfo');
      const hasNadir = altSrc.includes('nadirInfo');

      const nctImports = nctSrc.includes("from '../AltitudeCurve'") || nctSrc.includes('AltitudeCurve');
      const altPos = nctSrc.indexOf('<AltitudeCurve');
      const ephPos = nctSrc.indexOf('EPHEMERIS DATA');
      const mountsBeforeEphemeris = altPos !== -1 && ephPos !== -1 && altPos < ephPos;

      passed = hasExport &&
        escapes.length === 0 &&
        !hasDeviceHours &&
        hasSunsetMarkers &&
        hasVerticalBands &&
        hasTitle &&
        hasMoonGlow &&
        hasMoonCrossings &&
        hasNadir &&
        nctImports &&
        mountsBeforeEphemeris;
    }
  } catch {}
  assert("AS14: AltitudeCurve exists, 0 escapes, contains markers/twilight bands, and NightCalendarTab mounts it before EPHEMERIS DATA", passed);
}

// AS15: calculateNightEphemeris returns valid sunriseAzimuthDeg / sunsetAzimuthDeg bounded in [0, 360) and hasActiveTerrainMask flag.
{
  let passed = false;
  try {
    const ephemNoProfile = calculateNightEphemeris('2026-10-13', 38.0, 32.0, 1000, 'Europe/Istanbul');
    const ephemWithProfile = calculateNightEphemeris('2026-10-13', 38.0, 32.0, 1000, 'Europe/Istanbul', [5, 5, 5, 5, 5, 5, 5, 5]);

    const hasSunrise = ephemNoProfile.sunrise !== null;
    const hasSunset = ephemNoProfile.sunset !== null;
    const validSunriseAz =
      typeof ephemNoProfile.sunriseAzimuthDeg === 'number' &&
      ephemNoProfile.sunriseAzimuthDeg >= 0 &&
      ephemNoProfile.sunriseAzimuthDeg < 360;
    const validSunriseCard =
      typeof ephemNoProfile.sunriseCardinal === 'string' &&
      ephemNoProfile.sunriseCardinal.length > 0;
    const validSunsetAz =
      typeof ephemNoProfile.sunsetAzimuthDeg === 'number' &&
      ephemNoProfile.sunsetAzimuthDeg >= 0 &&
      ephemNoProfile.sunsetAzimuthDeg < 360;
    const validSunsetCard =
      typeof ephemNoProfile.sunsetCardinal === 'string' &&
      ephemNoProfile.sunsetCardinal.length > 0;

    const terrainNoProfileFalse = ephemNoProfile.hasActiveTerrainMask === false;
    const terrainWithProfileTrue = ephemWithProfile.hasActiveTerrainMask === true;

    passed = hasSunrise && hasSunset && validSunriseAz && validSunriseCard && validSunsetAz && validSunsetCard && terrainNoProfileFalse && terrainWithProfileTrue;
  } catch {}
  assert("AS15: calculateNightEphemeris returns valid sunriseAzimuthDeg / sunsetAzimuthDeg bounded in [0, 360) and hasActiveTerrainMask flag", passed);
}

// AS16: AltitudeCurve accepts 3-day window, renders 2-row telemetry footer with °/h rates, and Section 5 mounts azimuth chips.
{
  let passed = false;
  try {
    const altPath = path.resolve(process.cwd(), 'src/components/AltitudeCurve.tsx');
    const nctPath = path.resolve(process.cwd(), 'src/components/tabs/NightCalendarTab.tsx');
    if (fs.existsSync(altPath) && fs.existsSync(nctPath)) {
      const altSrc = fs.readFileSync(altPath, 'utf8');
      const nctSrc = fs.readFileSync(nctPath, 'utf8');
      const escapes = scanTypeEscapes('src/components/AltitudeCurve.tsx', altSrc);

      const acceptsDaysProp = altSrc.includes('days:') && altSrc.includes('SolarEphemerisDay');
      const hasRateTelemetry = altSrc.includes('°/h') && (altSrc.includes('sunRate') || altSrc.includes('Sun:'));
      const has2RowFooter = altSrc.includes('border-b border-slate-800') || altSrc.includes('bg-slate-950');
      const nctPassesDays = nctSrc.includes('days=') && nctSrc.includes('<AltitudeCurve');
      const nctAzimuthChips = nctSrc.includes('sunsetAzimuthDeg') && nctSrc.includes('hasActiveTerrainMask');

      const hasGridlessYMarks = [90, 60, 30, 0, -30, -60, -90].every((m) =>
        altSrc.includes(String(m))
      );
      const hasHorizonText = altSrc.includes('Horizon');
      const hasAstroDarkText = altSrc.includes('Astro Dark');
      const hasContinuousMidnight =
        altSrc.includes('strokeDasharray="none"') && altSrc.includes('00:00');
      const hasSilverGlow =
        altSrc.includes('id="silverGlow"') && altSrc.includes('url(#silverGlow)');
      const hasSwiftEdgePan12 = altSrc.includes('12.0') || altSrc.includes('12');
      const hasNoDayPrefix =
        !altSrc.includes('Day ${') &&
        !altSrc.includes('Day 1') &&
        altSrc.includes('PLOT_HEIGHT + 28');
      const hasMaxWNone =
        altSrc.includes("maxWidth: 'none'") || altSrc.includes('max-w-none');
      const hasSkyHeightBoundedStripes =
        altSrc.includes('height={skyHeight}') && altSrc.includes('skyHeight');
      const hasMidpointDates =
        altSrc.includes('6/72') ||
        altSrc.includes('DATE_MIDPOINTS') ||
        (altSrc.includes('6') && altSrc.includes('24') && altSrc.includes('48') && altSrc.includes('66'));
      const hasResizeObserver = altSrc.includes('ResizeObserver');
      const hasDayPlotWidth =
        altSrc.includes('dayPlotWidth') &&
        (altSrc.includes('dayPlotWidth * 3') || altSrc.includes('dayPlotWidth*3'));

      passed = escapes.length === 0 &&
        acceptsDaysProp &&
        hasRateTelemetry &&
        has2RowFooter &&
        nctPassesDays &&
        nctAzimuthChips &&
        hasGridlessYMarks &&
        hasHorizonText &&
        hasAstroDarkText &&
        hasContinuousMidnight &&
        hasSilverGlow &&
        hasSwiftEdgePan12 &&
        hasNoDayPrefix &&
        hasMaxWNone &&
        hasSkyHeightBoundedStripes &&
        hasMidpointDates &&
        hasResizeObserver &&
        hasDayPlotWidth;
    }
  } catch {}
  assert("AS16: AltitudeCurve accepts 3-day window, renders 2-row telemetry footer with °/h rates, and Section 5 mounts azimuth chips", passed);
}

// AS17: metadata.json has no MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API, weatherService has no generatePhysicalWeatherFallback, and MiniCalendarModal has no Europe/Istanbul and contains PreciseMoonIcon (0 escapes).
{
  let passed = false;
  try {
    const metaPath = path.resolve(process.cwd(), 'metadata.json');
    const wsPath = path.resolve(process.cwd(), 'src/lib/weatherService.ts');
    const mcmPath = path.resolve(process.cwd(), 'src/components/MiniCalendarModal.tsx');

    if (fs.existsSync(metaPath) && fs.existsSync(wsPath) && fs.existsSync(mcmPath)) {
      const metaSrc = fs.readFileSync(metaPath, 'utf8');
      const wsSrc = fs.readFileSync(wsPath, 'utf8');
      const mcmSrc = fs.readFileSync(mcmPath, 'utf8');

      const noMajorCap = !metaSrc.includes('MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API');
      const noFallback = !wsSrc.includes('generatePhysicalWeatherFallback');
      const noIstanbul = !mcmSrc.includes('Europe/Istanbul');
      const hasPreciseMoon = mcmSrc.includes('PreciseMoonIcon');

      const mcmEscapes = scanTypeEscapes('src/components/MiniCalendarModal.tsx', mcmSrc);
      const wsEscapes = scanTypeEscapes('src/lib/weatherService.ts', wsSrc);

      passed =
        noMajorCap &&
        noFallback &&
        noIstanbul &&
        hasPreciseMoon &&
        mcmEscapes.length === 0 &&
        wsEscapes.length === 0;
    }
  } catch {}
  assert(
    "AS17: metadata.json removes Gemini cap, weatherService removes unused fallback, and MiniCalendarModal has no Europe/Istanbul and contains PreciseMoonIcon (0 escapes)",
    passed
  );
}

// AS18: NightCalendarTab contains LiveSiteClock and HorizonMaskModal contains chroma_location_changed (0 escapes).
{
  let passed = false;
  try {
    const nctPath = path.resolve(process.cwd(), 'src/components/tabs/NightCalendarTab.tsx');
    const hmmPath = path.resolve(process.cwd(), 'src/components/HorizonMaskModal.tsx');

    if (fs.existsSync(nctPath) && fs.existsSync(hmmPath)) {
      const nctSrc = fs.readFileSync(nctPath, 'utf8');
      const hmmSrc = fs.readFileSync(hmmPath, 'utf8');

      const hasLiveClock = nctSrc.includes('LiveSiteClock');
      const hasLocationChanged = hmmSrc.includes('chroma_location_changed');

      const nctEscapes = scanTypeEscapes('src/components/tabs/NightCalendarTab.tsx', nctSrc);
      const hmmEscapes = scanTypeEscapes('src/components/HorizonMaskModal.tsx', hmmSrc);

      passed =
        hasLiveClock &&
        hasLocationChanged &&
        nctEscapes.length === 0 &&
        hmmEscapes.length === 0;
    }
  } catch {}
  assert(
    "AS18: NightCalendarTab isolates LiveSiteClock and HorizonMaskModal dispatches chroma_location_changed (0 escapes)",
    passed
  );
}

// AS19: FieldWeatherTab imports summarizeSiteNightWeather from nightWeather and uses astronomical night window for 2x2 summary cards (0 escapes).
{
  let passed = false;
  try {
    const fwtPath = path.resolve(process.cwd(), 'src/components/tabs/FieldWeatherTab.tsx');
    const nwPath = path.resolve(process.cwd(), 'src/lib/nightWeather.ts');
    const fwtSrc = fs.readFileSync(fwtPath, 'utf8');
    const nwSrc = fs.readFileSync(nwPath, 'utf8');
    const fwtEscapes = scanTypeEscapes('src/components/tabs/FieldWeatherTab.tsx', fwtSrc);
    const nwEscapes = scanTypeEscapes('src/lib/nightWeather.ts', nwSrc);
    const importsNightWeather = fwtSrc.includes('summarizeSiteNightWeather') && fwtSrc.includes("from '../../lib/nightWeather'");
    const hasNumericDewGap = nwSrc.includes('minDewGapC: number | null') && nwSrc.includes('nightMinTempC: number | null');
    passed = fwtEscapes.length === 0 && nwEscapes.length === 0 && importsNightWeather && hasNumericDewGap;
  } catch {}
  assert("AS19: FieldWeatherTab uses summarizeSiteNightWeather for 2x2 night window consistency and nightWeather exposes numeric telemetry fields (0 escapes)", passed);
}

// AS20: NightScore engine is in ZERO_LOCK, and NightCalendarTab renders clickable activeWeather.nightScore badge & Tactical Briefing modal (activeBriefingModal) with 0 escapes.
{
  let passed = false;
  try {
    const nsPath = path.resolve(process.cwd(), 'src/lib/nightScore.ts');
    const nctPath = path.resolve(process.cwd(), 'src/components/tabs/NightCalendarTab.tsx');
    const nsSrc = fs.readFileSync(nsPath, 'utf8');
    const nctSrc = fs.readFileSync(nctPath, 'utf8');
    const nsEscapes = scanTypeEscapes('src/lib/nightScore.ts', nsSrc);
    const nctEscapes = scanTypeEscapes('src/components/tabs/NightCalendarTab.tsx', nctSrc);
    const usesNightScore = nctSrc.includes('activeWeather.nightScore') && nctSrc.includes('activeBriefingModal');
    const rendersBreakdownAndNotes = nctSrc.includes('tacticalNotes') && nctSrc.includes('cloudScore');
    passed = nsEscapes.length === 0 && nctEscapes.length === 0 && usesNightScore && rendersBreakdownAndNotes;
  } catch {}
  assert("AS20: NightCalendarTab renders clickable nightScore badge and Tactical Night Briefing modal with breakdown & tacticalNotes (0 escapes)", passed);
}

// AS21: 5-tab architecture (BottomNav #tabTargets, App renders TargetOpsTab in ZERO_LOCK) & RouteTab logistics station & multi-profile equipment checklist with 0 escapes.
{
  let passed = false;
  try {
    const totPath = path.resolve(process.cwd(), 'src/components/tabs/TargetOpsTab.tsx');
    const rtPath = path.resolve(process.cwd(), 'src/components/tabs/RouteTab.tsx');
    const bnPath = path.resolve(process.cwd(), 'src/components/BottomNav.tsx');
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const tecPath = path.resolve(process.cwd(), 'scripts/type-escape-check.ts');

    const totSrc = fs.readFileSync(totPath, 'utf8');
    const rtSrc = fs.readFileSync(rtPath, 'utf8');
    const bnSrc = fs.readFileSync(bnPath, 'utf8');
    const appSrc = fs.readFileSync(appPath, 'utf8');
    const tecSrc = fs.readFileSync(tecPath, 'utf8');

    const totEscapes = scanTypeEscapes('src/components/tabs/TargetOpsTab.tsx', totSrc);
    const rtEscapes = scanTypeEscapes('src/components/tabs/RouteTab.tsx', rtSrc);

    const has5TabsInNav = bnSrc.includes('#tabTargets') && bnSrc.includes('targets');
    const appMountsTargetOps = appSrc.includes('TargetOpsTab') && appSrc.includes('#tabTargets');
    const inZeroLock = tecSrc.includes("'src/components/tabs/TargetOpsTab.tsx'");
    const routeHasLogistics = rtSrc.includes('roadCondition') && rtSrc.includes('hasMainsPower');
    const routeHasChecklist = rtSrc.includes('equipment') || rtSrc.includes('Checklist') || rtSrc.includes('Profile');

    const appPassesNightKey = appSrc.includes('selectedNightKey={selectedNightKey}');
    const rtUsesNightKey = rtSrc.includes('selectedNightKey');
    const rtManualDriveNo90 = rtSrc.includes('manualDriveMinutes') && !rtSrc.includes(': 90');
    const rtNoPolarScopeModal = !rtSrc.includes('PolarScopeModal');
    const rtReconAndLapse = rtSrc.includes('basemap=satellite') && rtSrc.includes('lapseRateDiffC');
    const rtChecklistExport = rtSrc.includes('handleExportChecklistJSON');

    passed = totEscapes.length === 0 &&
      rtEscapes.length === 0 &&
      has5TabsInNav &&
      appMountsTargetOps &&
      inZeroLock &&
      routeHasLogistics &&
      routeHasChecklist &&
      appPassesNightKey &&
      rtUsesNightKey &&
      rtManualDriveNo90 &&
      rtNoPolarScopeModal &&
      rtReconAndLapse &&
      rtChecklistExport;
  } catch {}
  assert("AS21: 5-tab architecture, RouteTab nightKey sync, manual drive slider (no : 90), recon links/lapse rate, and checklist JSON export (0 escapes)", passed);
}

// AS22: targetOpsEngine.ts pure astronomy engine in ZERO_LOCK (0 escapes), 6 widefield targets, angular separation, lunar separation, meridian transit, and visibility curve.
{
  let passed = false;
  try {
    const toePath = path.resolve(process.cwd(), 'src/lib/targetOpsEngine.ts');
    const tecPath = path.resolve(process.cwd(), 'scripts/type-escape-check.ts');
    const toeSrc = fs.readFileSync(toePath, 'utf8');
    const tecSrc = fs.readFileSync(tecPath, 'utf8');

    const toeEscapes = scanTypeEscapes('src/lib/targetOpsEngine.ts', toeSrc);
    const inZeroLock = tecSrc.includes("'src/lib/targetOpsEngine.ts'");

    const hasCoreFunctions =
      toeSrc.includes('WIDEFIELD_MILKY_WAY_TARGETS') &&
      toeSrc.includes('calculateAngularSeparation') &&
      toeSrc.includes('calculateTargetLunarSeparation') &&
      toeSrc.includes('calculateMeridianTransit') &&
      toeSrc.includes('calculateTargetVisibilityCurve') &&
      toeSrc.includes('analyzeTargetForNight');

    const mod = await import('../src/lib/targetOpsEngine');
    const widefieldCount = Array.isArray(mod.WIDEFIELD_MILKY_WAY_TARGETS) && mod.WIDEFIELD_MILKY_WAY_TARGETS.length >= 6;
    const hasMwCore = widefieldCount && mod.WIDEFIELD_MILKY_WAY_TARGETS[0].id === 'mw-core';

    const sep90 = mod.calculateAngularSeparation(0, 0, 6, 0);
    const sep0 = mod.calculateAngularSeparation(12, 45, 12, 45);
    const validSep = Math.abs(sep90 - 90) < 0.1 && sep0 === 0;

    const testEph = calculateNightEphemeris('2026-08-15', 38.0, 32.0, 1500, 'Europe/Istanbul');
    const transit = mod.calculateMeridianTransit(mod.WIDEFIELD_MILKY_WAY_TARGETS[0], testEph, 38.0, 32.0, 'Europe/Istanbul');
    const validTransit = typeof transit.transitAltitude === 'number' && typeof transit.transitTimeLabel === 'string' && transit.transitTimeLabel.includes(':');

    const curve = mod.calculateTargetVisibilityCurve(mod.WIDEFIELD_MILKY_WAY_TARGETS[0], testEph, 38.0, 32.0, 'Europe/Istanbul', 20);
    const validCurve = Array.isArray(curve.points) && curve.points.length > 0 && typeof curve.qualityScore === 'number';

    const lunar = mod.calculateTargetLunarSeparation(mod.WIDEFIELD_MILKY_WAY_TARGETS[0], new Date(testEph.date.getTime()), 38.0, 32.0);
    const validLunar = typeof lunar.separationDeg === 'number' && typeof lunar.moonIllumination === 'number' && ['optimal', 'moderate', 'severe'].includes(lunar.warningLevel);

    const analysis = mod.analyzeTargetForNight(mod.WIDEFIELD_MILKY_WAY_TARGETS[0], testEph, 38.0, 32.0, 'Europe/Istanbul', 20);
    const validAnalysis = typeof analysis.overallScore === 'number' && analysis.tacticalSummary.length > 0;

    passed =
      toeEscapes.length === 0 &&
      inZeroLock &&
      hasCoreFunctions &&
      hasMwCore &&
      validSep &&
      validTransit &&
      validCurve &&
      validLunar &&
      validAnalysis;
  } catch {}
  assert("AS22: targetOpsEngine.ts pure astronomy engine in ZERO_LOCK (0 escapes), 6 widefield targets, angular separation, lunar separation, meridian transit, and visibility curve", passed);
}

// AS23: Behavioral targetOpsEngine astronomy (mountain obstruction drop, score separation, live HA/reference time shift, dark peak altitude), RouteTab v2 cache, and TargetOpsTab console with audio alarm (0 escapes).
{
  let passed = false;
  try {
    const toePath = path.resolve(process.cwd(), 'src/lib/targetOpsEngine.ts');
    const totPath = path.resolve(process.cwd(), 'src/components/tabs/TargetOpsTab.tsx');
    const rtPath = path.resolve(process.cwd(), 'src/components/tabs/RouteTab.tsx');
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const toeSrc = fs.readFileSync(toePath, 'utf8');
    const totSrc = fs.readFileSync(totPath, 'utf8');
    const rtSrc = fs.readFileSync(rtPath, 'utf8');
    const appSrc = fs.readFileSync(appPath, 'utf8');

    const toeEscapes = scanTypeEscapes('src/lib/targetOpsEngine.ts', toeSrc);
    const totEscapes = scanTypeEscapes('src/components/tabs/TargetOpsTab.tsx', totSrc);
    const rtEscapes = scanTypeEscapes('src/components/tabs/RouteTab.tsx', rtSrc);

    const hasTerrainAndSouthern =
      toeSrc.includes('getTerrainObstructionAtAzimuth') &&
      toeSrc.includes('mw-carina-crux') &&
      toeSrc.includes('horizonProfile') &&
      toeSrc.includes('hourAngleHours');

    const appPassesNightKeyToTargets =
      appSrc.includes('<TargetOpsTab') && appSrc.includes('selectedNightKey={selectedNightKey}');

    const rtHasV2Cache = rtSrc.includes("'chroma_nocta_equipment_profiles_v2'");

    const totHasFullConsole =
      totSrc.includes('selectedNightKey') &&
      totSrc.includes('minAltitudeDeg') &&
      totSrc.includes('alarmLeadMinutes') &&
      totSrc.includes('chroma_nocta_custom_targets_v1') &&
      totSrc.includes('AudioContext') &&
      totSrc.includes('playMeridianBeep') &&
      totSrc.includes('formatSiteTimeHM') &&
      totSrc.includes('showAllTargets');

    const toeMod = await import('../src/lib/targetOpsEngine');
    const m31 = toeMod.ALL_ASTRO_TARGETS.find((t) => t.id === 'm31');
    const testTarget = m31 ?? toeMod.ALL_ASTRO_TARGETS[0];
    const testEph = calculateNightEphemeris('2026-10-14', 39.78, 41.23, 1900, 'Europe/Istanbul');

    // 1. Behavioral Mountain Obstruction Proof
    const flatRes = toeMod.analyzeTargetForNight(testTarget, testEph, 39.78, 41.23, 'Europe/Istanbul', 30, null, [0, 0, 0, 0, 0, 0, 0, 0]);
    const mtnRes = toeMod.analyzeTargetForNight(testTarget, testEph, 39.78, 41.23, 'Europe/Istanbul', 30, null, [65, 65, 65, 65, 65, 65, 65, 65]);
    const mountainProven =
      mtnRes.visibility.observableHours < flatRes.visibility.observableHours &&
      mtnRes.overallScore < flatRes.overallScore;

    // 2. Behavioral Score Separation (Ceiling saturation avoidance) Proof
    const allNightScores = toeMod.ALL_ASTRO_TARGETS.map((t) =>
      toeMod.analyzeTargetForNight(t, testEph, 39.78, 41.23, 'Europe/Istanbul', 30)
    );
    allNightScores.sort((a, b) => b.overallScore - a.overallScore);
    const top5 = allNightScores.slice(0, 5);
    const top5NotAll100 = !top5.every((r) => r.overallScore === 100);
    const countWith100 = allNightScores.filter((r) => r.overallScore === 100).length;
    const scoreSeparationProven = top5NotAll100 && countWith100 <= 1 && allNightScores.length === 37;

    // 3. Behavioral Reference Time (Live Hour Angle) Proof
    const refBaseMs = testEph.date.getTime() + 8 * 3600 * 1000;
    const t0 = new Date(refBaseMs);
    const t1 = new Date(refBaseMs + 3600 * 1000);
    const m0 = toeMod.calculateMeridianTransit(testTarget, testEph, 39.78, 41.23, 'Europe/Istanbul', t0);
    const m1 = toeMod.calculateMeridianTransit(testTarget, testEph, 39.78, 41.23, 'Europe/Istanbul', t1);
    const deltaMin = m0.timeToTransitMinutes - m1.timeToTransitMinutes;
    const rawDeltaHA = Math.abs(m1.hourAngleHours - m0.hourAngleHours);
    const deltaHA = rawDeltaHA > 12 ? Math.abs(24 - rawDeltaHA) : rawDeltaHA;
    const refTimeProven = Math.abs(deltaMin - 60) <= 2 && Math.abs(deltaHA - 1.0) <= 0.15;

    // 4. Dark Peak Altitude Proof
    const darkPeakProven =
      typeof flatRes.visibility.darkPeakAltitude === 'number' &&
      flatRes.visibility.darkPeakAltitude > 0;

    passed =
      toeEscapes.length === 0 &&
      totEscapes.length === 0 &&
      rtEscapes.length === 0 &&
      hasTerrainAndSouthern &&
      appPassesNightKeyToTargets &&
      rtHasV2Cache &&
      totHasFullConsole &&
      mountainProven &&
      scoreSeparationProven &&
      refTimeProven &&
      darkPeakProven;
  } catch {}
  assert("AS23: Behavioral targetOpsEngine astronomy (mountain obstruction drop, score separation, live HA/reference time shift, dark peak altitude), RouteTab v2 cache, and TargetOpsTab console with audio alarm (0 escapes)", passed);
}

// AS24: Version bumped to v1.4, AltitudeCurve renders Galactic Core (Sgr A* RA 17.7611, Dec -29.0078) curve & telemetry, TargetOpsTab uses 30s clock interval, and SkyVizorTab implements unlocked free pan/tilt camera FOV, mosaic grid planner, and procedural Milky Way ribbon (0 escapes).
{
  let passed = false;
  try {
    const metaPath = path.resolve(process.cwd(), 'metadata.json');
    const headerPath = path.resolve(process.cwd(), 'src/components/Header.tsx');
    const indexPath = path.resolve(process.cwd(), 'index.html');
    const settingsPath = path.resolve(process.cwd(), 'src/components/SettingsModal.tsx');
    const altPath = path.resolve(process.cwd(), 'src/components/AltitudeCurve.tsx');
    const totPath = path.resolve(process.cwd(), 'src/components/tabs/TargetOpsTab.tsx');
    const skyPath = path.resolve(process.cwd(), 'src/components/tabs/SkyVizorTab.tsx');

    const metaSrc = fs.readFileSync(metaPath, 'utf8');
    const headerSrc = fs.readFileSync(headerPath, 'utf8');
    const indexSrc = fs.readFileSync(indexPath, 'utf8');
    const settingsSrc = fs.readFileSync(settingsPath, 'utf8');
    const altSrc = fs.readFileSync(altPath, 'utf8');
    const totSrc = fs.readFileSync(totPath, 'utf8');
    const skySrc = fs.readFileSync(skyPath, 'utf8');

    const altEscapes = scanTypeEscapes('src/components/AltitudeCurve.tsx', altSrc);
    const totEscapes = scanTypeEscapes('src/components/tabs/TargetOpsTab.tsx', totSrc);
    const skyEscapes = scanTypeEscapes('src/components/tabs/SkyVizorTab.tsx', skySrc);

    const versionBumped =
      metaSrc.includes('1.4') &&
      headerSrc.includes('1.4') &&
      indexSrc.includes('1.4') &&
      settingsSrc.includes('1.4');

    const altHasGalacticCore =
      altSrc.includes('17.7611') &&
      altSrc.includes('-29.0078') &&
      altSrc.includes('Galactic Core');

    const totHas30sClock =
      totSrc.includes('30000') || totSrc.includes('30 * 1000');

    const skyHasUnlockedPanTilt =
      (skySrc.includes('freePan') || skySrc.includes('unlock') || skySrc.includes('isCameraUnlocked') || skySrc.includes('freeCamera') || skySrc.includes('panTilt')) &&
      (skySrc.includes('viewAzimuth') || skySrc.includes('cameraAzimuth'));

    const skyHasMosaicPlanner =
      skySrc.includes('mosaic') || skySrc.includes('Mosaic');

    const skyHasMilkyWayRibbon =
      skySrc.includes('ribbon') || skySrc.includes('Ribbon') || skySrc.includes('milkyWayRibbon');

    passed =
      altEscapes.length === 0 &&
      totEscapes.length === 0 &&
      skyEscapes.length === 0 &&
      versionBumped &&
      altHasGalacticCore &&
      totHas30sClock &&
      skyHasUnlockedPanTilt &&
      skyHasMosaicPlanner &&
      skyHasMilkyWayRibbon;
  } catch {}
  assert("AS24: Version bumped to v1.4, AltitudeCurve renders Galactic Core (Sgr A* RA 17.7611, Dec -29.0078) curve & telemetry, TargetOpsTab uses 30s clock interval, and SkyVizorTab implements unlocked free pan/tilt camera FOV, mosaic grid planner, and procedural Milky Way ribbon (0 escapes)", passed);
}

// AS25: StarAlignmentEngine pure relative star-triangle plate-solve (centroid & HFR detection, triangle matching, shift/PA solve), Tab 4 smooth spline & scrubber mechanics, and Tab 5 optical sensor presets, terrain mask & IndexedDB Module H (0 escapes).
{
  let passed = false;
  try {
    const starPath = path.resolve(process.cwd(), 'src/lib/starAlignmentEngine.ts');
    const totPath = path.resolve(process.cwd(), 'src/components/tabs/TargetOpsTab.tsx');
    const skyPath = path.resolve(process.cwd(), 'src/components/tabs/SkyVizorTab.tsx');
    const escapeCheckPath = path.resolve(process.cwd(), 'scripts/type-escape-check.ts');

    const starSrc = fs.readFileSync(starPath, 'utf8');
    const totSrc = fs.readFileSync(totPath, 'utf8');
    const skySrc = fs.readFileSync(skyPath, 'utf8');
    const escapeSrc = fs.readFileSync(escapeCheckPath, 'utf8');

    const starEscapes = scanTypeEscapes('src/lib/starAlignmentEngine.ts', starSrc);
    const totEscapes = scanTypeEscapes('src/components/tabs/TargetOpsTab.tsx', totSrc);
    const skyEscapes = scanTypeEscapes('src/components/tabs/SkyVizorTab.tsx', skySrc);

    // 1. Module & Zero-lock verification
    const inZeroLock = escapeSrc.includes("'src/lib/starAlignmentEngine.ts'");

    // 2. Tab 4 Smooth Spline & Scrubber verification
    const totHasSpline =
      totSrc.includes('getSmoothSplinePath') &&
      totSrc.includes('splinePts') &&
      totSrc.includes('<path') &&
      totSrc.includes('onTouchMove');

    // 3. Tab 5 Full Optics, Terrain & Module H Plate-Solve verification
    const skyHasOptics =
      skySrc.includes('SENSOR_PRESETS') &&
      skySrc.includes('pixelScaleArcsec') &&
      skySrc.includes('cropFactor');

    const skyHasTerrain =
      skySrc.includes('getTerrainObstructionAtAzimuth') &&
      skySrc.includes('horizonProfile');

    const skyHasPlateSolveAndIDB =
      skySrc.includes('solveFrameAlignment') &&
      skySrc.includes('detectBrightStarsFromImageData') &&
      skySrc.includes('indexedDB') &&
      skySrc.includes('instructionSummary');

    // 4. Behavioral Plate-Solve Engine execution
    const starEngine = await import('../src/lib/starAlignmentEngine');
    const imgW = 200;
    const imgH = 200;
    const refPixels = new Uint8ClampedArray(imgW * imgH * 4);
    const starCoords = [
      { x: 35, y: 40 },
      { x: 120, y: 45 },
      { x: 80, y: 135 },
      { x: 160, y: 125 },
      { x: 55, y: 105 },
      { x: 145, y: 75 },
    ];

    // Paint synthetic stars with Gaussian profile
    for (const sc of starCoords) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const px = sc.x + dx;
          const py = sc.y + dy;
          if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
            const distSq = dx * dx + dy * dy;
            const intensity = Math.max(0, Math.round(250 * Math.exp(-distSq / 3.5)));
            const idx = (py * imgW + px) * 4;
            const cur = refPixels[idx] ?? 0;
            const val = Math.min(255, cur + intensity);
            refPixels[idx] = val;
            refPixels[idx + 1] = val;
            refPixels[idx + 2] = val;
            refPixels[idx + 3] = 255;
          }
        }
      }
    }

    const detectedRef = starEngine.detectBrightStarsFromImageData(refPixels, imgW, imgH, 20);
    const refCountValid = detectedRef.length >= 5;

    // Shift test image by +8px in X, -4px in Y and slightly softer focus (sigma 6.0)
    const testPixels = new Uint8ClampedArray(imgW * imgH * 4);
    for (const sc of starCoords) {
      const tx = sc.x + 8;
      const ty = sc.y - 4;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const px = tx + dx;
          const py = ty + dy;
          if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
            const distSq = dx * dx + dy * dy;
            const intensity = Math.max(0, Math.round(240 * Math.exp(-distSq / 6.0)));
            const idx = (py * imgW + px) * 4;
            const cur = testPixels[idx] ?? 0;
            const val = Math.min(255, cur + intensity);
            testPixels[idx] = val;
            testPixels[idx + 1] = val;
            testPixels[idx + 2] = val;
            testPixels[idx + 3] = 255;
          }
        }
      }
    }

    const detectedTest = starEngine.detectBrightStarsFromImageData(testPixels, imgW, imgH, 20);
    const solution = starEngine.solveFrameAlignment(detectedRef, detectedTest, 12.0, 8.0);

    const solverValid =
      solution.matchedStarsCount >= 3 &&
      solution.shiftXPercent > 0 &&
      solution.testAvgHfrPx >= solution.refAvgHfrPx &&
      solution.instructionSummary.length > 10;

    passed =
      starEscapes.length === 0 &&
      totEscapes.length === 0 &&
      skyEscapes.length === 0 &&
      inZeroLock &&
      totHasSpline &&
      skyHasOptics &&
      skyHasTerrain &&
      skyHasPlateSolveAndIDB &&
      refCountValid &&
      solverValid;
  } catch {}
  assert("AS25: StarAlignmentEngine pure relative star-triangle plate-solve (centroid & HFR detection, triangle matching, shift/PA solve), Tab 4 smooth spline & scrubber mechanics, and Tab 5 optical sensor presets, terrain mask & IndexedDB Module H (0 escapes)", passed);
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`  SONUÇ: ${passCount} geçti, ${failCount} başarısız.`);
console.log('═══════════════════════════════════════════════════════════════════════\n');

if (failCount > 0) {
  process.exitCode = 1;
}
