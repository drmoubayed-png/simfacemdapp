'use client';

/**
 * Lead-tracking client.
 *
 * Sends one event per user action to /api/track, where it's persisted to
 * the leads table. Designed to be:
 *   • Fire-and-forget — never blocks the UI
 *   • Privacy-preserving — no names, emails, photos, or device IDs
 *   • Survives navigation — uses navigator.sendBeacon when available so
 *     events fired during link clicks (e.g. book_clicked → window.open)
 *     still reach the server even if the page is unloaded
 *
 * The server adds the IP-derived city/region/country at write time. The
 * client only sends the session ID + event name + small payload of
 * non-PII context (procedure, clinic, routing reason, distance).
 */

export type TrackEventName =
  | 'simulation_completed'
  | 'booking_shown'
  | 'book_clicked'
  | 'website_clicked'
  | 'share_clicked';

export type TrackPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

const SESSION_KEY = 'simfacemd:session_id';

/**
 * Get-or-create a per-tab session ID. Stored in sessionStorage so it
 * vanishes when the tab closes — no persistent cookies, no fingerprint,
 * just enough to stitch "user did A then B then C" together.
 *
 * If sessionStorage is unavailable (private mode, sandbox, etc.) we fall
 * back to a per-page-load random ID held in module memory. Events from
 * that page load still correlate; subsequent loads start fresh.
 */
let inMemorySessionId: string | null = null;

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = generateId();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    if (!inMemorySessionId) inMemorySessionId = generateId();
    return inMemorySessionId;
  }
}

function generateId(): string {
  // crypto.randomUUID is widely supported on every modern browser, but
  // we keep a fallback for very old WebViews (in-app browsers etc.).
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Fire-and-forget event dispatch. Returns void synchronously — never
 * throws, never blocks. Failures are silent (analytics should never
 * break the app).
 */
export function trackEvent(name: TrackEventName, payload: TrackPayload = {}) {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    name,
    session_id: getSessionId(),
    ts: Date.now(),
    payload,
    // Page context — purely for debugging / segmentation later.
    referrer: document.referrer || null,
    lang: document.documentElement.lang || null
  });

  // sendBeacon survives navigation (critical for book_clicked which
  // immediately opens an external URL). Fall back to fetch() if not
  // available or if it returned false (some browsers refuse > 64 KB).
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/track', blob);
      if (ok) return;
    }
  } catch {
    /* fall through to fetch */
  }

  // fetch fallback — keepalive lets the request finish even if the page
  // unloads moments later.
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    });
  } catch {
    /* swallow — analytics must never break the app */
  }
}
