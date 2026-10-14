/**
 * OLAY TABANLI BISECTION AY DOĞUŞ/BATIŞ MOTORU (moonEphemeris.ts - Ephemeris v2)
 *
 * Amaç: Sahanın 24 saatlik döngüsünde Ay'ın ufuk geçişlerini kaba aralık
 * tespiti (bracketing) ve ardından bisection (ikiye bölme) yöntemiyle
 * <5 saniye hassasiyetinde deterministik ve analitik olarak bulmak (C1 Görevi).
 *
 * İlkeler:
 * 1. CİHAZ SAATİ YASAĞI: getHours(), getDate() vb. yerel API'ler kullanılmaz.
 *    Tüm zamanlar UTC milisaniye epoch üzerinden yürütülür.
 * 2. KUTUP / SİRKUMPOLAR / DOĞMAYAN AY: 24 saat boyunca ufku kesmeyen durumlarda
 *    asla sahte saat üretilmez; doğrudan null dönülür.
 * 3. ANALİTİK HASSASİYET: Maksimum 15 iterasyon veya Delta t < 5 sn toleransı.
 */

import {
  getLunarCoordinates,
  getHorizontalCoordinates,
  getTerrainAltitude,
} from './ephemeris';

export interface MoonCrossingResult {
  moonrise: Date | null;
  moonset: Date | null;
  isCircumpolar: boolean;
  isNeverUp: boolean;
}

/**
 * Belirli bir anda Ay'ın hedeflenen efektif irtifaya göre farkını hesaplar.
 * Fark > 0 ise Ay ufkun üstünde, < 0 ise ufkun altındadır.
 * Dağ engeli varsa dip baskılanır; arazi düz ise geometrik dip uygulanır.
 */
export function getMoonEffectiveAltitudeDiff(
  time: Date | number,
  lat: number,
  lng: number,
  targetAlt: number = 0,
  horizonProfile?: number[],
  dip: number = 0
): number {
  const tDate = typeof time === 'number' ? new Date(time) : time;
  const coords = getLunarCoordinates(tDate);
  const horiz = getHorizontalCoordinates(tDate, coords.ra, coords.dec, lat, lng);
  const terrainAlt = getTerrainAltitude(horiz.azimuth, horizonProfile);
  const effectiveThreshold = terrainAlt > 0 ? targetAlt + terrainAlt : targetAlt - dip;
  return horiz.altitude - effectiveThreshold;
}

/**
 * Belirli bir [start, end] zaman aralığında Ay'ın doğuş veya batış anını
 * iki aşamalı (Bracketing + Bisection) yöntemle bulur.
 *
 * @param start Aralık başlangıcı (Date veya UTC ms)
 * @param end Aralık bitişi (Date veya UTC ms)
 * @param targetAlt Hedef irtifa (Varsayılan 0° veya refraksiyonlu)
 * @param type 'rising' (doğuş) veya 'setting' (batış)
 * @param lat Enlem (derece)
 * @param lng Boylam (derece)
 * @param horizonProfile 8 yönlü arazi profili
 * @param dip Geometrik ufuk düşümü derecesi (dağ yoksa uygulanır)
 * @returns Geçiş anı Date nesnesi veya geçiş yoksa null
 */
export function findLunarCrossingBisection(
  start: Date | number,
  end: Date | number,
  targetAlt: number,
  type: 'rising' | 'setting',
  lat: number,
  lng: number,
  horizonProfile?: number[],
  dip: number = 0
): Date | null {
  const startMs = typeof start === 'number' ? start : start.getTime();
  const endMs = typeof end === 'number' ? end : end.getTime();

  if (endMs <= startMs) return null;

  // 1. AŞAMA: Kaba İşaret Değişimi Tespiti (Bracketing)
  // 24 saat için 96 adım (her adım 15 dakika = 900.000 ms)
  const steps = 96;
  const stepMs = (endMs - startMs) / steps;

  let prevTimeMs = startMs;
  let prevDiff = getMoonEffectiveAltitudeDiff(prevTimeMs, lat, lng, targetAlt, horizonProfile, dip);

  for (let i = 1; i <= steps; i++) {
    const curTimeMs = startMs + i * stepMs;
    const curDiff = getMoonEffectiveAltitudeDiff(curTimeMs, lat, lng, targetAlt, horizonProfile, dip);

    let hasTargetCrossing = false;
    if (type === 'setting' && prevDiff >= 0 && curDiff < 0) {
      hasTargetCrossing = true;
    } else if (type === 'rising' && prevDiff <= 0 && curDiff > 0) {
      hasTargetCrossing = true;
    }

    if (hasTargetCrossing) {
      // 2. AŞAMA: Bisection (İkiye Bölme) İterasyonu
      // [prevTimeMs, curTimeMs] aralığında kökü < 5 sn toleransla daralt
      let tLeft = prevTimeMs;
      let tRight = curTimeMs;
      let fLeft = prevDiff;
      let fRight = curDiff;

      const MAX_BISECTION_ITER = 15;
      const TOLERANCE_MS = 5000; // 5 saniye

      for (let iter = 0; iter < MAX_BISECTION_ITER; iter++) {
        if (tRight - tLeft <= TOLERANCE_MS) {
          break;
        }

        const tMid = tLeft + (tRight - tLeft) / 2;
        const fMid = getMoonEffectiveAltitudeDiff(tMid, lat, lng, targetAlt, horizonProfile, dip);

        if (Math.abs(fMid) < 1e-6) {
          tLeft = tMid;
          tRight = tMid;
          break;
        }

        if (type === 'setting') {
          // Setting: Sol pozitif, sağ negatif
          if (fMid >= 0) {
            tLeft = tMid;
            fLeft = fMid;
          } else {
            tRight = tMid;
            fRight = fMid;
          }
        } else {
          // Rising: Sol negatif, sağ pozitif
          if (fMid <= 0) {
            tLeft = tMid;
            fLeft = fMid;
          } else {
            tRight = tMid;
            fRight = fMid;
          }
        }
      }

      const rootMs = tLeft + (tRight - tLeft) / 2;
      return new Date(rootMs);
    }

    prevTimeMs = curTimeMs;
    prevDiff = curDiff;
  }

  return null;
}

/**
 * 24 saatlik tam oturum (startPeriod - startPeriod + 24h) için
 * Ay doğuş ve batış anlarını analitik olarak hesaplar.
 */
export function calculateMoonDayCrossings(
  startPeriod: Date | number,
  lat: number,
  lng: number,
  horizonProfile?: number[],
  targetAlt: number = 0,
  dip: number = 0
): MoonCrossingResult {
  const startMs = typeof startPeriod === 'number' ? startPeriod : startPeriod.getTime();
  const endMs = startMs + 24 * 3600 * 1000;

  const moonrise = findLunarCrossingBisection(
    startMs,
    endMs,
    targetAlt,
    'rising',
    lat,
    lng,
    horizonProfile,
    dip
  );

  const moonset = findLunarCrossingBisection(
    startMs,
    endMs,
    targetAlt,
    'setting',
    lat,
    lng,
    horizonProfile,
    dip
  );

  let isCircumpolar = false;
  let isNeverUp = false;

  if (!moonrise && !moonset) {
    // 24 saat boyunca hiç doğmadı ve batmadı; daima yukarıda mı daima aşağıda mı?
    const sampleMid = startMs + 12 * 3600 * 1000;
    const midDiff = getMoonEffectiveAltitudeDiff(sampleMid, lat, lng, targetAlt, horizonProfile, dip);
    if (midDiff > 0) {
      isCircumpolar = true;
    } else {
      isNeverUp = true;
    }
  }

  return {
    moonrise,
    moonset,
    isCircumpolar,
    isNeverUp,
  };
}
