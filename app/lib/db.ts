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
  })();
  return schemaReady;
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
