import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');
import { fetchAgentProfileByCode, fetchAgentProfileById } from '@/lib/supabaseLoyalty';

export const runtime = 'nodejs';

type ReceiptRequest = {
  agentProfileId?: string;
  agentCode?: string;
  amount: number;
  points: number;
  paidAt?: string;
  reference?: string;
  agentName?: string;
  memo?: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'AED',
  minimumFractionDigits: 2,
});

function unauthorisedResponse() {
  return new NextResponse('Unauthorized', { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const secret = process.env.RECEIPT_WEBHOOK_SECRET;
    if (secret) {
      const header = request.headers.get('authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : header;
      if (token !== secret) {
        return unauthorisedResponse();
      }
    }

    const body = (await request.json().catch(() => null)) as ReceiptRequest | null;
    if (!body) {
      return badRequest('Invalid JSON payload');
    }

    const {
      agentProfileId,
      agentCode: rawAgentCode,
      amount,
      points,
      paidAt,
      reference,
      agentName: providedAgentName,
      memo,
    } = body;

    if (!agentProfileId && !rawAgentCode) {
      return badRequest('agentProfileId or agentCode is required');
    }

    if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount) || amount <= 0) {
      return badRequest('amount must be a positive number');
    }

    if (typeof points !== 'number' || Number.isNaN(points) || !Number.isFinite(points) || points <= 0) {
      return badRequest('points must be a positive number');
    }

    let issuedAt = new Date();
    if (paidAt) {
      const parsed = new Date(paidAt);
      if (!Number.isNaN(parsed.getTime())) {
        issuedAt = parsed;
      }
    }

    const receiptNumber = reference?.trim() || randomUUID();

    let agentName = providedAgentName?.trim() || null;
    let agentCode: string | null = null;

    try {
      let profile = agentProfileId ? await fetchAgentProfileById(agentProfileId) : null;
      if (!profile && rawAgentCode) {
        profile = await fetchAgentProfileByCode(rawAgentCode).catch(() => null);
      }

      if (profile) {
        agentName ||= profile.displayName ?? null;
        agentCode = profile.code ?? null;
      } else if (rawAgentCode) {
        agentCode = rawAgentCode.trim();
      }
    } catch {
      // fall back to provided values when Supabase lookup fails
    }

    if (!agentName) {
      agentName = agentCode || 'Valued Customer';
    }

    const pdfBuffer = await renderReceiptPdf({
      agentName,
      agentCode,
      amount,
      points,
      issuedAt,
      receiptNumber,
      memo: memo?.trim() || undefined,
    });

    const base64 = pdfBuffer.toString('base64');
    const filename = `receipt-${receiptNumber}.pdf`;

    return NextResponse.json({
      ok: true,
      receipt: {
        filename,
        base64,
        receiptNumber,
        amount,
        points,
        agentName,
        issuedAt: issuedAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate receipt';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type RenderReceiptParams = {
  agentName: string;
  agentCode: string | null;
  amount: number;
  points: number;
  issuedAt: Date;
  receiptNumber: string;
  memo?: string;
};

function renderReceiptPdf({
  agentName,
  agentCode,
  amount,
  points,
  issuedAt,
  receiptNumber,
  memo,
}: RenderReceiptParams): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: unknown) => reject(err));

    const formattedDate = DATE_FORMATTER.format(issuedAt);
    const formattedAmount = CURRENCY_FORMATTER.format(amount);

    doc.font('Helvetica-Bold').fontSize(20).text('Receipt Voucher', { align: 'center' });

    doc.moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Receipt No.: ${receiptNumber}`, { align: 'right' })
      .text(`Receipt Date: ${formattedDate}`, { align: 'right' });

    doc.moveDown(1.2);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Received from Ms./Mr.:', { continued: true })
      .font('Helvetica')
      .text(` ${agentName}`);

    if (agentCode) {
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).text(`Agent Code: ${agentCode}`);
    }

    doc.moveDown(0.8);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('The sum of amount:', { continued: true })
      .font('Helvetica')
      .text(` ${formattedAmount}`);

    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('By:', { continued: true })
      .font('Helvetica')
      .text(' Stripe payment link');

    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Being:', { continued: true })
      .font('Helvetica')
      .text(` ${points.toLocaleString('en-US')} Collect points`);

    if (memo) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12).text('Notes:');
      doc.font('Helvetica').fontSize(10).text(memo);
    }

    doc.moveDown(1.2);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text('For and on behalf of Prypco', { align: 'left' })
      .moveDown(2)
      .text('__________________________', { align: 'left' })
      .text('Authorized Signature', { align: 'left' });

    doc.end();
  });
}
