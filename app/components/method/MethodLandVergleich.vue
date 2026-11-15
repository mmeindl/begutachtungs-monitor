<!--
  How the comparisons after a Land's Begutachtung work — the „Methode" of
  the Vorlage's frame („Umgeschrieben oder gestrichen", `LandStationSections`)
  and of `LandLawDiffSection` from the draft to the Vorlage and from the
  Vorlage on (15.11.2026). The Land's counterpart of `MethodVergleich`,
  without its period range, which is measured on the Bund's drafts only.

  Paragraphs only, without a wrapper: the caller's `prose-flow` styles its
  direct children. Which text the Vorlage is held against after it — the
  committee's report or the Kundmachung — is the Land's configuration
  (`LAND_REPORT_HAS_TEXT`), the same fact that decides the pair in
  `texts/stations.ts`.
-->
<script setup lang="ts">
import type { LandCode } from '#shared/types'
import { LAND_REPORT_HAS_TEXT } from '#shared/utils/laender'

const props = defineProps<{ land: LandCode }>()

const reportHasText = computed(() => Boolean(LAND_REPORT_HAS_TEXT[props.land]))
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
    <template v-if="reportHasText">
      Was der Ausschuss geändert hat, zeigen wir aus seinem Bericht: Er
      enthält den Gesetzestext.
    </template>
    <template v-else>
      Was der Ausschuss geändert hat, zeigen wir hier nicht: Den Text des
      Ausschusses haben wir für dieses Land nicht. Wir vergleichen
      die Regierungsvorlage mit dem kundgemachten Gesetz; darin steckt dann
      auch die redaktionelle Bearbeitung für die Kundmachung.
    </template>
    Haben zwei Texte keinen einzigen Teil gemeinsam, zeigen wir keinen
    Vergleich, statt alles als neu zu melden.
  </p>
  <p>
    „Umgeschrieben oder gestrichen“ zählen wir an den Einheiten des
    Entwurfs: wie viele davon die Regierungsvorlage umgeschrieben oder
    gestrichen hat. Was sie neu hinzufügt, zählt nicht mit, redaktionelle
    Änderungen auch nicht. Eine Spanne des Üblichen zeigen wir bei den
    Ländern nicht: Sie ist nur an Entwürfen des Bundes gemessen. Die
    Begründungen vergleichen wir, wo beide Fassungen Erläuterungen zu
    denselben Bestimmungen enthalten. Ob eine Änderung auf eine
    Stellungnahme zurückgeht, sagt keiner der beiden Vergleiche.
  </p>
</template>
