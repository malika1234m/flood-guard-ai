import * as Location from 'expo-location';
import type { DistrictProfile } from './api';

export interface GeoPosition {
  latitude: number;
  longitude: number;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestDistrict(
  latitude: number,
  longitude: number,
  profiles: Record<string, DistrictProfile>
): { district: string; profile: DistrictProfile; distanceKm: number } | null {
  let best: { district: string; profile: DistrictProfile; distanceKm: number } | null = null;
  for (const [district, profile] of Object.entries(profiles)) {
    const d = haversineKm(latitude, longitude, profile.latitude, profile.longitude);
    if (best === null || d < best.distanceKm) {
      best = { district, profile, distanceKm: d };
    }
  }
  return best;
}

export async function getCurrentPosition(timeoutMs = 8000): Promise<GeoPosition | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!loc) return null;
    return { latitude: (loc as Location.LocationObject).coords.latitude, longitude: (loc as Location.LocationObject).coords.longitude };
  } catch {
    return null;
  }
}
