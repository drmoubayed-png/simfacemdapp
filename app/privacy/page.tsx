'use client';

/**
 * Privacy Policy — bilingual (EN/FR), Quebec Law 25 / PIPEDA aligned.
 *
 * Content reflects exactly what the app actually does:
 *   • No accounts, no email/name capture.
 *   • Photos sent to fal.ai for simulation; not retained by us.
 *   • Anonymous analytics events stored in Postgres for clinic billing
 *     and traffic geography; no IP, no personal identifiers.
 *   • Per-tab session ID via sessionStorage (not a cookie, expires when
 *     the tab closes).
 *
 * If the actual data flow changes, update this page. Do not let it
 * drift from reality — that's where regulatory trouble starts.
 */

import Link from 'next/link';
import { useI18n } from '../lib/i18n';

export default function PrivacyPage() {
  const { lang } = useI18n();
  const isFr = lang === 'fr';
  const updated = '2026-05-09';

  return (
    <main
      className="min-h-screen px-5 py-10 max-w-2xl mx-auto"
      style={{ color: 'rgba(255,255,255,0.85)' }}
    >
      <Link
        href="/"
        className="text-[12px] uppercase tracking-[0.2em] mb-8 inline-block"
        style={{ color: '#C9A84C' }}
      >
        {isFr ? '\u2190 Retour' : '\u2190 Back'}
      </Link>

      <h1
        style={{
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontSize: '36px',
          fontWeight: 400,
          lineHeight: 1.1
        }}
      >
        {isFr ? 'Politique de confidentialit\u00e9' : 'Privacy Policy'}
      </h1>
      <p className="mt-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {isFr ? 'Derni\u00e8re mise \u00e0 jour' : 'Last updated'}: {updated}
      </p>

      {isFr ? <FrenchPolicy /> : <EnglishPolicy />}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2
        className="text-[18px] mb-3"
        style={{ color: '#FFFFFF', fontWeight: 500 }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-[14px] leading-relaxed">{children}</div>
    </section>
  );
}

function EnglishPolicy() {
  return (
    <>
      <Section title="In plain English">
        <p>
          SimFaceMD is operated by Clinique Face MD (Montr\u00e9al, Qu\u00e9bec). We
          do not require an account. We do not ask for your name, email,
          or phone number. The simulation runs in your browser; nothing
          you do here is tied to your real identity.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <strong style={{ color: '#FFFFFF' }}>Photos you upload.</strong>{' '}
          Your photo is sent to our AI image-processing partner (fal.ai)
          to generate the simulated result, then discarded. We do not
          store your photos on our servers.
        </p>
        <p>
          <strong style={{ color: '#FFFFFF' }}>Anonymous usage events.</strong>{' '}
          When you complete a simulation, view a clinic recommendation,
          click \u201CBook My Consultation,\u201D or share a result, we record an
          event with: a random per-tab session ID, the procedure
          simulated, the clinic shown, and an approximate city/region/
          country derived from your IP address (we do NOT store the IP
          itself).
        </p>
        <p>
          <strong style={{ color: '#FFFFFF' }}>Optional precise location.</strong>{' '}
          If you tap \u201CUse my location\u201D we ask your browser for GPS
          coordinates so we can recommend the closest clinic. You can
          decline; the app works either way.
        </p>
      </Section>

      <Section title="What we do NOT collect">
        <ul className="list-disc pl-5 space-y-1">
          <li>Your name, email, or phone number</li>
          <li>Your IP address (used at request time, never stored)</li>
          <li>Cookies or persistent identifiers across sessions</li>
          <li>Any health information or medical history</li>
          <li>Tracking pixels from advertising networks</li>
        </ul>
      </Section>

      <Section title="Why we collect this">
        <p>
          To improve the service, measure traffic, and \u2014 where applicable
          \u2014 bill partner aesthetic clinics for referral leads we send
          them. This is standard \u201Clegitimate business interest\u201D
          processing under Qu\u00e9bec\u2019s Loi 25 and Canada\u2019s PIPEDA.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          <strong style={{ color: '#FFFFFF' }}>fal.ai</strong> \u2014 image
          processing only, photos discarded after generation.
        </p>
        <p>
          <strong style={{ color: '#FFFFFF' }}>Vercel</strong> \u2014 hosting
          and database provider, located in North America.
        </p>
        <p>
          <strong style={{ color: '#FFFFFF' }}>Partner clinics</strong> \u2014
          we may share aggregate or per-lead counts (with city, procedure,
          and timestamp) for billing. We do NOT share your photo or any
          personal identifier.
        </p>
        <p>We do not sell data to anyone, ever.</p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Anonymous event data is retained for up to 24 months for
          historical reporting, then deleted. Photos are not retained at
          all; they exist only in transit during the simulation request.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under Qu\u00e9bec\u2019s Loi 25 you have the right to access, correct,
          or delete personal information held about you. Because we don\u2019t
          collect personal identifiers, we typically cannot tie any
          stored event back to a specific person. If you believe we hold
          information about you, contact us at{' '}
          <a
            href="mailto:privacy@cliniquefacemd.com"
            style={{ color: '#C9A84C' }}
          >
            privacy@cliniquefacemd.com
          </a>
          .
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Clinique Face MD
          <br />
          Westmount, Qu\u00e9bec, Canada
          <br />
          <a
            href="mailto:privacy@cliniquefacemd.com"
            style={{ color: '#C9A84C' }}
          >
            privacy@cliniquefacemd.com
          </a>
        </p>
      </Section>
    </>
  );
}

function FrenchPolicy() {
  return (
    <>
      <Section title="En clair">
        <p>
          SimFaceMD est exploit\u00e9 par Clinique Face MD (Montr\u00e9al, Qu\u00e9bec).
          Aucun compte requis. Nous ne demandons ni votre nom, ni votre
          courriel, ni votre num\u00e9ro de t\u00e9l\u00e9phone. La simulation se
          d\u00e9roule dans votre navigateur; rien ici n\u2019est li\u00e9 \u00e0 votre
          identit\u00e9 r\u00e9elle.
        </p>
      </Section>

      <Section title="Ce que nous recueillons">
        <p>
          <strong style={{ color: '#FFFFFF' }}>Vos photos.</strong> Votre
          photo est transmise \u00e0 notre partenaire de traitement d\u2019image
          (fal.ai) pour g\u00e9n\u00e9rer la simulation, puis supprim\u00e9e. Nous
          n\u2019entreposons pas vos photos sur nos serveurs.
        </p>
        <p>
          <strong style={{ color: '#FFFFFF' }}>\u00c9v\u00e9nements d\u2019usage anonymes.</strong>{' '}
          Lorsque vous terminez une simulation, voyez une recommandation
          de clinique, cliquez \u00ab R\u00e9server ma consultation \u00bb ou partagez
          un r\u00e9sultat, nous enregistrons un \u00e9v\u00e9nement contenant : un
          identifiant de session al\u00e9atoire (par onglet), la proc\u00e9dure
          simul\u00e9e, la clinique propos\u00e9e, ainsi qu\u2019une ville/province/
          pays approximatifs d\u00e9duits de votre adresse IP (nous
          n\u2019entreposons PAS l\u2019adresse IP elle-m\u00eame).
        </p>
        <p>
          <strong style={{ color: '#FFFFFF' }}>Localisation pr\u00e9cise (facultative).</strong>{' '}
          Si vous activez \u00ab Utiliser ma position \u00bb, votre navigateur nous
          transmet des coordonn\u00e9es GPS afin de recommander la clinique la
          plus proche. Vous pouvez refuser; l\u2019application fonctionne dans
          tous les cas.
        </p>
      </Section>

      <Section title="Ce que nous ne recueillons PAS">
        <ul className="list-disc pl-5 space-y-1">
          <li>Votre nom, courriel ou num\u00e9ro de t\u00e9l\u00e9phone</li>
          <li>Votre adresse IP (utilis\u00e9e \u00e0 la r\u00e9ception, jamais stock\u00e9e)</li>
          <li>Cookies ou identifiants persistants entre les sessions</li>
          <li>Information de sant\u00e9 ou ant\u00e9c\u00e9dents m\u00e9dicaux</li>
          <li>Pixels publicitaires de r\u00e9seaux tiers</li>
        </ul>
      </Section>

      <Section title="Pourquoi nous le recueillons">
        <p>
          Pour am\u00e9liorer le service, mesurer l\u2019achalandage, et \u2014 le cas
          \u00e9ch\u00e9ant \u2014 facturer nos cliniques esth\u00e9tiques partenaires pour
          les r\u00e9f\u00e9rences. Il s\u2019agit d\u2019un traitement bas\u00e9 sur l\u2019int\u00e9r\u00eat
          l\u00e9gitime, conforme \u00e0 la Loi 25 du Qu\u00e9bec et \u00e0 la LPRPDE f\u00e9d\u00e9rale.
        </p>
      </Section>

      <Section title="Avec qui nous le partageons">
        <p>
          <strong style={{ color: '#FFFFFF' }}>fal.ai</strong> \u2014 traitement
          d\u2019image uniquement, photos supprim\u00e9es apr\u00e8s g\u00e9n\u00e9ration.
        </p>
        <p>
          <strong style={{ color: '#FFFFFF' }}>Vercel</strong> \u2014 h\u00e9bergement
          et base de donn\u00e9es, en Am\u00e9rique du Nord.
        </p>
        <p>
          <strong style={{ color: '#FFFFFF' }}>Cliniques partenaires</strong>{' '}
          \u2014 nous pouvons leur transmettre des d\u00e9comptes agr\u00e9g\u00e9s ou par
          r\u00e9f\u00e9rence (ville, proc\u00e9dure, horodatage) \u00e0 des fins de
          facturation. Nous ne partageons JAMAIS votre photo ni d\u2019identifiant
          personnel.
        </p>
        <p>Nous ne vendons aucune donn\u00e9e \u00e0 qui que ce soit.</p>
      </Section>

      <Section title="Dur\u00e9e de conservation">
        <p>
          Les \u00e9v\u00e9nements anonymes sont conserv\u00e9s pendant 24 mois maximum
          pour les rapports historiques, puis supprim\u00e9s. Les photos ne
          sont pas conserv\u00e9es; elles n\u2019existent qu\u2019en transit pendant la
          simulation.
        </p>
      </Section>

      <Section title="Vos droits">
        <p>
          La Loi 25 vous donne le droit d\u2019acc\u00e9der, de corriger ou de
          supprimer les renseignements personnels vous concernant. Comme
          nous ne recueillons aucun identifiant personnel, il nous est
          g\u00e9n\u00e9ralement impossible de relier un \u00e9v\u00e9nement stock\u00e9 \u00e0 une
          personne. Si vous croyez que nous d\u00e9tenons de l\u2019information
          vous concernant, \u00e9crivez-nous \u00e0{' '}
          <a
            href="mailto:privacy@cliniquefacemd.com"
            style={{ color: '#C9A84C' }}
          >
            privacy@cliniquefacemd.com
          </a>
          .
        </p>
      </Section>

      <Section title="Coordonn\u00e9es">
        <p>
          Clinique Face MD
          <br />
          Westmount, Qu\u00e9bec, Canada
          <br />
          <a
            href="mailto:privacy@cliniquefacemd.com"
            style={{ color: '#C9A84C' }}
          >
            privacy@cliniquefacemd.com
          </a>
        </p>
      </Section>
    </>
  );
}
