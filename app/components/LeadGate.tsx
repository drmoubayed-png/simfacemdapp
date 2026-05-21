'use client';

/**
 * v5.1 — Lead gate modal.
 *
 * Renders on top of a blurred result image. Until the user submits a
 * valid identity (Google OAuth or manual form), the simulation result
 * stays blurred and the modal blocks interaction.
 *
 * Visual contract (matches Dr. Moubayed's spec):
 *   - Centered card overlay on a blurred + dim-tinted backdrop.
 *   - Title: "Your simulation is ready! 🎉"
 *   - Subtext: "Sign in or enter your details…"
 *   - PRIMARY: "Continue with Google" (Google Identity Services button).
 *   - DIVIDER: thin line with "or" centered.
 *   - SECONDARY: First Name + Email + Phone form, NA-strict phone mask.
 *   - Footer: link to /privacy.
 *
 * State machine:
 *   idle → submitting → success (parent unmounts the gate)
 *                    ↘ error (back to idle, message shown)
 *
 * Phone masking strategy:
 *   We strip all non-digits and re-format to "(XXX) XXX-XXXX" on every
 *   keystroke. This forces NA shape without using a third-party masking
 *   lib (smaller bundle).
 *
 * Google sign-in strategy:
 *   We dynamically inject https://accounts.google.com/gsi/client once,
 *   then call window.google.accounts.id.initialize + renderButton. The
 *   ID token returned in the callback is sent to /api/leads/submit
 *   which verifies it server-side. No client secret involved.
 *   If GOOGLE_CLIENT_ID isn't set we hide the Google block entirely
 *   so the manual form stands alone.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useI18n } from '../lib/i18n';

type GateContext = {
  procedure_id: string;
  clinic_id: string | null;
  routing_reason: string | null;
  distance_km: number | null;
  session_id: string;
  lang: string;
};

type Props = {
  /** Public Google OAuth client id — undefined disables the Google block. */
  googleClientId: string | undefined;
  /** Snapshot of what the visitor was looking at when the gate opened. */
  context: GateContext;
  /**
   * Called after a successful unlock. v5.1.4 adds `unlockToken` which the
   * parent MUST send as `x-unlock-token` on /api/simulate so the server-
   * side gate accepts the request.
   */
  onUnlocked: (
    leadId: number,
    firstName: string | null,
    unlockToken: string | null
  ) => void;
};

declare global {
  interface Window {
    google?: any;
    __simfacemd_gsi_loaded?: boolean;
  }
}

export function LeadGate({ googleClientId, context, onUnlocked }: Props) {
  const { t } = useI18n();
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneRaw, setPhoneRaw] = useState(''); // formatted, e.g. "(514) 555-1"
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* -------------------- Google Identity Services -------------------- */

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setError(null);
      setSubmitting(true);
      try {
        const r = await fetch('/api/leads/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            source: 'google',
            credential,
            ...context,
            referrer: typeof document !== 'undefined' ? document.referrer : null
          })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) {
          setError(t('gate.errorGeneric'));
          setSubmitting(false);
          return;
        }
        onUnlocked(j.lead_id ?? 0, j.first_name ?? null, j.unlock_token ?? null);
      } catch {
        setError(t('gate.errorGeneric'));
        setSubmitting(false);
      }
    },
    [context, onUnlocked, t]
  );

  useEffect(() => {
    if (!googleClientId) return;
    let cancelled = false;

    const init = () => {
      if (cancelled) return;
      const g = window.google;
      if (!g?.accounts?.id || !googleBtnRef.current) return;

      try {
        g.accounts.id.initialize({
          client_id: googleClientId,
          callback: (resp: { credential?: string }) => {
            if (resp?.credential) void handleGoogleCredential(resp.credential);
          },
          auto_select: false,
          ux_mode: 'popup'
        });
        // Clear any previous render (StrictMode double-mount in dev).
        googleBtnRef.current.innerHTML = '';
        g.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 320 // matches our card content width
        });
      } catch (e) {
        // Don't crash the app if GSI misbehaves — the manual form still works.
        console.warn('[LeadGate] GIS init failed', e);
      }
    };

    if (window.__simfacemd_gsi_loaded && window.google?.accounts?.id) {
      init();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.__simfacemd_gsi_loaded = true;
        init();
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [googleClientId, handleGoogleCredential]);

  /* -------------------- Manual form -------------------- */

  // Strict NA phone mask. Keeps only digits, drops a leading "1", and
  // formats to "(XXX) XXX-XXXX" up to 10 digits. Anything pasted past
  // 10 digits is silently truncated.
  const onPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = e.target.value.replace(/\D+/g, '');
    if (digits.length > 11) digits = digits.slice(0, 11);
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    if (digits.length > 10) digits = digits.slice(0, 10);
    const a = digits.slice(0, 3);
    const b = digits.slice(3, 6);
    const c = digits.slice(6, 10);
    let formatted = '';
    if (a) formatted = `(${a}`;
    if (a.length === 3) formatted += ') ';
    if (b) formatted += b;
    if (b.length === 3) formatted += '-';
    if (c) formatted += c;
    setPhoneRaw(formatted);
  };

  const onManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim();
    const digits = phoneRaw.replace(/\D+/g, '');

    if (!trimmedFirst || !trimmedLast || !trimmedEmail || !digits) {
      setError(t('gate.errorRequired'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setError(t('gate.errorEmail'));
      return;
    }
    if (digits.length !== 10) {
      setError(t('gate.errorPhone'));
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch('/api/leads/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          first_name: trimmedFirst,
          last_name: trimmedLast,
          email: trimmedEmail,
          phone: phoneRaw,
          ...context,
          referrer: typeof document !== 'undefined' ? document.referrer : null
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        if (j?.error === 'bad_email') setError(t('gate.errorEmail'));
        else if (j?.error === 'bad_phone') setError(t('gate.errorPhone'));
        else setError(t('gate.errorGeneric'));
        setSubmitting(false);
        return;
      }
      onUnlocked(
        j.lead_id ?? 0,
        j.first_name ?? trimmedFirst,
        j.unlock_token ?? null
      );
    } catch {
      setError(t('gate.errorGeneric'));
      setSubmitting(false);
    }
  };

  /* -------------------- Render -------------------- */

  // Backdrop traps clicks. The card is inside, centered.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('gate.title')}
      className="lead-gate-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        // The blur/dim of the underlying image is applied by the parent
        // (see page.tsx blurredFrame style). We only add a soft scrim
        // on TOP of the blurred image so the card has clear contrast.
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#0E0E0E',
          border: '1px solid rgba(201,168,76,0.35)',
          borderRadius: 16,
          padding: '26px 22px 22px',
          color: '#fff',
          boxShadow: '0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 28,
            lineHeight: 1.15,
            textAlign: 'center',
            margin: 0
          }}
        >
          {t('gate.title')}
        </h2>
        <p
          style={{
            color: 'rgba(255,255,255,0.7)',
            textAlign: 'center',
            fontSize: 13.5,
            lineHeight: 1.45,
            marginTop: 8,
            marginBottom: 20
          }}
        >
          {t('gate.subtitle')}
        </p>

        {/* Google block — hidden if no client id configured */}
        {googleClientId && (
          <>
            <div
              ref={googleBtnRef}
              style={{
                display: 'flex',
                justifyContent: 'center',
                minHeight: 44,
                marginBottom: 14
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                margin: '14px 0 14px'
              }}
              aria-hidden
            >
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
                {t('gate.or')}
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
            </div>
          </>
        )}

        <form onSubmit={onManualSubmit} noValidate>
          <label style={fieldLabelStyle}>{t('gate.firstName')}</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            required
            style={inputStyle}
            disabled={submitting}
          />

          <label style={fieldLabelStyle}>{t('gate.lastName')}</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            required
            style={inputStyle}
            disabled={submitting}
          />

          <label style={fieldLabelStyle}>{t('gate.email')}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
            style={inputStyle}
            disabled={submitting}
          />

          <label style={fieldLabelStyle}>{t('gate.phone')}</label>
          <input
            type="tel"
            value={phoneRaw}
            onChange={onPhoneChange}
            autoComplete="tel"
            inputMode="tel"
            placeholder="(514) 555-1234"
            required
            style={inputStyle}
            disabled={submitting}
          />

          {error && (
            <div
              role="alert"
              style={{
                color: '#ff7575',
                fontSize: 12.5,
                marginTop: 4,
                marginBottom: 6,
                textAlign: 'center'
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            style={{
              marginTop: 12,
              opacity: submitting ? 0.65 : 1,
              cursor: submitting ? 'wait' : 'pointer'
            }}
          >
            {submitting ? t('gate.submitting') : t('gate.unlock')}
          </button>
        </form>

        <p
          style={{
            fontSize: 10.5,
            lineHeight: 1.5,
            color: 'rgba(255,255,255,0.4)',
            textAlign: 'center',
            marginTop: 14,
            marginBottom: 0
          }}
        >
          {t('gate.legalFootnote')}{' '}
          <a href="/privacy" style={{ color: '#C9A84C', textDecoration: 'underline' }}>
            {t('welcome.privacyLink')}
          </a>
        </p>
      </div>
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'rgba(255,255,255,0.55)',
  marginTop: 10,
  marginBottom: 6
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#000',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 10,
  padding: '11px 13px',
  fontSize: 15,
  outline: 'none',
  fontFamily: 'inherit'
};

/* -------------------- gate-state helpers (exported) -------------------- */

// v5.1.1 — moved from a single "unlocked today" boolean to a daily
// COUNTER so we can enforce "max N simulations per day" while still
// only requiring the user to identify themselves once.
//
// Storage layout (America/Toronto day-bucketed):
//   simfacemd.sims.YYYY-MM-DD          → "<count>:<leadId>"
//   (legacy v5.1.0)  simfacemd.unlocked.YYYY-MM-DD → "<leadId>"  (auto-migrated)
//
// We expose:
//   - DAILY_SIM_LIMIT          numeric cap
//   - todayKey()               canonical key for the current day
//   - isUnlockedToday()        true once the visitor has identified themselves
//   - getSimsToday()           how many sim results they've viewed today
//   - isAtDailyLimit()         true when count ≥ DAILY_SIM_LIMIT
//   - markUnlockedToday(id)    first unlock → sets count to max(count,1)
//   - incrementSimsToday()     +1 each time a fresh result is rendered

export const DAILY_SIM_LIMIT = 4;

const STORAGE_PREFIX = 'simfacemd.sims.';
const LEGACY_PREFIX = 'simfacemd.unlocked.';
// v5.1.4 — stash the HMAC unlock token (issued by /api/leads/submit)
// so repeat sims in the same day can hit /api/simulate without
// re-identifying. Token lifetime matches MAX_TOKEN_AGE_SEC (24h).
const TOKEN_STORAGE_KEY = 'simfacemd.unlock_token';

function dayStamp(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(now);
}

/** Today's key in America/Toronto, e.g. "simfacemd.sims.2026-05-09" */
export function todayKey(now = new Date()): string {
  return `${STORAGE_PREFIX}${dayStamp(now)}`;
}

/** Internal: read "count:leadId" tuple, with legacy migration. */
function readToday(): { count: number; leadId: string } {
  if (typeof window === 'undefined') return { count: 0, leadId: '' };
  try {
    const k = todayKey();
    let raw = window.localStorage.getItem(k);

    // Migrate v5.1.0 single-flag entry to the counter format.
    if (!raw) {
      const legacyKey = `${LEGACY_PREFIX}${dayStamp()}`;
      const legacy = window.localStorage.getItem(legacyKey);
      if (legacy) {
        // v5.1.2: legacy was "unlocked once = at least one sim done"
        // so seed count=1 + carry the lead id forward.
        raw = `1:${legacy}`;
        window.localStorage.setItem(k, raw);
        window.localStorage.removeItem(legacyKey);
      }
    }

    if (!raw) return { count: 0, leadId: '' };
    const [c, ...rest] = raw.split(':');
    const count = Math.max(0, parseInt(c, 10) || 0);
    return { count, leadId: rest.join(':') };
  } catch {
    return { count: 0, leadId: '' };
  }
}

function writeToday(count: number, leadId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(todayKey(), `${count}:${leadId}`);
    // Clean up old day buckets and legacy keys so localStorage stays small.
    const keepKey = todayKey();
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if ((k.startsWith(STORAGE_PREFIX) || k.startsWith(LEGACY_PREFIX)) && k !== keepKey) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

/** True if the visitor has already identified themselves today. */
export function isUnlockedToday(): boolean {
  // v5.1.2: identity is tracked via the lead-id stash (non-empty after
  // markUnlockedToday), independent of the simulation counter.
  return readToday().leadId.length > 0;
}

/** How many simulation results the visitor has viewed today. */
export function getSimsToday(): number {
  return readToday().count;
}

/** True when the visitor has hit the daily cap and shouldn't run another sim. */
export function isAtDailyLimit(): boolean {
  return readToday().count >= DAILY_SIM_LIMIT;
}

/**
 * Records that the visitor has identified themselves today. The lead
 * id is stored alongside the counter so future sim renders inherit
 * it.
 *
 * v5.1.2: we DO NOT bump the count here. The result render owns the
 * increment via incrementSimsToday() so we get exactly one bump per
 * successful sim regardless of whether the visitor unlocked moments
 * ago or already unlocked earlier today.
 */
export function markUnlockedToday(leadId: number): void {
  const cur = readToday();
  // Keep current count, just stash the lead id (or a marker).
  writeToday(cur.count, String(leadId || cur.leadId || '1'));
}

/**
 * Persist the server-issued HMAC unlock token so repeat visits today
 * can call /api/simulate without re-identifying.
 */
export function setUnlockToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Read the stashed HMAC unlock token (or null). */
export function getUnlockToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Bump the counter for each NEW simulation result the visitor sees
 * after the first one. Returns the new count. No-op past the cap.
 */
export function incrementSimsToday(): number {
  const cur = readToday();
  if (cur.count >= DAILY_SIM_LIMIT) return cur.count;
  const next = cur.count + 1;
  writeToday(next, cur.leadId);
  return next;
}
