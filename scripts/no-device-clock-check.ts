/**
 * CİHAZ SAATİ & SESSİZ SAAT DİLİMİ STATİK ANALİZÖRÜ (no-device-clock-check.ts)
 *
 * Amaç:
 * 1. Grup 1: src/ dizinindeki dosyalarda cihaz saati fonksiyonlarının (.getHours(), .getMonth() vb.)
 *    doğrudan çağrılmasını engellemek (0 tolerans).
 * 2. Grup 2: Sessiz saat dilimi varsayılanlarını (|| 'UTC', timeZone = '...', instant = Date.now())
 *    tespit etmek ve ratchet tablosu ile sıfıra indirilene kadar sıkı kontrol altında tutmak.
 */
import fs from 'fs';
import path from 'path';

// ============================================================================
// GRUP 1: CİHAZ SAATİ SIZINTI DENETİMİ
// ============================================================================
const BASELINE_CLOCK_VIOLATIONS = 0;

const FORBIDDEN_CLOCK_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: '.getHours()', regex: /\.getHours\(\)/g },
  { name: '.getMinutes()', regex: /\.getMinutes\(\)/g },
  { name: '.getDate()', regex: /\.getDate\(\)/g },
  { name: '.getDay()', regex: /\.getDay\(\)/g },
  { name: '.getFullYear()', regex: /\.getFullYear\(\)/g },
  { name: '.getMonth()', regex: /\.getMonth\(\)/g },
  { name: '.setHours(', regex: /\.setHours\(/g },
  { name: '.toLocaleDateString()', regex: /\.toLocaleDateString\(\)/g },
  { name: '.toLocaleTimeString()', regex: /\.toLocaleTimeString\(\)/g },
];

const CLOCK_ALLOWLIST = [
  'src/lib/siteTime.ts',
];

// ============================================================================
// GRUP 2: SESSİZ SAAT DİLİMİ VARSAYILANLARI (RATCHET)
// ============================================================================
const TIMEZONE_DEFAULT_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "|| '(UTC|Europe/Istanbul)'", regex: /\|\|\s*'(UTC|Europe\/Istanbul)'/g },
  { name: "?? '(UTC|Europe/Istanbul)'", regex: /\?\?\s*'(UTC|Europe\/Istanbul)'/g },
  { name: "timeZone = '...'", regex: /timeZone\s*(:\s*string)?\s*=\s*'[A-Za-z_\/]+'/g },
  { name: 'instant|nowMs|now = Date.now()', regex: /\b(instant|nowMs|now)\b\s*(:[^=,)]+)?=\s*Date\.now\(\)/g },
];

const TIMEZONE_EXEMPT_FILES = [
  'src/lib/coordinateParser.ts',
  'src/lib/selfCheck.ts',
];

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — SAAT & ZAMAN DİLİMİ STATİK AUDIT KONTROLÜ');
console.log('═══════════════════════════════════════════════════════════════════════\n');

function scanDir(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, fileList);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allFiles = scanDir('src');

// ----------------------------------------------------------------------------
// GRUP 1 YÜRÜTME
// ----------------------------------------------------------------------------
let totalClockViolations = 0;
const fileClockViolations: { file: string; count: number; details: string[] }[] = [];

for (const filePath of allFiles) {
  const normalized = filePath.replace(/\\/g, '/');
  if (CLOCK_ALLOWLIST.some((allowed) => normalized.endsWith(allowed))) {
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const details: string[] = [];
  let fileCount = 0;

  for (const { name, regex } of FORBIDDEN_CLOCK_PATTERNS) {
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      fileCount += matches.length;
      details.push(`${name} x${matches.length}`);
    }
  }

  if (fileCount > 0) {
    totalClockViolations += fileCount;
    fileClockViolations.push({ file: normalized, count: fileCount, details });
  }
}

console.log('─── GRUP 1: CİHAZ SAATİ SIZINTISI (DEVICE CLOCK LEAKS) ───');
console.log(`[BİLGİ] Taranan dosya sayısı: ${allFiles.length}`);
console.log(`[BİLGİ] İzinli istisna (Allowlist): ${CLOCK_ALLOWLIST.join(', ')}`);
console.log(`[BİLGİ] Taban eşik: ${BASELINE_CLOCK_VIOLATIONS}`);
console.log(`[BİLGİ] Tespit edilen ihlal: ${totalClockViolations}\n`);

fileClockViolations.forEach(({ file, count, details }) => {
  console.log(`  • ${file.padEnd(45)} : ${count.toString().padStart(2)} ihlal  [${details.join(', ')}]`);
});

let clockPassed = true;
if (totalClockViolations > BASELINE_CLOCK_VIOLATIONS) {
  console.error(`❌ BAŞARISIZ (Grup 1): Yeni cihaz saati sızıntısı tespit edildi! (+${totalClockViolations - BASELINE_CLOCK_VIOLATIONS})`);
  clockPassed = false;
} else {
  console.log(`🟢 GRUP 1 GEÇTİ: Cihaz saati sızıntısı bulunamadı (0 ihlal).\n`);
}

// ----------------------------------------------------------------------------
// GRUP 2 YÜRÜTME
// ----------------------------------------------------------------------------
console.log('─── GRUP 2: SESSİZ SAAT DİLİMİ VARSAYILANLARI (RATCHET) ───');
const detectedTzDefaults: Record<string, { count: number; details: string[] }> = {};
let totalDetectedTz = 0;

for (const filePath of allFiles) {
  const normalized = filePath.replace(/\\/g, '/');
  if (TIMEZONE_EXEMPT_FILES.some((ex) => normalized.endsWith(ex))) {
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  let fileCount = 0;
  const details: string[] = [];

  for (const { name, regex } of TIMEZONE_DEFAULT_PATTERNS) {
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      fileCount += matches.length;
      details.push(`${name} x${matches.length}`);
    }
  }

  if (fileCount > 0) {
    detectedTzDefaults[normalized] = { count: fileCount, details };
    totalDetectedTz += fileCount;
  }
}

console.log(`[BİLGİ] Taranan dosya sayısı: ${allFiles.length}`);
console.log(`[BİLGİ] Muaf dosyalar (Exempt): ${TIMEZONE_EXEMPT_FILES.join(', ')}`);
console.log(`[BİLGİ] Toplam sessiz varsayılan: ${totalDetectedTz}\n`);

let tzPassed = true;
if (totalDetectedTz > 0) {
  console.error(`❌ BAŞARISIZ (Grup 2): Sessiz saat dilimi veya saat varsayılanı tespit edildi! (${totalDetectedTz} ihlal)`);
  Object.entries(detectedTzDefaults).forEach(([file, { count, details }]) => {
    console.error(`  • ${file.padEnd(45)} : ${count} ihlal [${details.join(', ')}]`);
  });
  tzPassed = false;
} else {
  console.log(`🟢 GRUP 2 GEÇTİ: Kod tabanında 0 sessiz saat dilimi/saat varsayılanı (Katı sıfır tabanı sağlandı).\n`);
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
if (clockPassed && tzPassed) {
  console.log('🎉 TÜM AUDIT KONTROLLERİ BAŞARIYLA GEÇTİ (0 yeni ihlal).');
  process.exit(0);
} else {
  console.error('💥 AUDIT BAŞARISIZ OLDU.');
  process.exit(1);
}
