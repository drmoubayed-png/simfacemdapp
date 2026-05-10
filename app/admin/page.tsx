'use client';

/**
 * SimFaceMD admin dashboard.
 *
 * Single-operator tool. Auth model: enter the admin key once; it's
 * stored in sessionStorage so it survives page reloads in this tab but
 * vanishes when the tab closes.
 *
 * Features:
 *   \u2022 Date range picker (defaults to yesterday)
 *   \u2022 KPI strip (sims, bookings shown, unique leads, shares, conv %)
 *   \u2022 Per-clinic breakdown with PARTNER tags
 *   \u2022 Top cities (text list \u2014 a map would need a third-party tile
 *     provider; defer until traffic justifies it)
 *   \u2022 CSV export for arbitrary date range
 *
 * Intentionally NOT i18n'd \u2014 this is an operator tool, not a patient view.
 */

import { useEffect, useState } from 'react';

type ClinicLeadStats = {
  clinic_id: string;
  clinic_name: string;
  is_partner: boolean;
  bookings_shown: number;
  unique_leads: number;
  raw_book_clicks: number;
  by_procedure: Array<{ procedure_id: string; count: number }>;
};
type GeoBucket = {
  city: string | null;
  region: string | null;
  country: string | null;
  count: number;
};
type UnlockRow = {
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
type FullReport = {
  range: { start: string; end: string; label: string };
  totals: {
    simulations_completed: number;
    bookings_shown: number;
    book_clicks_unique_leads: number;
    book_clicks_raw: number;
    shares: number;
    unlocks: number;
  };
  by_clinic: ClinicLeadStats[];
  top_cities: GeoBucket[];
  unlock_rows: UnlockRow[];
};

const KEY_STORAGE = 'simfacemd:admin_key';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [start, setStart] = useState(daysAgoStr(7));
  const [end, setEnd] = useState(todayStr());
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore saved key on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY_STORAGE);
      if (saved) {
        setAdminKey(saved);
        setAuthed(true);
      }
    } catch {
      /* sessionStorage may be blocked */
    }
  }, []);

  // Auto-load report whenever auth + date range are set
  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    setError(null);
    const startIso = new Date(start + 'T00:00:00').toISOString();
    const endIso = new Date(end + 'T23:59:59.999').toISOString();
    fetch(
      `/api/admin/report?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
      { headers: { 'x-admin-key': adminKey } }
    )
      .then(async (r) => {
        if (r.status === 401) {
          // Bad key \u2014 reset and ask again
          sessionStorage.removeItem(KEY_STORAGE);
          setAuthed(false);
          throw new Error('Invalid admin key');
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Unknown error');
        setReport(j.report);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authed, adminKey, start, end]);

  const handleSubmitKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey) return;
    try {
      sessionStorage.setItem(KEY_STORAGE, adminKey);
    } catch {
      /* noop */
    }
    setAuthed(true);
  };

  const handleDownloadCsv = () => {
    const startIso = new Date(start + 'T00:00:00').toISOString();
    const endIso = new Date(end + 'T23:59:59.999').toISOString();
    const url = `/api/admin/leads.csv?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&key=${encodeURIComponent(adminKey)}`;
    window.open(url, '_blank');
  };

  const handleDownloadUnlocksCsv = () => {
    const startIso = new Date(start + 'T00:00:00').toISOString();
    const endIso = new Date(end + 'T23:59:59.999').toISOString();
    const url = `/api/admin/unlocks.csv?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&key=${encodeURIComponent(adminKey)}`;
    window.open(url, '_blank');
  };

  if (!authed) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#000',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          fontFamily: 'Inter,system-ui,sans-serif'
        }}
      >
        <form
          onSubmit={handleSubmitKey}
          style={{
            background: '#141414',
            border: '1px solid #2a2a2a',
            borderRadius: 14,
            padding: 28,
            width: '100%',
            maxWidth: 360
          }}
        >
          <div
            style={{
              fontFamily: "'Cormorant Garamond',Georgia,serif",
              fontStyle: 'italic',
              fontSize: 24,
              marginBottom: 6
            }}
          >
            SimFaceMD Admin
          </div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 18 }}>
            Enter your admin key to view the dashboard.
          </div>
          <input
            type="password"
            autoFocus
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Admin key"
            style={{
              width: '100%',
              background: '#000',
              color: '#fff',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 14
            }}
          />
          <button
            type="submit"
            style={{
              width: '100%',
              marginTop: 12,
              background: '#C9A84C',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Sign in
          </button>
        </form>
      </main>
    );
  }

  const conv =
    report && report.totals.bookings_shown > 0
      ? Math.round(
          (report.totals.book_clicks_unique_leads / report.totals.bookings_shown) * 100
        )
      : 0;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        padding: 24,
        fontFamily: 'Inter,system-ui,sans-serif'
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #2a2a2a',
            paddingBottom: 18,
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond',Georgia,serif",
                fontStyle: 'italic',
                fontSize: 28
              }}
            >
              SimFaceMD \u2014 Lead Dashboard
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 4 }}>
              {report?.range.label}
            </div>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem(KEY_STORAGE);
              setAuthed(false);
              setAdminKey('');
            }}
            style={{
              background: 'transparent',
              color: 'rgba(255,255,255,0.55)',
              border: '1px solid #2a2a2a',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Sign out
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 24
          }}
        >
          <DateField label="From" value={start} onChange={setStart} />
          <DateField label="To" value={end} onChange={setEnd} />
          <button
            onClick={handleDownloadCsv}
            style={{
              background: '#C9A84C',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Events CSV
          </button>
          <button
            onClick={handleDownloadUnlocksCsv}
            style={{
              background: '#C9A84C',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Identified leads with name / email / phone (PII)"
          >
            Identified leads CSV
          </button>
          {[
            { label: 'Yesterday', s: daysAgoStr(1), e: daysAgoStr(1) },
            { label: 'Last 7 days', s: daysAgoStr(7), e: todayStr() },
            { label: 'Last 30 days', s: daysAgoStr(30), e: todayStr() }
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                setStart(preset.s);
                setEnd(preset.e);
              }}
              style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.7)',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(220,80,80,0.1)',
              border: '1px solid rgba(220,80,80,0.4)',
              color: '#ff8080',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              marginBottom: 16
            }}
          >
            {error}
          </div>
        )}

        {loading && !report && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading\u2026</div>
        )}

        {report && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
                gap: 12,
                marginBottom: 32
              }}
            >
              <Kpi label="Simulations" value={report.totals.simulations_completed} />
              <Kpi
                label="Identified leads"
                value={report.totals.unlocks ?? 0}
                highlight
              />
              <Kpi label="Bookings shown" value={report.totals.bookings_shown} />
              <Kpi
                label="Book clicks"
                value={report.totals.book_clicks_unique_leads}
              />
              <Kpi label="Shares" value={report.totals.shares} />
              <Kpi label="Conversion" value={conv + '%'} />
            </div>

            <SectionTitle>Identified leads (name, email, phone)</SectionTitle>
            <UnlocksTable rows={report.unlock_rows ?? []} />

            <SectionTitle>By clinic</SectionTitle>
            <div
              style={{
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 12,
                overflow: 'hidden',
                marginBottom: 32
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr
                    style={{
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em'
                    }}
                  >
                    <th align="left" style={{ padding: '10px 14px', fontWeight: 500 }}>
                      Clinic
                    </th>
                    <th align="right" style={{ padding: '10px 14px', fontWeight: 500 }}>
                      Leads
                    </th>
                    <th align="right" style={{ padding: '10px 14px', fontWeight: 500 }}>
                      Shown
                    </th>
                    <th align="left" style={{ padding: '10px 14px', fontWeight: 500 }}>
                      Top procedures
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_clinic.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: 20,
                          color: 'rgba(255,255,255,0.5)',
                          textAlign: 'center'
                        }}
                      >
                        No activity in this range.
                      </td>
                    </tr>
                  ) : (
                    report.by_clinic.map((c) => (
                      <tr key={c.clinic_id} style={{ borderTop: '1px solid #2a2a2a' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <strong>{c.clinic_name}</strong>
                          {c.is_partner && <PartnerTag />}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {c.unique_leads}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {c.bookings_shown}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: 'rgba(255,255,255,0.65)',
                            fontSize: 13
                          }}
                        >
                          {c.by_procedure.length === 0
                            ? '\u2014'
                            : c.by_procedure
                                .slice(0, 4)
                                .map((p) => `${p.procedure_id} \u00d7${p.count}`)
                                .join(', ')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <SectionTitle>Top cities</SectionTitle>
            <div
              style={{
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 12,
                overflow: 'hidden'
              }}
            >
              {report.top_cities.length === 0 ? (
                <div style={{ padding: 20, color: 'rgba(255,255,255,0.5)' }}>
                  No geo data in this range.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <tbody>
                    {report.top_cities.slice(0, 15).map((c, i) => (
                      <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #2a2a2a' }}>
                        <td style={{ padding: '10px 14px' }}>
                          {[c.city, c.region, c.country].filter(Boolean).join(', ') ||
                            'Unknown'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {c.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function DateField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: '#000',
          color: '#fff',
          border: '1px solid #2a2a2a',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 13
        }}
      />
    </label>
  );
}

function Kpi({
  label,
  value,
  highlight
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 10,
        padding: 16
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em'
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: highlight ? '#C9A84C' : '#fff',
          marginTop: 6
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 14,
        color: '#C9A84C',
        margin: '24px 0 12px',
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        fontWeight: 500
      }}
    >
      {children}
    </h2>
  );
}

function PartnerTag() {
  return (
    <span
      style={{
        background: '#C9A84C',
        color: '#000',
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        marginLeft: 8,
        letterSpacing: '0.06em'
      }}
    >
      PARTNER
    </span>
  );
}

/**
 * Identified leads table — the call list. Sorted newest-first so the
 * most recent lead is at the top of the screen when the operator opens
 * the dashboard. Tap email/phone to copy / call directly on mobile.
 */
function UnlocksTable({ rows }: { rows: UnlockRow[] }) {
  if (!rows || rows.length === 0) {
    return (
      <div
        style={{
          background: '#141414',
          border: '1px dashed #2a2a2a',
          borderRadius: 12,
          padding: '20px 16px',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 13,
          marginBottom: 32,
          textAlign: 'center'
        }}
      >
        No identified leads in this date range yet.
      </div>
    );
  }
  // Newest first.
  const sorted = [...rows].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );
  return (
    <div
      style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        overflow: 'auto',
        marginBottom: 32
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          minWidth: 720
        }}
      >
        <thead>
          <tr
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.12em'
            }}
          >
            <th align="left" style={thStyle}>When</th>
            <th align="left" style={thStyle}>Name</th>
            <th align="left" style={thStyle}>Email</th>
            <th align="left" style={thStyle}>Phone</th>
            <th align="left" style={thStyle}>Procedure</th>
            <th align="left" style={thStyle}>Routed to</th>
            <th align="left" style={thStyle}>Where</th>
            <th align="left" style={thStyle}>Source</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
            const where =
              [r.ip_city, r.ip_region, r.ip_country].filter(Boolean).join(', ') || '—';
            return (
              <tr key={`${r.created_at}-${i}`}>
                <td style={tdStyle}>
                  {formatLocalDateTime(r.created_at)}
                </td>
                <td style={tdStyle}>
                  <strong>{name}</strong>
                  {r.email_verified && (
                    <span
                      title="Email verified by Google"
                      style={{ marginLeft: 6, color: '#1a73e8' }}
                    >
                      ✓
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  {r.email ? (
                    <a
                      href={`mailto:${r.email}`}
                      style={{ color: '#fff', textDecoration: 'underline' }}
                    >
                      {r.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={tdStyle}>
                  {r.phone ? (
                    <a
                      href={`tel:${r.phone}`}
                      style={{ color: '#fff', textDecoration: 'underline' }}
                    >
                      {r.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.85)' }}>
                  {r.procedure_id ?? '—'}
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.7)' }}>
                  {r.clinic_name ?? r.clinic_id ?? '—'}
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.65)' }}>
                  {where}
                </td>
                <td style={tdStyle}>
                  {r.source === 'google' ? (
                    <span
                      style={{
                        background: '#1a73e8',
                        color: '#fff',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.06em'
                      }}
                    >
                      GOOGLE
                    </span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>form</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontWeight: 500,
  borderBottom: '1px solid #2a2a2a',
  whiteSpace: 'nowrap'
};
const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #1d1d1d',
  whiteSpace: 'nowrap',
  verticalAlign: 'top'
};

function formatLocalDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-CA', {
      timeZone: 'America/Toronto',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}
