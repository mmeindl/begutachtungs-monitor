<!--
  How the comparisons after a Land's Begutachtung work — the „Methode" of
  `LandLawDiffSection` from the draft to the Vorlage and from the
  Vorlage on (15.11.2026). The Land's counterpart of `MethodVergleich`.

  A `<dl>` in the caller's `prose-flow`, each term the answer itself
  (docs/decisions.md, „A method text is the credit line in full sentences").
  Which text the Vorlage is held against after it — the committee's report or
  the Kundmachung — and, where not the report, whose gap that is, is the
  Land's configuration (`LAND_COMMITTEE_TEXT`), the same fact that decides
  the pair in `texts/stations.ts`.
-->
<script setup lang="ts">
import type { LandCode } from '#shared/types'
import { landCommitteeSentenceDe } from '#shared/utils/laender'

const props = defineProps<{ land: LandCode }>()

const committeeSentence = computed(() => landCommitteeSentenceDe(props.land))
</script>

<template>
  <dl>
    <div>
      <dt>Die Texte kommen von Land, Landtag und Landesgesetzblatt</dt>
      <dd>
        Den Entwurf lesen wir aus dem PDF des Landes, Regierungsvorlage und
        Ausschussbericht aus den PDFs, die Landtag oder Land veröffentlichen,
        das kundgemachte Gesetz aus dem Landesgesetzblatt im
        Rechtsinformationssystem.
      </dd>
    </div>
    <div>
      <dt>Verglichen wird wie beim Bund</dt>
      <dd>
        Ein Gesetz, das ein bestehendes ändert, Anordnung für Anordnung, ein
        neues Gesetz Paragraph für Paragraph. Anführungszeichen und
        Trennstriche am Zeilenende zählen nicht als Änderung: PDF und
        Gesetzblatt setzen sie verschieden.
      </dd>
    </div>
    <div>
      <dt>Die Fassung des Ausschusses</dt>
      <dd>{{ committeeSentence }}</dd>
    </div>
    <div>
      <dt>Lieber kein Vergleich als ein falscher</dt>
      <dd>
        Haben zwei Texte keinen einzigen Teil gemeinsam, zeigen wir keinen
        Vergleich, statt alles als neu zu melden. Ebenso bei einer Anordnung,
        deren angekündigten Text – eine Zeile einer Tabelle oder des
        Inhaltsverzeichnisses – wir in einem der beiden Dokumente nicht an
        seiner Stelle finden: Sie steht dann als „nicht gezeigt“ bei ihrem
        Gesetz.
      </dd>
    </div>
    <div>
      <dt>Auch die Begründungen vergleichen wir</dt>
      <dd>
        Wo beide Fassungen Erläuterungen zu denselben Bestimmungen enthalten.
        Gezeigt wird eine Begründung an der Änderung, wenn das Land sie
        geändert hat.
      </dd>
    </div>
    <div>
      <dt>Warum sich etwas geändert hat, sagt kein Vergleich</dt>
      <dd>
        Ob eine Änderung auf eine Stellungnahme zurückgeht, sagt keiner der
        beiden Vergleiche.
      </dd>
    </div>
  </dl>
</template>
