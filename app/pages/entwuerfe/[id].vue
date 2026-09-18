<script setup lang="ts">
import type { DraftDocument, RisConsultationDetail, RisDocumentFormats } from '#shared/types'
import { RIS_ID_RE } from '#shared/utils/risConsultations'

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
 * WHAT THIS PAGE DELIBERATELY DOES NOT HAVE: the StageBar, the Stellungnahmen
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
      'Die Begründung des Ressorts – der Allgemeine Teil sagt, was der Entwurf überhaupt soll',
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
    <div v-if="status === 'pending' && !data">
      <LoadingState label="Entwurf wird geladen …" />
    </div>
    <div v-else-if="error">
      <ErrorState @retry="refresh()" />
    </div>
    <template v-else-if="data">
      <div class="mb-4">
        <!-- Back into the one list, filtered to this kind of row: since
             17.09.2026 there is no separate list to return to
             (docs/architecture.md §12.19). -->
        <NuxtLink
          to="/entwuerfe?art=verordnung"
          class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
        >
          ← Alle Verordnungsentwürfe
        </NuxtLink>
      </div>

      <!-- Same header anatomy as the Ministerialentwurf page: one meta row
           above the title carrying identity, ressort and urgency, then the
           title, then the provenance line. The first slot holds the type
           word where a draft holds its Geschäftszahl — these records have
           none, and the type is what identifies them to a reader. -->
      <header>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-ink-muted">
            {{ RIS_KIND_LABEL[data.kind] }}
          </span>
          <!-- Linked like the draft page's badge: every Ressort gets a
               de-facto page for free, here the filtered list. -->
          <NuxtLink
            v-if="data.ministryCode"
            :to="`/entwuerfe?art=verordnung&ministry=${data.ministryCode}`"
            :aria-label="`Alle Verordnungsentwürfe des Ressorts ${data.ministryName} anzeigen`"
            class="tap-target rounded"
          >
            <MinistryBadge
              :code="data.ministryCode"
              :name="data.ministryName"
              class="transition-colors hover:border-baseline hover:underline"
            />
          </NuxtLink>
          <!-- Only while it runs, exactly as on the draft page: closed, the
               badge degrades to "Endete am …", which the card below says
               better. -->
          <DeadlineBadge
            v-if="data.active"
            :deadline="data.deadline"
            :active="data.active"
          />
        </div>
        <h1
          class="mt-3 text-2xl font-semibold text-ink hyphens-auto break-words sm:text-3xl"
        >
          {{ data.title }}
        </h1>
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
      </header>

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
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p class="font-medium text-ink">
              {{ data.active ? 'In Begutachtung' : 'Begutachtung beendet' }}
            </p>
            <NuxtLink
              to="/so-funktionierts"
              class="tap-target rounded text-xs text-ink-muted hover:text-ink hover:underline"
            >
              Wie funktioniert das Verfahren? →
            </NuxtLink>
          </div>
          <p class="mt-2 max-w-prose text-sm text-ink-secondary">
            <template v-if="data.startedAt">
              In Begutachtung seit {{ formatDateDe(data.startedAt) }}<template v-if="data.deadline">, Frist bis {{ formatDateWeekdayDe(data.deadline) }}</template>.
            </template>
            {{ RIS_KIND_HINT[data.kind] }}
          </p>
          <!-- What the monitor can and cannot follow from here, said once
               and plainly, instead of five sections rendered empty. The
               distinction matters: the participation half is structurally
               unavailable, the outcome half merely is not built yet, and
               collapsing the two would claim the procedure ends here. -->
          <p class="mt-3 max-w-prose text-sm text-ink-secondary">
            <strong class="font-medium text-ink">Keine Stellungnahmen-Liste und
            keine Einbringer:</strong> ohne Gegenstand im Parlament
            veröffentlicht niemand, wer Stellung genommen hat.
            <template v-if="data.kind === 'verordnung'">
              Was danach kommt – Erlassung durch das Ressort und Kundmachung im
              Bundesgesetzblatt II – verfolgt der Monitor bisher nicht.
            </template>
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
        <p class="font-medium text-ink">
          {{ fristLabel(data.deadline, data.active) }}<template v-if="data.deadline"> – die Frist endet am {{ formatDateDe(data.deadline) }}</template>
        </p>
        <p class="mt-2 max-w-prose text-sm text-ink-secondary">
          Eine Stellungnahme geht hier direkt an das Ressort – es gibt kein
          Formular des Parlaments. An welche Adresse, steht im
          Begleitschreiben, mit dem das Ressort den Entwurf versendet hat.
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
            Begleitschreiben öffnen<span aria-hidden="true"> ↗</span>
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
          Ressort selbst; der Datensatz im RIS nennt die einbringende Stelle.
        </p>
      </div>

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

    </template>
  </div>
</template>
