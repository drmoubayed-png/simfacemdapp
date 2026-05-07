'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { flushSync } from 'react-dom';
import InstallBanner from './components/InstallBanner';
import {
  CLINICS,
  formatDistance,
  sortClinicsByDistance,
  type Clinic
} from './lib/clinics';
import { useLocation } from './lib/useLocation';
import {
  formatPrice,
  PROCEDURE_IDS,
  PROCEDURE_IS_PUBLISHED_PRICE,
  PROCEDURE_STARTING_PRICE,
  useI18n,
  type Lang,
  type ProcedureId
} from './lib/i18n';

/* ---------------------------------------------------------------- */
/*  Types                                                            */
/* ---------------------------------------------------------------- */

type Screen = 'welcome' | 'step1' | 'step2' | 'result';

/**
 * Display-ready procedure data resolved at render time from the i18n
 * dictionary plus the static numeric pricing table. The previous
 * version stored copy in this object directly — we now derive it from
 * the active language so the UI updates instantly when the user
 * toggles EN/FR.
 */
type Procedure = {
  id: ProcedureId;
  name: string;
  desc: string;
  // Localized "Starting at $X CAD" / "À partir de X $ CA". Used on the
  // result page only — pricing is intentionally hidden on the picker.
  cadDisplay: string;
  // Treatment time + final-result timeline. Shown ONLY on the result
  // page (per Dr. Moubayed's spec: keep the picker clean).
  treatmentTime: string;
};

/** Build the localized procedure list for the active language. */
function useProcedures(): Procedure[] {
  const { t, lang } = useI18n();
  return PROCEDURE_IDS.map((id) => ({
    id,
    name: t(`proc.${id}.name`),
    desc: t(`proc.${id}.desc`),
    cadDisplay:
      t('price.startingAt', {
        amount: formatPrice(PROCEDURE_STARTING_PRICE[id], lang)
      }) +
      ' ' +
      t('result.cadSuffix'),
    treatmentTime: t(`proc.${id}.timing`)
  }));
}

/* ---------------------------------------------------------------- */
/*  Logo                                                             */
/* ---------------------------------------------------------------- */

function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  // "Sim" italic word lockup + the official Clinique Face MD gold logo.
  // The Face MD wordmark is served from /brand/face-md-logo-white.png
  // (RGBA, 440x64, recoloured to pure white from the official
  // cliniquefacemd.com gold lockup so the entire "Sim FACE MD" lockup
  // reads as a single white mark on the black UI). We never alter the
  // letterforms — only scale them.
  const sizeMap = {
    sm: { sim: '24px', logoH: 18, gap: 6 },
    md: { sim: '36px', logoH: 26, gap: 8 },
    lg: { sim: '56px', logoH: 40, gap: 10 }
  } as const;
  const s = sizeMap[size];

  return (
    <div
      className="flex items-center select-none-ui"
      style={{ gap: s.gap }}
      aria-label="Sim Face MD"
    >
      <span
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontWeight: 500,
          color: '#FFFFFF',
          fontSize: s.sim,
          lineHeight: 1,
          // Optical: nudge "Sim" down so its baseline aligns with the
          // logo wordmark cap-height instead of its own descender line.
          transform: 'translateY(2px)'
        }}
      >
        Sim
      </span>
      <img
        src="/brand/face-md-logo-white.png"
        alt=""
        height={s.logoH}
        style={{ height: s.logoH, width: 'auto', display: 'block' }}
        draggable={false}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Main page component                                              */
/* ---------------------------------------------------------------- */

export default function HomePage() {
  const { t } = useI18n();
  const procedures = useProcedures();

  const [screen, setScreen] = useState<Screen>('welcome');
  const [selectedProcedure, setSelectedProcedure] =
    useState<ProcedureId | null>(null);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [resultPhoto, setResultPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMeta =
    procedures.find((p) => p.id === selectedProcedure) || null;

  const reset = useCallback(() => {
    setScreen('welcome');
    setSelectedProcedure(null);
    setUserPhoto(null);
    setResultPhoto(null);
    setIsLoading(false);
    setError(null);
  }, []);

  const handleSimulate = useCallback(async () => {
    if (!userPhoto || !selectedProcedure) return;
    setError(null);
    setResultPhoto(null);
    setIsLoading(true);
    setScreen('result');

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: userPhoto,
          procedure: selectedProcedure
        })
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // Server-side errors are emitted in English. We translate the
        // generic fallback ourselves so French users never see English
        // copy unless the API surfaced something unexpected (and even
        // then, the message is short and readable in both languages).
        throw new Error(j?.error || t('error.fallbackMessage'));
      }

      const data = (await res.json()) as { resultUrl: string };
      setResultPhoto(data.resultUrl);
    } catch (err: any) {
      setError(err?.message || t('error.fallbackMessage'));
    } finally {
      setIsLoading(false);
    }
  }, [userPhoto, selectedProcedure, t]);

  return (
    <main className="min-h-screen bg-bg flex flex-col items-center">
      <div className="w-full max-w-[480px] px-5 pb-10 flex-1 flex flex-col">
        {screen === 'welcome' && <WelcomeScreen onStart={() => setScreen('step1')} />}

        {screen === 'step1' && (
          <ChooseProcedureScreen
            procedures={procedures}
            selected={selectedProcedure}
            onSelect={setSelectedProcedure}
            onBack={() => setScreen('welcome')}
            onContinue={() => setScreen('step2')}
          />
        )}

        {screen === 'step2' && selectedMeta && (
          <PhotoScreen
            procedure={selectedMeta}
            userPhoto={userPhoto}
            onPhotoChange={setUserPhoto}
            onBack={() => setScreen('step1')}
            onContinue={handleSimulate}
          />
        )}

        {screen === 'result' && selectedMeta && (
          <ResultScreen
            procedure={selectedMeta}
            userPhoto={userPhoto}
            resultPhoto={resultPhoto}
            isLoading={isLoading}
            error={error}
            onRetry={handleSimulate}
            onReset={reset}
          />
        )}
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- */
/*  Welcome screen                                                   */
/* ---------------------------------------------------------------- */

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const subtitleLines = t('welcome.subtitle').split('\n');

  return (
    <section className="flex-1 flex flex-col min-h-[100dvh] py-12 animate-fade-up">
      {/* Header row — elevated above the centered hero so the language
          toggle stays clickable. The hero's negative margin used to pull
          UP and intercept pointer events on the toggle (caught in v4.3
          QA: the FR pill silently did nothing). Fix: give the header
          row position:relative + z-index, and keep pointer events off
          the centered text block (text doesn't need clicks). */}
      <div
        className="pt-2 flex items-center justify-between"
        style={{ position: 'relative', zIndex: 2 }}
      >
        <Logo size="md" />
        <LanguageToggle />
      </div>

      <div
        className="flex-1 flex flex-col justify-center text-center -mt-6"
        style={{ pointerEvents: 'none' }}
      >
        <h1
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 'clamp(44px, 12vw, 60px)',
            lineHeight: 1.05,
            letterSpacing: '-0.01em'
          }}
          className="mb-5"
        >
          {t('welcome.headlineLine1')}
          <br />
          {t('welcome.headlineLine2')}
        </h1>
        <p
          className="text-[15px] mx-auto"
          style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 320 }}
        >
          {subtitleLines.map((line, i) => (
            <span key={i}>
              {line}
              {i < subtitleLines.length - 1 && <br />}
            </span>
          ))}
        </p>
      </div>

      <div className="space-y-4 mt-8">
        <button
          className="btn-primary"
          onClick={onStart}
          aria-label={t('welcome.cta')}
        >
          {t('welcome.cta')}
        </button>

        <div className="text-center">
          <span
            className="inline-flex items-center gap-2 text-[13px]"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            <span style={{ color: '#F5A623' }}>★</span>
            {t('welcome.ratingLine')}
          </span>
        </div>

        <p
          className="text-[11px] text-center leading-relaxed pt-2"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {t('welcome.disclaimer')}
        </p>
      </div>

      {/* Smart "save to phone" prompt. Renders nothing if already
          installed as a PWA, or if the user previously dismissed it.
          Self-positioned (fixed) — doesn't affect hero layout. */}
      <InstallBanner />
    </section>
  );
}

/* ---------------------------------------------------------------- */
/*  Language toggle                                                   */
/* ---------------------------------------------------------------- */

/**
 * Compact EN / FR pill-toggle. The active language reads bright; the
 * inactive language sits at low opacity so it doesn't compete with the
 * brand wordmark.
 */
function LanguageToggle() {
  const { lang, setLang } = useI18n();
  const baseStyle: CSSProperties = {
    fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
    fontSize: 11,
    letterSpacing: '0.18em',
    fontWeight: 500,
    textTransform: 'uppercase',
    background: 'transparent',
    border: 'none',
    padding: '6px 8px',
    cursor: 'pointer',
    transition: 'color 160ms ease'
  };
  const activeColor = '#FFFFFF';
  const inactiveColor = 'rgba(255,255,255,0.35)';
  return (
    <div
      role="group"
      aria-label="Language"
      className="select-none-ui flex items-center"
      style={{
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 999,
        padding: '2px',
        background: 'rgba(255,255,255,0.02)'
      }}
    >
      <button
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        style={{
          ...baseStyle,
          color: lang === 'en' ? activeColor : inactiveColor,
          borderRadius: 999,
          background: lang === 'en' ? 'rgba(201,168,76,0.10)' : 'transparent'
        }}
      >
        EN
      </button>
      <button
        onClick={() => setLang('fr')}
        aria-pressed={lang === 'fr'}
        style={{
          ...baseStyle,
          color: lang === 'fr' ? activeColor : inactiveColor,
          borderRadius: 999,
          background: lang === 'fr' ? 'rgba(201,168,76,0.10)' : 'transparent'
        }}
      >
        FR
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Step 1 — Choose procedure                                        */
/* ---------------------------------------------------------------- */

function ChooseProcedureScreen({
  procedures,
  selected,
  onSelect,
  onBack,
  onContinue
}: {
  procedures: Procedure[];
  selected: ProcedureId | null;
  onSelect: (id: ProcedureId) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="pt-6 pb-6 animate-fade-up flex-1 flex flex-col">
      <Header step={1} onBack={onBack} />

      <h2
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: '34px',
          lineHeight: 1.1
        }}
        className="mt-6"
      >
        {t('step1.titleLine1')}
        <br />
        {t('step1.titleLine2')}
      </h2>
      <p
        className="text-[14px] mt-3 mb-6"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        {t('step1.subtitle')}
      </p>

      <div className="space-y-3 flex-1">
        {procedures.map((p) => {
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full text-left transition-all duration-150 active:scale-[0.98] block"
              style={{
                background: isSelected
                  ? 'rgba(201, 168, 76, 0.06)'
                  : '#0D0D0D',
                border: isSelected
                  ? '2px solid #C9A84C'
                  : '1px solid rgba(255,255,255,0.10)',
                borderRadius: 14,
                padding: isSelected ? '17px 19px' : '18px 20px',
                minHeight: 96
              }}
              aria-pressed={isSelected}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      fontFamily:
                        "var(--font-cormorant), 'Cormorant Garamond', serif",
                      fontStyle: 'italic',
                      fontWeight: 500,
                      fontSize: '24px',
                      lineHeight: 1.15,
                      color: '#FFFFFF'
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    className="text-[13px] mt-1"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    {p.desc}
                  </div>
                  {/* Pricing intentionally hidden on the picker.
                      Treatment-time + final-result timeline also
                      moved to the result page (per Dr. Moubayed's
                      v4.3 spec): keep the picker clean and let the
                      visualization sell the value first. */}
                </div>

                <div
                  className="flex-shrink-0 mt-1 flex items-center justify-center"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: isSelected
                      ? '2px solid #C9A84C'
                      : '1px solid rgba(255,255,255,0.25)',
                    background: isSelected ? '#C9A84C' : 'transparent',
                    transition: 'all 160ms ease'
                  }}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="#000"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2,6.5 5,9.5 10,3" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 sticky bottom-0 pb-2 pt-3 bg-bg">
        <button
          className="btn-primary"
          onClick={onContinue}
          disabled={!selected}
        >
          {t('common.continue')}
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/*  Step 2 — Photo                                                   */
/* ---------------------------------------------------------------- */

function PhotoScreen({
  procedure,
  userPhoto,
  onPhotoChange,
  onBack,
  onContinue
}: {
  procedure: Procedure;
  userPhoto: string | null;
  onPhotoChange: (b64: string | null) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasCameraSupport, setHasCameraSupport] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Separate input with capture="user" — used as a fallback when
  // getUserMedia fails (e.g. iOS Chrome on certain iOS builds where
  // it isn't allowed). This opens the OS native camera directly.
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // Mirror of cameraOpen accessible inside async callbacks (setTimeout)
  // without stale-closure issues.
  const cameraOpenRef = useRef(false);

  // Detect camera support without crashing on SSR
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setHasCameraSupport(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Detach from <video> too — prevents a frozen last-frame on retry.
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {}
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Open the camera. CRITICAL on iOS Safari / iOS Chrome (WebKit):
  // we MUST open the overlay AND call video.play() synchronously inside
  // the user's tap gesture — BEFORE awaiting getUserMedia. If we wait
  // for the permission prompt first, the user gesture token is gone
  // by the time play() is called, play() rejects, and the preview
  // never starts. That was the "have to cancel and retry" bug.
  //
  // Sequence:
  //   1) setCameraOpen(true)        — mounts <video>
  //   2) flush React synchronously  — so videoRef.current exists
  //   3) video.play()               — still inside the gesture
  //   4) await getUserMedia()       — permission prompt
  //   5) attach stream to <video>   — picture appears
  const openCamera = useCallback(async () => {
    setCameraError(null);

    // Step 1: open the overlay synchronously so React commits the
    // <video> element to the DOM in this same tick — keeps us inside
    // the user-gesture window. flushSync forces React 18's automatic
    // batching to commit immediately instead of deferring to a macrotask.
    flushSync(() => {
      setCameraOpen(true);
    });

    const video = videoRef.current;
    if (video) {
      // Step 2: kick off playback IMMEDIATELY — still inside the tap
      // gesture. iOS allows muted+playsinline play during a gesture
      // even on a sourceless video. Once we attach srcObject below,
      // the same <video> starts showing the camera feed without
      // needing a fresh gesture.
      // Don't await — awaiting a play() promise is itself a macrotask
      // suspension and can lose the gesture on iOS WebKit.
      video.play().catch(() => {});
    }

    // Step 4: now request camera permission.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      });
    } catch (err) {
      // Permission denied / no camera / iOS Chrome (older) — close
      // overlay and fall through to the native <input capture> path.
      setCameraOpen(false);
      setHasCameraSupport(false);
      setCameraError(null);
      // Fire the native-camera input as a graceful fallback so the user
      // still gets a way to take a selfie via the OS camera UI.
      // capture="user" hint asks iOS for the front-facing camera.
      cameraInputRef.current?.click();
      return;
    }

    streamRef.current = stream;

    // Step 5: attach the stream to the (already-playing) <video>.
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      // Some iOS versions need an explicit play() AFTER srcObject is
      // assigned. Ignore rejection — if step 3 succeeded we're fine.
      videoRef.current.play().catch(() => {});
    }

    // Watchdog: if the <video> never starts producing frames within
    // ~2.5s, the in-page preview isn't going to work on this browser.
    // Tear down and silently fall back to the native camera input so
    // the user still gets a working path to a selfie.
    setTimeout(() => {
      const v = videoRef.current;
      if (!cameraOpenRef.current) return; // user already closed it
      if (!v || v.videoWidth === 0 || v.videoHeight === 0) {
        stopCamera();
        setCameraOpen(false);
        cameraInputRef.current?.click();
      }
    }, 2500);
  }, [stopCamera]);

  const closeCamera = useCallback(() => {
    stopCamera();
    setCameraOpen(false);
    cameraOpenRef.current = false;
  }, [stopCamera]);

  // Keep cameraOpenRef in sync with state so the watchdog can read it.
  useEffect(() => {
    cameraOpenRef.current = cameraOpen;
  }, [cameraOpen]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    // Cap dimensions to keep payload small
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Mirror so the captured image matches what the user sees in the preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onPhotoChange(dataUrl);
    closeCamera();
  }, [onPhotoChange, closeCamera]);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') return;
        // Re-encode large images to JPEG, max 1280px side, to keep payload reasonable
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            onPhotoChange(result);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          onPhotoChange(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = () => onPhotoChange(result);
        img.src = result;
      };
      reader.readAsDataURL(file);
    },
    [onPhotoChange]
  );

  const isRhino = procedure.id === 'ultrasonic_rhinoplasty';
  const isFacelift = procedure.id === 'deep_plane_facelift';

  return (
    <section className="pt-6 pb-6 animate-fade-up flex-1 flex flex-col">
      <Header step={2} onBack={onBack} />

      <h2
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: '34px',
          lineHeight: 1.1
        }}
        className="mt-6"
      >
        {t('step2.titleLine1')}
        <br />
        {t('step2.titleLine2')}
      </h2>
      <p
        className="text-[14px] mt-3"
        style={{ color: 'rgba(255,255,255,0.6)' }}
      >
        {t('step2.subtitle')}
      </p>
      {isRhino && (
        <p
          className="text-[13px] mt-1"
          style={{ color: '#C9A84C' }}
        >
          {t('step2.tipRhino')}
        </p>
      )}
      {isFacelift && (
        <p
          className="text-[13px] mt-1"
          style={{ color: '#C9A84C' }}
        >
          {t('step2.tipFacelift')}
        </p>
      )}

      {/* Camera preview overlay */}
      {cameraOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.95)' }}
        >
          <div
            style={{
              width: 'min(86vw, 360px)',
              aspectRatio: '1 / 1',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid #C9A84C',
              background: '#000'
            }}
          >
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)'
              }}
            />
          </div>
          <div className="mt-8 flex flex-col gap-3 w-full max-w-[300px] px-4">
            <button className="btn-primary" onClick={capturePhoto}>
              {t('step2.capture')}
            </button>
            <button className="btn-secondary" onClick={closeCamera}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-7 flex-1 flex flex-col">
        {userPhoto ? (
          <div className="flex flex-col items-center gap-4 mt-4">
            <div className="relative">
              <img
                src={userPhoto}
                alt="Your photo"
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #C9A84C'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#5DB075',
                  border: '2px solid #000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-hidden="true"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="#000"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="2,6.5 5,9.5 10,3" />
                </svg>
              </div>
            </div>
            <p
              className="text-[13px]"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              {t('step2.photoReady')}
            </p>
            <button
              onClick={() => onPhotoChange(null)}
              className="text-[13px] underline"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              {t('step2.useDifferent')}
            </button>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {hasCameraSupport && (
              <button className="btn-primary" onClick={openCamera}>
                {t('step2.takeSelfie')}
              </button>
            )}
            <button
              className={hasCameraSupport ? 'btn-secondary' : 'btn-primary'}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('step2.uploadPhoto')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
            {/* Hidden native-camera input — fallback path for browsers
                where getUserMedia is unavailable or blocked (notably
                some iOS Chrome builds). "capture=user" hints front cam. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>

      <div className="mt-6 sticky bottom-0 pb-2 pt-3 bg-bg">
        <button
          className="btn-primary"
          disabled={!userPhoto}
          onClick={onContinue}
        >
          {t('step2.cta')}
        </button>
        <p
          className="text-[11px] text-center mt-3 leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {t('step2.privacy')}
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/*  Result screen (loading + result + error states)                   */
/* ---------------------------------------------------------------- */

function ResultScreen({
  procedure,
  userPhoto,
  resultPhoto,
  isLoading,
  error,
  onRetry,
  onReset
}: {
  procedure: Procedure;
  userPhoto: string | null;
  resultPhoto: string | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onReset: () => void;
}) {
  return (
    <section className="pt-6 pb-6 animate-fade-up flex-1 flex flex-col">
      <Header step={3} onBack={onReset} />

      {isLoading && userPhoto && (
        <LoadingState procedure={procedure} userPhoto={userPhoto} />
      )}

      {!isLoading && error && (
        <ErrorState error={error} onRetry={onRetry} onReset={onReset} />
      )}

      {!isLoading && !error && resultPhoto && userPhoto && (
        <ResultContent
          procedure={procedure}
          userPhoto={userPhoto}
          resultPhoto={resultPhoto}
          onReset={onReset}
        />
      )}
    </section>
  );
}

function LoadingState({
  procedure,
  userPhoto
}: {
  procedure: Procedure;
  userPhoto: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center pt-10 pb-12">
      <div
        className="animate-gold-pulse"
        style={{
          width: 144,
          height: 144,
          borderRadius: '50%',
          border: '2px solid #C9A84C',
          padding: 4
        }}
      >
        <img
          src={userPhoto}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover'
          }}
        />
      </div>

      <h3
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: '28px',
          marginTop: 28
        }}
      >
        {t('loading.title')}
      </h3>
      <p
        className="text-[14px] mt-2"
        style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 320 }}
      >
        {t('loading.aiApplying', { procedure: procedure.name.toLowerCase() })}
      </p>

      <div
        className="mt-8 w-full"
        style={{
          maxWidth: 280,
          height: 3,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden'
        }}
      >
        <div
          className="animate-progress h-full"
          style={{ background: '#C9A84C' }}
        />
      </div>

      <p
        className="text-[11px] mt-5"
        style={{ color: 'rgba(255,255,255,0.35)' }}
      >
        {t('loading.timing')}
      </p>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
  onReset
}: {
  error: string;
  onRetry: () => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center pt-10 pb-12">
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(224, 82, 82, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#E05252"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: '26px'
        }}
      >
        {t('error.title')}
      </h3>
      <p
        className="text-[13px] mt-3 max-w-[320px]"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        {error}
      </p>

      <div className="mt-8 w-full max-w-[300px] space-y-3">
        <button className="btn-primary" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
        <button
          className="btn-secondary"
          onClick={() => window.open('http://rdv.facemd.com/', '_blank')}
        >
          {t('error.bookDirectly')}
        </button>
        <button
          className="text-[13px] underline w-full pt-2"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onClick={onReset}
        >
          {t('common.startOver')}
        </button>
      </div>
    </div>
  );
}

function ResultContent({
  procedure,
  userPhoto,
  resultPhoto,
  onReset
}: {
  procedure: Procedure;
  userPhoto: string;
  resultPhoto: string;
  onReset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex flex-col">
      <h2
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: '32px',
          lineHeight: 1.1
        }}
        className="mt-4"
      >
        {t('result.title')}
      </h2>
      <p
        className="text-[13px] mt-2 mb-6"
        style={{ color: 'rgba(255,255,255,0.6)' }}
      >
        {t('result.subtitle', { procedure: procedure.name })}
      </p>

      <BeforeAfterSlider before={userPhoto} after={resultPhoto} />

      {/* Share/Download lives directly under the before/after slider so the
          first thing the user can do after seeing their result is share it.
          Price + clinic context follow below for anyone who keeps scrolling. */}
      <ActionRow
        procedure={procedure}
        beforePhoto={userPhoto}
        resultPhoto={resultPhoto}
        onReset={onReset}
      />

      <PriceBox procedure={procedure} />

      <ClinicSection />

      <p
        className="text-[11px] text-center leading-relaxed mt-6"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        {t('result.disclaimer')}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Before/After drag slider                                         */
/* ---------------------------------------------------------------- */

function BeforeAfterSlider({
  before,
  after
}: {
  before: string;
  after: string;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const draggingRef = useRef(false);
  const [aspectRatio, setAspectRatio] = useState<number>(1); // h/w

  // Compute container aspect ratio from the BEFORE image so both sides line up
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setAspectRatio(img.naturalHeight / img.naturalWidth);
      }
    };
    img.src = before;
  }, [before]);

  const setFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const percent = Math.max(
      5,
      Math.min(95, ((clientX - rect.left) / rect.width) * 100)
    );
    setSliderPos(percent);
  }, []);

  // Mouse handlers — bind move/up to window so dragging can leave the element
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      setFromClientX(e.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setFromClientX]);

  // Touch handlers
  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      if (e.touches.length === 0) return;
      e.preventDefault();
      setFromClientX(e.touches[0].clientX);
    };
    const onEnd = () => {
      draggingRef.current = false;
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [setFromClientX]);

  const handleMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    setFromClientX(e.clientX);
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    draggingRef.current = true;
    if (e.touches[0]) setFromClientX(e.touches[0].clientX);
  };

  const handleClick = (e: React.MouseEvent) => {
    setFromClientX(e.clientX);
  };

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    borderRadius: 14,
    overflow: 'hidden',
    background: '#0D0D0D',
    border: '1px solid rgba(255,255,255,0.08)',
    aspectRatio: `${1} / ${aspectRatio}`,
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none'
  };

  return (
    <div
      ref={containerRef}
      className="select-none-ui"
      style={containerStyle}
      onClick={handleClick}
    >
      {/* BEFORE — full image underneath */}
      <img
        src={before}
        alt={t('result.before')}
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none'
        }}
      />

      {/* AFTER — clipped from left by sliderPos% */}
      <img
        src={after}
        alt={t('result.after')}
        draggable={false}
        crossOrigin="anonymous"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          clipPath: `inset(0 0 0 ${sliderPos}%)`,
          WebkitClipPath: `inset(0 0 0 ${sliderPos}%)`,
          pointerEvents: 'none'
        }}
      />

      {/* Labels */}
      <div
        className="absolute left-3 bottom-3 text-[11px] uppercase tracking-[0.18em]"
        style={{
          color: 'rgba(255,255,255,0.85)',
          background: 'rgba(0,0,0,0.45)',
          padding: '4px 10px',
          borderRadius: 999,
          fontWeight: 500,
          pointerEvents: 'none'
        }}
      >
        {t('result.before')}
      </div>
      <div
        className="absolute right-3 bottom-3 text-[11px] uppercase tracking-[0.18em]"
        style={{
          color: '#C9A84C',
          background: 'rgba(0,0,0,0.45)',
          padding: '4px 10px',
          borderRadius: 999,
          fontWeight: 600,
          pointerEvents: 'none'
        }}
      >
        {t('result.after')}
      </div>

      {/* Vertical divider line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${sliderPos}%`,
          width: 2,
          background: '#C9A84C',
          transform: 'translateX(-1px)',
          pointerEvents: 'none',
          boxShadow: '0 0 12px rgba(201,168,76,0.4)'
        }}
      />

      {/* Drag handle */}
      <button
        type="button"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={(e) => e.stopPropagation()}
        aria-label={t('result.dragAria')}
        style={{
          position: 'absolute',
          top: '50%',
          left: `${sliderPos}%`,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#C9A84C',
          color: '#000',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '-0.05em',
          cursor: 'grab',
          touchAction: 'none',
          boxShadow:
            '0 6px 16px rgba(0,0,0,0.4), 0 0 0 4px rgba(201,168,76,0.18)',
          border: 'none',
          padding: 0
        }}
      >
        <span aria-hidden="true">◀&nbsp;▶</span>
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Sub-components                                                   */
/* ---------------------------------------------------------------- */

function PriceBox({ procedure }: { procedure: Procedure }) {
  const { t } = useI18n();
  const isPublished = PROCEDURE_IS_PUBLISHED_PRICE[procedure.id];
  // Source line differs for published vs Montreal-market starting prices
  const sourceLine = isPublished
    ? t('result.sourcePublished')
    : t('result.sourceMontreal');
  return (
    <div
      className="mt-6"
      style={{
        background: '#0D0D0D',
        borderLeft: '3px solid #C9A84C',
        borderRadius: '0 12px 12px 0',
        padding: '14px 16px'
      }}
    >
      <p
        className="text-[12px] uppercase tracking-[0.16em]"
        style={{ color: '#C9A84C', fontWeight: 600 }}
      >
        {t('result.investmentLabel')}
      </p>
      <p className="text-[15px] mt-1" style={{ color: '#FFFFFF' }}>
        {procedure.cadDisplay}
      </p>
      <p
        className="text-[12px] mt-2"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        {sourceLine}
      </p>
      <p
        className="text-[12px] mt-1"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        {procedure.treatmentTime}
      </p>
    </div>
  );
}

function ClinicSection() {
  const { t } = useI18n();
  const { location, requestPreciseLocation } = useLocation();
  const [showAll, setShowAll] = useState(false);
  const [requestingPrecise, setRequestingPrecise] = useState(false);

  const ranked = useMemo(
    () =>
      sortClinicsByDistance(
        location ? { lat: location.lat, lng: location.lng } : null
      ),
    [location]
  );

  const nearest = ranked[0];
  const others = ranked.slice(1);
  const hasOthers = others.length > 0;

  if (!nearest) return null;

  // Banner text — only show if we successfully detected a city
  const locationLabel = location?.city
    ? t('clinic.locationBanner', {
        city: `${location.city}${location.region ? ', ' + location.region : ''}`
      })
    : null;

  const handleUseMyLocation = async () => {
    setRequestingPrecise(true);
    await requestPreciseLocation();
    setRequestingPrecise(false);
  };

  return (
    <div className="mt-6">
      {locationLabel && (
        <div
          className="flex items-center gap-2 mb-3 text-[12px]"
          style={{ color: 'rgba(255,255,255,0.55)' }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{locationLabel}</span>
        </div>
      )}

      <ClinicCard
        clinic={nearest}
        primary
        distanceKm={nearest.distanceKm}
      />

      {hasOthers && (
        <div className="mt-3">
          {!showAll ? (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-[13px] py-3"
              style={{
                color: 'rgba(255,255,255,0.7)',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 10
              }}
            >
              {others.length === 1
                ? t('clinic.seeOtherSingular', { n: others.length })
                : t('clinic.seeOtherPlural', { n: others.length })}
            </button>
          ) : (
            <div className="space-y-3">
              {others.map((c) => (
                <ClinicCard
                  key={c.id}
                  clinic={c}
                  distanceKm={c.distanceKm}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Offer precise location upgrade only if we don't already have GPS */}
      {location?.source !== 'gps' && CLINICS.length > 1 && (
        <button
          onClick={handleUseMyLocation}
          disabled={requestingPrecise}
          className="w-full text-[12px] mt-3 underline"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          {requestingPrecise
            ? t('clinic.locating')
            : t('clinic.usePreciseLocation')}
        </button>
      )}
    </div>
  );
}

function ClinicCard({
  clinic,
  primary,
  distanceKm
}: {
  clinic: Clinic;
  primary?: boolean;
  distanceKm?: number;
}) {
  const { t } = useI18n();
  return (
    <div
      style={{
        background: '#141414',
        border: primary
          ? '1px solid rgba(201, 168, 76, 0.30)'
          : '1px solid rgba(255,255,255,0.10)',
        borderRadius: 14,
        padding: primary ? 20 : 16
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontFamily:
                "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: primary ? 22 : 19,
              color: '#FFFFFF',
              lineHeight: 1.1
            }}
          >
            {clinic.name}
          </div>
          <div
            className="text-[13px] mt-1"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            {clinic.city}, {clinic.region}
          </div>
        </div>
        {typeof distanceKm === 'number' && (
          <div
            className="text-[11px] uppercase tracking-[0.14em] flex-shrink-0"
            style={{
              color: '#C9A84C',
              background: 'rgba(201,168,76,0.10)',
              padding: '4px 9px',
              borderRadius: 999,
              fontWeight: 600
            }}
          >
            {formatDistance(distanceKm)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 text-[13px]">
        <span style={{ color: '#F5A623', letterSpacing: 1 }}>★★★★★</span>
        <span style={{ color: '#FFFFFF', fontWeight: 500 }}>{clinic.rating}</span>
        <span style={{ color: 'rgba(255,255,255,0.45)' }}>
          · {t('clinic.googleReviews')}
        </span>
      </div>
      <a
        href={`tel:${clinic.phone}`}
        className="text-[13px] mt-2 inline-block"
        style={{ color: 'rgba(255,255,255,0.7)' }}
      >
        {clinic.phoneDisplay}
      </a>

      <div className={`mt-${primary ? 5 : 4} space-y-2.5`}>
        <button
          className={primary ? 'btn-primary' : 'btn-secondary'}
          onClick={() => window.open(clinic.bookingUrl, '_blank')}
          style={!primary ? { minHeight: 44, fontSize: 14 } : undefined}
        >
          {t('clinic.bookConsultation')}
        </button>
        {primary && (
          <button
            className="btn-secondary"
            onClick={() => window.open(clinic.websiteUrl, '_blank')}
          >
            {t('clinic.visitWebsite', {
              host: new URL(clinic.websiteUrl).hostname.replace('www.', '')
            })}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Convert a data: URL or remote URL into an in-memory File object.
 * The Web Share API (level 2) requires File[] objects to share images;
 * a string URL alone won't trigger Instagram/WhatsApp targets in the
 * native share sheet on iOS or Android.
 */
async function urlToFile(url: string, filename: string): Promise<File> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

// Loads an image as an HTMLImageElement. crossOrigin is set so canvas
// won't be tainted when the source comes from a remote URL (the model
// URL is currently a data URL since the API watermarks server-side, but
// we set the flag defensively in case that ever changes).
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Build a side-by-side Before/After composite as a JPEG File suitable
 * for download / Web Share. Both source images are normalized to the
 * same height, then rendered into a 2-up canvas with:
 *   • "BEFORE" / "AFTER" labels in the top-left of each panel
 *   • a thin gold divider between panels
 *   • a SimFACEMD lockup watermark across the bottom
 *
 * Output dimensions cap the smaller image's height to MAX_PANEL_H so we
 * don't ship 8MP files. JPEG @ 0.92 keeps quality high without bloat.
 */
async function buildSideBySideComposite(
  beforeUrl: string,
  afterUrl: string,
  filename: string,
  labels: { before: string; after: string }
): Promise<File> {
  const MAX_PANEL_H = 1200; // px — each panel's render height
  const DIVIDER_W = 4; // gold separator
  const FOOTER_H = 110; // watermark band

  // Load all assets in parallel.
  const [beforeImg, afterImg, logoImg] = await Promise.all([
    loadImage(beforeUrl),
    loadImage(afterUrl),
    loadImage('/brand/face-md-logo-white.png').catch(() => null) // graceful: missing logo → text-only watermark
  ]);

  // Match panel heights by scaling each image. Use the SHORTER of the
  // two natural heights (capped to MAX_PANEL_H) so neither image gets
  // upscaled beyond its source resolution.
  const targetH = Math.min(
    MAX_PANEL_H,
    Math.min(beforeImg.naturalHeight, afterImg.naturalHeight)
  );
  const beforeScale = targetH / beforeImg.naturalHeight;
  const afterScale = targetH / afterImg.naturalHeight;
  const beforeW = Math.round(beforeImg.naturalWidth * beforeScale);
  const afterW = Math.round(afterImg.naturalWidth * afterScale);

  const canvasW = beforeW + DIVIDER_W + afterW;
  const canvasH = targetH + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // 1. Black background — brand-consistent and prevents any transparent
  //    edges from rendering as white when the JPEG encoder strips alpha.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 2. Draw both panels.
  ctx.drawImage(beforeImg, 0, 0, beforeW, targetH);
  ctx.drawImage(afterImg, beforeW + DIVIDER_W, 0, afterW, targetH);

  // 3. Gold divider between panels.
  ctx.fillStyle = '#C9A84C';
  ctx.fillRect(beforeW, 0, DIVIDER_W, targetH);

  // 4. "BEFORE" / "AFTER" pill labels (top-left of each panel).
  drawPanelLabel(ctx, labels.before.toUpperCase(), 24, 24, 'rgba(0,0,0,0.55)', '#FFFFFF');
  drawPanelLabel(
    ctx,
    labels.after.toUpperCase(),
    beforeW + DIVIDER_W + 24,
    24,
    'rgba(201,168,76,0.92)', // gold for the After label — reads as the "reveal"
    '#000000'
  );

  // 5. Diagonal repeating "Sim FACE MD" watermark across BOTH panels.
  //    Subtle (low alpha), so the photo remains the hero, but visible
  //    enough that anyone reposting the image can see the source.
  drawDiagonalWatermark(ctx, 0, 0, canvasW, targetH);

  // 6. Footer band: solid black with subtle top hairline + watermark.
  const footerY = targetH;
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, footerY, canvasW, FOOTER_H);
  ctx.fillStyle = 'rgba(201,168,76,0.35)';
  ctx.fillRect(0, footerY, canvasW, 1);

  // 6. "Sim" italic + Face MD logo lockup, centered in the footer.
  // Build the lockup widths first so we can center the whole group.
  const simFontPx = 56;
  ctx.font = `italic 500 ${simFontPx}px "Cormorant Garamond", Georgia, serif`;
  const simText = 'Sim';
  const simW = ctx.measureText(simText).width;

  const logoTargetH = 52; // matches "Sim" cap-height nicely
  let logoW = 0;
  if (logoImg) {
    logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoTargetH;
  }
  const lockupGap = 14;
  const lockupTotalW = simW + (logoImg ? lockupGap + logoW : 0);
  const lockupX = (canvasW - lockupTotalW) / 2;
  const lockupCenterY = footerY + FOOTER_H / 2;

  // Draw "Sim" — white italic, baseline-aligned with logo.
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(simText, lockupX, lockupCenterY + 2 /* optical nudge */);

  // Draw the gold Face MD logo to the right of "Sim".
  if (logoImg) {
    ctx.drawImage(
      logoImg,
      lockupX + simW + lockupGap,
      lockupCenterY - logoTargetH / 2,
      logoW,
      logoTargetH
    );
  } else {
    // Fallback: render "FACE MD" as white text if the logo failed to load.
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `300 ${simFontPx * 0.55}px Inter, system-ui, sans-serif`;
    ctx.fillText('FACE MD', lockupX + simW + lockupGap, lockupCenterY);
  }

  // Tiny attribution under the lockup so people who screenshot the
  // composite know where it came from.
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '300 18px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('simfacemd.com', canvasW / 2, footerY + FOOTER_H - 16);

  // 7. Encode → Blob → File. JPEG keeps file size sane for sharing.
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.92
    );
  });
  return new File([blob], filename, { type: 'image/jpeg' });
}

// Helper: draw a rounded "pill" label in the corner of a panel. Used
// for the BEFORE / AFTER markers on the composite.
function drawPanelLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bg: string,
  fg: string
) {
  const padX = 18;
  const padY = 10;
  const fontPx = 26;
  ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const textW = ctx.measureText(text).width;
  const w = textW + padX * 2;
  const h = fontPx + padY * 2;
  const r = h / 2;

  // Pill background
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  // Letter-spaced label
  ctx.fillStyle = fg;
  // Manual letter-spacing for crispness (canvas doesn't have native
  // letter-spacing on older Safari).
  const tracking = 2;
  let cx = x + padX;
  for (const ch of text) {
    ctx.fillText(ch, cx, y + padY);
    cx += ctx.measureText(ch).width + tracking;
  }
}

/**
 * Draw a real diagonal repeating "Sim FACE MD" watermark inside the
 * given rectangle. Tiles are stamped on a rotated grid so the pattern
 * reads as a classic stock-photo watermark, not a stamp in one corner.
 *
 * White text at low alpha so it sits over both light and dark skin
 * tones without looking heavy-handed.
 */
function drawDiagonalWatermark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const longEdge = Math.max(w, h);
  const fontPx = Math.round(longEdge * 0.038);
  const wordW = fontPx * 6.2; // approx width of "Sim FACE MD" lockup
  const stepX = Math.round(wordW * 1.55);
  const stepY = Math.round(fontPx * 6.0);
  const angleRad = (-22 * Math.PI) / 180;

  ctx.save();
  // Clip to the panel rect so the watermark never bleeds into the
  // footer band or outside the canvas.
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Rotate around the rect's center.
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.rotate(angleRad);
  ctx.translate(-cx, -cy);

  ctx.globalAlpha = 0.22; // overall watermark opacity
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Over-extend the grid so the rotated pattern fills every corner.
  const overscan = Math.round(longEdge * 0.6);
  const x0 = x - overscan;
  const x1 = x + w + overscan;
  const y0 = y - overscan;
  const y1 = y + h + overscan;

  for (let py = y0; py < y1; py += stepY) {
    const rowIdx = Math.floor((py - y0) / stepY);
    const rowOffset = (rowIdx % 2) * Math.round(stepX / 2);
    for (let px = x0 + rowOffset; px < x1; px += stepX) {
      // "Sim" italic Cormorant
      ctx.font = `italic 500 ${fontPx}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('Sim', px, py);
      const simW = ctx.measureText('Sim').width;
      // "FACE MD" in spaced sans, slightly smaller so it tracks the lockup
      const sansPx = Math.round(fontPx * 0.78);
      ctx.font = `300 ${sansPx}px Inter, system-ui, sans-serif`;
      // Manual letter-spacing for canvas Safari compat.
      let lx = px + simW + Math.round(fontPx * 0.35);
      const tracking = Math.round(sansPx * 0.22);
      for (const ch of 'FACE MD') {
        ctx.fillText(ch, lx, py);
        lx += ctx.measureText(ch).width + tracking;
      }
    }
  }

  ctx.restore();
}

function ActionRow({
  procedure,
  beforePhoto,
  resultPhoto,
  onReset
}: {
  procedure: Procedure;
  beforePhoto: string;
  resultPhoto: string;
  onReset: () => void;
}) {
  const { t } = useI18n();

  // Build the side-by-side composite once per click. Cached on the
  // first build so a user clicking Share → cancel → Download doesn't
  // re-encode the canvas.
  const compositeRef = useRef<File | null>(null);
  const getComposite = useCallback(async (): Promise<File> => {
    if (compositeRef.current) return compositeRef.current;
    const file = await buildSideBySideComposite(
      beforePhoto,
      resultPhoto,
      `simfacemd-${procedure.id}-before-after.jpg`,
      { before: t('result.before'), after: t('result.after') }
    );
    compositeRef.current = file;
    return file;
  }, [beforePhoto, resultPhoto, procedure.id, t]);
  const [shareStatus, setShareStatus] = useState<string>('');
  const [busy, setBusy] = useState<null | 'share' | 'download' | 'wa' | 'ig'>(
    null
  );

  // Pre-filled caption — every share doubles as a free ad. Keep it short
  // enough that it survives Instagram / WhatsApp / iMessage paste limits.
  const siteUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://simfacemd.com';
  const caption = t('share.captionTemplate', {
    procedure: procedure.name,
    url: siteUrl
  });
  const filename = `simfacemd-${procedure.id}-before-after.jpg`;

  const flash = (msg: string) => {
    setShareStatus(msg);
    setTimeout(() => setShareStatus(''), 2200);
  };

  // ——— Native share (image + caption). Always provides feedback so
  // desktop users without navigator.share don't think the button is broken.
  // Mobile path: OS share sheet with the watermarked JPEG attached.
  // Desktop path: copy caption to clipboard AND auto-download the image
  // so the user has both pieces ready to paste somewhere.
  const handleNativeShare = async () => {
    setBusy('share');
    try {
      const file = await getComposite();
      const shareData: ShareData = {
        title: t('share.shareTitle'),
        text: caption,
        files: [file]
      };
      // canShare may not exist on older browsers — try optimistically.
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare(shareData);
      if (navigator.share && canShareFiles) {
        await navigator.share(shareData);
        // Native share sheet handled the rest — no extra flash needed
        // (would step on the share sheet UX).
      } else if (navigator.share) {
        // Browser supports share but not files — fall back to text+url.
        await navigator.share({
          title: t('share.shareTitle'),
          text: caption
        });
      } else {
        // Desktop fallback. Most desktop browsers don't expose
        // navigator.share at all — silently doing nothing here was the
        // "share doesn't work" bug. Copy caption + download image.
        let copied = false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(caption);
            copied = true;
          }
        } catch {
          /* clipboard may be blocked — fall through to download */
        }
        // Always download the image so the user has something tangible.
        try {
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch {
          /* swallow — we'll still flash a status below */
        }
        flash(copied ? t('share.captionCopied') : t('share.savedToDevice'));
      }
    } catch (e: any) {
      // AbortError = user dismissed share sheet — silent.
      if (e?.name && e.name !== 'AbortError') {
        flash(t('share.unavailable'));
      }
    } finally {
      setBusy(null);
    }
  };

  // ——— Download the watermarked JPEG.
  const handleDownload = async () => {
    setBusy('download');
    try {
      const file = await getComposite();
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a tick so iOS Safari doesn't cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      flash(t('share.savedToDevice'));
    } catch {
      flash(t('share.downloadFailed'));
    } finally {
      setBusy(null);
    }
  };

  // ——— WhatsApp deep link. WhatsApp's web URL only carries text, not
  // files — so we copy the image to the clipboard (when supported) and
  // pre-fill the message text. The user pastes the image in the chat.
  const handleWhatsApp = async () => {
    setBusy('wa');
    try {
      // Copy image to clipboard for paste-into-chat (Chrome/Edge desktop, some Android).
      let copiedImage = false;
      try {
        if (
          typeof window !== 'undefined' &&
          typeof (window as any).ClipboardItem !== 'undefined' &&
          navigator.clipboard?.write
        ) {
          const compFile = await getComposite();
          const blob = compFile as unknown as Blob;
          const Ctor = (window as any).ClipboardItem;
          await navigator.clipboard.write([new Ctor({ [blob.type]: blob })]);
          copiedImage = true;
        }
      } catch {
        copiedImage = false;
      }

      const waUrl = `https://wa.me/?text=${encodeURIComponent(caption)}`;
      window.open(waUrl, '_blank');
      flash(copiedImage ? t('share.imageCopied') : t('share.openedWhatsapp'));
    } catch {
      flash(t('share.unavailable'));
    } finally {
      setBusy(null);
    }
  };

  // ——— Instagram doesn't expose a public web share-to-Story URL.
  // Best UX: native share sheet (iOS/Android lets the user pick
  // Instagram), with a graceful fallback that downloads the image and
  // tells them how to attach it.
  const handleInstagram = async () => {
    setBusy('ig');
    try {
      const file = await getComposite();
      const shareData: ShareData = {
        title: t('share.shareTitle'),
        text: caption,
        files: [file]
      };
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare(shareData);
      if (navigator.share && canShareFiles) {
        await navigator.share(shareData);
      } else {
        // Desktop or unsupported — download the image so they can attach
        // it manually to a Story.
        await handleDownload();
        flash(t('share.imageSavedStory'));
      }
    } catch (e: any) {
      if (e?.name && e.name !== 'AbortError') {
        flash(t('share.unavailable'));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5">
      {/* Primary native share — the big gold button */}
      <button
        onClick={handleNativeShare}
        disabled={busy === 'share'}
        className="btn-primary"
        style={{ minHeight: 50, fontSize: 15 }}
      >
        {busy === 'share' ? t('share.preparing') : t('share.primary')}
      </button>

      {/* Three explicit shortcuts: WhatsApp, Instagram, Download */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={handleWhatsApp}
          disabled={busy === 'wa'}
          className="btn-secondary"
          style={{ minHeight: 44, fontSize: 13, padding: '0 8px' }}
          aria-label={t('share.whatsappAria')}
        >
          {busy === 'wa' ? '…' : t('share.whatsapp')}
        </button>
        <button
          onClick={handleInstagram}
          disabled={busy === 'ig'}
          className="btn-secondary"
          style={{ minHeight: 44, fontSize: 13, padding: '0 8px' }}
          aria-label={t('share.instagramAria')}
        >
          {busy === 'ig' ? '…' : t('share.instagram')}
        </button>
        <button
          onClick={handleDownload}
          disabled={busy === 'download'}
          className="btn-secondary"
          style={{ minHeight: 44, fontSize: 13, padding: '0 8px' }}
          aria-label={t('share.downloadAria')}
        >
          {busy === 'download' ? '…' : t('share.download')}
        </button>
      </div>

      {/* Try-another link */}
      <button
        onClick={onReset}
        className="w-full text-[13px] underline mt-4"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        {t('share.tryAnother')}
      </button>

      {shareStatus && (
        <p
          className="text-[12px] text-center mt-3"
          style={{ color: '#C9A84C' }}
          role="status"
          aria-live="polite"
        >
          {shareStatus}
        </p>
      )}
    </div>
  );
}

function Header({ step, onBack }: { step: 1 | 2 | 3; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={onBack}
        aria-label={t('common.back')}
        className="select-none-ui"
        style={{
          width: 40,
          height: 40,
          marginLeft: -8,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.7)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>

      <Logo size="sm" />

      <div className="flex items-center gap-2">
        <div
          className="text-[12px]"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          {t('common.stepXofY', { x: step, y: 3 })}
        </div>
        <LanguageToggle />
      </div>
    </div>
  );
}
