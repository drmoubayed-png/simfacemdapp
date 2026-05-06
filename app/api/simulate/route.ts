import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * FLUX.1 Kontext prompting strategy (v2)
 * --------------------------------------
 * Empirical learning from v1: prompts that opened with "Show the result of..."
 * triggered Kontext's GENERATIVE pathway — it produced a new portrait of
 * "what a typical post-procedure patient looks like", losing the original
 * person's identity even with strong preservation clauses.
 *
 * v2 fixes this by following four rules consistently:
 *
 *   1. OPEN WITH AN EDIT VERB. Every prompt starts with "Edit this photo:".
 *      This is the single most important word choice. It puts Kontext in
 *      its image-editing mode, where it preserves the source by default and
 *      only applies the requested modification. "Show", "Generate",
 *      "Create", "Transform" all activate generation pathways and lose
 *      identity.
 *
 *   2. PRESERVATION FIRST. List what must NOT change before describing what
 *      should change. Kontext weights early tokens more heavily. Anchoring
 *      identity (face shape, eye color, hairstyle, expression, skin tone,
 *      pose, lighting, background) before the edit instruction prevents
 *      drift.
 *
 *   3. SINGLE LOCALIZED INSTRUCTION. One anatomical change per prompt,
 *      named with a precise medical landmark (vermilion border, dorsal hump,
 *      malar eminence, glabellar lines, cervicomental angle). Vague
 *      "refresh / improve / enhance" phrasing makes Kontext over-edit.
 *
 *   4. EXPLICIT MAGNITUDE. "Subtle", "moderate", "slight", "natural".
 *      Surgical-magnitude language has appeared in training data and the
 *      model respects it. Avoid "dramatic", "complete", "transformation".
 *
 * Where the procedure inherently transforms the subject too far for
 * Kontext to preserve identity (notably deep plane facelift on a young
 * subject), we keep the prompt anatomically correct and rely on the UI
 * to disclose that this is an aesthetic preview, not a forensic prediction.
 */

const PROCEDURE_PROMPTS: Record<string, string> = {
  // -------------------------------------------------------------------------
  // ULTRASONIC RHINOPLASTY
  // Real procedure: piezoelectric instruments precisely sculpt nasal bone —
  // characteristic outcomes are a smoothed dorsum, refined supratip break,
  // narrower bony pyramid, and a slightly rotated, more defined tip.
  // -------------------------------------------------------------------------
  ultrasonic_rhinoplasty:
    "Edit this photo: keep the exact same person — preserve their face " +
    "shape, eye shape, eye color, eyebrows, lips, lipstick color and " +
    "finish, teeth, smile, mouth opening, chin, jawline, hairstyle, " +
    "hairline, ears, skin tone, skin texture, freckles, makeup, expression, " +
    "head tilt, head pose, camera angle, lighting, background blur, and " +
    "clothing exactly as they appear. The only change is to the nose: " +
    "subtly smooth any dorsal hump on the nasal bridge so the profile is " +
    "a clean line from radix to tip; refine and slightly define the nasal " +
    "tip with a 5-degree upward rotation; slightly narrow the bony pyramid " +
    "and the alar base. The new nose must remain natural, harmonious, " +
    "gender-appropriate, and never pinched or operated-looking. Every " +
    "other feature stays identical. Same person, same smile, same teeth " +
    "showing, same lipstick.",

  // -------------------------------------------------------------------------
  // DEEP PLANE FACELIFT
  // Real procedure: SMAS released in a deep plane; lifts midface, jowls,
  // and neck as one composite unit. Hallmarks: restored cheek volume high
  // on the malar bone, sharp cervicomental angle, jowl elimination,
  // smoother nasolabial folds, tighter neckline.
  //
  // Note: This is the hardest edit for Kontext because the model has no
  // anchor on a young subject. We frame as a localized lift edit, not a
  // "de-age" — which keeps identity drift lower in testing.
  // -------------------------------------------------------------------------
  deep_plane_facelift:
    "Edit this photo: keep the person's identity, eye shape and color, " +
    "eyebrows, nose, lips, hairstyle, hairline, ears, skin tone, expression, " +
    "head pose, camera angle, lighting, background, and clothing exactly " +
    "the same. Modify only the lower face and neck to show the result of " +
    "an expert deep plane facelift: subtly lift the malar fat pad higher " +
    "on the cheekbone for restored upper-cheek fullness; smooth the jowls " +
    "along the jawline so the mandibular border is clean and continuous; " +
    "soften but do not erase the nasolabial folds; tighten the submental " +
    "area to create a sharper cervicomental angle. Skin must look naturally " +
    "tightened, never pulled, stretched, or wind-tunneled. Preserve " +
    "realistic skin texture with visible pores; no airbrushed appearance. " +
    "The person must remain immediately recognizable as the same individual.",

  // -------------------------------------------------------------------------
  // BOTOX (Wrinkle Relaxer)
  // Real procedure: neuromodulator relaxes specific muscles. Targets:
  // frontalis (horizontal forehead lines), corrugators/procerus (glabellar
  // 11s), orbicularis oculi (crow's feet). Frozen forehead = bad outcome.
  // -------------------------------------------------------------------------
  botox:
    "Edit this photo: keep the person's identity, face shape, eye shape and " +
    "color, eyebrow shape and position, nose, lips, cheeks, jawline, " +
    "hairstyle, skin tone, expression, head pose, camera angle, lighting, " +
    "background, and clothing exactly the same. Modify only forehead and " +
    "eye-area wrinkles: soften the horizontal forehead lines until they " +
    "are barely visible at rest; smooth the vertical glabellar '11' lines " +
    "between the eyebrows; soften the crow's feet at the outer corners of " +
    "the eyes. Do not flatten or freeze the forehead — leave subtle natural " +
    "movement. Skin must keep realistic texture and pores; never shiny, " +
    "waxy, or airbrushed. Do not change face shape, volume, or bone " +
    "structure.",

  // -------------------------------------------------------------------------
  // LIP & CHEEK FILLER (combo)
  // Real procedure: HA filler — ~1ml lips for hydration & vermilion
  // definition; ~1–2ml each cheek high on the zygoma for malar projection
  // and a subtle midface lift.
  // -------------------------------------------------------------------------
  lip_cheek_filler:
    "Edit this photo: keep the exact same person — preserve their face " +
    "shape, eye shape, eye color, eyebrows, nose, jawline, chin, teeth, " +
    "smile, mouth opening, hairstyle, skin tone, skin texture, makeup, " +
    "lipstick color and finish, expression, head pose, camera angle, " +
    "lighting, background, and clothing exactly as they appear. The only " +
    "changes are subtle natural volume in the lips and high on the upper " +
    "cheekbones, as if from approximately 1ml of hyaluronic acid filler " +
    "in the lips and 1ml per cheek placed by an expert medical injector. " +
    "Lips: add subtle volume to upper and lower lip with sharper " +
    "definition at the vermilion border, keeping the lower lip slightly " +
    "fuller; never duck-like, shelf-shaped, or overfilled. Cheeks: place " +
    "subtle volume high on the malar eminence (upper outer cheekbone) " +
    "to gently restore the apple of the cheek; never pillow-faced. Same " +
    "person, same smile, same teeth showing, same lipstick. Every other " +
    "feature stays identical.",

  // -------------------------------------------------------------------------
  // CO2 LASER RESURFACING
  // Real procedure: fractional ablative laser. Outcomes (3 months out):
  // smoother texture, reduced fine lines, improved skin reflectance,
  // softened acne scarring & sun damage. NOT a face shape change.
  // -------------------------------------------------------------------------
  co2_laser:
    "Edit this photo: keep the person's identity, face shape, eye shape and " +
    "color, eyebrows, nose, lips, jawline, chin, hairstyle, expression, " +
    "head pose, camera angle, lighting, background, clothing, and overall " +
    "skin tone (warmth and undertone) exactly the same. Modify only skin " +
    "surface quality to show the result 3 months after a single full-face " +
    "fractional CO2 laser resurfacing treatment by an expert dermatologist: " +
    "smooth the skin surface, reduce fine lines around the eyes and mouth, " +
    "soften acne scarring and surface irregularities, even out surface " +
    "discoloration, and produce a more luminous complexion. Skin must " +
    "retain realistic pores and natural tone variation — never plastic, " +
    "airbrushed, or filter-like. Preserve any freckles or birthmarks " +
    "present in the original. Do not change facial volume, bone structure, " +
    "or anatomy of any kind.",

  // -------------------------------------------------------------------------
  // BBL PHOTOFACIAL (BroadBand Light / IPL by Sciton)
  // Real procedure: pulsed light targeting pigment & vascular lesions.
  // Outcomes: clearer reds (rosacea, telangiectasia), faded brown spots
  // (sun damage, melasma fragments), more even tone, healthier glow.
  // Texture is unchanged — that's what separates BBL from CO2.
  // -------------------------------------------------------------------------
  bbl_photofacial:
    "Edit this photo: keep the person's identity, face shape, eye shape and " +
    "color, eyebrows, nose, lips, jawline, chin, hairstyle, expression, " +
    "head pose, camera angle, lighting, background, clothing, and skin " +
    "texture (pores, fine lines, surface detail) exactly the same. Modify " +
    "only skin tone clarity to show the result 4 weeks after a series of " +
    "three Sciton BBL (BroadBand Light / IPL) photofacial treatments by " +
    "an expert dermatologist: fade brown sun spots, age spots, and " +
    "pigmented lesions; reduce facial redness, broken capillaries, and " +
    "rosacea flushing on cheeks and nose; produce a more even, clear, " +
    "luminous skin tone with a healthy natural glow. This is a pigment " +
    "and vascular treatment only — do not smooth, airbrush, or resurface " +
    "the skin texture, and do not change facial volume, bone structure, " +
    "or anatomy."
};

export async function POST(req: NextRequest) {
  try {
    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { error: 'Server is missing FAL_KEY environment variable.' },
        { status: 500 }
      );
    }

    const { imageBase64, procedure } = (await req.json()) as {
      imageBase64?: string;
      procedure?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'Missing image.' }, { status: 400 });
    }

    if (!procedure || !PROCEDURE_PROMPTS[procedure]) {
      return NextResponse.json(
        { error: 'Invalid procedure.' },
        { status: 400 }
      );
    }

    const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = imageBase64.replace(
      /^data:image\/[a-zA-Z+]+;base64,/,
      ''
    );
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length === 0) {
      return NextResponse.json(
        { error: 'Invalid image data.' },
        { status: 400 }
      );
    }

    const blob = new Blob([buffer], { type: mime });
    const file = new File([blob], `upload.${mime.split('/')[1] || 'jpg'}`, {
      type: mime
    });

    const imageUrl = await fal.storage.upload(file);
    const prompt = PROCEDURE_PROMPTS[procedure];

    // FLUX.1 Kontext [pro]: image-to-image edit conditioned on the source.
    // Tunables exposed by the schema: guidance_scale, safety_tolerance,
    // output_format, aspect_ratio, seed.
    //
    // Guidance scale 3.5 is BFL's default and works well for portraits;
    // higher (4.5–5.5) over-tightens to the prompt and damages identity.
    const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
      input: {
        image_url: imageUrl,
        prompt,
        guidance_scale: 3.5,
        safety_tolerance: '2',
        output_format: 'jpeg'
      },
      logs: false
    });

    const resultUrl = (result as any)?.data?.images?.[0]?.url;
    if (!resultUrl) {
      return NextResponse.json(
        { error: 'No image returned from model.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ resultUrl });
  } catch (error: any) {
    console.error('[/api/simulate] error:', error);

    const status: number | undefined = error?.status;
    const detail: string | undefined =
      error?.body?.detail || error?.body?.message || error?.message;

    if (status === 401) {
      return NextResponse.json(
        { error: 'Authentication failed. Check your FAL_KEY.' },
        { status: 500 }
      );
    }
    if (status === 403 && /balance|locked|exhausted/i.test(detail || '')) {
      return NextResponse.json(
        {
          error:
            'Service temporarily unavailable. Please try again later or book a consultation directly.'
        },
        { status: 503 }
      );
    }
    if (status === 429) {
      return NextResponse.json(
        {
          error:
            'Too many requests right now. Please wait a moment and try again.'
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Simulation failed. Please try again.' },
      { status: 500 }
    );
  }
}
