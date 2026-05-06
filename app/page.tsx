'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
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
  const sizeMap = {
    sm: { sim: '22px', md: '11px' },
    md: { sim: '34px', md: '14px' },
    lg: { sim: '54px', md: '20px' }
  } as const;
  const s = sizeMap[size];

  return (
    <div className="flex items-baseline gap-[3px] select-none-ui">
      <span
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontWeight: 500,
          color: '#FFFFFF',
          fontSize: s.sim,
          lineHeight: 1
        }}
      >
        Sim
      </span>
      <span
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontWeight: 500,
          color: '#C9A84C',
          fontSize: s.sim,
          lineHeight: 1
        }}
      >
        Face
      </span>
      <span
        style={{
          fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
          fontWeight: 300,
          color: 'rgba(255,255,255,0.6)',
          fontSize: s.md,
          letterSpacing: '0.18em',
          marginLeft: '4px'
        }}
      >
        MD
      </span>
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
      <div className="pt-2 flex items-center justify-between">
        <Logo size="md" />
        <LanguageToggle />
      </div>

      <div className="flex-1 flex flex-col justify-center text-center -mt-6">
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
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const openCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // Wait for next paint so the <video> element exists
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      stopCamera();
      setHasCameraSupport(false);
      // Per spec: don't show an error message — fall back silently to upload only
      setCameraError(null);
    }
  }, [stopCamera]);

  const closeCamera = useCallback(() => {
    stopCamera();
    setCameraOpen(false);
  }, [stopCamera]);

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

      <PriceBox procedure={procedure} />

      <ClinicSection />

      <ActionRow
        procedure={procedure}
        resultPhoto={resultPhoto}
        onReset={onReset}
      />

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

function ActionRow({
  procedure,
  resultPhoto,
  onReset
}: {
  procedure: Procedure;
  resultPhoto: string;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const [shareStatus, setShareStatus] = useState<string>('');
  const [busy, setBusy] = useState<null | 'share' | 'download' | 'wa' | 'ig'>(
    null
  );

  // Pre-filled caption — every share doubles as a free ad. Keep it short
  // enough that it survives Instagram / WhatsApp / iMessage paste limits.
  const siteUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://cliniquefacemd.com';
  const caption = t('share.captionTemplate', {
    procedure: procedure.name,
    url: siteUrl
  });
  const filename = `simfacemd-${procedure.id}.jpg`;

  const flash = (msg: string) => {
    setShareStatus(msg);
    setTimeout(() => setShareStatus(''), 2200);
  };

  // ——— Native share (image + caption). Falls through to copy-link if
  // the platform / browser doesn't support sharing files.
  const handleNativeShare = async () => {
    setBusy('share');
    try {
      const file = await urlToFile(resultPhoto, filename);
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
      } else if (navigator.share) {
        // Browser supports share but not files — fall back to text+url.
        await navigator.share({
          title: t('share.shareTitle'),
          text: caption
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(caption);
        flash(t('share.captionCopied'));
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
      const file = await urlToFile(resultPhoto, filename);
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
          const resp = await fetch(resultPhoto);
          const blob = await resp.blob();
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
      const file = await urlToFile(resultPhoto, filename);
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
