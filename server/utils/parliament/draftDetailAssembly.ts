/**
 * What a detail page says, once every fetch has answered — the assembly
 * step of `getDraftDetail` (docs/architecture.md §5).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute the module directly. It stood inside `draftDetail.ts` until
 * 23.09.2026, below six parallel upstream calls, and four product decisions
 * were therefore asserted by nothing: what a failed statements fetch
 * degrades to, when the page may say „bisher keine Regierungsvorlage" at
 * all, when it still offers the second filing window, and which of a
 * Vorlage's files is THE text.
 *
 * Every input that can fail arrives as `null` rather than as an exception,
 * because on this page every one of them is enrichment: the row, the detail
 * JSON and nothing else are the page.
 */
import type {
  DraftChain,
  DraftDetail,
  DraftDocument,
  DraftSummary,
  EnactmentInfo,
  RelatedDraft,
  RisMapRow,
  StatementMeta,
  TraceStep,
} from '../../../shared/types'
import { chainCoverageOf } from '../../../shared/utils/draftStations'
import { gpEndedOn, gpHasEnded } from '../../../shared/utils/gp'
import {
  findHandoff,
  mapDocuments,
  mapInvitedBy,
  mapTextEvolution,
  parseShortinfo,
  RV_STATION,
  type RawDocumentGroup,
  type RawName,
  type RawShortinfo,
} from './detailJson'
import { deriveShortTitle } from './list81'
import { buildStatementsSummary } from './statementsSummary'

/**
 * As much of the Gegenstand payload as the assembly reads — structurally,
 * not as `GegenstandResponse['content']`. That type lives in
 * `upstream/parliament.ts`, which is Nitro; importing it even as a type
 * would pull that module into the tools typecheck for no gain. Naming the
 * four fields is also the shorter statement of what this step depends on.
 */
export interface DraftDetailContent {
  documents?: RawDocumentGroup[] | null
  /** Misleading upstream key: the law text at the stations AFTER the draft. */
  statements?: { documents?: RawDocumentGroup[] | null } | null
  shortinfo?: RawShortinfo | null
  names?: RawName[] | null
}

export interface DraftDetailInputs {
  /** The draft's own period — compared against the running one for `gpEnded`. */
  gp: string
  /** List 81's row: the page without any enrichment. */
  summary: DraftSummary
  /** The detail JSON's payload, `{}` where upstream sent none. */
  content: DraftDetailContent
  /** `parseStages(content.stages)`, parsed once by the caller and shared. */
  trace: TraceStep[]
  /** The running Gesetzgebungsperiode, from its own leaf cache. */
  currentGp: string
  /** List 142, live or last-good; `null` when even the fallback had nothing. */
  statements: { items: StatementMeta[]; staleAsOf: string | null } | null
  /** The RIS join for this period; `null` when it failed or ran past its budget. */
  risMap: { rows: RisMapRow[] } | null
  /** The period's ME→RV links; `null` when it failed or ran past its budget. */
  stationMap: Record<number, DraftChain> | null
  /** The Vorlage's half of the outcome; `null` while there is no Vorlage. */
  enactment: EnactmentInfo | null
  related: { predecessor: RelatedDraft | null; successor: RelatedDraft | null }
}

export function assembleDraftDetail(input: DraftDetailInputs): DraftDetail {
  const { content, enactment, gp, related, risMap, stationMap, summary, trace } = input

  // The list-81 counter (row[13]) is dropped here: the detail response
  // carries exactly ONE statements number — from list 142, the same source
  // as the breakdown below it. Sole exception: when list 142 is down, the
  // list-81 count is the only truth left and travels flagged as `degraded`.
  const { statementCount: listCount, ...base } = summary

  const documents = mapDocuments(content.documents)
  // The draft's own document URLs are what upstream repeats while no RV
  // exists — excluded, so only what really came after the ME survives.
  const versions = mapTextEvolution(
    content.statements?.documents,
    new Set(documents.flatMap((doc) => doc.formats.map((f) => f.url))),
  )
  if (enactment) {
    /* THE PDF FIRST, and not because it is nicer to read: a Vorlage
     * publishes its text as both, and only one of the two may be THE link
     * under the Kundmachung. Filled here rather than in `enactmentOf`,
     * because the station of a document is known only once the text
     * versions are mapped. */
    enactment.rvTextUrl =
      versions.find((v) => v.station === RV_STATION && v.url.endsWith('.pdf'))?.url ??
      versions.find((v) => v.station === RV_STATION)?.url ??
      null
  }

  return {
    ...base,
    shortTitle: deriveShortTitle(summary.title),
    description: parseShortinfo(content.shortinfo),
    invitedBy: mapInvitedBy(content.names),
    documents,
    handoff: findHandoff(trace),
    // Later stations only: the RV's own text is enactment.rvTextUrl, where
    // the comparison offers it — listing it here too put the same link
    // under two headings.
    textEvolution: groupVersionsByStation(versions.filter((v) => v.station !== RV_STATION)),
    risDraft: risMap?.rows.find((r) => r.inr === summary.inr) ?? null,
    gpEnded: gpHasEnded(gp, input.currentGp),
    gpEndedOn: gpEndedOn(gp),
    chainCoverage: chainCoverageOf(
      stationMap ? Object.values(stationMap) : null,
      gpHasEnded(gp, input.currentGp),
    ),
    predecessor: related.predecessor,
    successor: related.successor,
    statements: input.statements
      ? {
          ...buildStatementsSummary(input.statements.items),
          overviewTotal: listCount,
          staleAsOf: input.statements.staleAsOf,
        }
      : {
          total: listCount,
          organisations: 0,
          privatePersons: 0,
          nonPublic: 0,
          organisationList: [],
          degraded: true,
        },
    enactment,
  }
}

/** One DocumentList row per station ("Geändert im Plenum") with its PDF/HTML formats. */
function groupVersionsByStation(versions: readonly { station: string; url: string }[]): DraftDocument[] {
  const out: DraftDocument[] = []
  for (const v of versions) {
    let doc = out.find((d) => d.title === v.station)
    if (!doc) {
      doc = { title: v.station, formats: [] }
      out.push(doc)
    }
    doc.formats.push({ type: v.url.toLowerCase().endsWith('.html') ? 'html' : 'pdf', url: v.url })
  }
  return out
}
