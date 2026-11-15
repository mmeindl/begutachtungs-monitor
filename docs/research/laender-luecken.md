# Länder: wo die Lücken sind, und was sie schließen würde

**Stand 23.10.2026**, mit Nachträgen bis 30.10.2026 (die vier weiteren Länder,
Abschnitt 7) und der Übersicht aller neun vom 13.11.2026. Forschungsnotiz zu einer Frage: Wie weit lässt sich ein
Landesentwurf auf denselben Ebenen verfolgen wie ein Ministerialentwurf des
Bundes, und was fehlt bei den Ländern, damit es geht? Gemessen, nicht
geschätzt; wo eine Zahl fehlt, steht das dabei. Die Zahlen sind die des
Bau-Tags und werden hier nicht nachgeführt; was die Seite heute je Land sagt,
steht in `shared/utils/laenderCoverage.ts`.

## Alle neun Länder auf einen Blick

Stand 13.11.2026, wörtlich aus `shared/utils/laenderCoverage.ts`: dieselben
Angaben liest die Seite (`/datenlage` und die Falte „Wie vollständig
die Länder-Entwürfe sind" an der Liste). Ändert sich dort eine Zelle, gilt die
Datei, nicht diese Tabelle. „–" heißt: Das Land veröffentlicht es nicht, oder
der Monitor liest es nicht; die Abschnitte unten sagen je Lücke, welches von
beiden.

| Land | Verordnungsentwürfe | Abgeschlossene Begutachtungen | Frist | Weg nach der Begutachtung | Kundmachung | „Was ändert der Entwurf?“ | Texte im Vergleich | Stellungnahmen veröffentlicht |
|---|---|---|---|---|---|---|---|---|
| Burgenland | ja | seit 2007 | ja, ohne Beginn | – | Suche über den Titel | selten beigelegt | – | nach Fristende |
| Kärnten | ja | seit 2021, ohne Datum | ja, teils gerechnet | Vorlage und Beschluss | über das Beschlussdatum | ganze Paragraphen und Absätze | Vorlage, Gesetz | nach Fristende |
| Niederösterreich | ja | nein | ja, ohne Beginn | – | – | nicht gelesen | – | beim Landtag |
| Oberösterreich | ja, ohne Beginn | seit 2020 | ja | jeder Schritt | vom Landtag genannt | ja | Vorlage, Ausschuss, Gesetz | ab der Vorlage |
| Salzburg | ja | seit 2004 | ja, solange sie läuft | über das RIS | aus dem Text entschieden | wo beigelegt | Vorlage, Gesetz | mit Zustimmung |
| Steiermark | nicht gelesen | seit Juni 2015 | ja | – | Suche über den Titel | nicht gelesen | – | ja |
| Tirol | ja, ohne Frist | einige Wochen | nur Gesetze | jeder Schritt | vom Landtag genannt | ja | Vorlage, Gesetz | ja |
| Vorarlberg | nicht auf der Seite | nicht gelesen | ja, ohne Beginn | nicht gelesen | nicht gelesen | nicht gelesen | nicht gelesen | nicht gelesen |
| Wien | ja | höchstens 1 Jahr | ja | – | Suche über den Titel | ja | – | ja |

Was die Liste je Land hält und was nicht:

- **Burgenland** zeigt alle Entwürfe seit 2007. Den Beginn einer Begutachtung nennt das Land nicht; ein Entwurf steht beim Ende seiner Frist.
- **Kärnten** datiert abgeschlossene Begutachtungen nicht; ein Entwurf ohne Regierungsvorlage steht deshalb in keinem Zeitraum. Bei manchen Verordnungen ist die Frist vom Monitor gerechnet.
- **Niederösterreich** zeigt einen Entwurf nur, solange seine Begutachtung läuft; abgeschlossene fehlen, und was aus ihnen wurde, lässt sich hier nicht verfolgen.
- **Oberösterreich** zeigt alle Gesetzesentwürfe seit 2020 mit ihrem Weg bis zur Kundmachung. Verordnungsentwürfe nennen keinen Beginn; sie stehen beim Ende ihrer Frist.
- **Salzburg** zeigt alle Entwürfe seit 2004. Bei abgeschlossenen nennt das Land die Frist nicht mehr, nur den Beginn.
- **Steiermark** zeigt die Gesetzesentwürfe, die die Landesregierung seit Juni 2015 dem Landtag zur Begutachtung übermittelt hat; ältere fehlen, Verordnungsentwürfe liest der Monitor nicht.
- **Tirol** führt Gesetzesentwürfe nur einige Wochen auf seiner Liste; ältere fehlen. Verordnungsentwürfe nennen keine Frist.
- **Vorarlberg** steht hier nur mit Gesetzesentwürfen, und nur solange ihre Begutachtung läuft: Der Monitor liest die Seite der laufenden Begutachtungen des Landes. Laufende und kürzlich abgeschlossene Gesetzesvorhaben führt das Land auf einer eigenen Seite, mit Stellungnahmen, Regierungsvorlage, Beschluss und Gesetzblatt; diese Seite liest der Monitor noch nicht.
- **Wien** zeigt einen Entwurf höchstens ein Jahr lang; ältere fehlen, und was aus ihnen wurde, lässt sich nicht verfolgen.

Die folgende Tabelle und die Abschnitte 1–6d gehen für fünf Länder ins
Einzelne (Oberösterreich, Salzburg, Wien, Kärnten, Tirol), mit den Zahlen des
Bau-Tags. Burgenland, Steiermark, Niederösterreich und Vorarlberg kamen am
30.10.2026 dazu und stehen in Abschnitt 7.

## Was die Seite eines Landesentwurfs zeigt: fünf Länder im Einzelnen

Kärnten und Tirol seit 23.10.2026 (`server/utils/laender/kaernten.ts`,
`tirol.ts`). Ihre Zahlen sind ein erster Durchlauf am Bau-Tag, kein
Korpuslauf wie bei den drei anderen; wo nur einzelne Entwürfe geprüft
sind, steht das dabei.

| Ebene (wie beim ME)                         | Oberösterreich | Salzburg | Wien | Kärnten | Tirol |
|---------------------------------------------|----------------|----------|------|---------|-------|
| Liste: laufend / abgeschlossen              | ✓ / ✓ seit 2020 (die Liste des Landes; am 13.11.2026 nachgezählt: 89 Einträge, 2020–2026. Das Landtagssystem dahinter reicht laut der ersten Vermessung bis 2015 zurück, eine Liste der Begutachtungen davor gibt es nicht) | ✓ / ✓ seit 2004 | ✓ / ✗ max. 1 Jahr | ✓ / ✓ seit 2021, aber **ohne jedes Datum** | ✓ / ✗ — Liste hält Einträge nur Wochen, kein Archiv |
| Stellungnahmen (Organisationen)             | ✓ | ✓ | ✓ | ✓ erst nach Fristende, eigene Seite je Entwurf | ✓ beim Gegenstand im Landtag, ab Fristende |
| Was ändert der Entwurf? (Textgegenüberstellung) | ✓ 73 von 90 Gesetzesentwürfen haben eine; 1.302 §§ bestätigt + 239 neu, 212 zurückgehalten | ✓ 151 seit Mitte 2014 (von 357 Gesetzesentwürfen); 1.377 §§ gezeigt, 829 zurückgehalten | ✓ steht in der Entwurfs-PDF; beide aktuellen Entwürfe vollständig | ✓ seit 23.10. abends: rechts stehen **Novellierungsanordnungen**, nicht die neue Fassung; gezeigt wird ein § nur, wo die Novelle ihn oder einen ganzen Absatz neu fasst, einfügt oder streicht. 121 von 138 Entwürfen haben eine; 69 mit Vergleich, 320 §§ gezeigt (16 „entfallen", jedes mit „§ X entfällt" im Entwurf), 162 zurückgehalten (RIS-Abgleich am Monatsersten, den die TGÜ nennt; 59 % der Anordnungen sind feiner als ein Absatz und bleiben draußen) | ✓ seit 23.10. abends: **ein** Text mit Unter-/Durchstreichung in Farbe wie OÖ, zweispaltig im Zeitungssatz; 10 TGÜs (der Landtag führt Begutachtungen erst seit 2026), 10 mit Vergleich, 554 §§ gezeigt (15 „entfallen", alle im Entwurf so verfügt), 52 zurückgehalten (RIS-Abgleich am Tag der „Fassung vom …" des Entwurfs) |
| Was das Land begründet (allg. Teil)         | ✓ 89 von 90 | ✓ 119 von 120 (ab 2018) | ✓ | ✓ eigenes Dokument (2 von 2 geprüft) | ✓ eigenes Dokument (2 von 2 geprüft) |
| Begründung am §                             | ✓ 88 % der geänderten §§ | ✓ 65 % | ✓ | teils (Schulgesetz 3, Rettungsdienstgesetz 0) — nicht gemessen | ✓ (22 bzw. 16 Einträge) — nicht gemessen |
| Entwurf → Regierungsvorlage                 | ✓ (Landtag nennt sie) | ✓ über RIS-Verknüpfung, erst nach der Kundmachung | ✗ — Entwurf ist dann gelöscht | ✓ über die Geschäftszahl: 108 von 135 Entwürfen seit 2021 (Akt + Stück, s. u.) | ✓ Landtag führt Entwurf und Vorlage unter **derselben Zahl** |
| Vorlage → Ausschuss                         | ✓ | ✗ Ausschussbericht trägt keinen Text → Vorlage → Gesetz statt dessen | ✗ | ✗ kein Ausschusstext veröffentlicht → Vorlage → Gesetz | ✗ kein Ausschusstext → Vorlage → Gesetz; Ausschussempfehlungen nur als Satz |
| Begründungsvergleich                        | ✓ | ✓ wo beide Teile §-Erläuterungen haben | ✗ | teils (Schulgesetz: 3 §§ verglichen) | teils (Vorlage-Erläuterungen gelesen, beim TGADG 0 §§ zugeordnet) |
| Landtagsbeschluss                           | ✓ mit Abstimmung | ✓ aus dem Bericht | ✗ | ✓ Datum der Sitzung, **ohne Abstimmung**; 98 von 135 | ✓ Datum; Abstimmung nur in den Ausschusszeilen |
| Entwurf → Kundmachung                       | ✓ Gesetze (Landtag nennt sie) | ✓ aus dem Text entschieden: 248 Gesetze, 346 Verordnungen, alle gegen die Orakel richtig | ✗ — Entwurf ist dann gelöscht | ✓ über das Beschlussdatum im LGBl-Titel („Gesetz vom 1. Oktober 2026"): 89 von 98 beschlossenen; Rest ehrlich offen (u. a. ein Tippfehler des Landes im Titel) | ✓ Landtag nennt LGBl-Nummer und Kundmachungsdatum selbst |
| Verordnungen                                | ✗ 7 Entwürfe in drei GP, kein Beginndatum, Titelsuche findet 1 von 7 | ✓ | — (eine Verordnung in GP XXVIII) | ✓ 26 Entwürfe von der Kachelseite „Themen A–Z › Verordnungsentwürfe" (28 Kacheln: eine ist kein Entwurf, eine verweist auf gelöschte Dateien); Frist auf der Seite bei 14, aus dem Anschreiben **gerechnet** bei 9, keine bei 3 („vier Wochen ab Zustellung" + Briefdatum, ±2 Tage gegen die Seite, auf der Entwurfsseite so gesagt) | ✓ seit 24.10. mit **„Frist unbekannt"**: 16 Entwürfe der Landesregierung aus dem IFG-Informationsregister (158 Verkehrsverordnungen der BH bleiben draußen); das Register hat **kein Fristfeld**, Daten in den PDFs sind oft Fristen im Inhalt — die Entwürfe stehen unter „Alle", weder offen noch abgeschlossen, nicht auf der Startseite |

## Die Lücken, nach Ursache

### 1. Der Entwurf verschwindet (Wien) — die schwerste Lücke

Wien nimmt einen Entwurf mit dem Beschluss des Landtags vom Netz, höchstens
nach einem Jahr; die PDFs geben danach 404 (gemessen: sechs von sieben
geprüften älteren Nummern). Damit ist für Wien unmöglich, was beim Bund der
Kern ist: was aus dem Entwurf geworden ist. Ohne eigenes Archiv (am
22./23.10. bewusst nicht gebaut) bleibt Wien bei „Was ändert der Entwurf?".

**Ziel:** Wien lässt Begutachtungsentwürfe dauerhaft online, wie
Oberösterreich und Salzburg (Salzburg seit 2004). Kein Aufwand, sofort
wirksam, für jeden Leser — nicht nur für den Monitor.

### 2. Keine Verknüpfung Entwurf → Vorlage → Gesetz (Salzburg, Wien)

Oberösterreichs Landtag verzeichnet jeden Schritt bis zur Kundmachung. In
Salzburg und Wien steht nirgends, welche Regierungsvorlage und welches
Landesgesetzblatt aus einem Entwurf wurde. Der Monitor schließt es aus dem Text:
für Salzburg über die Regierungsvorlage, die RIS mit dem Landesgesetzblatt
verknüpft (374 seit 2015) — verlässlich, aber erst nach der Kundmachung, nur
wo es eine Regierungsvorlage gibt (Gesetze aus einem Antrag im Landtag
fallen heraus: 22 allein in 2022 und 2024), und mit Aufwand, den eine Zeile
im Register erspart. Die Titelsuche allein irrt rund zwei Mal in hundert.

**Ziel:** Der Registereintrag eines Begutachtungsentwurfs nennt, was aus ihm
wurde — Nummer der Regierungsvorlage bzw. Beilage, später das
Landesgesetzblatt. Salzburg führt das Register ohnehin je Entwurf.

### 3. Textgegenüberstellung fehlt oder ist uneinheitlich

Der Bund hat sie seit dem Rundschreiben 2002 zweispaltig und verpflichtend.
Die Länder: Oberösterreich legt sie meist bei (81 %), aber einspaltig mit
Unter-/Durchstreichung, die nur über die Lage der Linien zu lesen ist;
Salzburg bei 42 % der Gesetzesentwürfe, zweispaltig; Wien in der
Entwurfs-PDF, zweispaltig. Wo sie fehlt, gibt es kein „Was ändert der
Entwurf?". Zurückgehalten werden §§, deren alte Spalte der Monitor nicht
wortgleich im RIS findet. Für die alten Salzburger Dienstrechtspakete war das
der Leser, nicht das Dokument (geklärt 14.11.2026): Salzburg druckt dort
einen unveränderten Absatz oder eine Ziffer mit der bloßen Bezeichnung,
„(1) (2) Abs 1 ist nicht anzuwenden, wenn 1. 2. der …" (22320, § 4h L-BG),
und der Leser las „(1)" und „1." als Wörter. Seither als Auslassung gelesen:
über 147 Salzburger Entwürfe 53 §§ mehr gezeigt (1.663 → 1.716),
zurückgehalten 504 → 451. Nur die Überschrift trägt die alte Spalte bei drei
§§ (32075); die übrigen haben andere Gründe, Salzburgs „(1) unverändert"
und ein mitkopierter RIS-Fußtext darunter.

**Ziel:** Eine Textgegenüberstellung zu jedem ändernden Entwurf, zweispaltig
nach der Vorlage des Bundes, als eigenes Dokument.

### 4. Nur PDF

Alle fünf veröffentlichen Entwürfe nur als PDF. Alles, was der Monitor
zeigt, ist aus Seitengeometrie zurückgelesen (Spalten, Linien, Kopfzeilen,
Silbentrennung) und gegen RIS geprüft — deshalb die zurückgehaltenen §§.

**Ziel:** Entwürfe zusätzlich in einem Textformat (HTML/XML) — oder in RIS,
wo der Bund seine Begutachtungsentwürfe schon hat.

### 5. Verordnungen (Oberösterreich)

Oberösterreichs Register nennt bei Verordnungsentwürfen kein Beginndatum
und nichts danach; der Landtag ist nicht befasst. Ohne Datum lässt sich die
Kundmachung nicht entscheiden (der eine Fund der Titelsuche — ein Entwurf
von 2020 gegen ein Landesgesetzblatt von 2024 — wird nicht verglichen).

**Ziel:** Beginn der Begutachtung und, nach der Kundmachung, das
Landesgesetzblatt im Registereintrag.

### 6. Stellungnahmen

Keines der fünf Länder zählt die eingelangten Stellungnahmen öffentlich;
jedes veröffentlicht nur einen Teil, nach eigenen Regeln. Für die
Rechenschaftsebene (was wurde aus der Eingabe) fehlt damit schon der
Ausgangspunkt.

**Ziel:** Die Zahl der eingelangten Stellungnahmen, und die Stellungnahmen
von Organisationen vollständig — Namen von Privatpersonen nicht.

### 6a. Kärnten: abgeschlossene Begutachtungen ohne Datum

Die Archivseiten („abgeschlossene Begutachtungen 2021 … 2026") nennen weder
Beginn noch Frist. Der Monitor stellt einen solchen Entwurf in der Liste
beim Datum seiner Regierungsvorlage ein (`placedAt`) — ohne Vorlage steht er
in keiner Periode (27 von 135). Die Frist sieht der Monitor nur, solange der
Entwurf läuft; behalten könnte er sie erst mit eigener Persistenz (bewusst nicht gebaut, `CLAUDE.md`).

**Ziel:** Beginn und Ende der Frist bleiben im Archiveintrag stehen.

### 6b. Kärnten: ein Akt pro Gesetz, über Jahre

Die Geschäftszahl („LG-113253_2025-38") ist der Akt des Gesetzes, nicht der
des Entwurfs: das Feuerwehrgesetz führt die Begutachtung 2021 und die
Novelle 2025 unter 2275/2021. Nach dem Akt allein verknüpft, nahm der
Entwurf von 2021 den Beschluss von 2025. Verknüpft wird deshalb über die
Stücknummer (Vorlage = erstes Stück nach dem Entwurf und vor der nächsten
Begutachtung desselben Akts) — das hält, solange das Land fortlaufend
zählt. Vor 2022 fehlt in der Zahl teils das Jahr („LG-1994-6").

**Ziel:** Der Archiveintrag nennt die Zahl der Regierungsvorlage, und die
Beschlussseite verlinkt die Vorlage auch bei älteren Jahrgängen.

### 6c. Tirol: kein Archiv, Dokumente ohne Adresse

Die Liste des Landes hält einen Entwurf nur einige Wochen. Danach findet
der Monitor ihn nicht mehr über die Liste; seine Seite (Landtagszahl) bleibt
erreichbar. Die Landtagsevidenz kennt jeden Gegenstand dauerhaft, ihre
Suche ist aber ein JSF-Formular. Die Dokumente haben keine eigene Adresse:
jede PDF ist ein Formular-Post in einer Sitzung. Der Monitor liest sie mit
eigener Sitzung je Dokument und verlinkt für Leser die Seite des
Gegenstands.

**Ziel:** Feste Download-Adressen je Dokument und eine Liste der
abgeschlossenen Begutachtungen (die Landtagsevidenz hat sie als Typ
„Begutachtungsverfahren/Stellungnahmen" schon).


### 6d. Verordnungen: keine Frist, die sich lesen lässt (Kärnten teils, Tirol ganz)

Kärnten nennt bei 12 von 26 Verordnungsentwürfen keinen Tag; bei 9 steht im
Anschreiben „innerhalb von vier Wochen ab Zustellung" — eine Frist, die für
die Öffentlichkeit nicht feststeht. Der Monitor rechnet Briefdatum + vier
Wochen und sagt das; wo Seite und Brief beide sprechen, weicht die Rechnung
um 0–2 Tage ab (Turnersee +1, 01-GVO-145/146 +2). Tirol veröffentlicht seine
Verordnungsentwürfe nur im Informationsregister, ohne Frist — der Monitor
zeigt sie seit 24.10.2026 mit „Frist unbekannt": ohne Frist kann er nicht
sagen, ob ein Entwurf offen ist, und „abgeschlossen" wäre geraten.

**Ziel:** Ein Fristfeld (Datum) in jedem Registereintrag einer Begutachtung
— die kleinste aller Bitten.

### 7. Sonst

- **Regierungsvorlage ohne Datum (Salzburg):** RIS nennt ihre Nummer, nicht
  ihr Einlangen; die Karte zeigt kein Datum. Steht im Landtagssystem (LPI).
- **Ausschussbericht ohne Text (Salzburg):** Was der Ausschuss änderte, steht
  nur im Gesetz, vermischt mit der Bearbeitung für die Kundmachung.
- **Lizenz:** Kein Land sagt, unter welchen Bedingungen Entwürfe und
  Erläuterungen weiterverwendet werden dürfen (beim Bund ist dieselbe Frage für die Dokumente eines Ministerialentwurfs offen). Wien
  stellt seit dem Relaunch (bemerkt 30.10.2026) seine Seiten unter CC BY 4.0,
  sagt aber nicht, ob das für die verlinkten PDFs gilt.
- **Angekündigte Entwürfe:** wie beim Bund keine Quelle.
- **Die anderen vier Länder** sind seit 30.10.2026 angebunden, soweit ihre
  Seiten es zulassen: Burgenland mit Archiv seit 2007 (Frist, Stellungnahmen,
  kein Beginn); Steiermark über PALLAST des Landtags (XIX.–XVII. GP, also seit Juni 2015; Beginn, Frist,
  Stellungnahmen, Dokumente per Postback; Firewall sperrt bei vielen Sitzungen);
  Niederösterreich und Vorarlberg nur laufende Entwürfe — beide Seiten
  verlieren einen Entwurf mit Fristende. Lücken der Institutionen: NÖ und Vbg
  ohne Archiv, Bgld/NÖ/Vbg ohne Beginndatum, NÖ-Stellungnahmen nur beim
  Landtag ohne Verknüpfung zum Entwurf.
- **Textgegenüberstellung Kärnten/Tirol:** gelesen seit 23.10.2026 abends,
  am 24.10. nachgeschärft: Datum des RIS-Abgleichs aus den Dokumenten
  selbst; ein Gesetz unter einem Namen (RIS-Kürzel, „Bauordnung 2022,
  Tiroler", „Gesetz über die …"); ein doppelt gedruckter § wird
  zusammengeführt oder zurückgehalten statt „entfallen" + „neu"; geänderte
  Überschrift zählt als Änderung (alle Länder); „§" statt „ß" in
  Mac-Roman-PDFs (Tirol 722). Offen: Kärntner Gesetze ohne lesbaren
  Begutachtungsmonat prüfen weiter am Vorlagedatum.
- **Klassifikator:** „Österreichischer Städtebund, Landesgruppe …" und
  „Landesvolksanwältin" standen bis 23.10.2026 als Privatperson; seither
  Organisation (Altgegen-Neu über 111.629 Zeilen Liste 142: ein Name neu
  öffentlich, eine Organisation; keiner neu verborgen).

## Die erste Vermessung, vor dem Bau (22.10.2026)

Bevor ein Land angebunden war, wurden die Seiten aller neun mit denselben
Fragen abgerufen. Was daraus über die einzelnen Länder hinaus gilt:

- **Das RIS führt keine Begutachtung für Landesrecht.** Die Schnittstelle
  kennt für Landesrecht nur das konsolidierte Recht und die Gesetzblätter
  (`LrKons`, `LgblAuth`, `Lgbl`, `LgblNO`, `Vbl`). Der Anfang der Kette liegt
  deshalb bei neun verschiedenen Seiten der Länder.
- **Das Ende der Kette ist einheitlich im RIS, für alle neun:** authentische
  Landesgesetzblätter und konsolidiertes Landesrecht, über dieselbe
  Schnittstelle wie beim Bund. Geltende Fassung und Kundmachung brauchen
  keine eigene Quelle je Land.
- **Neun Länder, neun Techniken:** eine eigene Anwendung (Salzburg), eine
  statische Seite (Wien), IBM Domino (Burgenland), Liferay mit einer von Hand
  gepflegten Seite (Vorarlberg), ein Landtagssystem in JSP (Oberösterreich),
  ein CMS mit zwei getrennten Orten für Gesetze und Verordnungen (Kärnten),
  TYPO3 und eine JSF-Anwendung des Landtags (Tirol), PALLAST (Steiermark).
  Niederösterreichs Seite war am Tag der Vermessung nicht erreichbar. Jede
  Quelle ist eine eigene, die bei einem Relaunch bricht.
- **Das Informationsregister auf data.gv.at ist eine Teilquelle, kein
  Ersatz:** 134 Treffer zu „Begutachtung", davon 90 der Stadt Wien
  (überwiegend ihre eigenen Stellungnahmen zu Entwürfen des Bundes), 20 des
  Landes Tirol (Verordnungsentwürfe mit PDF), 9 aus Kärnten, 2 aus
  Vorarlberg. Titel, Datum und Link sind strukturiert, die Frist steht nur im
  Text.
- **Stellungnahmen** veröffentlichten sieben der acht erreichbaren Länder,
  jedes nach eigenen Regeln (Salzburg und Oberösterreich bei Privatpersonen
  nur mit Zustimmung). Was der Monitor davon heute zeigt, steht in der
  Tabelle oben.

## Was am meisten schließen würde — nach Hebel und Kosten für das Land

1. **Wien: Entwürfe online lassen.** Null Aufwand, schließt die größte Lücke.
2. **Salzburg und Wien: Registereintrag nennt Vorlage und Landesgesetzblatt.**
   Eine Zeile je Entwurf; macht „was wurde daraus" für jeden lesbar.
3. **Alle: Textgegenüberstellung zu jedem ändernden Entwurf, zweispaltig wie
   beim Bund.** Für Salzburg der größte Schritt (heute 42 %).
4. **Alle: Zahl der Stellungnahmen und vollständige Veröffentlichung der
   Stellungnahmen von Organisationen.**
5. **Oberösterreich: Verordnungsentwürfe mit Beginndatum und Kundmachung.**
6. **Alle: Lizenzhinweis für Entwürfe und Erläuterungen.**
7. **Längerfristig: Begutachtungsentwürfe der Länder in RIS**, wie die des
   Bundes — löst 1, 2 und 4 zugleich.

Anknüpfungspunkte: Oberösterreich als Beispiel, dass es geht (Landtag
verzeichnet jeden Schritt); Salzburg als Beispiel für das lange Register;
der Bund (Rundschreiben 2002) als Maßstab für die Textgegenüberstellung.
