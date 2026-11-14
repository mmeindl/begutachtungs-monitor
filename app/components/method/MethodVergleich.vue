<!--
  How the comparison after the Begutachtung works — the „Methode" of
  `LawDiffSection`, opened under its credit line (14.11.2026; until then
  /so-funktionierts#vergleich).

  Paragraphs only, without a wrapper: the caller's `prose-flow` styles its
  direct children. „redaktionell" is not defined here; its pill opens the
  definition at the row (`TermNote`, `app/utils/terms.ts`).
-->
<template>
  <p>
    Nach der Begutachtung vergleichen wir die Texte selbst, Schritt für
    Schritt: den Entwurf mit der Regierungsvorlage, im Parlament die
    Regierungsvorlage mit der Fassung des Ausschusses und diese mit der
    des Plenums – so steht bei jedem Vergleich fest, wer geändert hat.
    Beim Bundesgesetzblatt halten wir den ganzen Weg gegeneinander, vom
    Entwurf bis zum kundgemachten Gesetz. Ein Gesetz, das ein bestehendes ändert,
    besteht aus nummerierten Änderungsanordnungen (Z&nbsp;1, Z&nbsp;2&nbsp;…) – verglichen
    wird dann Anordnung für Anordnung. Ein neues Gesetz vergleichen wir
    Paragraph für Paragraph.
  </p>
  <p>
    Wie viel die Regierungsvorlage am Entwurf geändert hat, zählen wir an
    den Einheiten des Entwurfs – Änderungsanordnungen, auf der Seite kurz
    „Änderungen“, oder Paragraphen: wie viele davon sie umgeschrieben oder
    gestrichen hat. Was sie neu hinzufügt, zählt nicht mit, redaktionelle
    Änderungen auch nicht.
  </p>
  <p>
    Verglichen wird dieser Anteil mit den Entwürfen einer abgeschlossenen
    Gesetzgebungsperiode – welcher, steht am Balken; „üblich“ heißt die
    mittlere Hälfte von ihnen, ein Viertel lag darunter, ein Viertel
    darüber. Kam die Vorlage noch während der Begutachtung, fehlt dieser
    Vergleich: Die Spanne wurde an Vorlagen gemessen, die danach kamen.
  </p>
  <p>
    Auch die Erläuterungen beider Fassungen halten wir gegeneinander.
    Gezählt werden nur Begründungen, die in beiden Fassungen zur selben
    Änderung stehen, und davon die, in denen das Ressort etwas geändert
    hat – redaktionelle Änderungen wie oben nicht, und auch keine, die nur
    Satzzeichen, Leerzeichen oder Bindestriche betreffen. Ob
    eine Änderung auf eine Stellungnahme zurückgeht, sagt keiner der
    beiden Vergleiche.
  </p>
</template>
