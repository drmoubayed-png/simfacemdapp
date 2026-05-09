import { NextRequest, NextResponse } from 'next/server';
import { buildReport, rangeForYesterday } from '../../../lib/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin dashboard data endpoint. Returns the same FullReport shape that
 * the daily email uses, but for an arbitrary date range passed as
 * ?start=ISO&end=ISO. Defaults to "yesterday" for parity with the
 * email digest.
 *
 * Auth: caller must pass ADMIN_KEY in the `x-admin-key` header. The key
 * is stored in Vercel env and can be rotated independently of the
 * cron secret. We deliberately avoid cookies / sessions \u2014 this is a
 * single-operator tool.
 */
export async function GET(req: NextRequest) {
  const provided = req.headers.get('x-admin-key') ?? '';
  const expected = process.env.ADMIN_KEY ?? '';
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const startParam = req.nextUrl.searchParams.get('start');
  const endParam = req.nextUrl.searchParams.get('end');

  let range;
  if (startParam && endParam) {
    range = {
      start: new Date(startParam).toISOString(),
      end: new Date(endParam).toISOString(),
      label: `${startParam.slice(0, 10)} \u2192 ${endParam.slice(0, 10)}`
    };
  } else {
    range = rangeForYesterday();
  }

  const report = await buildReport(range);
  return NextResponse.json({ ok: true, report });
}
