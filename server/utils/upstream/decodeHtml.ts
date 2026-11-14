/**
 * A published HTML document's bytes as text — the decoding `fetchDocument`
 * applies, out here so a corpus script reads the same characters the server
 * does (`scripts/corpus/rvGenannt.ts`).
 *
 * Parliament serves Word HTML as windows-1252 or utf-8; the header says
 * which, and where it does not, the document's own meta tag.
 *
 * Pure module.
 */
export function decodeHtml(buf: ArrayBuffer, headerCharset: string | undefined): string {
  let charset = headerCharset
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048))
    charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}
