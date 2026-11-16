/**
 * The page of a Regierungsvorlage or Antrag that came to the Nationalrat
 * without a Begutachtung: its record, the
 * procedure read off it, and whether the evidence carries „ohne
 * Begutachtung".
 *
 * Deliberately uncached, like `getDraftDetail`: composition over leaf caches.
 */
import type { NotFollowedData, ProcedureItemKind, ProcedureRoot, VorlageDetail } from '#shared/types'
import { budgetExemptReason } from '#shared/utils/budgetExempt'
import { itemPath, lawItemKindOf, parliamentItemUrl, rootCitation, vorlagePath } from '#shared/utils/procedureRoot'
import { withinBudget } from '../http/budget'
import { getLawsWithoutBegutachtung } from '../ris/skippedLawsService'
import { enactmentOfItem } from './draftDetail'
import { getCurrentGp, getDraftsForGp, getGegenstand } from './drafts'
import { findPrecedingDraft } from './precedingDraft'
import { assembleVorlageDetail, draftOfPreconst, pageKindOf, relatedItemsOf, relatedWithPages, type VorlageContent } from './vorlageDetailAssembly'
import { EBR_DOKTYP, findBundesratObjection, lawOfEbr, type EbrContent } from './detailJson'
import { anliegenPath } from '#shared/utils/anliegen'
import { VOLKSBEGEHREN_FIRST_GP, volksbegehrenOfVorlage } from './anliegen'

export type VorlageRoot = ProcedureRoot & { ityp: 'I' | 'A' }

/**
 * How long the page waits for the evidence behind „ohne Begutachtung". The
 * period's list of such laws is prewarmed, so warm it costs a lookup; cold it
 * is a minute. Past the budget the page renders without the fact —
 * it is a claim, and an unanswered check claims nothing — and the fetch keeps
 * filling the cache for the next reader.
 */
const EVIDENCE_BUDGET_MS = 2_000

/**
 * The item's record — 404 where it is not a Vorlage, a law's Antrag, a
 * committee's motion or a motion of the Bundesrat (`pageKindOf`).
 *
 * THE REFUSAL SAYS WHAT IS TRUE (14.11.2026). The item exists at
 * Parliament — its record was just read —, the monitor merely does not
 * follow it: an Ausschussbericht, an Entschließungsantrag, a treaty, an
 * Einspruch of the Bundesrat. It
 * said „Keine Regierungsvorlage" and the page „Vorlage nicht gefunden",
 * which denied an item Parliament shows. A Gegenstand Parliament does not
 * have stays the upstream 404 („Gegenstand nicht gefunden").
 *
 * An Einspruch (type EBR) is followed — as an event on its law's page — so
 * its address leads there (`followedAt`), where the law is known. A
 * Volksbegehren (type VOLKBG) is an Anliegen an das Parlament since
 * 15.11.2026 and its address leads to that page (`volksbegehrenOfVorlage`);
 * one before GP XXII is refused, with the period from which they are
 * followed (`anliegenFrom`).
 */
export async function requireVorlageItem(root: VorlageRoot): Promise<VorlageContent> {
  const detail = await getGegenstand(root.gp, root.ityp, root.inr)
  const content = (detail.content ?? {}) as VorlageContent
  if (!pageKindOf(root.ityp, content.doktyp)) {
    const volksbegehren = volksbegehrenOfVorlage(root.gp, root.ityp, root.inr, content.doktyp)
    const data: NotFollowedData = {
      parliamentUrl: parliamentItemUrl(root),
      followedAt: volksbegehren
        ? (volksbegehren.followed ? anliegenPath(volksbegehren.root) : null)
        : root.ityp === 'I' && (content.doktyp ?? '').trim() === EBR_DOKTYP
          ? await lawPathOfEbr(root, content as EbrContent)
          : null,
      ...(volksbegehren && !volksbegehren.followed ? { anliegenFrom: VOLKSBEGEHREN_FIRST_GP } : {}),
    }
    throw createError({ statusCode: 404, statusMessage: 'Kein Gegenstand, den der Monitor verfolgt', data })
  }
  return content
}

/**
 * The page of the law an Einspruch objects to, or null. The law from the
 * EBR's own „Bezug zu" (`lawOfEbr`); where the law's Verlauf names an
 * Einspruch, it must be this one — two witnesses that disagree send nowhere.
 * A Vorlage whose record names its Ministerialentwurf has its story on the
 * draft's page, so the address goes there in one step. A law whose record
 * does not answer still gets its own page, which redirects further itself.
 */
async function lawPathOfEbr(root: VorlageRoot, content: EbrContent): Promise<string | null> {
  const law = lawOfEbr(content.reference)
  if (!law) return null
  let lawContent: VorlageContent | null
  try {
    lawContent = ((await getGegenstand(law.gp, law.ityp, law.inr)).content ?? null) as VorlageContent | null
  } catch {
    return vorlagePath(law.gp, law.ityp, law.inr)
  }
  // A law the monitor does not follow itself (a treaty) has no page to lead
  // to. A committee's motion (1247 d.B. XXII behind 1284 d.B.) and a motion
  // of the Bundesrat have one since 14.11.2026.
  const lawKind = pageKindOf(law.ityp, lawContent?.doktyp)
  if (!lawKind) return null
  const back = findBundesratObjection(lawContent?.phase)?.ebr
  if (back && (back.gp !== root.gp || back.inr !== root.inr)) return null
  const draft = lawKind === 'regierungsvorlage' ? draftOfPreconst(lawContent?.preconst) : null
  return draft ? `/entwuerfe/${draft.gp}/${draft.inr}` : itemPath(law.gp, lawKind, law.inr)
}

/**
 * Whether „ohne Begutachtung" may be said — true only on evidence.
 *
 * A promulgated law — from a Vorlage, an Antrag, a committee's motion or a
 * motion of the Bundesrat: it is a row of the period's list of laws without
 * a Begutachtung, which ran every check there is. A Vorlage not yet
 * promulgated: the second round's check (`zweite-runde.get.ts`) — no draft
 * in its record, not a budget law, and no draft of the period plausibly
 * behind it by title. Any other kind not yet promulgated: no check exists,
 * so no fact. Every failure, every late answer: false.
 */
async function evidenceOfNoBegutachtung(
  root: VorlageRoot,
  kind: ProcedureItemKind,
  content: VorlageContent,
  promulgated: boolean,
): Promise<boolean> {
  const lawKind = lawItemKindOf(kind)
  if (!lawKind) return false
  if (promulgated) {
    const laws = await withinBudget(getLawsWithoutBegutachtung(root.gp), EVIDENCE_BUDGET_MS)
    if (!laws?.available) return false
    return laws.items.some((l) => l.item.kind === lawKind && l.item.gp === root.gp && l.item.inr === root.inr)
  }
  // A committee's motion not yet promulgated: its check (`skippedLaws`,
  // decision 2 of 14.11.2026) runs on laws only, so no fact — the page says
  // „nicht feststellbar". The Vorlagen' title check below would otherwise
  // run on it as if it were a Regierungsvorlage. An Antrag: no check at all.
  if (kind !== 'regierungsvorlage') return false
  const title = (content.title ?? '').trim()
  if (budgetExemptReason(root.gp, [{ ityp: 'I', inr: root.inr }], [title]) !== null) return false
  const drafts = await withinBudget(getDraftsForGp(root.gp), EVIDENCE_BUDGET_MS)
  if (!drafts) return false
  return findPrecedingDraft({ title, date: content.einlangen ?? null }, drafts.items) === null
}

export async function getVorlageDetail(root: VorlageRoot): Promise<VorlageDetail> {
  const [content, currentGp] = await Promise.all([requireVorlageItem(root), getCurrentGp()])
  // Not null: `requireVorlageItem` refused every item without a kind.
  const itemKind = pageKindOf(root.ityp, content.doktyp)!
  const enactment = await enactmentOfItem(
    root,
    { label: rootCitation(root), url: parliamentItemUrl(root), date: content.einlangen ? content.einlangen.slice(0, 10) : null },
    [],
    currentGp,
  )
  // A Vorlage that names its draft redirects there; the check would be moot.
  const named = itemKind === 'regierungsvorlage' && (content.preconst ?? []).some((p) => p?.ityp === 'ME')
  const [evidence, relatedItems] = await Promise.all([
    named ? false : evidenceOfNoBegutachtung(root, itemKind, content, Boolean(enactment.bgblNumber)),
    // Only a committee's motion links what it relates to (its parent); the
    // other kinds name nothing on the page yet, so no record is read.
    itemKind === 'ausschussantrag' ? relatedWithPages(content, getGegenstand) : Promise.resolve(relatedItemsOf(content.reference)),
  ])
  // A parent this page names as consulted outranks the list: the station
  // says so, and „ohne Begutachtung" beside it would contradict it — the
  // list's own rule (`related-consulted`), read off the parent's record here.
  const withoutBegutachtung = evidence && !relatedItems.some((r) => r.consultedDraft)
  return assembleVorlageDetail({ root, itemKind, content, enactment, currentGp, withoutBegutachtung, relatedItems })
}
