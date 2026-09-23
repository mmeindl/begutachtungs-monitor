<script setup lang="ts">
import type { DraftDocument, RisConsultationDetail, RisDocumentFormats } from '#shared/types'
import { RIS_ID_RE } from '#shared/utils/risConsultations'
import { regulationStatusDe } from '~/utils/spine'

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
 * WHAT THIS PAGE DELIBERATELY DOES NOT HAVE: the Stationenleiste, the Stellungnahmen
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

const { data, error, refresh, status } = await useFetch<RisConsultationDetail>(
  () => `/api/ris-drafts/${id.value}`,
)

useSeoMeta({
  title: () => data.value?.title ?? 'Entwurf',
  description: () =>
    data.value
      ? `${RIS_KIND_LABEL[data.value.kind]} des ${data.value.ministryName} in Begutachtung${
        data.value.deadline ? ` bis ${formatDateDe(data.value.deadline)}` : ''
      }.`
      : undefined,
})

/** RIS formats → the shape DocumentList renders, so both sources look alike. */
function toDocument(
  title: string,
  formats: RisDocumentFormats | null,
  hint: string,
): DraftDocument & { hint: string } | null {
  if (!formats) return null
  const out: DraftDocument['formats'] = []
  if (formats.pdf) out.push({ type: 'pdf', url: formats.pdf })
  if (formats.html) out.push({ type: 'html', url: formats.html })
  return out.length ? { title, formats: out, hint } : null
}

/* Reading order, not RIS's document order: reasoning first, then the text,
 * then what changes against current law. */
const documents = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    toDocument(
      'Erläuterungen',
      d.explanations,
      'Die Begründung des Ministeriums – der Allgemeine Teil sagt, was der Entwurf überhaupt soll',
    ),
    toDocument('Entwurfstext', d.mainDocument, 'Der Entwurf selbst'),
    toDocument(
      'Textgegenüberstellung',
      d.textComparison,
      'Geltendes Recht und Entwurf nebeneinander – zeigt, was sich ändern würde',
    ),
  ].filter((x): x is DraftDocument & { hint: string } => x !== null)
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <FetchGate
      v-slot="{ data }"
      :status="status"
      :error="error"
      :data="data"
      loading-label="Entwurf wird geladen …"
      @retry="refresh()"
    >
      <DraftBackLink />

      <!-- Same header anatomy as the Ministerialentwurf page. The identity
           slot holds the type word where a draft holds its Geschäftszahl —
           these records have none, and the type is what identifies them to a
           reader. -->
      <!-- One Stelle per RIS record — the joint submission of two ressorts
           exists only in list 81, so this list never holds more than one. -->
      <DraftHeader
        :ministries="
          data.ministryCode
            ? [{
              code: data.ministryCode,
              name: data.ministryName ?? data.ministryCode,
              to: `/entwuerfe?art=verordnung&ministry=${data.ministryCode}`,
              label: `Alle Verordnungsentwürfe des Ministeriums ${data.ministryName} anzeigen`,
            }]
            : []
        "
        :deadline="data.deadline"
        :active="data.active"
        :title="data.title"
      >
        <template #identity>
          <span class="text-sm font-medium text-ink-muted">
            {{ RIS_KIND_LABEL[data.kind] }}
          </span>
        </template>
        <!-- The long title only when it says more than the heading already
             does; on a Verordnung it is where the subject matter lives. -->
        <p v-if="data.longTitle" class="mt-1 max-w-prose text-sm text-ink-secondary">
          {{ data.longTitle }}
        </p>
        <p class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-secondary">
          <span>{{ data.ministryName }}</span>
          <span aria-hidden="true">·</span>
          <ExternalLink
            :href="data.risUrl"
            class="tap-target rounded underline underline-offset-2 hover:no-underline"
          >Im RIS ansehen</ExternalLink>
        </p>
      </DraftHeader>

      <!-- The map, in the slot the draft page gives its five-station spine.
           NOT a spine of its own, and that is a decision with a reason:
           a Verordnung really does have a further course — Begutachtung,
           Erlassung durch das Ressort, Kundmachung im BGBl II — but the
           monitor does not yet follow it, and a rail whose last station is
           permanently "unbekannt" would be a promise, not a map. So the
           card answers in words what the spine answers in stations: where
           this is now, and what comes after it. A rail of its own waits
           until every station of that course can be read
           (docs/architecture.md §12.32). -->
      <div class="mt-6">
        <div class="rounded-xl border border-hairline bg-surface p-5">
          <!-- Heading and link as on the Ministerialentwurf page: the same
               card, the same place, the same weights.

               „Station 2 von 3" ONLY while the Frist runs. After that the
               draft has left the Begutachtung and the third station names
               itself: since 19.09.2026 the heading says „Kundgemacht" as soon
               as the match against the Bundesgesetzblatt has a Fundstelle
               (docs/architecture.md §12.32). A running count beside it would
               be the third statement of one thing.

               The three is the Verordnung path's on /so-funktionierts
               (Entwurf · Begutachtung · Bundesgesetzblatt II). The sentence
               below it that marked station 3 as „verfolgt der Monitor bisher
               nicht" is gone — it is followed. -->
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 class="font-medium text-ink">
              {{ regulationStatusDe(data.active, data.outcome?.state === 'kundgemacht') }}
            </h2>
            <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span v-if="data.active" class="text-ink-secondary">Station 2 von 3</span>
              <NuxtLink
                to="/so-funktionierts"
                class="tap-target rounded font-medium text-accent-deep hover:underline"
              >
                Wie funktioniert das Verfahren? →
              </NuxtLink>
            </p>
          </div>
          <p class="mt-2 max-w-prose text-sm text-ink-secondary">
            <template v-if="data.startedAt">
              In Begutachtung seit {{ formatDateDe(data.startedAt) }}<template v-if="data.deadline">, Frist bis {{ formatDateWeekdayDe(data.deadline) }}</template>.
            </template>
            <template v-if="RIS_KIND_HINT[data.kind]">
              {{ RIS_KIND_HINT[data.kind] }}
            </template>
          </p>
          <!-- ONE sentence about what the monitor cannot follow, not two.
               Until 18.09.2026 this said „Keine Stellungnahmen-Liste und keine
               Einbringer: ohne Gegenstand im Parlament veröffentlicht niemand
               …" — the same statement the paragraph above and the card below
               already make, and it explained an absence by comparison with a
               page the reader has never seen.

               What stays is the half that stands nowhere else: the way
               onwards. The distinction that matters is carried by two
               different places now — the missing participation list is stated
               by the action card below, where somebody misses it; that the
               tracking ends here is stated here.

               SINCE 19.09.2026 THE ANSWER STANDS HERE INSTEAD OF THE
               ADMISSION. The sentence before read „… verfolgt der Monitor
               bisher nicht" — honest, and the place where two thirds of the
               corpus ended without an accountability layer
               (docs/architecture.md §12.32). -->
          <BgblOutcomeBlock v-if="data.kind === 'verordnung'" :ris-id="data.id" :outcome="data.outcome" />
          <!-- After the Fristende there is no action card left that could say
               where a Stellungnahme went. The card then says it, once, in the
               perfect — the question is no longer „wohin" but „warum steht
               hier keine Zahl". -->
          <p v-if="!data.active" class="mt-3 max-w-prose text-sm text-ink-secondary">
            Stellungnahmen gingen direkt an das Ministerium; wer Stellung
            genommen hat, wird nicht veröffentlicht.
          </p>
        </div>
      </div>

      <!-- The one place to act, in the slot and the shape the draft page
           uses for its Stellungnahme-CTA. Only while the Frist runs: an
           expired window with a button is an invitation to waste an
           afternoon. -->
      <div
        v-if="data.active"
        class="mt-6 rounded-xl border border-hairline bg-surface p-5"
      >
        <!-- A heading, not a paragraph: the one action the page offers
             belongs in the outline. -->
        <h2 class="font-medium text-ink">
          {{ fristLabel(data.deadline, data.active) }}<template v-if="data.deadline"> – die Frist endet am {{ formatDateDe(data.deadline) }}</template>
        </h2>
        <!-- „Ministerium" rather than „Ressort", here and in
             `risFilingNote`: one word per thing. The page carried both side by
             side, and „Ressort" is the administration's word, not the
             reader's. -->
        <p class="mt-2 max-w-prose text-sm text-ink-secondary">
          Eine Stellungnahme geht hier direkt an das Ministerium – es gibt
          kein Formular des Parlaments. An welche Adresse, steht im
          Begleitschreiben, mit dem das Ministerium den Entwurf versendet
          hat.
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <!-- Linked, never read out. Measured 2026-09-17 over 40 records:
               34 of 40 Begleitschreiben are scanned images with no text
               layer at all, so an extracted address would be absent exactly
               where it is needed most — and the six readable ones name an
               individual official's work address, which is a decision of
               its own, not a side effect of a parser. -->
          <UButton
            v-if="data.coverLetter"
            :to="data.coverLetter.pdf ?? data.coverLetter.html ?? data.risUrl"
            target="_blank"
            rel="noopener"
            color="primary"
            class="min-h-11"
          >
            Begleitschreiben öffnen<span aria-hidden="true"> ↗</span><span class="sr-only"> (neues Fenster)</span>
          </UButton>
          <UButton
            v-if="data.deadline"
            :to="`/entwuerfe/${data.id}/frist.ics`"
            external
            color="neutral"
            variant="outline"
            class="min-h-11"
          >
            Frist in den Kalender (.ics)
          </UButton>
        </div>
        <p v-if="!data.coverLetter" class="mt-3 max-w-prose text-sm text-ink-secondary">
          Zu diesem Entwurf liegt im RIS kein Begleitschreiben – und damit
          keine veröffentlichte Einreichadresse. Der Weg führt über das
          Ministerium selbst; der Datensatz im RIS nennt die einbringende Stelle.
        </p>
      </div>

      <!-- Before the document list, and it weighs more here than on the
           draft page: this Verfahren has no Kurzbeschreibung from Parliament,
           because it never reaches Parliament. The Erläuterungen are therefore
           the only information about its purpose the Verfahren publishes at
           all — and 72,1 % of the Verordnung records carry them
           (`pnpm corpus:verordnungen`). -->
      <section id="erlaeuterungen" class="page-section scroll-mt-6" aria-labelledby="erlaeuterungen-heading">
        <h2 id="erlaeuterungen-heading" class="section-heading">Was das Ressort begründet</h2>
        <ExplanationsSection :ris-id="data.id" />
      </section>

      <section class="page-section" aria-labelledby="dokumente">
        <h2 id="dokumente" class="section-heading">Dokumente</h2>
        <p class="mt-1 max-w-prose text-sm text-ink-secondary">
          Aus dem Rechtsinformationssystem des Bundes (RIS), CC BY 4.0.
        </p>
        <div class="mt-3">
          <DocumentList :documents="documents" source="ris.bka.gv.at" />
        </div>
        <!-- No second "Datensatz im RIS" link here: the header line already
             carries it, in the slot where the draft page puts "Auf
             parlament.gv.at ansehen" — provenance belongs next to the
             item's identity, not mid-page as an action it is not. -->
      </section>

    </FetchGate>
  </div>
</template>
