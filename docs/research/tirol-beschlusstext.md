# Tirol: Lässt sich der Text vergleichen, den der Landtag beschlossen hat?

**Stand 15.11.2026.** Der Tiroler Landtag führt bei einem Gegenstand neben
der Regierungsvorlage oft ein Dokument „Gesetz nach Beschlussfassung im
Landtag am …". Der Monitor liest es nicht: Er vergleicht die Vorlage mit dem
kundgemachten Gesetz, und darin stecken die Änderungen des Landtags und die
redaktionelle Bearbeitung für die Kundmachung ununterscheidbar. Gefragt war:
Ist der beschlossene Text lesbar, und paart er sich mit der Vorlage?

## Wie oft es ihn gibt

Aus den 432 Seiten des Landtags im Cache (`.harness-cache/tirol-tgu/pages`):
52 Gegenstände des Typs Regierungsvorlage. 25 davon führen ein Dokument
„Regierungsvorlage", und 20 dieser 25 den beschlossenen Text; 38 der 52
führen „Bericht und Antrag" des Ausschusses.

## Messung

Fünf Gegenstände, je Vorlage und beschlossener Text über den Leser der Seite
(`tirolDocumentBytes`) geholt, elf Dokumente, im Abstand von vier Sekunden;
gelesen und verglichen mit den Funktionen der Seite (`pagesOfBytes`,
`landDraftUnits`, `diffLandDraft`). Zwei der fünf haben einen
Abänderungsantrag im Verlauf, drei keinen.

| Gegenstand | Einheiten Vorlage / Beschluss | unverändert | geändert | gestrichen | was die Änderungen sind |
|---|---|---|---|---|---|
| 2025-5 (mit Abänderungsantrag) | 30 / 28 | 7 | 21 | 2 | fast alle Lesefehler: Das Dokument ist ein Scan |
| 2026-131 (mit Abänderungsantrag) | 38 / 38 | 37 | 1 | 0 | eine echte Änderung |
| 2026-135 | 88 / 88 | 85 | 3 | 0 | keine echte: zweimal fehlt Text auf einer Seite, einmal die Beurkundungsformel |
| 2026-130 | 5 / 5 | 5 | 0 | 0 | – |
| 2026-563 | 80 / 80 | 79 | 1 | 0 | keine echte: die Beurkundungsformel |

**Lesbar und gepaart: vier von fünf.** Bei den vier Dokumenten von 2026
findet der Leser Gesetzestext, und jede Einheit der Vorlage hat ihr
Gegenstück. Die eine echte Änderung (2026-131, Z 22: ein eingefügter
Halbsatz) steht bei dem Gegenstand, dessen Verlauf einen Abänderungsantrag
führt.

## Was vor einem Vergleich zu lösen ist

1. **Ein Scan ist kein Text.** 2025-5 ist als Bild veröffentlicht, sein Text
   ist Texterkennung: „Wettuntemehmer", „LGB1.", „JTort", „5.1 m § 14" für
   „5. Im § 14". Der Vergleich meldet 21 von 30 Einheiten als geändert. Ob
   der Landtag hier etwas geändert hat, lässt sich daraus nicht lesen. Wie
   viele der 20 Dokumente Scans sind, ist nicht gezählt (eines von fünf
   gelesenen, das einzige von 2025). Ein Vergleich braucht eine Prüfung, die
   ein solches Dokument erkennt und als nicht lesbar ausweist.
2. **Die Beurkundungsformel.** Der beschlossene Text endet mit „Das
   verfassungsmäßige Zustandekommen wird beurkundet."; der Leser hängt sie
   an den letzten Paragraphen (2026-135 § 88, 2026-563 § 80). Zwei von
   vier lesbaren Dokumenten zeigen deshalb eine Änderung, die keine ist.
3. **Der Leser verliert Text nach „nach dem".** In 2026-135 fehlt in § 7 des
   beschlossenen Texts und in § 86 der Vorlage je eine Passage, die nach
   einem Zeilenumbruch mit „4. Unterabschnitt …" und „2. Hauptstück …"
   weitergeht: Die Zeile wird offenbar als Gliederungsüberschrift gelesen und
   der Rest des Absatzes fällt weg. Das ist ein Fehler des PDF-Lesers, nicht
   des Dokuments, und er trifft die Vorlage auch in den Vergleichen, die die
   Seite heute zeigt. Nicht untersucht: wie oft, und ob in anderen Ländern.

## Der Bericht des Ausschusses

Ein „Bericht und Antrag" gelesen (2025-5): eine Seite Begründung und der
Antrag auf Beschluss, kein Gesetzestext. Für Tirol spricht das für „Bericht
ohne Gesetzestext" wie in Salzburg; ein Bericht ist dafür zu wenig. Was der
Ausschuss geändert hat, stünde im beschlossenen Text, nicht im Bericht.

## Nicht gemessen

- Der beschlossene Text gegen das kundgemachte Gesetz: ob dort nur noch die
  redaktionelle Bearbeitung übrig bleibt.
- Dokumente mit Anlagen („… – Anlage 1", bei zwei der 20).
- Jahrgänge vor 2025.
