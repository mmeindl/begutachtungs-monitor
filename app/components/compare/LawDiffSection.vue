<script setup lang="ts">
/**
 * The § comparison between two versions of the law text (docs/ris-join.md
 * §6, docs/architecture.md §12.18). Framing rule: shows both what moved and
 * what stayed, never a blame counter. Loaded lazily on the client: the first
 * request per pair fetches and parses two documents, and the page must not
 * wait for that.
 *
 * The pair is chosen by the reader and lives in the URL (`?von=…&bis=…`), so
 * a comparison can be linked to — unlike the view toggle and the search,
 * which change how the same thing is read. Default stays
 * Ministerialentwurf → Regierungsvorlage, the question this product is about.
 */
import type { LawDiffResponse, LawDiffSegment, LawDiffUnit, LawStationId, ParagraphTitlesResponse, ReasoningDiffEntry, ReasoningDiffResponse } from '#shared/types'
import { diffUnitKey } from '#shared/utils/diffKey'
import { formatDateDe } from '#shared/utils/format'
import { ownChangeShare } from '#shared/utils/changeShare'
import { changeShareSentenceDe, earlyVorlageSentenceDe, tabledBeforeFristEnd } from '~/utils/outcomes'
import { BADGE_CLASS, type DiffBadge, GUTTER_CLASS, badgeCounts, badgeLabels } from '~/utils/diffBadges'
import { splitSegments } from '~/utils/diffSides'
import { displayId, extraHeading, unitName } from '#shared/utils/unitName'
import { droppedLawsNote, mergedLawsNote, outsideDraftNote } from '~/utils/lawPackage'
import {
  DEFAULT_LAW_STATION_PAIR,
  LAW_STATION_LABEL,
  defaultFromFor,
  isLawStationId,
  isLawStationPair,
  lawDiffSourceCredit,
  lawStationPairHint,
  lawStationPairQuestion,
} from '#shared/utils/lawStations'

const props = defineProps<{
  gp: string
  inr: number
  /** The draft's own dates — they decide which sentence stands under ME→RV (`tabledBeforeFristEnd`). */
  arrivedAt?: string | null
  deadline?: string | null
  rvDate?: string | null
}>()

const route = useRoute()
const router = useRouter()

/**
 * The pair from the URL, falling back to the default rather than erroring:
 * a hand-typed or stale link should show the comparison everyone means, not
 * a validation message. The server validates the same query independently
 * (`readLawStationPair`), because a request can arrive without this page.
 */
function pairFromRoute(): { from: LawStationId; to: LawStationId } {
  const bis = route.query.bis
  const von = route.query.von
  const to = isLawStationId(bis) ? bis : DEFAULT_LAW_STATION_PAIR.to
  const from = isLawStationId(von) ? von : defaultFromFor(to)
  if (!from || !isLawStationPair(from, to)) return { ...DEFAULT_LAW_STATION_PAIR }
  return { from, to }
}
const pair = ref(pairFromRoute())

const { data, status } = await useFetch<LawDiffResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/diff?von=${pair.value.from}&bis=${pair.value.to}`,
  { lazy: true, server: false },
)

/**
 * The name of each amended § (docs/architecture.md §12.11), fetched
 * separately so a slow lookup never delays the comparison and a failing one
 * never takes it down. Names appear when they arrive.
 *
 * Keyed on the same pair as the comparison: a Ziffer renumbered between two
 * stations addresses a different §, so names from another pair would be
 * wrong names.
 */
const { data: paraTitles } = await useFetch<ParagraphTitlesResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/paragraphtitel?von=${pair.value.from}&bis=${pair.value.to}`,
  { lazy: true, server: false },
)

/**
 * And whether the Ressort changed its **reasoning** for this provision
 * (docs/architecture.md §12.10b).
 *
 * Measured over GP XXVIII: for 48 % of the Paragraphen carrying a reasoning
 * on both sides it became a different one — so the question is worth asking.
 * A fetch of its own for the same reason as the names: two more documents
 * from Parliament must neither hold the comparison up nor take it down with
 * them.
 */
const { data: reasoning } = await useFetch<ReasoningDiffResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/begruendung?von=${pair.value.from}&bis=${pair.value.to}`,
  { lazy: true, server: false },
)

/**
 * The reasoning to show at one unit: a changed one, or one shown without a
 * comparison (`comparable: false`, the scope rule) — or nothing.
 *
 * Two steps, because there are two levels: computed per passage — the one on
 * the instruction's Ziffer, or where the Erläuterungen are titled by § the
 * Paragraph's (docs/architecture.md §12.10b, 01.10.2026) — and shown at the
 * Novellierungsanordnung; one passage „Zu Z 1 bis 3" serves three.
 */
function reasoningOf(u: LawDiffUnit): ReasoningDiffEntry | null {
  const key = reasoning.value?.units?.[diffUnitKey(u)]
  const entry = key ? reasoning.value?.entries?.[key] : null
  return entry && (entry.changed || !entry.comparable) ? entry : null
}

/**
 * The sentence above the comparison that explains the disclosures below it.
 *
 * Here rather than on every row: printing „unverändert" on 33 rows would be
 * noise, naming the rate once is the information. And it names both numbers —
 * how often the reasoning moved with the text and how often it did not —
 * because an unchanged reasoning for a changed text is a statement of its
 * own.
 */
const reasoningNote = computed<string | null>(() => {
  const stats = reasoning.value?.stats
  if (!stats?.compared) return null
  const { compared, changed } = stats
  // Shorter since 30.09.2026; „— aufklappbar an der Änderung" went, the
  // disclosure at each change announces itself. Counts Begründungen since
  // 01.10.2026, not Paragraphen: what is compared is the ressort's passage to
  // a change — one passage on three Ziffern is one Begründung, and only where
  // the Erläuterungen are titled by § is it the Paragraph's.
  if (changed === 0) {
    return compared === 1
      ? 'Die Begründung, die beide Fassungen zu den Änderungen führen, hat das Ressort nicht geändert.'
      : `Keine der ${compared} Begründungen, die beide Fassungen zu den Änderungen führen, hat das Ressort geändert.`
  }
  return `Auch die Begründung hat das Ressort geändert: bei ${changed} von ${compared} Begründungen, die beide Fassungen zu den Änderungen führen.`
})

/**
 * How much of THIS draft the Vorlage changed, held against the measured range
 * of a whole period (docs/architecture.md §12.38) — only for the pair the
 * base rate is measured on, draft against Regierungsvorlage. The comparison
 * shows what changed; this sentence says whether that is much.
 */
const changeShareNote = computed<string | null>(() => {
  if (pair.value.from !== 'me' || pair.value.to !== 'rv' || !data.value?.available) return null
  const share = ownChangeShare(data.value.stats)
  if (!share) return null
  // A Vorlage tabled while the Frist still ran is not held against the
  // range: that range was measured on Vorlagen that came after the
  // Begutachtung (`tabledBeforeFristEnd`, 115/ME).
  if (props.deadline && props.rvDate && tabledBeforeFristEnd(props.deadline, props.rvDate)) {
    const dates = { arrivedAt: props.arrivedAt ?? null, deadline: props.deadline, rvDate: props.rvDate }
    return earlyVorlageSentenceDe(share.changed, share.own, shareNoun.value, dates, laterPairLabel.value)
  }
  return changeShareSentenceDe(props.gp, share.changed, share.own, shareNoun.value)
})

/* The two Erläuterungen, one per side. The service sends them as
 * [Entwurf, Regierungsvorlage] (`reasoningDiffService`), and only where both
 * were found. */
const reasoningDocs = computed(() => (reasoning.value?.sources?.length === 2 ? reasoning.value.sources : null))
const rvReasoningDoc = computed(() => reasoningDocs.value?.[1] ?? null)
/** A side's Erläuterungen for the credit line — only where the comparison of them ran. */
function reasoningDocFor(station: LawStationId) {
  const stats = reasoning.value?.stats
  // Uncompared passages are text on the page too, so their documents are credited.
  if (!stats || stats.compared + (stats.uncompared ?? 0) === 0 || !reasoningDocs.value) return null
  if (station === 'me') return reasoningDocs.value[0] ?? null
  if (station === 'rv') return reasoningDocs.value[1] ?? null
  return null
}
/** One entry per compared version for the credit line: its name, its text, its Erläuterungen. */
const creditSides = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { station: pair.value.from, label: fromLabel.value, text: d.fromDocument, reasoning: reasoningDocFor(pair.value.from) },
    { station: pair.value.to, label: toLabel.value, text: d.toDocument, reasoning: reasoningDocFor(pair.value.to) },
  ].filter((side) => side.text || side.reasoning)
})
const paraTitlesAsOf = computed(() => (paraTitles.value?.asOf ? formatDateDe(paraTitles.value.asOf) : null))

/** „Regierungsvorlage → Ausschussfassung": the Vorlage against the next text this draft has, as the select names it. */
const laterPairLabel = computed<string | null>(() => {
  const stations = data.value?.stations ?? []
  const i = stations.findIndex((s) => s.id === 'rv')
  const rv = stations[i]
  const next = stations[i + 1]
  if (!rv || !next || !isLawStationPair(rv.id, next.id)) return null
  return `${rv.label} → ${next.label}`
})

/**
 * Every comparison this draft can show, as ordered pairs of the stations it
 * actually published a text for.
 *
 * ONE control offering comparisons, not two offering stations: the reader's
 * question is "what did the committee change?", not "which two documents
 * shall I pick". It also makes an impossible pair unrepresentable — no
 * flipped, no equal ends — which two independent selects would have to catch
 * and explain. Both ends stay freely selectable, they are just enumerated.
 *
 * A station whose text is PDF-only says so in the option: the § parser needs
 * the HTML export, and a reader who picks it should know beforehand rather
 * than get an explanation afterwards.
 */
const comparisons = computed(() => {
  const stations = data.value?.stations ?? []
  const out: { value: string; from: LawStationId; to: LawStationId; label: string }[] = []
  for (const from of stations) {
    for (const to of stations) {
      // `isLawStationPair` rather than an index comparison: since the BGBl
      // station the rule has an exception (no actor stands behind
      // plenum→bgbl, docs/architecture.md §12.33), and it may live in ONE
      // place only — the server checks what is offered here with the same
      // function.
      if (!isLawStationPair(from.id, to.id)) continue
      const pdfOnly = [from, to].filter((s) => !s.comparable).map((s) => s.label)
      out.push({
        value: `${from.id}>${to.id}`,
        from: from.id,
        to: to.id,
        label:
          `${from.label} → ${to.label}` +
          (pdfOnly.length ? ` (${pdfOnly.join(' und ')} nur als PDF)` : ''),
      })
    }
  }
  return out
})

/** The value of the select, kept in sync with the pair in the URL. */
const selectedComparison = computed({
  get: () => `${pair.value.from}>${pair.value.to}`,
  set: (value: string) => {
    const choice = comparisons.value.find((c) => c.value === value)
    if (!choice) return
    pair.value = { from: choice.from, to: choice.to }
    // `replace`, not `push`: the pair belongs in the URL so it can be
    // shared, but flipping between comparisons should not fill the back
    // button with steps the reader has to walk out of. The default pair
    // leaves the query empty, so the canonical URL of a draft stays clean.
    const query = { ...route.query }
    if (choice.from === DEFAULT_LAW_STATION_PAIR.from && choice.to === DEFAULT_LAW_STATION_PAIR.to) {
      delete query.von
      delete query.bis
    } else {
      query.von = choice.from
      query.bis = choice.to
    }
    router.replace({ query })
  },
})

/**
 * The section's heading never changes, and the question of the selected pair
 * stands BELOW the controls (Manu, 17.09.2026: "we should never change
 * things above because they can be missed easily").
 *
 * The rule is positional and worth stating as one: a reader's eye is at the
 * control they just used, so whatever a control changes has to be at it or
 * under it. Before this, picking a pair rewrote four blocks ABOVE the
 * select — heading, description, source line, package notes — and the select
 * itself was the only thing in view.
 *
 * The heading is the DEFAULT pair's question, and that is not a compromise:
 * it names the era every one of these comparisons belongs to — everything
 * here happened after the Begutachtung — while the line under the controls
 * names the step. It also keeps the wording the two links that point here
 * already use (the Regierungsvorlage station of the spine, and the outcome
 * card).
 */
const heading = lawStationPairQuestion(DEFAULT_LAW_STATION_PAIR.from, DEFAULT_LAW_STATION_PAIR.to)
const isDefaultPair = computed(
  () => pair.value.from === DEFAULT_LAW_STATION_PAIR.from && pair.value.to === DEFAULT_LAW_STATION_PAIR.to,
)
/** Only for the other pairs: on the default one it would repeat the heading. */
const question = computed(() => lawStationPairQuestion(pair.value.from, pair.value.to))
const fromLabel = computed(() => LAW_STATION_LABEL[pair.value.from])
const toLabel = computed(() => LAW_STATION_LABEL[pair.value.to])

/** The three sources of a name and their order live in `#shared/utils/unitName`. */
function nameOf(u: LawDiffUnit): string | null {
  return unitName(u, paraTitles.value?.titles, diffUnitKey(u))
}

/** Whether any name on screen was looked up, which decides the source note. */
const namedCount = computed(() => Object.keys(paraTitles.value?.titles ?? {}).length)

/** „entfallen" for a whole § that is gone — the one word the two sections
 *  do not share (`diffBadges.ts`). */
const BADGE_LABEL = badgeLabels('entfallen')

function badgeOf(u: LawDiffUnit): DiffBadge {
  return isMinor(u) ? 'editorial' : u.change
}

/**
 * Searching, but no filtering by change kind — the select that offered it was
 * removed on 17.09.2026 (Manu, with the page in front of him).
 *
 * It offered ISOLATION ("show only neu") where the reader's actual task is
 * SUPPRESSION ("hide the redaktionell ones so I see the substance"), and
 * suppression was never on offer: the options were single-select. So it
 * answered a question almost nobody asks while the one they do ask stayed
 * unavailable — and the counts it carried are on the law headers anyway,
 * where they are per law instead of per page. What it cost is the only
 * printed OVERALL total, which matters just for a multi-law package; the
 * per-law pills are the more useful granularity, and a plain summary line
 * would be cheaper to read than a dropdown if the total is ever missed.
 */
const query = ref('')

function key(u: LawDiffUnit): string {
  return diffUnitKey(u)
}

/**
 * The identity of a rendered block, for `v-for`.
 *
 * Not the index: the block list is rebuilt on every keystroke of the search
 * field, and a block that was a folded `<details>` of unchanged units can
 * land in the slot a changed unit held. The open state of a `<details>` is
 * DOM state, not vnode state, so Vue carries it to whatever it reuses the
 * element for — and the reader finds someone else's § open.
 *
 * The kind is part of the key for the same reason: it is what tells the two
 * shapes apart, and `diffUnitKey` alone cannot, because a context block is named
 * after the first unit it folds.
 */
function blockKey(b: Block): string {
  return b.kind === 'unit' ? `unit|${diffUnitKey(b.unit)}` : `context|${diffUnitKey(b.units[0]!.unit)}`
}

/**
 * One lowercased haystack per unit, built once per response instead of once
 * per keystroke: the six searchable fields of up to 413 units (58/ME) were
 * lowercased again on every character typed.
 *
 * Joined by a newline so a term cannot match across two fields — and a
 * single-line search box can never carry one, so nothing else changes.
 */
const haystacks = computed(() =>
  (data.value?.units ?? []).map((u) =>
    [u.id, u.fromId, u.heading, u.article, u.fromText, u.toText].filter(Boolean).join('\n').toLowerCase(),
  ),
)

const visibleUnits = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return data.value?.units ?? []
  return (data.value?.units ?? []).filter((_, i) => haystacks.value[i]!.includes(q))
})

/**
 * One group per Gesetz (article of the package), folded by default. 32/ME
 * has 330 units in three laws; a flat list is unreadable. A single-law text
 * is one group under its own title, so the page shows the summary pills and
 * one folded header until the reader asks for more.
 */
interface ArticleGroup {
  article: string
  units: LawDiffUnit[]
  /** `changed` excludes editorial units, so the pills add up to the group's total like the rows do */
  counts: Record<DiffBadge, number>
}

const groups = computed<ArticleGroup[]>(() => {
  const out: ArticleGroup[] = []
  const byArticle = new Map<string, ArticleGroup>()
  for (const u of visibleUnits.value) {
    const key = u.article ?? ''
    let g = byArticle.get(key)
    if (!g) {
      g = { article: key, units: [], counts: { unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 } }
      byArticle.set(key, g)
      out.push(g)
    }
    g.units.push(u)
    g.counts[badgeOf(u)]++
  }
  return out
})
/**
 * What ONE click buys, since 08.09.2026: the whole law as flowing text with
 * the changes marked, instead of a row per amendment instruction that had to
 * be opened one by one — user feedback, and the argument behind it: without
 * attribution of a change to an actor (which Austria does not have),
 * splitting the instructions apart buys nothing. The rest of the folding —
 * closed until asked, a search opens everything — is in `useFoldedGroups`.
 */
const { toggleGroup, groupOpen, showAll, limitFor } = useFoldedGroups(query)

/**
 * Blocks in reading order: every change as flowing text, runs of untouched
 * units folded into one line of context — the way a diff reads on GitHub.
 * Nothing has to be opened to be read.
 *
 * What a block carries, it carries computed. The template used to ask for
 * the same four things two to five times per row — the name, the heading,
 * the two columns of the split view and the changed Begründung — on every
 * render, and a render happens on every keystroke of the search field.
 */
interface UnitView {
  unit: LawDiffUnit
  /** `unitLabel` — "§ 6 Erweiterte Gefahrenerforschung", "§ 6" where no name is known, null where neither is */
  label: string | null
  /**
   * `extraHeading` — the heading, only where it says something the block does
   * not AND is not already the name: a § of a new law is named by exactly
   * this heading, and the row would otherwise carry it twice.
   */
  extra: string | null
}

type Block =
  | ({ kind: 'unit'; from: LawDiffSegment[]; to: LawDiffSegment[]; reasoning: ReasoningDiffEntry | null } & UnitView)
  | { kind: 'context'; units: UnitView[] }

function viewOf(u: LawDiffUnit): UnitView {
  const label = unitLabel(u)
  const extra = extraHeading(u)
  return { unit: u, label, extra: extra === label ? null : extra }
}

function blocksOf(units: readonly LawDiffUnit[], article: string): { blocks: Block[]; hidden: number } {
  // Searching IS the reader asking for specific units — then nothing gets
  // folded away behind a context line.
  const folding = !query.value.trim()
  const limit = limitFor(article)
  const blocks: Block[] = []
  let context: UnitView[] = []
  let shown = 0
  let hidden = 0
  const flush = () => {
    if (context.length) blocks.push({ kind: 'context', units: context })
    context = []
  }
  for (const u of units) {
    if (folding && badgeOf(u) === 'unchanged') {
      context.push(viewOf(u))
      continue
    }
    if (shown >= limit) {
      hidden++
      continue
    }
    flush()
    blocks.push({
      kind: 'unit',
      ...viewOf(u),
      ...splitSegments(u.segments, u.fromText, u.toText),
      reasoning: reasoningOf(u),
    })
    shown++
  }
  flush()
  return { blocks, hidden }
}

const renderedGroups = computed(() => groups.value.map((g) => ({ ...g, ...blocksOf(g.units, g.article) })))

/**
 * Inline or side by side — the reasoning is at `DiffToolbar`, which offers
 * the choice. NO new endpoint and no second computation: `segments` already
 * carries `equal | removed | inserted` per run, so the left column is
 * everything that is not `inserted` and the right everything that is not
 * `removed` — the same data projected twice.
 */
const view = ref<'inline' | 'split'>('inline')

/** What one unit is called, so a context line can count them. */
/* The reader's word for the counted unit in the headline figure: an
 * Änderungsanordnung is an „Änderung" there (30.09.2026); the precise term
 * stays on /so-funktionierts#vergleich and in the group labels. */
const shareNoun = computed(() => (isNovelle.value ? 'Änderungen' : 'Paragraphen'))

function unitNoun(n: number): string {
  if (isNovelle.value) return n === 1 ? 'Änderungsanordnung' : 'Änderungsanordnungen'
  return n === 1 ? 'Paragraph' : 'Paragraphen'
}

/** Server-decided: every changed piece is a citation, number, date or punctuation. */
function isMinor(u: LawDiffUnit): boolean {
  return u.editorial
}

/** A Novelle has no §§ of its own; its units are the numbered amendment instructions. */
const isNovelle = computed(() => {
  const units = data.value?.units ?? []
  return units.length > 0 && units.every((u) => /^Z\d/.test(u.id))
})

/**
 * The Paragraph a change amends — placed in front of the name.
 *
 * „Z 2" is the Novellierungsanordnung's number, not the Paragraph's; without
 * the § a name like „Erweiterte Gefahrenerforschung" floats above a
 * designation that never names it, and three instructions for one Paragraph
 * look like the same thing three times. It stays away where the unit IS the
 * Paragraph (Textgegenüberstellung, a new law) — it would then stand twice in
 * one line.
 */
function unitParagraph(u: LawDiffUnit): string | null {
  const para = paraTitles.value?.paragraphs?.[diffUnitKey(u)] ?? null
  return para && para !== displayId(u.id) ? para : null
}

/**
 * Paragraph and name as one line: „§ 6 Erweiterte Gefahrenerforschung" —
 * and the Paragraph alone where no name is known. „§ 6" is already the
 * answer to which provision a Ziffer changes (§12.11); until 01.10.2026 the
 * label went with the name, so a nameless Ziffer said only „Z 28".
 */
function unitLabel(u: LawDiffUnit): string | null {
  const name = nameOf(u)
  const para = unitParagraph(u)
  if (!name) return para
  return para ? `${para} ${name}` : name
}

/**
 * Laws only one document carries are reported as laws, never as their
 * paragraphs: a Regierungsvorlage that merges several drafts would otherwise
 * report hundreds of paragraphs as "neu" and read as a verdict on this draft.
 * The sentences live in app/utils/lawPackage.ts, where they are tested.
 */
const mergedNote = computed(() =>
  mergedLawsNote(data.value?.lawsOnlyInTo ?? [], pair.value.from, pair.value.to, data.value?.largerAct ?? null),
)
/**
 * Between two later stations of a Vorlage that bundles this draft with
 * others, the counts are the draft's — and this sentence is what says so
 * (docs/architecture.md §12.33). From the draft, `mergedNote` names the act.
 */
const outsideNote = computed(() =>
  pair.value.from === 'me' || !data.value?.bundledWithOtherDrafts
    ? null
    : outsideDraftNote(data.value.lawsOutsideDraft, data.value.largerAct),
)
const droppedNote = computed(() =>
  droppedLawsNote(data.value?.lawsOnlyInFrom ?? [], pair.value.from, pair.value.to),
)
</script>

<template>
  <!-- id: the outcome card above links here ("der Vergleich der beiden Texte"). -->
  <div id="textvergleich" class="mt-8 scroll-mt-24">
    <h3 class="text-base font-semibold text-ink">{{ heading }}</h3>

    <!-- Section-level control, and therefore in the section's header rather
         than in the toolbar of the list: it changes WHAT is compared, while
         the toggle and the search below change how the result is read.
         Outside every branch on purpose — a pair whose text is PDF-only
         answers with a reason and no units, and with the select inside that
         branch the reader would lose the control that got them there. -->
    <div v-if="comparisons.length > 1" class="mt-2">
      <TokenSelect v-model="selectedComparison" aria-label="Welche zwei Fassungen vergleichen">
        <option v-for="c in comparisons" :key="c.value" :value="c.value">{{ c.label }}</option>
      </TokenSelect>
    </div>

    <p v-if="status === 'pending' || status === 'idle'" class="mt-1 text-sm text-ink-secondary">
      Der Gesetzestext {{ fromLabel === 'Ministerialentwurf' ? 'des Entwurfs' : `der ${fromLabel}` }}
      wird mit dem der {{ toLabel }} verglichen …
    </p>

    <p v-else-if="status === 'error' || !data" class="mt-1 text-sm text-ink-secondary">
      Der Vergleich ist gerade nicht verfügbar.
    </p>

    <template v-else-if="!data.available">
      <p class="mt-1 text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
    </template>

    <template v-else>
      <!-- What the selected pair answers, where the selection happened. -->
      <p v-if="!isDefaultPair" class="mt-3 text-sm font-medium text-ink">{{ question }}</p>
      <!-- Where the reason for a change may be found, and nothing else
           (30.09.2026). „Ministerialentwurf gegen Regierungsvorlage." went:
           the pills above show the selected pair, and a non-default one
           prints its own question. The hint names the reader's question and
           a document, never a cause (framing rule) — as a link where the
           Regierungsvorlage's Erläuterungen are known. -->
      <p class="mt-1 text-sm text-ink-secondary">
        <template v-if="pair.to === 'rv' && rvReasoningDoc">
          Ob eine Stellungnahme dahintersteht, sagen oft die
          <ExternalLink :href="rvReasoningDoc.url" class="link-inline">Erläuterungen der Regierungsvorlage</ExternalLink>.
        </template>
        <template v-else>{{ lawStationPairHint(pair.from, pair.to) }}</template>
      </p>

      <div v-if="outsideNote || mergedNote || droppedNote" class="mt-3 space-y-1.5 border-l-2 border-hairline pl-3 text-xs text-ink-secondary">
        <p v-if="outsideNote">{{ outsideNote }}</p>
        <p v-if="mergedNote">{{ mergedNote }}</p>
        <p v-if="droppedNote">{{ droppedNote }}</p>
      </div>

      <!-- The reasoning, once as a rate above the list instead of
           „unverändert" on every row (docs/architecture.md §12.10b). Arrives
           when its fetch does. -->
      <!-- „Wie wir vergleichen" closes the figure: the figure is what the
           method explains (what counts, against what). Where there is no
           figure it closes the hint instead, below. -->
      <p v-if="changeShareNote" class="mt-3 max-w-prose text-sm text-ink-secondary">
        {{ changeShareNote }}
        <NuxtLink to="/so-funktionierts#vergleich" class="link-inline">Wie wir vergleichen</NuxtLink>
      </p>
      <p v-else class="mt-1 text-sm">
        <NuxtLink to="/so-funktionierts#vergleich" class="link-inline">Wie wir vergleichen</NuxtLink>
      </p>
      <p v-if="reasoningNote" class="mt-3 max-w-prose text-sm text-ink-secondary">{{ reasoningNote }}</p>

      <template v-if="data.units.length">
        <!-- How to read the result, and a search: both scope the list below
             them and nothing above. -->
        <DiffToolbar
          v-model:view="view"
          v-model:query="query"
          view-label="Darstellung des Vergleichs"
          search-label="Im Text suchen"
        />

        <div class="mt-3 border-y border-hairline">
          <DiffGroup
            v-for="g in renderedGroups"
            :key="g.article"
            :title="g.article"
            :badges="badgeCounts(g.counts, BADGE_LABEL)"
            :open="groupOpen(g.article)"
            @toggle="toggleGroup(g.article)"
          >
            <template v-for="b in g.blocks" :key="blockKey(b)">
              <details v-if="b.kind === 'context'" class="group border-b border-hairline last:border-b-0">
                <summary class="flex min-h-target cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:bg-page [&::-webkit-details-marker]:hidden">
                  <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  {{ b.units.length }} {{ unitNoun(b.units.length) }} unverändert
                </summary>
                <div class="space-y-3 px-3 pb-3 pl-9 text-sm leading-relaxed text-ink-secondary">
                  <p v-for="u in b.units" :key="key(u.unit)" class="hyphens-auto">
                    <span class="font-medium text-ink">{{ displayId(u.unit.id) }}</span>
                    <span v-if="u.label" class="font-medium text-ink"> {{ u.label }}</span>
                    <span v-else-if="u.extra"> {{ u.extra }}</span>
                    <span> — {{ u.unit.toText }}</span>
                  </p>
                </div>
              </details>

              <div v-else class="border-b border-hairline px-3 py-3 last:border-b-0">
                <!-- Designation and name on a line of their own, above the
                     badge. Beside it they had to share one line with the
                     status, so "geändert Z 4 Geheimhaltung" read as a single
                     token — and the Textgegenüberstellung, where a § heads
                     several Absätze, cannot put them there at all. One shape
                     for both sections: what this is, then how it changed. -->
                <p class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span class="font-medium text-ink">
                    {{ displayId(b.unit.id) }}
                    <span v-if="b.unit.fromId && b.unit.fromId !== b.unit.id" class="font-normal text-ink-muted">({{ fromLabel === 'Ministerialentwurf' ? 'im Entwurf' : `in der ${fromLabel}` }} {{ displayId(b.unit.fromId) }})</span>
                  </span>
                  <span v-if="b.label" class="min-w-0 text-ink-secondary">{{ b.label }}</span>
                  <span v-else-if="b.extra" class="min-w-0 text-ink-secondary">{{ b.extra }}</span>
                </p>
                <div class="border-l-2 pl-3" :class="GUTTER_CLASS[badgeOf(b.unit)]">
                  <p class="mb-1 text-sm">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      :class="BADGE_CLASS[badgeOf(b.unit)]"
                    >
                      {{ BADGE_LABEL[badgeOf(b.unit)] }}
                    </span>
                  </p>

                  <!-- Inline: one sentence, old struck out where the new
                       stands. The default, and right for most changes. -->
                  <p v-if="b.unit.change === 'changed' && view === 'inline' && b.unit.segments" class="hyphens-auto text-sm leading-relaxed text-ink">
                    <DiffText :segments="b.unit.segments" />
                  </p>
                  <!-- Side by side. ONE shape for two cases: the reader
                       asked for columns, or the word diff hit its ceiling
                       and there are no segments to inline (then
                       `splitSegments` marks each side whole). The fallback
                       used to be its own layout, which made a technical
                       limit look like a different kind of change. -->
                  <div v-else-if="b.unit.change === 'changed'" class="grid gap-x-4 gap-y-2 text-sm leading-relaxed sm:grid-cols-2">
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ fromLabel }}</p>
                      <p class="hyphens-auto text-ink">
                        <DiffText :segments="b.from" side="from" />
                      </p>
                    </div>
                    <div>
                      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ toLabel }}</p>
                      <p class="hyphens-auto text-ink">
                        <DiffText :segments="b.to" side="to" />
                      </p>
                    </div>
                  </div>
                  <p v-else-if="b.unit.change === 'inserted'" class="hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.unit.toText }}</p>
                  <p v-else-if="b.unit.change === 'removed'" class="hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.unit.fromText }}</p>
                  <p v-else class="hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ b.unit.toText }}</p>

                  <!-- What the Ressort says about it — and whether it says
                       so differently after the Begutachtung than before.
                       Closed, like the reasoning at the
                       Textgegenüberstellung (docs/architecture.md §12.30):
                       it answers a second question, not the first. A native
                       <details>, so the browser's find-in-page opens it
                       instead of running past it. -->
                  <details v-if="b.reasoning" class="group mt-2">
                    <summary class="-mx-1 flex min-h-target cursor-pointer list-none items-center gap-2 rounded px-1 py-2 text-xs font-medium text-ink-secondary hover:bg-page [&::-webkit-details-marker]:hidden">
                      <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                      <!-- Says what was compared (01.10.2026): the passage on
                           this change, or — where the Erläuterungen are titled
                           by § — everything they say about the Paragraph. -->
                      <template v-if="!b.reasoning.comparable">Die Begründung des Ressorts zu dieser Änderung</template>
                      <template v-else>{{ b.reasoning.basis === 'ziffer' ? 'Die Begründung des Ressorts zu dieser Änderung hat sich geändert' : 'Die Begründung des Ressorts zu diesem Paragraphen hat sich geändert' }}</template>
                    </summary>
                    <!-- Shown, not compared (01.10.2026): the two documents
                         explain this change together with different others,
                         so a word diff would measure the regrouping. One
                         sentence says why, then the texts under their own
                         headings — no „geändert", no „unverändert". -->
                    <div v-if="!b.reasoning.comparable" class="pb-2 pl-6">
                      <p class="mb-2 text-xs text-ink-muted">Entwurf und Regierungsvorlage fassen die Begründung zu dieser Änderung verschieden zusammen; verglichen wird sie deshalb nicht.</p>
                      <div class="grid gap-x-4 gap-y-2 text-sm leading-relaxed" :class="b.reasoning.fromText ? 'sm:grid-cols-2' : ''">
                        <div v-if="b.reasoning.fromText">
                          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ fromLabel }}</p>
                          <p class="mb-1 text-xs text-ink-muted">{{ b.reasoning.fromHeading }}</p>
                          <p class="hyphens-auto text-ink">{{ b.reasoning.fromText }}</p>
                        </div>
                        <div>
                          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ toLabel }}</p>
                          <p class="mb-1 text-xs text-ink-muted">{{ b.reasoning.label }}</p>
                          <p class="hyphens-auto text-ink">{{ b.reasoning.toText }}</p>
                        </div>
                      </div>
                    </div>
                    <template v-else>
                      <!-- The Vorlage's heading, because one passage often
                         explains several changes („Zu Z 1 bis 3 (§ 5):") and
                         the same drawer then opens at each of them. -->
                      <p v-if="b.reasoning.basis === 'ziffer'" class="pb-1 pl-6 text-xs text-ink-muted">{{ b.reasoning.label }}</p>
                      <p v-if="b.reasoning.segments" class="hyphens-auto pb-2 pl-6 text-sm leading-relaxed text-ink">
                        <DiffText :segments="b.reasoning.segments ?? []" />
                      </p>
                      <!-- Without a word diff: both versions in full, side by
                         side as in the comparison above, so a technical
                         ceiling does not look like a different kind of
                         change. The drawer is never empty — that the
                         reasoning is a different one is the finding, and the
                         ceiling is ours, not the Ressort's. -->
                      <div v-else class="pb-2 pl-6">
                        <p class="mb-2 text-xs text-ink-muted">Für einen Wortvergleich ist die Passage zu lang — hier beide Fassungen im Ganzen.</p>
                        <div class="grid gap-x-4 gap-y-2 text-sm leading-relaxed sm:grid-cols-2">
                          <div>
                            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ fromLabel }}</p>
                            <p class="hyphens-auto text-ink">{{ b.reasoning.fromText }}</p>
                          </div>
                          <div>
                            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{{ toLabel }}</p>
                            <p class="hyphens-auto text-ink">{{ b.reasoning.toText }}</p>
                          </div>
                        </div>
                      </div>
                    </template>
                  </details>
                </div>
              </div>
            </template>

            <button
              v-if="g.hidden"
              type="button"
              class="flex min-h-target w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-accent-deep hover:bg-page"
              @click="showAll(g.article)"
            >
              <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0" aria-hidden="true" />
              {{ g.hidden }} weitere {{ g.hidden === 1 ? 'Änderung' : 'Änderungen' }} anzeigen
            </button>
          </DiffGroup>
        </div>
        <!-- Stays in the DOM as a live region and goes empty rather than
             disappearing: a region that comes into being with its text is not
             announced — whoever searched and found nothing would otherwise
             get silence back. -->
        <p
          role="status"
          :class="visibleUnits.length ? 'sr-only' : 'mt-2 text-sm text-ink-secondary'"
        >{{ visibleUnits.length ? '' : 'Nichts gefunden.' }}</p>
      </template>

      <!-- Provenance under the text it belongs to, the way a source note
           sits under a table rather than over it (17.09.2026). It is looked
           up while or after reading, never before — and it is one more block
           that used to rewrite itself above the select.

           What may be claimed hangs on each SIDE — its publisher and its
           station — and `lawDiffSourceCredit` puts the two together: RIS is CC
           BY 4.0, a parliamentary document is a freies Werk (§ 7 UrhG, read
           live 23.09.2026), and the Ministerialentwurf carries no claim at
           all, because the Begutachtungsverfahren is what the open licence
           question is about (docs/architecture.md §13.1). -->
      <SectionCredits>
        <span>{{ lawDiffSourceCredit({ station: pair.from, source: data.fromSource }, { station: pair.to, source: data.toSource }) }}</span>
        <!-- Grouped by version since 30.09.2026: „Entwurf: Text ·
             Erläuterungen" instead of four links each carrying its version's
             name. The links stay — the documents are freie Werke and need no
             attribution, so they are there for the reader. -->
        <span v-for="side in creditSides" :key="side.station">
          {{ side.label }}:
          <ExternalLink v-if="side.text" :href="side.text.url" class="text-accent-deep hover:underline">Text</ExternalLink><template v-if="side.text && side.reasoning"> · </template><ExternalLink v-if="side.reasoning" :href="side.reasoning.url" class="text-accent-deep hover:underline">Erläuterungen</ExternalLink>
        </span>
        <!-- The § names come from a third source; a page that shows text has
             to say where it is from, even when the text is one word long.
             RIS is CC BY 4.0, so the licence is part of that sentence — it
             said „§-Titel: RIS Bundesrecht, Stand 2026-03-11" until
             30.09.2026, without licence and with the date unformatted. -->
        <span v-if="namedCount">Paragraphenüberschriften (CC BY 4.0, RIS): Stand {{ paraTitlesAsOf }}</span>
      </SectionCredits>
    </template>
  </div>
</template>
