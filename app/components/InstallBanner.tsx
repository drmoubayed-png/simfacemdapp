'use client';

/**
 * InstallBanner — context-aware "save this to your phone" prompt.
 *
 * Three variants, picked at mount based on UA + standalone state:
 *
 *   • Android / Chromium  → captures the `beforeinstallprompt` event
 *                           and shows a CTA that fires the native
 *                           Add-to-Home-Screen prompt on tap.
 *   • iOS Safari          → no install API exists; show a bottom-sheet
 *                           with a tiny animated arrow pointing at the
 *                           browser's Share button + plain instructions.
 *   • Desktop browsers    → slim top bar with the Ctrl/⌘+D bookmark hint.
 *   • Already installed   → render nothing.
 *
 * The banner waits 3 s after mount before appearing (so it doesn't
 * fight the hero) and respects a localStorage flag so dismiss/install
 * is sticky across visits.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n';

type Variant = 'android' | 'ios' | 'desktop' | 'none';

// Chrome's beforeinstallprompt isn't in lib.dom.d.ts yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// One key per device class so we don't suppress the iOS prompt because
// the user dismissed the desktop banner on their laptop earlier, etc.
const STORAGE_KEYS: Record<Exclude<Variant, 'none'>, string> = {
  android: 'simfacemd:install-banner:android',
  ios: 'simfacemd:install-banner:ios',
  desktop: 'simfacemd:install-banner:desktop'
};

/**
 * Detect whether the page is running as an installed PWA. iOS exposes
 * navigator.standalone; everyone else uses the display-mode media query.
 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari property — only present when launched from home screen.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean })
    .standalone === true;
  const mqStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
  return iosStandalone || mqStandalone;
}

function detectVariant(): Variant {
  if (typeof window === 'undefined') return 'none';
  if (isStandalone()) return 'none';

  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as Mac with touch — catch that case too.
  const isIPad =
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(ua) && (navigator as Navigator).maxTouchPoints > 1);
  const isIOS = /iPhone|iPod/i.test(ua) || isIPad;
  if (isIOS) return 'ios';

  // Treat anything with a touch-coarse pointer + Android as "android".
  // The actual install affordance still requires beforeinstallprompt;
  // we return 'android' here and the component decides whether to
  // render the CTA based on whether the event fired.
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) return 'android';

  return 'desktop';
}

export default function InstallBanner() {
  const { t } = useI18n();

  const [variant, setVariant] = useState<Variant>('none');
  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  // Decide variant once on the client.
  useEffect(() => {
    const v = detectVariant();
    if (v === 'none') return;

    // Respect previous dismissal / install for THIS device class.
    try {
      if (localStorage.getItem(STORAGE_KEYS[v]) === 'dismissed') return;
    } catch {
      /* private mode → ignore, just show */
    }

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

  // 3-second delayed reveal so the banner doesn't compete with the hero.
  useEffect(() => {
    if (variant === 'none') return;
    // For Android, only show once we actually have an install event in
    // hand — otherwise the CTA would do nothing. If the event never
    // arrives (e.g. Samsung Internet, FF Android), we stay hidden.
    const shouldShow =
      variant === 'android' ? installEvent !== null : true;
    if (!shouldShow) return;

    const id = window.setTimeout(() => setVisible(true), 3000);
    return () => window.clearTimeout(id);
  }, [variant, installEvent]);

  const dismiss = useCallback(() => {
    setVisible(false);
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
        // Either way we stop nagging — accepted persists install,
        // dismissed means the user said no.
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

  // Don't even mount visuals when we're hidden — keeps the welcome
  // screen's centered hero math stable.
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

  if (variant === 'ios') {
    return (
      <IOSBanner
        title={t('install.ios.title')}
        body={t('install.ios.body')}
        dismissLabel={t('install.dismiss')}
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
    <div
      role="dialog"
      aria-label={cta}
      style={sheetWrapperStyle}
      className="animate-slide-up"
    >
      <div style={sheetCardStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sheetTitleStyle}>
            <span aria-hidden="true" style={{ marginRight: 8 }}>
              📲
            </span>
            {cta}
          </div>
          <div style={sheetSubtitleStyle}>{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={onInstall}
          style={installButtonStyle}
          aria-label={cta}
        >
          {/* Short label so the button doesn't wrap on narrow phones */}
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
/*  Variant: iOS — bottom sheet w/ animated arrow pointing down      */
/* ---------------------------------------------------------------- */

function IOSBanner({
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
    <div
      role="dialog"
      aria-label={title}
      style={sheetWrapperStyle}
      className="animate-slide-up"
    >
      <div style={{ ...sheetCardStyle, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sheetTitleStyle}>
            <span aria-hidden="true" style={{ marginRight: 8 }}>
              📲
            </span>
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
      {/* Animated arrow pointing toward the iOS toolbar at the bottom
          of the viewport. Sits BELOW the card so it visually "leaves"
          the banner and points at the OS chrome. */}
      <div style={arrowWrapStyle} aria-hidden="true">
        <DownArrow />
      </div>
    </div>
  );
}

function ShareGlyph() {
  // iOS Share icon: square with arrow up. Inline SVG so it inherits
  // currentColor and the gold accent reads against the dark sheet.
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
      <path
        d="M11 2v26"
        stroke="#C9A84C"
        strokeWidth="2"
        strokeLinecap="round"
      />
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
    <div
      role="status"
      style={topBarStyle}
      className="animate-slide-down"
    >
      <span aria-hidden="true" style={{ marginRight: 10 }}>
        💾
      </span>
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
//
// Inline styles (rather than Tailwind classes) so this component is
// self-contained and the banner's brand styling can't drift if the
// rest of the app re-themes. Colors & typography mirror the existing
// black/gold palette + Inter UI font.

const sheetWrapperStyle: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
  zIndex: 60,
  pointerEvents: 'none' // children opt back in, so the wrapper doesn't block
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
  fontFamily:
    "var(--font-inter), Inter, system-ui, -apple-system, sans-serif"
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
  letterSpacing: 0.2
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
  // Tilt slightly so the arrow looks like it's pointing at the actual
  // share button (centered in iOS Safari's bottom toolbar).
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
  fontFamily:
    "var(--font-inter), Inter, system-ui, -apple-system, sans-serif",
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
