import { OriginCity, LocationData } from '../types';

export const MAJOR_ORIGIN_CITIES: OriginCity[] = [
  { id: 'ankara', name: 'Ankara (Merkez)', latitude: 39.9334, longitude: 32.8597 },
  { id: 'istanbul', name: 'İstanbul (Kadıköy)', latitude: 40.9927, longitude: 29.0277 },
  { id: 'izmir', name: 'İzmir (Konak)', latitude: 38.4192, longitude: 27.1287 },
  { id: 'bursa', name: 'Bursa (Nilüfer)', latitude: 40.2181, longitude: 28.9669 },
  { id: 'eskisehir', name: 'Eskişehir (Odunpazarı)', latitude: 39.7667, longitude: 30.5256 },
  { id: 'antalya', name: 'Antalya (Muratpaşa)', latitude: 36.8841, longitude: 30.7056 },
];

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  isEstimate: boolean;
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function calculateDrivingRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<RouteResult> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('OSRM service response not ok');
    const data = await res.json();
    if (data?.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const distanceKm = Math.round(route.distance / 1000);
      const durationMinutes = Math.round(route.duration / 60);
      return { distanceKm, durationMinutes, isEstimate: false };
    }
  } catch (e) {
    console.warn('OSRM route calculation fallback triggered:', e);
  }

  const straightDist = haversineDistanceKm(originLat, originLng, destLat, destLng);
  const roadDist = Math.round(straightDist * 1.32);
  const durationMinutes = Math.round((roadDist / 75) * 60);
  return {
    distanceKm: Math.max(1, roadDist),
    durationMinutes: Math.max(10, durationMinutes),
    isEstimate: true,
  };
}
