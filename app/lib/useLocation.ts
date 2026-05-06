'use client';

import { useEffect, useState } from 'react';

export type UserLocation = {
  lat: number;
  lng: number;
  city: string | null;
  region: string | null;
  country: string | null;
  source: 'gps' | 'ip';
};

/**
 * Resolve the user's location with two strategies, in priority order:
 *
 *   1. Server-side IP geolocation via /api/geo (zero permission prompt,
 *      city-level accuracy, instant on Vercel).
 *   2. Optional precise GPS via navigator.geolocation, but only when the
 *      caller invokes `requestPreciseLocation()` (so we never show the
 *      browser permission prompt unprompted).
 *
 * No coordinates are stored on the server. This is important under
 * Quebec's Loi 25 — passive IP geolocation falls outside "personal
 * information" only if it isn't retained.
 */
export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 1. IP-based location on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/geo')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (typeof data.lat === 'number' && typeof data.lng === 'number') {
          setLocation({
            lat: data.lat,
            lng: data.lng,
            city: data.city,
            region: data.region,
            country: data.country,
            source: 'ip'
          });
        }
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Optional GPS upgrade — caller controls when this fires
  const requestPreciseLocation = (): Promise<UserLocation | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next: UserLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            city: location?.city ?? null,
            region: location?.region ?? null,
            country: location?.country ?? null,
            source: 'gps'
          };
          setLocation(next);
          resolve(next);
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
      );
    });
  };

  return { location, isLoading, requestPreciseLocation };
}
