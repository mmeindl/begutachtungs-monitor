<script setup lang="ts">
import type { BegutSearchHit } from '#shared/types'

/**
 * The evidence under a full-text hit — the Fundstelle plus the sentence the
 * word stands in (docs/architecture.md §12.31).
 *
 * Its own component, because the evidence is the reason a row is there: it
 * belongs to the row, not to the page, and in a mixed list it stands beside
 * rows that have none.
 *
 * NO FRAME, NO RULE: it already stands inside the hit's row, and a frame
 * inside a frame turns a quotation into a second component.
 */
defineProps<{
  /**
   * Missing, nothing stands here. The mixed list on `/entwuerfe` carries rows
   * with and without a full-text hit, and the decision „does this row have
   * evidence" belongs in the component that knows the evidence — not in a
   * `v-if` at every call site.
   */
  hit?: Pick<BegutSearchHit, 'place' | 'designation' | 'snippet' | 'ministryOnly'> | null
}>()
</script>

<template>
  <!-- TWO KINDS OF HIT, TWO WEIGHTS. The substantive one stands in
       `ink-secondary`, the mere mention of a Ressort one step quieter in
       `ink-muted`: it is checked information, but information that weakens
       the hit — it says why RIS delivered the record, not what it is
       about. -->
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
  <!-- NO PLACE DOES NOT MEAN NO HIT — but the sentence about it has to be
       right. The first version said „steht in einer Anlage oder einem PDF",
       and that was guessed: for the Industriestrompreisgesetz „Klimaschutz"
       stands in NO document, the Erläuterungen write „Klima-, Umweltschutz-
       und Energiebeihilfen", and RIS matches on word components. So the line
       says what was checked and leaves the inference to the reader. Since
       21.09.2026 the PDF is read too, not only the XML — the case has been
       rarer since. -->
  <p v-else-if="hit" class="mt-1 text-sm text-ink-muted">
    Wörtlich steht das Wort in keinem der Dokumente, die hier gelesen werden.
    Das RIS findet auch Wortbestandteile und durchsucht Anlagen.
  </p>
</template>
