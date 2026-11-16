<!--
  How the monitor reads whether a draft carries out EU law, which act and by
  when — the „Methode" under the EU fact of a draft (`EntwurfFrame`), the
  map /eu-recht and an act's page (14.11.2026; until then
  /so-funktionierts#eu-recht).

  Paragraphs only, without a wrapper: the caller's `prose-flow` styles its
  direct children. The measured shares (04.11.2026) and what each Land's
  documents allow are coverage facts, not method: they stand on /datenlage.
-->
<template>
  <p>
    Fast jedem Entwurf liegt ein Vorblatt mit der wirkungsorientierten
    Folgenabschätzung bei. Unter der Überschrift „Verhältnis zu den
    Rechtsvorschriften der Europäischen Union“ steht dort einer von wenigen
    festen Sätzen, die das Werkzeug der Ministerien vorgibt: etwa „Das
    Vorhaben dient der Umsetzung einer EU-Richtlinie“, „Das Vorhaben enthält
    die erforderlichen flankierenden Regelungen zu Verordnungen der
    Europäischen Union“ oder „Die vorgesehenen Regelungen fallen nicht in den
    Anwendungsbereich des Rechts der Europäischen Union“. Diesen Satz lesen
    wir aus dem PDF des Vorblatts – im RIS liegt es sonst nur als Bild vor. Er
    entscheidet, ob bei einem Entwurf „Setzt EU-Recht um“ oder „Begleitet
    EU-Verordnungen“ steht. Sagt das Vorblatt, der Entwurf gehe über eine
    verpflichtende Umsetzung hinaus, zitieren wir den Satz wörtlich.
    Widersprechen sich zwei Vorblätter eines Entwurfs, zeigen wir nichts,
    solange der Gesetzestext keinen Rechtsakt nennt.
  </p>
  <p>
    Welcher Rechtsakt gemeint ist, sagt das Vorblatt fast nie. Den Namen lesen
    wir aus dem Gesetzestext des Entwurfs – aus dem Umsetzungshinweis, etwa
    „Mit diesem Bundesgesetz wird die Richtlinie (EU) 2024/1069 … umgesetzt“ –,
    sonst aus seinem Titel. Kurznamen wie „IE-Richtlinie“ lösen wir nicht auf;
    dann bleibt der Akt ungenannt.
  </p>
  <p>
    Bis wann eine Richtlinie umzusetzen war, steht in EUR-Lex, der
    Rechtsdatenbank der Europäischen Union. Für manche Richtlinien nennt
    EUR-Lex mehrere Daten, ohne zu sagen, welches die allgemeine Frist ist;
    wir nennen das späteste als Umsetzungsfrist und die übrigen in einer
    Fußnote als Fristen für einzelne Bestimmungen. Setzt ein Entwurf mehrere
    Richtlinien um, trägt jedes Datum auf dem Zeitstrahl eine Hochzahl, und
    dieselbe Hochzahl steht im Satz bei seiner Richtlinie. Verordnungen gelten
    unmittelbar und haben keine Umsetzungsfrist.
  </p>
  <p>
    Bei einem Landesentwurf lesen wir dieselbe Aussage aus den Dokumenten des
    Landes: Ein Werkzeug mit festen Sätzen haben die Länder nicht, aber die
    meisten sagen es an eigener Stelle, und die Akte lesen wir sonst aus dem
    Gesetzestext. Wo welches Land es sagt und was der Monitor davon lesen
    kann, steht unter
    <NuxtLink to="/datenlage" class="link-inline">Datenlage</NuxtLink>.
  </p>
  <p>
    Was die Seite nicht sagt: ob ein Ministerium zu spät dran war. Sie stellt
    zwei Daten nebeneinander, die Umsetzungsfrist und den Beginn der
    Begutachtung laut RIS, und überlässt die Rechnung den Lesenden – ein
    Entwurf kann der zweite Schritt einer Umsetzung sein, und welches Datum
    die eigentliche Frist ist, sagt EUR-Lex nicht immer. Eine Novelle
    wiederholt oft den ganzen Umsetzungshinweis samt Richtlinien, die vor
    Jahren umgesetzt wurden. Solche Akte nennen wir, aber ohne Frist: Eine
    Frist steht nur bei einem Akt, den das geltende Bundesrecht (beim Land:
    das Landesrecht) am ersten Tag der Begutachtung noch nirgends umsetzt. Zu
    einer solchen Frist zeichnen wir einen Zeitstrahl: die Umsetzungsfrist als
    Strich, die Begutachtung als Band, der Punkt dort, wo das Verfahren heute
    steht – auf welcher Seite der Frist der Entwurf kam und wie weit davon,
    sieht man dann, ohne dass wir es sagen. Woher die Daten stammen und unter
    welchen Bedingungen, steht
    <NuxtLink to="/quellen#eurlex" class="link-inline">unter Quellen &amp; Lizenzen</NuxtLink>.
  </p>
  <p>
    Die Seite
    <NuxtLink to="/eu-recht" class="link-inline">EU-Recht</NuxtLink>
    liest nur die Begutachtungen, die in der laufenden Gesetzgebungsperiode
    begonnen haben, und nur die, die der Monitor kennt. Dass ein Land dort
    keinen Entwurf zu einem Rechtsakt hat, heißt nicht, dass es ihn nicht
    umsetzt.
  </p>
</template>
