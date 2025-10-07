'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';

const initialState = {
  code: '',
  buyerFirstName: '',
  buyerPhoneLast4: '',
};

type RedemptionRecord = {
  id: string;
  code: string | null;
  agentEmail: string | null;
  agentName: string | null;
  agentCode: string | null;
  unitAllocationFirstName: string | null;
  unitAllocationPhoneLast4: string | null;
  unitAllocationLabel: string | null;
  unitType: string | null;
  redeemed: boolean;
  createdTime: string;
  updatedTime: string | null;
};

type ApiError = { error: string; code?: string };

type ApiLookupResponse = { record: RedemptionRecord };

type ApiConfirmResponse = { record: RedemptionRecord };

export default function DamacOperationsPage() {
  const [form, setForm] = useState(initialState);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [record, setRecord] = useState<RedemptionRecord | null>(null);
  const [operatorName, setOperatorName] = useState('');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();
  const [confirming, startConfirmTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const reset = useCallback(() => {
    setForm(initialState);
    setRecord(null);
    setOperatorName('');
    setNote('');
    setLookupError(null);
    setConfirmError(null);
    setSuccessMessage(null);
  }, []);

  const handleLookup = useCallback(() => {
    setLookupError(null);
    setConfirmError(null);
    setSuccessMessage(null);
    setRecord(null);
    const code = form.code.trim();
    const firstName = form.buyerFirstName.trim();
    const phone = form.buyerPhoneLast4.trim();
    if (!code || !firstName || !/^\d{4}$/.test(phone)) {
      setLookupError('Enter the code, buyer first name, and the last four digits of their phone number.');
      return;
    }

    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          code,
          firstName,
          phoneLast4: phone,
        });
        const res = await fetch(`/api/damac/redemption?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as ApiError | null;
          setLookupError(data?.error || 'We could not verify that code.');
          return;
        }
        const data = (await res.json()) as ApiLookupResponse;
        setRecord(data.record);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Lookup failed';
        setLookupError(message);
      }
    });
  }, [form]);

  const confirmDisabled = useMemo(() => {
    if (!record) return true;
    if (record.redeemed) return true;
    if (!operatorName.trim()) return true;
    return confirming;
  }, [record, operatorName, confirming]);

  const handleConfirm = useCallback(() => {
    if (!record || confirmDisabled) return;
    setConfirmError(null);
    setSuccessMessage(null);
    startConfirmTransition(async () => {
      try {
        const res = await fetch('/api/damac/redemption', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            recordId: record.id,
            operatorName: operatorName.trim(),
            note: note.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as ApiError | null;
          setConfirmError(data?.error || 'Unable to confirm this code.');
          return;
        }
        const data = (await res.json()) as ApiConfirmResponse;
        setRecord(data.record);
        setSuccessMessage('Unit allocation confirmed successfully.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to confirm this code.';
        setConfirmError(message);
      }
    });
  }, [record, operatorName, note, confirmDisabled]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5f0ff,_#fef9ff)] px-4 py-10 text-[var(--color-outer-space)]">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-outer-space)] sm:text-4xl">
            Damac Redemption Verification
          </h1>
          <p className="text-sm text-[var(--color-outer-space)]/70 sm:text-base">
            Verify the buyer details shared by the agent and confirm the unit allocation code once everything checks out.
          </p>
        </header>

        <section className="rounded-[32px] border border-[#d1b7fb]/70 bg-white/90 p-6 shadow-[0_32px_70px_-48px_rgba(13,9,59,0.45)] sm:p-8">
          <h2 className="text-lg font-semibold">Step 1 · Validate the code</h2>
          <p className="mt-1 text-sm text-[var(--color-outer-space)]/70">
            Ask the agent for the unit allocation code plus their buyer’s first name and last four digits of their phone number.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-outer-space)]/70">
              Code
              <input
                type="text"
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                className="mt-2 rounded-[16px] border border-[var(--color-outer-space)]/15 bg-white px-3 py-3 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/40"
                placeholder="PRY-XXXX"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-outer-space)]/70">
              Buyer first name
              <input
                type="text"
                value={form.buyerFirstName}
                onChange={(event) => setForm((prev) => ({ ...prev, buyerFirstName: event.target.value }))}
                className="mt-2 rounded-[16px] border border-[var(--color-outer-space)]/15 bg-white px-3 py-3 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/40"
                placeholder="Jane"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-outer-space)]/70">
              Phone last 4 digits
              <input
                type="tel"
                inputMode="numeric"
                pattern="\d*"
                value={form.buyerPhoneLast4}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                  setForm((prev) => ({ ...prev, buyerPhoneLast4: next }));
                }}
                className="mt-2 rounded-[16px] border border-[var(--color-outer-space)]/15 bg-white px-3 py-3 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/40"
                placeholder="1234"
                autoComplete="off"
              />
            </label>
          </div>

          {lookupError ? (
            <p className="mt-4 rounded-[16px] border border-rose-300 bg-rose-50/80 px-4 py-3 text-sm text-rose-600">
              {lookupError}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleLookup}
              disabled={isPending}
              className="inline-flex items-center rounded-full bg-[var(--color-outer-space)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Checking…' : 'Verify code'}
            </button>
            {record || isPending ? (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center rounded-full border border-[var(--color-outer-space)] px-5 py-2 text-sm font-semibold text-[var(--color-outer-space)]/70 transition hover:bg-[var(--color-panel)]/80"
              >
                Clear
              </button>
            ) : null}
          </div>
        </section>

        {record ? (
          <section className="space-y-6 rounded-[32px] border border-[#d1b7fb]/70 bg-white/95 p-6 shadow-[0_32px_70px_-52px_rgba(13,9,59,0.45)] sm:p-8">
            <header>
              <h2 className="text-lg font-semibold">Step 2 · Review and confirm</h2>
              <p className="mt-1 text-sm text-[var(--color-outer-space)]/70">
                Match these details with the agent before locking the unit allocation.
              </p>
            </header>

            <div className="grid gap-4 text-sm text-[var(--color-outer-space)] sm:grid-cols-2">
              <InfoItem label="Agent name" value={record.agentName ?? '—'} />
              <InfoItem label="Agent email" value={record.agentEmail ?? '—'} />
              <InfoItem label="Agent code" value={record.agentCode ?? '—'} />
              <InfoItem label="Buyer first name" value={record.unitAllocationFirstName ?? '—'} />
              <InfoItem label="Buyer phone" value={record.unitAllocationPhoneLast4 ? `•••• ${record.unitAllocationPhoneLast4}` : '—'} />
              <InfoItem label="Unit type" value={record.unitType ?? record.unitAllocationLabel ?? '—'} />
              <InfoItem label="Redemption code" value={record.code ?? '—'} />
              <InfoItem label="Status" value={record.redeemed ? 'Already confirmed' : 'Ready to confirm'} emphasize={record.redeemed} />
            </div>

            <div className="space-y-3 rounded-[24px] border border-[#d1b7fb]/60 bg-[var(--color-panel)]/70 px-4 py-4 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-electric-purple)]">
                Operator confirmation
              </h3>
              <p className="text-xs text-[var(--color-outer-space)]/70">
                Confirm that the agent is physically with their buyer before reserving the code.
              </p>
              <label className="block text-xs font-medium text-[var(--color-outer-space)]/70">
                Your name
                <input
                  type="text"
                  value={operatorName}
                  onChange={(event) => setOperatorName(event.target.value)}
                  className="mt-1 w-full rounded-[14px] border border-[var(--color-outer-space)]/20 bg-white px-3 py-2 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/40"
                  placeholder="Damac operations agent"
                  autoComplete="off"
                />
              </label>
              <label className="block text-xs font-medium text-[var(--color-outer-space)]/70">
                Internal notes (optional)
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-[14px] border border-[var(--color-outer-space)]/20 bg-white px-3 py-2 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/40"
                />
              </label>
            </div>

            {confirmError ? (
              <p className="rounded-[16px] border border-rose-300 bg-rose-50/80 px-4 py-3 text-sm text-rose-600">
                {confirmError}
              </p>
            ) : null}

            {successMessage ? (
              <p className="rounded-[16px] border border-emerald-300 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-600">
                {successMessage}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirmDisabled}
                className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {confirming ? 'Confirming…' : record.redeemed ? 'Already confirmed' : 'Confirm allocation'}
              </button>
              <button
                type="button"
                onClick={reset}
                className="w-full cursor-pointer rounded-full border border-[var(--color-outer-space)] px-5 py-2 text-sm font-semibold text-[var(--color-outer-space)]/70 transition hover:bg-[var(--color-panel)]/80 sm:w-auto"
              >
                Start another lookup
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

type InfoItemProps = {
  label: string;
  value: string;
  emphasize?: boolean;
};

function InfoItem({ label, value, emphasize = false }: InfoItemProps) {
  return (
    <div className="space-y-1 rounded-[20px] border border-[#d1b7fb]/50 bg-white/90 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-outer-space)]/60">
        {label}
      </p>
      <p className={`text-sm font-medium ${emphasize ? 'text-rose-600' : 'text-[var(--color-outer-space)]'}`}>
        {value || '—'}
      </p>
    </div>
  );
}
