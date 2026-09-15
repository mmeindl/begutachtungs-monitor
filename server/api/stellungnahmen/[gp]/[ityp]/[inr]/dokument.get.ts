/**
 * GET /api/stellungnahmen/:gp/:ityp/:inr/dokument → 302 to the
 * Stellungnahme's document on parlament.gv.at: the uploaded PDF when there
 * is one, the item's page otherwise (`server/utils/statementDocument.ts`).
 * `ityp` is SNME (on a Ministerialentwurf) or SN (on a Regierungsvorlage).
 *
 * Never an error page for a reader who clicked a document: when the lookup
 * fails, the page URL is still known and is where the redirect goes. Only a
 * malformed address is a 400.
 */
import { GP_RE, INR_RE } from '#shared/utils/gp'
import { statementPageUrl, type StatementItemType } from '../../../../../utils/mappers'
import { getStatementDocument } from '../../../../../utils/statementDocument'

export default defineEventHandler(async (event) => {
  const gp = (getRouterParam(event, 'gp') ?? '').toUpperCase()
  const itypRaw = (getRouterParam(event, 'ityp') ?? '').toUpperCase()
  const inrRaw = getRouterParam(event, 'inr') ?? ''
  const validType = itypRaw === 'SNME' || itypRaw === 'SN'
  if (!GP_RE.test(gp) || !validType || !INR_RE.test(inrRaw) || Number(inrRaw) < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültige Adresse einer Stellungnahme (GP/SNME|SN/Nummer erwartet)',
    })
  }
  const ityp = itypRaw as StatementItemType
  const inr = Number(inrRaw)

  let target = statementPageUrl(gp, ityp, inr)
  try {
    target = (await getStatementDocument(gp, ityp, inr)).url
  } catch {
    // Upstream unreachable or the item unknown: the page link costs the
    // reader one click, an error page costs them the document.
  }
  // A filed Stellungnahme does not change; browsers may keep the answer.
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return sendRedirect(event, target, 302)
})
