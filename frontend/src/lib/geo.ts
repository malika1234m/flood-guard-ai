import type { DistrictProfile } from "./api";

/** Great-circle distance between two lat/lon points, in kilometres. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Find the district whose centroid is closest to the given coordinates. */
export function nearestDistrict(
  latitude: number,
  longitude: number,
  profiles: Record<string, DistrictProfile>,
): { district: string; profile: DistrictProfile; distanceKm: number } | null {
  let best: { district: string; profile: DistrictProfile; distanceKm: number } | null = null;
  for (const [district, profile] of Object.entries(profiles)) {
    const distanceKm = haversineKm(latitude, longitude, profile.latitude, profile.longitude);
    if (!best || distanceKm < best.distanceKm) {
      best = { district, profile, distanceKm };
    }
  }
  return best;
}

export interface GeoPosition {
  latitude: number;
  longitude: number;
}

/** Wraps navigator.geolocation.getCurrentPosition in a Promise. Resolves to
 * null if geolocation is unsupported, permission is denied, or it errors. */
export function getCurrentPosition(timeoutMs = 8000): Promise<GeoPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    );
  });
}
