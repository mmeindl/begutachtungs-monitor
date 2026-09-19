<script setup lang="ts">
import type { BgblOutcome } from '#shared/types'
import { formatDateDe } from '#shared/utils/format'

/**
 * Was aus einem Verordnungsentwurf geworden ist
 * (docs/architecture.md §12.32).
 *
 * Bis 19.09.2026 stand hier ein Satz: „Was danach kommt – Erlassung durch das
 * Ministerium und Kundmachung im Bundesgesetzblatt Teil II – verfolgt der
 * Monitor bisher nicht." Er war ehrlich und er war das Eingeständnis, dass
 * zwei Drittel des Korpus keine Rechenschaftsschicht hatten.
 *
 * DREI ZUSTÄNDE, UND ZWEI DAVON SIND NICHT DASSELBE. Gemessen (`pnpm
 * audit:bgbl2`, 291 Entwürfe): Zwischen Fristende und Kundmachung liegen im
 * Median 57 Tage, p90 196. Von den Entwürfen, deren Frist weniger als 30 Tage
 * zurückliegt, hat KEIN einziger schon eine Kundmachung; nach 181–365 Tagen
 * sind es 92,2 %. „Bisher keine Kundmachung" in Woche sechs wäre deshalb
 * keine Aussage über das Ressort, sondern über die Uhr — gelesen würde sie
 * aber als die erste. Also sagt die Zeile bis 180 Tage, dass es dauert, und
 * erst danach, dass nichts zu finden ist.
 *
 * UND AUCH DANN SAGT SIE ES ÜBER UNS, nicht über das Ressort. Der Abgleich
 * läuft über Titel, Ressort und Datum und findet 84,2 % — bei den Entwürfen,
 * deren Frist über ein Jahr her ist, 92,3 %. Der Rest sind teils Verordnungen,
 * die nie erlassen wurden (das ist die Auskunft, um die es geht), teils
 * unsere Fehlschläge. Beide sehen von hier gleich aus, also steht der Weg
 * zum Nachsehen daneben. Framing-Regel, CLAUDE.md: nie ein Vorwurf, immer ein
 * Verfahrensstand.
 */
const props = defineProps<{
  risId: string
  /**
   * Der Ausgang aus der Seitenantwort, wenn er dort schon stand.
   *
   * Der Normalfall seit 19.09.2026: Die Überschrift der Karte braucht ihn
   * ohnehin, also kommt er serverseitig mit — und dann darf dieser
   * Abschnitt keinen zweiten Abruf dafür starten. Null heißt „im Budget der
   * Seite nicht bestimmt", nicht „nicht kundgemacht"; dann holt er ihn
   * selbst nach, damit ein kalter Cache die Auskunft nur verzögert und
   * nicht verschluckt.
   */
  outcome?: BgblOutcome | null
}>()

const { data: fetched } = await useFetch<BgblOutcome>(() => `/api/ris-drafts/${props.risId}/kundmachung`, {
  lazy: true,
  server: false,
  immediate: !props.outcome,
})
const data = computed(() => props.outcome ?? fetched.value)
</script>

<template>
  <p v-if="data?.state === 'kundgemacht'" class="mt-3 max-w-prose text-sm text-ink-secondary">
    <span class="font-medium text-ink">Kundgemacht</span> als
    <ExternalLink
      v-if="data.url"
      :href="data.url"
      class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
    >{{ data.nummer }}</ExternalLink>
    <template v-else>{{ data.nummer }}</template>
    <template v-if="data.datum">, ausgegeben am {{ formatDateDe(data.datum) }}</template>
    <template v-if="data.days !== null"> – {{ data.days }} Tage nach Ende der Begutachtungsfrist</template>.
  </p>

  <!-- Die Zeile für „es dauert noch". Sie nennt die Zahl, weil ohne sie die
       Abwesenheit einer Kundmachung nach sechs Wochen wie ein Befund
       aussieht und keiner ist. -->
  <p v-else-if="data?.state === 'ausstehend'" class="mt-3 max-w-prose text-sm text-ink-secondary">
    Im Bundesgesetzblatt II steht dazu bisher keine Kundmachung. Zwischen
    Fristende und Kundmachung liegen üblicherweise rund zwei Monate.
  </p>

  <p v-else-if="data?.state === 'keine'" class="mt-3 max-w-prose text-sm text-ink-secondary">
    Im Bundesgesetzblatt II ist dazu keine Kundmachung zu finden. Gesucht wird
    über Titel, Ressort und Datum; das findet nicht jede –
    <ExternalLink
      href="https://www.ris.bka.gv.at/Bgbl-Auth/"
      class="font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
    >im Bundesgesetzblatt nachsehen</ExternalLink>.
  </p>
</template>
