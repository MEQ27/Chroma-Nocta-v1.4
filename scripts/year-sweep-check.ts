/**
 * YILLIK ÇOKLU SAHA TARAMA VE DEĞİŞMEZ KURAL DENETİMİ (year-sweep-check.ts)
 *
 * Amaç: PRESET_LOCATIONS içindeki 8 saha için 365 gün (2.920 gece) boyunca
 * efemeris fonksiyonunun fiziksel değişmezlerini (invariant) denetlemek:
 *  1) Olay sıralaması: sunset <= civilDusk <= nauticalDusk <= astroDusk <= astroDawn <= nauticalDawn <= civilDawn <= sunrise
 *  2) Süre sınırları: 0 <= moonlessDarkMinutes <= darkDurationMinutes <= 1440
 */
import { calculateNightEphemeris } from '../src/lib/ephemeris';
import { PRESET_LOCATIONS } from '../src/lib/coordinateParser';
import { addDaysToDateKey } from '../src/lib/siteTime';

const START_DATE_KEY = '2026-10-07';
const TOTAL_DAYS = 365;

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — 365 GÜN / 8 SAHA YILLIK TARAMA DENETİMİ');
console.log('═══════════════════════════════════════════════════════════════════════\n');

interface SweepViolation {
  siteName: string;
  dateKey: string;
  type: 'order' | 'duration';
  detail: string;
  moonless?: number;
  dark?: number;
}

const violations: SweepViolation[] = [];
let totalNights = 0;

for (const loc of PRESET_LOCATIONS) {
  const tz = loc.timeZone || 'Europe/Istanbul';

  for (let d = 0; d < TOTAL_DAYS; d++) {
    totalNights++;
    const dateKey = addDaysToDateKey(START_DATE_KEY, d);
    const ephem = calculateNightEphemeris(
      dateKey,
      loc.latitude,
      loc.longitude,
      loc.elevation,
      tz,
      loc.horizonProfile
    );

    // a) Olay sıralaması denetimi
    const times = [
      ephem.sunset,
      ephem.civilDusk,
      ephem.nauticalDusk,
      ephem.astroDusk,
      ephem.astroDawn,
      ephem.nauticalDawn,
      ephem.civilDawn,
      ephem.sunrise,
    ]
      .filter((t): t is Date => t !== null)
      .map((t) => t.getTime());

    for (let j = 0; j < times.length - 1; j++) {
      if (times[j] > times[j + 1]) {
        violations.push({
          siteName: loc.name,
          dateKey,
          type: 'order',
          detail: `Olay sıralaması hatası (${j} > ${j + 1})`,
        });
        break;
      }
    }

    // b) Süre mantığı: 0 <= moonlessDarkMinutes <= darkDurationMinutes <= 1440
    if (ephem.moonlessDarkMinutes > ephem.darkDurationMinutes) {
      violations.push({
        siteName: loc.name,
        dateKey,
        type: 'duration',
        detail: `moonless (${ephem.moonlessDarkMinutes} dk) > dark (${ephem.darkDurationMinutes} dk)`,
        moonless: ephem.moonlessDarkMinutes,
        dark: ephem.darkDurationMinutes,
      });
    } else if (
      ephem.moonlessDarkMinutes < 0 ||
      ephem.darkDurationMinutes < 0 ||
      ephem.darkDurationMinutes > 1440
    ) {
      violations.push({
        siteName: loc.name,
        dateKey,
        type: 'duration',
        detail: `Sınır dışı süre: moonless=${ephem.moonlessDarkMinutes}, dark=${ephem.darkDurationMinutes}`,
      });
    }
  }
}

console.log(`[BİLGİ] Taranan toplam gece sayısı: ${totalNights.toLocaleString('tr-TR')} (${PRESET_LOCATIONS.length} saha x ${TOTAL_DAYS} gün)`);
console.log(`[BİLGİ] Tespit edilen toplam ihlal sayısı: ${violations.length}\n`);

if (violations.length > 0) {
  console.error(`❌ BAŞARISIZ: ${violations.length} ihlal tespit edildi (Beklenen: 0)!`);
  console.error('─── İLK 5 İHLAL KAYDI ───');
  violations.slice(0, 5).forEach((v, idx) => {
    console.error(`  ${idx + 1}. [${v.siteName}] ${v.dateKey} -> ${v.detail}`);
  });
  process.exit(1);
}

console.log('🟢 GEÇTİ: 0 ihlal tespit edildi. Değişmez kurallar tam sağlandı.');
process.exit(0);
