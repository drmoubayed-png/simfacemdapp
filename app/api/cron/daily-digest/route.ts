import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  buildReport,
  leadsToCsv,
  rangeForYesterday,
  reportToHtml,
  unlocksToCsv
} from '../../../lib/reports';

/**
 * Daily lead digest \u2014 fired by Vercel Cron at 12:00 UTC, which is 8:00 AM
 * Eastern (DST-aware: 8 AM EDT in summer, 7 AM EST in winter \u2014 close
 * enough; the operator gets it before clinic hours either way).
 *
 * The cron schedule is declared in vercel.json. Vercel signs cron
 * requests with the CRON_SECRET; we verify so random visitors can't
 * trigger emails.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds

export async function GET(req: NextRequest) {
  // Authorize: either Vercel-signed cron, or manual trigger with secret.
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  const isVercelCron = auth === expected && Boolean(process.env.CRON_SECRET);
  // Allow ?secret=... fallback for manual testing from the browser.
  const querySecret = req.nextUrl.searchParams.get('secret');
  const querySecretOk =
    Boolean(process.env.CRON_SECRET) &&
    querySecret === process.env.CRON_SECRET;
  if (!isVercelCron && !querySecretOk) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const range = rangeForYesterday();
  const report = await buildReport(range);

  const html = reportToHtml(report);
  const eventsCsv = leadsToCsv(report.lead_rows);
  const eventsCsvBase64 = Buffer.from(eventsCsv, 'utf-8').toString('base64');
  const unlocksCsv = unlocksToCsv(report.unlock_rows);
  const unlocksCsvBase64 = Buffer.from(unlocksCsv, 'utf-8').toString('base64');

  const to = process.env.DIGEST_RECIPIENT || 'drmoubayed@cliniquefacemd.com';
  const from = process.env.DIGEST_FROM || 'SimFaceMD <reports@simfacemd.com>';
  // Subject leads with the metric Dr. Moubayed actually cares about:
  // identified leads (= name/email/phone he can call). Falls back to book
  // clicks if the lead gate hasn't been used yet.
  const headlineCount = report.totals.unlocks || report.totals.book_clicks_unique_leads;
  const headlineLabel = report.totals.unlocks > 0 ? 'identified leads' : 'book clicks';
  const subject = `SimFaceMD daily report \u2014 ${range.label} \u2014 ${headlineCount} ${headlineLabel}`;

  // If RESEND_API_KEY isn't set, bail gracefully and return the report
  // body so the operator can still see it via manual trigger.
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      ok: true,
      sent: false,
      note: 'RESEND_API_KEY not set \u2014 returning report inline',
      report
    });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      attachments: [
        {
          filename: `simfacemd-identified-leads-${range.start.slice(0, 10)}.csv`,
          content: unlocksCsvBase64
        },
        {
          filename: `simfacemd-events-${range.start.slice(0, 10)}.csv`,
          content: eventsCsvBase64
        }
      ]
    });
    if (error) {
      console.error('[daily-digest] Resend error:', error);
      return NextResponse.json(
        { ok: false, error: String(error) },
        { status: 502 }
      );
    }
    return NextResponse.json({
      ok: true,
      sent: true,
      message_id: data?.id ?? null,
      totals: report.totals
    });
  } catch (e) {
    console.error('[daily-digest] send failed:', e);
    return NextResponse.json({ ok: false, error: 'send_failed' }, { status: 500 });
  }
}
