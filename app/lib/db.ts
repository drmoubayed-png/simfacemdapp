/**
 * Postgres connection + schema bootstrap.
 *
 * We use `@vercel/postgres`, which talks to any standard Postgres URL
 * configured via the POSTGRES_URL environment variable. On Vercel that's
 * set automatically by Marketplace integrations (Neon, Supabase, etc.).
 * Locally, set POSTGRES_URL in .env.local pointing at a dev database.
 *
 * Schema is created lazily on first call (`ensureSchema`) so we don't
 * need a separate migration step. The IF NOT EXISTS guards make this
 * idempotent and safe to call on every cold start.
 *
 * The `leads` table stores ONE ROW PER EVENT (not per user). This makes
 * it trivial to query "how many bookings this week from Toronto" or
 * "what's our share-to-book conversion rate" without any joins.
 */

import { sql } from '@vercel/postgres';

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS leads (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        -- Per-tab session ID (random UUID, sessionStorage). Stitches
        -- multi-step funnel events together without storing PII.
        session_id TEXT NOT NULL,

        -- 'simulation_completed' | 'booking_shown' | 'book_clicked' |
        -- 'website_clicked' | 'share_clicked'
        event_name TEXT NOT NULL,

        -- Procedure simulated (e.g. 'botox', 'ultrasonic_rhinoplasty')
        procedure_id TEXT,

        -- The clinic the lead was routed/sent to (matches CLINICS[].id)
        clinic_id TEXT,

        -- Why that clinic was chosen — 'surgical_home_base',
        -- 'in_radius_home_base', 'nearest_partner', 'no_partner_fallback',
        -- 'no_location_home_base'. Surfaced in reports for billing.
        routing_reason TEXT,

        -- Distance from user to chosen clinic, kilometres.
        distance_km DOUBLE PRECISION,

        -- IP-derived geo (filled server-side from Vercel headers). City
        -- is best-effort; country is reliable. NEVER store user IP.
        ip_city TEXT,
        ip_region TEXT,
        ip_country TEXT,

        -- Event-specific extras kept as JSONB for flexibility (e.g. the
        -- share channel: native vs whatsapp vs instagram vs download).
        payload JSONB,

        -- Misc context, all coarse, all non-identifying.
        referrer TEXT,
        lang TEXT
      );
    `;
    // Indexes — small DB, but these queries get hit every digest/dashboard load.
    await sql`CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);`;
    await sql`CREATE INDEX IF NOT EXISTS leads_event_name_idx ON leads (event_name);`;
    await sql`CREATE INDEX IF NOT EXISTS leads_clinic_id_idx ON leads (clinic_id);`;
    await sql`CREATE INDEX IF NOT EXISTS leads_session_id_idx ON leads (session_id);`;

    // ---- v5.1 lead_unlocks: PII-bearing rows from the result-screen gate ----
    // Separate table so the event firehose (`leads`) stays anonymous and the
    // PII rows can be access-controlled, exported, or purged independently.
    await sql`
      CREATE TABLE IF NOT EXISTS lead_unlocks (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        -- Stitch back to the anonymous event funnel.
        session_id TEXT NOT NULL,

        -- Source of the lead: 'google' (verified OAuth) or 'manual' (form).
        source TEXT NOT NULL,

        -- Identity — verified for google, self-attested for manual.
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,         -- E.164-ish, NA-only for now
        google_sub TEXT,    -- stable Google account id when source='google'
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,

        -- What they were looking at when they unlocked.
        procedure_id TEXT,
        clinic_id TEXT,
        routing_reason TEXT,
        distance_km DOUBLE PRECISION,

        -- Coarse geo from request headers - same as the leads table.
        ip_city TEXT,
        ip_region TEXT,
        ip_country TEXT,

        -- Misc context.
        consent_text_version TEXT, -- e.g. 'v5.1' so we can prove what they agreed to
        referrer TEXT,
        lang TEXT
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS lead_unlocks_created_at_idx ON lead_unlocks (created_at DESC);`;
    await sql`CREATE INDEX IF NOT EXISTS lead_unlocks_email_idx ON lead_unlocks (email);`;
    await sql`CREATE INDEX IF NOT EXISTS lead_unlocks_session_id_idx ON lead_unlocks (session_id);`;
  })();
  return schemaReady;
}

/**
 * Insert a unlock-row from the lead gate. Returns the row id so the
 * client can stash it in localStorage as proof of unlock.
 */
export async function insertLeadUnlock(row: {
  session_id: string;
  source: 'google' | 'manual';
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  google_sub?: string | null;
  email_verified?: boolean;
  procedure_id?: string | null;
  clinic_id?: string | null;
  routing_reason?: string | null;
  distance_km?: number | null;
  ip_city?: string | null;
  ip_region?: string | null;
  ip_country?: string | null;
  consent_text_version?: string | null;
  referrer?: string | null;
  lang?: string | null;
}): Promise<number> {
  await ensureSchema();
  const r = await sql<{ id: number }>`
    INSERT INTO lead_unlocks (
      session_id, source, first_name, last_name, email, phone, google_sub,
      email_verified, procedure_id, clinic_id, routing_reason, distance_km,
      ip_city, ip_region, ip_country, consent_text_version, referrer, lang
    ) VALUES (
      ${row.session_id},
      ${row.source},
      ${row.first_name ?? null},
      ${row.last_name ?? null},
      ${row.email ?? null},
      ${row.phone ?? null},
      ${row.google_sub ?? null},
      ${row.email_verified ?? false},
      ${row.procedure_id ?? null},
      ${row.clinic_id ?? null},
      ${row.routing_reason ?? null},
      ${row.distance_km ?? null},
      ${row.ip_city ?? null},
      ${row.ip_region ?? null},
      ${row.ip_country ?? null},
      ${row.consent_text_version ?? null},
      ${row.referrer ?? null},
      ${row.lang ?? null}
    )
    RETURNING id;
  `;
  return r.rows[0].id;
}

/**
 * Insert a new lead row. All fields are optional except session_id and
 * event_name. JSON-encodes payload for the JSONB column.
 */
export async function insertLead(row: {
  session_id: string;
  event_name: string;
  procedure_id?: string | null;
  clinic_id?: string | null;
  routing_reason?: string | null;
  distance_km?: number | null;
  ip_city?: string | null;
  ip_region?: string | null;
  ip_country?: string | null;
  payload?: Record<string, unknown> | null;
  referrer?: string | null;
  lang?: string | null;
}) {
  await ensureSchema();
  const payloadJson = row.payload ? JSON.stringify(row.payload) : null;
  await sql`
    INSERT INTO leads (
      session_id, event_name, procedure_id, clinic_id, routing_reason,
      distance_km, ip_city, ip_region, ip_country, payload, referrer, lang
    ) VALUES (
      ${row.session_id},
      ${row.event_name},
      ${row.procedure_id ?? null},
      ${row.clinic_id ?? null},
      ${row.routing_reason ?? null},
      ${row.distance_km ?? null},
      ${row.ip_city ?? null},
      ${row.ip_region ?? null},
      ${row.ip_country ?? null},
      ${payloadJson},
      ${row.referrer ?? null},
      ${row.lang ?? null}
    );
  `;
}

/**
 * Whether the database is even configured. Used by /api/track to fail
 * gracefully when no Postgres URL is set (e.g., local dev without a DB).
 */
export function isDbConfigured(): boolean {
  return Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.DATABASE_URL
  );
}
