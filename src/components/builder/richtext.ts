/**
 * Owner-facing lightweight markup ⇄ allowlisted HTML.
 *   blank line = new paragraph · "- " lines = bullet list · "1. " = numbered list
 *   **bold** · *italic* · [text](https://…|mailto:…|tel:…)
 * Output is escaped HTML using only p/strong/em/ul/ol/li/br/a; the server
 * sanitizes it again on save and on render.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string): string {
  let out = esc(s);
  out = out.replace(/\[([^\]]{1,200})\]\(((?:https:\/\/|mailto:|tel:)[^\s)]{1,400})\)/g, (_m, text, url) => `<a href="${url}">${text}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return out;
}

export function markupToHtml(src: string): string {
  const blocks = src.replace(/\r/g, '').split(/\n\s*\n/);
  const out: string[] = [];
  for (const raw of blocks) {
    const lines = raw.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`);
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`);
    else out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export function htmlToMarkup(html: string): string {
  if (!html) return '';
  let s = html;
  s = s.replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_m, href, text) => `[${text}](${href})`);
  s = s.replace(/<strong>(.*?)<\/strong>/gi, '**$1**').replace(/<em>(.*?)<\/em>/gi, '*$1*');
  s = s.replace(/<ul>(.*?)<\/ul>/gis, (_m, inner) => `${inner.replace(/<li>(.*?)<\/li>/gis, '- $1\n')}\n`);
  s = s.replace(/<ol>(.*?)<\/ol>/gis, (_m, inner) => {
    let i = 0;
    return `${inner.replace(/<li>(.*?)<\/li>/gis, (_x: string, t: string) => `${++i}. ${t}\n`)}\n`;
  });
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<p>(.*?)<\/p>/gis, '$1\n\n');
  s = s.replace(/<[^>]+>/g, '');
  return unesc(s).replace(/\n{3,}/g, '\n\n').trim();
}
