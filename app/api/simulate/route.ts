import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Nano Banana Pro can take 25–40s per request; allow up to 90s end-to-end.
export const maxDuration = 90;

/**
 * SimFaceMD v4 — Nano Banana Pro + directive prompts
 * --------------------------------------------------
 * MODEL: Switched from Gemini 2.5 Flash Image to **Gemini 3 Pro Image**
 * (a.k.a. Nano Banana Pro), `fal-ai/nano-banana-pro/edit`. $0.15 per
 * image at 2K. Reasoning: Flash was too conservative — on cosmetic-edit
 * prompts it would preserve the entire face including the very feature
 * we asked it to change, producing essentially identical before/after
 * images. Pro has Gemini 3's deeper semantic reasoning and is built for
 * "interpret nuanced editing instructions like make the sunset more
 * dramatic while preserving the original mood." That nuanced reasoning
 * is exactly what cosmetic procedure simulation requires: change the
 * specific anatomy, keep the person.
 *
 * Same fal account, same FAL_KEY. 4× the per-image cost of Flash, but
 * a simulator that doesn't show changes is worthless at any price.
 *
 * PROMPT FORMAT: Adopted Google's official "Inpainting" template from
 * the Nano Banana prompt guide:
 *
 *   "Using the provided image, change only [SPECIFIC ELEMENT] to
 *    [NEW DESCRIPTION]. Keep everything else exactly the same..."
 *
 * Each prompt:
 *   1. Names the procedure with explicit anatomical landmarks
 *   2. Quantifies the change (mm, %, degrees) — the model respects
 *      numeric magnitude where it ignores fuzzy adjectives
 *   3. Uses imperative verbs ERASE / TIGHTEN / NARROW / LIFT / ADD
 *      VOLUME — soft verbs like "soften" or "subtly refine" produced
 *      no visible change in testing
 *   4. Lists the preservation set explicitly (eyes, mouth, expression,
 *      hair, lighting, background, head angle, aspect ratio)
 */
const PROCEDURE_PROMPTS: Record<string, string> = {
  ultrasonic_rhinoplasty:
    "Using the provided image, perform a clearly visible ultrasonic " +
    "rhinoplasty edit on the patient's nose. Make the nose noticeably " +
    "narrower from bridge to tip — reduce nasal width by 25%. Refine " +
    "and lift the nasal tip rotation by 5 degrees making it more " +
    "upturned and defined. Straighten the dorsum, removing any hump. " +
    "Narrow the alar base. The new nose must be visibly smaller and " +
    "more refined — like an obvious surgical result — while still " +
    "looking natural and proportionate. Keep everything else " +
    "identical: same person, same eyes, eyebrows, mouth, lips, teeth, " +
    "skin tone, hair, makeup, lighting, background, head angle, and " +
    "expression. Do not change the aspect ratio.",

  deep_plane_facelift:
    "Using the provided image, perform a clearly visible deep plane " +
    "face and neck lift edit at 1 year post-op. Tighten and lift the " +
    "jowls so the jawline becomes sharply defined. Lift the midface " +
    "tissue up and outward by 4-5 millimeters, restoring the youthful " +
    "cheekbone projection. Tighten the neck completely — eliminate " +
    "all sagging skin, platysmal banding, and laxity so the " +
    "cervicomental angle becomes crisp at 105 degrees. Reduce the " +
    "nasolabial folds and marionette lines by 70%. The patient should " +
    "look 10-12 years younger but unmistakably the same person. Keep " +
    "everything else identical: same eyes, eyebrows, nose, mouth, " +
    "lips, teeth, skin tone, hair, makeup, lighting, background, " +
    "head angle, and expression. Do not change the aspect ratio.",

  botox:
    "Using the provided image, perform a clearly visible botox " +
    "treatment edit at 2 weeks post-injection, targeting the three " +
    "upper-face areas only. " +
    "AREA 1 — FOREHEAD: ERASE every single horizontal forehead " +
    "wrinkle and crease across the entire forehead. The forehead " +
    "skin must look completely smooth and taut from hairline to " +
    "brow. " +
    "AREA 2 — GLABELLA: ERASE the vertical 11-lines (frown lines) " +
    "between the eyebrows. The glabella must look completely smooth " +
    "with no vertical creases. " +
    "AREA 3 — CROW'S FEET: ERASE every wrinkle, fine line, and " +
    "crease at the outer corners of both eyes (the lateral canthal " +
    "rhytids). The skin around both eyes must look completely " +
    "smooth. " +
    "Overall the upper face should look glassy, lifted, and " +
    "youthful — like a perfect 2-week botox result. Do not change " +
    "eyebrow position or shape. Do not change the lower face, " +
    "cheeks, mouth, or any wrinkles below the eyes. Keep everything " +
    "else identical: same person, same eyes, nose, mouth, lips, " +
    "teeth, cheeks, jawline, skin tone, hair, makeup, lighting, " +
    "background, head angle, and expression. Do not change the " +
    "aspect ratio.",

  lip_cheek_filler:
    "Using the provided image, perform a clearly visible hyaluronic " +
    "acid filler treatment edit at 1 week post-injection. Make the " +
    "upper and lower lips noticeably plumper and fuller — increase " +
    "lip volume by 40%, sharpen the vermilion borders, lift the " +
    "cupid's bow. Add visible volume to both cheeks, projecting them " +
    "forward and outward by 4 millimeters, restoring the youthful " +
    "ogee curve. The change must be obvious and aesthetically " +
    "beautiful but still natural — never duck-shaped or overfilled. " +
    "Keep everything else identical: same person, same eyes, " +
    "eyebrows, nose, teeth, skin tone, hair, makeup, lighting, " +
    "background, and head angle. Keep the same mouth shape and same " +
    "teeth visible — do not change the facial expression. Do not " +
    "change the aspect ratio.",

  co2_laser:
    "Using the provided image, perform a clearly visible fully-" +
    "ablative fractional CO2 laser resurfacing edit at 6 months " +
    "post-treatment. ERASE every fine line, wrinkle, sun spot, age " +
    "spot, melasma, hyperpigmentation, acne scar, and visible pore. " +
    "Make the skin look dramatically smoother, tighter, more " +
    "even-toned, glowing, and youthful — like a high-end skin glass " +
    "facial result. Add a subtle skin-tightening effect from " +
    "collagen rebuilding. Maintain photographic sharpness — do not " +
    "blur or soften the image. Keep everything else identical: same " +
    "person, same eyes, eyebrows, nose, mouth, lips, teeth, face " +
    "shape, hair, makeup, lighting, background, head angle, and " +
    "expression. Do not change the aspect ratio.",

  bbl_photofacial:
    "Using the provided image, perform a clearly visible Sciton BBL " +
    "Forever Young photofacial edit at 1 week post-treatment. ERASE " +
    "every sun spot, freckle, age spot, brown pigmentation patch, " +
    "and visible facial redness or rosacea. Make the skin tone " +
    "completely uniform, bright, clear, and luminous with a healthy " +
    "radiant glow. Do not change skin texture significantly — only " +
    "pigmentation and tone. Do not blur the photo. Keep everything " +
    "else identical: same person, same eyes, eyebrows, nose, mouth, " +
    "lips, teeth, face shape, hair, makeup, lighting, background, " +
    "head angle, and expression. Do not change the aspect ratio."
};

// Nano Banana Pro (Gemini 3 Pro Image). $0.15 per 2K edit.
const FAL_MODEL = 'fal-ai/nano-banana-pro/edit';

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

    // Upload once to fal CDN; Nano Banana Pro wants public URLs in image_urls.
    const imageUrl = await fal.storage.upload(file);
    const prompt = PROCEDURE_PROMPTS[procedure];

    // Nano Banana Pro — image_urls is an array.
    // Returns image at result.data.images[0].url.
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        prompt,
        image_urls: [imageUrl],
        num_images: 1,
        output_format: 'jpeg'
      },
      logs: false
    });

    const modelUrl = (result as any)?.data?.images?.[0]?.url;
    if (!modelUrl) {
      return NextResponse.json(
        { error: 'No image returned from model.' },
        { status: 502 }
      );
    }

    // ----------------------------------------------------------------
    // Watermark the result image server-side before returning it.
    // The watermark is baked into the JPEG itself so every download/
    // share carries the SimFaceMD by Face MD branding — every share is
    // a free ad. The watermark is intentionally subtle (low opacity,
    // bottom-right placement) to keep the simulation looking premium.
    // ----------------------------------------------------------------
    const watermarkedDataUrl = await applyWatermark(modelUrl);

    return NextResponse.json({
      resultUrl: watermarkedDataUrl,
      modelUrl // raw model URL kept around for debugging / future features
    });
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

/**
 * Bake a subtle SimFaceMD by Face MD watermark into the bottom-right of
 * the result JPEG and return it as a data URL. We use Sharp + an SVG
 * overlay so the watermark scales relative to the image dimensions and
 * matches the brand (Cormorant Garamond italic + gold #C9A84C).
 */
async function applyWatermark(imageUrl: string): Promise<string> {
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) {
    throw new Error(`Failed to fetch result image (${imgResp.status})`);
  }
  const imgBuf = Buffer.from(await imgResp.arrayBuffer());

  const meta = await sharp(imgBuf).metadata();
  const W = meta.width || 1024;
  const H = meta.height || 1024;

  // Watermark dims scale with image; cap to keep readable on small previews
  const wmW = Math.round(Math.min(W * 0.36, 360));
  const wmH = Math.round(wmW * 0.22);

  // "Sim" in white italic + "Face" in gold italic + small "MD" lockup,
  // matching the in-app logo. Then a small "by Clinique Face MD" line
  // beneath. SVG escapes minimal — these literal strings are safe.
  const fontSize = Math.round(wmH * 0.46);
  const subFontSize = Math.round(wmH * 0.18);
  const padX = Math.round(wmH * 0.20);
  const padY = Math.round(wmH * 0.18);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${wmW}" height="${wmH}" viewBox="0 0 ${wmW} ${wmH}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
          <feOffset dx="0" dy="1" result="o"/>
          <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width="${wmW}" height="${wmH}" fill="#000000" fill-opacity="0.42" rx="${Math.round(wmH * 0.18)}"/>
      <g filter="url(#shadow)" font-family="Cormorant Garamond, Georgia, serif" font-style="italic" font-weight="500">
        <text x="${padX}" y="${padY + fontSize * 0.85}" font-size="${fontSize}" fill="#FFFFFF">Sim</text>
        <text x="${padX + fontSize * 1.55}" y="${padY + fontSize * 0.85}" font-size="${fontSize}" fill="#C9A84C">Face</text>
        <text x="${padX + fontSize * 1.55 + fontSize * 2.1}" y="${padY + fontSize * 0.6}" font-size="${Math.round(fontSize * 0.42)}" fill="rgba(255,255,255,0.75)" font-style="normal" font-family="Inter, system-ui, sans-serif" letter-spacing="2">MD</text>
        <text x="${padX}" y="${padY + fontSize * 0.85 + subFontSize * 1.5}" font-size="${subFontSize}" fill="rgba(255,255,255,0.78)" font-style="normal" font-family="Inter, system-ui, sans-serif" letter-spacing="1">by Clinique Face MD</text>
      </g>
    </svg>`;

  const wmBuf = await sharp(Buffer.from(svg)).png().toBuffer();

  // Place 24px from bottom-right (or 2.5% of width, whichever is larger).
  const margin = Math.max(24, Math.round(W * 0.025));
  const left = Math.max(0, W - wmW - margin);
  const top = Math.max(0, H - wmH - margin);

  const out = await sharp(imgBuf)
    .composite([{ input: wmBuf, left, top }])
    .jpeg({ quality: 92, progressive: true })
    .toBuffer();

  return `data:image/jpeg;base64,${out.toString('base64')}`;
}
