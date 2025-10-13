import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');
import { fetchAgentProfileByCode, fetchAgentProfileById } from '@/lib/supabaseLoyalty';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type ReceiptRequest = {
  agentProfileId?: string;
  agentCode?: string;
  recordId?: string;
  baseId?: string;
  tableId?: string;
  receiptFieldId?: string;
  receiptFieldName?: string;
  replaceExisting?: boolean;
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
      console.error('[receipts] Missing JSON body');
      return badRequest('Invalid JSON payload');
    }

    const {
      agentProfileId,
      agentCode: rawAgentCode,
      recordId,
      baseId: overrideBaseId,
      tableId: overrideTableId,
      receiptFieldId: overrideReceiptFieldId,
      receiptFieldName: overrideReceiptFieldName,
      replaceExisting = true,
      amount,
      points,
      paidAt,
      reference,
      agentName: providedAgentName,
      memo,
    } = body;

    const debugContext = {
      recordId,
      agentProfileId,
      rawAgentCode,
      amount,
      points,
      paidAt,
      baseId: overrideBaseId,
      tableId: overrideTableId,
      receiptFieldId: overrideReceiptFieldId,
      receiptFieldName: overrideReceiptFieldName,
    };
    console.log('[receipts] Incoming request', debugContext);

    const agentCodeInput = Array.isArray(rawAgentCode)
      ? rawAgentCode.find((value) => typeof value === 'string' && value.trim())
      : typeof rawAgentCode === 'string'
        ? rawAgentCode
        : undefined;

    if (!agentProfileId && !agentCodeInput) {
      console.error('[receipts] Missing agent identifier');
      return badRequest('agentProfileId or agentCode is required');
    }

    if (!recordId || typeof recordId !== 'string') {
      console.error('[receipts] Missing recordId');
      return badRequest('recordId is required');
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
      if (!profile && agentCodeInput) {
        profile = await fetchAgentProfileByCode(agentCodeInput).catch(() => null);
      }

      if (profile) {
        agentName ||= profile.displayName ?? null;
        agentCode = profile.code ?? null;
      } else if (agentCodeInput) {
        agentCode = agentCodeInput.trim();
      }
    } catch {
      // fall back to provided values when Supabase lookup fails
    }

    if (!agentName) {
      agentName = agentCode || 'Valued Customer';
    }

    const pdfBuffer = await renderReceiptPdf({
      agentName,
      amount,
      points,
      issuedAt,
      receiptNumber,
      memo: memo?.trim() || undefined,
    });

    const base64 = pdfBuffer.toString('base64');
    const filename = `receipt-${receiptNumber}.pdf`;

    const { signedUrl, path: storagePath } = await uploadReceiptToSupabase({
      buffer: pdfBuffer,
      filename,
      recordId,
      contentType: 'application/pdf',
    });

    const airtableResult = await syncReceiptToAirtable({
      recordId,
      baseId: overrideBaseId,
      tableId: overrideTableId,
      receiptFieldId: overrideReceiptFieldId,
      receiptFieldName: overrideReceiptFieldName,
      replaceExisting,
      filename,
      signedUrl,
      storagePath,
    });

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
        airtable: airtableResult,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate receipt';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type RenderReceiptParams = {
  agentName: string;
  amount: number;
  points: number;
  issuedAt: Date;
  receiptNumber: string;
  memo?: string;
};

function renderReceiptPdf({
  agentName,
  amount,
  points,
  issuedAt,
  receiptNumber,
  memo,
}: RenderReceiptParams): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: unknown) => reject(err));

    const formattedDate = DATE_FORMATTER.format(issuedAt);
    const formattedAmount = CURRENCY_FORMATTER.format(amount);
    const amountWords = convertAmountToWords(amount);
    const margin = 48;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Border
    doc.lineWidth(1).rect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin).stroke('#1f1f1f');

    const headerY = margin;

    // Header Branding
    doc.fillColor('#000');
    doc.font('Helvetica-Bold').fontSize(26).text('PRYPCO', margin, headerY);
    doc.font('Helvetica-Bold').fontSize(11).text('PRYPCO Real Estate LLC.', margin, headerY + 30);
    doc.font('Helvetica').fontSize(9).text('Office 02-03-04, Damac Mall, Damac Hills,', margin, headerY + 45);
    doc.text('Dubai, United Arab Emirates', margin, headerY + 58);
    doc.text('prypco.com', margin, headerY + 71);

    // Header detail box (Tax, Receipt No, Date)
    const detailBoxWidth = 180;
    const detailBoxX = pageWidth - margin - detailBoxWidth;
    const detailBoxY = headerY;
    doc.lineWidth(0.8).rect(detailBoxX, detailBoxY + 24, detailBoxWidth, 70).stroke('#d9d9d9');
    doc.font('Helvetica-Bold').fontSize(10).text('Tax Reg No : 104936517200003', detailBoxX, detailBoxY, {
      align: 'right',
    });
    doc.font('Helvetica-Bold').fontSize(11).text('Receipt No', detailBoxX + 12, detailBoxY + 36);
    doc.font('Helvetica').fontSize(11).text(receiptNumber, detailBoxX + 12, detailBoxY + 52);
    doc.font('Helvetica-Bold').fontSize(11).text('Receipt Date', detailBoxX + 12, detailBoxY + 70);
    doc.font('Helvetica').fontSize(11).text(formattedDate, detailBoxX + 12, detailBoxY + 86);

    // Separator line
    const separatorY = headerY + 110;
    doc.lineWidth(2).moveTo(margin, separatorY).lineTo(pageWidth - margin, separatorY).stroke('#000');

    // Title
    doc.font('Helvetica-Bold').fontSize(18).text('RECEIPT VOUCHER', margin, separatorY + 16, {
      align: 'center',
    });

    // Amount Highlight
    const amountBoxX = margin;
    const amountBoxY = separatorY + 50;
    const amountBoxWidth = 160;
    const amountBoxHeight = 52;
    doc.save();
    doc.rect(amountBoxX, amountBoxY, amountBoxWidth, amountBoxHeight).fill('#000');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text('Amount AED', amountBoxX + 12, amountBoxY + 12);
    doc.font('Helvetica-Bold').fontSize(18).text(formattedAmount.replace('AED', '').trim(), amountBoxX + 12, amountBoxY + 26);
    doc.restore();

    // Receipt body
    const bodyX = margin;
    let cursorY = amountBoxY + amountBoxHeight + 20;
    const bodyLabelFont = 'Helvetica-Bold';
    const bodyValueFont = 'Helvetica';

    const lineGap = 18;

    const writeLine = (label: string, value: string) => {
      doc.font(bodyLabelFont).fontSize(11).fillColor('#000').text(`${label}`, bodyX, cursorY, { continued: true });
      doc.font(bodyValueFont).fontSize(11).fillColor('#1f1f1f').text(` ${value}`);
      cursorY += lineGap;
    };

    writeLine('Received from Ms./Mr.:', agentName);
    writeLine('The sum of amount:', `${amountWords} only.`);
    writeLine('By:', 'Stripe payment link');
    writeLine('Being:', `${points.toLocaleString('en-US')} Collect points`);
    writeLine('Dated:', formattedDate);
    if (memo) {
      doc.font(bodyLabelFont).fontSize(11).text('Notes:', bodyX, cursorY);
      doc.font(bodyValueFont).fontSize(10).fillColor('#1f1f1f').text(memo, bodyX, cursorY + 12, { width: pageWidth - margin * 2 });
      cursorY += 40;
    } else {
      cursorY += 10;
    }

    // Signature area
    const signatureY = Math.max(cursorY + 40, pageHeight - 170);
    doc.font('Helvetica').fontSize(11).fillColor('#000').text('For and on behalf of Prypco', bodyX, signatureY);
    doc.moveTo(bodyX, signatureY + 28).lineTo(bodyX + 160, signatureY + 28).stroke('#000');
    doc.font('Helvetica').fontSize(10).text('Authorised Signature', bodyX, signatureY + 34);

    // Footer note
    const footerY = pageHeight - margin - 40;
    doc.rect(margin, footerY, pageWidth - margin * 2, 36).fill('#f5f5f5');
    doc.fillColor('#000').font('Helvetica').fontSize(9).text(
      'This is a computer generated receipt and no signature is required. Cheques / drafts are subject to realisation.',
      margin + 12,
      footerY + 12
    );

    doc.end();
  });
}

type UploadReceiptArgs = {
  buffer: Buffer;
  filename: string;
  recordId: string;
  contentType: string;
};

const DEFAULT_SIGNED_URL_SECONDS = Number(process.env.SUPABASE_SIGNED_URL_TTL_SECONDS || 300);

async function uploadReceiptToSupabase({ buffer, filename, recordId, contentType }: UploadReceiptArgs) {
  const bucket = process.env.SUPABASE_RECEIPTS_BUCKET || 'receipts';
  if (!bucket) throw new Error('Supabase storage bucket not configured (SUPABASE_RECEIPTS_BUCKET).');

  const supabase = getSupabaseAdminClient();
  const cleanedRecord = recordId.replace(/[^a-zA-Z0-9-_]/g, '_') || 'record';
  const storagePath = `${cleanedRecord}/${Date.now()}-${filename}`;

  const uploadRes = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadRes.error) {
    console.error('[receipts] Supabase upload failed', { error: uploadRes.error.message, bucket, storagePath });
    throw new Error('Failed to upload receipt to Supabase storage');
  }

  const signedRes = await supabase.storage.from(bucket).createSignedUrl(storagePath, DEFAULT_SIGNED_URL_SECONDS);
  if (signedRes.error || !signedRes.data?.signedUrl) {
    console.error('[receipts] Supabase signed URL failed', {
      error: signedRes.error?.message,
      bucket,
      storagePath,
    });
    throw new Error('Failed to create signed URL for receipt');
  }

  return { signedUrl: signedRes.data.signedUrl, path: storagePath };
}

const SMALL_NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const SCALES = [
  { value: 1_000_000_000, name: 'billion' },
  { value: 1_000_000, name: 'million' },
  { value: 1_000, name: 'thousand' },
  { value: 100, name: 'hundred' },
];

function convertAmountToWords(amount: number): string {
  const integerPart = Math.floor(amount);
  const fractionalPart = Math.round((amount - integerPart) * 100);

  const integerWords = integerPart === 0 ? 'zero' : convertIntegerToWords(integerPart);
  const filsWords =
    fractionalPart > 0 ? ` and ${convertIntegerToWords(fractionalPart)} Fils` : '';

  return `${capitaliseFirst(integerWords)} Dirhams${filsWords}`;
}

function convertIntegerToWords(num: number): string {
  if (num < 20) {
    return SMALL_NUMBERS[num];
  }
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const units = num % 10;
    return `${TENS[tens]}${units ? ` ${SMALL_NUMBERS[units]}` : ''}`;
  }

  for (const scale of SCALES) {
    if (num >= scale.value) {
      const quotient = Math.floor(num / scale.value);
      const remainder = num % scale.value;
      const quotientWords = convertIntegerToWords(quotient);
      const remainderWords = remainder ? ` ${convertIntegerToWords(remainder)}` : '';
      const scaleName = scale.name;
      return `${quotientWords} ${scaleName}${remainderWords ? ` ${remainderWords}` : ''}`;
    }
  }

  return '';
}

function capitaliseFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type SyncReceiptArgs = {
  recordId: string;
  baseId?: string | null;
  tableId?: string | null;
  receiptFieldId?: string | null;
  receiptFieldName?: string | null;
  replaceExisting?: boolean;
  filename: string;
  signedUrl: string;
  storagePath: string;
};

async function syncReceiptToAirtable({
  recordId,
  baseId,
  tableId,
  receiptFieldId,
  receiptFieldName,
  replaceExisting = true,
  filename,
  signedUrl,
  storagePath,
}: SyncReceiptArgs) {
  const pat = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY;
  const resolvedBaseId = baseId || process.env.AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE;
  const resolvedTableId = tableId || process.env.AIRTABLE_RECEIPT_TABLE_ID || process.env.AIRTABLE_TABLE_ID;
  const resolvedFieldId =
    receiptFieldId ||
    process.env.AIRTABLE_RECEIPT_FIELD_ID ||
    process.env.AIRTABLE_RECEIPT_FIELD ||
    process.env.AIRTABLE_RECEIPT_FIELD_NAME;
  const resolvedFieldName =
    receiptFieldName ||
    process.env.AIRTABLE_RECEIPT_FIELD_NAME ||
    process.env.AIRTABLE_RECEIPT_FIELD ||
    resolvedFieldId;

  if (!pat || !resolvedBaseId || !resolvedTableId || !resolvedFieldId || !resolvedFieldName) {
    throw new Error('Airtable integration is not configured (missing env vars).');
  }

  console.log('[receipts] Airtable targets', {
    recordId,
    baseId: resolvedBaseId,
    tableId: resolvedTableId,
    receiptFieldId: resolvedFieldId,
    receiptFieldName: resolvedFieldName,
    replaceExisting,
  });

  let attachments: Array<{ id?: string; url?: string; filename?: string }> = [];
  if (!replaceExisting) {
    attachments = await fetchExistingAttachmentRefs({
      pat,
      baseId: resolvedBaseId,
      tableId: resolvedTableId,
      recordId,
      fieldName: resolvedFieldName,
    });
  }

  attachments = [
    ...attachments,
    {
      url: signedUrl,
      filename,
    },
  ];

  await patchAirtableRecord({
    pat,
    baseId: resolvedBaseId,
    tableId: resolvedTableId,
    recordId,
    fieldKey: resolvedFieldName,
    attachments,
  });

  return {
    recordId,
    baseId: resolvedBaseId,
    tableId: resolvedTableId,
    field: resolvedFieldName,
    replaceExisting,
    storagePath,
    signedUrl,
  };
}
type FetchExistingArgs = {
  pat: string;
  baseId: string;
  tableId: string;
  recordId: string;
  fieldName: string;
};

async function fetchExistingAttachmentRefs({
  pat,
  baseId,
  tableId,
  recordId,
  fieldName,
}: FetchExistingArgs) {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(
    recordId
  )}?fields[]=${encodeURIComponent(fieldName)}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${pat}` },
  });

  if (!resp.ok) {
    return [];
  }

  const json = (await resp.json().catch(() => ({}))) as {
    fields?: Record<string, Array<{ id?: string }>>;
  };

  const existing = Array.isArray(json.fields?.[fieldName]) ? json.fields?.[fieldName] : [];
  const attachments: Array<{ id: string }> = [];
  for (const item of existing) {
    if (item?.id) attachments.push({ id: item.id });
  }
  return attachments;
}

type AirtableAttachmentPatch = {
  id?: string;
  url?: string;
  filename?: string;
};

type PatchArgs = {
  pat: string;
  baseId: string;
  tableId: string;
  recordId: string;
  fieldKey: string;
  attachments: AirtableAttachmentPatch[];
};

async function patchAirtableRecord({ pat, baseId, tableId, recordId, fieldKey, attachments }: PatchArgs) {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(
    recordId
  )}`;
  console.log('[receipts] Updating Airtable record', { baseId, tableId, recordId, fieldKey, attachmentsCount: attachments.length });
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        [fieldKey]: attachments,
      },
    }),
  });

  if (!resp.ok) {
    const json = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
    const message = json?.error?.message || `Failed to update Airtable record (${resp.status})`;
    console.error('[receipts] Airtable record update failed', { baseId, tableId, recordId, fieldKey, message, status: resp.status });
    throw new Error(message);
  }
}
