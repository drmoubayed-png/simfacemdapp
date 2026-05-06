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

/* ---------------------------------------------------------------- */
/*  Types                                                            */
/* ---------------------------------------------------------------- */

type Screen = 'welcome' | 'step1' | 'step2' | 'result';

type ProcedureId =
  | 'ultrasonic_rhinoplasty'
  | 'deep_plane_facelift'
  | 'botox'
  | 'lip_cheek_filler'
  | 'co2_laser'
  | 'bbl_photofacial';

type Procedure = {
  id: ProcedureId;
  name: string;
  desc: string;
  cad: string;
  usd: string;
  // What patients are paying for; shown in the price box
  treatmentTime: string;
};

const PROCEDURES: Procedure[] = [
  {
    id: 'ultrasonic_rhinoplasty',
    name: 'Ultrasonic Rhinoplasty',
    desc: 'Precision nose reshaping with piezoelectric instruments',
    cad: 'Consultation required',
    usd: '',
    treatmentTime: 'Surgery · 2–3 hr · Final result at 12 months'
  },
  {
    id: 'deep_plane_facelift',
    name: 'Deep Plane Facelift',
    desc: 'Lift midface, jowls & neck as one unit',
    cad: 'Consultation required',
    usd: '',
    treatmentTime: 'Surgery · 4–5 hr · Final result at 6 months'
  },
  {
    id: 'botox',
    name: 'Botox',
    desc: "Soften forehead, frown lines & crow's feet",
    cad: '$120 – $1,020',
    usd: '$89 – $756',
    treatmentTime: '15 min · Visible at 2 weeks'
  },
  {
    id: 'lip_cheek_filler',
    name: 'Lip & Cheek Filler',
    desc: 'Fuller lips, lifted cheekbones',
    cad: '$900 – $1,500',
    usd: '$666 – $1,110',
    treatmentTime: '30–45 min · Visible immediately'
  },
  {
    id: 'co2_laser',
    name: 'CO2 Laser',
    desc: 'Smooth texture, fade lines & scarring',
    cad: '$1,500 – $3,500',
    usd: '$1,110 – $2,590',
    treatmentTime: 'Single session · Final result at 3 months'
  },
  {
    id: 'bbl_photofacial',
    name: 'BBL Photofacial',
    desc: 'Fade sun spots, redness & uneven tone',
    cad: '$450 – $750',
    usd: '$333 – $555',
    treatmentTime: '30 min · 3-treatment series recommended'
  }
];

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
  const [screen, setScreen] = useState<Screen>('welcome');
  const [selectedProcedure, setSelectedProcedure] =
    useState<ProcedureId | null>(null);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [resultPhoto, setResultPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMeta = PROCEDURES.find((p) => p.id === selectedProcedure) || null;

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
        throw new Error(j?.error || 'Simulation failed.');
      }

      const data = (await res.json()) as { resultUrl: string };
      setResultPhoto(data.resultUrl);
    } catch (err: any) {
      setError(err?.message || 'Simulation failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [userPhoto, selectedProcedure]);

  return (
    <main className="min-h-screen bg-bg flex flex-col items-center">
      <div className="w-full max-w-[480px] px-5 pb-10 flex-1 flex flex-col">
        {screen === 'welcome' && <WelcomeScreen onStart={() => setScreen('step1')} />}

        {screen === 'step1' && (
          <ChooseProcedureScreen
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
  return (
    <section className="flex-1 flex flex-col min-h-[100dvh] py-12 animate-fade-up">
      <div className="pt-2">
        <Logo size="md" />
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
          See it before<br />you do it.
        </h1>
        <p
          className="text-[15px] mx-auto"
          style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 320 }}
        >
          AI-powered aesthetic simulation.
          <br />
          Free. 60 seconds.
        </p>
      </div>

      <div className="space-y-4 mt-8">
        <button className="btn-primary" onClick={onStart} aria-label="Start simulation">
          Start Free Simulation →
        </button>

        <div className="text-center">
          <span
            className="inline-flex items-center gap-2 text-[13px]"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            <span style={{ color: '#F5A623' }}>★</span>
            4.9 · Clinique Face MD · Montréal
          </span>
        </div>

        <p
          className="text-[11px] text-center leading-relaxed pt-2"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          Simulations are AI-generated previews and do not represent guaranteed
          medical outcomes. Final results vary and are determined during your
          consultation with a licensed practitioner.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/*  Step 1 — Choose procedure                                        */
/* ---------------------------------------------------------------- */

function ChooseProcedureScreen({
  selected,
  onSelect,
  onBack,
  onContinue
}: {
  selected: ProcedureId | null;
  onSelect: (id: ProcedureId) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
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
        Choose your<br />procedure.
      </h2>
      <p
        className="text-[14px] mt-3 mb-6"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        Pick one to preview on your photo.
      </p>

      <div className="space-y-3 flex-1">
        {PROCEDURES.map((p) => {
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
                  <div
                    className="text-[12px] mt-2"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    {p.cad} CAD
                    {p.usd ? ` · ${p.usd} USD` : ''}
                  </div>
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
          Continue →
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
        Take your<br />photo.
      </h2>
      <p
        className="text-[14px] mt-3"
        style={{ color: 'rgba(255,255,255,0.6)' }}
      >
        Face forward, neutral expression, good lighting.
      </p>
      {isRhino && (
        <p
          className="text-[13px] mt-1"
          style={{ color: '#C9A84C' }}
        >
          Side profile photo recommended for rhinoplasty.
        </p>
      )}
      {isFacelift && (
        <p
          className="text-[13px] mt-1"
          style={{ color: '#C9A84C' }}
        >
          A relaxed front-facing photo gives the best simulation result.
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
              Capture
            </button>
            <button className="btn-secondary" onClick={closeCamera}>
              Cancel
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
              Photo ready.
            </p>
            <button
              onClick={() => onPhotoChange(null)}
              className="text-[13px] underline"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Use a different photo
            </button>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {hasCameraSupport && (
              <button className="btn-primary" onClick={openCamera}>
                Take a Selfie
              </button>
            )}
            <button
              className={hasCameraSupport ? 'btn-secondary' : 'btn-primary'}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload a Photo
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
          Generate My Simulation →
        </button>
        <p
          className="text-[11px] text-center mt-3 leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          Your photo is used only for this simulation. We do not store
          identifiable images on our servers.
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
        Generating your simulation…
      </h3>
      <p
        className="text-[14px] mt-2"
        style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 320 }}
      >
        AI is applying {procedure.name.toLowerCase()} to your photo.
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
        This usually takes 15–30 seconds.
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
        Simulation unavailable right now.
      </h3>
      <p
        className="text-[13px] mt-3 max-w-[320px]"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        {error}
      </p>

      <div className="mt-8 w-full max-w-[300px] space-y-3">
        <button className="btn-primary" onClick={onRetry}>
          Try Again
        </button>
        <button
          className="btn-secondary"
          onClick={() => window.open('http://rdv.facemd.com/', '_blank')}
        >
          Book Directly →
        </button>
        <button
          className="text-[13px] underline w-full pt-2"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onClick={onReset}
        >
          Start over
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
        Your SimFaceMD Result
      </h2>
      <p
        className="text-[13px] mt-2 mb-6"
        style={{ color: 'rgba(255,255,255,0.6)' }}
      >
        {procedure.name} · Clinique Face MD
      </p>

      <BeforeAfterSlider before={userPhoto} after={resultPhoto} />

      <PriceBox procedure={procedure} />

      <ClinicSection />

      <ActionRow procedure={procedure} resultPhoto={resultPhoto} onReset={onReset} />

      <p
        className="text-[11px] text-center leading-relaxed mt-6"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        AI-generated preview. Actual outcomes vary and are determined during a
        consultation with a licensed practitioner.
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
        alt="Before"
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
        alt="After"
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
        Before
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
        After
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
        aria-label="Drag to compare before and after"
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
  const isConsultation = !procedure.usd && /consult/i.test(procedure.cad);
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
        {isConsultation ? 'Estimated Investment' : 'Estimated Price'}
      </p>
      <p className="text-[15px] mt-1" style={{ color: '#FFFFFF' }}>
        {isConsultation
          ? procedure.cad
          : `Approximately ${procedure.cad}${procedure.usd ? ` CAD · ${procedure.usd} USD` : ''}`}
      </p>
      <p
        className="text-[12px] mt-2"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        Confirmed at your free consultation.
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
    ? `Showing clinics near ${location.city}${location.region ? ', ' + location.region : ''}`
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
              See {others.length} other{others.length === 1 ? '' : 's'} location
              {others.length === 1 ? '' : 's'}
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
            ? 'Locating…'
            : 'Use my precise location for better results'}
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
          · {clinic.reviewSource}
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
          Book My Consultation →
        </button>
        {primary && (
          <button
            className="btn-secondary"
            onClick={() => window.open(clinic.websiteUrl, '_blank')}
          >
            Visit {new URL(clinic.websiteUrl).hostname.replace('www.', '')}
          </button>
        )}
      </div>
    </div>
  );
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
  const [shareStatus, setShareStatus] = useState<string>('');

  const handleShare = async () => {
    const shareData = {
      title: 'My SimFaceMD Result',
      text: `My ${procedure.name} simulation from SimFaceMD by Clinique Face MD`,
      url: typeof window !== 'undefined' ? window.location.href : ''
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `${shareData.text} — ${shareData.url}`
        );
        setShareStatus('Link copied');
        setTimeout(() => setShareStatus(''), 2000);
      }
    } catch {
      // User cancelled — silently ignore
    }
  };

  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <button
        onClick={onReset}
        className="btn-secondary"
        style={{ minHeight: 46, fontSize: 14 }}
      >
        🔄 Try Another
      </button>
      <button
        onClick={handleShare}
        className="btn-secondary"
        style={{ minHeight: 46, fontSize: 14 }}
      >
        {shareStatus || 'Share'}
      </button>
    </div>
  );
}

function Header({ step, onBack }: { step: 1 | 2 | 3; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={onBack}
        aria-label="Back"
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

      <div
        className="text-[12px]"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        Step {step} of 3
      </div>
    </div>
  );
}
