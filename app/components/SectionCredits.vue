<script setup lang="ts">
/**
 * Die Quellenzeile am Fuß eines Vergleichsabschnitts: fremde Dokumente,
 * Lizenz — und zuletzt, dass die Markierung von uns kommt.
 *
 * Warum unten: Eine Quellenangabe steht unter der Tabelle, nicht über ihr
 * (Manu, 17.09.2026) — sie wird beim oder nach dem Lesen nachgeschlagen, nie
 * vorher. Sie ist seit 18.09.2026 das Einzige, was hier unten steht: Eine
 * Legende für „redaktionell" stand kurz daneben und ist wieder weg — eine
 * Vokabel, die auf jeder Seite gleich lautet, gehört auf die Seite, die sie
 * erklärt, nicht unter jeden Vergleich.
 *
 * „Markierung" rendert das Bauteil selbst und immer als Letztes: Erst alles
 * Fremde, dann das Eigene — und der Satz ist in beiden Abschnitten derselbe,
 * weil ihn keiner von beiden schreibt. Es ist die Frage, die ein rot-grün
 * markierter Ministeriumstext aufwirft: Wer hat markiert?
 */
</script>

<template>
  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
    <slot />
    <span>Markierung: Begutachtungs-Monitor</span>
  </div>
</template>
