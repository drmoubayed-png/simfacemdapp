'use client';

/**
 * SimFaceMD admin dashboard (v5.1.4 — even-simpler sales-team edition).
 *
 * Single-purpose tool: a clean call list of identified leads.
 *
 * The dashboard intentionally has ONE table:
 *   first / last / email / phone / procedure / where + time
 *
 * Plus a date range picker (with quick presets) and a one-click CSV
 * export of exactly that range. No analytics widgets, no per-clinic
 * tables, no KPI strip — the sales team only ever asked "who do I
 * call today?".
 *
 * Auth model: enter the admin key once; it's stored in sessionStorage
 * so it survives page reloads but vanishes when the tab closes.
 *
 * Intentionally NOT i18n'd — operator tool.
 */

import { useEffect, useMemo, useState } from 'react';

type UnlockRow = {
  created_at: string;
  source: string; // 'google' | 'form'
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
  // Default to last 30 days — sales typically wants a wide net.
  const [start, setStart] = useState(daysAgoStr(30));
  const [end, setEnd] = useState(todayStr());
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Restore saved key on mount.
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

  // Auto-load report when auth + range are set.
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
    const url = `/api/admin/unlocks.csv?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&key=${encodeURIComponent(adminKey)}`;
    window.open(url, '_blank');
  };

  // Filter rows by the search box. We search across name, email, phone,
  // procedure, clinic and where. Lower-cased substring match — fast
  // enough for thousands of rows in the browser.
  const filteredRows = useMemo<UnlockRow[]>(() => {
    if (!report) return [];
    const rows = report.unlock_rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.first_name,
        r.last_name,
        r.email,
        r.phone,
        r.procedure_id,
        r.clinic_name,
        r.clinic_id,
        r.ip_city,
        r.ip_region,
        r.ip_country,
        r.source
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [report, search]);

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
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header — title + sign out */}
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
              SimFaceMD — Leads
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 4 }}>
              {report?.range.label ?? 'Loading…'}
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

        {/* Controls — date range + presets + search + download */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16
          }}
        >
          <DateField label="From" value={start} onChange={setStart} />
          <DateField label="To" value={end} onChange={setEnd} />
          {[
            { label: 'Today', s: todayStr(), e: todayStr() },
            { label: 'Yesterday', s: daysAgoStr(1), e: daysAgoStr(1) },
            { label: 'Last 7 days', s: daysAgoStr(7), e: todayStr() },
            { label: 'Last 30 days', s: daysAgoStr(30), e: todayStr() },
            { label: 'Last 90 days', s: daysAgoStr(90), e: todayStr() },
            { label: 'All time', s: '2024-01-01', e: todayStr() }
          ].map((preset) => {
            const active = preset.s === start && preset.e === end;
            return (
              <button
                key={preset.label}
                onClick={() => {
                  setStart(preset.s);
                  setEnd(preset.e);
                }}
                style={{
                  background: active ? 'rgba(201,168,76,0.15)' : 'transparent',
                  color: active ? '#C9A84C' : 'rgba(255,255,255,0.7)',
                  border: active ? '1px solid #C9A84C' : '1px solid #2a2a2a',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {preset.label}
              </button>
            );
          })}
          <div style={{ marginLeft: 'auto' }}>
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
              title="Download identified leads as CSV for the selected date range"
            >
              ↓ Export CSV ({start} → {end})
            </button>
          </div>
        </div>

        {/* Search box — debounced via React state, instant filter */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, procedure, city…"
            style={{
              width: '100%',
              background: '#0a0a0a',
              color: '#fff',
              border: '1px solid #2a2a2a',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              outline: 'none'
            }}
          />
        </div>

        {/* Stats line — minimal */}
        {report && (
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.65)',
              marginBottom: 16,
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap'
            }}
          >
            <span>
              <strong style={{ color: '#C9A84C' }}>{filteredRows.length}</strong> shown
            </span>
            <span>
              <strong>{report.unlock_rows?.length ?? 0}</strong> identified leads
            </span>
            <span>
              <strong>{report.totals.simulations_completed}</strong> simulations run
            </span>
          </div>
        )}

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
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading…</div>
        )}

        {report && <LeadsTable rows={filteredRows} />}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Form bits                                                          */
/* ------------------------------------------------------------------ */

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
      <span
        style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em'
        }}
      >
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

/* ------------------------------------------------------------------ */
/*  Leads table — name / email / phone / procedure / when / where      */
/* ------------------------------------------------------------------ */

function LeadsTable({ rows }: { rows: UnlockRow[] }) {
  if (!rows || rows.length === 0) {
    return (
      <div
        style={{
          background: '#141414',
          border: '1px dashed #2a2a2a',
          borderRadius: 12,
          padding: '40px 16px',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 13,
          textAlign: 'center'
        }}
      >
        No identified leads match your filters.
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
        overflow: 'auto'
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          minWidth: 880
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
            <th align="left" style={thStyle}>First Name</th>
            <th align="left" style={thStyle}>Last Name</th>
            <th align="left" style={thStyle}>Email</th>
            <th align="left" style={thStyle}>Phone</th>
            <th align="left" style={thStyle}>Procedure</th>
            <th align="left" style={thStyle}>Where / Time</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const city =
              [r.ip_city, r.ip_region, r.ip_country].filter(Boolean).join(', ') || '—';
            return (
              <tr key={`${r.created_at}-${i}`}>
                <td style={tdStyle}>
                  <strong>{r.first_name || '—'}</strong>
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
                  <strong>{r.last_name || '—'}</strong>
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
                  {prettyProcedure(r.procedure_id)}
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.7)' }}>
                  <div>{city}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {formatLocalDateTime(r.created_at)}
                  </div>
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
  padding: '12px 14px',
  borderBottom: '1px solid #1d1d1d',
  whiteSpace: 'nowrap',
  verticalAlign: 'top'
};

/**
 * Turn a procedure_id like 'ultrasonic_rhinoplasty' into 'Ultrasonic
 * rhinoplasty' for the table. Operator-friendly, no i18n.
 */
function prettyProcedure(id: string | null): string {
  if (!id) return '—';
  const map: Record<string, string> = {
    ultrasonic_rhinoplasty: 'Ultrasonic rhinoplasty',
    deep_plane_facelift: 'Deep-plane facelift',
    botox: 'Botox',
    lip_cheek_filler: 'Lip / cheek filler',
    co2_laser: 'CO₂ laser',
    bbl_photofacial: 'BBL photofacial'
  };
  return map[id] || id.replace(/_/g, ' ');
}

function formatLocalDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
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
