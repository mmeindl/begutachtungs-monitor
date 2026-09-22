/**
 * POST /api/stellungnahmen/dokumente → where a batch of Stellungnahmen keep
 * their own document: `{ refs: ["XXVIII/SNME/5408", …] }` in,
 * `{ documents: { "XXVIII/SNME/5408": { kind, url } } }` out.
 *
 * Why a batch endpoint at all: list 142 carries no document links
 * (`docs/api-exploration.md` §list 142) and there is no bulk source for
 * them — measured 2026-09-16, the only signal is the item's own detail
 * JSON, one request each. The panel needs the answer BEFORE the click now,
 * because the row shows a PDF tag exactly where a PDF exists and shows
 * nothing where the text sits on the page instead; absence is information,
 * so it has to be true.
 *
 * What keeps that affordable: the client asks only for the rows that
 * actually scroll into view (`StatementDocumentTag`), never for the 700 it
 * may hold in the DOM, and `getStatementDocument` keeps each resolved URL in
 * the derived cache for a week. A page anyone has opened in that week
 * answers from cache with no upstream call at all.
 *
 * GDPR: the detail JSON that gets fetched names the submitter with postcode
 * and town — none of it is cached and none of it leaves this handler. What
 * is returned is a URL and a kind, nothing personal.
 */
import type { StatementDocument } from '#shared/types'
import { parseStatementRef } from '#shared/utils/statementRef'
import { getStatementDocument } from '../../utils/statementDocument'

/** One viewport's worth of rows, with room to spare — not a whole list. */
const BATCH_MAX = 32
/** Same ceiling the other fan-outs against parliament use. */
const CONCURRENCY = 6

export default defineEventHandler(async (event) => {
  const body = await readBody<{ refs?: unknown }>(event)
  const refs = Array.isArray(body?.refs) ? body.refs : null
  if (!refs || refs.length === 0 || refs.length > BATCH_MAX) {
    throw createError({
      statusCode: 400,
      statusMessage: `Erwartet: refs, 1 bis ${BATCH_MAX} Adressen der Form GP/SNME|SN/Nummer`,
    })
  }

  // Deduplicated and validated up front: one malformed entry must not cost
  // the other thirty-one their answer, so it is dropped, not thrown on.
  const jobs = new Map<string, ReturnType<typeof parseStatementRef>>()
  for (const raw of refs) {
    if (typeof raw !== 'string') continue
    const parsed = parseStatementRef(raw)
    if (parsed) jobs.set(raw, parsed)
  }

  const documents: Record<string, StatementDocument> = {}
  const queue = [...jobs]
  const worker = async () => {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      const [ref, parts] = job
      if (!parts) continue
      // A failed lookup is left out, not guessed: the row then shows no tag
      // and keeps its link to the parliament page, which is where the
      // reader would have landed anyway.
      const doc = await getStatementDocument(parts.gp, parts.ityp, parts.inr).catch(() => null)
      if (doc) documents[ref] = doc
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // A filed Stellungnahme does not change; the answer is a URL, so a shared
  // cache may keep it.
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return { documents }
})
