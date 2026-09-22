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
import type { AnnexWithheldCause, ConsolidatedParagraph, ConsolidatedTextResponse, LawDiffSegment, ParagraphExplanationView, TextComparisonResponse, TextComparisonRow } from '#shared/types'
import { explanationKey, explanationParaId } from '#shared/utils/explanationKey'
import { BADGE_CLASS, type DiffBadge, GUTTER_CLASS, badgeCounts, badgeLabels } from '~/utils/diffBadges'
import { splitSegments } from '~/utils/diffSides'
import { absaetze } from '~/utils/absaetze'
import {
  annexCheckNote,
  annexDoubtfulNote,
  annexDroppedPagesNote,
  annexWithheldBlame,
  annexWithheldText,
} from '~/utils/annexNotes'

const props = defineProps<{ gp: string; inr: number }>()

const { data, status } = await useFetch<TextComparisonResponse>(() => `/api/drafts/${props.gp}/${props.inr}/gegenueberstellung`, {
  lazy: true,
  server: false,
})

/**
 * Die Begründung des Ressorts zu den einzelnen Paragraphen
 * (docs/architecture.md §12.30).
 *
 * Dasselbe Dokument, das `ExplanationsSection` weiter oben auf der Seite
 * ohnehin liest — ein gemeinsamer Schlüssel in `useExplanations`, also eine
 * Anfrage für beide Abschnitte, und zwar ausgesprochen statt als Nebenwirkung
 * gleicher URLs. Und sie darf fehlschlagen, ohne dass es diesen Abschnitt
 * kümmert: Die Gegenüberstellung ist die Auskunft, die Begründung ist die
 * Beigabe.
 */
const { data: explanations } = useExplanations(() => ({ gp: props.gp, inr: props.inr }))

/**
 * Die konsolidierte Lesefassung — dritte Schicht an demselben Paragraphen
 * (docs/architecture.md §12.12a).
 *
 * WARUM HIER UND NICHT IN EINEM EIGENEN ABSCHNITT. Sie stand bis 19.09.2026
 * unter der Gegenüberstellung als „Wie das Gesetz danach lauten würde", und
 * das war eine Dopplung mit Ansage: Gezeigt wird ein Paragraph nur, wenn die
 * Beilage ihn bestätigt — die Lesefassung ist also **immer** eine Teilmenge
 * dieses Abschnitts. Gemessen an 126/ME: 32 von 32 Paragraphen stehen in
 * beiden, zwei Blöcke mit derselben Gesetzessprache untereinander.
 *
 * Der Unterschied ist trotzdem echt, und er ist ein anderer als „dasselbe
 * nochmal": Die Beilage druckt den Absatz, den sie ändert, und kürzt den Rest
 * des Paragraphen zu „(2) bis (5) …" ab — bei 26 der 32 Paragraphen von
 * 126/ME, in Zeichen 18.068 gegen 48.611. Die Frage „wie lautet die
 * Bestimmung dann" entsteht also genau hier, am §, und wird hier beantwortet,
 * statt zwei Bildschirme tiefer noch einmal.
 */
const { data: consolidated } = await useFetch<ConsolidatedTextResponse>(
  () => `/api/drafts/${props.gp}/${props.inr}/konsolidiert`,
  { lazy: true, server: false },
)

/**
 * Nachgeschlagen unter demselben Schlüssel, den das Tor benutzt hat.
 *
 * Zwei Einträge je Paragraph, und der zweite ist kein Komfort: Bei einer
 * Einzelnovelle hat das Tor den Anhang OHNE Gesetz befragt (`annexLaw: null`),
 * die Zeile der Beilage trägt aber trotzdem eines. Ein Nachschlagen nur über
 * (Gesetz, Nummer) fände dort nichts.
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

/** Wie viele §§ die Lesefassung trägt — für den Satz über der Liste. */
const consolidatedShown = computed(() => consolidated.value?.paragraphs.length ?? 0)

/** Die Passagen, nachschlagbar unter (Gesetz, Paragraph). */
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
 * Die Passagen zu EINEM § der Beilage.
 *
 * Nachgeschlagen, nicht gesucht: Beide Seiten bilden denselben Schlüssel aus
 * Gesetz und normalisierter Bezeichnung (`#shared/utils/explanationKey`). Wo die
 * Beilage ihre Gesetze nicht auseinanderhält, trägt ihre Zeile kein Gesetz,
 * der Eintrag aber eines — dann findet der Schlüssel nichts, und das ist die
 * richtige Antwort: § 5 des zweiten Gesetzes ist eine andere Bestimmung als
 * § 5 des ersten.
 */
function explanationsFor(law: string | null, para: string | null): ParagraphExplanationView[] {
  const id = explanationParaId(para)
  return id ? explanationsByKey.value.get(explanationKey(law, id)) ?? [] : []
}

/**
 * `DiffToolbar`'s two controls, and they are worth more here than in the §
 * comparison.
 *
 * **Nebeneinander is not a preference, it is the source's own shape.** The
 * annex IS a two-column table — "Geltende Fassung" beside "Vorgeschlagene
 * Fassung" — and this section deliberately reads it harmonised, as one
 * sentence with the change marked in place, because that is the better read
 * for a handful of swapped words. Where a ressort recasts a whole paragraph,
 * the toggle gives back the presentation the ressort chose. Nothing is
 * recomputed: `segments` carries `equal | removed | inserted` per run, so the
 * left column is everything but `inserted` and the right everything but
 * `removed`.
 *
 * **The search matters more here too.** The comparison is complete by
 * construction — every § the annex prints is here, unchanged ones included —
 * so a reader with a term in mind ("Verwaltungsstrafe", "§ 40") has no other
 * way through. The diff section at least lets its pills lead the way.
 */
const view = ref<'inline' | 'split'>('inline')

const query = ref('')

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

function badgeOf(row: TextComparisonRow): DiffBadge {
  return row.editorial ? 'editorial' : row.change
}

interface Group {
  /** Stable identity for the open/expanded state — the law, not its label */
  key: string
  article: string
  rows: TextComparisonRow[]
  counts: Record<DiffBadge, number>
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
    if (q && !haystacks.value.get(row)!.includes(q)) continue
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

const { toggleGroup, groupOpen, showAll, limitFor } = useFoldedGroups(query)

type Block =
  /** The two columns come along computed: the template asked for each of them
   *  twice per row, on every render, and a render happens per keystroke. */
  | { kind: 'row'; row: TextComparisonRow; from: LawDiffSegment[]; to: LawDiffSegment[] }
  | { kind: 'context'; rows: TextComparisonRow[] }
  /**
   * Changes the RIS check would not vouch for. The server sends these rows
   * without their text (`annexCheck.ts`), so there is nothing to render but
   * the fact — and that fact is worth a line: a comparison that silently
   * drops a § is a different kind of wrong answer from one that says it did.
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
  /** Was das Ressort zu genau diesem § erläutert; leer, wenn nichts zu finden war. */
  explanations: ParagraphExplanationView[]
  /** Der ganze § in der Fassung nach dem Entwurf; null, wo das Tor ihn nicht freigibt. */
  consolidated: ConsolidatedParagraph | null
}

function parasOf(g: Group): { paras: Para[]; hidden: number } {
  const limit = limitFor(g.key)
  // Searching means the reader asked for these very rows, so an unchanged
  // hit gets its own block instead of disappearing into a folded context
  // line that says only how many there were.
  const folding = !query.value.trim()
  const paras: Para[] = []
  let current: Para = { key: '\u0000', gld: null, heading: null, blocks: [], explanations: [], consolidated: null }
  let context: TextComparisonRow[] = []
  let shown = 0
  let hidden = 0
  let withheld = 0
  // Every withheld row of a § carries the same cause — the verdict is per §.
  let withheldCause: AnnexWithheldCause | null = null
  const flush = () => {
    // Die Kontextzeile steht auch an §§ mit Lesefassung, und das ist eine
    // Entscheidung, keine Auslassung (19.09.2026, Manu): Sie faltet die
    // unveränderten Zeilen DER BEILAGE, in derselben Spaltenlogik wie die
    // geänderten darüber — die Lesefassung darunter ist unser Text aus dem
    // RIS. Für einen Leser, der die Beilage liest, ist „was hat das Ressort
    // hier unverändert abgedruckt" eine andere Auskunft als „so lautet der
    // Paragraph dann". Kurz probiert, sie an diesen §§ wegzulassen, und wieder
    // eingesetzt.
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
      current = { key, gld: row.para, heading: null, blocks: [], explanations: explanationsFor(row.law, row.para), consolidated: consolidatedFor(row.law, row.para) }
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
    current.blocks.push({ kind: 'row', row, ...splitSegments(row.segments, row.current, row.proposed) })
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
 * Was der Screenreader hört, wenn der Abruf fertig ist.
 *
 * Bis 18.09.2026 gar nichts: „Die Textgegenüberstellung wird geladen …"
 * stand da, wurde clientseitig ersetzt, und niemand sagte Bescheid. Wer die
 * Seite linear liest, wartet auf eine Ansage, die nie kommt, und der
 * Abschnitt, der danach der längste der Seite ist, erscheint stumm.
 *
 * Leer, solange geladen wird — der sichtbare Absatz sagt das schon, und
 * eine Region, die beim Einhängen bereits Text trägt, wird von manchen
 * Screenreadern sofort vorgelesen.
 */
const loadAnnouncement = computed(() => {
  if (status.value === 'pending' || status.value === 'idle') return ''
  if (status.value === 'error' || !data.value) {
    return 'Die Gegenüberstellung ist gerade nicht verfügbar.'
  }
  if (!data.value.available) return data.value.unavailableReason ?? ''
  return `Gegenüberstellung geladen, ${countLabelDe(matchCount.value, 'Zeile', 'Zeilen')}.`
})

/* Die deutschen Sätze über die Prüfung — was gefunden wurde, was
 * zurückgehalten ist und warum, welche Seiten fehlen, welches Gesetz
 * auffällt — stehen in `app/utils/annexNotes.ts`, wo sie gegen ein kleines
 * Antwortobjekt geprüft werden. Sie sind Funktionen der Antwort und sonst
 * von nichts. */
const checkNote = computed(() => annexCheckNote(data.value?.verification ?? null))
const droppedPagesNote = computed(() => annexDroppedPagesNote(data.value?.droppedPages ?? 0))
const doubtfulNote = computed(() =>
  annexDoubtfulNote(data.value?.verification?.doubtfulLaws ?? [], data.value?.readFrom ?? null),
)
const withheldText = annexWithheldText
function withheldBlame(cause: AnnexWithheldCause | null): string | null {
  return annexWithheldBlame(cause, data.value?.readFrom ?? null)
}
</script>

<template>
  <div class="mt-1">
    <!-- Sagt das Ende des Ladens an, das sonst lautlos passiert. Bleibt im
         DOM und leer, statt erst beim Fertigwerden zu erscheinen: eine
         Live-Region, die es beim Eintreten der Änderung noch nicht gibt,
         wird nicht vorgelesen. -->
    <p class="sr-only" role="status">{{ loadAnnouncement }}</p>

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
      <!-- Woher der Text stammt und dass die Markierung von uns ist, stand
           hier bis 18.09.2026 als Absatz über dem, weswegen jemand gekommen
           ist — wortgleich auf jeder Entwurfsseite und ausführlicher auf
           /so-funktionierts#gegenueberstellung. Es ist eine Bildunterschrift,
           kein Satz: Sie steht jetzt in `SectionCredits` am Fuß des
           Abschnitts, neben der Quelle, die sie betrifft. Die Herkunft selbst
           fällt damit nicht weg — sie darf nie hinter einem Link liegen.

           Was oben bleibt, ist der Vorbehalt: Auf dem PDF-Pfad ist mehr als
           die Markierung unsere — RIS veröffentlicht die Beilage nur als
           Bild, die Zuordnung der Zeilen ist erschlossen. Das ist keine
           Herkunftsangabe, sondern die Aussage, dass das Folgende falsch sein
           kann; sie gehört vor den Vergleich, nicht darunter. Dass der Text
           aus dem PDF gelesen ist, sagt jetzt die Quellenangabe selbst
           (`textComparisonService`: „aus dem PDF gelesen"). -->
      <!-- Die drei Vorbemerkungen als eine Gruppe: `space-y-3` setzt den
           Abstand ZWISCHEN den vorhandenen Absätzen und gibt dem ersten
           keinen — gleich, welcher das gerade ist. Vorher trug jeder seinen
           eigenen bedingten Oberrand, und wer der erste ist, hängt von
           `readFrom` und `boundaryNote` ab. -->
      <div class="space-y-3">
        <p v-if="data.readFrom === 'pdf'" class="text-sm text-ink-secondary">
          Welche Zeile links zu welcher Zeile rechts gehört, haben wir aus dem
          Seitenlayout des PDF erschlossen — die Zuordnung kann daneben liegen.
          <!-- And where the layout could not be vouched for at all, the page
               says which part of the annex is missing rather than showing a
               comparison with a silent hole in it. -->
          <template v-if="droppedPagesNote"> {{ droppedPagesNote }}</template>
        </p>

        <!-- Several laws in one draft, and the annex does not say where one
             ends. Shown undivided, and said so: dividing it wrongly would put
             one law's § 5 under another law's name. -->
        <p v-if="data.boundaryNote" class="text-sm text-ink-secondary">{{ data.boundaryNote }}</p>

        <!-- What the RIS check made of the annex. Stated rather than implied:
             the reader is looking at the ministry's own text, and how much of
             it we could hold against the standing law is part of reading it.
             Always present — a comparison nothing could be checked in says so
             rather than falling silent, which reads as a clean bill.

             Befund und Zweifel bleiben zusammen: `doubtfulNote` erläutert den
             Satz darüber und steht deshalb enger an ihm als an allem sonst. -->
        <div>
          <p class="text-sm text-ink-secondary">
            {{ checkNote }}
            <NuxtLink to="/so-funktionierts#gegenueberstellung" class="link-inline">Wie wir prüfen</NuxtLink>
          </p>
          <p v-if="doubtfulNote" class="mt-2 text-sm text-ink-secondary">{{ doubtfulNote }}</p>
        </div>

        <!-- Die Bilanz der Lesefassung, und sie steht hier statt unter einer
             eigenen Liste (§12.12a). Zwei Aufgaben in einem Satz: Er sagt an,
             dass an manchen §§ ein dritter Aufklapper hängt — sonst findet
             ihn nur, wer zufällig klickt —, und er nennt den Nenner. Ohne den
             läse sich eine Handvoll aufklappbarer Paragraphen wie „bei den
             anderen bleibt alles beim Alten", und das ist die eine Aussage,
             die hier nie stehen darf (§12.27).

             Nur wenn es etwas anzusagen gibt: Zeigt das Tor keinen einzigen
             Paragraphen — der häufigere Fall —, schweigt dieser Satz, statt
             über eine Sektion zu berichten, die es auf dieser Seite nicht
             gibt. Was das Tor zurückhält und warum, steht dann weiterhin auf
             /so-funktionierts, nicht als vierter Absatz über dem Vergleich. -->
        <p v-if="consolidatedShown > 0" class="max-w-prose text-sm text-ink-secondary">
          Bei {{ consolidatedShown }} von {{ consolidated?.touched ?? consolidatedShown }}
          {{ (consolidated?.touched ?? consolidatedShown) === 1 ? 'geänderten Paragraph' : 'geänderten Paragraphen' }}
          steht unten auch, wie die Bestimmung danach ganz lautet — der geltende
          Text mit den Anweisungen dieses Entwurfs, soweit die Gegenüberstellung
          des Ressorts dasselbe Ergebnis trägt. Wo das fehlt, ist der Paragraph
          nicht unverändert, sondern ungeprüft.
        </p>
      </div>

      <!-- Same toolbar as the § comparison, same order, so the two sections
           are operated alike. No filter select: the annex prints every § it
           touches and the group pills already say how the changes divide —
           isolating one class was the control this page never needed. -->
      <DiffToolbar
        v-if="hasRows"
        v-model:view="view"
        v-model:query="query"
        view-label="Darstellung der Gegenüberstellung"
        search-label="In der Gegenüberstellung suchen"
      />

      <div class="mt-3 border-y border-hairline">
        <section v-for="g in renderedGroups" :key="g.key" class="border-b border-hairline last:border-b-0">
          <DiffGroupHeader
            :title="g.article"
            :badges="badgeCounts(g.counts, BADGE_LABEL)"
            :open="groupOpen(g.key)"
            @toggle="toggleGroup(g.key)"
          />

          <div v-if="groupOpen(g.key)" class="border-t border-hairline">
            <section v-for="p in g.paras" :key="p.key" class="border-b border-hairline px-3 py-3 last:border-b-0">
              <!-- The paragraph as law prints it: designation and title on one
                   line, once, above its Absätze — and no rule between the two,
                   because the line belongs to what follows it rather than
                   heading a band of its own. LawDiffSection sets a unit's
                   designation and name the same way. -->
              <p v-if="p.gld || p.heading" class="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span v-if="p.gld" class="font-medium text-ink">{{ p.gld }}</span>
                <span v-if="p.heading" class="min-w-0 text-ink-secondary">{{ p.heading }}</span>
              </p>

              <!-- Warum diese Änderung — die Passage des Besonderen Teils zu
                   genau diesem Paragraphen (docs/architecture.md §12.30).

                   ZUGEKLAPPT und direkt unter der §-Zeile: Die Frage des
                   Lesers an dieser Stelle ist „was ändert sich", und die
                   beantworten die Zeilen darunter; „warum" ist die
                   Anschlussfrage, und sie kommt nicht bei jedem §. Ein
                   Aufklapper kostet eine Zeile und steht dort, wo die Frage
                   entsteht — unter den Absätzen stünde er bei einem § mit
                   zwölf Zeilen außer Sichtweite seiner Überschrift.

                   Der Text ist der des Ressorts, unverändert und ungekürzt:
                   Diese Passagen sind kurz (der Besondere Teil verteilt sich
                   auf viele), eine zweite Faltung im Aufklapper wäre eine
                   Tür hinter einer Tür. -->
              <details v-if="p.explanations.length" class="group mb-2">
                <!-- In Tinte, nicht in Akzentfarbe (Manu, 18.09.2026). Blau ist
                     im Haus die Farbe des Links, und dieser Aufklapper führt
                     nirgendwohin. Entscheidend ist aber die Häufigkeit: Er
                     steht an JEDEM Paragraphen, bei 26 §§ also 26-mal — genau
                     der Fall, den SpineRail schon einmal hatte („fünf
                     Stationsnamen in accent-deep machten aus der Karte sieben
                     blaue Zeilen von elf, und die Markenfarbe trug keine
                     Information mehr"). Die Rangordnung bleibt trotzdem
                     lesbar: `font-medium text-ink` gegen das `text-ink-muted`
                     der unveränderten Stellen zwei Zeilen weiter unten. Das
                     Chevron trägt die Bedienbarkeit, wie bei jedem anderen
                     Aufklapper dieser Seite. -->
                <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-medium text-ink [&::-webkit-details-marker]:hidden">
                  <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  Warum? Die Begründung des Ressorts
                </summary>
                <!-- Eingerückt, ohne Linie (Manu, 18.09.2026). Eine Linie
                     links bedeutet in diesem Abschnitt etwas: Sie ist die
                     farbige Rinne, die eine Zeile als „geändert" oder „neu"
                     ausweist. Eine graue Rinne an der Begründung borgt sich
                     diese Vokabel für etwas, das keine Änderung ist. Die
                     Einrückung allein trägt die Zuordnung — genauso hält es
                     der Aufklapper der unveränderten Stellen zwei Zeilen
                     weiter unten. -->
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
                  {{ withheldText(b.cause) }}<template v-if="withheldBlame(b.cause)"> {{ withheldBlame(b.cause) }}</template>
                  Die Beilage des Ministeriums sagt, was sich ändert.
                </p>
                <details v-else-if="b.kind === 'context'" class="group">
                  <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs text-ink-muted [&::-webkit-details-marker]:hidden">
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
                    </p>

                    <!-- An unchanged row only reaches a block of its own while
                       a search is running; both columns hold the same text,
                       so it reads as the one sentence it is. -->
                    <p v-if="b.row.change === 'unchanged'" class="hyphens-auto text-sm leading-relaxed text-ink-secondary">{{ b.row.current }}</p>
                    <p v-else-if="b.row.segments && view === 'inline'" class="hyphens-auto text-sm leading-relaxed text-ink">
                      <DiffText :segments="b.row.segments" />
                    </p>
                    <!-- A row with only one side has one text; a column to hold
                       nothing beside it would be a column about our layout,
                       not about the law. Same rule as in the § comparison. -->
                    <p v-else-if="b.row.change === 'inserted'" class="hyphens-auto rounded bg-status-good/15 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.row.proposed }}</p>
                    <p v-else-if="b.row.change === 'removed'" class="hyphens-auto rounded bg-status-critical/10 px-2 py-1 text-sm leading-relaxed text-ink">{{ b.row.current }}</p>
                    <!-- The ressort's own two columns, under the ressort's own
                       headings. ONE shape for two cases: the reader asked for
                       them, or the word diff was too long to compute and
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

              <!-- Die dritte Schicht an demselben Paragraphen: nicht was sich
                   ändert und nicht warum, sondern wie er danach lautet
                   (docs/architecture.md §12.12a).

                   UNTER den geänderten Stellen, nicht über ihnen (Manu,
                   19.09.2026): Die Zeilen sind die Auskunft, wegen der jemand
                   den § aufschlägt; der ganze Paragraph ist die Anschlussfrage
                   und gehört dahin, wo sie entsteht — ans Ende. Über den
                   Zeilen stünde eine Tür vor der Antwort. Die Begründung
                   bleibt oben: Sie gehört zur Änderung, nicht zum Ergebnis. -->
              <details v-if="p.consolidated" class="group mt-3">
                <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-medium text-ink [&::-webkit-details-marker]:hidden">
                  <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  So lautet der Paragraph dann — ganz
                </summary>
                <div class="mt-1 pl-6">
                  <!-- Der Vorbehalt steht bei dem Text, für den er gilt, und
                       nicht einmal oben für 26 Aufklapper: Was hier steht, ist
                       keine amtliche Fassung, sondern der geltende Text des
                       RIS mit den Anweisungen dieses Entwurfs darauf. -->
                  <p class="max-w-prose text-xs text-ink-muted">
                    Nicht amtliche Lesefassung: der geltende Text aus dem RIS mit den
                    Anweisungen dieses Entwurfs, geprüft gegen die Gegenüberstellung
                    des Ressorts.
                  </p>
                  <p v-if="p.consolidated.headingSegments" class="mt-2 text-sm font-semibold text-ink">
                    <DiffText :segments="p.consolidated.headingSegments" removed-normal-weight />
                  </p>
                  <!-- Ein Absatz je Absatz: So ist das Gesetz gegliedert, und
                       achtzehn davon in einem Block sind keine Gliederung. -->
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
      <!-- Bleibt als Live-Region im DOM und wird leer, statt zu
             verschwinden: Eine Region, die erst mit ihrem Text entsteht,
             wird nicht angesagt — wer suchte und nichts fand, bekäme sonst
             Stille zurück. -->
      <p
        v-if="hasRows"
        role="status"
        :class="matchCount ? 'sr-only' : 'mt-2 text-sm text-ink-secondary'"
      >{{ matchCount ? '' : 'Nichts gefunden.' }}</p>

      <!-- Provenance under the text it belongs to, the way a source note
           sits under a table rather than over it (Manu, 17.09.2026): it is
           looked up while or after reading, never before.

           „Markierung" steht neben „Quelle", weil genau das die Frage ist,
           die ein rot-grün markierter Ministeriumstext aufwirft: Wer hat
           markiert? Zwei Angaben in einer Zeile, nicht drei Sätze darüber. -->
      <!-- Die Lizenz kommt vom Server, weil dort die Quelle gewählt wird:
           Liest die Sektion die Kopie des Parlaments statt der des RIS, wäre
           ein festverdrahtetes „CC BY 4.0" eine Behauptung über ein Dokument,
           für das sie niemand geprüft hat (`textComparisonService.credit`). -->
      <SectionCredits>
        <span>{{ data.credit }}</span>
        <ExternalLink v-if="data.source" :href="data.source.url" class="text-accent-deep hover:underline">{{ data.source.label }}</ExternalLink>
        <!-- Die zweite Quelle nur, wenn die Lesefassung wirklich irgendwo
             aufklappbar ist: Die Aufklapper zeigen den geltenden Text des
             RIS, und der hat eine eigene Lizenz und eine eigene Fundstelle.
             Sie hier zu nennen ist dieselbe Regel wie beim Abschnitt vorher,
             nur dass sie jetzt zu einer Schicht IN diesem Abschnitt gehört. -->
        <template v-if="consolidatedShown > 0 && consolidated?.paragraphs[0]?.risUrl">
          <span>Geltender Text (CC BY 4.0, RIS):</span>
          <ExternalLink :href="consolidated.paragraphs[0]!.risUrl!" class="text-accent-deep hover:underline">Konsolidierte Fassung im RIS</ExternalLink>
        </template>
      </SectionCredits>
    </template>
  </div>
</template>
