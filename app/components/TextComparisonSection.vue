<script setup lang="ts">
/**
 * "Was ändert der Entwurf?" — the ressort's own Textgegenüberstellung
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
import type { AnnexWithheldCause, LawDiffSegment, TextComparisonResponse, TextComparisonRow } from '#shared/types'

const props = defineProps<{ gp: string; inr: number }>()

const { data, status } = await useFetch<TextComparisonResponse>(() => `/api/drafts/${props.gp}/${props.inr}/gegenueberstellung`, {
  lazy: true,
  server: false,
})

/**
 * Same two controls as LawDiffSection, and they are worth more here.
 *
 * **Nebeneinander is not a preference, it is the source's own shape.** The
 * annex IS a two-column table — "Geltende Fassung" beside "Vorgeschlagene
 * Fassung" — and this section deliberately reads it harmonised, as one
 * sentence with the change marked in place, because that is the better read
 * for a handful of swapped words. Where a ressort recasts a whole paragraph,
 * the harmonised reading strikes the entire old text and then prints the
 * entire new one, and the toggle gives back the presentation the ressort
 * chose. Nothing is recomputed: `segments` carries `equal | removed |
 * inserted` per run, so the left column is everything but `inserted` and the
 * right everything but `removed`.
 *
 * **The search matters more here too.** The comparison is complete by
 * construction — every § the annex prints is here, unchanged ones included —
 * so a reader with a term in mind ("Verwaltungsstrafe", "§ 40") has no other
 * way through. The diff section at least lets its pills lead the way.
 */
const view = ref<'inline' | 'split'>('inline')
const VIEW_OPTIONS: { value: 'inline' | 'split'; label: string }[] = [
  { value: 'inline', label: 'Fließtext' },
  { value: 'split', label: 'Nebeneinander' },
]

const query = ref('')

/**
 * Both columns, the designation and the law are searchable.
 *
 * A withheld row can never match: the server empties its text before the
 * response leaves, so there is nothing to search. That is also why a search
 * hides the "n Änderungen hier nicht gezeigt" notice of a §, which is the
 * right behaviour for a view the reader has explicitly narrowed — the
 * unsearched section states it.
 */
function matchesQuery(row: TextComparisonRow, q: string): boolean {
  return [row.current, row.proposed, row.para, row.gld, row.heading, row.law].some(
    (t) => t?.toLowerCase().includes(q),
  )
}

type Badge = TextComparisonRow['change'] | 'editorial'

/** Badges, gutters and order are LawDiffSection's — see the reasoning there. */
const BADGE_CLASS: Record<Badge, string> = {
  changed: 'bg-accent-50 text-accent-deep',
  editorial: 'bg-page text-ink-muted',
  unchanged: 'bg-page text-ink-muted',
  inserted: 'bg-status-good/15 text-ink',
  removed: 'bg-status-critical/10 text-ink',
}
const BADGE_LABEL: Record<Badge, string> = {
  changed: 'geändert',
  editorial: 'redaktionell',
  unchanged: 'unverändert',
  inserted: 'neu',
  removed: 'entfällt',
}
const GUTTER_CLASS: Record<Badge, string> = {
  changed: 'border-accent-deep/50',
  editorial: 'border-hairline',
  unchanged: 'border-hairline',
  inserted: 'border-status-good',
  removed: 'border-status-critical',
}
const BADGE_ORDER: Badge[] = ['inserted', 'removed', 'changed', 'editorial', 'unchanged']

function badgeOf(row: TextComparisonRow): Badge {
  return row.editorial ? 'editorial' : row.change
}

interface Group {
  /** Stable identity for the open/expanded state — the law, not its label */
  key: string
  article: string
  rows: TextComparisonRow[]
  counts: Record<Badge, number>
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
const groups = computed<Group[]>(() => {
  if (!data.value?.available) return []
  const out: Group[] = []
  const start = (row: TextComparisonRow): Group => {
    const group: Group = { key: row.law ?? `#${out.length}`, article: row.kind === 'article' ? (row.heading ?? '') : '', rows: [], counts: { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 } }
    out.push(group)
    return group
  }
  // The query filters here rather than in a step of its own: an `article`
  // row is structural — it opens a group and carries the law's title — so it
  // always survives, and a group left without rows drops out below.
  const q = query.value.trim().toLowerCase()
  let current: Group | null = null
  for (const row of data.value.rows) {
    if (row.kind === 'article') {
      current = start(row)
      continue
    }
    if (row.elided) continue
    if (q && !matchesQuery(row, q)) continue
    if (!current || (row.law !== null && current.key !== row.law)) current = start(row)
    current.rows.push(row)
    // A withheld row keeps its `change` but lost its text, so counting it
    // would put a change in the header pill that the block below says is not
    // shown — and `stats` already leaves those rows out. The block notice is
    // where a withheld change is accounted for.
    if (row.check !== 'withheld') current.counts[badgeOf(row)]++
  }
  return out.filter((g) => g.rows.length > 0)
})

const openGroups = ref<Set<string>>(new Set())
function toggleGroup(key: string) {
  const next = new Set(openGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openGroups.value = next
}
function groupOpen(g: Group): boolean {
  // A search IS the reader naming what they are after — the same rule as in
  // LawDiffSection, where a query opens every group rather than making the
  // reader hunt for which one holds the hits.
  return openGroups.value.has(g.key) || query.value.trim().length > 0
}
function groupBadges(g: Group): { badge: Badge; count: number }[] {
  return BADGE_ORDER.filter((b) => g.counts[b] > 0).map((b) => ({ badge: b, count: g.counts[b] }))
}

type Block =
  | { kind: 'row'; row: TextComparisonRow }
  | { kind: 'context'; rows: TextComparisonRow[] }
  /**
   * Changes the RIS check would not vouch for. The server sends these rows
   * without their text (`annexCheck.ts`), so there is nothing to render but
   * the fact — and that fact is worth a line: a comparison that silently
   * drops a § is a different kind of wrong answer from one that says it did.
   */
  | { kind: 'withheld'; count: number; cause: AnnexWithheldCause | null }

function sideSegments(row: TextComparisonRow, side: 'current' | 'proposed'): LawDiffSegment[] {
  const drop = side === 'current' ? 'inserted' : 'removed'
  return (row.segments ?? []).filter((seg) => seg.type !== drop)
}

/**
 * The row as two columns.
 *
 * `segments` is null when the word diff hit its cell ceiling, which is the
 * case the `sm:grid-cols-2` block already served before this toggle existed.
 * It now falls into the SAME presentation rather than a private one, so a
 * technical limit stops looking like a different kind of change — the same
 * clean-up the § comparison got.
 */
function splitRows(row: TextComparisonRow): { current: LawDiffSegment[]; proposed: LawDiffSegment[] } {
  if (row.segments) {
    return { current: sideSegments(row, 'current'), proposed: sideSegments(row, 'proposed') }
  }
  return {
    current: row.current ? [{ type: 'removed', text: row.current }] : [],
    proposed: row.proposed ? [{ type: 'inserted', text: row.proposed }] : [],
  }
}

/** Changes rendered before the "show the rest" line — LawDiffSection's cap. */
const SHOWN_CHANGES = 30

const fullyShown = ref<Set<string>>(new Set())
function showAll(key: string) {
  fullyShown.value = new Set(fullyShown.value).add(key)
}

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
  /** "§ 40." — null for rows that precede the first designation */
  gld: string | null
  /** The annex's own heading for the paragraph */
  heading: string | null
  blocks: Block[]
}

function parasOf(g: Group): { paras: Para[]; hidden: number } {
  const limit = fullyShown.value.has(g.key) ? Number.POSITIVE_INFINITY : SHOWN_CHANGES
  // Searching means the reader asked for these very rows, so an unchanged
  // hit gets its own block instead of disappearing into a folded context
  // line that says only how many there were.
  const folding = !query.value.trim()
  const paras: Para[] = []
  let current: Para & { key: string } = { key: '\u0000', gld: null, heading: null, blocks: [] }
  let context: TextComparisonRow[] = []
  let shown = 0
  let hidden = 0
  let withheld = 0
  // Every withheld row of a § carries the same cause — the verdict is per §.
  let withheldCause: AnnexWithheldCause | null = null
  const flush = () => {
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
      current = { key, gld: row.para, heading: null, blocks: [] }
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
    current.blocks.push({ kind: 'row', row })
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
 * What the check found, in two sentences — and, where it found nothing, that
 * it found nothing.
 *
 * **Both columns are held to something (2026-09-10).** The left one claims to
 * be the law in force and RIS holds that text independently; the right one
 * must not show as new what already stands in the §, and what it does show as
 * new has to occur in the draft's own Gesetzestext (`annexCheck.ts`). Saying
 * so is not a disclaimer — it is the difference between a comparison the
 * reader can rely on and one they cannot, and the count of what was withheld
 * is the honest part of it.
 *
 * **Never null while the comparison is shown.** Until 2026-09-10 this fell
 * silent whenever no § could be judged — 21 drafts of GP XXVIII — and silence
 * on a page that otherwise reports its checks reads as "checked, nothing to
 * report". `notRunReason` is the server's own fragment for that case
 * (`REASON_*` in `annexCheck.ts`, lower-case, joined by "; "), written to
 * follow a colon.
 *
 * **Units, twice over.** `withheldParagraphs` and `uncheckedParagraphs` count
 * §§; the notice inside a block counts rows ("2 Änderungen hier nicht
 * gezeigt"). Both nouns therefore appear here explicitly — "3 Paragraphen
 * werden nicht gezeigt" against "2 Änderungen" — rather than the earlier
 * "Stellen", which read as rows and counted §§. `rowsWithoutParagraph` is the
 * third quantity and the only one that really is rows: changes the annex
 * attributes to no § at all, so no verdict can reach them. It is named as
 * changes, and printed only when there are any — for most drafts it is zero,
 * and a clause about an empty set is noise.
 *
 * The withheld count is split by cause, because "the current version is not
 * in RIS like that" and "it shows text as new that already applies" are two
 * different findings and only the first is about the left column. The split
 * sums to the total by construction (`checkAnnexRows`), and a cause with a
 * count of zero gets no clause.
 *
 * §§ that could not be checked are counted, never as a fault: a draft
 * creating new law has no standing text to check against, and only §§ that
 * actually show a change are counted at all (`checkAnnexRows`).
 */
const checkNote = computed<string>(() => {
  const v = data.value?.verification ?? null
  // Null verification with `available: true` is not a state the server
  // produces; if it ever did, the honest reading is "no check happened".
  if (!v || v.judged === 0) {
    const why = v?.notRunReason
    const head = why
      ? `Nichts an dieser Gegenüberstellung konnte gegen den geltenden Text im RIS geprüft werden: ${why}`
      : 'Diese Gegenüberstellung wurde nicht gegen den geltenden Text im RIS geprüft'
    // Rare but reachable: no left column was judgeable, and a right-column
    // rule withheld a § all the same — an annex that only inserts §§ and puts
    // text into one that the draft never wrote. Saying "nothing could be
    // checked" while quietly dropping a § would be the silence this sentence
    // exists to end.
    const withheld = v && v.withheldParagraphs > 0 ? `; ${withheldClause(v.withheldParagraphs, v.withheldByCause)}` : ''
    return `${head}${withheld}.`
  }
  const asOf = v.asOf ? ` (Stand ${formatDateDe(v.asOf)}, dem Beginn der Begutachtungsfrist)` : ''
  const method = `Geprüft wird beides: die geltende Fassung gegen das RIS Bundesrecht${asOf}, die vorgeschlagene gegen denselben Text und gegen die Novellierungsanordnungen, die der Entwurf für den jeweiligen Paragraphen trifft.`
  const parts = [`${v.verified} von ${v.judged} geprüften Paragraphen halten beidem stand`]
  if (v.withheldParagraphs > 0) parts.push(withheldClause(v.withheldParagraphs, v.withheldByCause))
  if (v.uncheckedParagraphs > 0) {
    parts.push(`${v.uncheckedParagraphs} ${v.uncheckedParagraphs === 1 ? 'Paragraph mit Änderungen ließ' : 'Paragraphen mit Änderungen ließen'} sich nicht prüfen`)
  }
  if (v.rowsWithoutParagraph > 0) {
    parts.push(`dazu ${v.rowsWithoutParagraph} ${v.rowsWithoutParagraph === 1 ? 'gezeigte Änderung ohne Paragraphenangabe' : 'gezeigte Änderungen ohne Paragraphenangabe'}, ebenfalls ungeprüft`)
  }
  return `${method} ${parts.join('; ')}.`
})

/** "bei einem", "bei 3" — the subject of each clause stays singular either way. */
function atCount(n: number): string {
  return n === 1 ? 'bei einem' : `bei ${n}`
}

/**
 * "3 Paragraphen werden nicht gezeigt: bei einem …, bei zwei …" — the total
 * and what stands behind it.
 */
function withheldClause(total: number, by: Record<AnnexWithheldCause, number>): string {
  const head = total === 1 ? 'ein Paragraph wird nicht gezeigt' : `${total} Paragraphen werden nicht gezeigt`
  const causes: string[] = []
  if (by.standing > 0) causes.push(`${atCount(by.standing)} steht die geltende Fassung so nicht im RIS`)
  if (by.alreadyStanding > 0) causes.push(`${atCount(by.alreadyStanding)} zeigt die vorgeschlagene Fassung Text als neu, der schon gilt`)
  if (by.notInDraft > 0) {
    // "sie" only where the clause before it named the vorgeschlagene Fassung.
    const subject = by.alreadyStanding > 0 ? 'sie' : 'die vorgeschlagene Fassung'
    causes.push(`${atCount(by.notInDraft)} enthält ${subject} Text, den der Entwurf für diese Paragraphen nicht anordnet`)
  }
  return causes.length > 0 ? `${head}: ${causes.join(', ')}` : head
}

/**
 * What a withheld block says it found, and who might be at fault for it.
 *
 * Three findings, and the sentence has to name the one that applies to *this*
 * § — a single sentence for all three would tell the reader something untrue
 * about two of them.
 *
 * The second half is the attribution, and it depends on where the rows came
 * from. On the PDF path we inferred the pairing from the page geometry
 * ourselves, so every one of the three is at least as likely to be our
 * reading as the ministry's document: a left column that "does not match" may
 * be our pairing, a stretch that "already stands" may be our left column
 * losing a line, and text "not in the draft" may be our right column catching
 * a neighbour's. Handing the ministry the blame for our own reading would be
 * both wrong and against the framing of this project.
 */
const WITHHELD_FINDING: Record<AnnexWithheldCause, string> = {
  standing: 'der geltende Text dieser Stelle steht so nicht im RIS.',
  alreadyStanding: 'die vorgeschlagene Fassung zeigt Text als neu, der im RIS schon gilt.',
  notInDraft: 'die vorgeschlagene Fassung enthält Text, den der Entwurf für diesen Paragraphen nicht anordnet.',
}
const WITHHELD_FROM_PDF: Record<AnnexWithheldCause, string> = {
  standing: 'Das kann daran liegen, dass wir die Zeilen des PDF falsch einander zugeordnet haben, oder daran, dass die Beilage einen anderen Stand des Gesetzes zugrunde legt.',
  alreadyStanding: 'Das kann daran liegen, dass unsere Lesung der linken Spalte hier Text verloren hat, oder daran, dass die Beilage einen anderen Stand des Gesetzes zugrunde legt.',
  notInDraft: 'Das kann daran liegen, dass wir beim Lesen des PDF Text aus einer Nachbarzeile in die rechte Spalte gezogen haben, dass der Entwurf diese Änderung an einer anderen Stelle anordnet, oder dass die Beilage nicht zu seinem Gesetzestext passt.',
}
const WITHHELD_FROM_TABLE: Record<AnnexWithheldCause, string | null> = {
  standing: null,
  alreadyStanding: 'In der linken Spalte der Beilage fehlt dieser Text; sie dürfte dort einen anderen Stand des Gesetzes zugrunde legen als das RIS zum Beginn der Begutachtung.',
  notInDraft: 'Entweder ordnet der Entwurf diese Änderung an einer anderen Stelle an, oder die Beilage ist älter als sein Gesetzestext, oder wir haben die Stelle dem falschen Paragraphen zugeordnet.',
}

function withheldText(cause: AnnexWithheldCause | null): string {
  // No cause recorded is the state every withholding had before 2026-09-10.
  return WITHHELD_FINDING[cause ?? 'standing']
}
function withheldBlame(cause: AnnexWithheldCause | null): string | null {
  const key = cause ?? 'standing'
  return data.value?.readFrom === 'pdf' ? WITHHELD_FROM_PDF[key] : WITHHELD_FROM_TABLE[key]
}

/**
 * Pages of the PDF the parser refused, said as a gap and not as a defect.
 *
 * A page set differently from the rest of the document — another width, a
 * skewed run, runs disagreeing about which way the page is turned — is not
 * read differently but wrongly: the column boundary is one coordinate for the
 * whole document, so the words would be real and only their arrangement ours
 * (`annexPdf.ts`). The parser therefore leaves such a page unread, and that
 * is a hole in what the reader sees. Silence about it would be the worse
 * answer: the comparison would simply be missing a provision, with nothing
 * on the page to say so.
 *
 * Null for the table path and for every PDF read whole — which is all 114
 * GP-XXVIII annexes today. The sentence exists for the first one that is not.
 */
const droppedPagesNote = computed<string | null>(() => {
  const n = data.value?.droppedPages ?? 0
  if (n === 0) return null
  return n === 1
    ? 'Eine Seite des PDF war anders gesetzt als die übrigen und wurde nicht gelesen; was auf ihr steht, fehlt hier.'
    : `${n} Seiten des PDF waren anders gesetzt als die übrigen und wurden nicht gelesen; was auf ihnen steht, fehlt hier.`
})

/**
 * A law whose §§ fail in a cluster. Named, and the cause named honestly with
 * it — which depends on where the rows came from.
 *
 * On the ressort's XML table the pairing is the ressort's own, so a cluster
 * points at the annex quoting an older version of the law than RIS holds for
 * the first day of the consultation. On the PDF path we inferred the rows
 * from the page geometry ourselves, and a cluster is at least as likely to
 * be our reading — 21 of the 24 clusters in GP XXVIII are on that path. It
 * would be both wrong and against the framing of this project to hand the
 * ministry the blame for our own row pairing.
 *
 * The §§ that did verify are shown either way: they verified against the
 * standing text.
 */
const doubtfulNote = computed<string | null>(() => {
  const laws = data.value?.verification?.doubtfulLaws ?? []
  if (laws.length === 0) return null
  const named = laws.length === 1 ? `„${laws[0]}“` : laws.map((l) => `„${l}“`).join(', ')
  const cause =
    data.value?.readFrom === 'pdf'
      ? 'Das kann daran liegen, dass wir die Zeilen des PDF falsch einander zugeordnet haben, oder daran, dass die Beilage einen anderen Stand des Gesetzes zugrunde legt.'
      : 'Die Beilage dürfte dort einen anderen Stand des Gesetzes zugrunde legen als das RIS zum Beginn der Begutachtung.'
  return `Auffällig viele Stellen weichen vom geltenden Text ab bei ${named}. ${cause}`
})
</script>

<template>
  <div class="mt-4">
    <p v-if="status === 'pending' || status === 'idle'" class="text-sm text-ink-secondary">
      Die Textgegenüberstellung wird geladen …
    </p>

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
        <ExternalLink v-if="data.source" :href="data.source.url" class="text-accent-deep hover:underline">{{ data.source.label }}</ExternalLink>
        <ExternalLink v-if="data.pdf" :href="data.pdf.url" class="text-accent-deep hover:underline">{{ data.pdf.label }}</ExternalLink>
      </p>
    </template>

    <template v-else>
      <p class="text-sm text-ink-secondary">
        Das Ressort legt dem Entwurf eine Textgegenüberstellung bei. Der Text
        stammt von dort, die Markierung von uns. „Redaktionell“ heißt: nur
        Verweise, Zahlen, Daten oder Satzzeichen.
      </p>

      <!-- On the PDF path more than the marking is ours: RIS publishes this
           annex only as images, so the rows were inferred from the page
           layout. That is a weaker claim than the ressort's own table and
           has to be made in the open, not left to the source link. -->
      <p v-if="data.readFrom === 'pdf'" class="mt-2 text-sm text-ink-secondary">
        Diese Gegenüberstellung liegt im RIS nur als Bild vor. Der Text ist aus
        dem PDF des Ressorts gelesen, die Zuordnung der Zeilen zueinander haben
        wir aus dem Seitenlayout erschlossen — sie kann daneben liegen.
        <!-- And where the layout could not be vouched for at all, the page
             says which part of the annex is missing rather than showing a
             comparison with a silent hole in it. -->
        <template v-if="droppedPagesNote"> {{ droppedPagesNote }}</template>
      </p>

      <!-- Several laws in one draft, and the annex does not say where one
           ends. Shown undivided, and said so: dividing it wrongly would put
           one law's § 5 under another law's name. -->
      <p v-if="data.boundaryNote" class="mt-3 text-sm text-ink-secondary">{{ data.boundaryNote }}</p>

      <!-- What the RIS check made of the annex. Stated rather than implied:
           the reader is looking at the ministry's own text, and how much of
           it we could hold against the standing law is part of reading it.
           Always present — a comparison nothing could be checked in says so
           rather than falling silent, which reads as a clean bill. -->
      <p class="mt-3 text-sm text-ink-secondary">
        {{ checkNote }}
        <NuxtLink to="/so-funktionierts#gegenueberstellung" class="rounded text-accent-deep underline underline-offset-2 hover:no-underline">Wie wir prüfen</NuxtLink>
      </p>
      <p v-if="doubtfulNote" class="mt-2 text-sm text-ink-secondary">{{ doubtfulNote }}</p>

      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>Quelle (CC BY 4.0, RIS):</span>
        <ExternalLink v-if="data.source" :href="data.source.url" class="text-accent-deep hover:underline">{{ data.source.label }}</ExternalLink>
      </div>

      <!-- Same toolbar as the § comparison, same order, so the two sections
           are operated alike. No filter select: the annex prints every § it
           touches and the group pills already say how the changes divide —
           isolating one class was the control this page never needed. -->
      <div v-if="hasRows" class="mt-4 flex flex-wrap items-center gap-3">
        <UFieldGroup role="group" aria-label="Darstellung der Gegenüberstellung" class="shrink-0">
          <UButton
            v-for="v in VIEW_OPTIONS"
            :key="v.value"
            :color="view === v.value ? 'primary' : 'neutral'"
            :variant="view === v.value ? 'subtle' : 'outline'"
            :aria-pressed="view === v.value"
            size="sm"
            class="min-h-11"
            @click="view = v.value"
          >
            {{ v.label }}
          </UButton>
        </UFieldGroup>
        <UInput
          v-model="query"
          type="search"
          icon="i-lucide-search"
          placeholder="Im Text suchen …"
          aria-label="In der Gegenüberstellung suchen"
          class="ml-auto min-w-56 flex-1 sm:flex-none"
          :ui="{ base: 'min-h-11' }"
        />
      </div>

      <div class="mt-3 border-y border-hairline">
        <section v-for="g in renderedGroups" :key="g.key" class="border-b border-hairline last:border-b-0">
          <button
            type="button"
            class="flex w-full min-h-11 flex-col gap-2 bg-page px-3 py-3 text-left hover:bg-hairline/40"
            :aria-expanded="groupOpen(g)"
            @click="toggleGroup(g.key)"
          >
            <span class="flex w-full items-start gap-3">
              <span class="min-w-0 flex-1 text-sm font-semibold text-ink">{{ g.article || 'Gesetzestext' }}</span>
              <UIcon
                name="i-lucide-chevron-down"
                class="mt-0.5 size-4 shrink-0 text-ink-muted transition-transform"
                :class="{ 'rotate-180': groupOpen(g) }"
                aria-hidden="true"
              />
              <span class="sr-only">{{ groupOpen(g) ? 'zuklappen' : 'aufklappen' }}</span>
            </span>
            <span class="flex flex-wrap gap-1.5">
              <span
                v-for="b in groupBadges(g)"
                :key="b.badge"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                :class="BADGE_CLASS[b.badge]"
              >
                {{ b.count }} {{ BADGE_LABEL[b.badge] }}
              </span>
            </span>
          </button>

          <div v-if="groupOpen(g)" class="border-t border-hairline">
            <section v-for="(p, pi) in g.paras" :key="pi" class="border-b border-hairline px-3 py-3 last:border-b-0">
              <!-- The paragraph as law prints it: designation and title on one
                   line, once, above its Absätze — and no rule between the two,
                   because the line belongs to what follows it rather than
                   heading a band of its own. LawDiffSection sets a unit's
                   designation and name the same way. -->
              <p v-if="p.gld || p.heading" class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span v-if="p.gld" class="font-medium text-ink">{{ p.gld }}</span>
                <span v-if="p.heading" class="min-w-0 text-ink-secondary">{{ p.heading }}</span>
              </p>

              <div v-for="(b, bi) in p.blocks" :key="bi" :class="bi > 0 ? 'mt-3' : ''">
              <p v-if="b.kind === 'withheld'" class="text-xs text-ink-muted">
                {{ b.count }} {{ b.count === 1 ? 'Änderung' : 'Änderungen' }} hier nicht gezeigt:
                {{ withheldText(b.cause) }}<template v-if="withheldBlame(b.cause)"> {{ withheldBlame(b.cause) }}</template>
                Die Beilage des Ressorts sagt, was sich ändert.
              </p>
              <details v-else-if="b.kind === 'context'" class="group">
                <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs text-ink-muted [&::-webkit-details-marker]:hidden">
                  <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  {{ b.rows.length }} {{ b.rows.length === 1 ? 'Stelle' : 'Stellen' }} unverändert
                </summary>
                <div class="mt-2 space-y-3 pl-6 text-sm leading-relaxed text-ink-secondary">
                  <p v-for="(r, ri) in b.rows" :key="ri" class="hyphens-auto">{{ r.current }}</p>
                </div>
              </details>

              <div v-else>
                <div class="border-l-2 pl-3" :class="GUTTER_CLASS[badgeOf(b.row)]">
                  <p class="mb-1 text-sm">
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="BADGE_CLASS[badgeOf(b.row)]">
                      {{ BADGE_LABEL[badgeOf(b.row)] }}
                    </span>
                  </p>

                  <!-- An unchanged row only reaches a block of its own while
                       a search is running; both columns hold the same text,
                       so it reads as the one sentence it is. -->
                  <p v-if="b.row.change === 'unchanged'" class="hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ b.row.current }}</p>
                  <p v-else-if="b.row.segments && view === 'inline'" class="hyphens-auto text-sm leading-relaxed text-ink">
                    <template v-for="(s, si) in b.row.segments" :key="si">
                      <del v-if="s.type === 'removed'" class="rounded bg-status-critical/10 px-0.5 text-ink line-through decoration-status-critical/70">{{ s.text }}</del>
                      <ins v-else-if="s.type === 'inserted'" class="rounded bg-status-good/15 px-0.5 text-ink no-underline">{{ s.text }}</ins>
                      <span v-else>{{ s.text }}</span>
                      {{ ' ' }}
                    </template>
                  </p>
                  <!-- A row with only one side has one text; a column to hold
                       nothing beside it would be a column about our layout,
                       not about the law. Same rule as in the § comparison. -->
                  <p v-else-if="b.row.change === 'inserted'" class="hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.row.proposed }}</p>
                  <p v-else-if="b.row.change === 'removed'" class="hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.row.current }}</p>
                  <!-- The ressort's own two columns, under the ressort's own
                       headings. ONE shape for two cases: the reader asked for
                       them, or the word diff was too long to compute and
                       `splitRows` marks each side whole. -->
                  <div v-else class="grid gap-x-4 gap-y-2 text-sm leading-relaxed sm:grid-cols-2">
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Geltende Fassung</p>
                      <p class="hyphens-auto text-ink">
                        <template v-for="(s, si) in splitRows(b.row).current" :key="si">
                          <del v-if="s.type === 'removed'" class="rounded bg-status-critical/10 px-0.5 text-ink line-through decoration-status-critical/70">{{ s.text }}</del>
                          <span v-else>{{ s.text }}</span>
                          {{ ' ' }}
                        </template>
                      </p>
                    </div>
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Vorgeschlagene Fassung</p>
                      <p class="hyphens-auto text-ink">
                        <template v-for="(s, si) in splitRows(b.row).proposed" :key="si">
                          <ins v-if="s.type === 'inserted'" class="rounded bg-status-good/15 px-0.5 text-ink no-underline">{{ s.text }}</ins>
                          <span v-else>{{ s.text }}</span>
                          {{ ' ' }}
                        </template>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </section>

            <button
              v-if="g.hidden"
              type="button"
              class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-accent-deep hover:bg-page"
              @click="showAll(g.key)"
            >
              <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0" aria-hidden="true" />
              {{ g.hidden }} weitere {{ g.hidden === 1 ? 'Änderung' : 'Änderungen' }} anzeigen
            </button>
          </div>
        </section>
      </div>
      <!-- A search box with no answer is worse than none: the section would
           just end, and an empty comparison reads as a claim about the
           draft. Same wording as the § comparison. -->
      <p v-if="hasRows && !matchCount" class="mt-2 text-sm text-ink-secondary">Nichts gefunden.</p>
    </template>
  </div>
</template>
