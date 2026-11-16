<!--
  How the list „Jetzt unterstützbar: Europäische Bürgerinitiativen" on
  /eu-recht is read (step 5 of the EU cycle, 15.11.2026) — the „Methode"
  under it, in the style of `MethodEuFenster`. Paragraphs only, without a
  wrapper: the caller's `prose-flow` styles its direct children.
-->
<script setup lang="ts">
import { EU_MEMBER_STATE_NAME_DE } from '#shared/utils/eu'
</script>

<template>
  <p>
    Die Liste kommt aus dem Register der Europäischen Bürgerinitiative, das
    die Europäische Kommission führt. Der Monitor fragt die Liste des
    Registers einmal am Tag ab und zeigt jede Initiative, die das Register in
    der Sammlung führt, bis zum letzten Tag ihrer Sammlung. Diesen Tag nennt
    nur die Seite der einzelnen Initiative im Register; der Monitor liest sie
    nacheinander und mit Abstand. Ist ein Tag noch nicht gelesen oder konnte
    er nicht gelesen werden, bleibt die Initiative in der Liste und die Zeile
    sagt das.
  </p>
  <p>
    Gelesen werden nur Nummer, Titel, Stand, die Tage der Registrierung, der
    Sammlung, der Einreichung und der Antwort, die Zahl der Unterstützungen
    insgesamt und aus {{ EU_MEMBER_STATE_NAME_DE }}, die Links zum Sammelsystem und zur Antwort
    der Kommission. Namen der Organisatorinnen und Organisatoren und der
    Geldgeber, Logos und die Texte der Initiativen übernimmt der Monitor
    nicht; ihre Ziele stehen im Register, das jede Seite verlinkt.
  </p>
  <p>
    Die Reihenfolge ist die der Tage, an denen die Sammlung endet, nicht die
    der Unterstützungen: Eine Reihung nach dieser Zahl läse sich als Urteil,
    welche Initiative es wert ist. Wie viele Unterstützungen ein
    Mitgliedstaat braucht und ob diese Zahl erreicht ist, steht nicht in den
    Antworten des Registers; der Monitor zeigt daher keine Schwelle. Antwortet
    das Register nicht oder anders als erwartet, sagt die Liste das und
    verweist auf das Register, statt leer zu erscheinen.
  </p>
</template>
