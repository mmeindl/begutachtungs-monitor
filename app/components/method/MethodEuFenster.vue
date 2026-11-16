<!--
  How the list „Jetzt offen: Rückmeldung an die Kommission" on /eu-recht is
  read (step 3 of the EU cycle, 15.11.2026) — the „Methode" under it, in the
  style of `MethodEuUmsetzung`. Paragraphs only, without a wrapper: the
  caller's `prose-flow` styles its direct children.
-->
<template>
  <p>
    Die Liste kommt aus dem Portal „Ihre Meinung zählt“ der Europäischen
    Kommission. Das Portal führt jedes Vorhaben, zu dem die Kommission gerade
    Rückmeldungen entgegennimmt: Sondierungen und öffentliche Konsultationen,
    bevor sie etwas vorschlägt, Rückmeldungen zu einem Vorschlag, den sie
    angenommen hat, und Entwürfe ihrer eigenen delegierten Rechtsakte und
    Durchführungsrechtsakte. Der Monitor fragt diese Liste einmal am Tag ab und
    zeigt jede Frist bis zu ihrem letzten Tag. Hat ein Vorhaben zwei Fristen
    zugleich, etwa eine Sondierung und eine öffentliche Konsultation, steht es
    zweimal da, einmal je Frist.
  </p>
  <p>
    Gelesen werden nur Nummer, Titel, Stadium, die vorgesehene Art des
    Rechtsakts und die Tage, an denen eine Frist beginnt und endet. Den Titel
    zeigt der Monitor auf Deutsch, wo das Portal ihn übersetzt hat, sonst auf
    Englisch, und sagt das dazu. Wie viele Rückmeldungen schon eingegangen
    sind, steht nicht in der Liste: Eine solche Zahl neben einer offenen Frist
    läse sich als Rangfolge, wo sich das Mitreden lohnt. Auf der Seite eines
    Vorhabens steht sie, für jede Frist für sich.
  </p>
  <p>
    Das Portal hat keine dokumentierte Schnittstelle; der Monitor liest, was
    seine Seiten selbst laden. Antwortet es nicht oder anders als erwartet,
    sagt die Liste das und verweist auf das Portal, statt leer zu erscheinen.
    Eine Rückmeldung selbst gibt man im Portal ab; der Monitor nimmt keine
    entgegen und liest keine.
  </p>
</template>
