<script setup lang="ts">
import type { BegutSearchResponse } from '#shared/types'
import { viewOfDraft, viewOfRis } from '#shared/utils/entryView'

/**
 * /suche — kommt mein Thema in einem der laufenden Entwürfe vor?
 * (docs/architecture.md §12.31)
 *
 * DIE FRAGE, DIE DIESE SEITE BEANTWORTET, ist nicht „wo finde ich einen
 * Entwurf" — dafür gibt es `/entwuerfe`, und bei 7 bis 25 gleichzeitig
 * offenen Begutachtungen findet man ihn dort durch Hinsehen. Sie beantwortet
 * die Frage danach: **steht in einem dieser Entwürfe etwas über mein
 * Anliegen, obwohl sein Titel davon nichts sagt?** Ein Sammelgesetz heißt
 * „Budgetbegleitgesetz" und ändert vierzig Gesetze; ein Vehikel erkennt man
 * nicht am Namen, sondern am Text.
 *
 * DIE SUCHE MACHT DAS RIS, die Fundstelle machen wir. Warum beides so
 * herum, steht in `server/utils/begutSearchService.ts`; für diese Seite
 * zählt die Folge davon: Ein Treffer heißt „das Wort steht irgendwo in den
 * Dokumenten dieses Satzes" — im Gesetzestext, in den Erläuterungen, in der
 * Textgegenüberstellung oder in einer Anlage. Das ist ein Unterschied, den
 * der Leser wissen MUSS: „Fahrrad" steht bei 20 gemessenen Treffern nur in
 * 7 im Entwurfstext und in 16 in den Erläuterungen. Deshalb trägt jede Zeile
 * ihre Fundstelle, und wo wir keine benennen können, sagt sie das auch.
 *
 * ÜBER DIE URL, nicht über einen Zustand im Kopf der Komponente: `?q=` macht
 * jede Suche teilbar, den Zurück-Knopf richtig, und sie rendert serverseitig
 * — ein Link auf eine Trefferliste zeigt dem Empfänger Treffer, kein
 * leeres Feld. Das Formular funktioniert deshalb auch ohne JavaScript: ohne
 * es schickt der Browser dasselbe GET, das die Seite sonst selbst auslöst.
 */
const route = useRoute()
const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))

const { data, status, error, refresh } = await useFetch<BegutSearchResponse>('/api/suche', {
  query: { q: query },
})

/** Das Feld folgt der URL, nicht umgekehrt — sonst zeigt es nach „zurück" die vorige Suche. */
const term = ref(query.value)
watch(query, (v) => {
  term.value = v
})

function submit() {
  const q = term.value.trim()
  return navigateTo({ path: '/suche', query: q ? { q } : {} })
}

/**
 * Jede Zeile in der Anatomie der Listen (§12.28) — mit Frist, Ressort und
 * Stellungnahmen, weil ein Treffer, dessen Frist in drei Tagen endet, etwas
 * anderes ist als einer aus der letzten Woche. Der Beleg hängt als Slot
 * darunter; er ist der Grund für die Zeile, kein Fakt über den Entwurf.
 */
const results = computed(() =>
  (data.value?.hits ?? []).map((hit) => ({
    hit,
    view: hit.entry.kind === 'draft' ? viewOfDraft(hit.entry.draft) : viewOfRis(hit.entry.consultation),
  })),
)

/**
 * Dieselbe Menge in zwei Fällen, und das ist kein Luxus: „kommt in DIE 7
 * Begutachtungen nicht vor" stand da, bis die gerenderte Seite es zeigte.
 * Ein Werkzeug, das über Gesetzestexte spricht, darf seinen eigenen Satz
 * nicht falsch beugen.
 */
const corpusNominative = computed(() => {
  const n = data.value?.corpusSize ?? 0
  return n === 1 ? 'die eine laufende Begutachtung' : `die ${n} laufenden Begutachtungen`
})
const corpusDative = computed(() => {
  const n = data.value?.corpusSize ?? 0
  return n === 1 ? 'der einen laufenden Begutachtung' : `den ${n} laufenden Begutachtungen`
})

useSeoMeta({
  title: 'Suche',
  description:
    'Volltextsuche über die Dokumente der laufenden Begutachtungen: Entwurfstext, Erläuterungen und Textgegenüberstellung – für Themen, die im Titel eines Sammelgesetzes nicht vorkommen.',
})

/**
 * Trefferseiten nicht in den Index: Sie sind beliebig viele Adressen mit
 * demselben, täglich wechselnden Inhalt — die Entwurfsseiten dahinter sind
 * das, was gefunden werden soll. Die leere Seite bleibt indexierbar, sie ist
 * das Werkzeug selbst.
 */
useHead(() => (query.value ? { meta: [{ name: 'robots', content: 'noindex' }] } : {}))
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Suche
      </h1>
      <p class="mt-2 max-w-prose text-ink-secondary">
        Im Volltext der laufenden Begutachtungen – Entwurfstext, Erläuterungen
        und Textgegenüberstellung. Für Themen, die im Titel eines
        Sammelgesetzes nicht vorkommen.
      </p>
    </header>

    <!-- `action` und `name` stehen da, damit die Seite ohne JavaScript
         dasselbe tut: der Browser schickt das GET selbst. -->
    <form action="/suche" method="get" class="mt-6 flex flex-wrap items-center gap-2" @submit.prevent="submit">
      <UInput
        v-model="term"
        name="q"
        type="search"
        icon="i-lucide-search"
        placeholder="Stichwort, z. B. Informationsfreiheit"
        aria-label="Stichwort"
        maxlength="100"
        class="min-w-56 flex-1"
        :ui="{ base: 'min-h-11' }"
      />
      <UButton type="submit" color="primary" class="min-h-11">Suchen</UButton>
    </form>

    <!-- Der Stern steht hier und nicht in einer Hilfe-Ebene: Er ist der eine
         Handgriff, der im Deutschen den Unterschied macht — das RIS sucht
         ganze Wörter, „Klimaschutz" findet „Klimaschutzgesetz" nicht, und
         mit Stern werden aus 453 Sätzen 491. -->
    <p class="mt-2 text-sm text-ink-muted">
      Mehrere Wörter werden mit UND verknüpft. Ganze Wörter – <code>Klima*</code>
      findet auch zusammengesetzte.
    </p>

    <div v-if="status === 'pending'" class="mt-10">
      <LoadingState label="Es wird gesucht …" />
    </div>
    <div v-else-if="error" class="mt-10">
      <ErrorState @retry="refresh()" />
    </div>
    <template v-else-if="data">
      <!-- OHNE SUCHE sagt die Seite, worüber gesucht wird. Eine leere
           Trefferliste ohne diese Zahl wäre nicht interpretierbar: „nichts
           gefunden" heißt etwas anderes bei 7 offenen Verfahren als bei
           700. -->
      <p v-if="!data.query" class="mt-10 text-ink-secondary">
        Durchsucht werden {{ corpusNominative }}.
      </p>

      <template v-else>
        <p class="mt-10 text-ink">
          <template v-if="data.hits.length">
            <strong class="font-semibold">{{ data.hits.length }}</strong> von
            {{ data.corpusSize }} laufenden Begutachtungen
            {{ data.hits.length === 1 ? 'führt' : 'führen' }} „{{ data.query }}“.
          </template>
          <template v-else>
            „{{ data.query }}“ kommt in {{ corpusDative }} nicht vor.
          </template>
        </p>

        <!-- DIE GRENZE DER SUCHE, an der Stelle, an der sie jemanden
             betrifft: Diese Seite kennt nur, was heute offen ist. Wer wissen
             will, ob ein Thema schon einmal vorkam, ist im RIS richtig —
             gesagt, wo die leere Antwort steht, nicht in einer Fußnote. -->
        <p v-if="!data.hits.length" class="mt-2 max-w-prose text-sm text-ink-secondary">
          Gesucht wird nur in den laufenden Verfahren. Das Archiv bis 2004
          durchsucht das
          <ExternalLink href="https://www.ris.bka.gv.at/Begut/">RIS selbst</ExternalLink>.
        </p>

        <ul v-if="results.length" class="mt-4 space-y-3">
          <li v-for="r in results" :key="r.view.key">
            <EntryItem :entry="r.view" density="card">
              <template #evidence>
                <!-- DER BELEG. `mt-1`, keine Linie, kein Kasten: er steht
                     schon in der Karte des Treffers, und ein Rahmen im
                     Rahmen macht aus einem Zitat ein zweites Bauteil. -->
                <p v-if="r.hit.snippet" class="mt-1 text-sm leading-relaxed text-ink-secondary">
                  <span class="font-medium text-ink">
                    {{ r.hit.place }}<template v-if="r.hit.designation">, {{ r.hit.designation }}</template>:
                  </span>
                  {{ ' ' }}
                  <span class="hyphens-auto">
                    {{ r.hit.snippet.before
                    }}<mark class="bg-mark text-ink">{{ r.hit.snippet.match }}</mark
                    >{{ r.hit.snippet.after }}
                  </span>
                </p>
                <!-- KEINE STELLE HEISST NICHT KEIN TREFFER — aber der
                     Satz dazu muss stimmen. Die erste Fassung sagte „steht
                     in einer Anlage oder einem PDF", und das war geraten:
                     Beim Industriestrompreisgesetz steht „Klimaschutz" in
                     KEINEM Dokument, die Erläuterungen schreiben „Klima-,
                     Umweltschutz- und Energiebeihilfen", und das RIS trifft
                     über die Wortbestandteile. Also sagt die Zeile, was
                     geprüft wurde, und überlässt den Schluss dem Leser.
                     Gemessen: 72,2 % der Treffer sind benennbar. -->
                <p v-else class="mt-1 text-sm text-ink-muted">
                  Wörtlich steht das Wort nicht im Entwurfstext und nicht in den
                  Erläuterungen. Das RIS findet auch Wortbestandteile und
                  durchsucht Anlagen, die hier nicht gelesen werden.
                </p>
              </template>
            </EntryItem>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
