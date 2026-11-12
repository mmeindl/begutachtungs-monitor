/**
 * The cache key for an input that is not a plain token — a URL, a search
 * phrase, a title, a Bundesgesetzblatt number — so that two different inputs
 * never share one entry.
 *
 * unstorage normalises every key before a driver sees it (`normalizeKey`,
 * unstorage 1.17): it cuts the key at its first „?", turns `/` and `\` into
 * `:`, folds a run of `:` into one and drops it at either end — and refuses
 * a key with a `.` or `..` segment outright. Nitro builds the storage key
 * from ours unchanged. So `…?jahr=2025` and `…?jahr=2026` were ONE entry, and
 * every one of Oberösterreich's Landtag pages was served the first one's
 * content (22.10.2026); `12/2026` and `12:2026` would be one as well, and a
 * URL with `/../` in its path would never be cached at all. Percent-encoded,
 * none of those characters is left bare — `?`, `/`, `\`, `:` and `%` itself
 * all become `%xx` — and the encoding is one-to-one.
 *
 * A LONG INPUT is hashed: the annex geometry's key names every Artikel of a
 * draft, and in dev the key is a file name on disk, where 255 bytes are the
 * limit. Past `MAX_KEY` the key is a readable head and the input's SHA-256
 * behind a `|`, a character the encoding never leaves bare — so no short key
 * can look like a long one.
 *
 * A plain token (`XXVIII-302`, a RIS id, a CELEX number) needs none of this
 * and keeps its key as it is.
 *
 * Pure module, no Nitro globals: vitest runs it as it is.
 */
import { createHash } from 'node:crypto'

/** The longest key kept readable: well under 255 bytes with Nitro's `.json`. */
const MAX_KEY = 180
/** How much of a hashed key stays readable, for whoever lists the cache. */
const HEAD = 100

export function storageKeyOf(input: string): string {
  const encoded = encodeURIComponent(input)
  if (encoded.length <= MAX_KEY) return encoded
  return `${encoded.slice(0, HEAD)}|${createHash('sha256').update(input).digest('hex')}`
}
