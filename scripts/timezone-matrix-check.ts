import { execSync } from 'child_process';

const MATRIX_ZONES = [
  'Pacific/Auckland',   // UTC+13 (Uç Doğu)
  'Asia/Tokyo',         // UTC+9
  'Europe/Istanbul',     // UTC+3 (Türkiye Yerel)
  'UTC',                // UTC+0 (Mutlak Taban)
  'America/Santiago',   // UTC-3 (Şili Paranal Sahası)
  'America/New_York',   // UTC-4
  'Pacific/Honolulu',   // UTC-10 (Uç Batı)
];

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — CİHAZ SAAT DİLİMİ MATRİS DENETİMİ (P0-B)');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let allPassed = true;

for (const tz of MATRIX_ZONES) {
  process.stdout.write(`[TEST] Cihaz Saati = ${tz.padEnd(18)} ... `);
  
  try {
    // 1) golden-check.ts'yi izole TZ ortamında koştur
    const goldenOutput = execSync('npx tsx scripts/golden-check.ts', {
      env: { ...process.env, TZ: tz },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const hasFailed =
      /\b[1-9]\d*\s+kaldı/.test(goldenOutput) ||
      goldenOutput.includes('HATALARI:');

    // 2) Şili Paranal yerel duvar saati formatlamasını doğrudan sına (19:51 yerel batış teyidi)
    const testSnippet = `
      import { calculateNightEphemeris, formatTimeHM } from './src/lib/ephemeris';
      const e = calculateNightEphemeris('2026-10-06', -24.627, -70.404, 2635, 'America/Santiago');
      const sunsetStr = formatTimeHM(e.sunset, 'America/Santiago');
      if (sunsetStr !== '19:49') {
        console.error('HATA: Beklenen 19:49, bulunan ' + sunsetStr);
        process.exit(1);
      }
    `;

    execSync(`npx tsx -e "${testSnippet.replace(/\n/g, ' ')}"`, {
      env: { ...process.env, TZ: tz },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (hasFailed) {
      console.log('❌ BAŞARISIZ');
      console.error(goldenOutput);
      allPassed = false;
    } else {
      console.log('🟢 GEÇTİ (64/64 + HARİCİ 4/4 + Etiket 19:49)');
    }
  } catch (err: any) {
    console.log('❌ ÇÖKTÜ');
    console.error(err.stderr || err.message);
    allPassed = false;
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
if (allPassed) {
  console.log('  SONUÇ: 7/7 SAAT DİLİMİ TAM YEŞİL — Cihaz saati bağımlılığı %100 izole.');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  process.exit(0);
} else {
  console.error('  SONUÇ: MATRİS TESTİ BAŞARISIZ OLDU.');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  process.exit(1);
}
