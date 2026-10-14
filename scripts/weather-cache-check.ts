/**
 * scripts/weather-cache-check.ts
 *
 * Verifies that old 'v4' weather cache entries in localStorage are invalidated
 * and never loaded as valid cached forecasts.
 */
import { LocationData, ResolvedSite } from '../src/types';
import { horizonDipDegrees } from '../src/lib/ephemeris';

// Mock localStorage in-memory
const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() {
    return store.size;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

// Mock fetch to simulate offline / network rejection
globalThis.fetch = (() => Promise.reject(new Error('Network offline (mock)'))) as any;

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  CHROMA NOCTA — WEATHER CACHE VERSION INVALIDATION TEST');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const mockLocation: ResolvedSite = {
    id: 'test-site',
    name: 'Test Observatory',
    latitude: 40.612,
    longitude: 31.684,
    elevation: 1550,
    horizonDip: horizonDipDegrees(1550),
    timeZone: 'Europe/Istanbul',
  };

  const lat = mockLocation.latitude;
  const lng = mockLocation.longitude;
  const elevation = mockLocation.elevation;
  const tz = mockLocation.timeZone;

  // Seed localStorage with a 'v4' entry
  const v4Key = `chroma_weather_v4_${lat.toFixed(4)}_${lng.toFixed(4)}_${Math.round(elevation)}_${tz}`;
  const now = Date.now();

  const v4Payload = {
    timestamp: now,
    points: [
      {
        time: new Date().toISOString(),
        temperature: 15,
        dewPoint: 8,
        humidity: 60,
        cloudCover: 0,
        missing: ['cloud'],
      },
    ],
  };

  localStorage.setItem(v4Key, JSON.stringify(v4Payload));
  console.log(`[TEST] Seeded localStorage with v4 key: ${v4Key}`);

  // Dynamic import of fetch16DayHourlyWeather
  const { fetch16DayHourlyWeather } = await import('../src/lib/weatherService');

  const result = await fetch16DayHourlyWeather(mockLocation);
  console.log(`[TEST] Result sourceType: ${result.sourceType}, points count: ${result.points.length}`);

  if (result.sourceType === 'cached') {
    console.error('❌ BAŞARISIZ: v4 önbellek girdisi geçersiz kılınmadı, "cached" olarak yüklendi!');
    process.exit(1);
  }

  if (result.points.length !== 0 || result.sourceType !== 'fallback') {
    console.error(`❌ BAŞARISIZ: Beklenen fallback (points: 0, sourceType: fallback), alınan: points: ${result.points.length}, sourceType: ${result.sourceType}`);
    process.exit(1);
  }

  console.log('🟢 GEÇTİ: v4 önbellek girdisi yok sayıldı ve dürüst çevrimdışı fallback döndürüldü.');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
