'use client';

/**
 * Lightweight bilingual i18n for SimFaceMD.
 *
 * Design goals:
 *  - Zero runtime dependencies (no react-i18next / next-intl bloat).
 *  - English is the default language; French is the only other language.
 *  - Language choice persists in localStorage across visits.
 *  - One flat dictionary keyed by string IDs — easy to scan in review and
 *    easy to swap if Dr. Moubayed wants to tweak French wording later.
 *  - Both procedure metadata and free-form copy live in the same dict.
 *
 * Usage:
 *   const { t, lang, setLang } = useI18n();
 *   <h1>{t('welcome.headline')}</h1>
 *   t('result.aiApplyingTo', { procedure: 'Botox' })
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';

export type Lang = 'en' | 'fr';

const STORAGE_KEY = 'simfacemd.lang';

/* ------------------------------------------------------------------ */
/*  Dictionary                                                         */
/* ------------------------------------------------------------------ */

// Each entry is { en, fr }. Use {placeholder} interpolation for values
// passed via the second argument to t().
const DICT = {
  // ---------- Common chrome ----------
  'common.back': { en: 'Back', fr: 'Retour' },
  'common.continue': { en: 'Continue →', fr: 'Continuer →' },
  'common.cancel': { en: 'Cancel', fr: 'Annuler' },
  'common.tryAgain': { en: 'Try Again', fr: 'Réessayer' },
  'common.startOver': { en: 'Start over', fr: 'Recommencer' },
  'common.stepXofY': { en: 'Step {x} of {y}', fr: 'Étape {x} sur {y}' },

  // ---------- Welcome ----------
  'welcome.headlineLine1': { en: 'See it before', fr: 'Voyez-le avant' },
  'welcome.headlineLine2': { en: 'you do it.', fr: 'de le faire.' },
  'welcome.subtitle': {
    en: 'AI-powered aesthetic simulation.\nFree. 60 seconds.',
    fr: 'Simulation esthétique par intelligence artificielle.\nGratuite. 60 secondes.'
  },
  'welcome.cta': {
    en: 'Start Free Simulation →',
    fr: 'Commencer la simulation gratuite →'
  },
  'welcome.ratingLine': {
    en: '4.9 · Clinique Face MD · Montréal',
    fr: '4,9 · Clinique Face MD · Montréal'
  },
  'welcome.disclaimer': {
    en: 'Simulations are AI-generated previews and do not represent guaranteed medical outcomes. Final results vary and are determined during your consultation with a licensed practitioner.',
    fr: 'Les simulations sont des aperçus générés par IA et ne représentent pas un résultat médical garanti. Le résultat final varie selon chaque patient et est déterminé lors de votre consultation avec un médecin agréé.'
  },

  // ---------- Step 1: choose procedure ----------
  'step1.titleLine1': { en: 'Choose your', fr: 'Choisissez votre' },
  'step1.titleLine2': { en: 'procedure.', fr: 'intervention.' },
  'step1.subtitle': {
    en: 'Pick one to preview on your photo.',
    fr: 'Sélectionnez-en une pour la prévisualiser sur votre photo.'
  },

  // ---------- Step 2: photo ----------
  'step2.titleLine1': { en: 'Take your', fr: 'Prenez votre' },
  'step2.titleLine2': { en: 'photo.', fr: 'photo.' },
  'step2.subtitle': {
    en: 'Face forward, neutral expression, good lighting.',
    fr: 'Face vers la caméra, expression neutre, bon éclairage.'
  },
  'step2.tipRhino': {
    en: 'Side profile photo recommended for rhinoplasty.',
    fr: 'Photo de profil recommandée pour la rhinoplastie.'
  },
  'step2.tipFacelift': {
    en: 'A relaxed front-facing photo gives the best simulation result.',
    fr: 'Une photo de face détendue donne le meilleur résultat de simulation.'
  },
  'step2.takeSelfie': { en: 'Take a Selfie', fr: 'Prendre un selfie' },
  'step2.uploadPhoto': { en: 'Upload a Photo', fr: 'Téléverser une photo' },
  'step2.capture': { en: 'Capture', fr: 'Capturer' },
  'step2.photoReady': { en: 'Photo ready.', fr: 'Photo prête.' },
  'step2.useDifferent': {
    en: 'Use a different photo',
    fr: 'Utiliser une autre photo'
  },
  'step2.cta': {
    en: 'Generate My Simulation →',
    fr: 'Générer ma simulation →'
  },
  'step2.privacy': {
    en: 'Your photo is used only for this simulation. We do not store identifiable images on our servers.',
    fr: 'Votre photo est utilisée uniquement pour cette simulation. Aucune image identifiable n’est conservée sur nos serveurs.'
  },

  // ---------- Result ----------
  'result.title': {
    en: 'Your SimFaceMD Result',
    fr: 'Votre résultat SimFaceMD'
  },
  'result.subtitle': {
    en: '{procedure} · Clinique Face MD',
    fr: '{procedure} · Clinique Face MD'
  },
  'result.before': { en: 'Before', fr: 'Avant' },
  'result.after': { en: 'After', fr: 'Après' },
  'result.dragAria': {
    en: 'Drag to compare before and after',
    fr: 'Glisser pour comparer avant et après'
  },
  'result.investmentLabel': { en: 'Investment', fr: 'Investissement' },
  'result.cadSuffix': { en: 'CAD', fr: '$ CA' }, // e.g. "Starting at $400 CAD" / "À partir de 400 $ CA"
  'result.sourcePublished': {
    en: 'Source: cliniquefacemd.com/prices. Final quote at your free consultation. Taxes excluded.',
    fr: 'Source : cliniquefacemd.com/prices. Devis final lors de votre consultation gratuite. Taxes en sus.'
  },
  'result.sourceMontreal': {
    en: 'Montreal starting price. Final quote at your free consultation. Taxes excluded.',
    fr: 'Prix de départ à Montréal. Devis final lors de votre consultation gratuite. Taxes en sus.'
  },
  'result.disclaimer': {
    en: 'AI-generated preview. Actual outcomes vary and are determined during a consultation with a licensed practitioner.',
    fr: 'Aperçu généré par IA. Les résultats réels varient et sont déterminés lors d’une consultation avec un médecin agréé.'
  },

  // Loading state
  'loading.title': {
    en: 'Generating your simulation…',
    fr: 'Génération de votre simulation…'
  },
  'loading.aiApplying': {
    en: 'AI is applying {procedure} to your photo.',
    fr: 'L’IA applique {procedure} sur votre photo.'
  },
  'loading.timing': {
    en: 'This usually takes 15–30 seconds.',
    fr: 'Cela prend généralement de 15 à 30 secondes.'
  },

  // Error state
  'error.title': {
    en: 'Simulation unavailable right now.',
    fr: 'Simulation indisponible pour le moment.'
  },
  'error.bookDirectly': { en: 'Book Directly →', fr: 'Réserver directement →' },
  'error.fallbackMessage': {
    en: 'Simulation failed. Please try again.',
    fr: 'La simulation a échoué. Veuillez réessayer.'
  },

  // ---------- Clinic section ----------
  'clinic.locationBanner': {
    en: 'Showing clinics near {city}',
    fr: 'Cliniques à proximité de {city}'
  },
  'clinic.bookConsultation': {
    en: 'Book My Consultation →',
    fr: 'Réserver ma consultation →'
  },
  'clinic.visitWebsite': { en: 'Visit {host}', fr: 'Visiter {host}' },
  'clinic.seeOtherSingular': {
    en: 'See {n} other location',
    fr: 'Voir {n} autre emplacement'
  },
  'clinic.seeOtherPlural': {
    en: 'See {n} other locations',
    fr: 'Voir {n} autres emplacements'
  },
  'clinic.usePreciseLocation': {
    en: 'Use my precise location for better results',
    fr: 'Utiliser ma position précise pour de meilleurs résultats'
  },
  'clinic.locating': { en: 'Locating…', fr: 'Localisation…' },
  'clinic.googleReviews': { en: 'Google Reviews', fr: 'Avis Google' },
  'clinic.distanceKm': { en: '{n} km', fr: '{n} km' },

  // ---------- Action row (share / download) ----------
  'share.primary': { en: 'Share My Result', fr: 'Partager mon résultat' },
  'share.preparing': { en: 'Preparing…', fr: 'Préparation…' },
  'share.whatsapp': { en: 'WhatsApp', fr: 'WhatsApp' },
  'share.instagram': { en: 'Instagram', fr: 'Instagram' },
  'share.download': { en: 'Download', fr: 'Télécharger' },
  'share.tryAnother': {
    en: 'Try another procedure',
    fr: 'Essayer une autre intervention'
  },
  'share.captionCopied': { en: 'Caption copied', fr: 'Légende copiée' },
  'share.unavailable': { en: 'Share unavailable', fr: 'Partage indisponible' },
  'share.savedToDevice': {
    en: 'Saved to device',
    fr: 'Enregistré sur l’appareil'
  },
  'share.downloadFailed': {
    en: 'Download failed',
    fr: 'Échec du téléchargement'
  },
  'share.imageCopied': {
    en: 'Image copied — paste in chat',
    fr: 'Image copiée — collez-la dans le chat'
  },
  'share.openedWhatsapp': { en: 'Opened WhatsApp', fr: 'WhatsApp ouvert' },
  'share.imageSavedStory': {
    en: 'Image saved — add to your Story',
    fr: 'Image enregistrée — ajoutez-la à votre Story'
  },
  'share.whatsappAria': {
    en: 'Share to WhatsApp',
    fr: 'Partager sur WhatsApp'
  },
  'share.instagramAria': {
    en: 'Share to Instagram Story',
    fr: 'Partager sur Instagram Story'
  },
  'share.downloadAria': { en: 'Download image', fr: 'Télécharger l’image' },
  'share.captionTemplate': {
    en: 'My {procedure} simulation — SimFaceMD by Clinique Face MD. See it before you do it: {url}',
    fr: 'Ma simulation {procedure} — SimFaceMD par Clinique Face MD. Voyez-le avant de le faire : {url}'
  },
  'share.shareTitle': {
    en: 'My SimFaceMD Result',
    fr: 'Mon résultat SimFaceMD'
  },

  // ---------- Procedures (name + desc + treatmentTime) ----------
  'proc.ultrasonic_rhinoplasty.name': {
    en: 'Ultrasonic Rhinoplasty',
    fr: 'Rhinoplastie ultrasonique'
  },
  'proc.ultrasonic_rhinoplasty.desc': {
    en: 'Precision nose reshaping with piezoelectric instruments',
    fr: 'Remodelage précis du nez par instruments piézoélectriques'
  },
  'proc.ultrasonic_rhinoplasty.timing': {
    en: 'Surgery · 2–3 hr · Final result at 1 year',
    fr: 'Chirurgie · 2–3 h · Résultat final à 1 an'
  },

  'proc.deep_plane_facelift.name': {
    en: 'Deep Plane Facelift',
    fr: 'Lifting profond du visage'
  },
  'proc.deep_plane_facelift.desc': {
    en: 'Lift midface, jowls & neck as one unit',
    fr: 'Repositionne le tiers moyen, les bajoues et le cou en un seul plan'
  },
  'proc.deep_plane_facelift.timing': {
    en: 'Surgery · 4–5 hr · Final result at 1 year',
    fr: 'Chirurgie · 4–5 h · Résultat final à 1 an'
  },

  'proc.botox.name': { en: 'Botox', fr: 'Botox' },
  'proc.botox.desc': {
    en: "Soften forehead, frown lines & crow's feet",
    fr: 'Atténue les rides du front, du lion et de la patte d’oie'
  },
  'proc.botox.timing': {
    en: '15 min · Peak result at 2 weeks',
    fr: '15 min · Résultat optimal à 2 semaines'
  },

  'proc.lip_cheek_filler.name': {
    en: 'Lip & Cheek Filler',
    fr: 'Agents de comblement lèvres & pommettes'
  },
  'proc.lip_cheek_filler.desc': {
    en: 'Fuller lips, lifted cheekbones',
    fr: 'Lèvres pulpeuses, pommettes redessinées'
  },
  'proc.lip_cheek_filler.timing': {
    en: '30–45 min · Final result at 1 week',
    fr: '30–45 min · Résultat final à 1 semaine'
  },

  'proc.co2_laser.name': { en: 'CO2 Laser', fr: 'Laser CO2' },
  'proc.co2_laser.desc': {
    en: 'Smooth texture, fade lines & scarring',
    fr: 'Lisse la texture, atténue les rides et cicatrices'
  },
  'proc.co2_laser.timing': {
    en: 'Single session · Final result at 6 months',
    fr: 'Séance unique · Résultat final à 6 mois'
  },

  'proc.bbl_photofacial.name': {
    en: 'BBL Photofacial',
    fr: 'Photofacial BBL'
  },
  'proc.bbl_photofacial.desc': {
    en: 'Fade sun spots, redness & uneven tone',
    fr: 'Atténue les taches solaires, rougeurs et teint irrégulier'
  },
  'proc.bbl_photofacial.timing': {
    en: '30 min · Optimal result at 1 week',
    fr: '30 min · Résultat optimal à 1 semaine'
  },

  // ---------- Pricing strings ----------
  // We keep the procedure-specific "Starting at" prefix translated and
  // join the numeric amount in code. CAD suffix uses 'result.cadSuffix'.
  'price.startingAt': {
    en: 'Starting at ${amount}',
    fr: 'À partir de {amount} $'
  }
} as const;

type DictKey = keyof typeof DICT;

/* ------------------------------------------------------------------ */
/*  Context + provider                                                 */
/* ------------------------------------------------------------------ */

type I18nContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(
  str: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Default = English. We hydrate from localStorage on mount only.
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'fr' || saved === 'en') {
        setLangState(saved);
      }
    } catch {
      // localStorage may be blocked (private mode, etc.) — silently keep default.
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    // Update <html lang> so screen-readers and form-fill heuristics
    // pick up the change.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l;
    }
  }, []);

  const toggle = useCallback(() => {
    setLang(lang === 'en' ? 'fr' : 'en');
  }, [lang, setLang]);

  const t = useCallback<I18nContextValue['t']>(
    (key, vars) => {
      const entry = DICT[key];
      if (!entry) {
        // Missing keys should be loud in dev, quiet in prod.
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn(`[i18n] missing key: ${String(key)}`);
        }
        return String(key);
      }
      const raw = entry[lang] ?? entry.en;
      return interpolate(raw, vars);
    },
    [lang]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, toggle, t }),
    [lang, setLang, toggle, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside <LanguageProvider>');
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Helpers for procedure metadata                                     */
/* ------------------------------------------------------------------ */

export type ProcedureId =
  | 'ultrasonic_rhinoplasty'
  | 'deep_plane_facelift'
  | 'botox'
  | 'lip_cheek_filler'
  | 'co2_laser'
  | 'bbl_photofacial';

/** Numeric starting price (no currency formatting). */
export const PROCEDURE_STARTING_PRICE: Record<ProcedureId, number> = {
  ultrasonic_rhinoplasty: 11900,
  deep_plane_facelift: 23800,
  botox: 400,
  lip_cheek_filler: 625,
  co2_laser: 2800,
  bbl_photofacial: 465
};

/** Whether the price is from cliniquefacemd.com/prices vs Montreal market. */
export const PROCEDURE_IS_PUBLISHED_PRICE: Record<ProcedureId, boolean> = {
  ultrasonic_rhinoplasty: true,
  deep_plane_facelift: true,
  botox: false,
  lip_cheek_filler: false,
  co2_laser: true,
  bbl_photofacial: true
};

export const PROCEDURE_IDS: ProcedureId[] = [
  'ultrasonic_rhinoplasty',
  'deep_plane_facelift',
  'botox',
  'lip_cheek_filler',
  'co2_laser',
  'bbl_photofacial'
];

/**
 * Format an integer price in a locale-appropriate way. We always use
 * fr-CA / en-CA grouping (space vs comma). Decimal cents are dropped —
 * "Starting at" prices are always whole dollars.
 */
export function formatPrice(amount: number, lang: Lang): string {
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0
  }).format(amount);
}
