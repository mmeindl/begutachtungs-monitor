/**
 * Where each Stellungnahme keeps its own document, asked for the rows a
 * reader can actually see.
 *
 * The panel may hold 700 rows in the DOM ("alle anzeigen"), and each answer
 * costs one upstream request at the source — so the rows ask as they scroll
 * into view (`StatementDocumentTag`) and this queue collects the asks of one
 * screen into a single call. Debounced by a frame's worth of time, so ten
 * rows appearing together travel as one request, not ten.
 *
 * Module-level on purpose: the answer for 95/SN-132/ME is the same wherever
 * it is rendered, and the panel shows the same statement in the grouped
 * organisation row and in its sub-row. Written only in the browser — the
 * component asks in `onMounted` — so the shared module holds nothing across
 * SSR requests.
 */
import type { StatementDocument } from '#shared/types'

type Entry = { status: 'pending' } | { status: 'done'; doc: StatementDocument | null }

const entries = reactive(new Map<string, Entry>())
const queue = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

/** One viewport's worth — the endpoint refuses more. */
const BATCH_MAX = 32
/** Long enough for a screen of rows to arrive together, short enough to be unnoticed. */
const DEBOUNCE_MS = 60

async function flush() {
  timer = null
  const refs = [...queue].slice(0, BATCH_MAX)
  if (!refs.length) return
  for (const ref of refs) queue.delete(ref)

  let documents: Record<string, StatementDocument> = {}
  try {
    const res = await $fetch<{ documents: Record<string, StatementDocument> }>(
      '/api/stellungnahmen/dokumente',
      { method: 'POST', body: { refs } },
    )
    documents = res.documents ?? {}
  } catch {
    // Every ref in this batch settles as "no document known": the row keeps
    // its link to the parliament page and simply shows no tag. A failed
    // lookup must not leave a row pending forever.
  }
  for (const ref of refs) entries.set(ref, { status: 'done', doc: documents[ref] ?? null })

  // More rows arrived while this batch was in flight (a fast scroll).
  if (queue.size && !timer) timer = setTimeout(flush, DEBOUNCE_MS)
}

export function useStatementDocuments() {
  /** Ask for one statement's document; repeated asks cost nothing. */
  function request(ref: string) {
    if (entries.has(ref) || queue.has(ref)) return
    entries.set(ref, { status: 'pending' })
    queue.add(ref)
    if (!timer) timer = setTimeout(flush, DEBOUNCE_MS)
  }

  /** The PDF when this statement was filed as one, null while unknown or when its text sits on the page. */
  function pdfUrl(ref: string): string | null {
    const entry = entries.get(ref)
    if (entry?.status !== 'done') return null
    return entry.doc?.kind === 'pdf' ? entry.doc.url : null
  }

  /** True until the answer is in — the row reserves the tag's place meanwhile. */
  function isPending(ref: string): boolean {
    return entries.get(ref)?.status !== 'done'
  }

  return { request, pdfUrl, isPending }
}
