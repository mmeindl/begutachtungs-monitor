<!--
  Where „Was ändert der Entwurf?" comes from and how its two columns are
  checked — the „Methode" of `TextComparisonSection`, opened under its credit
  line (14.11.2026; until then /so-funktionierts#gegenueberstellung).

  Paragraphs only, without a wrapper: the caller's `prose-flow` styles its
  direct children. „redaktionell" and „nicht geprüft" are not defined here;
  their pills open the definition at the row (`TermNote`,
  `app/utils/terms.ts`). „nicht gezeigt" is: its only pill is a count in the
  law's header button, and a control is never also a disclosure. How the
  Lesefassung is made opens at the Lesefassung (`MethodLesefassung`).
-->
<template>
  <p>
    Zu den meisten Entwürfen legt das Ministerium eine Textgegenüberstellung
    bei: links die geltende Fassung, rechts die vorgeschlagene, in der Form,
    die ein Rundschreiben des Bundeskanzleramts vom 27.03.2002 vorschreibt.
    Der Text hier stammt aus diesem Dokument des Ministeriums, Wort für Wort.
    Verlangt wird die Gegenüberstellung, wo ein Entwurf geltendes Recht ändert
    (Rundschreiben des Verfassungsdienstes vom 10.12.2015); ein Entwurf, der
    ein neues Gesetz schafft, hat nichts gegenüberzustellen.
  </p>
  <p>
    Von uns stammt die Markierung: Wir vergleichen die beiden Spalten Wort für
    Wort und heben hervor, was wegfällt und was dazukommt. Dieselbe Markierung
    und dieselben Abzeichen trägt der Vergleich nach der Begutachtung, Entwurf
    gegen Regierungsvorlage; wie er zählt, sagt dort seine „Methode“.
  </p>
  <p>
    Die linke Spalte behauptet, das geltende Recht zu sein – und das lässt
    sich nachsehen. Wir halten sie gegen den Text im RIS Bundesrecht, und zwar
    zum Beginn der Begutachtungsfrist: das ist der Stand, den das Ministerium
    beim Schreiben vor sich hatte.
  </p>
  <p>
    Auch die rechte Spalte prüfen wir: Was dort als neu markiert ist, darf im
    geltenden Paragraphen nicht schon stehen – sonst fehlt links Text, und der
    Entwurf wirkt umfangreicher, als er ist. Ausgenommen ist ein Wortlaut, den
    eine Anweisung des Entwurfs genau so an diese Stelle einfügt, auch wenn er
    anderswo im Paragraphen schon steht. Und es muss in den
    Novellierungsanordnungen vorkommen, die der Entwurf für diesen Paragraphen
    trifft.
  </p>
  <p>
    Bestätigte Paragraphen bleiben ohne Hinweis, ebenso neu eingefügte: Sie
    haben keinen geltenden Text und brauchen keine Prüfung. Geht eine der drei
    Prüfungen nicht auf, zeigen wir keinen Vergleich statt eines falschen: Der
    Kopf des Gesetzes zählt den Paragraphen als „nicht gezeigt“, und an seiner
    Stelle steht, welche Prüfung es war. Was sich dort ändert, sagt die
    Beilage des Ministeriums, die unter der Gegenüberstellung verlinkt ist.
  </p>
  <p>
    Bei einem Teil der Entwürfe veröffentlicht das RIS die Beilage nur als
    Bild. Dann lesen wir das PDF des Ministeriums und erschließen aus dem
    Seitenlayout, welche Zeile links zu welcher Zeile rechts gehört. Der Text
    ist auch dort der des Ministeriums – die Zuordnung ist unsere, und sie
    kann danebenliegen; die Quellenzeile nennt sie dann als unsere. Ein „nicht
    gezeigt“ kann dort auch an unserer Zuordnung liegen.
  </p>
</template>
