import { NextRequest, NextResponse } from 'next/server';
import { geolocation } from '@vercel/functions';
import { insertLead, isDbConfigured } from '../../lib/db';

/**
 * Lead-tracking ingest endpoint.
 *
 * Called by the client's `trackEvent()` helper on every meaningful user
 * action (simulation completed, booking shown, book clicked, share
 * clicked, etc.). Writes one row to the `leads` table, augmented with
 * IP-derived city/region/country from Vercel's edge geo headers.
 *
 * Privacy notes:
 *   • We do NOT store the user's IP address.
 *   • We do NOT store any PII (no name, email, photo, device ID).
 *   • The session_id is a random per-tab UUID; it cannot identify a
 *     person across tabs/devices.
 *   • This data exists only to (a) bill partner clinics per lead and
 *     (b) understand traffic geography. Both are legitimate-interest
 *     business uses disclosed in the privacy policy.
 *
 * We use the Node runtime (not edge) so we can use the Postgres TCP
 * client. Edge would force HTTP-only Postgres which works but is
 * slower for write-heavy workloads.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set([
  'simulation_completed',
  'booking_shown',
  'book_clicked',
  'website_clicked',
  'share_clicked'
]);

export async function POST(req: NextRequest) {
  // No-op gracefully if the DB isn't configured (e.g., local dev). The
  // client never sees a user-facing error either way.
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const eventName = typeof body?.name === 'string' ? body.name : null;
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : null;
  if (!eventName || !sessionId || !ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json(
      { ok: false, error: 'bad_request' },
      { status: 400 }
    );
  }

  // Pull structured fields out of the payload — these get their own
  // columns for fast filtering. The full payload is ALSO stored in the
  // JSONB column so we can grep flexible context later.
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
  const procedureId = stringOrNull(payload.procedure_id);
  const clinicId = stringOrNull(payload.clinic_id);
  const routingReason = stringOrNull(payload.routing_reason);
  const distanceKm =
    typeof payload.distance_km === 'number' && Number.isFinite(payload.distance_km)
      ? payload.distance_km
      : null;

  // IP-derived geo. Vercel injects these headers on every request.
  let ipCity: string | null = null;
  let ipRegion: string | null = null;
  let ipCountry: string | null = null;
  try {
    const geo = geolocation(req);
    ipCity = geo.city ?? null;
    ipRegion = geo.countryRegion ?? null;
    ipCountry = geo.country ?? null;
  } catch {
    /* best effort — leave nulls */
  }

  // Bound the size of optional context strings so a malicious client
  // can't bloat the DB.
  const referrer = clamp(stringOrNull(body.referrer), 500);
  const lang = clamp(stringOrNull(body.lang), 16);

  try {
    await insertLead({
      session_id: clamp(sessionId, 80) ?? sessionId,
      event_name: eventName,
      procedure_id: clamp(procedureId, 64),
      clinic_id: clamp(clinicId, 64),
      routing_reason: clamp(routingReason, 64),
      distance_km: distanceKm,
      ip_city: clamp(ipCity, 120),
      ip_region: clamp(ipRegion, 120),
      ip_country: clamp(ipCountry, 8),
      payload,
      referrer,
      lang
    });
    return NextResponse.json({ ok: true, persisted: true });
  } catch (err) {
    // Don't leak stack traces. The client doesn't read this anyway —
    // it's fire-and-forget.
    console.error('[track] insert failed:', err);
    return NextResponse.json(
      { ok: false, error: 'insert_failed' },
      { status: 500 }
    );
  }
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function clamp(s: string | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}
