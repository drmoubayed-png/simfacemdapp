/**
 * Report generation \u2014 powers both the daily email digest and the
 * /admin dashboard. Single source of truth for what a "lead" is and how
 * we count it.
 *
 * Lead-counting rules (matters for partner billing):
 *   \u2022 A "lead" = one `book_clicked` event for a clinic, deduped by
 *     session_id + clinic_id + day. So a user clicking Book five times
 *     on Tuesday counts as ONE lead for Tuesday.
 *   \u2022 Surgical bookings to the home base are NOT billable to partners
 *     (you keep them) but are still reported separately.
 *   \u2022 Aggregate metrics (simulations, shares) are not deduped \u2014 they
 *     measure activity volume, not unique lead counts.
 */

import { sql } from '@vercel/postgres';
import { CLINICS, type Clinic } from './clinics';
import { ensureSchema } from './db';

export type ReportRange = {
  /** Inclusive start, ISO8601 with timezone. */
  start: string;
  /** Exclusive end, ISO8601 with timezone. */
  end: string;
  /** Human label for the period, e.g. "Friday, May 8 2026". */
  label: string;
};

export type ClinicLeadStats = {
  clinic_id: string;
  clinic_name: string;
  is_partner: boolean;
  bookings_shown: number;
  unique_leads: number; // session-deduped book_clicked
  raw_book_clicks: number;
  by_procedure: Array<{ procedure_id: string; count: number }>;
};

export type GeoBucket = {
  city: string | null;
  region: string | null;
  country: string | null;
  count: number;
};

export type FullReport = {
  range: ReportRange;
  totals: {
    simulations_completed: number;
    bookings_shown: number;
    book_clicks_unique_leads: number;
    book_clicks_raw: number;
    shares: number;
    /** v5.1 — lead-gate unlocks (PII rows). */
    unlocks: number;
  };
  by_clinic: ClinicLeadStats[];
  top_cities: GeoBucket[];
  /** Per-lead detail rows for CSV / partner billing. */
  lead_rows: LeadRow[];
  /** v5.1 — lead-gate unlock rows. */
  unlock_rows: UnlockRow[];
};

export type UnlockRow = {
  created_at: string;
  source: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  email_verified: boolean;
  procedure_id: string | null;
  clinic_id: string | null;
  clinic_name: string | null;
  routing_reason: string | null;
  distance_km: number | null;
  ip_city: string | null;
  ip_region: string | null;
  ip_country: string | null;
  session_id: string;
  lang: string | null;
};

export type LeadRow = {
  created_at: string;
  procedure_id: string | null;
  clinic_id: string | null;
  clinic_name: string | null;
  routing_reason: string | null;
  distance_km: number | null;
  ip_city: string | null;
  ip_region: string | null;
  ip_country: string | null;
  session_id: string;
};

const clinicById = new Map(CLINICS.map((c) => [c.id, c] as const));

function nameForClinic(id: string | null): string | null {
  if (!id) return null;
  return clinicById.get(id)?.name ?? id;
}
function isPartner(c: Clinic | undefined): boolean {
  return Boolean(c && !c.isHomeBase);
}

/**
 * Build a "yesterday" range in the operator's local timezone (America/
 * Toronto). Vercel cron fires at the UTC time we configure, so we
 * compute the local-day window manually from the UTC `now`.
 */
export function rangeForYesterday(now = new Date()): ReportRange {
  // Get "yesterday" in America/Toronto using Intl trick
  const tz = 'America/Toronto';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yyyymmdd = fmt.format(yest); // "2026-05-08"
  // Start of that day, end = start of the following day (the "now" day)
  const todayStr = fmt.format(now); // "2026-05-09"
  const start = isoAtMidnight(yyyymmdd, tz);
  const end = isoAtMidnight(todayStr, tz);
  // Pretty label, e.g. "Friday, May 8, 2026"
  const labelFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  return { start, end, label: labelFmt.format(yest) };
}

/**
 * Convert "YYYY-MM-DD" + an IANA timezone to an ISO timestamp at local
 * midnight. Works by computing the UTC offset for that date in that TZ,
 * which Intl exposes via `formatToParts`.
 */
function isoAtMidnight(yyyymmdd: string, timeZone: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  // Find offset by formatting a known UTC moment in that TZ.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour12: false
  }).formatToParts(probe);
  const tzName =
    parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
  // Parse "GMT-04:00" or "GMT-4"
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  let offsetMin = 0;
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const hh = parseInt(match[2], 10);
    const mm = parseInt(match[3] ?? '0', 10);
    offsetMin = sign * (hh * 60 + mm);
  }
  // Local midnight = UTC midnight - offset
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60_000;
  return new Date(utcMidnight).toISOString();
}

export async function buildReport(range: ReportRange): Promise<FullReport> {
  await ensureSchema();
  const start = range.start;
  const end = range.end;

  // Totals
  const totalsRes = await sql`
    SELECT event_name, COUNT(*)::int AS n
    FROM leads
    WHERE created_at >= ${start} AND created_at < ${end}
    GROUP BY event_name;
  `;
  const totals = {
    simulations_completed: 0,
    bookings_shown: 0,
    book_clicks_unique_leads: 0,
    book_clicks_raw: 0,
    shares: 0,
    unlocks: 0
  };
  for (const r of totalsRes.rows) {
    const n = Number(r.n) || 0;
    if (r.event_name === 'simulation_completed') totals.simulations_completed = n;
    else if (r.event_name === 'booking_shown') totals.bookings_shown = n;
    else if (r.event_name === 'book_clicked') totals.book_clicks_raw = n;
    else if (r.event_name === 'share_clicked') totals.shares = n;
  }

  // Unique leads = distinct session_id + clinic_id pairs that fired book_clicked
  const uniqueLeadsRes = await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT DISTINCT session_id, clinic_id
      FROM leads
      WHERE event_name = 'book_clicked'
        AND created_at >= ${start} AND created_at < ${end}
        AND clinic_id IS NOT NULL
    ) sub;
  `;
  totals.book_clicks_unique_leads = Number(uniqueLeadsRes.rows[0]?.n ?? 0);

  // Per-clinic breakdown
  const byClinicRes = await sql`
    SELECT
      clinic_id,
      event_name,
      COUNT(*)::int AS n,
      COUNT(DISTINCT session_id)::int AS unique_sessions
    FROM leads
    WHERE created_at >= ${start} AND created_at < ${end}
      AND clinic_id IS NOT NULL
    GROUP BY clinic_id, event_name;
  `;
  type ClinicAcc = {
    bookings_shown: number;
    unique_leads: number;
    raw_book_clicks: number;
  };
  const acc = new Map<string, ClinicAcc>();
  for (const r of byClinicRes.rows) {
    const id = r.clinic_id as string;
    const cur = acc.get(id) ?? {
      bookings_shown: 0,
      unique_leads: 0,
      raw_book_clicks: 0
    };
    if (r.event_name === 'booking_shown') cur.bookings_shown = Number(r.n);
    if (r.event_name === 'book_clicked') {
      cur.raw_book_clicks = Number(r.n);
      cur.unique_leads = Number(r.unique_sessions);
    }
    acc.set(id, cur);
  }

  // Per-clinic procedure split (only for book_clicked, the billable event)
  const byClinicProcRes = await sql`
    SELECT clinic_id, procedure_id, COUNT(*)::int AS n
    FROM leads
    WHERE event_name = 'book_clicked'
      AND created_at >= ${start} AND created_at < ${end}
      AND clinic_id IS NOT NULL AND procedure_id IS NOT NULL
    GROUP BY clinic_id, procedure_id
    ORDER BY n DESC;
  `;
  const procAcc = new Map<string, Array<{ procedure_id: string; count: number }>>();
  for (const r of byClinicProcRes.rows) {
    const arr = procAcc.get(r.clinic_id as string) ?? [];
    arr.push({ procedure_id: r.procedure_id as string, count: Number(r.n) });
    procAcc.set(r.clinic_id as string, arr);
  }

  const by_clinic: ClinicLeadStats[] = Array.from(acc.entries())
    .map(([clinic_id, v]) => ({
      clinic_id,
      clinic_name: nameForClinic(clinic_id) ?? clinic_id,
      is_partner: isPartner(clinicById.get(clinic_id)),
      bookings_shown: v.bookings_shown,
      unique_leads: v.unique_leads,
      raw_book_clicks: v.raw_book_clicks,
      by_procedure: procAcc.get(clinic_id) ?? []
    }))
    .sort((a, b) => b.unique_leads - a.unique_leads);

  // Top cities by booking_shown (= where users actually saw an offer)
  const cityRes = await sql`
    SELECT ip_city, ip_region, ip_country, COUNT(*)::int AS n
    FROM leads
    WHERE event_name = 'booking_shown'
      AND created_at >= ${start} AND created_at < ${end}
      AND ip_city IS NOT NULL
    GROUP BY ip_city, ip_region, ip_country
    ORDER BY n DESC
    LIMIT 20;
  `;
  const top_cities: GeoBucket[] = cityRes.rows.map((r) => ({
    city: r.ip_city as string | null,
    region: r.ip_region as string | null,
    country: r.ip_country as string | null,
    count: Number(r.n)
  }));

  // Per-lead rows (book_clicked only) for CSV export
  const leadRowsRes = await sql`
    SELECT
      created_at, procedure_id, clinic_id, routing_reason, distance_km,
      ip_city, ip_region, ip_country, session_id
    FROM leads
    WHERE event_name = 'book_clicked'
      AND created_at >= ${start} AND created_at < ${end}
    ORDER BY created_at ASC;
  `;
  const lead_rows: LeadRow[] = leadRowsRes.rows.map((r) => ({
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    procedure_id: r.procedure_id as string | null,
    clinic_id: r.clinic_id as string | null,
    clinic_name: nameForClinic(r.clinic_id as string | null),
    routing_reason: r.routing_reason as string | null,
    distance_km: r.distance_km == null ? null : Number(r.distance_km),
    ip_city: r.ip_city as string | null,
    ip_region: r.ip_region as string | null,
    ip_country: r.ip_country as string | null,
    session_id: r.session_id as string
  }));

  // ---- v5.1: lead-gate unlocks (PII rows) ----
  const unlocksRes = await sql`
    SELECT
      created_at, source, first_name, last_name, email, phone, email_verified,
      procedure_id, clinic_id, routing_reason, distance_km,
      ip_city, ip_region, ip_country, session_id, lang
    FROM lead_unlocks
    WHERE created_at >= ${start} AND created_at < ${end}
    ORDER BY created_at ASC;
  `;
  const unlock_rows: UnlockRow[] = unlocksRes.rows.map((r) => ({
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    source: String(r.source ?? ''),
    first_name: r.first_name as string | null,
    last_name: r.last_name as string | null,
    email: r.email as string | null,
    phone: r.phone as string | null,
    email_verified: Boolean(r.email_verified),
    procedure_id: r.procedure_id as string | null,
    clinic_id: r.clinic_id as string | null,
    clinic_name: nameForClinic(r.clinic_id as string | null),
    routing_reason: r.routing_reason as string | null,
    distance_km: r.distance_km == null ? null : Number(r.distance_km),
    ip_city: r.ip_city as string | null,
    ip_region: r.ip_region as string | null,
    ip_country: r.ip_country as string | null,
    session_id: r.session_id as string,
    lang: r.lang as string | null
  }));
  totals.unlocks = unlock_rows.length;

  return { range, totals, by_clinic, top_cities, lead_rows, unlock_rows };
}

/* ------------------------------------------------------------------ */
/*  CSV serialization                                                 */
/* ------------------------------------------------------------------ */

/**
 * v5.1 — CSV for the lead-gate PII rows. Separate from leadsToCsv so
 * the operator can grant different access (e.g. share book-click events
 * with partners while keeping the PII export internal).
 */
export function unlocksToCsv(rows: UnlockRow[]): string {
  const headers = [
    'created_at',
    'source',
    'first_name',
    'last_name',
    'email',
    'phone',
    'email_verified',
    'procedure_id',
    'clinic_id',
    'clinic_name',
    'routing_reason',
    'distance_km',
    'ip_city',
    'ip_region',
    'ip_country',
    'lang',
    'session_id'
  ];
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.created_at,
        r.source,
        r.first_name,
        r.last_name,
        r.email,
        r.phone,
        r.email_verified,
        r.procedure_id,
        r.clinic_id,
        r.clinic_name,
        r.routing_reason,
        r.distance_km,
        r.ip_city,
        r.ip_region,
        r.ip_country,
        r.lang,
        r.session_id
      ]
        .map(escape)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function leadsToCsv(rows: LeadRow[]): string {
  const headers = [
    'created_at',
    'procedure_id',
    'clinic_id',
    'clinic_name',
    'routing_reason',
    'distance_km',
    'ip_city',
    'ip_region',
    'ip_country',
    'session_id'
  ];
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.created_at,
        r.procedure_id,
        r.clinic_id,
        r.clinic_name,
        r.routing_reason,
        r.distance_km,
        r.ip_city,
        r.ip_region,
        r.ip_country,
        r.session_id
      ]
        .map(escape)
        .join(',')
    );
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  HTML email rendering                                              */
/* ------------------------------------------------------------------ */

export function reportToHtml(report: FullReport): string {
  const { range, totals, by_clinic, top_cities } = report;
  const conv =
    totals.bookings_shown > 0
      ? Math.round((totals.book_clicks_unique_leads / totals.bookings_shown) * 100)
      : 0;

  const clinicRows = by_clinic
    .map((c) => {
      const procList =
        c.by_procedure
          .slice(0, 4)
          .map((p) => `${p.procedure_id} \u00d7${p.count}`)
          .join(', ') || '\u2014';
      const tag = c.is_partner
        ? '<span style="background:#C9A84C;color:#000;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:6px">PARTNER</span>'
        : '';
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #2a2a2a">
            <strong>${escapeHtml(c.clinic_name)}</strong>${tag}
          </td>
          <td style="padding:10px;border-bottom:1px solid #2a2a2a;text-align:right">
            ${c.unique_leads}
          </td>
          <td style="padding:10px;border-bottom:1px solid #2a2a2a;text-align:right">
            ${c.bookings_shown}
          </td>
          <td style="padding:10px;border-bottom:1px solid #2a2a2a;color:rgba(255,255,255,0.65);font-size:13px">
            ${escapeHtml(procList)}
          </td>
        </tr>`;
    })
    .join('');

  const cityRows = top_cities
    .slice(0, 10)
    .map(
      (c) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a">
            ${escapeHtml(
              [c.city, c.region, c.country].filter(Boolean).join(', ') || 'Unknown'
            )}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;text-align:right">
            ${c.count}
          </td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#000;color:#fff;font-family:Inter,system-ui,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:32px 24px">
  <div style="border-bottom:1px solid #2a2a2a;padding-bottom:18px;margin-bottom:24px">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:28px;color:#fff">
      SimFaceMD \u2014 Daily Lead Report
    </div>
    <div style="color:rgba(255,255,255,0.55);font-size:13px;margin-top:4px">
      ${escapeHtml(range.label)}
    </div>
  </div>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px">
    ${kpi('Simulations', totals.simulations_completed)}
    ${kpi('Identified leads', totals.unlocks, '#C9A84C')}
    ${kpi('Bookings shown', totals.bookings_shown)}
    ${kpi('Book clicks', totals.book_clicks_unique_leads)}
    ${kpi('Shares', totals.shares)}
    ${kpi('Conversion', conv + '%')}
  </div>

  ${renderUnlocksTable(report.unlock_rows)}

  <h2 style="font-size:16px;color:#C9A84C;margin:24px 0 10px;text-transform:uppercase;letter-spacing:0.16em">
    By clinic
  </h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:0.12em">
        <th align="left" style="padding:8px 10px;font-weight:500">Clinic</th>
        <th align="right" style="padding:8px 10px;font-weight:500">Leads</th>
        <th align="right" style="padding:8px 10px;font-weight:500">Shown</th>
        <th align="left" style="padding:8px 10px;font-weight:500">Top procedures</th>
      </tr>
    </thead>
    <tbody>
      ${clinicRows || '<tr><td colspan="4" style="padding:14px;color:rgba(255,255,255,0.5)">No activity</td></tr>'}
    </tbody>
  </table>

  <h2 style="font-size:16px;color:#C9A84C;margin:32px 0 10px;text-transform:uppercase;letter-spacing:0.16em">
    Top cities
  </h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tbody>
      ${cityRows || '<tr><td style="padding:14px;color:rgba(255,255,255,0.5)">No geo data</td></tr>'}
    </tbody>
  </table>

  <div style="margin-top:36px;padding-top:18px;border-top:1px solid #2a2a2a;color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6">
    Two CSVs are attached:<br>
    • <strong>identified-leads.csv</strong> — name, email, phone from the
    result-screen lead gate (your hot list).<br>
    • <strong>events.csv</strong> — one row per book-click for partner billing.
    <br><br>
    Live dashboard: <a href="https://simfacemd.com/admin" style="color:#C9A84C">simfacemd.com/admin</a>
  </div>
</div>
</body></html>`;
}

function kpi(label: string, value: number | string, color = '#FFFFFF') {
  return `
    <div style="flex:1;min-width:120px;background:#141414;border:1px solid #2a2a2a;border-radius:10px;padding:14px">
      <div style="color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:0.14em">${escapeHtml(label)}</div>
      <div style="color:${color};font-size:24px;font-weight:600;margin-top:4px">${escapeHtml(String(value))}</div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * v5.1 — inline table of identified leads at the top of the daily email.
 * This is the most actionable thing in the report (callable contacts), so
 * it goes ABOVE the by-clinic / by-city aggregates.
 */
function renderUnlocksTable(rows: UnlockRow[]): string {
  if (!rows || rows.length === 0) {
    return '';
  }
  const body = rows
    .map((r) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
      const proc = r.procedure_id ?? '—';
      const where =
        [r.ip_city, r.ip_region, r.ip_country].filter(Boolean).join(', ') || '—';
      const sourceTag =
        r.source === 'google'
          ? '<span style="background:#1a73e8;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:4px">G</span>'
          : '';
      const time = (r.created_at ?? '').slice(11, 16);
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a">
            <strong>${escapeHtml(name)}</strong>${sourceTag}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;color:rgba(255,255,255,0.85)">
            ${escapeHtml(r.email ?? '—')}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;color:rgba(255,255,255,0.85);white-space:nowrap">
            ${escapeHtml(r.phone ?? '—')}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;color:rgba(255,255,255,0.65);font-size:13px">
            ${escapeHtml(proc)}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #2a2a2a;color:rgba(255,255,255,0.55);font-size:12px">
            ${escapeHtml(where)} · ${escapeHtml(time)}
          </td>
        </tr>`;
    })
    .join('');
  return `
  <h2 style="font-size:16px;color:#C9A84C;margin:24px 0 10px;text-transform:uppercase;letter-spacing:0.16em">
    Identified leads (call list)
  </h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:0.12em">
        <th align="left" style="padding:8px 10px;font-weight:500">Name</th>
        <th align="left" style="padding:8px 10px;font-weight:500">Email</th>
        <th align="left" style="padding:8px 10px;font-weight:500">Phone</th>
        <th align="left" style="padding:8px 10px;font-weight:500">Procedure</th>
        <th align="left" style="padding:8px 10px;font-weight:500">Where · Time</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}
