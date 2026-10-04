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
import type { H3Event } from 'h3'
import type { StatementDocument } from '#shared/types'
import { parseStatementRef } from '#shared/utils/statementRef'
import { mapWithConcurrency } from '../../utils/pool'
import { getStatementDocument } from '../../utils/parliament/statementDocument'

/** One viewport's worth of rows, with room to spare — not a whole list. */
const BATCH_MAX = 32
/** Same ceiling the other fan-outs against parliament use. */
const CONCURRENCY = 6
/**
 * The largest body this endpoint reads. A full legit batch is 32 refs of at
 * most ~24 characters each (`LXXXVIII/SNME/9999999` quoted, plus a comma) —
 * under 1 KB as JSON. 8 KB leaves room for whitespace and still keeps h3
 * from buffering whatever a client chooses to send: `readBody` has no limit
 * of its own.
 */
const BODY_MAX_BYTES = 8 * 1024

const TOO_LARGE = { statusCode: 413, statusMessage: 'Anfrage zu groß' }

/**
 * The JSON body, read with a ceiling — h3's `readBody` buffers whatever
 * arrives. A declared Content-Length over the ceiling is refused before a
 * byte is read; without one (HTTP/2 lets a client omit it, and the proxy
 * then forwards the body chunked) the stream is counted and dropped at the
 * ceiling, so a missing header is no way around it.
 *
 * Refusing mid-stream pauses the request and closes the connection after
 * the 413 rather than destroying the request: a destroyed request detaches
 * its socket before the response finishes, and Nitro's shutdown hook then
 * throws on `req.socket` being null. `Connection: close` also keeps Node
 * from draining the rest of the body for keep-alive.
 */
async function readCappedJson(event: H3Event): Promise<unknown> {
  const declared = getRequestHeader(event, 'content-length')
  if (declared !== undefined && !(Number(declared) <= BODY_MAX_BYTES)) {
    setResponseHeader(event, 'Connection', 'close')
    throw createError(TOO_LARGE)
  }
  const req = event.node.req
  const raw = await new Promise<Buffer | null>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer) => {
      size += chunk.length
      if (size <= BODY_MAX_BYTES) {
        chunks.push(chunk)
        return
      }
      req.off('data', onData)
      req.pause()
      resolve(null)
    }
    req.on('data', onData)
    req.once('end', () => resolve(Buffer.concat(chunks)))
    req.once('error', reject)
  })
  if (raw === null) {
    setResponseHeader(event, 'Connection', 'close')
    throw createError(TOO_LARGE)
  }
  const text = raw.toString('utf8')
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Ungültiges JSON' })
  }
}

export default defineEventHandler(async (event) => {
  const body = (await readCappedJson(event)) as { refs?: unknown } | undefined
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
  await mapWithConcurrency([...jobs], CONCURRENCY, async ([ref, parts]) => {
    if (!parts) return
    // A failed lookup is left out, not guessed: the row then shows no tag
    // and keeps its link to the parliament page, which is where the
    // reader would have landed anyway.
    const doc = await getStatementDocument(parts.gp, parts.ityp, parts.inr).catch(() => null)
    if (doc) documents[ref] = doc
  })

  // No Cache-Control: a POST response is not reused from a cache for a later
  // request, so a max-age here would promise nothing. The per-statement
  // answers are cached server-side (`getStatementDocument`).
  return { documents }
})
