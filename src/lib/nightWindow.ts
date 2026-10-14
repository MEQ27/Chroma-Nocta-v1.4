/**
 * ÇOKLU SAHA ORTAK GECE PENCERESİ KESİŞİMİ (nightWindow.ts)
 *
 * Amaç: Farklı koordinat, enlem ve saat dilimlerine sahip N adet sahanın
 * aynı geceye ait [astroDusk, astroDawn] aralıklarının matematiksel kesişimini
 * hesaplar (E1 Çekirdek Görevi).
 *
 * İlkeler:
 * 1. CİHAZ SAATİ YASAĞI: getHours(), getDate(), getTimezoneOffset() vb. yasaktır.
 *    Tüm hesaplamalar UTC epoch milisaniye üzerinden yürütülür.
 * 2. KATI FİZİKSEL DOĞRULUK: Beyaz gece, kutup gündüzü veya null dönen sahalarda
 *    sahte değer uydurulmaz; doğrudan null döner.
 * 3. KESİŞİM YOKSA NULL: max(dusk) >= min(dawn) durumunda aralık kesişmez; null döner.
 */

export interface SiteDarkInterval {
  siteId?: string;
  siteName?: string;
  astroDusk: Date | string | number | null | undefined;
  astroDawn: Date | string | number | null | undefined;
}

export interface CommonNightIntersection {
  start: Date;
  end: Date;
  durationMinutes: number;
  durationHours: number;
  hasCommonDarkness: boolean;
  participatingSitesCount: number;
}

function toEpochMs(val: Date | string | number): number {
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  return new Date(val).getTime();
}

/**
 * N adet sahanın [astroDusk, astroDawn] zifiri karanlık aralıklarının kesişimini hesaplar.
 *
 * @param intervals Sahaların karanlık pencereleri
 * @returns Kesişim aralığı veya ortak karanlık yoksa null
 */
export function calculateCommonNightWindow(
  intervals: (SiteDarkInterval | null | undefined)[]
): CommonNightIntersection | null {
  if (!intervals || intervals.length === 0) {
    return null;
  }

  // Sahaların her biri geçerli bir [astroDusk, astroDawn] çiftine sahip olmalıdır
  const duskList: number[] = [];
  const dawnList: number[] = [];

  for (const item of intervals) {
    if (!item) return null;
    if (item.astroDusk === null || item.astroDusk === undefined) return null;
    if (item.astroDawn === null || item.astroDawn === undefined) return null;

    const duskMs = toEpochMs(item.astroDusk);
    const dawnMs = toEpochMs(item.astroDawn);

    if (isNaN(duskMs) || isNaN(dawnMs)) return null;
    // dawn, dusk'tan sonra olmalıdır (aynı gece oturumu)
    if (dawnMs <= duskMs) return null;

    duskList.push(duskMs);
    dawnList.push(dawnMs);
  }

  // Ortak başlangıç: Tüm dusk anlarının en geç olanı (max)
  const maxDuskMs = Math.max(...duskList);
  // Ortak bitiş: Tüm dawn anlarının en erken olanı (min)
  const minDawnMs = Math.min(...dawnList);

  // Kesişim geçerlilik koşulu: max(dusk) < min(dawn)
  if (maxDuskMs >= minDawnMs) {
    return null;
  }

  const durationMs = minDawnMs - maxDuskMs;
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationHours = Number((durationMs / 3600000).toFixed(2));

  if (durationMinutes <= 0) {
    return null;
  }

  return {
    start: new Date(maxDuskMs),
    end: new Date(minDawnMs),
    durationMinutes,
    durationHours,
    hasCommonDarkness: true,
    participatingSitesCount: intervals.length,
  };
}

export interface EphemerisDarkBounds {
  readonly astroDusk: Date | null;
  readonly astroDawn: Date | null;
}

/**
 * SolarEphemerisDay nesnelerinden pratik ortak gece kesişimi çıkartıcı.
 */
export function findCommonNightWindowFromEphemeris<T extends EphemerisDarkBounds>(
  ephemerisList: readonly T[]
): CommonNightIntersection | null {
  if (!ephemerisList || ephemerisList.length === 0) return null;
  return calculateCommonNightWindow(
    ephemerisList.map((e) => ({
      astroDusk: e.astroDusk,
      astroDawn: e.astroDawn,
    }))
  );
}
