import { LocationData } from '../types';
import { isValidTimeZone } from './siteTime';
import { horizonDipDegrees } from './ephemeris';

export const PRESET_LOCATIONS: LocationData[] = [
  {
    id: 'bolu-sarialan',
    name: 'Bolu Sarıalan Yaylası (Aladağlar)',
    latitude: 40.612,
    longitude: 31.684,
    elevation: 1550,
    horizonDip: horizonDipDegrees(1550),
    bortleClass: 3,
    timeZone: 'Europe/Istanbul',
    timeZoneSource: 'preset',
  },
  {
    id: 'erzurum-dag',
    name: 'Erzurum Eastern Anatolia Observatory (DAG)',
    latitude: 39.778,
    longitude: 41.228,
    elevation: 3170,
    horizonDip: horizonDipDegrees(3170),
    bortleClass: 1,
    timeZone: 'Europe/Istanbul',
    timeZoneSource: 'preset',
  },
  {
    id: 'antalya-tug',
    name: 'Antalya Saklıkent (TÜBİTAK TUG)',
    latitude: 36.825,
    longitude: 30.334,
    elevation: 2500,
    horizonDip: horizonDipDegrees(2500),
    bortleClass: 2,
    timeZone: 'Europe/Istanbul',
    timeZoneSource: 'preset',
  },
  {
    id: 'isparta-melikler',
    name: 'Isparta Melikler Yaylası (Dedegöl)',
    latitude: 37.702,
    longitude: 31.328,
    elevation: 1735,
    horizonDip: horizonDipDegrees(1735),
    bortleClass: 2,
    timeZone: 'Europe/Istanbul',
    timeZoneSource: 'preset',
  },
  {
    id: 'canakkale-kazdaglari',
    name: 'Çanakkale Mount Ida (National Park)',
    latitude: 39.704,
    longitude: 26.852,
    elevation: 1420,
    horizonDip: horizonDipDegrees(1420),
    bortleClass: 3,
    timeZone: 'Europe/Istanbul',
    timeZoneSource: 'preset',
  },
  {
    id: 'mugla-sandras',
    name: 'Muğla Sandras Mountain (Gökçeova)',
    latitude: 37.067,
    longitude: 28.825,
    elevation: 2150,
    horizonDip: horizonDipDegrees(2150),
    bortleClass: 2,
    timeZone: 'Europe/Istanbul',
    timeZoneSource: 'preset',
  },
  {
    id: 'atacama-chile',
    name: 'Atacama Desert (Paranal / VLT)',
    latitude: -24.627,
    longitude: -70.404,
    elevation: 2635,
    horizonDip: horizonDipDegrees(2635),
    bortleClass: 1,
    timeZone: 'America/Santiago',
    timeZoneSource: 'preset',
  },
  {
    id: 'la-palma-roque',
    name: 'La Palma (Roque de los Muchachos)',
    latitude: 28.758,
    longitude: -17.885,
    elevation: 2396,
    horizonDip: horizonDipDegrees(2396),
    bortleClass: 1,
    timeZone: 'Atlantic/Canary',
    timeZoneSource: 'preset',
  },
];

const LOCATION_STORAGE_KEY = 'chroma_nocta_active_location';
const FAVORITES_STORAGE_KEY = 'chroma_nocta_favorite_locations';

export function calculateHorizonDip(elevationMeters: number): number {
  if (elevationMeters <= 0) return 0;
  return Number(horizonDipDegrees(elevationMeters).toFixed(4));
}

export interface ParseResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  format?: 'decimal' | 'dms' | 'google-maps';
  error?: string;
}

function normalizeCoordinateInput(rawInput: string): string {
  let s = rawInput.trim();

  // 1. Unicode eksi ve tireleri (U+2212, U+2013, U+2014, U+2012) '-' yap
  s = s.replace(/[\u2212\u2012\u2013\u2014]/g, '-');

  // 2. ′ ’ ‘ karakterlerini ', ″ ” “ karakterlerini " yap; º ve ˚ karakterlerini ° yap
  s = s.replace(/[′’‘\u2032\u2019\u2018]/g, "'");
  s = s.replace(/[″”“\u2033\u201D\u201C]/g, '"');
  s = s.replace(/[º˚\u00BA\u02DA]/g, '°');

  // 3. "lat", "lon", "lng", "enlem", "boylam" etiketlerini ve ':' '=' işaretlerini sil
  if (
    !s.includes('google.com/maps') &&
    !s.includes('maps.google.') &&
    !s.includes('maps.app.goo.gl')
  ) {
    s = s.replace(/\b(latitude|longitude|lat|lon|lng|enlem|boylam)\b/gi, '');
    s = s.replace(/[:=]/g, ' ');
  }

  // 4. ONDALIK VİRGÜL: girişte hiç nokta yoksa ve biçim `sayı,sayı <boşluk veya ;> sayı,sayı` ise virgülleri ondalık kabul et
  if (!s.includes('.')) {
    const decCommaRegex = /^([+-]?[NSEWnsew]?\s*\d+),(\d+\s*[NSEWnsew]?)([\s;]+)([+-]?[NSEWnsew]?\s*\d+),(\d+\s*[NSEWnsew]?)$/;
    const m = s.trim().match(decCommaRegex);
    if (m) {
      s = `${m[1]}.${m[2]}${m[3]}${m[4]}.${m[5]}`;
    }
  }

  return s.trim();
}

function checkContradiction(valStr: string, hem: string): string | null {
  if (!hem) return null;
  const isNeg = valStr.trim().startsWith('-');
  if (isNeg && (hem === 'N' || hem === 'E' || hem === 'S' || hem === 'W')) {
    return 'Sign and hemisphere letter contradict.';
  }
  return null;
}

export function parseCoordinateInput(rawInput: string): ParseResult {
  const input = rawInput.trim();
  if (!input) {
    return { success: false, error: 'Please enter a coordinate or map link.' };
  }

  const normalized = normalizeCoordinateInput(rawInput);

  // 1. Google Maps URLs
  if (normalized.includes('google.com/maps') || normalized.includes('maps.app.goo.gl') || normalized.includes('maps.google.')) {
    // !3d<lat>!4d<lng> pin/marker coords preferred over map center (@...)
    const pinMatch = normalized.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (pinMatch) {
      const lat = parseFloat(pinMatch[1]);
      const lng = parseFloat(pinMatch[2]);
      if (isValidCoord(lat, lng)) {
        return { success: true, latitude: lat, longitude: lng, format: 'google-maps' };
      }
    }
    const atMatch = normalized.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[2]);
      if (isValidCoord(lat, lng)) {
        return { success: true, latitude: lat, longitude: lng, format: 'google-maps' };
      }
    }
    const queryMatch = normalized.match(/[?&](?:q|ll|destination|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (queryMatch) {
      const lat = parseFloat(queryMatch[1]);
      const lng = parseFloat(queryMatch[2]);
      if (isValidCoord(lat, lng)) {
        return { success: true, latitude: lat, longitude: lng, format: 'google-maps' };
      }
    }
    const placeMatch = normalized.match(/\/place\/[^/]+\/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (placeMatch) {
      const lat = parseFloat(placeMatch[1]);
      const lng = parseFloat(placeMatch[2]);
      if (isValidCoord(lat, lng)) {
        return { success: true, latitude: lat, longitude: lng, format: 'google-maps' };
      }
    }
    const fallbackUrlMatch = normalized.match(/(-?\d{1,2}\.\d{3,8})[,\s/]+(-?\d{1,3}\.\d{3,8})/);
    if (fallbackUrlMatch) {
      const lat = parseFloat(fallbackUrlMatch[1]);
      const lng = parseFloat(fallbackUrlMatch[2]);
      if (isValidCoord(lat, lng)) {
        return { success: true, latitude: lat, longitude: lng, format: 'google-maps' };
      }
    }
    return {
      success: false,
      error: 'Could not extract coordinates from Google Maps link. Please provide valid coordinates.',
    };
  }

  // 2. DMS: derece ile dakika, dakika ile saniye arasında ayırıcı (°, ' veya en az bir boşluk) ZORUNLU
  const dmsRegex = /^([NSEWnsew])?\s*([+-]?\d{1,3})(?:°\s*|\s+)(\d+)(?:['\s]\s*)(\d+(?:\.\d+)?)(?:["\s]*)?([NSEWnsew])?[\s,;]+([NSEWnsew])?\s*([+-]?\d{1,3})(?:°\s*|\s+)(\d+)(?:['\s]\s*)(\d+(?:\.\d+)?)(?:["\s]*)?([NSEWnsew])?$/i;
  const dmsMatch = normalized.match(dmsRegex);
  if (dmsMatch) {
    const hem1 = (dmsMatch[1] || dmsMatch[5] || '').toUpperCase();
    const hem2 = (dmsMatch[6] || dmsMatch[10] || '').toUpperCase();

    const contra1 = checkContradiction(dmsMatch[2], hem1);
    if (contra1) return { success: false, error: contra1 };
    const contra2 = checkContradiction(dmsMatch[7], hem2);
    if (contra2) return { success: false, error: contra2 };

    const sign1 = (dmsMatch[1] === '-' || dmsMatch[2].startsWith('-')) ? -1 : 1;
    const d1 = Math.abs(parseFloat(dmsMatch[2]));
    const m1 = parseFloat(dmsMatch[3]);
    const s1 = parseFloat(dmsMatch[4]);

    const sign2 = (dmsMatch[6] === '-' || dmsMatch[7].startsWith('-')) ? -1 : 1;
    const d2 = Math.abs(parseFloat(dmsMatch[7]));
    const m2 = parseFloat(dmsMatch[8]);
    const s2 = parseFloat(dmsMatch[9]);

    if (m1 >= 60 || s1 >= 60 || m2 >= 60 || s2 >= 60) {
      return { success: false, error: 'Minutes and seconds must be between 0 and 59.' };
    }

    const val1 = sign1 * (d1 + m1 / 60 + s1 / 3600);
    const val2 = sign2 * (d2 + m2 / 60 + s2 / 3600);

    let lat: number;
    let lng: number;

    if ((hem1 === 'E' || hem1 === 'W') && (hem2 === 'N' || hem2 === 'S')) {
      lng = val1;
      lat = val2;
      if (hem1 === 'W') lng = -Math.abs(lng);
      if (hem1 === 'E') lng = Math.abs(lng);
      if (hem2 === 'S') lat = -Math.abs(lat);
      if (hem2 === 'N') lat = Math.abs(lat);
    } else {
      lat = val1;
      lng = val2;
      if (hem1 === 'S') lat = -Math.abs(lat);
      if (hem1 === 'N') lat = Math.abs(lat);
      if (hem2 === 'W') lng = -Math.abs(lng);
      if (hem2 === 'E') lng = Math.abs(lng);
    }

    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        format: 'dms',
      };
    } else {
      return {
        success: false,
        error: 'Coordinates out of range (Lat: -90..90, Lon: -180..180).',
      };
    }
  }

  // 3. DDM: Derece + Ondalık Dakika (örn: "40 36.717 N 31 41.04 E", "40° 36.717' N 31° 41.040' E")
  const ddmRegex = /^([NSEWnsew])?\s*([+-]?\d{1,3})(?:°\s*|\s+)(\d+(?:\.\d+)?)(?:['\s]*)?([NSEWnsew])?[\s,;]+([NSEWnsew])?\s*([+-]?\d{1,3})(?:°\s*|\s+)(\d+(?:\.\d+)?)(?:['\s]*)?([NSEWnsew])?$/i;
  const ddmMatch = normalized.match(ddmRegex);
  if (ddmMatch) {
    const hem1 = (ddmMatch[1] || ddmMatch[4] || '').toUpperCase();
    const hem2 = (ddmMatch[5] || ddmMatch[8] || '').toUpperCase();

    const contra1 = checkContradiction(ddmMatch[2], hem1);
    if (contra1) return { success: false, error: contra1 };
    const contra2 = checkContradiction(ddmMatch[6], hem2);
    if (contra2) return { success: false, error: contra2 };

    const sign1 = (ddmMatch[1] === '-' || ddmMatch[2].startsWith('-')) ? -1 : 1;
    const d1 = Math.abs(parseFloat(ddmMatch[2]));
    const m1 = parseFloat(ddmMatch[3]);

    const sign2 = (ddmMatch[5] === '-' || ddmMatch[6].startsWith('-')) ? -1 : 1;
    const d2 = Math.abs(parseFloat(ddmMatch[6]));
    const m2 = parseFloat(ddmMatch[7]);

    if (m1 >= 60 || m2 >= 60) {
      return { success: false, error: 'Minutes and seconds must be between 0 and 59.' };
    }

    const val1 = sign1 * (d1 + m1 / 60);
    const val2 = sign2 * (d2 + m2 / 60);

    let lat: number;
    let lng: number;

    if ((hem1 === 'E' || hem1 === 'W') && (hem2 === 'N' || hem2 === 'S')) {
      lng = val1;
      lat = val2;
      if (hem1 === 'W') lng = -Math.abs(lng);
      if (hem1 === 'E') lng = Math.abs(lng);
      if (hem2 === 'S') lat = -Math.abs(lat);
      if (hem2 === 'N') lat = Math.abs(lat);
    } else {
      lat = val1;
      lng = val2;
      if (hem1 === 'S') lat = -Math.abs(lat);
      if (hem1 === 'N') lat = Math.abs(lat);
      if (hem2 === 'W') lng = -Math.abs(lng);
      if (hem2 === 'E') lng = Math.abs(lng);
    }

    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        format: 'dms',
      };
    } else {
      return {
        success: false,
        error: 'Coordinates out of range (Lat: -90..90, Lon: -180..180).',
      };
    }
  }

  // 4. Decimal + Yarımküre Harfi ve opsiyonel ° (örn: "40.612°N 31.684°E", "40.612°, 31.684°", "24.627 S, 70.404 W")
  const decHemRegex = /^([NSEWnsew])?\s*([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEWnsew])?[\s,;]+([NSEWnsew])?\s*([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEWnsew])?$/i;
  const decMatch = normalized.match(decHemRegex);
  if (decMatch) {
    const hem1 = (decMatch[1] || decMatch[3] || '').toUpperCase();
    const hem2 = (decMatch[4] || decMatch[6] || '').toUpperCase();

    const contra1 = checkContradiction(decMatch[2], hem1);
    if (contra1) return { success: false, error: contra1 };
    const contra2 = checkContradiction(decMatch[5], hem2);
    if (contra2) return { success: false, error: contra2 };

    const val1 = parseFloat(decMatch[2]);
    const val2 = parseFloat(decMatch[5]);

    let lat: number;
    let lng: number;

    if ((hem1 === 'E' || hem1 === 'W') && (hem2 === 'N' || hem2 === 'S')) {
      lng = val1;
      lat = val2;
      if (hem1 === 'W') lng = -Math.abs(lng);
      if (hem1 === 'E') lng = Math.abs(lng);
      if (hem2 === 'S') lat = -Math.abs(lat);
      if (hem2 === 'N') lat = Math.abs(lat);
    } else {
      lat = val1;
      lng = val2;
      if (hem1 === 'S') lat = -Math.abs(lat);
      if (hem1 === 'N') lat = Math.abs(lat);
      if (hem2 === 'W') lng = -Math.abs(lng);
      if (hem2 === 'E') lng = Math.abs(lng);
    }

    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        format: 'decimal',
      };
    } else {
      return {
        success: false,
        error: 'Coordinates out of range (Lat: -90..90, Lon: -180..180).',
      };
    }
  }

  // 5. Relaxed Decimal (metin içi serbest ondalık koordinat)
  const generalMatch = normalized.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
  if (generalMatch) {
    const lat = parseFloat(generalMatch[1]);
    const lng = parseFloat(generalMatch[2]);
    if (isValidCoord(lat, lng)) {
      return {
        success: true,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        format: 'decimal',
      };
    }
  }

  return {
    success: false,
    error: 'Invalid coordinate format. Example: "40.612, 31.684" or "40°36\'43\\"N 31°41\'02\\"E"',
  };
}

function isValidCoord(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('Elevation API error');
    const data = await res.json();
    if (data && Array.isArray(data.elevation) && data.elevation.length > 0 && typeof data.elevation[0] === 'number') {
      return Math.round(data.elevation[0]);
    }
    if (typeof data?.elevation === 'number') {
      return Math.round(data.elevation);
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch elevation from Open-Meteo:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTimeZone(lat: number, lng: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=auto`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('Timezone API error');
    const data = await res.json();
    if (data?.timezone && isValidTimeZone(data.timezone)) {
      return data.timezone;
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch timezone from Open-Meteo:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getStoredLocation(): LocationData {
  try {
    const saved = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
        parsed.horizonDip = horizonDipDegrees(parsed.elevation || 0);
        if (!parsed.timeZone || !isValidTimeZone(parsed.timeZone)) {
          const matchedPreset = PRESET_LOCATIONS.find((p) => p.id === parsed.id);
          if (matchedPreset) {
            parsed.timeZone = matchedPreset.timeZone;
            parsed.timeZoneSource = 'preset';
          } else {
            delete parsed.timeZone;
            delete parsed.timeZoneSource;
          }
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not read stored location', e);
  }
  return PRESET_LOCATIONS[0];
}

export function saveStoredLocation(loc: LocationData): void {
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc));
  } catch (e) {
    console.warn('Could not store location', e);
  }
}

export function getStoredFavorites(): LocationData[] {
  try {
    const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map((loc) => {
          loc.horizonDip = horizonDipDegrees(loc.elevation || 0);
          if (!loc.timeZone || !isValidTimeZone(loc.timeZone)) {
            const matchedPreset = PRESET_LOCATIONS.find((p) => p.id === loc.id);
            if (matchedPreset) {
              return {
                ...loc,
                timeZone: matchedPreset.timeZone,
                timeZoneSource: 'preset',
              };
            }
            const cleanLoc = { ...loc };
            delete cleanLoc.timeZone;
            delete cleanLoc.timeZoneSource;
            return cleanLoc;
          }
          return loc;
        });
      }
    }
  } catch (e) {
    console.warn('Could not read favorites', e);
  }
  return PRESET_LOCATIONS;
}

export function saveFavorites(favs: LocationData[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favs));
  } catch (e) {
    console.warn('Could not store favorites', e);
  }
}
