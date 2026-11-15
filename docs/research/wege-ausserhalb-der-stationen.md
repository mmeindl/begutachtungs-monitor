# Vier Verfahren außerhalb der fünf Stationen

**Stand 14.11.2026.** Forschungsnotiz zu einer Frage: Die Grafik `/wege`
zeigt vier Arten von Verfahren, die der Monitor nicht verfolgt. Soll er es,
jedes für sich entschieden? Die vier sind Petitionen und Bürgerinitiativen
im Nationalrat, Volksbegehren, Verordnungen der Regulierungsbehörden und
Verordnungen ohne Begutachtung. Grundlage ist
`wege-zu-einer-rechtsnorm.md` („Einschätzung") und `docs/decisions.md`,
„Routes to a norm, and what the monitor follows". Die Notiz erhebt und
empfiehlt; sie baut nichts.

## Maßstab und Methode

- **Maßstab** (`decisions.md`): Ein Weg wird nur verfolgt, wenn es eine
  amtliche, maschinenlesbare Quelle gibt, deren Weiterverwendung geklärt ist,
  wenn es genug Fälle gibt und wenn nichts von Hand gepflegt werden muss.
  Die fünf Stationen bleiben fünf; was nicht passt, bekommt eine eigene
  Leiste auf einer eigenen Seite oder wird nur verlinkt. Keine Rangliste,
  kein Vorwurf, Privatpersonen gezählt und nie genannt.
- **Quellen**, alle am 14.11.2026 abgefragt, eine Anfrage nach der anderen,
  ohne Kennung des Projekts: die Lizenzseiten und die Filter-API des
  Parlaments (Listen 101, 143, 305, Detail-JSON), das RIS (`Begut`,
  `BgblAuth`), die Seiten von E-Control, RTR und FMA, die Liste der
  Volksbegehren des BMI.
- **Messung zu Teil 4**: Das RIS-Korpus „Begut" (4.620 Treffer, 4.612
  Datensätze nach Entdopplung) und alle Kundmachungen im Bundesgesetzblatt
  vom 01.11.2023 bis 14.11.2026 (2.298 Datensätze, davon 1.217 in Teil II)
  wurden einmal geladen und offline durch die ausgelieferte Regel
  (`joinDraftToBgbl`, `server/utils/ris/bgblJoin.ts`) geschickt, in beide
  Richtungen. Die Zahlen sind also die, die die Seite sagen würde.
- „nicht belegt" heißt: nicht gelesen oder nicht gefunden. „nicht geprüft"
  heißt: nicht nachgesehen.
- **Namen**: Wo eine Quelle Privatpersonen nennt, steht hier nur, dass sie
  es tut.

## Auf einen Blick

| | Quelle, Weiterverwendung | Fälle | Empfehlung |
|---|---|---|---|
| 1. Petitionen, Bürgerinitiativen | Parlament, Liste 101; zwei eigene Datensätze unter CC BY 4.0, Stellungnahmen ausgenommen | 65 in der XXVIII. GP, 44 davon heute offen | nur verlinken, aber genauer als heute; als einziger der vier Wege baubar, falls einer gebaut werden soll |
| 2. Volksbegehren | unverändert | 85 Zeilen, 81 Volksbegehren, wie im September | bleibt: zeigen, verlinken, nicht verfolgen |
| 3. Verordnungen der Regulierungsbehörden | drei Webseiten ohne Schnittstelle; RTR behält sich alle Rechte vor, E-Control sagt nichts, FMA weist Programme ab | 27 bis 32 Verordnungen im Jahr | nur verlinken |
| 4. Verordnungen ohne Begutachtung | RIS, CC BY 4.0; aber kein Zeuge für das Fehlen | 238 von 313 Verordnungen 2025 ohne zugeordneten Entwurf | nicht verfolgen; den genannten Grund in der Grafik berichtigen |

Zwei Befunde am Rand, die nicht zur Frage gehören, aber den Monitor
betreffen, stehen unter „Nebenbefunde".

## 1. Petitionen und Bürgerinitiativen im Nationalrat

### Quelle und Weiterverwendung

Das Parlament führt **je einen eigenen Datensatz** „Petitionen" und
„Bürgerinitiativen" unter seinen 25 Open-Data-Datensätzen
(`parlament.gv.at/recherchieren/open-data/daten-und-lizenz/petitionen/index.html`,
`…/buergerinitiativen/index.html`). Der Abschnitt „Erlaubte Nutzung und
Lizenzierung" lautet für beide gleich, hier für Petitionen:

> „Bei Petitionen sind die Ergebnislisten der Filter und der API als Open
> Data unter der Lizenz CC BY 4.0 zur Verwendung freigegeben. Darüber hinaus
> sind bei Petitionen die Dokumente selbst freie Werke und somit ohne
> Lizenzierung frei nutzbar. Die Informationen auf den Geschichtsseiten der
> Petitionen können unter der Lizenz CC BY 4.0 verwendet werden.
> Der Bereich der Stellungnahmen in den Geschichtsseiten und sämtliche
> Informationen zu Stellungnahmen fallen weder unter die angeführte freie
> Nutzung noch unter die Lizenzierung, sondern sind ausdrücklich davon
> ausgeschlossen. Diese Daten können aus Gründen des Datenschutzes und des
> Schutzes von Urheber- und Persönlichkeitsrechten nicht zur
> Weiterverwendung freigegeben werden."

Damit ist die Frage der Vorgabe beantwortet: **Die Einräumung deckt
Petitionen und Bürgerinitiativen ausdrücklich**, weiter als bei den
Ministerialentwürfen: Liste, Geschichtsseite (Verlauf, Status, Bezüge) und
Dokumente.

Was der Ausschluss „sämtliche Informationen zu Stellungnahmen" hier heißt:

| Angabe | Wo sie steht | Lesart |
|---|---|---|
| Stellungnahmen: Text, Einsender, Datum | Liste 142 (`BEZUG_ITYP` `PET`, `BI`), Bereich „Stellungnahmen" der Geschichtsseite | ausgeschlossen, wie bei der Regierungsvorlage; dieselbe offene Lizenzfrage (E3) |
| Zahl der Stellungnahmen je Gegenstand | Spalte „Stellungnahmen" der Liste 143 („Aktuelle Beteiligungen"), deren Ergebnislisten unter CC BY stehen | **widersprüchlich**: Die Seite der Liste 143 gibt die Ergebnisliste frei und verweist für „die erlaubte Nutzung … der jeweiligen Verhandlungsgegenstände" auf deren Beschreibung, und die schließt „sämtliche Informationen zu Stellungnahmen" aus. Eine Zahl ist eine Information. Wie bei der Vorlage behandeln, nicht anders |
| Zahl der Unterstützungen | Spalte „Unterstützungen" der Liste 143; `count` der Liste 305 | **vom Ausschluss nicht genannt**: Er nennt nur Stellungnahmen. Die Zahl steht in einer freigegebenen Ergebnisliste. Meine Lesart, nicht die des Parlaments; eine Rückfrage wäre der sichere Weg |
| Namen der Unterstützenden | Liste 305: Name, PLZ, Ort je Zeile | personenbezogen; für den Monitor nie zu lesen, gleich was die Lizenz sagt. Die Zahl kommt ohne die Zeilen (`pagesize=1`, Feld `count`) |
| Erstunterzeichnerin oder Erstunterzeichner einer Bürgerinitiative | `content.names[]` der Geschichtsseite, auf allen 36 der XXVIII. GP | von der Lizenz gedeckt, vom Monitor nicht zu nennen: eine Privatperson |
| Überreichende Abgeordnete einer Petition | `content.names[]`, „Petition überreicht von" (40 Einträge auf 29 Petitionen), Liste 101 `PAD_INTERN`, `FRAK_CODE` | gedeckt; Mandatare in ihrer Funktion |

Die Liste 143 hält entgegen ihrer Beschreibung („zu denen am Abfragedatum
eine Beteiligung möglich ist") auch abgeschlossene Gegenstände, mit
`AKTIV` `N`; ein Abruf ohne Filter liefert 655.099 Zeilen und bricht bei
100.000 ab. Mit `GP_CODE` und `ITYP` gefiltert, liefert sie genau die
Gegenstände der Liste 101 (29 und 36, geprüft).

Rechtsgrundlage der elektronischen Unterstützung: weiterhin nur das
Formular selbst („Die elektronische Unterstützung dient der Abbildung der
politischen Interessenlage und hat für die Beratungen im Nationalrat
informativen Charakter."); eine Norm ist **nicht belegt**.

### Fälle, gezählt

Liste 101, `ITYP` `PET` und `BI`, je Gesetzgebungsperiode (jede Antwort
gegen ihr `count` geprüft):

| GP | Petitionen | Bürgerinitiativen |
|---|---|---|
| XXV (2013–2017) | 111 | 121 |
| XXVI (2017–2019) | 30 | 67 |
| XXVII (2019–2024) | 148 | 74 |
| XXVIII (seit 24.10.2024) | 29 | 36 |

Petitionen an den Bundesrat (`PET-BR`, 42 in der ungefilterten Liste 143)
sind nicht mitgezählt. Von den 36 Bürgerinitiativen der XXVIII. GP sind 18
aus der XXVII. übernommen (`reference[]`: „Neuverteilung gem. § 21 Abs. 1a
GOG-NR").

Beteiligung, aus Liste 143:

| | Gegenstände | Stellungnahmen (Summe, Median, höchste) | Unterstützungen (Summe, Median, höchste) | heute offen |
|---|---|---|---|---|
| Petitionen XXVIII | 29 | 444 · 4 · 246 | 30.351 · 177 · 12.582 | 24 |
| Bürgerinitiativen XXVIII | 36 | 816 · 5 · 236 | 22.836 · 189 · 4.748 | 20 |
| Petitionen XXVII | 148 | 3.191 · 5 · 1.084 | 230.851 · 127,5 · 44.569 | 0 |
| Bürgerinitiativen XXVII | 74 | 5.446 · 6 · 1.991 | 221.441 · 290 · 43.510 | 0 |

Kein Gegenstand der beiden Perioden hat null Unterstützungen. „Offen"
stimmt mit dem Detail-JSON überein (`statementsstate` und `approvalstate`
`1` auf 24 Petitionen und 20 Bürgerinitiativen).

Stand der 65 Gegenstände der XXVIII. GP, aus dem Verlauf aller 65
Detail-JSON gelesen:

| Stand | Petitionen | Bürgerinitiativen |
|---|---|---|
| Sammelbericht im Nationalrat zur Kenntnis genommen, im Ausschuss „durch Kenntnisnahme" erledigt | 5 | 16 |
| Sammelbericht zur Kenntnis genommen, einem Fachausschuss zugewiesen | 3 | 5 |
| im Ausschuss „durch Kenntnisnahme" erledigt, noch nicht im Plenum | 2 | 2 |
| in Verhandlung | 19 | 13 |

Eine Weiterleitung an die Bundesregierung oder die Volksanwaltschaft (die
beiden anderen Anträge nach § 100c Abs. 3 GOG-NR) kommt im Verlauf der 65
nicht vor (mit dem Suchmuster nicht gefunden). Der Ausschuss beschloss auf
den 65 Gegenständen 105-mal, schriftliche Stellungnahmen „im Rahmen eines
‚Ausschussbegutachtungsverfahrens'" einzuholen, mit 202 angenommenen
Ersuchen an Ministerien, Länder, Kammern und andere Stellen.

### Ein Beispiel, ganz gelesen: 5/BI XXVIII

„Kennzeichnung von E-Bikes als Motorkraftfahrzeuge!"
(`parlament.gv.at/gegenstand/XXVIII/BI/5`, Detail-JSON mit `?json=True`).

| Datum | Schritt, wie ihn das Parlament nennt |
|---|---|
| 24.10.2024 | „Verhandlungsgegenstand gem. § 21 Abs. 1a GOG": übernommen von 53/BI der XXVII. GP; „Vorgesehen für den Ausschuss für Petitionen und Bürgerinitiativen"; Mitteilung des Einlangens in der 1. Sitzung |
| 26.02.2025 | Zuweisung an den Ausschuss |
| 03.04.2025 | 2. Sitzung des Ausschusses: Beschluss, schriftliche Stellungnahmen einzuholen; ein Ersuchen angenommen |
| 26.06.2025 | 3. Sitzung: „Antrag, die parlamentarische Bürgerinitiative durch Kenntnisnahme im Ausschuss zu erledigen", dafür ÖVP, SPÖ, NEOS, dagegen FPÖ, GRÜNE; Sammelbericht 159 d.B. |
| 24.09.2025 | 41. Sitzung des Nationalrates: „Antrag, den Ausschussbericht zur Kenntnis zu nehmen, angenommen", alle Klubs dafür |

Dazu: zwei Dokumente (gescanntes Original, textinterpretierte Fassung), eine
Meldung der Parlamentskorrespondenz, 3 Stellungnahmen, 24 Unterstützungen,
heute geschlossen. Von der Übernahme bis zur Kenntnisnahme elf Monate, zwei
inhaltliche Sitzungen.

### Was eine Seite zeigen würde

Eine eigene Leiste mit vier Schritten, nicht die fünf Stationen:

1. **Eingebracht** — Datum, von wem überreicht (Petition) oder „von
   mindestens 500 Bürgerinnen und Bürgern" (Bürgerinitiative, ohne Namen),
   der Text als Dokument des Parlaments.
2. **Im Ausschuss für Petitionen und Bürgerinitiativen** — Sitzungen, von
   wem der Ausschuss Stellungnahmen eingeholt hat, Vertagungen.
3. **Erledigung im Ausschuss** — in den Worten des Parlaments:
   Kenntnisnahme, Zuweisung an einen Fachausschuss, Bundesregierung,
   Volksanwaltschaft; mit der Abstimmung nach Klubs.
4. **Im Nationalrat** — der Sammelbericht und seine Kenntnisnahme.

**Wo man teilnehmen kann:** elektronisch unterstützen und Stellung nehmen
(§ 23b Abs. 2 GOG-NR), solange der Gegenstand in Behandlung ist. Beides
führt zum Formular des Parlaments (`formlink`, `appformlink` im
Detail-JSON). Eine Frist gibt es nicht; das Ende kommt mit der Erledigung
und ist nicht angekündigt.

### Was sich nicht zeigen lässt, und warum

- **Was aus dem Anliegen wurde.** Kein Gesetz muss folgen, und kein
  Datensatz verknüpft ein späteres Gesetz mit einer Petition. Es ist
  dieselbe dunkle Stelle wie beim Volksbegehren (`volksbegehren.md` §5.3).
- **Warum der Ausschuss zur Kenntnis nimmt.** Der Verlauf nennt den Antrag
  und die Abstimmung, keinen Grund.
- **Der Stand aus einem Feld.** `status.description` ist bei 37 der 58
  Gegenstände mit Status 5 nur der letzte Verlaufseintrag („auf Tagesordnung
  in der 3. Sitzung …"), kein Ergebnis; Status 5 („Abgeschlossen" laut
  Datensatzbeschreibung) tragen auch Gegenstände, die noch in Verhandlung
  sind. Der Stand muss aus dem Verlauf gelesen werden, mit einem Vokabular,
  das wie beim Einspruch des Bundesrates erst über mehrere Perioden zu
  messen wäre.
- **Texte der Stellungnahmen** und wer unterstützt hat: Lizenz und
  Datenschutz.
- **Der Verlauf als Fließtext.** Er nennt bei den Ersuchen des Ausschusses
  Personen mit Funktion („…; [Name], Leiterin …"). Eine Seite müsste diese
  Zeilen kürzen, bevor sie etwas ausgibt.

Und eine Frage der Rahmung: Von den 29 abgeschlossenen Gegenständen endeten
21 mit Kenntnisnahme. Eine Liste nach Ausgang wäre der Zähler, den die
Regeln ausschließen; zeigen ließe sich nur die offene Beteiligung und der
Verlauf des einzelnen Gegenstands.

### Optionen

| Option | Was sie kostet | Was sie bringt |
|---|---|---|
| **Bauen**, eigene Leiste, eigene Seite, eigene Liste | Die Quelle wird schon gelesen, der Parser für den allgemeinen Gegenstand existiert (`vorlageDetail`). Neu: zwei Gegenstandsarten, eine Listenansicht außerhalb der Entwürfe, das Verlaufsvokabular samt Messung, das Kürzen der Personen im Verlauf, die Zählung aus Liste 143, Impressum (Eintrag des Parlaments um beide Arten erweitern; Unterstützungszahlen). Geschätzt in der Größe eines der Schritte aus `umsetzungsplan-weitere-wege.md`, Schritt 3 | 44 Gegenstände, bei denen man heute etwas tun kann. Ein Kalendereintrag ist nicht möglich: Kein Gegenstand hat eine Frist. Aber kein Abgleich von Texten, keine Nachverfolgung im Sinn des Monitors: Die Seite zeigte, was das Parlament selbst zeigt |
| **Nur verlinken**, genauer als heute | Zwei Adressen in `wege.ts`: statt der allgemeinen Seite „Petitionen unterstützen" die gefilterte Liste der Gegenstände der laufenden Periode (`/recherchieren/gegenstaende/?NRBR=NR&GP_CODE=<GP>&VHG=PET&DOKTYP=PET`, ebenso `BI`; Muster aus den `breadcrumbs` des Detail-JSON, die Periode aus `getCurrentGp`) | Der Weg von der Grafik zum offenen Gegenstand wird ein Klick kürzer; kein Betrieb, keine Lizenzfrage |
| **Lassen** | nichts | Der Link heute führt auf eine Erklärseite, nicht zu den Gegenständen |

**Empfehlung: nur verlinken, genauer.** Der Weg erfüllt als einziger der
vier alle drei Bedingungen, und wenn einer gebaut werden soll, dann dieser.
Dagegen spricht nicht die Machbarkeit, sondern der Ertrag: Der Monitor
hätte hier nichts, was das Parlament nicht zeigt, und müsste dafür eine
zweite Art von Gegenstand mit eigenen Datenschutzregeln tragen. Anders
läge es, wenn eine Organisation, die Petitionen trägt, den Feed braucht.

**Entschieden am 14.11.2026, gegen diese Empfehlung:** gebaut wird, samt
Volksbegehren für ihre Zeit im Nationalrat. Der Grund ist einer, den die
Empfehlung nicht gewogen hat: Der Ertrag liegt nicht im einzelnen
Gegenstand, sondern darin, dass eine Stelle alles zeigt, wozu man sich
äußern kann. Plan: `umsetzungsplan-petitionen-volksbegehren.md`.

## 2. Volksbegehren

Nichts seither ändert die Einschätzung vom September
(`volksbegehren.md`, §10). Liste 101 führt am 14.11.2026 dieselben 85
Zeilen (81 Volksbegehren), 5 in der XXVIII. GP; die Liste des BMI
(`bmi.gv.at/411/alle_volksbegehren_der_zweiten_republik.html`) dieselben
114, zuletzt die fünf vom Juni 2026, alle unter 100.000. Es bleibt bei:
in der Grafik zeigen, zum Ort der Unterstützung verlinken, nicht verfolgen.
Offen ist allein der Link: `wege.ts` nennt für das Volksbegehren keine
Adresse, weil die erste Notiz keine amtliche Seite für die Unterstützung
gelesen hat; das ist ein Nachtrag, keine Entscheidung.

## 3. Verordnungen der Regulierungsbehörden

Rechtsgrundlagen wie in `wege-zu-einer-rechtsnorm.md`: E-ControlG § 36
Abs. 3, FMABG § 22 Abs. 3a, TKG 2021 § 206.

### Fälle, gezählt

Kundgemachte Verordnungen in BGBl. II nach erlassender Stelle (RIS
`BgblAuth`, Feld `Typ` „Verordnung", Stelle aus `Einbringer`/`Organ`):

| Jahr | Verordnungen in Teil II | FMA | E-Control (Vorstand, Regulierungskommission) | RTR, TKK, KommAustria | zusammen |
|---|---|---|---|---|---|
| 2024 | 396 | 15 | 12 | 3 | 30 |
| 2025 | 313 | 15 | 9 | 3 | 27 |
| 2026 bis 14.11. | 307 | 14 | 14 | 4 | 32 |

Das sind die Verordnungen, die im Bundesgesetzblatt stehen. Was eine
Behörde „in anderer geeigneter Weise" kundmacht (E-ControlG § 36 Abs. 3),
ist nicht gezählt. Weitere Stellen mit eigenen Verordnungen in Teil II,
deren Begutachtung nicht geprüft wurde: Oesterreichische Nationalbank,
Abschlussprüferaufsichtsbehörde, die Vorstände von Post, Postbus und
Telekom Austria, Rechnungshof, Verwaltungsgerichtshof.

### Je Behörde

| | E-Control | RTR | FMA |
|---|---|---|---|
| Seite | `e-control.at/bereich-recht/aktuelle-begutachtungsentwuerfe` | je Konsultation eine Seite unter `rtr.at/TKP/aktuelles/veroeffentlichungen/veroeffentlichungen/konsultationen/` (Medien: `rtr.at/medien/…/Konsultationen/`) | **nicht belegt** |
| Form | eine HTML-Seite, alle laufenden und jüngst beendeten Verfahren untereinander (17 Einträge: 12 Verordnungsentwürfe, 5 andere Konsultationen) | Seite mit festen Feldern „Bereich", „Datum", „Kategorie" und einem Verweis auf die Seite der Stellungnahmen; Entwurf und Erläuterungen als PDF | — |
| Für ein Programm lesbar | nur als Fließtext. Kein Feld für die Frist: Sie steht im Satz, in mindestens drei Schreibweisen („bis spätestens 25. November 2026", „bis zum 16.09.2026", „konnten bis 29. Mai 2026 eingebracht werden"). Kein Veröffentlichungsdatum. Einträge verschwinden von der Seite. Kein Feed; die Sitemap ist ein Verzeichnis ohne lesbare Pfade | teils. Die Sitemap nennt 488 deutsche Seiten unter „konsultationen", aber `lastmod` ist kein Veröffentlichungsdatum (335 tragen 2021, das Jahr der Umstellung der Seite). Die Kategorie mischt Verordnungen mit Frequenzvergaben, Marktanalysen und Budgetkonsultationen. Kein Feed gefunden | **nein**: Startseite und `sitemap.xml` antworten zwei verschiedenen Programmen mit HTTP 403; nur `robots.txt` ist lesbar |
| Stellungnahmen | werden „nach Ablauf der Frist auf der Website der E-Control veröffentlicht", als eine ZIP- oder PDF-Datei je Verfahren (0,7 bis 98 MB); Einbringung per E-Mail mit Geschäftszahl | eigene Seite mit der Liste der Einsender und den „zur Veröffentlichung freigegebenen" Stellungnahmen als einzelne PDF | laut FMABG § 22 Abs. 3a zu veröffentlichen; auf der Seite nicht belegt |
| Bedingungen der Seite | Impressum (`e-control.at/econtrol/links/impressum`): Haftungsausschluss, „Copyright 2026 © E-Control"; **keine Aussage zur Weiterverwendung** | Impressum (`rtr.at/rtr/footer/impressum.de.html`): „Alle Rechte … sind der RTR-GmbH vorbehalten. Kein Teil dieser Seiten darf … ohne schriftliche Genehmigung der RTR-GmbH reproduziert oder unter Verwendung elektronischer Systeme gespeichert, bearbeitet, vervielfältigt, verbreitet oder zur Verfügung gestellt werden." Das Open-Data-Angebot (`rtr.at/rtr/service/opendata/OpenData.de.html`) nennt Marktdaten, keine Konsultationen; das Portal selbst nicht geöffnet | nicht belegt |
| `robots.txt` | sperrt Suche und Anmeldung, nicht die Inhalte | keine Sperre für allgemeine Programme | zwei gesperrte Pfade eines Plugins, darunter `csvexport.php` |

Ob ein Verordnungsentwurf einer Behörde als amtliches Werk nach § 7 UrhG
frei ist, wurde nicht beurteilt; das ist eine Rechtsfrage, keine Messung.

### Beispiele

**RTR, ganz gelesen:** Neufassung der Kommunikationsparameter-, Entgelt- und
Mehrwertdiensteverordnung, KEM-V 2026
(`…/konsultationen/konsultation-kem-v-2026.de.html`). Veröffentlicht
24.07.2026, gestützt auf § 206 Abs. 1 TKG 2021, Frist bis 24.09.2026,
Stellungnahmen per E-Mail oder Post. Sechs Dateien: Entwurf, Erläuternde
Bemerkungen, eine Fassung im Änderungsmodus, zwei Anlagen, ein Leitfaden.
Seite der Stellungnahmen vom 01.10.2026
(`…/stn-konsultation-kem-v-2026.de.html`): zwölf Einsender genannt,
darunter eine Einzelperson mit Namen; sechs Stellungnahmen als PDF
freigegeben. Eine Kundmachung der Neufassung steht bis 14.11.2026 nicht in
BGBl. II. Eine vollständige Kette nennt die Sitemap für die
Einzelentgeltnachweisverordnung 2025 (Konsultation, Stellungnahmen,
Verordnung; BGBl. II Nr. 75/2025 vom 23.04.2025), deren Seiten nicht
gelesen wurden.

**E-Control, vom Entwurf zur Kundmachung:** Betriebsmittelanzeigeverordnung.
Eintrag auf der Seite der Begutachtungsentwürfe mit Entwurf samt
Erläuterungen und sechs Anlagen als PDF, Frist bis 16.09.2026, die
Stellungnahmen als eine Datei (4,5 MB); kundgemacht als BGBl. II
Nr. 301/2026 am 14.10.2026 (RIS). Ob der Eintrag auf die Kundmachung
verweist: nicht geprüft.

**Wo man teilnehmen kann:** per E-Mail an die Behörde, bei der E-Control
mit Geschäftszahl im Betreff. Ein Formular gibt es bei keiner der beiden
gelesenen Seiten.

### Was sich nicht zeigen lässt, und warum

- **Bei der FMA nichts**: Die Seite lässt kein Programm ein. Das ist eine
  Entscheidung der Behörde und wurde nicht umgangen.
- **Bei der RTR nichts ohne schriftliche Genehmigung**: Das Impressum
  verbietet das Speichern mit elektronischen Systemen.
- **Fristen der E-Control nur geraten**: aus einem Satz gelesen, nicht aus
  einem Feld. Eine falsch gelesene Frist ist die teuerste Art von Fehler
  für eine Seite, die sagt „hier können Sie noch etwas tun".
- **Was sich zwischen Entwurf und Verordnung geändert hat**: Entwürfe nur
  als PDF, ohne Textgegenüberstellung; die Verknüpfung zur Kundmachung
  wieder nur über den Titel.
- **Wer Stellung genommen hat**: Die Sammeldateien und Listen enthalten
  Einzelpersonen; ein Zählen ohne Lesen der Dateien gibt es nicht.

### Optionen

| Option | Was sie kostet | Was sie bringt |
|---|---|---|
| **Bauen**, je Behörde eine Quelle | drei Ausleser für drei Webseiten, im Aufwand je wie ein Land; davor eine schriftliche Genehmigung der RTR, eine Auskunft der E-Control, ein Zugang bei der FMA; danach Pflege bei jeder Umstellung einer Seite. Daran ist der Vorgänger gestorben (ein selbstgebauter Ausleser, eine neu gestaltete Quelle) | rund 30 Verfahren im Jahr mit echter, gesetzlich vorgeschriebener Beteiligung, fachlich eng |
| **Nur verlinken** | zwei Adressen an der Zeile in `wege.ts` (E-Control und RTR, oben genannt); die der FMA erst, wenn jemand sie im Browser bestätigt hat | Wer die Zeile liest, kommt zum Entwurf |
| **Lassen** | nichts | Die Zeile nennt drei Behörden und führt nirgends hin |

**Empfehlung: nur verlinken.** Keine der drei Quellen erfüllt die erste
Bedingung, und die dritte Bedingung (keine Pflege von Hand) erfüllt ein
Ausleser von Webseiten nie. Der Grund an der Zeile („Entwürfe nicht im
RIS") stimmt und kann bleiben.

## 4. Verordnungen ohne Begutachtung

### Wie sich die 85 % zusammensetzen

Richtung Entwurf → Kundmachung, wie `pnpm corpus:bgbl2` sie misst:
Verordnungsentwürfe im RIS mit Fristende ab 01.01.2024.

| Fristende liegt zurück | gefunden |
|---|---|
| bis 180 Tage | 39 von 62 |
| 181 bis 365 Tage | 41 von 47 |
| über ein Jahr | 180 von 195 (92,3 %) |
| **alle** | **260 von 304 (85,5 %)** |

Die Zahl vom 22.10.2026 (85,4 %; 91,1 % über ein Jahr) ist damit
wiederholt. Mehr als die Hälfte der 44 Fehlenden (23) sind Entwürfe, deren
Frist weniger als ein halbes Jahr zurückliegt: Sie sind jung, nicht
verloren (Median Frist → Kundmachung 57 Tage, p90 179).

Die 15 Fehlenden, deren Frist über ein Jahr zurückliegt, einzeln gelesen
und von Hand gegen die Titel aller Kundmachungen seit 11/2023 gehalten (am
Titel, nicht am Text):

| Befund | Zahl | Fälle |
|---|---|---|
| **kundgemacht, von der Regel nicht zugeordnet** | 7 | Ressortwechsel nach der Regierungsbildung 2025: Entwurf des BMK, Kundmachung des BMWET, Titel gleich (EAG-Investitionszuschüsseverordnung-Strom-Novelle 2025 → BGBl. II Nr. 76/2025). Verordnung der Bundesregierung, Entwurf vom BMKOES, Titel gleich (zwei: → Nr. 214/2024, 215/2024). Titel umgeschrieben (drei: → Nr. 161/2025, 330/2024, 135/2024, Punktzahl 0,60 bis 0,68 unter der Schwelle 0,72). Zwei Kundmachungen mit demselben Titel, unentschieden (Luftverkehrsregeln 2014) |
| wahrscheinlich kundgemacht, nicht sicher | 3 | u. a. „Flüssiggas-Verordnung 2024", kundgemacht als „Flüssiggas-Verordnung 2025" nach 594 Tagen, außerhalb des Fensters von 540 |
| keine Kundmachung mit ähnlichem Titel | 5 | Kompostverordnung 2024; Eichvorschriften für Tarifgeräte; Grundausbildungsverordnung BMLV (zwei Entwürfe desselben Vorhabens); Transparenzdatenbank-Veröffentlichungsverordnung |

Unter den Entwürfen, die tatsächlich Verordnung wurden, findet die Regel
also 180 von 187 bis 190, rund 95 %. Die 85 % sind keine Fehlerquote: Sie
bestehen aus jungen Entwürfen, aus Entwürfen, die nie erlassen wurden, und
zu etwa einem Sechstel aus echten Fehlern der Zuordnung.

### Was der Satz „ohne Begutachtung" bräuchte: die Gegenrichtung

Der Satz geht von der Kundmachung aus, nicht vom Entwurf. Gemessen am
Jahrgang 2025 von BGBl. II (344 Datensätze: 313 Verordnungen, 28
Kundmachungen, 3 Sonstiges), gegen alle Verordnungsentwürfe mit Fristende
ab 01.05.2023:

| | Verordnungen 2025 |
|---|---|
| mit zugeordnetem Entwurf im RIS | 75 (24 %) |
| ohne | 238 |
| … davon von Ministerien und Bundeskanzleramt | 203 |
| … davon FMA, E-Control, RTR/TKK | 27 |
| … davon andere Stellen | 8 |

Von den 238 hat bei 134 kein Entwurf desselben Ressorts auch nur eine
entfernte Ähnlichkeit (Punktzahl unter 0,3), bei 42 eine schwache, bei 55
eine mittlere (0,5 bis 0,72), bei 7 eine über der Schwelle, die die Regel
trotzdem nicht annimmt. Stichproben aus jeder Gruppe gelesen:

- **Die mittlere Gruppe ist kein Beinahe-Treffer**, sondern Gleichklang von
  Formeln: „Festsetzung des Mindestlohntarifs für …" gegen einen fremden
  Entwurf desselben Ressorts.
- **Die sieben über der Schwelle** sind Jahresverordnungen
  (Mauttarifverordnung 2025, Vignettenpreisverordnung 2025,
  Fahrverbotskalender 2025, Transparenzdatenbank-Abfrageverordnung 2025),
  deren Entwurf des Vorjahres der Vorjahresverordnung gehört, und zwei der
  oben genannten Fehler.
- **Die Masse** sind wiederkehrende Akte: Erklärungen von Kollektivverträgen
  zur Satzung, Mindestlohn- und Heimarbeitstarife, Kaufkraftausgleichszulagen,
  Nachträge zum Arzneibuch, Valorisierungen, Section-Control-Messstrecken.

Damit „kein Entwurf existierte" belegt wäre, müssten drei Dinge feststehen:

1. **Die Zuordnung übersieht keinen Entwurf.** Sie übersieht etwa 5 %
   derer, die es gibt; bei 75 Zugeordneten wären das rund vier, also knapp
   2 % der 238 Zeilen falsch. Das ist klein und zum Teil behebbar
   („Nebenbefunde"). Daran scheitert es nicht.
2. **Das RIS hält jeden Verordnungsentwurf, den ein Ministerium aussendet.**
   Dafür gibt es keinen Zeugen. Bei Gesetzen ist das Parlament die zweite
   Quelle, und dort fehlten dem RIS 12 von 350 Ministerialentwürfen der
   XXVII. GP (`decisions.md`, Messzahlen). Für Verordnungen gibt es keine
   zweite Quelle, an der sich das messen ließe.
3. **Es gab keine Begutachtung außerhalb des RIS.** Die Regulierungsbehörden
   begutachten auf eigener Seite (Teil 3); die Kammern haben ein
   Begutachtungsrecht ohne Veröffentlichung (§ 93 Abs. 2 AKG, § 10 WKG); das
   RIS führt als einbringende Stelle nur Ministerien und das
   Bundeskanzleramt (23 Stellen seit 2023, alle geprüft). Eine Kundmachung in
   BGBl. II trägt kein Feld, das eine Begutachtung nennt oder verneint, und
   anders als beim Gesetz gibt es keine Erläuterungen und keinen
   Ausschussbericht, in denen sich ein Hinweis lesen ließe.

### Gibt es eine Teilmenge, in der das Fehlen belegbar ist?

**Nein, nicht für „ohne Begutachtung".** Die Bedingungen 2 und 3 gelten für
jede einzelne Verordnung; keine Gruppe ist davon ausgenommen. Für die
Regulierungsbehörden ist sogar das Gegenteil bekannt: Dort ist die
Begutachtung Pflicht und findet anderswo statt.

Belegbar ist nur ein engerer Satz, als Aussage über die Quelle: „Zu dieser
Verordnung führt das RIS keinen Begutachtungsentwurf." Er träfe 2025 auf
203 Verordnungen der Ministerien zu, wäre bei etwa vier davon falsch und
sagte bei den übrigen nichts darüber, ob jemand gefragt wurde. Als Zahl
stünde er als „76 % ohne Entwurf" da, und die meisten dieser Zeilen sind
Tarife und Jahreswerte, bei denen niemand eine Begutachtung erwartet. Das
wäre der Zähler, den die Regeln ausschließen, auf einer Aussage, die der
Leser weiter versteht, als sie trägt.

Was sich umgekehrt belegen lässt und schon gezeigt wird: die 75, die eine
hatten.

### Optionen

| Option | Was sie kostet | Was sie bringt |
|---|---|---|
| **Bauen**: Verordnungen aus BGBl. II als eigene Zeilen, mit „kein Entwurf im RIS" | technisch wenig (der Jahrgang wird schon gelesen, `getBgblTeil2Year`; ein Index in der Gegenrichtung); teuer ist die Aussage: ein Satz über das Suchergebnis, rund 240 Zeilen im Jahr, die meisten Routine, und eine Liste, die als Vorwurf gelesen wird | Vollständigkeit der Verordnungen eines Jahres; keine Beteiligung, denn sie sind schon erlassen |
| **Nur verlinken** | nichts Sinnvolles zu verlinken: Die Zeile hat keinen Ort, an dem jemand etwas tun kann | — |
| **Lassen**, mit berichtigtem Grund | ein Satz in `wege.ts` und einer in `decisions.md` | Die Grafik nennt den wahren Grund |

**Empfehlung: lassen, und den Grund berichtigen.** Die Grafik sagt heute
„Kundmachung zu rund 85 % auffindbar", `decisions.md` „waits until a
missing draft can be proven (the promulgation match finds about 85 %)".
Beides legt nahe, eine bessere Zuordnung würde den Weg öffnen. Die Messung
sagt etwas anderes: Die Zuordnung ist gut genug; es fehlt ein Zeuge dafür,
dass es keine Begutachtung gab, und den gibt es in keiner Quelle. Der Weg
ist damit nicht aufgeschoben, sondern mit den heutigen Quellen
geschlossen. Vorschlag für die Zeile: „nicht im Monitor: Keine Quelle sagt,
dass es keine Begutachtung gab".

## Nebenbefunde

Nicht Teil der Frage, bei der Messung aufgefallen:

1. **Zuordnung Entwurf → BGBl. II, zwei Fehlerklassen** (Teil 4), **am
   14.11.2026 behoben** in `ministryScore`
   (`server/utils/ris/ministryCodes.ts`): Der Wechsel der
   Energie-Zuständigkeit vom BMK zum BMWET 2025 fehlte in der Abstammung
   der Ressorts (Titel gleich, Punktzahl 1,0, Ressort 0). Und zwei
   Verordnungen der Bundesregierung, deren Entwurf und Kundmachung beide das
   BMKOES als Stelle tragen, bekamen Ressort 0, weil die Schreibweise nur
   auf einer Seite angeglichen wurde. Die drei Entwurfsseiten sagten nach
   180 Tagen „bisher nicht kundgemacht" über eine kundgemachte Verordnung.
   Nach der Korrektur über dasselbe Korpus: 263 statt 260 von 304, genau
   diese drei neu (BGBl. II Nr. 76/2025, 214/2024, 215/2024), keine
   bestehende Zuordnung verändert. Die Zahlen in Teil 4 sind die von davor.
   Die vier Fälle mit umgeschriebenem Titel und der unentschiedene bleiben.
2. **Liste 143 trägt die Zahl der Stellungnahmen und Unterstützungen je
   Gegenstand** in einem Abruf je Periode und Art, auch für
   Regierungsvorlagen, Anträge und Ausschussanträge. `api-exploration.md`
   kennt sie nur als Datensatz der offenen Beteiligungen.
3. **`status.number` 5 heißt bei Petitionen und Bürgerinitiativen nicht
   „abgeschlossen"**, entgegen der Datensatzbeschreibung des Parlaments.

## Offen

- Ob das Parlament die Zahl der Unterstützungen als von der Lizenz gedeckt
  ansieht; ob die Zahl der Stellungnahmen als Spalte der Liste 143 unter
  den Ausschluss fällt. Beides klärt nur eine Anfrage.
- Rechtsgrundlage der elektronischen Unterstützung: weiter nicht belegt.
- FMA: Seite, Form, Bedingungen, Zahl der Verfahren. Nur im Browser zu
  lesen.
- RTR: ob das Open-Data-Portal Konsultationen führt; ob die KommAustria
  eigene Begutachtungen auf der Medien-Seite der RTR veröffentlicht (die
  Sitemap nennt 49 Seiten dort, keine gelesen).
- E-Control: ob beendete Verfahren an anderer Stelle der Seite archiviert
  werden (`/bereich-recht/verordnungen`, nicht gelesen).
- Verlaufsvokabular der Petitionen und Bürgerinitiativen über mehrere
  Perioden; die Weiterleitung an Bundesregierung und Volksanwaltschaft kam
  in der XXVIII. GP nicht vor und ist damit ungemessen.
- Die drei „wahrscheinlich kundgemachten" Entwürfe in Teil 4 sind am Titel
  beurteilt, nicht am Text.
- Vollständigkeit des RIS für Verordnungsentwürfe der Ministerien: nicht
  messbar ohne zweite Quelle; eine Anfrage an das Bundeskanzleramt wäre die
  einzige.

## Quellen

Parlament, abgefragt 14.11.2026:

- „Daten und Lizenz" — parlament.gv.at/recherchieren/open-data/daten-und-lizenz/index.html; Datensatzseiten `petitionen`, `buergerinitiativen`, `beteiligungen` darunter.
- Filter-API: Liste 101 (`ITYP` `PET`, `BI`, GP XXV–XXVIII; `VHG` `VOLKBG`), Liste 143 (`GP_CODE`, `ITYP`; einmal ungefiltert), Liste 305 (ein Gegenstand, `pagesize=1`, nur `count` und Kopfzeile gelesen).
- Detail-JSON aller 29 Petitionen und 36 Bürgerinitiativen der XXVIII. GP, `/gegenstand/XXVIII/PET/<n>?json=True`, `/gegenstand/XXVIII/BI/<n>?json=True`.

RIS, `data.bka.gv.at/ris/api/v2.6/Bundesrecht`, abgefragt 14.11.2026:

- `Applikation=Begut`, alle 47 Seiten; `Applikation=BgblAuth` mit `VonKundmachungsdatum`/`BisKundmachungsdatum` für 01.11.2023 bis 14.11.2026, 24 Seiten.
- Zuordnung: `server/utils/ris/bgblJoin.ts` (`bgblVerdict`, `bgblCandidates`), `risJoin.ts` (`classifyRisRecord`), unverändert.

Regulierungsbehörden, abgefragt 14.11.2026:

- E-Control: `robots.txt`, `sitemap.xml`, Startseite, `/recht`, `/bereich-recht/aktuelle-begutachtungsentwuerfe`, `/econtrol/links/impressum`.
- RTR: `robots.txt`, `sitemap.xml`, die beiden Seiten zur KEM-V 2026, `/rtr/footer/impressum.de.html`, `/rtr/service/opendata/OpenData.de.html`.
- FMA: `robots.txt` (HTTP 200); Startseite und `sitemap.xml` HTTP 403.

BMI: bmi.gv.at/411/alle_volksbegehren_der_zweiten_republik.html.
