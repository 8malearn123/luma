import Link from 'next/link';

/** LUMA wordmark (platform identity — never used inside a storefront's own branding). */
export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="LUMA" style={{ textDecoration: 'none' }}>
      <span className="word">LUMA</span>
    </Link>
  );
}
