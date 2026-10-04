<script setup lang="ts">
import type { BgblOutcome, DraftDocument, RisConsultationDetail, RisDocumentFormats } from '#shared/types'
import type { ComparisonId, StationId } from '~/utils/spine'
import { RIS_ID_RE } from '#shared/utils/risConsultations'
import type { Fact } from '~/components/ui/FactList.vue'
import { ministryLinkFor } from '~/components/draft/MinistryLinks.vue'
import { fristContextFor, fristFact, fristStateDe } from '~/utils/deadlines'
import { regulationStations, regulationStatusDe } from '~/utils/spine'

/**
 * One Begutachtung without a Gegenstand at Parliament
 * (docs/architecture.md §12.16).
 *
 * ONE LINK SHAPE FOR EVERY ENTWURF since 18.09.2026: this page lives at
 * `/entwuerfe/:id`, next to the Ministerialentwurf's `/entwuerfe/:gp/:inr`,
 * and the id shape decides which of the two renders. A reader never has to
 * know which half of the corpus a draft is in to guess its URL, and a link
 * we hand out never carries the word „weitere" about two thirds of the
 * data. The difference is real and stays visible — in the page, not in the
 * path (docs/architecture.md §12.19).
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT HAVE: the five-station bar, the Stellungnahmen
 * panel, the submitter counts, the ME→RV comparison. Not one of them is
 * "missing" in the sense of not built yet — they cannot exist here, because
 * every one of them is fed by a parliamentary Gegenstand and there is none.
 * Rendering them empty would say "nobody filed" where the truth is "nobody
 * publishes who filed". So the page says that once, plainly, and then gives
 * what the procedure does publish: the documents, and where a Stellungnahme
 * goes.
 *
 * The Erläuterungen sit ABOVE the draft text, against the document order at
 * RIS. That is the reading order the persona described: the Allgemeiner Teil
 * first, to decide whether the draft is relevant at all, and only then the
 * text. On these pages it carries more weight still — there is no
 * parliamentary Kurzinformation ("Worum geht es?") to fall back on, so the
 * Erläuterungen are the only orientation the procedure offers.
 */
definePageMeta({
  // The only thing separating this route from a typo under `/entwuerfe`:
  // anything that is not a RIS document id 404s here instead of rendering
  // an error state for a draft that never existed.
  validate: (route) => RIS_ID_RE.test(String(route.params.id ?? '')),
})

const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))

/* `lazy` (04.10.2026), as on the Ministerialentwurf's page and for its
 * reason: a click shows this page at once as `DraftSkeleton`, and the server
 * still waits for the data, so a shared link and a crawler get it whole. */
const { data, error, refresh, status } = await useFetch<RisConsultationDetail>(
  () => `/api/ris-drafts/${id.value}`,
  { lazy: true },
)

/* What became of a Verordnung, for the heading and the bar's last station.

   Normally it comes along in the page's own response. Null there means
   „not determined inside the page's budget", not „nicht kundgemacht" — so
   the page asks for it once more from the browser, and a cold cache only
   delays the information instead of swallowing it. One value for both
   readers: the heading and the bar cannot disagree about the outcome. */
const needsOutcome = computed(() => data.value?.kind === 'verordnung' && !data.value.outcome)
const { data: fetchedOutcome } = await useFetch<BgblOutcome>(
  () => `/api/ris-drafts/${id.value}/kundmachung`,
  // Follows `needsOutcome` instead of reading it once: after a click the
  // draft arrives after this line has run.
  { lazy: true, server: false, enabled: needsOutcome, watch: [needsOutcome] },
)
const outcome = computed(() => data.value?.outcome ?? fetchedOutcome.value ?? null)

/* Only a Verordnung has a path the monitor follows to its end. A Gesetz
   without a Gegenstand would need the five stations, and none of the three
   after the Begutachtung can be read for it; `unbestimmt` has no path to
   draw at all. Those two keep the card in words. */
const stationList = computed(() =>
  data.value?.kind === 'verordnung' ? regulationStations(data.value, outcome.value) : [])

/* The yardstick behind the rail's „Kurze Frist" / „Volle Frist", as on the
   draft page — measured against Verordnungsentwürfe, because only a
   Verordnung has the rail that names the class (`fristContextDe`). */
const fristContext = computed(() => {
  const d = data.value
  if (!d || !stationList.value.length) return null
  return fristContextFor(d.startedAt, d.deadline, 'verordnung')
})

/* The closed Frist as a fact, as on the draft page: length and dates,
   drawn against the Regelfall under them (01.10.2026). */
const fristFacts = computed<Fact[]>(() => {
  const d = data.value
  if (!d || d.active || !d.deadline || !stationList.value.length) return []
  return [fristFact(d.startedAt, d.deadline)]
})

/* Same contract as on the draft page: only a section this page renders.
   „Die Begutachtung" is unconditional, as there. */
const stationAnchors: Partial<Record<StationId, string>> = {
  entwurf: '#dokumente',
  begutachtung: '#begutachtung',
}
const comparisonAnchors = computed<Partial<Record<ComparisonId, string>>>(() =>
  data.value?.textComparison ? { vorschlag: '#gegenueberstellung' } : {})

usePageSeo({
  // Capped like the draft page's: a tab and a search result show ~60
  // characters, and some RIS titles run to three lines.
  title: () => truncate(data.value?.title ?? 'Entwurf', 60),
  // The Ressort after a separator, not in the genitive: „des
  // Bundesministerium für …" read wrong, and inflecting the names
  // (Bundeskanzleramt → -amts) is a table nobody should keep. The Frist in
  // the draft page's words, so a closed one does not read „in Begutachtung".
  description: () => {
    const d = data.value
    if (!d) return undefined
    return `${RIS_KIND_LABEL[d.kind]}, ${fristStateDe(d.active, d.deadline, 'clause')} · ${d.ministryName}`
  },
})

useSeoMeta({
  // The full official title for shares, as on the draft page.
  ogTitle: () => data.value?.longTitle ?? data.value?.title ?? 'Entwurf',
  ogType: 'article',
})

/** RIS formats → the shape DocumentList renders, so both sources look alike. */
function toDocument(
  title: string,
  formats: RisDocumentFormats | null,
): DraftDocument | null {
  if (!formats) return null
  const out: DraftDocument['formats'] = []
  if (formats.pdf) out.push({ type: 'pdf', url: formats.pdf })
  if (formats.html) out.push({ type: 'html', url: formats.html })
  return out.length ? { title, formats: out } : null
}

/* Reading order, not RIS's document order: reasoning first, then the text,
 * then what changes against current law. The sub-lines are DocumentList's
 * DOC_HINTS, so the same document reads the same on both pages. */
const documents = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    toDocument('Erläuterungen', d.explanations),
    toDocument('Entwurfstext', d.mainDocument),
    toDocument('Textgegenüberstellung', d.textComparison),
  ].filter((x): x is DraftDocument => x !== null)
})

/* Who sent it, as on the draft page. One Stelle per RIS record — the joint
 * submission of two ressorts exists only in list 81. */
const ministryLinks = computed(() => {
  const d = data.value
  if (!d?.ministryCode) return []
  return [ministryLinkFor(d.ministryCode, d.ministryName ?? d.ministryCode, { art: 'verordnung' })]
})

/** The Begleitschreiben is the door: it names where a Stellungnahme goes. */
const coverLetterHref = computed(() => {
  const d = data.value
  const c = d?.coverLetter
  return d && c ? c.pdf ?? c.html ?? d.risUrl : null
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <FetchGate
      :status="status"
      :error="error"
      :data="data"
      loading-label="Entwurf wird geladen …"
      @retry="refresh()"
    >
      <template #loading="{ label }">
        <DraftSkeleton :label="label" />
      </template>
      <template #default="{ data }">
        <DraftBackLink />

        <!-- Same header anatomy as the Ministerialentwurf page. The identity
           slot holds the type word where a draft holds its Geschäftszahl —
           these records have none, and the type is what identifies them to a
           reader. -->
        <DraftHeader
          :title="data.title"
        >
          <template #source>
            <!-- `link-inline`, i.e. the same link as „Auf parlament.gv.at
               ansehen" on the draft page — this one was hand-rolled and had
               every part of it EXCEPT the colour, so the page's one way out
               to its source rendered as grey body text while the draft
               page's rendered blue. Two pages, one anatomy: the provenance
               link may not differ by half a utility class. -->
            <ExternalLink
              :href="data.risUrl"
              class="link-inline tap-target"
            >Im RIS ansehen</ExternalLink>
          </template>
          <template #identity>
            <span class="text-sm font-medium text-ink-muted">
              {{ RIS_KIND_LABEL[data.kind] }}
            </span>
          </template>
          <!-- The long title only when it says more than the heading already
             does; on a Verordnung it is where the subject matter lives. -->
          <p v-if="data.longTitle" class="mt-1 text-sm text-ink-secondary">
            {{ data.longTitle }}
          </p>
          <p v-if="data.ministryCode" class="mt-2 text-sm text-ink-secondary">
            <MinistryLinks :ministries="ministryLinks" />
          </p>
          <p v-else-if="data.ministryName" class="mt-2 text-sm text-ink-secondary">
            Vom {{ data.ministryName }}
          </p>
        </DraftHeader>

        <!-- The map, in the slot the draft page gives its station bar.

           A BAR OF ITS OWN SINCE 26.09.2026, for a Verordnung: Entwurf ·
           Begutachtung · Bundesgesetzblatt II. Until then the card said
           „Station 2 von 3" in words, on the argument that a last station
           the monitor did not follow would be a promise rather than a map.
           Since the BGBl-II match of 19.09.2026 it is followed, so the
           argument had lapsed and the card was the counter the draft page
           dropped on 18.09.2026, standing in for rows it never drew
           (`regulationStations`, docs/architecture.md §12.32). A Gesetz or
           an untyped record keeps the card in words: neither has a path
           here that can be read to its end. -->
        <ProcedureCard
          :status="regulationStatusDe(data.active, outcome?.state === 'kundgemacht')"
          :stations="stationList"
          :anchors="stationAnchors"
          :comparison-anchors="comparisonAnchors"
          :how-to="stationList.length ? '/so-funktionierts#wege' : '/so-funktionierts'"
        >
          <!-- With a bar, the link leads straight to the fork: „why three
             stations and not five" is answered there, and the card no longer
             says it itself (the sentence that did went on 26.09.2026). -->
          <!-- Without a bar the dates are the sentence, and the kind hint
             says why the card has no path to draw. With a bar both go: the
             rows carry the dates, and the Verordnung hint („erlässt ein
             Ministerium selbst … geht nicht durch das Parlament") only
             restated what the three rows show — the link above answers it
             at the fork. The closed Frist and the sentence on the
             Stellungnahmen moved to „Die Begutachtung" below (03.10.2026),
             the slot the draft page gives them. -->
          <p v-if="!stationList.length" class="mt-3 text-sm text-ink-secondary">
            <template v-if="data.startedAt">
              In Begutachtung seit {{ formatDateDe(data.startedAt) }}<template v-if="data.deadline">, Frist bis {{ formatDateWeekdayDe(data.deadline) }}</template>.
            </template>
            <template v-if="RIS_KIND_HINT[data.kind]">
              {{ RIS_KIND_HINT[data.kind] }}
            </template>
          </p>
        </ProcedureCard>

        <!-- The one place to act, in the slot and the shape the draft page
           uses for its Stellungnahme-CTA. Only while the Frist runs: an
           expired window with a button is an invitation to waste an
           afternoon. -->
        <DraftDoorCard
          v-if="data.active"
          frist
          :deadline="data.deadline"
          :context="fristContext"
          :ics-href="`/entwuerfe/${data.id}/frist.ics`"
          :filing-href="coverLetterHref"
        >
          <!-- „Ministerium" rather than „Ressort", here and in
             `risFilingNote`: one word per thing. The page carried both side by
             side, and „Ressort" is the administration's word, not the
             reader's. -->
          <!-- One sentence since 30.09.2026, and it knows whether there is a
             Begleitschreiben: the address is in it, or it is published
             nowhere. „es gibt kein Formular des Parlaments" went — the button
             below is the Begleitschreiben, not a form. -->
          <p class="mt-2 text-sm text-ink">
            <template v-if="data.coverLetter">
              Stellungnahmen gehen hier direkt an das Ministerium – an die Adresse
              im Begleitschreiben.
            </template>
            <template v-else>
              Stellungnahmen gehen hier direkt an das Ministerium. Eine
              Einreichadresse ist nicht veröffentlicht; die zuständige Stelle nennt
              der RIS-Eintrag.
            </template>
          </p>
          <!-- Linked, never read out. Measured 2026-09-17 over 40 records:
             34 of 40 Begleitschreiben are scanned images with no text
             layer at all, so an extracted address would be absent exactly
             where it is needed most — and the six readable ones name an
             individual official's work address, which is a decision of
             its own, not a side effect of a parser. -->
          <template #filing>Begleitschreiben öffnen</template>
        </DraftDoorCard>

        <!-- ONE chapter, „Der Entwurf", with h3 blocks — the draft page's
           anatomy. Until 30.09.2026 comparison, reasoning and documents were
           three h2 sections of their own here, so the folded document list
           stood as a chapter heading of the same weight as the diff.

           FIRST what the draft changes, then why, and the documents last,
           folded — the order of the draft page since 30.09.2026, for the same
           reason: a reader who opens a draft wants the diff, and nobody comes
           for the PDFs. Until then the Erläuterungen led here. -->
        <section id="entwurf" class="page-section scroll-mt-6" aria-labelledby="entwurf-heading">
          <h2 id="entwurf-heading" class="section-heading">Der Entwurf</h2>
          <div class="mt-4 space-y-8">

            <!-- The ressort's own comparison, from day one — and on these pages it
               carries more weight than on a Ministerialentwurf's. There is no
               Regierungsvorlage to compare against later and no parliamentary
               Kurzinformation above it, so this is the only place the procedure
               says what would change. Shown since 26.09.2026; until then both
               services were keyed on (GP, Nummer) and two thirds of the corpus
               had no section at all (§12.16). -->
            <PageSubsection id="gegenueberstellung" heading="Was ändert der Entwurf?">
              <TextComparisonSection :ris-id="data.id" />
            </PageSubsection>

            <!-- It weighs more here than on the draft page: this Verfahren has no
               Kurzbeschreibung from Parliament, because it never reaches
               Parliament. The Erläuterungen are therefore the only information
               about its purpose the Verfahren publishes at all — and 72,1 % of
               the Verordnung records carry them (`pnpm corpus:verordnungen`).
               Still second: its Besonderer Teil hangs at the §§ of the comparison
               above anyway. -->
            <PageSubsection id="erlaeuterungen" heading="Was das Ressort begründet">
              <ExplanationsSection :ris-id="data.id" />
            </PageSubsection>

            <!-- The house fold (`FoldSection`), as on the draft page and in
               DraftDescription: the outline does not depend on what is open,
               find-in-page still opens it, and nothing above it moves when it
               opens. -->
            <FoldSection
              :heading="documents.length ? `Dokumente (${documents.length})` : 'Dokumente'"
              heading-id="dokumente"
            >
              <div class="pb-2">
                <!-- THE ZITIERFORM, since 26.09.2026 — the one deliberate gap the
                   anatomy comparison of 17.09.2026 left open
                   (docs/architecture.md §12.16).

                   These Verfahren have no Geschäftszahl, so „132/ME" — the string
                   a reader quotes and a lawyer cites — had no counterpart on the
                   page. The RIS Dokumentnummer is it: how RIS addresses the
                   record, what „Im RIS ansehen" resolves, and this page's own URL.
                   Until now it was on screen only in the address bar, with nothing
                   saying what it was.

                   HERE AND NOT IN THE HEADER, and the first two attempts are the
                   reason. In the Metazeile beside the type word it cost the phone
                   TWO EXTRA LINES above the h1 (three meta rows at 500 px against
                   the draft page's one). Moved one line down into the
                   Herkunftszeile it was worse in kind rather than in size: that
                   line is human-readable facts separated by „·" — a ministry, a
                   link label — and a 42-character GUID at the same size, weight
                   and colour is not the same kind of thing, so it read as noise
                   and pushed the link onto its own line.

                   The mistake behind both was reasoning from the anatomy table
                   instead of from the string. „137/ME" belongs in the header
                   because it is short and people say it out loud; `BEGUT_C7697…`
                   is a lookup key nobody carries in their head. So it keeps the
                   JOB, not the slot: it stands with the sentence that already
                   names the source, at the bottom, where whoever wants to cite or
                   download is looking anyway — and in its own typographic class,
                   so it reads as a key and not as prose. -->
                <p class="mt-1 text-sm text-ink-secondary">
                  <!-- Source and key as a caption since 30.09.2026, not two
                     sentences: „Aus dem Rechtsinformationssystem des Bundes (RIS),
                     CC BY 4.0. Im RIS steht dieser Entwurf unter der
                     Dokumentnummer …". The licence went on 02.10.2026, as in
                     every credit line: what may be claimed per source is the
                     Impressum's, linked from the footer of every page. -->
                  Quelle: RIS · Dokumentnummer
                  <!-- Not a link: it would be the second element on this page
                     pointing at the RIS page the header already links, and the
                     draft page makes the same split — the Geschäftszahl is text,
                     its resolver stands elsewhere. `break-all` because 42
                     characters do not fit a phone column unbroken. -->
                  <span class="break-all font-mono text-xs text-ink">{{ data.id }}</span>.
                </p>
                <div class="mt-3">
                  <DocumentList :documents="documents" source="ris.bka.gv.at" />
                </div>
              <!-- No second "Datensatz im RIS" link here: the header line already
                   carries it, in the slot where the draft page puts "Auf
                   parlament.gv.at ansehen" — provenance belongs next to the
                   item's identity, not mid-page as an action it is not. -->
              </div>
            </FoldSection>
          </div>
        </section>

        <!-- The Begutachtung, as on the draft page and unconditional as there:
           it is what the page is about, running or closed (03.10.2026 — until
           then the page had no such section, and while the Frist ran the
           station had nothing below the bar to lead to). What it holds is
           what this procedure publishes: the closed Frist, and that the
           Stellungnahmen are not published — where the draft page has its
           list. -->
        <section id="begutachtung" class="page-section scroll-mt-6" aria-labelledby="begutachtung-heading">
          <h2 id="begutachtung-heading" class="section-heading">Die Begutachtung</h2>
          <div class="mt-4 space-y-8">
            <!-- While the Frist runs the action card carries it; one place
               at a time, as on the draft page. -->
            <FactList v-if="fristFacts.length" :facts="fristFacts">
              <template #after-frist>
                <FristBar :start="data.startedAt" :deadline="data.deadline" />
              </template>
            </FactList>
            <PageSubsection heading="Stellungnahmen">
              <!-- Why there is no list stands on the explainer (30.09.2026).
                 In both states: it is as true while the Frist runs, and the
                 action card above only says where they go. -->
              <p class="text-sm text-ink-secondary">
                Die Stellungnahmen werden nicht veröffentlicht&nbsp;–
                <NuxtLink to="/so-funktionierts#ohne-stellungnahmen" class="link-inline">warum?</NuxtLink>
              </p>
              <!-- The card's door once more (`DoorButton`). Only with a
                 Begleitschreiben: without one the card's fallback is the RIS
                 record, and a second way to it here is not an action. -->
              <div v-if="data.active && data.coverLetter" class="mt-4">
                <DoorButton :href="data.coverLetter.pdf ?? data.coverLetter.html ?? data.risUrl">
                  Begleitschreiben öffnen
                </DoorButton>
              </div>
            </PageSubsection>
          </div>
        </section>

      </template>
    </FetchGate>
  </div>
</template>
