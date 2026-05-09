/**
 * Clinic registry + routing logic.
 *
 * To add or update a partner clinic, edit this file. Coordinates can be
 * obtained from any maps service (Google Maps → right-click a location →
 * "What's here?" shows lat/lng). Keep this list short and curated — clients
 * shouldn't see hundreds of options.
 *
 * Routing rules (see resolveBookingClinic below):
 *   • Surgical procedures (rhinoplasty, facelift) ALWAYS route to the
 *     surgical home base (Clinique Face MD). These are high-margin cases
 *     we never refer out.
 *   • Non-surgical procedures route to:
 *       - The home base if user is within HOME_BASE_RADIUS_KM (300 km)
 *       - Otherwise, the nearest active partner clinic that offers the
 *         requested treatment.
 */

import type { ProcedureId } from './i18n';

/** Surgical procedures — always routed to surgical home base, never partners. */
export const SURGICAL_PROCEDURES: ProcedureId[] = [
  'ultrasonic_rhinoplasty',
  'deep_plane_facelift'
];

/** Non-surgical = everything else. Eligible for partner-clinic routing. */
export function isNonSurgical(procedureId: ProcedureId): boolean {
  return !SURGICAL_PROCEDURES.includes(procedureId);
}

/**
 * The radius around the surgical home base inside which non-surgical
 * patients still get routed to the home base. Anything beyond this gets
 * routed to a partner.
 */
export const HOME_BASE_RADIUS_KM = 300;

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
  /**
   * Which procedures this clinic offers. Partners may not perform every
   * treatment — a clinic without 'co2_laser' here will be skipped when
   * routing a CO2 laser simulation.
   */
  treatments: ProcedureId[];
  /**
   * Marks the surgical home base. There is exactly one home base. All
   * surgical procedures route here regardless of distance, and all
   * in-radius non-surgical procedures route here too.
   */
  isHomeBase?: boolean;
  /** Active = visible to patients. Flip false to disable without deleting. */
  active: boolean;
  /** Shown first when user has no detectable location (legacy fallback). */
  isFeatured?: boolean;
};

/**
 * The full procedure list — used as a default for clinics that perform
 * everything (e.g., the home base).
 */
const ALL_PROCEDURES: ProcedureId[] = [
  'ultrasonic_rhinoplasty',
  'deep_plane_facelift',
  'botox',
  'lip_cheek_filler',
  'co2_laser',
  'bbl_photofacial'
];

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
    treatments: ALL_PROCEDURES,
    isHomeBase: true,
    active: true,
    isFeatured: true
  }
  // ── PARTNER CLINICS ────────────────────────────────────────────────
  // Add partner clinics below. They will receive non-surgical referrals
  // for users outside the 300 km home-base radius. Example:
  //
  // {
  //   id: 'partner-toronto',
  //   name: 'Partner Aesthetic Clinic — Toronto',
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
  //   reviewSource: 'Google Reviews',
  //   treatments: ['botox', 'lip_cheek_filler', 'co2_laser', 'bbl_photofacial'],
  //   active: true
  // }
];

/* ------------------------------------------------------------------ */
/*  Distance helpers                                                  */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Clinic lookups                                                    */
/* ------------------------------------------------------------------ */

export function getHomeBase(): Clinic {
  const home = CLINICS.find((c) => c.isHomeBase && c.active);
  if (!home) {
    // Defensive — should never happen given the seeded config.
    throw new Error('No active home-base clinic configured');
  }
  return home;
}

export function getActivePartners(): Clinic[] {
  return CLINICS.filter((c) => c.active && !c.isHomeBase);
}

/* ------------------------------------------------------------------ */
/*  Routing                                                           */
/* ------------------------------------------------------------------ */

export type RoutingDecision = {
  clinic: Clinic;
  distanceKm: number | null;
  /**
   * Why this clinic was chosen — useful for analytics and for showing
   * different UI copy ("Your nearest partner clinic" vs "Book at our
   * flagship Montréal clinic").
   */
  reason:
    | 'surgical_home_base' // surgery → home base, distance ignored
    | 'in_radius_home_base' // non-surgical, within 300 km → home base
    | 'nearest_partner' // non-surgical, outside radius → nearest partner
    | 'no_partner_fallback' // non-surgical, outside radius, but no partner offers it → home base anyway
    | 'no_location_home_base'; // location unknown → home base (safe default)
};

/**
 * Resolve which clinic to send a patient to for a given procedure and
 * (optional) detected user coordinates.
 *
 * This is the single source of truth for routing — the result page,
 * analytics, and reports all read from this function. If you need to
 * change the rules, change them here.
 */
export function resolveBookingClinic(
  procedureId: ProcedureId,
  userCoords: { lat: number; lng: number } | null
): RoutingDecision {
  const homeBase = getHomeBase();

  // Surgical → always home base, regardless of where the patient is.
  if (!isNonSurgical(procedureId)) {
    return {
      clinic: homeBase,
      distanceKm: userCoords ? distanceKm(userCoords, homeBase) : null,
      reason: 'surgical_home_base'
    };
  }

  // Non-surgical, no location → home base (no way to find nearest partner)
  if (!userCoords) {
    return {
      clinic: homeBase,
      distanceKm: null,
      reason: 'no_location_home_base'
    };
  }

  const distToHome = distanceKm(userCoords, homeBase);

  // Within 300 km of the home base → home base wins
  if (distToHome <= HOME_BASE_RADIUS_KM) {
    return {
      clinic: homeBase,
      distanceKm: distToHome,
      reason: 'in_radius_home_base'
    };
  }

  // Outside radius → find nearest active partner that offers this treatment
  const eligiblePartners = getActivePartners().filter((c) =>
    c.treatments.includes(procedureId)
  );
  if (eligiblePartners.length === 0) {
    // No partner can serve this treatment — fall back to home base so the
    // patient still has a path to book. Logged as 'no_partner_fallback'
    // so we know to recruit a partner there.
    return {
      clinic: homeBase,
      distanceKm: distToHome,
      reason: 'no_partner_fallback'
    };
  }

  const ranked = eligiblePartners
    .map((c) => ({ clinic: c, dist: distanceKm(userCoords, c) }))
    .sort((a, b) => a.dist - b.dist);

  const nearest = ranked[0];
  return {
    clinic: nearest.clinic,
    distanceKm: nearest.dist,
    reason: 'nearest_partner'
  };
}

/**
 * Sort clinics by distance — kept for the legacy "see other locations"
 * UI which lists every clinic. Routing logic should use
 * resolveBookingClinic() above instead.
 */
export function sortClinicsByDistance(
  userCoords: { lat: number; lng: number } | null
): Array<Clinic & { distanceKm?: number }> {
  const active = CLINICS.filter((c) => c.active);
  if (!userCoords) {
    const featured = active.filter((c) => c.isFeatured);
    const rest = active.filter((c) => !c.isFeatured);
    return [...featured, ...rest];
  }
  return [...active]
    .map((c) => ({ ...c, distanceKm: distanceKm(userCoords, c) }))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}
