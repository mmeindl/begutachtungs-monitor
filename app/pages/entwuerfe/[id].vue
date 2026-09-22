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
      <DraftHeader
        :ministry-code="data.ministryCode"
        :ministry-name="data.ministryName"
        :ministry-to="`/entwuerfe?art=verordnung&ministry=${data.ministryCode}`"
        :ministry-label="`Alle Verordnungsentwürfe des Ministeriums ${data.ministryName} anzeigen`"
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
           this is now, and what comes after it. See `TODO.md` for the
           tracked version. -->
      <div class="mt-6">
        <div class="rounded-xl border border-hairline bg-surface p-5">
          <!-- Überschrift und Link wie auf der Ministerialentwurfsseite:
               dieselbe Karte, dieselbe Stelle, dieselben Gewichte.

               „Station 2 von 3" NUR während der Frist. Danach hat der
               Entwurf die Begutachtung verlassen, und die dritte Station
               benennt sich selbst: Seit 19.09.2026 sagt die Überschrift
               „Kundgemacht", sobald der Abgleich mit dem Bundesgesetzblatt
               eine Fundstelle hat (§12.32). Eine laufende Zählung daneben
               wäre die dritte Angabe derselben Sache.

               Die Drei ist die des Verordnungswegs auf /so-funktionierts
               (Entwurf · Begutachtung · Bundesgesetzblatt II). Der Satz
               darunter, der Station 3 als „verfolgt der Monitor bisher
               nicht" auswies, ist weg — sie wird verfolgt. -->
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
               Bis 18.09.2026 stand hier „Keine Stellungnahmen-Liste und
               keine Einbringer: ohne Gegenstand im Parlament veröffentlicht
               niemand …" — dieselbe Aussage, die der Absatz darüber und die
               Karte darunter schon machen, und sie erklärte eine Abwesenheit
               im Vergleich zu einer Seite, die der Leser nie gesehen hat.

               Was bleibt, ist die eine Hälfte, die sonst nirgends steht: der
               weitere Weg. Die Unterscheidung, auf die es ankommt, tragen
               jetzt zwei verschiedene Orte — die fehlende Beteiligungsliste
               sagt der Handlungskasten unten dort, wo sie jemandem abgeht;
               dass die Nachverfolgung hier endet, steht hier. -->
          <!-- SEIT 19.09.2026 STEHT HIER DIE ANTWORT STATT DES
               EINGESTÄNDNISSES. Der Satz davor lautete „… verfolgt der
               Monitor bisher nicht" — ehrlich, und die Stelle, an der zwei
               Drittel des Korpus ohne Rechenschaftsschicht endeten
               (§12.32). -->
          <BgblOutcomeBlock v-if="data.kind === 'verordnung'" :ris-id="data.id" :outcome="data.outcome" />
          <!-- Nach Fristende gibt es keinen Handlungskasten mehr, der sagen
               könnte, wohin eine Stellungnahme ging. Dann sagt es die Karte,
               einmal, im Perfekt — die Frage lautet jetzt nicht „wohin",
               sondern „warum steht hier keine Zahl". -->
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
        <!-- Überschrift, nicht Absatz: die eine Handlung, die die Seite
             anbietet, gehört in die Gliederung. -->
        <h2 class="font-medium text-ink">
          {{ fristLabel(data.deadline, data.active) }}<template v-if="data.deadline"> – die Frist endet am {{ formatDateDe(data.deadline) }}</template>
        </h2>
        <!-- „Ministerium" statt „Ressort", hier und in `risFilingNote`:
             ein Wort je Sache. Die Seite führte beide nebeneinander, und
             „Ressort" ist das Wort der Verwaltung, nicht das des Lesers. -->
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

      <!-- Vor der Dokumentliste, und hier wiegt das mehr als auf der
           Entwurfsseite: Diesem Verfahren fehlt die Kurzbeschreibung des
           Parlaments, weil es nie ins Parlament kommt. Die Erläuterungen
           sind damit die einzige Auskunft über den Zweck, die das Verfahren
           überhaupt veröffentlicht — und 72,1 % der Verordnungssätze tragen
           sie (`pnpm audit:verordnungen`). -->
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
