/**
 * v5.1.4 — Server-side gate for /api/simulate.
 *
 * We sign a short-lived HMAC-SHA256 token from /api/leads/submit upon
 * a successful identification, then require it on /api/simulate via
 * the `x-unlock-token` header. This makes the rule "no AI credits
 * burned before identification" cryptographically true — even direct
 * curl/bot hits on /api/simulate bounce with 401 without a valid
 * token.
 *
 * Token format (compact, no JWT lib):
 *
 *   <leadId>.<issuedAtSec>.<sessionId>.<base64urlHmac>
 *
 * Verification:
 *   - HMAC matches with UNLOCK_SECRET (or ADMIN_KEY as fallback secret)
 *   - issuedAt within MAX_TOKEN_AGE_SEC of now
 *   - leadId is non-empty
 *
 * The lead id, session id, and timestamp are all included verbatim so
 * we can audit-trail back to lead_unlocks rows if needed. No DB
 * lookup is required at verification time — keeps /api/simulate cold-
 * start cost minimal.
 */
import crypto from 'crypto';

const MAX_TOKEN_AGE_SEC = 60 * 60 * 24; // 24h — generous, matches the daily simulation window.

function secret(): string {
  // Prefer a dedicated UNLOCK_SECRET if provided. Otherwise reuse
  // ADMIN_KEY so a single env var keeps everything signed. We refuse
  // to sign with empty material — caller should treat that as a server
  // misconfiguration.
  return process.env.UNLOCK_SECRET || process.env.ADMIN_KEY || '';
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Issue a fresh unlock token for the given lead. Returns null if the
 * server isn't configured with a signing secret (caller should still
 * let the user past the gate, just without server-side simulate
 * gating).
 */
export function issueUnlockToken(input: {
  leadId: number | string;
  sessionId: string;
}): string | null {
  const key = secret();
  if (!key) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const leadId = String(input.leadId || '0');
  const sessionId = String(input.sessionId || '').replace(/[^A-Za-z0-9_-]/g, '');
  const payload = `${leadId}.${issuedAt}.${sessionId}`;
  const sig = b64url(
    crypto.createHmac('sha256', key).update(payload).digest()
  );
  return `${payload}.${sig}`;
}

type VerifyResult =
  | { ok: true; leadId: string; sessionId: string; issuedAt: number }
  | { ok: false; reason: string };

/**
 * Verify a token from the `x-unlock-token` header. Returns ok=false
 * with a short reason on any failure — never throws.
 */
export function verifyUnlockToken(token: string | null | undefined): VerifyResult {
  if (!token) return { ok: false, reason: 'missing' };
  const key = secret();
  if (!key) {
    // Server has no signing secret configured. Refuse — caller will
    // 401 the request. The operator should set ADMIN_KEY (or
    // UNLOCK_SECRET) in Vercel before the gate works.
    return { ok: false, reason: 'server_no_secret' };
  }

  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };
  const [leadId, tsStr, sessionId, sig] = parts;
  if (!leadId || !tsStr || !sig) return { ok: false, reason: 'malformed' };

  const payload = `${leadId}.${tsStr}.${sessionId}`;
  const expected = b64url(
    crypto.createHmac('sha256', key).update(payload).digest()
  );
  // Constant-time compare.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_sig' };
  }

  const ts = parseInt(tsStr, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_ts' };
  const ageSec = Math.floor(Date.now() / 1000) - ts;
  if (ageSec < -60 || ageSec > MAX_TOKEN_AGE_SEC) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, leadId, sessionId, issuedAt: ts };
}
