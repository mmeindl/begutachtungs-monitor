<script setup lang="ts">
import type { BegutSearchHit } from '#shared/types'

/**
 * Der Beleg unter einem Volltext-Treffer — die Fundstelle plus der Satz,
 * in dem das Wort steht (docs/architecture.md §12.31).
 *
 * Eigene Komponente, weil der Beleg der Grund ist, warum eine Zeile
 * dasteht: Er gehört zur Zeile, nicht zur Seite, und er steht in einer
 * gemischten Liste neben Zeilen, die keinen haben.
 *
 * KEIN RAHMEN, KEINE LINIE: Er steht schon in der Zeile des Treffers, und
 * ein Rahmen im Rahmen macht aus einem Zitat ein zweites Bauteil.
 */
defineProps<{
  /**
   * Fehlt er, steht hier nichts. Die gemischte Liste auf `/entwuerfe` führt
   * Zeilen mit und ohne Volltext-Treffer, und die Entscheidung „hat diese
   * Zeile einen Beleg" gehört in die Komponente, die den Beleg kennt — nicht
   * in ein `v-if` an jeder Aufrufstelle.
   */
  hit?: Pick<BegutSearchHit, 'place' | 'designation' | 'snippet' | 'ministryOnly'> | null
}>()
</script>

<template>
  <!-- ZWEI FUNDSTELLEN, ZWEI GEWICHTE. Der Sachtreffer steht in
       `ink-secondary`, die bloße Ressortnennung eine Stufe leiser in
       `ink-muted`: Sie ist eine geprüfte Auskunft, aber eine entkräftende —
       sie sagt, warum das RIS den Satz geliefert hat, nicht wovon er
       handelt. -->
  <p
    v-if="hit?.snippet"
    class="mt-1 text-sm leading-relaxed"
    :class="hit.ministryOnly ? 'text-ink-muted' : 'text-ink-secondary'"
  >
    <span class="font-medium" :class="hit.ministryOnly ? 'text-ink-secondary' : 'text-ink'">
      <template v-if="hit.ministryOnly">Nur im Ressortnamen, </template>{{ hit.place
      }}<template v-if="hit.designation">, {{ hit.designation }}</template>:
    </span>
    {{ ' ' }}
    <span class="hyphens-auto">
      {{ hit.snippet.before
      }}<mark class="bg-mark text-ink">{{ hit.snippet.match }}</mark>{{ hit.snippet.after }}
    </span>
  </p>
  <!-- KEINE STELLE HEISST NICHT KEIN TREFFER — aber der Satz dazu muss
       stimmen. Die erste Fassung sagte „steht in einer Anlage oder einem
       PDF", und das war geraten: Beim Industriestrompreisgesetz steht
       „Klimaschutz" in KEINEM Dokument, die Erläuterungen schreiben
       „Klima-, Umweltschutz- und Energiebeihilfen", und das RIS trifft über
       die Wortbestandteile. Also sagt die Zeile, was geprüft wurde, und
       überlässt den Schluss dem Leser. Seit 21.09.2026 wird dafür auch das
       PDF gelesen, nicht nur das XML — der Fall ist seither seltener. -->
  <p v-else-if="hit" class="mt-1 text-sm text-ink-muted">
    Wörtlich steht das Wort in keinem der Dokumente, die hier gelesen werden.
    Das RIS findet auch Wortbestandteile und durchsucht Anlagen.
  </p>
</template>
