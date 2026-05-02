import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

// Configure fal client with server-side credentials.
// FAL_KEY is read from environment variables and NEVER exposed to the browser.
fal.config({ credentials: process.env.FAL_KEY });

// Use the Node.js runtime (not Edge) so we can use Buffer for base64 decoding.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — Vercel serverless function timeout

const PROCEDURE_PROMPTS: Record<string, string> = {
  botox:
    "Same person, same pose, same lighting. Naturally smooth the forehead lines, relax the frown lines between the eyebrows, and soften the crow's feet around the eyes. The result should look like a skilled medical injector performed wrinkle relaxer treatment — refreshed, natural, not frozen. Keep all other facial features, skin tone, and background identical.",

  lip_filler:
    "Same person, same pose, same lighting. Add natural-looking volume to both the upper and lower lips — slightly fuller with better definition at the vermillion border. The result should look like 1ml of expert lip filler has been injected — a soft, natural pout, not overdone or duck-like. Keep all other facial features, skin tone, and background identical.",

  jawline_filler:
    "Same person, same pose, same lighting. Define and contour the jawline with subtle filler enhancement — sharper jaw angle, slightly more projected chin, more sculpted lower face. The result should look like expert jawline filler treatment — natural masculine or feminine jaw definition, not exaggerated. Keep all other facial features, skin tone, and background identical.",

  cheek_filler:
    "Same person, same pose, same lighting. Lift and define the cheekbones with subtle midface volume restoration — higher cheekbone highlight, gentle lifting of the midface, refreshed and youthful appearance. The result should look like expert cheek filler — natural, not puffy or overdone. Keep all other facial features, skin tone, and background identical.",

  rhinoplasty:
    "Same person, same pose, same lighting. Refine the nose — reduce any dorsal hump, slightly lift and refine the nasal tip, improve overall nose proportions and symmetry. The result should look like a natural rhinoplasty outcome — harmonious with the face, not a 'done' look. Keep all other facial features, skin tone, and background identical."
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

    // Decode the base64 data URL into a Buffer, then wrap as a Blob with the right MIME type.
    const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Invalid image data.' }, { status: 400 });
    }

    // The fal.storage.upload() method accepts a File or Blob. In Node.js 18+ Blob is global.
    const blob = new Blob([buffer], { type: mime });
    const file = new File([blob], `upload.${mime.split('/')[1] || 'jpg'}`, {
      type: mime
    });

    const imageUrl = await fal.storage.upload(file);

    const prompt = PROCEDURE_PROMPTS[procedure];

    // Call FLUX.1 Kontext [pro] — image-to-image edit conditioned on the source image.
    // Note: FLUX.1 Kontext uses a fixed inference pipeline; only guidance_scale,
    // safety_tolerance, output_format, aspect_ratio, and seed are tunable.
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

    // Surface common fal.ai issues with clearer messages so operators can react.
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
        { error: 'Service temporarily unavailable. Please try again later or book a consultation directly.' },
        { status: 503 }
      );
    }
    if (status === 429) {
      return NextResponse.json(
        { error: 'Too many requests right now. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Simulation failed. Please try again.' },
      { status: 500 }
    );
  }
}
