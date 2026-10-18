'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '../I18n';
import { ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { MoneyInput } from '../dashboard/hooks';
import { StepUp } from '../dashboard/FinanceView';

/** Manual credit note (correction) against an issued invoice. Requires refunds.issue + re-authentication. */
export function CreditNoteForm({ tenant, invoiceId, remainingMinor }: { tenant: string; invoiceId: string; remainingMinor: number }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [needStep, setNeedStep] = useState(false);
  const s = useSubmit<unknown, { id: string; number: string }>(`/api/v1/t/${tenant}/finance/invoices/${invoiceId}/credit-note`);
  const go = async () => {
    const r = await s.submit({ amountMinor: amount, reason });
    if (r) {
      toast(`${t('inv.credit_issued')} ${r.number}`, 'ok');
      router.push(`/app/${tenant}/finance/invoices/${r.id}`);
    }
  };
  useEffect(() => {
    if (s.error?.message === 'errors.step_up_required') setNeedStep(true);
  }, [s.error]);
  if (!open) return <button type="button" className="btn btn-sm" disabled={remainingMinor <= 0} onClick={() => setOpen(true)}>{t('inv.issue_credit')}</button>;
  if (needStep) return <StepUp onDone={() => { setNeedStep(false); void go(); }} onCancel={() => setNeedStep(false)} />;
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <ErrorAlert error={s.error?.message === 'errors.step_up_required' ? null : s.error} />
      <Field label={t('bk.amount')} required hint={t('inv.credit_remaining', { amount: (remainingMinor / 100).toFixed(2) })}>{(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}</Field>
      <Field label={t('common.reason')} required>{(p) => <input {...p} className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <div className="form-actions">
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-gold btn-sm" disabled={s.busy || !amount || amount > remainingMinor || reason.trim().length < 3}>{t('inv.issue_credit')}</button>
      </div>
    </form>
  );
}
