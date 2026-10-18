/** Client-safe social link builder (mirrors server/storefront/profile.ts validation). */
const NETS: Record<string, { hosts: string[]; base: string }> = {
  instagram: { hosts: ['instagram.com', 'www.instagram.com'], base: 'https://instagram.com/' },
  tiktok: { hosts: ['tiktok.com', 'www.tiktok.com'], base: 'https://www.tiktok.com/@' },
  snapchat: { hosts: ['snapchat.com', 'www.snapchat.com'], base: 'https://www.snapchat.com/add/' },
  x: { hosts: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'], base: 'https://x.com/' },
  whatsapp: { hosts: ['wa.me'], base: 'https://wa.me/' },
};

export const SOCIAL_LABELS: Record<string, [string, string]> = {
  instagram: ['إنستقرام', 'Instagram'],
  tiktok: ['تيك توك', 'TikTok'],
  snapchat: ['سناب شات', 'Snapchat'],
  x: ['إكس', 'X'],
  whatsapp: ['واتساب', 'WhatsApp'],
};

export function socialHref(network: string, value: string): string | null {
  const n = NETS[network];
  if (!n || !value) return null;
  const v = value.trim();
  if (/^https:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return n.hosts.includes(u.hostname.toLowerCase()) && !u.username ? u.toString() : null;
    } catch {
      return null;
    }
  }
  if (network === 'whatsapp') {
    let d = v.replace(/[\s+-]/g, '');
    if (/^05\d{8}$/.test(d)) d = `966${d.slice(1)}`;
    return /^\d{8,15}$/.test(d) ? `${n.base}${d}` : null;
  }
  const h = v.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,40}$/.test(h) ? `${n.base}${h}` : null;
}
