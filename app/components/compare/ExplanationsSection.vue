<script setup lang="ts">
/**
 * „Was das Ressort begründet" — der Allgemeine Teil der Erläuterungen
 * (docs/architecture.md §12.29).
 *
 * WARUM DIESER ABSCHNITT EXISTIERT. Die Relevanzprüfung eines Lesers beginnt
 * hier: erst den Allgemeinen Teil überfliegen — was soll das Gesetz? —, dann
 * den Gesetzestext oder die Gegenüberstellung. Die Seite hatte dafür bisher
 * einen PDF-Link mit der Unterzeile „Die Begründung des Ministeriums" und
 * darüber die Kurzbeschreibung des Parlaments. Die beiden sind kein Ersatz
 * füreinander: Die Kurzbeschreibung ist für den parlamentarischen Betrieb
 * geschrieben, die Erläuterungen sind die Begründung des Ressorts selbst —
 * und einem Verordnungsentwurf fehlt die Kurzbeschreibung ganz, weil er nie
 * ins Parlament kommt.
 *
 * WAS ER NICHT IST. Keine Zusammenfassung, keine Auswahl, kein Sprachmodell:
 * Was hier steht, sind die Absätze des Ressorts in seiner Reihenfolge, aus
 * dem typisierten RIS-XML gelesen (`explanations.ts`). Das Einzige, was der
 * Monitor entscheidet, ist, wo gefaltet wird — und wo die Gliederung von uns
 * erschlossen ist, sagt der Abschnitt es (`labelled`).
 *
 * SERVERSEITIG MIT FRIST, anders als die Vergleichsabschnitte: Dieser Text
 * ist die Substanz der Seite und CC BY, also gehört er ins ausgelieferte
 * HTML — aber nur, solange das RIS in 800 ms antwortet. Warum die Frist und
 * warum nicht länger, steht in `useExplanations`.
 */

/**
 * Zwei Wege zum selben Dokument, weil die beiden Entwurfsarten es auf
 * verschiedenen Wegen erreichen: der Ministerialentwurf über den RIS↔ME-Join,
 * die Begutachtung ohne Gegenstand direkt über ihre RIS-ID.
 */
const props = defineProps<{ gp?: string; inr?: number; risId?: string }>()

const { data, status } = useExplanations(() => ({ gp: props.gp, inr: props.inr, risId: props.risId }))

/** Ein Absatz oder eine Zwischenüberschrift des Ressorts, in Druckreihenfolge. */
interface Item {
  kind: 'heading' | 'text'
  text: string
}

const items = computed<Item[]>(() =>
  (data.value?.passages ?? []).flatMap((p) => [
    ...(p.heading ? [{ kind: 'heading' as const, text: p.heading }] : []),
    ...p.text.map((t) => ({ kind: 'text' as const, text: t })),
  ]),
)

/**
 * Wo gefaltet wird.
 *
 * Der Allgemeine Teil ist im Median 2.359 Zeichen lang, im p90 aber 7.727 und
 * im längsten Fall 40.335 (`pnpm corpus:erlaeuterungen`, Fenster ab 2024) —
 * eine Verteilung, bei der „alles anzeigen" die Seite für die Hälfte der
 * Entwürfe unbrauchbar macht und „immer falten" für die andere Hälfte eine
 * Klickstrecke vor zwei Absätze legt.
 *
 * Deshalb ein Zeichenbudget statt einer Absatzzahl: Ein einziger langer
 * Absatz wird genauso begrenzt wie zwanzig kurze. Und das Budget wird
 * geprüft, BEVOR ein Absatz dazukommt, nicht danach — sonst rutscht genau
 * der lange Absatz noch ganz hinein, den zu falten der Zweck der Übung war
 * (132/ME: 3.000 Zeichen am Stück, an der Seite nachgesehen).
 *
 * Der erste Absatz steht immer, egal wie lang er ist: Ein Aufklapper als
 * erstes Element wäre die Seite, die ihre eigene Antwort versteckt. Ein
 * Absatz wird nie mitten im Satz abgeschnitten — es ist der Text des
 * Ressorts, nicht unserer.
 */
const BUDGET = 1400

const visibleCount = computed(() => {
  let spent = 0
  let shown = 0
  let paragraphs = 0
  for (const [i, item] of items.value.entries()) {
    if (paragraphs >= 1 && spent + item.text.length > BUDGET) break
    spent += item.text.length
    if (item.kind === 'text') paragraphs += 1
    shown = i + 1
  }
  // Keine hängende Überschrift am Schnitt: Sie gehört zu dem, was unter ihr
  // steht, also wandert sie mit in den Aufklapper.
  if (shown < items.value.length && items.value[shown - 1]?.kind === 'heading') shown -= 1
  return shown
})

const visible = computed(() => items.value.slice(0, visibleCount.value))
const folded = computed(() => items.value.slice(visibleCount.value))
const foldedParagraphs = computed(() => folded.value.filter((i) => i.kind === 'text').length)

/**
 * „Erläuterungen des Ressorts, Allgemeiner Teil" — der Teil, aus dem gelesen
 * wurde, steht im Link, nicht in einem zweiten Satz. Der Doppelpunkt fällt
 * weg: Ressorts schreiben ihre Überschrift als „Allgemeiner Teil:", und in
 * einer Aufzählung ist das ein Satzzeichen zu viel.
 */
const sourceLabel = computed(() => {
  const label = data.value?.document?.label ?? ''
  const heading = data.value?.heading?.replace(/\s*:\s*$/, '')
  return heading ? `${label}, ${heading}` : label
})

/**
 * „Wird geladen" umfasst einen dritten Zustand: Der Server hat die Frist
 * gerissen und `null` geliefert, der Client holt gerade nach
 * (`useExplanations`). Das ist kein Fehler und darf keiner werden — sonst
 * stünde in genau dem HTML, das ein Crawler zu sehen bekommt, „nicht
 * verfügbar" über einem Abschnitt, der eine Sekunde später da ist.
 */
const loading = computed(() => status.value !== 'error' && !data.value)

/* Die Haus-Linkform (`link-inline` in `main.css`) plus den Fokusring. */
const LINK =
  'link-inline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep'

/**
 * Die Ansage für Screenreader, wenn der Abschnitt nachgeladen ist — dieselbe
 * Mechanik wie im Vergleich: Die Region ist beim Einhängen leer und wird erst
 * gefüllt, sonst liest mancher Screenreader sie sofort vor.
 */
const loadAnnouncement = computed(() => {
  if (loading.value) return ''
  if (status.value === 'error' || !data.value) return 'Die Erläuterungen sind gerade nicht verfügbar.'
  if (!data.value.available) return data.value.unavailableReason ?? ''
  return 'Erläuterungen geladen.'
})
</script>

<template>
  <div class="mt-4">
    <p aria-live="polite" class="sr-only">{{ loadAnnouncement }}</p>

    <p v-if="loading" class="text-sm text-ink-muted">
      Die Erläuterungen werden geladen …
    </p>

    <p v-else-if="status === 'error' || !data" class="text-sm text-ink-secondary">
      Die Erläuterungen sind gerade nicht verfügbar.
    </p>

    <template v-else-if="!data.available">
      <p class="text-sm text-ink-secondary">{{ data.unavailableReason }}</p>
      <!-- Was wir nicht lesen können, kann ein Mensch lesen: Das Dokument
           wird auch dann verlinkt, wenn hier nichts steht. -->
      <p v-if="data.document" class="mt-3 text-xs text-ink-muted">
        <ExternalLink :href="data.document.url" class="text-accent-deep hover:underline">{{ data.document.label }}</ExternalLink>
      </p>
    </template>

    <template v-else>
      <!-- Der Vorbehalt steht ÜBER dem Text, die Quelle darunter: Das eine
           sagt, wie das Folgende zu lesen ist, das andere ist eine
           Bildunterschrift (dieselbe Regel wie im Vergleichsabschnitt). -->
      <p v-if="!data.labelled" class="max-w-prose text-sm text-ink-muted">
        Das Ressort gliedert diese Erläuterungen nicht selbst.<template v-if="data.hasSpecial">
          Wo die Erläuterungen zu den einzelnen Paragraphen beginnen, haben wir
          abgegrenzt.</template>
      </p>

      <div :class="data.labelled ? '' : 'mt-3'">
        <template v-for="(item, i) in visible" :key="i">
          <h4 v-if="item.kind === 'heading'" class="mt-5 text-sm font-semibold text-ink first:mt-0">
            {{ item.text }}
          </h4>
          <p v-else class="mt-3 max-w-prose leading-relaxed text-ink-secondary first:mt-0">
            {{ item.text }}
          </p>
        </template>
      </div>

      <!-- Natives <details> wie bei der Kurzbeschreibung und den
           Kontextzeilen des Vergleichs: ohne Hydration bedienbar, per
           Tastatur erreichbar, und die Seitensuche des Browsers klappt es
           auf, statt daran vorbeizulaufen. -->
      <details v-if="folded.length" class="group mt-4 border-t border-hairline">
        <summary
          class="-mx-3 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded px-3 py-3 text-sm font-medium text-ink hover:bg-hairline/40 [&::-webkit-details-marker]:hidden"
        >
          <span class="group-open:hidden">Weiterlesen – noch {{ foldedParagraphs }} {{ foldedParagraphs === 1 ? 'Absatz' : 'Absätze' }}</span>
          <span class="hidden group-open:inline">Weniger anzeigen</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div class="pb-2">
          <template v-for="(item, i) in folded" :key="i">
            <h4 v-if="item.kind === 'heading'" class="mt-5 text-sm font-semibold text-ink">
              {{ item.text }}
            </h4>
            <p v-else class="mt-3 max-w-prose leading-relaxed text-ink-secondary">
              {{ item.text }}
            </p>
          </template>
        </div>
      </details>

      <!-- Was hier bewusst NICHT steht, steht im Dokument: Tabellen und
           Abbildungen (wir drucken keine Bilddateipfade als Sätze) und der
           Besondere Teil, der zu den einzelnen Paragraphen gehört und nicht
           in eine Relevanzprüfung. Beides wird benannt, nicht verschwiegen.

           Seit die Passagen des Besonderen Teils unten an den §§ der
           Gegenüberstellung hängen (§12.30), ist „steht im Dokument selbst"
           nur noch die halbe Auskunft — und dort, wo sie danebensteht, wäre
           sie die teurere Hälfte: Sie schickt den Leser in ein PDF, während
           die Stelle zwei Bildschirme tiefer auf derselben Seite liegt. Ob
           sie das tut, sagt der Server (`paragraphsAtAnnex`), nicht der
           Abschnitt unten: Ein Satz, der nach dem Laden der
           Gegenüberstellung seine Aussage wechselt, wäre schlechter als
           einer, der von Anfang an stimmt.

           DER ZEIGER NIMMT NICHTS WEG, er kommt dazu — „und vollständig im
           Dokument selbst" bleibt in beiden Fassungen stehen. Das ist die
           Antwort auf den einen von 110 Entwürfen, bei dem es die Beilage
           gibt und sie sich nicht auslesen ließ (gemessen 19.09.2026,
           §12.30; mit gelesener Parlamentskopie wären es vier): Der
           Zeiger führt dann auf einen Abschnitt, der selbst sagt, woran es
           lag — und der Satz hat dem Leser das Dokument nicht weggenommen,
           um ihn dorthin zu schicken. Die zweite Hälfte trägt außerdem eine
           eigene Auskunft: Am Paragraphen steht, was sich einem Paragraphen
           zuordnen ließ; 16,3 % der Passagen finden keinen (§12.30). -->
      <p v-if="data.dropped || data.hasSpecial" class="mt-4 max-w-prose text-sm text-ink-muted">
        <template v-if="data.dropped">
          Tabellen und Abbildungen des Dokuments stehen hier nicht.
        </template>
        <template v-if="data.hasSpecial">
          <template v-if="data.paragraphsAtAnnex">
            Die Erläuterungen zu den einzelnen Paragraphen stehen unten bei der
            <a href="#gegenueberstellung" :class="LINK">Gegenüberstellung</a>, an
            dem Paragraphen, um den es jeweils geht — und vollständig im
            Dokument selbst.
          </template>
          <template v-else>
            Die Erläuterungen zu den einzelnen Paragraphen stehen im Dokument selbst.
          </template>
        </template>
      </p>

      <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>Quelle (CC BY 4.0, RIS):</span>
        <ExternalLink
          v-if="data.document"
          :href="data.document.url"
          class="text-accent-deep hover:underline"
        >{{ sourceLabel }}</ExternalLink>
      </p>
    </template>
  </div>
</template>
