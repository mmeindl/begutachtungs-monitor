<!--
  How the comparisons after a Land's Begutachtung work — the „Methode" of
  `LandLawDiffSection` from the draft to the Vorlage and from the
  Vorlage on (15.11.2026). The Land's counterpart of `MethodVergleich`.

  Paragraphs only, without a wrapper: the caller's `prose-flow` styles its
  direct children. Which text the Vorlage is held against after it — the
  committee's report or the Kundmachung — and, where not the report, whose
  gap that is, is the Land's configuration (`LAND_COMMITTEE_TEXT`), the same
  fact that decides the pair in `texts/stations.ts`.
-->
<script setup lang="ts">
import type { LandCode } from '#shared/types'
import { landCommitteeSentenceDe } from '#shared/utils/laender'

const props = defineProps<{ land: LandCode }>()

const committeeSentence = computed(() => landCommitteeSentenceDe(props.land))
</script>

<template>
  <p>
    Den Entwurf lesen wir aus dem PDF des Landes, Regierungsvorlage und
    Ausschussbericht aus den PDFs, die Landtag oder Land veröffentlichen,
    das kundgemachte Gesetz aus dem Landesgesetzblatt im
    Rechtsinformationssystem. Verglichen wird wie beim Bund: Ein Gesetz, das ein bestehendes ändert,
    Anordnung für Anordnung, ein neues Gesetz Paragraph für Paragraph.
    Anführungszeichen und Trennstriche am Zeilenende zählen nicht als
    Änderung: PDF und Gesetzblatt setzen sie verschieden.
  </p>
  <p>
    {{ committeeSentence }}
    Haben zwei Texte keinen einzigen Teil gemeinsam, zeigen wir keinen
    Vergleich, statt alles als neu zu melden.
  </p>
  <p>
    Die Begründungen vergleichen wir, wo beide Fassungen Erläuterungen zu
    denselben Bestimmungen enthalten, und zeigen sie an der Änderung, wenn
    das Land sie geändert hat. Ob eine Änderung auf eine Stellungnahme
    zurückgeht, sagt keiner der beiden Vergleiche.
  </p>
</template>
