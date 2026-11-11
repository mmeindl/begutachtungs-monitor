/**
 * The page of a Regierungsvorlage or Antrag that came to the Nationalrat
 * without a Begutachtung: its record, the
 * procedure read off it, and whether the evidence carries „ohne
 * Begutachtung".
 *
 * Deliberately uncached, like `getDraftDetail`: composition over leaf caches.
 */
import type { ProcedureRoot, VorlageDetail } from '#shared/types'
import { budgetExemptReason } from '#shared/utils/budgetExempt'
import { parliamentItemUrl, rootCitation } from '#shared/utils/procedureRoot'
import { withinBudget } from '../http/budget'
import { getLawsWithoutBegutachtung } from '../ris/skippedLawsService'
import { enactmentOfItem } from './draftDetail'
import { getCurrentGp, getDraftsForGp, getGegenstand } from './drafts'
import { findPrecedingDraft } from './precedingDraft'
import { assembleVorlageDetail, isPageItem, type VorlageContent } from './vorlageDetailAssembly'

export type VorlageRoot = ProcedureRoot & { ityp: 'I' | 'A' }

/**
 * How long the page waits for the evidence behind „ohne Begutachtung". The
 * period's list of such laws is prewarmed, so warm it costs a lookup; cold it
 * is a minute. Past the budget the page renders without the fact —
 * it is a claim, and an unanswered check claims nothing — and the fetch keeps
 * filling the cache for the next reader.
 */
const EVIDENCE_BUDGET_MS = 2_000

/** The item's record — 404 where it is not a Vorlage or a law's Antrag. */
export async function requireVorlageItem(root: VorlageRoot): Promise<VorlageContent> {
  const detail = await getGegenstand(root.gp, root.ityp, root.inr)
  const content = (detail.content ?? {}) as VorlageContent
  if (!isPageItem(root.ityp, content.doktyp)) {
    throw createError({
      statusCode: 404,
      statusMessage: root.ityp === 'I' ? 'Keine Regierungsvorlage' : 'Kein Gesetzesantrag',
    })
  }
  return content
}

/**
 * Whether „ohne Begutachtung" may be said — true only on evidence.
 *
 * A promulgated law: it is a row of the period's list of laws without a
 * Begutachtung, which ran every check there is. A Vorlage not yet
 * promulgated: the second round's check (`zweite-runde.get.ts`) — no draft
 * in its record, not a budget law, and no draft of the period plausibly
 * behind it by title. An Antrag not yet promulgated: no check exists, so no
 * fact. Every failure, every late answer: false.
 */
async function evidenceOfNoBegutachtung(
  root: VorlageRoot,
  content: VorlageContent,
  promulgated: boolean,
): Promise<boolean> {
  if (promulgated) {
    const laws = await withinBudget(getLawsWithoutBegutachtung(root.gp), EVIDENCE_BUDGET_MS)
    if (!laws?.available) return false
    const kind = root.ityp === 'I' ? 'rv' : 'antrag'
    return laws.items.some((l) => l.item.kind === kind && l.item.gp === root.gp && l.item.inr === root.inr)
  }
  if (root.ityp !== 'I') return false
  const title = (content.title ?? '').trim()
  if (budgetExemptReason(root.gp, [{ ityp: 'I', inr: root.inr }], [title]) !== null) return false
  const drafts = await withinBudget(getDraftsForGp(root.gp), EVIDENCE_BUDGET_MS)
  if (!drafts) return false
  return findPrecedingDraft({ title, date: content.einlangen ?? null }, drafts.items) === null
}

export async function getVorlageDetail(root: VorlageRoot): Promise<VorlageDetail> {
  const [content, currentGp] = await Promise.all([requireVorlageItem(root), getCurrentGp()])
  const enactment = await enactmentOfItem(
    root,
    { label: rootCitation(root), url: parliamentItemUrl(root), date: content.einlangen ? content.einlangen.slice(0, 10) : null },
    [],
    currentGp,
  )
  // A Vorlage that names its draft redirects there; the check would be moot.
  const named = root.ityp === 'I' && (content.preconst ?? []).some((p) => p?.ityp === 'ME')
  const withoutBegutachtung = named ? false : await evidenceOfNoBegutachtung(root, content, Boolean(enactment.bgblNumber))
  return assembleVorlageDetail({ root, content, enactment, currentGp, withoutBegutachtung })
}
