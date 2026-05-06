import { NextRequest, NextResponse } from 'next/server';
import { geolocation } from '@vercel/functions';

/**
 * IP-based geolocation lookup.
 *
 * On Vercel, the `geolocation()` helper reads geo headers that the platform
 * injects into every request automatically — no API key, no extra cost,
 * no permission prompt to the user. Accuracy is roughly city-level
 * (within ~50 km), which is plenty good for "show me the nearest clinic".
 *
 * In other environments (local dev, custom hosts) this returns nulls and
 * the client transparently falls back to navigator.geolocation if the user
 * grants permission.
 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const geo = geolocation(req);

    return NextResponse.json({
      city: geo.city ?? null,
      region: geo.countryRegion ?? null,
      country: geo.country ?? null,
      lat: geo.latitude ? parseFloat(geo.latitude) : null,
      lng: geo.longitude ? parseFloat(geo.longitude) : null
    });
  } catch {
    return NextResponse.json({
      city: null,
      region: null,
      country: null,
      lat: null,
      lng: null
    });
  }
}
