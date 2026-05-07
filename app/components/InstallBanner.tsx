'use client';

/**
 * InstallBanner — context-aware "save this to your phone" prompt.
 *
 * Why this exists in five variants and not three:
 *
 *   Apple only allows "Add to Home Screen" from **Safari** on iOS.
 *   Third-party iOS browsers (Chrome/Firefox/Edge — all WebKit
 *   skins) cannot install a PWA at all. Apple removed
 *   "Add to Home Screen" from those browsers' share sheets too.
 *   So if a user lands on the app in iOS Chrome, no in-page
 *   button can install it — the only path is to open the page
 *   in Safari first. We support that with the `x-safari-https://`
 *   URL scheme, which Safari registered specifically for this.
 *
 * Variants:
 *
 *   • android        → fires the native beforeinstallprompt
 *   • ios-safari     → instructs to use Share → Add to Home Screen,
 *                       arrow placement is version-aware (iOS 15+ has
 *                       Share at the bottom-right of the URL bar at
 *                       the bottom of the screen; older iOS had it
 *                       at the top — but iOS 15+ is virtually all
 *                       of the install base in 2026)
 *   • ios-other      → "Open in Safari" handoff button
 *   • desktop        → Ctrl/⌘+D bookmark hint
 *   • none           → already standalone, render nothing
 *
 * The banner can be opened on demand via the exported helper so the
 * welcome screen's header can offer a persistent "Save to phone"
 * button even after the auto-banner has been dismissed.
 */

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';

type Variant = 'android' | 'ios-safari' | 'ios-other' | 'desktop' | 'none';

// Chrome's beforeinstallprompt isn't in lib.dom.d.ts yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// One key per device class so we don't suppress the iOS prompt because
// the user dismissed the desktop banner on their laptop earlier, etc.
const STORAGE_KEYS: Record<Exclude<Variant, 'none'>, string> = {
  android: 'simfacemd:install-banner:android',
  'ios-safari': 'simfacemd:install-banner:ios-safari',
  'ios-other': 'simfacemd:install-banner:ios-other',
  desktop: 'simfacemd:install-banner:desktop'
};

// ---- Manual-open hook -----------------------------------------------------
// The welcome header's "Save to phone" button calls this to force the
// banner open even if the user previously dismissed it. We use a tiny
// custom-event channel so the header doesn't need to lift state.
const MANUAL_OPEN_EVENT = 'simfacemd:install-banner:open';

export function openInstallBanner() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MANUAL_OPEN_EVENT));
}

/**
 * Detect whether the page is running as an installed PWA. iOS exposes
 * navigator.standalone; everyone else uses the display-mode media query.
 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean })
    .standalone === true;
  const mqStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
  return iosStandalone || mqStandalone;
}

function detectVariant(): Variant {
  if (typeof window === 'undefined') return 'none';
  if (isStandalone()) return 'none';

  const ua = window.navigator.userAgent;

  // iPadOS 13+ reports as Mac with touch — catch that case.
  const isIPad =
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && (navigator as Navigator).maxTouchPoints > 1);
  const isIOS = /iPhone|iPod/i.test(ua) || isIPad;

  if (isIOS) {
    // CriOS = Chrome on iOS. FxiOS = Firefox on iOS. EdgiOS = Edge on iOS.
    // Brave on iOS reports as Safari (no distinguishing token), so it
    // gets bucketed with Safari — that's correct, Brave on iOS DOES
    // support Add to Home Screen via Safari's WebKit shell.
    const isThirdPartyIOS = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/i.test(ua);
    return isThirdPartyIOS ? 'ios-other' : 'ios-safari';
  }

  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export default function InstallBanner() {
  const { t } = useI18n();

  const [variant, setVariant] = useState<Variant>('none');
  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  // Tracks whether the banner is being shown because of manual open
  // (persistent "Save to phone" button) vs auto-reveal. Manual opens
  // bypass the localStorage dismissal flag so the user can always
  // bring the banner back.
  const [manualOpen, setManualOpen] = useState(false);

  // Decide variant once on the client.
  useEffect(() => {
    const v = detectVariant();
    setVariant(v);
  }, []);

  // Capture Chrome/Android's install prompt as soon as the browser fires it.
  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      try {
        localStorage.setItem(STORAGE_KEYS.android, 'dismissed');
      } catch {}
      setVisible(false);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Listen for manual "open me now" requests from the header button.
  useEffect(() => {
    function onOpen() {
      setManualOpen(true);
      setVisible(true);
    }
    window.addEventListener(MANUAL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(MANUAL_OPEN_EVENT, onOpen);
  }, []);

  // 3-second delayed auto-reveal. Manual opens skip this entirely.
  useEffect(() => {
    if (variant === 'none') return;
    if (manualOpen) return;
    // Respect a previous dismissal for this device class.
    try {
      if (localStorage.getItem(STORAGE_KEYS[variant]) === 'dismissed') return;
    } catch {
      /* private mode → ignore */
    }
    // Android: only auto-show once we have an install event in hand.
    // Without it the CTA can't do anything, so we'd just be teasing.
    if (variant === 'android' && installEvent === null) return;

    const id = window.setTimeout(() => setVisible(true), 3000);
    return () => window.clearTimeout(id);
  }, [variant, installEvent, manualOpen]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setManualOpen(false);
    if (variant === 'none') return;
    try {
      localStorage.setItem(STORAGE_KEYS[variant], 'dismissed');
    } catch {}
  }, [variant]);

  const handleAndroidInstall = useCallback(async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === 'accepted' || outcome === 'dismissed') {
        try {
          localStorage.setItem(STORAGE_KEYS.android, 'dismissed');
        } catch {}
        setVisible(false);
        setInstallEvent(null);
      }
    } catch {
      setVisible(false);
    }
  }, [installEvent]);

  // Open the current page in Safari via the x-safari-https:// scheme.
  // This is Apple's officially-blessed way to hand off from a third-
  // party iOS browser to Safari. The user lands on the same URL,
  // already in Safari, ready to use the real Add-to-Home-Screen flow.
  const handleOpenInSafari = useCallback(() => {
    const here = window.location.href;
    // Strip the protocol and rebuild with the x-safari-https:// scheme.
    // (Works for http and https — we only ever serve https in prod.)
    const stripped = here.replace(/^https?:\/\//, '');
    const safariUrl = `x-safari-https://${stripped}`;
    // Use location.href so we don't trip popup blockers; the iOS OS
    // intercepts this scheme and opens Safari to the same page.
    window.location.href = safariUrl;
  }, []);

  if (variant === 'none' || !visible) return null;

  if (variant === 'android') {
    return (
      <AndroidBanner
        onInstall={handleAndroidInstall}
        onDismiss={dismiss}
        cta={t('install.android.cta')}
        subtitle={t('install.android.subtitle')}
        dismissLabel={t('install.dismiss')}
      />
    );
  }

  if (variant === 'ios-safari') {
    return (
      <IOSSafariBanner
        title={t('install.ios.title')}
        body={t('install.ios.body')}
        dismissLabel={t('install.dismiss')}
        onDismiss={dismiss}
      />
    );
  }

  if (variant === 'ios-other') {
    return (
      <IOSOtherBanner
        title={t('install.iosOther.title')}
        body={t('install.iosOther.body')}
        cta={t('install.iosOther.cta')}
        dismissLabel={t('install.dismiss')}
        onOpenInSafari={handleOpenInSafari}
        onDismiss={dismiss}
      />
    );
  }

  return (
    <DesktopBanner
      body={t('install.desktop.body')}
      dismissLabel={t('install.dismiss')}
      onDismiss={dismiss}
    />
  );
}

/* ---------------------------------------------------------------- */
/*  Variant: Android — bottom sheet with primary gold CTA            */
/* ---------------------------------------------------------------- */

function AndroidBanner({
  onInstall,
  onDismiss,
  cta,
  subtitle,
  dismissLabel
}: {
  onInstall: () => void;
  onDismiss: () => void;
  cta: string;
  subtitle: string;
  dismissLabel: string;
}) {
  return (
    <div role="dialog" aria-label={cta} style={sheetWrapperStyle} className="animate-slide-up">
      <div style={sheetCardStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sheetTitleStyle}>
            <span aria-hidden="true" style={{ marginRight: 8 }}>📲</span>
            {cta}
          </div>
          <div style={sheetSubtitleStyle}>{subtitle}</div>
        </div>
        <button type="button" onClick={onInstall} style={installButtonStyle} aria-label={cta}>
          Install
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          style={closeButtonStyle}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Variant: iOS Safari — bottom sheet with arrow                    */
/* ---------------------------------------------------------------- */

function IOSSafariBanner({
  title,
  body,
  dismissLabel,
  onDismiss
}: {
  title: string;
  body: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div role="dialog" aria-label={title} style={sheetWrapperStyle} className="animate-slide-up">
      <div style={{ ...sheetCardStyle, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sheetTitleStyle}>
            <span aria-hidden="true" style={{ marginRight: 8 }}>📲</span>
            {title}
          </div>
          <div style={{ ...sheetSubtitleStyle, marginTop: 4 }}>
            {/* Inline mini iOS Share glyph for instant recognition. */}
            {body.split(/(Share|Partager)/).map((chunk, i) => {
              if (chunk === 'Share' || chunk === 'Partager') {
                return (
                  <span key={i} style={{ whiteSpace: 'nowrap' }}>
                    {chunk} <ShareGlyph />
                  </span>
                );
              }
              return <span key={i}>{chunk}</span>;
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          style={{ ...closeButtonStyle, alignSelf: 'flex-start' }}
        >
          ✕
        </button>
      </div>
      {/* Arrow points down toward iOS Safari's bottom toolbar where the
          Share icon lives in iOS 15+. iOS Safari has shipped with the
          bottom URL bar layout since 2021, so this is correct for ~99%
          of users — the small tail of users on top-bar layout will
          still get the message from the inline copy. */}
      <div style={arrowWrapStyle} aria-hidden="true">
        <DownArrow />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Variant: iOS Chrome / Firefox / Edge — "open in Safari" handoff  */
/* ---------------------------------------------------------------- */

function IOSOtherBanner({
  title,
  body,
  cta,
  dismissLabel,
  onOpenInSafari,
  onDismiss
}: {
  title: string;
  body: string;
  cta: string;
  dismissLabel: string;
  onOpenInSafari: () => void;
  onDismiss: () => void;
}) {
  return (
    <div role="dialog" aria-label={title} style={sheetWrapperStyle} className="animate-slide-up">
      <div style={sheetCardStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sheetTitleStyle}>
            <span aria-hidden="true" style={{ marginRight: 8 }}>📲</span>
            {title}
          </div>
          <div style={sheetSubtitleStyle}>{body}</div>
        </div>
        <button type="button" onClick={onOpenInSafari} style={installButtonStyle} aria-label={cta}>
          {cta}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          style={closeButtonStyle}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg
      width="14"
      height="16"
      viewBox="0 0 14 16"
      fill="none"
      style={{ display: 'inline-block', verticalAlign: '-3px' }}
    >
      <path
        d="M7 1v9M7 1l-3 3M7 1l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 7H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownArrow() {
  return (
    <svg
      width="22"
      height="34"
      viewBox="0 0 22 34"
      fill="none"
      className="animate-bounce-soft"
      style={{ display: 'block' }}
    >
      <path d="M11 2v26" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M3 22l8 8 8-8"
        stroke="#C9A84C"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------- */
/*  Variant: Desktop — slim top bar w/ Ctrl/⌘+D hint                 */
/* ---------------------------------------------------------------- */

function DesktopBanner({
  body,
  dismissLabel,
  onDismiss
}: {
  body: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div role="status" style={topBarStyle} className="animate-slide-down">
      <span aria-hidden="true" style={{ marginRight: 10 }}>💾</span>
      <span style={topBarTextStyle}>{body}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        style={topBarCloseStyle}
      >
        ✕
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Inline styles                                                     */
/* ---------------------------------------------------------------- */

const sheetWrapperStyle: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
  zIndex: 60,
  pointerEvents: 'none'
};

const sheetCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 14px 14px 16px',
  borderRadius: 16,
  background: 'rgba(10, 10, 10, 0.92)',
  border: '1px solid rgba(201, 168, 76, 0.35)',
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  color: '#fff',
  pointerEvents: 'auto',
  fontFamily: "var(--font-inter), Inter, system-ui, -apple-system, sans-serif"
};

const sheetTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.1,
  lineHeight: 1.25
};

const sheetSubtitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: 'rgba(255,255,255,0.7)',
  marginTop: 2,
  lineHeight: 1.35
};

const installButtonStyle: React.CSSProperties = {
  flex: '0 0 auto',
  padding: '10px 16px',
  borderRadius: 999,
  background: '#C9A84C',
  color: '#000',
  fontWeight: 600,
  fontSize: 13,
  border: 'none',
  cursor: 'pointer',
  letterSpacing: 0.2,
  whiteSpace: 'nowrap'
};

const closeButtonStyle: React.CSSProperties = {
  flex: '0 0 auto',
  width: 28,
  height: 28,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.7)',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1
};

const arrowWrapStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: 6,
  pointerEvents: 'none',
  filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))'
};

const topBarStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '10px 16px',
  background:
    'linear-gradient(180deg, rgba(15,15,15,0.94) 0%, rgba(10,10,10,0.92) 100%)',
  borderBottom: '1px solid rgba(201,168,76,0.28)',
  boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  color: 'rgba(255,255,255,0.92)',
  fontFamily: "var(--font-inter), Inter, system-ui, -apple-system, sans-serif",
  fontSize: 13,
  letterSpacing: 0.1
};

const topBarTextStyle: React.CSSProperties = {
  flex: '0 1 auto',
  textAlign: 'center'
};

const topBarCloseStyle: React.CSSProperties = {
  position: 'absolute',
  right: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 26,
  height: 26,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.65)',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1
};
