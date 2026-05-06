/**
 * Clinic registry.
 *
 * To add or update a partner clinic, edit this file. Coordinates can be
 * obtained from any maps service (Google Maps → right-click a location →
 * "What's here?" shows lat/lng). Keep this list short and curated — clients
 * shouldn't see hundreds of options.
 */

export type Clinic = {
  id: string;
  name: string;
  city: string;
  region: string; // province / state
  country: 'CA' | 'US';
  lat: number;
  lng: number;
  phone: string; // digits only, no formatting (used for tel: links)
  phoneDisplay: string; // formatted for UI
  bookingUrl: string;
  websiteUrl: string;
  rating: number;
  reviewSource: string;
  isFeatured?: boolean; // shown first when user has no detectable location
};

export const CLINICS: Clinic[] = [
  {
    id: 'facemd-montreal',
    name: 'Clinique Face MD',
    city: 'Montréal',
    region: 'QC',
    country: 'CA',
    lat: 45.5017,
    lng: -73.5673,
    phone: '5144479435',
    phoneDisplay: '514-447-9435',
    bookingUrl: 'http://rdv.facemd.com/',
    websiteUrl: 'https://www.cliniquefacemd.com',
    rating: 4.9,
    reviewSource: 'Google Reviews',
    isFeatured: true
  }
  // Add additional partner clinics below, e.g.:
  // {
  //   id: 'facemd-toronto',
  //   name: 'Face MD Toronto',
  //   city: 'Toronto',
  //   region: 'ON',
  //   country: 'CA',
  //   lat: 43.6532,
  //   lng: -79.3832,
  //   phone: '4165550123',
  //   phoneDisplay: '416-555-0123',
  //   bookingUrl: 'https://...',
  //   websiteUrl: 'https://...',
  //   rating: 4.8,
  //   reviewSource: 'Google Reviews'
  // }
];

/**
 * Haversine great-circle distance in kilometres.
 * Accurate to <0.5% for distances under a few thousand km — plenty good
 * enough for "show me the nearest clinic" sorting.
 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // Earth radius (km)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Format a distance for UI display.
 * Under 10 km → 1 decimal ("4.2 km"); over 10 km → integer ("87 km").
 */
export function formatDistance(km: number): string {
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Sort clinics by distance from a user location. If no location is
 * available, return the original order with the featured clinic first.
 */
export function sortClinicsByDistance(
  userCoords: { lat: number; lng: number } | null
): Array<Clinic & { distanceKm?: number }> {
  if (!userCoords) {
    const featured = CLINICS.filter((c) => c.isFeatured);
    const rest = CLINICS.filter((c) => !c.isFeatured);
    return [...featured, ...rest];
  }
  return [...CLINICS]
    .map((c) => ({ ...c, distanceKm: distanceKm(userCoords, c) }))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}
