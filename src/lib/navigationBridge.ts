declare global {
  interface Window {
    readonly opera?: string;
  }
}

/**
 * Evrensel Çapraz Platform Navigasyon Köprüsü
 * - iOS: Apple Maps (maps://)
 * - Android: Çevrimdışı ve Yerel Harita Protokolü (geo:)
 * - Masaüstü / Web Fallback: Google Maps web URL'i
 */
export function openSiteNavigation(latitude: number, longitude: number, siteName: string): void {
  if (typeof window === 'undefined') return;

  const userAgent = navigator.userAgent || navigator.vendor || window.opera || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(userAgent);

  const cleanName = encodeURIComponent(siteName.trim());

  if (isIOS) {
    // Apple Maps yerel URL şeması
    window.location.href = `maps://maps.apple.com/?q=${cleanName}&ll=${latitude},${longitude}`;
    return;
  }

  if (isAndroid) {
    // Android yerel harita ve çevrimdışı harita (Organic Maps, OsmAnd vb.) protokolü
    window.location.href = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${cleanName})`;
    return;
  }

  // Masaüstü / Standart Web Fallback
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    '_blank',
    'noopener,noreferrer'
  );
}
