import { NextRequest, NextResponse } from 'next/server';
import { geolocation } from '@vercel/functions';
import { insertLeadUnlock } from '../../../lib/db';
import { isDbConfigured } from '../../../lib/db';
import { issueUnlockToken } from '../../../lib/unlockToken';

/**
 * v5.1 — Lead-gate submission endpoint.
 *
 * Two paths into this handler:
 *
 *  1. Google sign-in (preferred):
 *       body.source = 'google'
 *       body.credential = the JWT id_token from Google Identity Services
 *     We verify the JWT with Google's tokeninfo endpoint, which performs
 *     full RS256 verification + audience check on their side. Avoids
 *     pulling in jose/jsonwebtoken libs and stays well under the
 *     Vercel function size limit.
 *
 *  2. Manual form:
 *       body.source = 'manual'
 *       body.first_name, body.email, body.phone
 *     Server-side validates: email shape + 10-digit NA phone.
 *
 * On success:
 *   - Writes one row to lead_unlocks (with PII).
 *   - Returns { ok: true, lead_id, first_name, email_hint }.
 *   - Client stores `simfacemd.unlocked.<YYYY-MM-DD> = lead_id` to
 *     suppress the gate for the same calendar day on the same browser.
 *
 * If the DB isn't configured we still return ok=true so the user
 * can proceed past the gate during testing — this matches the existing
 * /api/track behaviour and keeps deploy-then-add-DB workable.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSENT_VERSION = 'v5.1';

const ALLOWED_PROCEDURES = new Set([
  'ultrasonic_rhinoplasty',
  'deep_plane_facelift',
  'botox',
  'lip_cheek_filler',
  'co2_laser',
  'bbl_photofacial'
]);

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const sessionId = stringOrNull(body?.session_id);
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'missing_session' }, { status: 400 });
  }

  // ---- Resolve identity from either Google JWT or manual fields ----
  let source: 'google' | 'manual';
  let firstName: string | null = null;
  let lastName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let googleSub: string | null = null;
  let emailVerified = false;

  if (body?.source === 'google') {
    source = 'google';
    const credential = stringOrNull(body?.credential);
    if (!credential) {
      return NextResponse.json({ ok: false, error: 'missing_credential' }, { status: 400 });
    }
    const verified = await verifyGoogleIdToken(credential);
    if (!verified.ok) {
      return NextResponse.json(
        { ok: false, error: 'invalid_credential', detail: verified.reason },
        { status: 401 }
      );
    }
    firstName = verified.given_name ?? null;
    lastName = verified.family_name ?? null;
    email = verified.email ?? null;
    googleSub = verified.sub ?? null;
    emailVerified = verified.email_verified === true;
    // Phone may be supplied alongside the Google sign-in to satisfy the
    // operator's lead-quality requirement (Google doesn't return phone).
    const rawPhone = stringOrNull(body?.phone);
    if (rawPhone) {
      const normalized = normalizeNaPhone(rawPhone);
      if (!normalized) {
        return NextResponse.json({ ok: false, error: 'bad_phone' }, { status: 400 });
      }
      phone = normalized;
    }
  } else if (body?.source === 'manual') {
    source = 'manual';
    firstName = clamp(stringOrNull(body?.first_name), 80);
    lastName = clamp(stringOrNull(body?.last_name), 80);
    email = clamp(stringOrNull(body?.email), 200);
    const rawPhone = stringOrNull(body?.phone);

    // v5.1.4 — last_name is now REQUIRED for manual submissions.
    // Previously only first_name was required and leads were arriving
    // with single-word names like "John". The sales team needs the
    // full name for outreach.
    if (!firstName || !lastName || !email || !rawPhone) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
    }
    if (!isLikelyEmail(email)) {
      return NextResponse.json({ ok: false, error: 'bad_email' }, { status: 400 });
    }
    const normalizedPhone = normalizeNaPhone(rawPhone);
    if (!normalizedPhone) {
      return NextResponse.json({ ok: false, error: 'bad_phone' }, { status: 400 });
    }
    phone = normalizedPhone;
  } else {
    return NextResponse.json({ ok: false, error: 'bad_source' }, { status: 400 });
  }

  // ---- Context (procedure / routing) ----
  const procedureId = stringOrNull(body?.procedure_id);
  const clinicId = stringOrNull(body?.clinic_id);
  const routingReason = stringOrNull(body?.routing_reason);
  const distanceKm =
    typeof body?.distance_km === 'number' && Number.isFinite(body.distance_km)
      ? body.distance_km
      : null;

  // Reject unknown procedure ids — guards the column from junk.
  if (procedureId && !ALLOWED_PROCEDURES.has(procedureId)) {
    return NextResponse.json({ ok: false, error: 'bad_procedure' }, { status: 400 });
  }

  // ---- Geo from Vercel headers (best-effort) ----
  let ipCity: string | null = null;
  let ipRegion: string | null = null;
  let ipCountry: string | null = null;
  try {
    const geo = geolocation(req);
    ipCity = geo.city ?? null;
    ipRegion = geo.countryRegion ?? null;
    ipCountry = geo.country ?? null;
  } catch {
    /* best effort */
  }

  const referrer = clamp(stringOrNull(body?.referrer), 500);
  const lang = clamp(stringOrNull(body?.lang), 16);

  // If the DB isn't wired up, ack without persistence so the user can
  // still get past the gate — same pattern as /api/track. We still
  // issue an unlock token so /api/simulate works in dev/preview.
  if (!isDbConfigured()) {
    const unlock_token = issueUnlockToken({ leadId: 0, sessionId });
    return NextResponse.json({
      ok: true,
      persisted: false,
      lead_id: 0,
      first_name: firstName,
      last_name: lastName,
      email_hint: maskEmail(email),
      unlock_token
    });
  }

  try {
    const id = await insertLeadUnlock({
      session_id: clamp(sessionId, 80) ?? sessionId,
      source,
      first_name: clamp(firstName, 80),
      last_name: clamp(lastName, 80),
      email: clamp(email, 200),
      phone: clamp(phone, 32),
      google_sub: clamp(googleSub, 64),
      email_verified: emailVerified,
      procedure_id: clamp(procedureId, 64),
      clinic_id: clamp(clinicId, 64),
      routing_reason: clamp(routingReason, 64),
      distance_km: distanceKm,
      ip_city: clamp(ipCity, 120),
      ip_region: clamp(ipRegion, 120),
      ip_country: clamp(ipCountry, 8),
      consent_text_version: CONSENT_VERSION,
      referrer,
      lang
    });
    const unlock_token = issueUnlockToken({ leadId: id, sessionId });
    return NextResponse.json({
      ok: true,
      persisted: true,
      lead_id: id,
      first_name: firstName,
      last_name: lastName,
      email_hint: maskEmail(email),
      unlock_token
    });
  } catch (err) {
    console.error('[leads/submit] insert failed:', err);
    return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 });
  }
}

/* ----------------------------- helpers --------------------------------- */

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clamp(s: string | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

// Loose RFC-5322 email check — good enough for client-side gate;
// we don't need to be perfectly correct, just to reject obvious junk.
function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/**
 * Normalize a NA phone string to "+1XXXXXXXXXX" (E.164). Accepts:
 *   "(514) 555-1234"
 *   "514.555.1234"
 *   "5145551234"
 *   "+1 514-555-1234"
 *   "1 (514) 555-1234"
 * Returns null if it can't recover exactly 10 digits with optional
 * leading +1 / 1.
 */
function normalizeNaPhone(raw: string): string | null {
  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(0, local.length - 2))}@${domain}`;
}

/**
 * Verify a Google Identity Services credential JWT by calling Google's
 * public tokeninfo endpoint. This delegates JWKS fetching, signature
 * verification, expiry, and issuer checks to Google. We then assert the
 * audience locally against GOOGLE_CLIENT_ID.
 */
async function verifyGoogleIdToken(idToken: string): Promise<
  | {
      ok: true;
      sub: string;
      email?: string;
      email_verified?: boolean;
      given_name?: string;
      family_name?: string;
      name?: string;
    }
  | { ok: false; reason: string }
> {
  const expectedAud = process.env.GOOGLE_CLIENT_ID;
  if (!expectedAud) return { ok: false, reason: 'missing_env_GOOGLE_CLIENT_ID' };

  let res: Response;
  try {
    res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { cache: 'no-store' }
    );
  } catch (e) {
    return { ok: false, reason: 'tokeninfo_fetch_failed' };
  }
  if (!res.ok) return { ok: false, reason: `tokeninfo_${res.status}` };

  let info: any;
  try {
    info = await res.json();
  } catch {
    return { ok: false, reason: 'tokeninfo_parse_failed' };
  }

  // tokeninfo returns aud, sub, email, email_verified ('true'/'false' strings),
  // exp (unix-string), iss, given_name, family_name, name, picture, hd.
  if (info.aud !== expectedAud) return { ok: false, reason: 'bad_audience' };
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') {
    return { ok: false, reason: 'bad_issuer' };
  }
  const expNum = Number(info.exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof info.sub !== 'string' || info.sub.length === 0) {
    return { ok: false, reason: 'missing_sub' };
  }
  return {
    ok: true,
    sub: info.sub,
    email: typeof info.email === 'string' ? info.email : undefined,
    email_verified: info.email_verified === true || info.email_verified === 'true',
    given_name: typeof info.given_name === 'string' ? info.given_name : undefined,
    family_name: typeof info.family_name === 'string' ? info.family_name : undefined,
    name: typeof info.name === 'string' ? info.name : undefined
  };
}
