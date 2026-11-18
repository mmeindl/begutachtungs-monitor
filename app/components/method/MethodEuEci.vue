<!--
  How the list „Jetzt unterstützbar: Europäische Bürgerinitiativen" on
  /eu-recht is read (step 5 of the EU cycle, 15.11.2026) — the „Methode"
  under it, in the style of `MethodEuFenster`. A `<dl>` in the caller's
  `prose-flow`, each term the answer itself (docs/decisions.md, „A method
  text is the credit line in full sentences").
-->
<script setup lang="ts">
import { EU_MEMBER_STATE_NAME_DE } from '#shared/utils/eu'
</script>

<template>
  <dl>
    <div>
      <dt>Die Liste kommt aus dem Register der Kommission</dt>
      <dd>
        Die Europäische Kommission führt das Register der Europäischen
        Bürgerinitiative. Der Monitor fragt die Liste des Registers einmal am
        Tag ab und zeigt jede Initiative, die das Register in der Sammlung
        führt, bis zum letzten Tag ihrer Sammlung.
      </dd>
    </div>
    <div>
      <dt>Der letzte Tag der Sammlung kann noch fehlen</dt>
      <dd>
        Diesen Tag nennt nur die Seite der einzelnen Initiative im Register;
        der Monitor liest sie nacheinander und mit Abstand. Ist ein Tag noch
        nicht gelesen oder konnte er nicht gelesen werden, bleibt die
        Initiative in der Liste und die Zeile sagt das.
      </dd>
    </div>
    <div>
      <dt>Gelesen werden nur Eckdaten</dt>
      <dd>
        Nummer, Titel, Stand, die Tage der Registrierung, der Sammlung, der
        Einreichung und der Antwort, die Zahl der Unterstützungen insgesamt
        und aus {{ EU_MEMBER_STATE_NAME_DE }}, die Links zum Sammelsystem und
        zur Antwort der Kommission. Namen der Organisatorinnen und
        Organisatoren und der Geldgeber, Logos und die Texte der Initiativen
        übernimmt der Monitor nicht; ihre Ziele stehen im Register, das jede
        Seite verlinkt.
      </dd>
    </div>
    <div>
      <dt>Gereiht nach dem Ende der Sammlung, nicht nach Unterstützungen</dt>
      <dd>
        Eine Reihung nach dieser Zahl läse sich als Urteil, welche Initiative
        es wert ist.
      </dd>
    </div>
    <div>
      <dt>Keine Schwelle je Mitgliedstaat</dt>
      <dd>
        Wie viele Unterstützungen ein Mitgliedstaat braucht und ob diese Zahl
        erreicht ist, steht nicht in den Antworten des Registers; der Monitor
        zeigt daher keine Schwelle.
      </dd>
    </div>
    <div>
      <dt>Antwortet das Register nicht, sagt die Liste das</dt>
      <dd>
        Antwortet es nicht oder anders als erwartet, verweist die Liste auf
        das Register, statt leer zu erscheinen.
      </dd>
    </div>
  </dl>
</template>
