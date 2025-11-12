import { NextResponse, type NextRequest } from 'next/server';
import { fetchDamacRedemptionByCode } from '@/lib/damac';

const LER_PREFIX = 'LER-';

type VerifyResponse =
  | { ok: true }
  | { ok: false; reason: 'invalid_input' | 'already_used'; message: string };

const normalizeLer = (value: string): string | null => {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.startsWith(LER_PREFIX) ? trimmed.slice(LER_PREFIX.length) : trimmed;
  const digitsOnly = withoutPrefix.replace(/\D/g, '');
  if (digitsOnly.length < 4) return null;
  return `${LER_PREFIX}${digitsOnly}`;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = typeof body?.ler === 'string' ? body.ler : '';
    const normalized = normalizeLer(input);
    if (!normalized) {
      const payload: VerifyResponse = { ok: false, reason: 'invalid_input', message: 'Invalid LER number.' };
      return NextResponse.json(payload, { status: 400 });
    }

    const record = await fetchDamacRedemptionByCode(normalized);
    if (record) {
      const payload: VerifyResponse = {
        ok: false,
        reason: 'already_used',
        message: 'This LER has already been used on a previous redemption.',
      };
      return NextResponse.json(payload, { status: 409 });
    }

    const payload: VerifyResponse = { ok: true };
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error('LER verify error:', error);
    return NextResponse.json({ ok: false, reason: 'invalid_input', message: 'Unable to verify LER right now.' }, { status: 500 });
  }
}
