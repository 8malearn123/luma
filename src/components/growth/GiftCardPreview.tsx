import { formatMoney, type Locale } from '@/lib/format';

export interface BrandTokens {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  primary: string;
  primaryText: string;
  accent: string;
  border: string;
}

const FALLBACK: BrandTokens = { background: '#F7F3EC', surface: '#FFFFFF', text: '#2E241B', mutedText: '#6F6253', primary: '#9C8047', primaryText: '#FFFFFF', accent: '#C9AC7E', border: '#E6DCCB' };

/**
 * Gift card presentation templates rendered with the BUSINESS's storefront
 * brand tokens (never LUMA's dashboard colors). Pure SVG/CSS, no user HTML.
 * The code is only passed in right after issuance (shown once); otherwise the
 * masked last 4 are displayed.
 */
export function GiftCardPreview({
  template,
  brand,
  businessName,
  amountMinor,
  recipient,
  message,
  code,
  last4,
  locale,
  label,
}: {
  template: 'classic' | 'floral' | 'minimal';
  brand?: Partial<BrandTokens> | null;
  businessName: string;
  amountMinor: number;
  recipient?: string;
  message?: string;
  code?: string;
  last4?: string;
  locale: Locale;
  label: string;
}) {
  const b = { ...FALLBACK, ...(brand ?? {}) };
  const base: React.CSSProperties = {
    aspectRatio: '1.6 / 1',
    borderRadius: 18,
    padding: 22,
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    maxWidth: 420,
    boxShadow: '0 10px 30px rgba(0,0,0,.18)',
  };
  const styles: Record<string, React.CSSProperties> = {
    classic: { ...base, background: `linear-gradient(135deg, ${b.primary}, ${b.accent})`, color: b.primaryText },
    floral: { ...base, background: b.surface, color: b.text, border: `1px solid ${b.border}` },
    minimal: { ...base, background: b.background, color: b.text, border: `2px solid ${b.text}` },
  };
  return (
    <figure style={{ margin: 0 }} aria-label={label}>
      <div style={styles[template]}>
        {template === 'floral' && (
          <svg aria-hidden="true" viewBox="0 0 200 200" style={{ position: 'absolute', insetInlineEnd: -40, top: -40, width: 200, opacity: 0.35 }}>
            {[0, 60, 120, 180, 240, 300].map((r) => (
              <ellipse key={r} cx="100" cy="60" rx="22" ry="44" fill={b.accent} transform={`rotate(${r} 100 100)`} />
            ))}
            <circle cx="100" cy="100" r="16" fill={b.primary} />
          </svg>
        )}
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{businessName}</div>
          {recipient && <div style={{ fontSize: 15, marginTop: 6 }}>{recipient}</div>}
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>{formatMoney(amountMinor, 'SAR', locale)}</div>
          {message && <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 4, maxWidth: '80%' }}>{message}</div>}
          <div className="mono" style={{ fontSize: code ? 15 : 13, marginTop: 10, letterSpacing: '.12em', direction: 'ltr' }}>
            {code ?? `•••• •••• •••• ${last4 ?? '0000'}`}
          </div>
        </div>
      </div>
    </figure>
  );
}
