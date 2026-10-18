'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { formatDateTime, formatMoney, parseMoneyToMinor } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { GiftCardPreview, type BrandTokens } from './GiftCardPreview';
import { CustomerPicker } from './CustomerPicker';

type Tpl = 'classic' | 'floral' | 'minimal';
interface Card {
  id: string;
  codeLast4: string;
  initialMinor: number;
  balanceMinor: number;
  status: string;
  templateKey: Tpl;
  recipientName: string | null;
  expiresAt: string | null;
  complimentary: boolean;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = { active: 'green', pending: 'amber', redeemed: '', expired: 'red', void: 'red' };

export function GiftCardsManager({ tenant, businessName, brand, cards }: { tenant: string; businessName: string; brand: BrandTokens | null; cards: Card[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ code: string; amountMinor: number; template: Tpl; recipient?: string; message?: string } | null>(null);
  const [f, setF] = useState({ amount: '200', template: 'classic' as Tpl, recipient: '', message: '', days: '365', mode: 'sale' as 'sale' | 'comp', method: 'cash' as 'cash' | 'card_terminal', reference: '' });
  const [purchaser, setPurchaser] = useState<{ id: string; displayName: string; phone: string | null } | null>(null);
  const issue = useSubmit<unknown, { id: string; code: string; last4: string }>(`/api/v1/t/${tenant}/gifts`);
  const [code, setCode] = useState('');
  const [balance, setBalance] = useState<{ last4: string; balanceMinor: number; status: string; expiresAt: string | null } | null>(null);
  const check = useSubmit<{ code: string }, { last4: string; balanceMinor: number; status: string; expiresAt: string | null }>(`/api/v1/t/${tenant}/gifts/balance`);
  const amountMinor = parseMoneyToMinor(f.amount) ?? 0;

  return (
    <>
      {issued && (
        <div className="card" role="alert" style={{ borderColor: 'var(--gold-deep)' }}>
          <div className="alert warn"><Icon name="lock" size={18} /> {t('growth.gifts.code_once')}</div>
          <div className="grid cols-2">
            <GiftCardPreview template={issued.template} brand={brand} businessName={businessName} amountMinor={issued.amountMinor} recipient={issued.recipient} message={issued.message} code={issued.code} locale={locale} label={t('growth.gifts.preview')} />
            <div className="stack">
              <div className="mono" style={{ fontSize: 22, direction: 'ltr', letterSpacing: '.1em' }}>{issued.code}</div>
              <div className="row">
                <button type="button" className="btn btn-ghost" onClick={async () => { await navigator.clipboard?.writeText(issued.code); toast(t('growth.gifts.copied'), 'ok'); }}>
                  <Icon name="copy" size={16} /> {t('growth.gifts.copy')}
                </button>
                <button type="button" className="btn" onClick={() => window.print()}><Icon name="download" size={16} /> PDF / Print</button>
              </div>
              <button type="button" className="btn btn-gold" onClick={() => { setIssued(null); router.refresh(); }}>{t('growth.gifts.done')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <section className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>{t('growth.gifts.issue')}</h2>
            <button type="button" className="btn btn-gold btn-sm" onClick={() => setIssuing(true)}><Icon name="gift" size={16} /> {t('growth.gifts.issue')}</button>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            {(['classic', 'floral', 'minimal'] as const).map((k) => (
              <div key={k} style={{ width: 150 }}>
                <GiftCardPreview template={k} brand={brand} businessName={businessName} amountMinor={20000} locale={locale} label={t(`growth.gifts.tpl.${k}`)} />
                <div className="small muted" style={{ textAlign: 'center' }}>{t(`growth.gifts.tpl.${k}`)}</div>
              </div>
            ))}
          </div>
        </section>
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBalance(await check.submit({ code }));
          }}
        >
          <h2>{t('growth.gifts.balance_check')}</h2>
          <ErrorAlert error={check.error} />
          <div className="row">
            <input className="input input-ltr mono" style={{ flex: 1 }} aria-label={t('growth.gifts.code')} placeholder="XXXX-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            <button className="btn" disabled={check.busy}><Icon name="search" size={16} /> {t('common.search')}</button>
          </div>
          {balance && (
            <div className="row" style={{ marginTop: 10 }}>
              <span className="badge">••••{balance.last4}</span>
              <span className={`badge ${STATUS_BADGE[balance.status] ?? ''}`}>{t(`growth.gifts.status.${balance.status}`)}</span>
              <strong>{formatMoney(balance.balanceMinor, 'SAR', locale)}</strong>
            </div>
          )}
        </form>
      </div>

      <section className="card">
        {cards.length === 0 ? (
          <EmptyState icon="gift" title={t('growth.gifts.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t('growth.gifts.last4')}</th><th>{t('growth.gifts.recipient')}</th><th>{t('growth.gifts.initial')}</th><th>{t('growth.gifts.balance')}</th><th>{t('common.status')}</th><th>{t('growth.gifts.expiry')}</th><th>{t('common.actions')}</th></tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">••••{c.codeLast4}</td>
                    <td>{c.recipientName ?? '—'} {c.complimentary && <span className="badge">{t('growth.complimentary')}</span>}</td>
                    <td>{formatMoney(c.initialMinor, 'SAR', locale)}</td>
                    <td>{formatMoney(c.balanceMinor, 'SAR', locale)}</td>
                    <td><span className={`badge ${STATUS_BADGE[c.status] ?? ''}`}>{t(`growth.gifts.status.${c.status}`)}</span></td>
                    <td className="small">{c.expiresAt ? formatDateTime(c.expiresAt, { locale, dateOnly: true }) : '—'}</td>
                    <td>
                      {c.status === 'active' && (
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={async () => {
                            const reason = prompt(t('growth.reason'));
                            if (!reason) return;
                            await apiFetch(`/api/v1/t/${tenant}/gifts/${c.id}/void`, { method: 'POST', body: { reason } });
                            router.refresh();
                          }}
                        >
                          {t('growth.gifts.void')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {issuing && (
        <Drawer title={t('growth.gifts.issue')} onClose={() => setIssuing(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await issue.submit({
                amountMinor,
                templateKey: f.template,
                recipientName: f.recipient || undefined,
                message: f.message || undefined,
                expiresInDays: f.days ? Number(f.days) : null,
                purchaserCustomerId: purchaser?.id ?? null,
                sale: f.mode === 'sale' ? { method: f.method, reference: f.reference } : null,
                complimentary: f.mode === 'comp',
              });
              if (r) {
                setIssuing(false);
                setIssued({ code: r.code, amountMinor, template: f.template, recipient: f.recipient || undefined, message: f.message || undefined });
              }
            }}
          >
            <ErrorAlert error={issue.error} />
            <GiftCardPreview template={f.template} brand={brand} businessName={businessName} amountMinor={amountMinor} recipient={f.recipient} message={f.message} locale={locale} label={t('growth.gifts.preview')} />
            <div className="chips" style={{ margin: '12px 0' }} role="group" aria-label={t('growth.gifts.template')}>
              {(['classic', 'floral', 'minimal'] as const).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={f.template === k} onClick={() => setF({ ...f, template: k })}>{t(`growth.gifts.tpl.${k}`)}</button>
              ))}
            </div>
            <Field label={t('growth.amount')} hint={t('growth.sar_hint')} required>
              {(p) => <input {...p} className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
            </Field>
            <Field label={t('growth.gifts.recipient')}>{(p) => <input {...p} className="input" maxLength={80} value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })} />}</Field>
            <Field label={t('growth.gifts.message')}>{(p) => <textarea {...p} className="input" maxLength={300} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />}</Field>
            <Field label={t('growth.gifts.expiry')}>{(p) => <input {...p} className="input" type="number" min={30} max={1095} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} />}</Field>
            <CustomerPicker tenant={tenant} value={purchaser} onChange={setPurchaser} />
            <fieldset>
              <legend>{t('growth.sold_on_site')}</legend>
              <div className="chips" style={{ marginBottom: 10 }}>
                <button type="button" className="chip" aria-pressed={f.mode === 'sale'} onClick={() => setF({ ...f, mode: 'sale' })}>{t('growth.sold_on_site')}</button>
                <button type="button" className="chip" aria-pressed={f.mode === 'comp'} onClick={() => setF({ ...f, mode: 'comp' })}>{t('growth.complimentary')}</button>
              </div>
              {f.mode === 'sale' && (
                <div className="grid cols-2" style={{ gap: 10 }}>
                  <select className="input" aria-label={t('common.select')} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as 'cash' | 'card_terminal' })}>
                    <option value="cash">{t('growth.method_cash')}</option>
                    <option value="card_terminal">{t('growth.method_terminal')}</option>
                  </select>
                  <input className="input" aria-label={t('growth.reference')} placeholder={t('growth.reference')} required value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
                </div>
              )}
            </fieldset>
            <div className="form-actions"><button className="btn btn-gold" disabled={issue.busy || amountMinor < 1000}>{t('growth.gifts.issue')}</button></div>
          </form>
        </Drawer>
      )}
    </>
  );
}
