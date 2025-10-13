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
      agentCode,
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
