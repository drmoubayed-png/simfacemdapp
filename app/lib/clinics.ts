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
 *   • Non-surgical procedures route to the GEOGRAPHICALLY NEAREST
 *     active clinic that offers the requested treatment — home base
 *     and partners are treated as equals in the distance ranking. A
 *     visitor in Toronto will route to Montreal (home base) because
 *     it's the nearest; a visitor in Calgary will route to Winnipeg
 *     (Visage) because Winnipeg is closer than Montreal.
 *   • No location detected → home base (safe default).
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
 * @deprecated v5.1.3 — the 300 km radius rule was removed in favour
 * of pure nearest-clinic routing. Kept as a constant only because
 * other modules may still import it; nothing in the routing path
 * reads it anymore.
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
  },

  // Winnipeg — covers western Canada / central US prairies.
  {
    id: 'visage-winnipeg',
    name: 'Visage Cosmetic Clinic',
    city: 'Winnipeg',
    region: 'MB',
    country: 'CA',
    lat: 49.84676,
    lng: -97.19836,
    phone: '18778479398',
    phoneDisplay: '1-877-847-9398',
    bookingUrl: 'https://www.visagecosmeticclinic.com/book-a-consultation/',
    websiteUrl: 'http://visagecosmeticclinic.com/',
    rating: 4.8,
    reviewSource: 'Google Reviews',
    treatments: ['botox', 'lip_cheek_filler', 'co2_laser', 'bbl_photofacial'],
    active: true
  },

  // Los Angeles — covers Southern California / US West Coast.
  {
    id: 'cupidlips-la',
    name: 'Cupid Lips',
    city: 'West Hollywood',
    region: 'CA',
    country: 'US',
    lat: 34.09206,
    lng: -118.37998,
    phone: '14246670036',
    phoneDisplay: '+1 424-667-0036',
    bookingUrl: 'https://www.cupid-lips.com/pages/contact',
    websiteUrl: 'https://www.cupid-lips.com/',
    rating: 4.9,
    reviewSource: 'Google Reviews',
    treatments: ['botox', 'lip_cheek_filler', 'co2_laser', 'bbl_photofacial'],
    active: true
  },

  // New York — covers US East Coast.
  {
    id: 'medispa-noura-nyc',
    name: 'Medispa by Noura',
    city: 'New York',
    region: 'NY',
    country: 'US',
    lat: 40.77336,
    lng: -73.96580,
    phone: '12128320444',
    phoneDisplay: '+1 212-832-0444',
    bookingUrl: 'https://doczema.com/book/org/moustafa-mourad-s-practice',
    websiteUrl: 'https://www.nycfacedoc.com/specialties/medispa-by-noura/',
    rating: 4.9,
    reviewSource: 'Google Reviews',
    treatments: ['botox', 'lip_cheek_filler', 'co2_laser', 'bbl_photofacial'],
    active: true
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
    | 'nearest_clinic' // non-surgical → nearest active clinic (home or partner)
    | 'no_clinic_offers_treatment' // no active clinic offers this treatment → home base fallback
    | 'no_location_home_base' // location unknown → home base (safe default)
    // ---- legacy v5.1.2 reasons, kept so old DB rows still parse ----
    | 'in_radius_home_base'
    | 'nearest_partner'
    | 'no_partner_fallback';
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

  // Non-surgical, no location → home base (no way to compare distances).
  if (!userCoords) {
    return {
      clinic: homeBase,
      distanceKm: null,
      reason: 'no_location_home_base'
    };
  }

  // v5.1.3 — pure nearest-clinic routing. Build a candidate pool of
  // ALL active clinics that offer the requested treatment (home base
  // + partners, treated equally) and pick the closest by Haversine
  // distance. No 300 km radius, no home-base bias.
  const candidates = CLINICS.filter(
    (c) => c.active && c.treatments.includes(procedureId)
  );

  if (candidates.length === 0) {
    // No active clinic offers this procedure at all — fall back to
    // the home base so the visitor still has SOMEWHERE to book.
    // Surfaces in analytics as a partner-recruitment signal.
    return {
      clinic: homeBase,
      distanceKm: distanceKm(userCoords, homeBase),
      reason: 'no_clinic_offers_treatment'
    };
  }

  const ranked = candidates
    .map((c) => ({ clinic: c, dist: distanceKm(userCoords, c) }))
    .sort((a, b) => a.dist - b.dist);

  const nearest = ranked[0];
  return {
    clinic: nearest.clinic,
    distanceKm: nearest.dist,
    reason: 'nearest_clinic'
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
