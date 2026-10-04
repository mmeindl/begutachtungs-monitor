<script setup lang="ts">
/**
 * "Was ändert der Entwurf?" — the Ressort's own Textgegenüberstellung
 * (docs/api-exploration.md §2c).
 *
 * Different question from LawDiffSection, and available much earlier. That
 * one asks what became of the draft after the Begutachtung and needs a
 * Regierungsvorlage, which arrives months later. This one asks what the
 * draft would do to the law in force, and it is there on day one — while a
 * Stellungnahme can still change something.
 *
 * The source is the ministry's annex, not a computation: no line here is
 * derived law text. Everything visual follows LawDiffSection — same badges,
 * same gutters, same folded groups — because the two sections answer
 * neighbouring questions and a second visual language would suggest a
 * difference that is not there.
 */
import ComparisonCaveats from '~/components/compare/ComparisonCaveats.vue'
import ListBox from '~/components/ui/ListBox.vue'
import type { AnnexWithheldCause, ConsolidatedParagraph, ConsolidatedTextResponse, LawDiffSegment, ParagraphExplanationView, TextComparisonResponse, TextComparisonRow } from '#shared/types'
import { explanationKey, explanationParaId } from '#shared/utils/explanationKey'
import { mixedPublishers, parliamentDocumentSource, PUBLISHER_NAME_DE, risSource, type SourceEntry } from '#shared/utils/provenance'
import { BADGE_CLASS, type DiffBadge, GUTTER_CLASS, UNCHECKED_PILL, badgeCounts, badgeLabels, paragraphBadge } from '~/utils/diffBadges'
import { readsSideBySide, splitSegments } from '~/utils/diffSides'
import { absaetze } from '~/utils/absaetze'
import {
  annexDoubtfulGroupNote,
  annexDoubtfulNote,
  annexDroppedPagesNote,
  annexUncheckedNote,
  annexWithheldBlame,
  annexWithheldText,
} from '~/utils/annexNotes'

/**
 * The draft's address, in the two shapes the corpus has — the same parameter
 * `useExplanations` takes, and for the same reason: a Ministerialentwurf is
 * reached through the RIS↔ME join, a Begutachtung without a Gegenstand
 * through its RIS id (docs/architecture.md §12.16). Everything this component
 * renders is identical for both; only the endpoint differs.
 */
const props = defineProps<{ gp?: string; inr?: number; risId?: string }>()

/** `/api/drafts/XXVIII/40` or `/api/ris-drafts/BEGUT_…` — the section's two endpoints hang off it. */
const base = computed(() => (props.risId ? `/api/ris-drafts/${props.risId}` : `/api/drafts/${props.gp}/${props.inr}`))

const { data, status } = await useFetch<TextComparisonResponse>(() => `${base.value}/gegenueberstellung`, {
  lazy: true,
  server: false,
})

/**
 * The Ressort's reasoning for the individual Paragraphen
 * (docs/architecture.md §12.30).
 *
 * The same document `ExplanationsSection` reads further up the page anyway —
 * one shared key in `useExplanations`, so one request for both sections,
 * stated rather than a side effect of equal URLs. And it may fail without
 * this section caring: the Textgegenüberstellung is the information, the
 * reasoning is the addition.
 */
const { data: explanations } = useExplanations(() => ({ gp: props.gp, inr: props.inr, risId: props.risId }))

/**
 * The konsolidierte Lesefassung — a third layer on the same Paragraph
 * (docs/architecture.md §12.12a).
 *
 * WHY HERE AND NOT IN A SECTION OF ITS OWN: a Paragraph is shown only where
 * the annex confirms it, so the Lesefassung is **always** a subset of this
 * section — 32 of 32 Paragraphen of 126/ME stand in both. The difference is
 * real all the same: the annex prints the Absatz it amends and abbreviates
 * the rest of the Paragraph to „(2) bis (5) …", for 26 of those 32 and in
 * characters 18.068 against 48.611. So the question „wie lautet die
 * Bestimmung dann" arises right here, at the §, and is answered here instead
 * of two screens further down.
 */
const { data: consolidated } = await useFetch<ConsolidatedTextResponse>(
  () => `${base.value}/konsolidiert`,
  { lazy: true, server: false },
)

/**
 * Looked up under the same key the gate used.
 *
 * Two entries per Paragraph, and the second is no convenience: for a
 * single-law Novelle the gate asked the annex WITHOUT a law
 * (`annexLaw: null`), while the annex's row carries one anyway. A lookup by
 * (law, number) alone would find nothing there.
 */
const consolidatedByKey = computed(() => {
  const out = new Map<string, ConsolidatedParagraph>()
  for (const p of consolidated.value?.paragraphs ?? []) {
    out.set(explanationKey(p.annexLaw, p.id.toLowerCase()), p)
    if (p.annexLaw === null) out.set(`*#${p.id.toLowerCase()}`, p)
  }
  return out
})

function consolidatedFor(law: string | null, para: string | null): ConsolidatedParagraph | null {
  const id = explanationParaId(para)
  if (!id) return null
  return consolidatedByKey.value.get(explanationKey(law, id)) ?? consolidatedByKey.value.get(`*#${id}`) ?? null
}

/** How many §§ the Lesefassung carries — whether the credit names its source. */
const consolidatedShown = computed(() => consolidated.value?.paragraphs.length ?? 0)

/** The passages, lookupable by (law, Paragraph). */
const explanationsByKey = computed(() => {
  const out = new Map<string, ParagraphExplanationView[]>()
  for (const e of explanations.value?.paragraphs ?? []) {
    const key = explanationKey(e.law, e.para)
    const list = out.get(key)
    if (list) list.push(e)
    else out.set(key, [e])
  }
  return out
})

/**
 * The passages for ONE § of the annex.
 *
 * Looked up, not searched: both sides build the same key from law and
 * normalised designation (`#shared/utils/explanationKey`). Where the annex
 * does not keep its laws apart its row carries no law while the entry does —
 * then the key finds nothing, and that is the right answer: § 5 of the second
 * law is a different provision from § 5 of the first.
 */
function explanationsFor(law: string | null, para: string | null): ParagraphExplanationView[] {
  const id = explanationParaId(para)
  return id ? explanationsByKey.value.get(explanationKey(law, id)) ?? [] : []
}

/**
 * `DiffToolbar`'s two controls, and they are worth more here than in the §
 * comparison.
 *
 * **Nebeneinander is the source's own shape.** The annex IS a two-column
 * table — "Geltende Fassung" beside "Vorgeschlagene Fassung" — and this
 * section reads it harmonised, as one sentence with the change marked in
 * place, because that is the better read for a handful of swapped words.
 * Where a ressort recasts a whole Absatz, the row gives back the presentation
 * the ressort chose — decided per row since 02.10.2026 (`readsSideBySide`),
 * where a toggle made the reader choose one view for both kinds of row.
 * Nothing is recomputed: `segments` carries `equal | removed | inserted` per
 * run, so the left column is everything but `inserted` and the right
 * everything but `removed`.
 *
 * **The kinds hide, they do not isolate** — the legend's reasoning is at
 * `DiffToolbar`. Here they count and hide whole §§, the unit the group pills
 * count in (`paragraphBadge`), so legend and pills add up alike.
 *
 * **The search matters more here too.** The comparison is complete by
 * construction — every § the annex prints is here, unchanged ones included —
 * so a reader with a term in mind ("Verwaltungsstrafe", "§ 40") has no other
 * way through. The diff section at least lets its pills lead the way.
 */
const query = ref('')
const hiddenKinds = ref<DiffBadge[]>([])

/**
 * Both columns, the designation and the law are searchable — as one
 * lowercased haystack per row, built once per response instead of once per
 * keystroke.
 *
 * The six fields are joined by a newline so a term cannot match across two of
 * them, and a single-line search box can never carry one: same answers as the
 * per-field comparison this replaced, without lowercasing the whole annex
 * again on every character typed.
 *
 * A withheld row can never match: the server empties its text before the
 * response leaves, so there is nothing to search. That is also why a search
 * hides the "n Änderungen hier nicht gezeigt" notice of a §, which is the
 * right behaviour for a view the reader has explicitly narrowed — the
 * unsearched section states it.
 *
 * NOT `matchesQuery`: that name belongs to the auto-imported
 * `shared/utils/textMatch.ts`, which takes a haystack string and splits the
 * query into AND-linked tokens. A local definition once shadowed it, so a
 * call here would silently have bound to different semantics.
 */
const haystacks = computed(() => {
  const out = new Map<TextComparisonRow, string>()
  for (const row of data.value?.rows ?? []) {
    out.set(row, [row.current, row.proposed, row.para, row.gld, row.heading, row.law].filter(Boolean).join('\n').toLowerCase())
  }
  return out
})

/** „entfällt" for a row that falls away — the one word this section does not
 *  share with the § comparison (`diffBadges.ts`). */
const BADGE_LABEL = badgeLabels('entfällt')

/**
 * A row whose two columns are nothing but the annex's elision notation, reaching
 * differently far („(1) bis (54) …" against „(1) bis (55) …"), is not the § changing
 * — it is the ressort leaving one Absatz more out. 13 such rows in the corpus
 * (26.09.2026). „redaktionell" is the pill this section already has for a
 * difference that is not one of substance, so it gets no sixth word; the line
 * below the pill says which case it is.
 */
function badgeOf(row: TextComparisonRow): DiffBadge {
  return row.editorial || row.elisionRange ? 'editorial' : row.change
}

interface Group {
  /** Stable identity for the open/expanded state — the law, not its label */
  key: string
  article: string
  rows: TextComparisonRow[]
  /** The header's pills, in §§ (`paragraphBadge`). */
  counts: Record<DiffBadge, number>
  /** §§ the check withheld — a pill of their own, so a collapsed group says
   *  itself that something is missing. */
  withheld: number
  /** §§ shown with a change the check could not reach (`nicht geprüft`). */
  unchecked: number
  /** Why, as the server worded it — distinct, first seen first. */
  uncheckedReasons: Set<string>
}

/**
 * The § a row belongs to, as the check keys it (`gateRows`: `gld ?? para`).
 * A row without one is a unit of its own — counting it into a „§ null"
 * would merge unrelated rows.
 */
function paragraphKeyOf(row: TextComparisonRow, index: number): string {
  return row.gld ?? row.para ?? `#${index}`
}

/** Owed a check and did not get one — „nicht geprüft". Whether a check is
 *  owed is the server's call (`owesCheck`, `gateRows`), never re-derived here. */
function isUnchecked(row: TextComparisonRow): boolean {
  return row.check === 'unchecked' && row.owesCheck
}

/**
 * One group per **law** of the package, not per heading the annex prints.
 *
 * Grouping by heading made one group per Abschnitt, per Hauptstück and per
 * heading over a group of §§: one draft showed 38 groups for its 5 laws.
 * `row.law` is the law the draft itself names (`annexBoundaries.ts`), so a
 * heading that divides *one* law now stands over its rows instead of
 * splitting the comparison.
 *
 * Rows the ressort abbreviated to "2. bis 26b. …" carry no text and only
 * interrupt the read, so they drop out — the context line already says how
 * much is unchanged. Since 2026-09-10 a row is `elided` only when it consists
 * of nothing *but* that syntax (`isElidedPair`), so the skip drops exactly
 * what it means to: the 919 rows that carried a real change behind a trailing
 * "…" are no longer among them.
 */
/** One § per law: the key both the legend and the filter count by. */
function paragraphIdOf(row: TextComparisonRow, index: number): string {
  return `${row.law ?? ''}|${paragraphKeyOf(row, index)}`
}

/**
 * Each §'s pill over the rows the search leaves — the same rule the group
 * headers apply below (`paragraphBadge`), and the same exclusion: a § the
 * check withheld is no kind of change on screen, so it is neither counted
 * nor ever hidden.
 */
const paragraphKinds = computed(() => {
  const byPara = new Map<string, { badges: Set<DiffBadge>; withheld: boolean }>()
  const q = query.value.trim().toLowerCase()
  for (const [index, row] of (data.value?.available ? data.value.rows : []).entries()) {
    if (row.kind === 'article' || row.elided) continue
    if (q && !haystacks.value.get(row)!.includes(q)) continue
    const id = paragraphIdOf(row, index)
    let p = byPara.get(id)
    if (!p) byPara.set(id, (p = { badges: new Set(), withheld: false }))
    if (row.check === 'withheld') p.withheld = true
    else p.badges.add(badgeOf(row))
  }
  const out = new Map<string, DiffBadge>()
  for (const [id, p] of byPara) if (!p.withheld && p.badges.size) out.set(id, paragraphBadge(p.badges))
  return out
})

/** The legend's counts, in §§ over the whole comparison. */
const kindCounts = computed(() => {
  const counts: Record<DiffBadge, number> = { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }
  for (const badge of paragraphKinds.value.values()) counts[badge]++
  return counts
})

const groups = computed<Group[]>(() => {
  if (!data.value?.available) return []
  const out: Group[] = []
  const start = (row: TextComparisonRow): Group => {
    const group: Group = { key: row.law ?? `#${out.length}`, article: row.kind === 'article' ? (row.heading ?? '') : '', rows: [], counts: { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }, withheld: 0, unchecked: 0, uncheckedReasons: new Set() }
    out.push(group)
    return group
  }
  // The query filters here rather than in a step of its own: an `article`
  // row is structural — it opens a group and carries the law's title — so it
  // always survives, and a group left without rows drops out below.
  const q = query.value.trim().toLowerCase()
  let current: Group | null = null
  /* Per group and §: the pills of its shown rows, and the check's state.
   * The verdict is per §, so a § is withheld or unchecked as a whole. */
  const paras = new Map<Group, Map<string, { badges: Set<DiffBadge>; withheld: boolean; unchecked: boolean }>>()
  for (const [index, row] of data.value.rows.entries()) {
    if (row.kind === 'article') {
      current = start(row)
      continue
    }
    if (row.elided) continue
    if (q && !haystacks.value.get(row)!.includes(q)) continue
    if (hiddenKinds.value.length) {
      const kind = paragraphKinds.value.get(paragraphIdOf(row, index))
      if (kind && hiddenKinds.value.includes(kind)) continue
    }
    if (!current || (row.law !== null && current.key !== row.law)) current = start(row)
    current.rows.push(row)
    let byPara = paras.get(current)
    if (!byPara) paras.set(current, (byPara = new Map()))
    const key = paragraphKeyOf(row, index)
    let p = byPara.get(key)
    if (!p) byPara.set(key, (p = { badges: new Set(), withheld: false, unchecked: false }))
    // A withheld row keeps its `change` but lost its text, so counting it
    // would put a change in the header pill that the block below says is not
    // shown — and `stats` already leaves those rows out. It is counted as
    // what it is: a § not shown.
    if (row.check === 'withheld') p.withheld = true
    else p.badges.add(badgeOf(row))
    // Rows without a § too, one unit each: they owe a check no verdict can
    // reach (they stood in the status line as „ohne Paragraphenangabe").
    if (isUnchecked(row)) {
      p.unchecked = true
      if (row.uncheckedReason) current.uncheckedReasons.add(row.uncheckedReason)
    }
  }
  // In §§ since 02.10.2026, not rows: every pill counts the same unit, so a
  // law's pills add up to its §§ (`paragraphBadge`).
  for (const [group, byPara] of paras) {
    for (const p of byPara.values()) {
      if (p.withheld) group.withheld++
      else group.counts[paragraphBadge(p.badges)]++
      if (p.unchecked) group.unchecked++
    }
  }
  return out.filter((g) => g.rows.length > 0)
})

const { toggleGroup, groupOpen, showAll, limitFor } = useFoldedGroups(query)

type Block =
  /** The two columns come along computed: the template asked for each of them
   *  twice per row, on every render, and a render happens per keystroke. */
  | { kind: 'row'; row: TextComparisonRow; from: LawDiffSegment[]; to: LawDiffSegment[]; split: boolean; unchecked: boolean }
  | { kind: 'context'; rows: TextComparisonRow[] }
  /**
   * Changes the RIS check would not vouch for. The server sends these rows
   * without their text (`server/utils/annex/gateRows.ts`), so there is
   * nothing to render but the fact — and that fact is worth a line: a
   * comparison that silently drops a § is a different kind of wrong answer
   * from one that says it did.
   */
  | { kind: 'withheld'; count: number; cause: AnnexWithheldCause | null }

/**
 * One block per **paragraph**, its Absätze beneath it.
 *
 * The annex prints one row per Absatz, so a § arrives as a run of rows of
 * which only the first carries the designation and the heading. Rendered row
 * by row that put the § heading over a single Absatz, repeated the
 * designation on every row that had one — and printed it twice, because the
 * text began with it as well — and set an inherited designation in a
 * different weight from an own one, which is a distinction about our parse
 * and not about the law. Collected per §, all three questions disappear:
 * designation and title stand once, on one line, the way law is printed.
 */
interface Para {
  /**
   * The § this block belongs to — `row.para`, '' for the rows before the
   * first designation. Doubles as the `v-for` key, and is unique within a
   * group because `para` is INHERITED by every row that opens no designation
   * of its own: a § therefore arrives as one contiguous run, never twice.
   */
  key: string
  /** "§ 40." — null for rows that precede the first designation */
  gld: string | null
  /** The annex's own heading for the paragraph */
  heading: string | null
  blocks: Block[]
  /** What the Ressort explains about this very §; empty when nothing was found. */
  explanations: ParagraphExplanationView[]
  /** The whole § as it would read after the draft; null where the gate withholds it. */
  consolidated: ConsolidatedParagraph | null
  /** Whether a row of this § already carries the „nicht geprüft" pill. */
  uncheckedMarked: boolean
}

function parasOf(g: Group): { paras: Para[]; hidden: number } {
  const limit = limitFor(g.key)
  // Searching means the reader asked for these very rows, so an unchanged
  // hit gets its own block instead of disappearing into a folded context
  // line that says only how many there were.
  const folding = !query.value.trim()
  const paras: Para[] = []
  let current: Para = { key: '\u0000', gld: null, heading: null, blocks: [], explanations: [], consolidated: null, uncheckedMarked: false }
  let context: TextComparisonRow[] = []
  let shown = 0
  let hidden = 0
  let withheld = 0
  // Every withheld row of a § carries the same cause — the verdict is per §.
  let withheldCause: AnnexWithheldCause | null = null
  const flush = () => {
    // The context line also stands on §§ that carry a Lesefassung, and that
    // is a decision rather than an oversight (19.09.2026): it folds the
    // unchanged rows OF THE ANNEX, in the same column logic as the changed
    // ones above — the Lesefassung below is our text from RIS. For a reader
    // reading the annex, „was hat das Ressort hier unverändert abgedruckt" is
    // different information from „so lautet der Paragraph dann". Dropping it
    // on those §§ was tried briefly and undone.
    if (context.length) current.blocks.push({ kind: 'context', rows: context })
    context = []
    if (withheld > 0) current.blocks.push({ kind: 'withheld', count: withheld, cause: withheldCause })
    withheld = 0
    withheldCause = null
  }
  for (const row of g.rows) {
    const key = row.para ?? ''
    if (current.key !== key) {
      flush()
      current = { key, gld: row.para, heading: null, blocks: [], explanations: explanationsFor(row.law, row.para), consolidated: consolidatedFor(row.law, row.para), uncheckedMarked: false }
      paras.push(current)
    }
    // The heading belongs to the paragraph, not to the Absatz that carries it.
    current.heading ??= row.heading
    if (row.check === 'withheld') {
      withheld++
      withheldCause ??= row.withheldCause ?? null
      continue
    }
    if (row.change === 'unchanged' && folding) {
      context.push(row)
      continue
    }
    if (shown >= limit) {
      hidden++
      continue
    }
    flush()
    // „nicht geprüft" beside the change badge, once per § (02.10.2026): the
    // verdict is per §, and on every row of a five-row § it would repeat
    // itself. At the first SHOWN row that owed a check, so a fold cannot
    // swallow it. A row without a § is a unit of its own and always gets it.
    const unchecked = isUnchecked(row) && (row.para === null || !current.uncheckedMarked)
    if (unchecked && row.para !== null) current.uncheckedMarked = true
    current.blocks.push({ kind: 'row', row, ...splitSegments(row.segments, row.current, row.proposed), split: readsSideBySide(row.segments), unchecked })
    shown++
  }
  flush()
  return { paras: paras.filter((p) => p.blocks.length > 0), hidden }
}

const renderedGroups = computed(() => groups.value.map((g) => ({ ...g, ...parasOf(g) })))

/** Whether the annex has rows at all — the toolbar's condition, unfiltered,
 *  so a search that finds nothing cannot remove the control that caused it. */
const hasRows = computed(() => (data.value?.rows ?? []).some((r) => r.kind !== 'article' && !r.elided))
const matchCount = computed(() => groups.value.reduce((n, g) => n + g.rows.length, 0))

/**
 * What a screen reader hears once the fetch is done.
 *
 * Until 18.09.2026 nothing at all: „Die Textgegenüberstellung wird geladen …"
 * stood there, was replaced client-side, and nobody announced it. Whoever
 * reads the page linearly waits for an announcement that never comes, and the
 * longest section of the page appears mutely.
 *
 * Empty while loading — the skeleton's sentence says that already, and a region
 * that already carries text when it is mounted is read out immediately by
 * some screen readers.
 */
const loadAnnouncement = computed(() => {
  if (status.value === 'pending' || status.value === 'idle') return ''
  if (status.value === 'error' || !data.value) {
    return 'Die Gegenüberstellung ist gerade nicht verfügbar.'
  }
  if (!data.value.available) return data.value.unavailableReason ?? ''
  return `Gegenüberstellung geladen, ${countLabelDe(matchCount.value, 'Zeile', 'Zeilen')}.`
})

/* The German sentences about the check — what was found, what is withheld
 * and why, which pages are missing, which law stands out — live in
 * `app/utils/annexNotes.ts`, where they can be tested against a small
 * response object. They are functions of the response and of nothing
 * else. */
/**
 * What this comparison shows, for its credit line (`#shared/utils/provenance`):
 * the annex from the copy that was read — RIS, or Parliament's, which carries
 * no claim — and the text in force behind the Lesefassung, always RIS. The
 * Erläuterungen at the §§ are credited by their own section.
 */
const sources = computed<SourceEntry[]>(() => {
  const d = data.value
  if (!d?.available) return []
  const out = [d.publisher === 'ris' ? risSource('Textgegenüberstellung') : parliamentDocumentSource('Textgegenüberstellung', 'me')]
  if (consolidatedShown.value > 0 && consolidated.value?.paragraphs[0]?.risUrl) out.push(risSource('Geltender Text'))
  return out
})
/** Where the annex came from Parliament and the text in force from RIS, the annex link names its publisher. */
const annexTag = computed(() => {
  const annex = sources.value[0]
  return annex && mixedPublishers(sources.value) ? ` (${PUBLISHER_NAME_DE[annex.publisher]})` : ''
})
const droppedPagesNote = computed(() => annexDroppedPagesNote(data.value?.droppedPages ?? 0))
/** The laws whose §§ fail in a cluster — said inside each law's group. */
const doubtfulLaws = computed(() => new Set(data.value?.verification?.doubtfulLaws ?? []))
const doubtfulGroupNote = computed(() => annexDoubtfulGroupNote(data.value?.readFrom ?? null))
/** Above the comparison only for a named law no group carries, so nothing is lost. */
const doubtfulNote = computed(() => {
  const keys = new Set(groups.value.map((g) => g.key))
  return annexDoubtfulNote([...doubtfulLaws.value].filter((l) => !keys.has(l)), data.value?.readFrom ?? null)
})
const withheldText = annexWithheldText
function withheldBlame(cause: AnnexWithheldCause | null): string | null {
  return annexWithheldBlame(cause, data.value?.readFrom ?? null)
}
</script>

<template>
  <div>
    <!-- Announces the end of loading, which otherwise happens silently.
         Stays in the DOM and empty rather than appearing only when done: a
         live region that does not yet exist when the change occurs is not
         read out. -->
    <p class="sr-only" role="status">{{ loadAnnouncement }}</p>

    <ListSkeleton v-if="status === 'pending' || status === 'idle'">
      Die Textgegenüberstellung wird geladen …
    </ListSkeleton>

    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Die Gegenüberstellung ist gerade nicht verfügbar.
    </p>

    <template v-else-if="!data.available">
      <p class="text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
      <!-- Unreadable for us is not unreadable for a person: whatever document
           exists gets linked. `source` carries the annex's HTML version at
           Parliament, or the RIS record whose assignment to this draft is in
           doubt; `pdf` the annex itself. Both are labelled, so both can be
           printed side by side. -->
      <p v-if="data.pdf || data.source" class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <ExternalLink v-if="data.source" :href="data.source.url" class="link-muted">{{ data.source.label }}</ExternalLink>
        <ExternalLink v-if="data.pdf" :href="data.pdf.url" class="link-muted">{{ data.pdf.label }}</ExternalLink>
      </p>
    </template>

    <template v-else>
      <!-- Where the text comes from and that the marking is ours stood here
           as a paragraph above what people came for until 18.09.2026 — word
           for word on every draft page. It is a caption, not a sentence: it
           now sits in `SectionCredits` at the foot of the section, beside the
           source it concerns. The provenance itself is not dropped — it must
           never sit behind a link.

           Nothing stands between the heading and the comparison since
           02.10.2026 but warnings specific to THIS draft and rare — a
           doubtful layout, missing pages, laws that could not be divided.
           The status line that stood here went (`annexUncheckedNote` says
           what moved where): the counts are pills in each law's header, and
           the PDF caveat is the credit line's „Zeilenzuordnung". Why a check
           did not run stood here too until 03.10.2026; it is under each
           law's „nicht geprüft" pill now. `space-y-3` spaces whichever notes
           exist. -->
      <div class="space-y-3">
        <!-- Where the layout could not be vouched for at all,
             the page says which part of the annex is missing rather than
             showing a comparison with a silent hole in it. And several laws
             in one draft, where the annex does not say where one ends:
             shown undivided, and said so — dividing it wrongly would put one
             law's § 5 under another law's name. -->
        <ComparisonCaveats :notes="[doubtfulNote, droppedPagesNote, data.boundaryNote]" />
      </div>

      <ListBox class="mt-4">
        <!-- Same toolbar as the § comparison, same order, in the box's head
             as there (02.10.2026), so the two sections are operated alike:
             the legend that hides kinds of change, then the search. -->
        <template v-if="hasRows" #header>
          <DiffToolbar
            v-model:query="query"
            v-model:hidden="hiddenKinds"
            :counts="kindCounts"
            :labels="BADGE_LABEL"
            search-label="In der Gegenüberstellung suchen"
          />
        </template>
        <DiffGroup
          v-for="g in renderedGroups"
          :key="g.key"
          :title="g.article"
          :badges="badgeCounts(g.counts, BADGE_LABEL)"
          :withheld="g.withheld"
          :unchecked="g.unchecked"
          :unchecked-note="annexUncheckedNote([...g.uncheckedReasons])"
          :open="groupOpen(g.key)"
          @toggle="toggleGroup(g.key)"
        >
          <p v-if="doubtfulLaws.has(g.key)" class="border-b border-hairline px-4 py-2.5 text-sm text-ink-secondary">{{ doubtfulGroupNote }}</p>
          <section v-for="p in g.paras" :key="p.key" class="border-b border-hairline px-4 py-3 last:border-b-0">
            <!-- The paragraph as law prints it: designation and title on one
                 line, once, above its Absätze — and no rule between the two,
                 because the line belongs to what follows it rather than
                 heading a band of its own. LawDiffSection sets a unit's
                 designation and name the same way. -->
            <p v-if="p.gld || p.heading" class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <span v-if="p.gld" class="font-medium text-ink">{{ p.gld }}</span>
              <span v-if="p.heading" class="min-w-0 text-ink-secondary">{{ p.heading }}</span>
            </p>

            <!-- Why this change — the Besonderer Teil's passage on this very
                 Paragraph (docs/architecture.md §12.30).

                 CLOSED and directly under the § line: the reader's question
                 here is „was ändert sich", answered by the rows below;
                 „warum" is the follow-up and does not arise for every §. A
                 disclosure costs one line and stands where the question
                 arises — below the Absätze it would be out of sight of its
                 own heading on a § with twelve rows.

                 The text is the Ressort's, unaltered and uncut: these
                 passages are short (the Besonderer Teil spreads over many),
                 and a second fold inside the disclosure would be a door
                 behind a door. -->
            <details v-if="p.explanations.length" class="group mb-2">
              <!-- In ink, not in the accent colour (18.09.2026). Blue is the
                   house colour of a link, and this disclosure leads
                   nowhere. What decides it is the frequency: it stands on
                   EVERY Paragraph, so 26 times on 26 §§ — exactly the case
                   `SpineRail` already had, where five station names in
                   accent-deep turned the card into seven blue rows out of
                   eleven and the brand colour carried no information any
                   more. The rank stays readable regardless:
                   `font-medium text-ink` against the `text-ink-muted` of the
                   unchanged rows two lines below. The chevron carries the
                   affordance, as on every other disclosure of this page. -->
              <summary class="-mx-2 flex w-fit min-h-target cursor-pointer list-none items-center gap-2 text-xs font-medium text-ink rounded px-2 hover:bg-hover [&::-webkit-details-marker]:hidden">
                <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                Begründung des Ressorts
              </summary>
              <!-- Indented, without a rule (18.09.2026). A rule on the left
                   means something in this section: it is the coloured gutter
                   marking a row as „geändert" or „neu". A grey gutter on the
                   reasoning would borrow that vocabulary for something that
                   is no change at all. The indent alone carries the
                   attribution — the same as the disclosure of unchanged
                   rows two lines below. -->
              <div class="mt-1 pl-6">
                <div v-for="(e, ei) in p.explanations" :key="ei" :class="ei > 0 ? 'mt-3' : ''">
                  <p class="text-xs text-ink-muted">{{ e.heading }}</p>
                  <p v-for="(t, ti) in e.text" :key="ti" class="mt-1 hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ t }}</p>
                </div>
              </div>
            </details>

            <!-- Keyed by KIND and position, not by position alone. The blocks
                 are rebuilt on every keystroke of the search field, and the
                 three kinds render different elements — a folded `<details>`
                 of unchanged rows, a changed row, a withheld notice. The
                 open state of a `<details>` lives in the DOM, so an index
                 key hands it to whatever takes that slot next. The rows of
                 an annex carry no id of their own, so the position stays in
                 the key; it is scoped to one §, because the `<section>`
                 above is keyed by the § itself. -->
            <div v-for="(b, bi) in p.blocks" :key="`${b.kind}-${bi}`" :class="bi > 0 ? 'mt-3' : ''">
              <p v-if="b.kind === 'withheld'" class="text-xs text-ink-muted">
                {{ b.count }} {{ b.count === 1 ? 'Änderung' : 'Änderungen' }} hier nicht gezeigt:
                <!-- The space as a string: Vue's whitespace condensing drops
                     a leading space inside `<template v-if>`, which printed
                     „…im RIS.Das kann …" (seen 30.09.2026). -->
                {{ withheldText(b.cause) }}{{ withheldBlame(b.cause) ? ` ${withheldBlame(b.cause)}` : '' }}
                Die Beilage des Ministeriums sagt, was sich ändert.
              </p>
              <details v-else-if="b.kind === 'context'" class="group">
                <summary class="-mx-2 flex w-fit min-h-target cursor-pointer list-none items-center gap-2 text-xs text-ink-muted rounded px-2 hover:bg-hover [&::-webkit-details-marker]:hidden">
                  <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  {{ b.rows.length }} {{ b.rows.length === 1 ? 'Stelle' : 'Stellen' }} unverändert
                </summary>
                <div class="mt-2 space-y-3 pl-6 text-sm leading-relaxed text-ink-secondary">
                  <p v-for="(r, ri) in b.rows" :key="`${r.gld ?? r.para ?? ''}-${ri}`" class="hyphens-auto">{{ r.current }}</p>
                </div>
              </details>

              <div v-else>
                <div class="border-l-2 pl-3" :class="GUTTER_CLASS[badgeOf(b.row)]">
                  <p class="mb-1 text-sm">
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="BADGE_CLASS[badgeOf(b.row)]">
                      {{ BADGE_LABEL[badgeOf(b.row)] }}
                    </span>
                    <!-- The check's state beside the change, as in the law
                         header: identity on the § line above, state here.
                         Confirmed §§ carry nothing — only the exception is
                         marked, as „nicht gezeigt" is by its notice; the
                         reasons stand on /so-funktionierts. -->
                    <span v-if="b.unchecked" :class="['ml-1.5', UNCHECKED_PILL]">nicht geprüft</span>
                  </p>

                  <!-- Both columns are the annex's own notation and reach
                     differently far: what changed is how much it leaves
                     out, not the provision. Said in words, because the word
                     diff of „(54)" against „(55)" shows the difference and
                     hides what it means. -->
                  <p v-if="b.row.elisionRange" class="mb-1 text-sm leading-relaxed text-ink-secondary">
                    Nicht der Paragraph ändert sich, sondern der Bereich, den die Beilage auslässt.
                  </p>

                  <!-- An unchanged row only reaches a block of its own while
                     a search is running; both columns hold the same text,
                     so it reads as the one sentence it is. -->
                  <p v-if="b.row.change === 'unchanged'" class="hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ b.row.current }}</p>
                  <p v-else-if="b.row.segments && !b.split" class="hyphens-auto text-sm leading-relaxed text-ink">
                    <DiffText :segments="b.row.segments" />
                  </p>
                  <!-- A row with only one side has one text; a column to hold
                     nothing beside it would be a column about our layout,
                     not about the law. Same rule as in the § comparison. -->
                  <p v-else-if="b.row.change === 'inserted'" class="hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.row.proposed }}</p>
                  <p v-else-if="b.row.change === 'removed'" class="hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.row.current }}</p>
                  <!-- The ressort's own two columns, under the ressort's own
                     headings. ONE shape for two cases: the Absatz was recast
                     too thoroughly to read inline, or the word diff was too
                     long to compute and
                     `splitSegments` marks each side whole. -->
                  <div v-else class="grid gap-x-4 gap-y-2 text-sm leading-relaxed sm:grid-cols-2">
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Geltende Fassung</p>
                      <p class="hyphens-auto text-ink">
                        <DiffText :segments="b.from" side="from" />
                      </p>
                    </div>
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Vorgeschlagene Fassung</p>
                      <p class="hyphens-auto text-ink">
                        <DiffText :segments="b.to" side="to" />
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- The third layer on the same Paragraph: not what changes and
                 not why, but how it reads afterwards (docs/architecture.md
                 §12.12a).

                 BELOW the changed rows, not above them (19.09.2026): the
                 rows are the information somebody opens the § for; the whole
                 Paragraph is the follow-up question and belongs where that
                 arises — at the end. Above the rows it would be a door in
                 front of the answer. The reasoning stays on top: it belongs
                 to the change, not to the result. -->
            <details v-if="p.consolidated" class="group mt-3">
              <summary class="-mx-2 flex w-fit min-h-target cursor-pointer list-none items-center gap-2 text-xs font-medium text-ink rounded px-2 hover:bg-hover [&::-webkit-details-marker]:hidden">
                <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                Ganzer Paragraph danach (nicht amtlich)
              </summary>
              <div class="mt-1 pl-6">
                <!-- „nicht amtlich" stands IN the summary since 30.09.2026,
                     so it is read before the disclosure opens, not after;
                     inside, only the way to how the text is made (RIS in
                     force plus this draft's instructions, confirmed by the
                     ressort's own Gegenüberstellung). -->
                <p class="text-xs text-ink-muted">
                  <NuxtLink to="/so-funktionierts#lesefassung" class="link-inline">Wie diese Lesefassung entsteht</NuxtLink>
                </p>
                <p v-if="p.consolidated.headingSegments" class="mt-2 text-sm font-semibold text-ink">
                  <DiffText :segments="p.consolidated.headingSegments" removed-normal-weight />
                </p>
                <!-- One paragraph per Absatz: that is how the law is
                     structured, and eighteen of them in one block are no
                     structure at all. -->
                <p
                  v-for="(abs, ai) in absaetze(p.consolidated.segments)"
                  :key="ai"
                  class="mt-2 hyphens-auto text-sm leading-relaxed text-ink"
                >
                  <DiffText :segments="abs" />
                </p>
              </div>
            </details>
          </section>

          <button
            v-if="g.hidden"
            type="button"
            class="flex min-h-target w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-accent-deep hover:bg-hover"
            @click="showAll(g.key)"
          >
            <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0" aria-hidden="true" />
            {{ g.hidden }} weitere {{ g.hidden === 1 ? 'Änderung' : 'Änderungen' }} anzeigen
          </button>
        </DiffGroup>
        <!-- A search box with no answer is worse than none: the section
             would just end, and an empty comparison reads as a claim about
             the draft. Same wording as the § comparison. Stays in the DOM as
             a live region and goes empty rather than disappearing: a region
             that comes into being with its text is not announced. A row of
             the box, under its head. -->
        <p
          v-if="hasRows"
          role="status"
          :class="matchCount ? 'sr-only' : 'px-4 py-4 text-sm text-ink-secondary'"
        >{{ matchCount ? '' : 'Nichts gefunden.' }}</p>
      </ListBox>

      <!-- Provenance under the text it belongs to, the way a source note
           sits under a table rather than over it (17.09.2026): it is looked up
           while or after reading, never before. „Markierung" stands beside
           „Quelle", because that is exactly the question a red/green marked
           ministry text raises: who did the marking?

           The publisher comes from the server, because the source is chosen
           there (`textComparisonService.publisher`); what may be claimed for
           it stands once, in the Impressum (`#shared/utils/provenance`,
           02.10.2026). The licence stood here until 01.10.2026, and so did a
           second „CC BY 4.0, RIS" for the text in force wherever the annex
           itself came from Parliament. -->
      <SectionCredits :sources="sources" :paired="data.readFrom === 'pdf'" method="/so-funktionierts#gegenueberstellung">
        <ExternalLink v-if="data.source" :href="data.source.url" class="link-muted">{{ data.source.label }}{{ annexTag }}</ExternalLink>
        <!-- The geltender Text of the Lesefassung, only where one is
             expandable somewhere: RIS text in force, with a Fundstelle of its
             own. -->
        <ExternalLink
          v-if="consolidatedShown > 0 && consolidated?.paragraphs[0]?.risUrl"
          :href="consolidated.paragraphs[0]!.risUrl!"
          class="link-muted"
        >Geltender Text im RIS</ExternalLink>
        <!-- Gone on 30.09.2026, both added the same morning: the Stichtag
             of the RIS check („RIS-Abgleich: Stand …") — the rule stands on
             /so-funktionierts#gegenueberstellung and the date itself in the
             bar and under „Geltendes Recht"; and the Lesefassung's
             denominator („bei 6 von 14"), which is no source, and whose
             worry — the other §§ read as unchanged (§12.27) — does not arise
             in a diff that marks every change. -->
      </SectionCredits>
    </template>
  </div>
</template>
