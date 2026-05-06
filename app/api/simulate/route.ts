import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * SimFaceMD v3 — Model + Prompt rewrite
 * --------------------------------------
 * MODEL: Switched from FLUX.1 Kontext [pro] to Google Gemini 2.5 Flash Image
 * (a.k.a. "Nano Banana") via fal — `fal-ai/gemini-25-flash-image/edit`.
 *
 * Why: Independent benchmarks (Wiro AI, fal's own 2026 model report,
 * Google's SOTA claim on the 2.5 Flash Image release) show Nano Banana
 * meaningfully better than FLUX Kontext at IDENTITY PRESERVATION on
 * face edits. FLUX Kontext, even with v2 prompts, drifted on rhinoplasty
 * and facelift edits because it has stronger generative pull for face
 * reshaping. Nano Banana's instruction following + content preservation
 * is purpose-built for "edit one thing, leave the rest" tasks. Same
 * fal account, slightly cheaper ($0.039 vs FLUX Kontext pro $0.04).
 *
 * PROMPT FORMAT: Adopted Black Forest Labs' / Replicate's documented
 * best-practice structure — but generalised to any image-edit model
 * since they all reward the same patterns:
 *
 *     Change the [SPECIFIC ELEMENT] [SPECIFIC CHANGE] while keeping
 *     [PERSON ANCHOR], [identity markers], and [composition/lighting]
 *     exactly the same.
 *
 * Five rules (BFL official prompt guide):
 *
 *   1. Use "Change the [X]" — NOT "Transform", "Edit", "Show".
 *      "Transform" triggers identity swap. "Show" triggers generation.
 *      "Change the [specific element]" is the only verb that BFL's
 *      official guide recommends for controlled edits.
 *
 *   2. Name the subject directly with a descriptive phrase ("the woman
 *      in the red turtleneck", not "her") — pronouns are too vague.
 *
 *   3. State preservation explicitly with "while keeping ... exactly
 *      the same". Don't list 30 features — list the high-signal ones:
 *      facial features, expression, hair, lighting, composition.
 *
 *   4. Be specific about the change with anatomical landmarks.
 *
 *   5. Use precise magnitude language: "subtle", "natural", "slight".
 *      Never "dramatic", "complete", "transform".
 *
 * Each prompt is intentionally SHORT. The BFL guide and our v2 testing
 * both show that long prompts (300+ words) actually hurt — token
 * budget is 512 and the model weights early tokens far more.
 */

/**
 * Prompt format note (v3.1):
 * Per BFL prompt guide & Replicate Kontext docs, the model retains the
 * source image best when prompts are SHORT (under ~50 words) and use the
 * exact pattern: "Edit the [region] of the person in the photo to [exact
 * change]. Keep everything else identical." The earlier 100+ word
 * preservation lists actually hurt — the model interprets the long list
 * as instructions to redraw, then has to balance against many constraints.
 *
 * One change. One region. Identical everything else. That's it.
 */
const PROCEDURE_PROMPTS: Record<string, string> = {
  ultrasonic_rhinoplasty:
    "Edit the photo to subtly refine the person's nose: smooth out any " +
    "dorsal hump on the bridge for a clean profile, slightly narrow the " +
    "bony pyramid, and gently rotate the tip up by ~5 degrees. Make the " +
    "new nose look natural and harmonious. Keep the rest of the photo " +
    "— face, smile, teeth, lipstick, eyes, hair, skin, lighting, " +
    "background, clothing — pixel-for-pixel identical.",

  deep_plane_facelift:
    "Edit the photo to show the result of a subtle deep plane facelift: " +
    "lift the cheek fat pad slightly higher on the cheekbone, smooth the " +
    "jowls along the jawline, soften the nasolabial folds, and tighten " +
    "the under-chin area for a sharper neckline. Keep the rest of the " +
    "photo — face, smile, teeth, lipstick, eyes, hair, skin pores and " +
    "texture, lighting, background, clothing — pixel-for-pixel identical. " +
    "Naturally tightened, never pulled or wind-tunneled.",

  botox:
    "Edit the photo to soften the person's forehead lines, the vertical " +
    "'11' lines between the eyebrows, and the crow's feet at the outer " +
    "corners of the eyes, as if from expert Botox at the 2-week peak. " +
    "Leave subtle natural movement — not frozen or waxy. Keep the rest " +
    "of the photo — face shape, smile, teeth, lipstick, eyes, hair, " +
    "skin pores, lighting, background, clothing — pixel-for-pixel " +
    "identical.",

  lip_cheek_filler:
    "Edit the photo to add subtle natural volume to the person's lips " +
    "(slightly fuller upper and lower lip with a sharper vermilion " +
    "border) and a touch of volume high on the cheekbones, as if from " +
    "~1ml hyaluronic acid filler in the lips and ~1ml per cheek at the " +
    "1-week settled result. Never duck-shaped or overfilled. Keep the " +
    "rest of the photo — face shape, smile, teeth, lipstick color, " +
    "eyes, nose, hair, jawline, lighting, background, clothing — " +
    "pixel-for-pixel identical.",

  co2_laser:
    "Edit the photo to refine the surface of the person's skin: smooth " +
    "texture, fade fine lines around the eyes and mouth, soften acne " +
    "scarring and surface irregularities, and even out surface tone for " +
    "a more luminous complexion, as if 6 months after a single full-face " +
    "fractional CO2 laser resurfacing. Keep realistic pores and natural " +
    "tone variation — not plastic or filtered. Keep the rest of the " +
    "photo — face shape, features, smile, teeth, lipstick, eyes, hair, " +
    "freckles, lighting, background, clothing — pixel-for-pixel identical.",

  bbl_photofacial:
    "Edit the photo to clarify the person's skin tone: fade brown sun " +
    "spots and pigment patches, reduce redness and broken capillaries " +
    "on the cheeks and nose, and produce a more even, clear, luminous " +
    "complexion with a healthy glow, as if 1 week after a series of " +
    "three Sciton BBL photofacials. Pigment and vascular only — do " +
    "NOT smooth or resurface texture. Keep the rest of the photo — " +
    "face shape, features, smile, teeth, lipstick, eyes, hair, skin " +
    "pores and texture, lighting, background, clothing — pixel-for-pixel " +
    "identical."
};

const FAL_MODEL = 'fal-ai/gemini-25-flash-image/edit';

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

    // Upload once to fal CDN; Nano Banana wants public URLs in image_urls.
    const imageUrl = await fal.storage.upload(file);
    const prompt = PROCEDURE_PROMPTS[procedure];

    // Gemini 2.5 Flash Image (Nano Banana) — image_urls is an array.
    // SOTA at identity preservation per Wiro AI / fal benchmarks.
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        prompt,
        image_urls: [imageUrl],
        num_images: 1,
        output_format: 'jpeg',
        aspect_ratio: 'auto',
        safety_tolerance: '4'
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
