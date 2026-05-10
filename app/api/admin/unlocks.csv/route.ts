import { NextRequest, NextResponse } from 'next/server';
import { buildReport, rangeForYesterday, unlocksToCsv } from '../../../lib/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * v5.1 — CSV export of identified leads (lead-gate unlocks). Same auth
 * model as /api/admin/leads.csv. This file contains PII (name/email/
 * phone) and is intended for the operator only — never share with
 * partners.
 */
export async function GET(req: NextRequest) {
  const provided =
    req.headers.get('x-admin-key') ??
    req.nextUrl.searchParams.get('key') ??
    '';
  const expected = process.env.ADMIN_KEY ?? '';
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const startParam = req.nextUrl.searchParams.get('start');
  const endParam = req.nextUrl.searchParams.get('end');
  const range =
    startParam && endParam
      ? {
          start: new Date(startParam).toISOString(),
          end: new Date(endParam).toISOString(),
          label: ''
        }
      : rangeForYesterday();

  const report = await buildReport(range);
  const csv = unlocksToCsv(report.unlock_rows);
  const filename = `simfacemd-identified-leads-${range.start.slice(0, 10)}-to-${range.end.slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
