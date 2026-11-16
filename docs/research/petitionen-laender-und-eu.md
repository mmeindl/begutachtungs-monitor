# Petitionen an die Landtage und an das Europäische Parlament

**15.11.2026.** Frage: Was bräuchte der Monitor, um die Einträge unter
„Weitere Wege, sich zu äußern" auf `/wege` zu verfolgen, die er heute nur
nennt? Die Konsultationen der Kommission und die Europäische
Bürgerinitiative sind in `umsetzungsplan-eu-zyklus.md` (Schritte 2, 3 und 5)
schon geplant und hier nicht wiederholt. Volksabstimmung und Volksbefragung
sind so selten, dass es nichts zu verfolgen gibt (eine Liste, die
Jahrzehnte leer bliebe). Übrig bleiben die **Petition an das Europäische
Parlament** und die **Petitionen an die Landtage**; um sie geht es hier.

Nachbardokumente: `landtagsregister.md` (die erste Durchsicht der
Landtagsregister, auf der diese aufbaut), `wege-zu-einer-rechtsnorm.md`
(die Pflichten je Land, Tabelle „Petitionen und landesspezifische
Instrumente"), `eu-zyklus.md`, `docs/decisions.md` („A `robots.txt` that
excludes everything is a question to the publisher").

## Maßstab und Methode

Die drei Bedingungen aus `docs/decisions.md`: eine amtliche,
maschinenlesbare Quelle mit geprüfter Weiterverwendung; genug Fälle; keine
Pflege, die jemand von Hand tragen muss. Dazu die Regeln, die bei
Anliegen an den Nationalrat schon gelten: Privatpersonen werden gezählt,
nie genannt; Texte, die Bürgerinnen und Bürger geschrieben haben, werden
verlinkt, nie abgerufen.

Gelesen mit einfachen Anfragen (curl mit seiner eigenen Kennung, keine
vorgetäuschte Browserkennung), je Host wenige Anfragen mit Pause. Wo ein
Host Programme abweist, wurde das nicht umgangen. Die Seite des
Petitionsportals des Europäischen Parlaments wurde über das Abrufwerkzeug
der Sitzung gelesen, das wie ein Seitenaufruf wirkt. Namen von
Einbringerinnen und Einbringern, die in Titeln stehen, sind hier nicht
wiedergegeben.

## Auf einen Blick

| | Quelle | Fälle | Weiterverwendung | Empfehlung |
|---|---|---|---|---|
| EP, Petition | Portal ohne Schnittstelle; weist Programme ab (HTTP 403, auch für `robots.txt`) | 1.217–1.573 im Jahr, EU-weit | Wiederverwendung mit Quellenangabe erlaubt, Umgehung technischer Maßnahmen untersagt | verlinken, nicht verfolgen |
| Oberösterreich | Landtagsinformationssystem, Typen „PET" und „PETAT" (Beantwortung) | 281 in der XXIX. GP, 270 Beantwortungen | „kostenlos zur Weiterverwendung", mit Quellennachweis | bauen, als erstes Land |
| Vorarlberg | LIS (Domino), Typ „Petition" | 86 seit 1979, 4–6 im Jahr | keine Aussage zu Texten | bauen, nach Klärung der Weiterverwendung |
| Burgenland | Domino-Ansicht „Petitionen — nach Zahl" | 52 in der XXII. GP, 3 in der XXIII. | keine Aussage | bauen, nach Klärung; Einzelseite offen |
| Tirol | Petitionsübersicht auf `lte.tirol.gv.at`, mit elektronischer Zustimmung | nicht gelesen | `robots.txt` sperrt alles | erst den Landtag fragen |
| Steiermark | Petitionsplattform hinter einer Sicherheitsprüfung (CAPTCHA) | nicht gelesen | — | nicht lesbar; den Landtag fragen |
| Wien | Petitionsplattform, gut lesbar | laufend, mit Unterstützungszahl | — | nicht verfolgen: Gemeindeverwaltung, keine Gesetzgebung |
| Salzburg, Niederösterreich, Kärnten | kein Typ „Petition" im Register (NÖ: „Eingabe an den Landtag"; Kärnten nur in Sitzungs-PDFs) | — | — | Lücke benennen |

## 1. Petition an das Europäische Parlament

**Rechtsgrundlage.** Art. 227 AEUV; Art. 232 und 233 der Geschäftsordnung
des Parlaments. Der Petitionsausschuss (PETI) prüft die Zulässigkeit, kann
die Petition behandeln, die Einbringerin oder den Einbringer einladen,
einen Bericht oder eine Entschließung vorschlagen und die Kommission, den
Rat oder eine Behörde eines Mitgliedstaats um Stellungnahme bitten (Art.
233 Abs. 6). Eine Pflicht zu einem bestimmten Ergebnis gibt es nicht
(EPRS-Briefing PE 767.225, 2025).

**Fälle.** In der neunten Wahlperiode 6.991 Petitionen: 1.357 (2019), 1.573
(2020), 1.392 (2021), 1.217 (2022), 1.452 (2023). Abgeschlossen werden „im
Schnitt zwischen 500 und 650 im Jahr". Wie viele Österreich betreffen,
steht im Briefing nur in einer Grafik (Abbildung 2), nicht als Zahl;
nicht gelesen.

**Quelle.** Das Petitionsportal
(`https://www.europarl.europa.eu/petitions/en/show-petitions`) bietet eine
Suche nach Stichwort, Jahr (2013 bis heute), Thema, Status („Available to
supporters", „Not available to supporters", „Closed", „Not admissible") und
betroffenem Land (darunter „Austria"). Einen Download, eine CSV- oder
JSON-Ausgabe oder eine Schnittstelle bietet es nicht; die Suchergebnisse
baut die Seite erst im Browser auf (im statischen HTML „Search results 0").
Die dokumentierte Open-Data-API des Parlaments
(`https://data.europarl.europa.eu/api/v2`) führt Abgeordnete, Sitzungen,
Verfahren, Dokumente und Anfragen, **keine Petitionen**. Auf data.gv.at
und in den Datensätzen des Parlaments ist kein Petitionsdatensatz zu
finden.

**Zugang für Programme.** `www.europarl.europa.eu` antwortet einem Skript
auf jede Adresse mit HTTP 403, auch auf `/robots.txt` (wie schon der
rechtliche Hinweis in `eu-zyklus.md`, 1.4).

**Weiterverwendung.** Rechtlicher Hinweis des Parlaments: „As a general
rule, the reuse (reproduction or use) of textual data and multimedia items
… is authorised, for personal use or for further non-commercial or
commercial dissemination, provided that the entire item is reproduced and
the source is acknowledged." Und: „The user undertakes not to seek to
circumvent the technical measures put in place to protect documents and
multimedia items". Ein Leser, der die Sperre für Programme umginge, stünde
gegen diesen Satz.

**Unterstützen.** Nur mit einem Konto des Portals; „For privacy reasons,
only the number of supporters is visible to the public and petitioner."
Nicht möglich für unzulässige oder abgeschlossene Petitionen. Petitionen
erscheinen erst, nachdem der Ausschuss sie angenommen hat; „Certain
petitions are not published."

**Personendaten.** Datenschutzhinweis des Portals: „registered petitions
are public documents. This means that your identity, the number given to
the petition and the personal data contained therein … may be made
available on the internet website of the European Parliament." Auf
Wunsch wird der Name zurückgehalten und die Petition anonymisiert.

**Einschätzung.** Keine maschinenlesbare Quelle, und die vorhandene weist
Programme ab. Der Weg bleibt ein Link. Ob die Suche mit „Austria" eine
teilbare Adresse ergibt, auf die `/wege` zeigen könnte, ist nicht geprüft
(die Seite baut sich im Browser auf).

## 2. Die Länder

### Oberösterreich

**Recht.** Art. 64 Oö. L-VG: Petitionen sind „in Behandlung zu nehmen und
zu beantworten". Eingebracht formlos über die Landtagsdirektion oder
online (`lisng_petition.htm`, ein Formular mit Sicherheitsprüfung, ohne
Liste). Eine elektronische Unterstützung gibt es nicht.

**Quelle.** Das Landtagsinformationssystem, das der Monitor für die
Begutachtungsentwürfe schon liest
(`www2.land-oberoesterreich.gv.at/internetltgbeilagen/`). Die Suche
verlangt eine Sitzung und das **vollständige** Formular: mit nur dem Typ
antwortet sie „Ein unerwarteter Fehler ist aufgetreten"; mit allen Feldern
und ihren Vorgaben antwortet sie. Seitengrößen bis 500.

**Fälle,** je Periode, Typ „PET" und „PETAT" (Beantwortungen):

| GP | Petitionen | Beantwortungen | Petition mit Beantwortung gleichen Betreffs |
|---|---|---|---|
| XXIX (seit 23.10.2021) | 281 | 270 (eine davon unter „PET" abgelegt) | 170 |
| XXVIII (2015–2021) | 382 | 378 | 170 |

Nach Jahr (XXIX): 2021 6, 2022 111, 2023 38, 2024 92, 2025 16, 2026 18.

**Wer einbringt** (aus dem Titel, XXIX): 189 Gemeinden und Städte, 46
Vereine, Organisationen und andere, 46 Privatpersonen („Petition von
Herrn/Frau …"; eine Untergrenze, weil nur diese Formulierung gezählt ist).
In XXVIII: 226, 81, 75. Petitionen in Oberösterreich sind überwiegend ein
Werkzeug der Gemeinden.

**Was eine Zeile trägt:** Dokumentnummer mit Jahr (`21276/2026`), Typ,
Gegenstand. **Der Gegenstand nennt bei Privatpersonen deren Namen**, bei
Gemeinden und Vereinen deren Namen. Beantwortungen heißen „Beantwortung
der Petition … betreffend …".

**Was nicht gelesen ist.** Die Einzelseite: die Adresse, die für Entwürfe
funktioniert (`InternetLtgBeilagenAnzeige2020.jsp?jahr=…&nummer=…`),
antwortet für eine Petition und eine Beantwortung mit „FEHLER"; die
Trefferzeile setzt `nummer` und `jahr` ins Suchformular (dieselbe Wand wie
bei Anträgen, `landtagsregister.md`). Ob die Einzelseite Petition und
Beantwortung verknüpft, ein Eingangsdatum oder einen Ausschuss nennt,
ist offen.

**Die Verknüpfung über den Betreff reicht nicht:** gleicher Wortlaut nach
„betreffend" verbindet 170 von 281 Petitionen der XXIX. GP mit einer
Beantwortung, obwohl es 270 Beantwortungen gibt. Die übrigen weichen im
Wortlaut ab oder tragen einen Gesamttitel.

**Weiterverwendung.** Nutzungsbedingungen des Landes (in
`landtagsregister.md` zitiert): „Sämtliche Informationen, Daten und
Dokumente auf den Internetseiten des Landes Oberösterreich stehen
kostenlos zur Weiterverwendung bereit, sofern nicht bei der konkreten
Information anderes festgelegt ist … entsprechende Quellennachweise (z.B.
„Quelle: Land Oberösterreich") anzuführen." Ob das Informationssystem als
„Internetseite des Landes" gilt, sagt die Seite nicht. Die Petition selbst
ist der Text der Einbringenden und kein amtliches Werk; sie wäre wie eine
Stellungnahme zu verlinken. Die Beantwortung ist ein Schreiben eines
Landesorgans.

### Vorarlberg

**Recht.** Art. 10 L-V: Petitionen müssen „innerhalb von drei Monaten
beantwortet werden".

**Quelle.** LIS (Domino), Suche
`vlr_gov.nsf/alldocs?SearchView&Query=FIELD fd_TypeOfDocumentTX Contains
"Petition"`, sortierbar nach Datum. **86 Dokumente seit 1979**; je Jahr
seit 2012: 3, 3, 6, 6, 1, 7, 6, 5, 3, 11, 3, 6, 4, 4, 4 (2026). Jede
Zeile trägt eine Domino-ID, Titel, Typ, Jahr.

**Einzelseite** (`vlr_gov.nsf/0/<id>?OpenDocument`): Titel, Landtagsperiode,
Typ, „Eingelangt in der Landtagsdirektion" mit Datum. Anders als bei
Anträgen keine Zuweisung, keine Behandlung, kein Status. Ob die Antwort
als eigenes Dokument im LIS steht, ist nicht geprüft. Die gelesenen Titel
nennen keine Person.

**Weiterverwendung.** Das Impressum des Landes spricht nur über Bilder;
zu Texten nichts. Keine `robots.txt`.

### Burgenland

**Recht.** § 34 GO Landtag: Petitionsausschuss; Petitionen sind
„schriftlich zu beantworten oder hierüber dem Landtag zu berichten".

**Quelle.** Domino-Ansichten `PetZahl_GPXXII.xsp` (52 Petitionen, zwei
Seiten) und `PetZahl_GPXXIII.xsp` (3, seit 2025). Spalten Zahl und Betreff
(„Petition betreffend „…""); die Einzelseite öffnet sich über eine
XPages-Rückmeldung, nicht über eine Adresse (keine Links im HTML). Ob sie
die Zeitleiste der Vorlagen trägt (Einbringung, Zuweisung, Behandlung,
Beschluss), ist nicht geprüft.

**Weiterverwendung.** Das Impressum des Landtags sagt nichts dazu.
`ltmobil.bgld-landtag.at/robots.txt`: 404.

### Tirol

**Recht.** Art. 12 TLO: „Das Petitionsrecht steht jedermann zu"; eine
Antwortpflicht ist nicht geregelt. Der Landtag (`tirol.gv.at/landtag/petitionen/`):
Petitionen gehen an den Petitionsausschuss; Erledigungen „beispielsweise
Weiterleitung an die Landesvolksanwältin oder an ein Regierungsmitglied,
aber auch die direkte Weiterleitung an den Tiroler Landtag in Form eines
Antrages". Seit 1. September 2013 eine **elektronische Zustimmung** zu
Petitionen und Bürgerinitiativen, „bis zum Abschluss der
Ausschussberatungen", mit Name, Postleitzahl, Ort und E-Mail. Sie „hat für
die Beratungen im Ausschuss und Landtag informativen Charakter". Das ist
das Muster des Nationalrats.

**Quelle.** „Petitionsübersicht",
`https://lte.tirol.gv.at/public/ggs/petition/petitionList.xhtml`. Der Host
sperrt in `robots.txt` alles (`landtagsregister.md`). Nach der Regel in
`docs/decisions.md` wird eine neue Quelle dort erst gefragt, dann gebaut;
**nicht gelesen.**

### Steiermark

**Recht.** Art. 76 L-VG 2010: „umgehend in Behandlung zu nehmen und zu
beantworten". Einbringen schriftlich, mit Signatur per E-Mail oder „online
mit digitaler Signatur im Wege der Petitionsplattform".

**Quelle.** Die Petitionsplattform
(`egov.stmk.gv.at/at.gv.stmk.petition-p/pub/public/index.xhtml`) antwortet
mit einer Sicherheitsprüfung: „Zum Schutz dieser Anwendung vor
automatisierten Zugriffen ist eine Sicherheitsprüfung erforderlich." Für
den Monitor **nicht lesbar**, und nicht zu umgehen. Im Landtagsregister
(PALLAST) gibt es keinen Typ „Petition", nur den „Bericht des
Petitionsausschusses (§ 32 Abs. 4 GeoLT)" (`landtagsregister.md`).

### Wien

**Recht.** Gesetz über Petitionen in Wien (RIS 20000324), § 1 Abs. 1:
Petitionen, die von mindestens 500 Personen ab 16 mit Hauptwohnsitz in Wien
unterstützt sind „und 2. eine Angelegenheit der Verwaltung der Gemeinde
einschließlich der Bezirke betreffen", behandelt der Petitionsausschuss
**des Gemeinderates**. Unterstützen ein Jahr ab Veröffentlichung (§ 1 Abs.
5), elektronisch mit ID Austria (§ 1 Abs. 2). Der Ausschuss holt
Stellungnahmen ein und veröffentlicht sie (§ 3 Abs. 4, 5); die Petition ist
schriftlich zu beantworten, Beantwortung und Protokolle werden
veröffentlicht (§ 5 Abs. 1). § 1 Abs. 4: „Der Vor- und Familienname der
einbringenden Person ist jedenfalls zu veröffentlichen."

**Quelle.** `www.wien.gv.at/petition/online/`: eine Liste mit
Einbringungsdatum, Titel, Zahl der Unterstützungen und Status
(„Freigegeben", „Ausgezählt"), je Petition eine Detailseite mit Status
(„500 Unterstützungen erreicht"), „Eingebracht von", dem Text und
„Stellungnahme(n)/Beantwortung(en)". `robots.txt` sperrt `/petition/`
nicht. Die bestlesbare Quelle aller Länder.

**Einschätzung.** Nicht verfolgen. Die Wiener Petition betrifft nach dem
Gesetz die Verwaltung der Gemeinde (eine Straße, ein Park, ein
Bauvorhaben), keine Gesetzgebung; der Monitor folgt dem Weg einer Norm.
Ob es in Wien einen Petitionsweg zum Landtag als Gesetzgeber gibt, ist
nicht geprüft.

### Salzburg, Niederösterreich, Kärnten

Salzburg (Art. 55 L-VG: ein Beschluss des Landtags nur, „wenn sie von einem
Mitglied des Landtages oder der Landesregierung unterstützt wird"): kein
Typ „Petition" im Register. Niederösterreich: kein Typ „Petition", ein
Typ „Eingabe an den Landtag (EL)"; ob Petitionen darunter stehen, nicht
geprüft. Kärnten: kein Register, Petitionen nur in den PDFs je Sitzung
(`landtagsregister.md`).

## Was sich nicht zeigen lässt, und warum

- **Was aus einer Petition wurde,** über die Beantwortung hinaus. Keine
  Quelle verknüpft eine Petition mit einem späteren Gesetz, wie schon im
  Nationalrat.
- **Der Text der Petition.** Er stammt von den Einbringenden, ist kein
  amtliches Werk und wird verlinkt, nie gelesen.
- **Wer einbringt, wenn es eine Person ist.** In Oberösterreich steht der
  Name im Titel; der Titel muss vor der Anzeige gekürzt werden.
- **Tirol und Steiermark,** solange der Landtag nicht geantwortet hat: die
  einzige Quelle sperrt Programme aus.
- **Die Petition an das Europäische Parlament:** keine Quelle für Programme.

## Offen

1. Die Einzelseite in Oberösterreich (über das Suchformular mit `nummer`
   und `jahr`) und ob sie Petition und Beantwortung verknüpft.
2. Die Einzelseite in Burgenland (XPages-Rückmeldung).
3. Ob Antworten in Vorarlberg als eigenes Dokument im LIS stehen.
4. Ob das Informationssystem Oberösterreichs unter die Nutzungsbedingungen
   des Landes fällt; die Weiterverwendung in Vorarlberg und Burgenland.
5. Wie viele Petitionen an das Europäische Parlament Österreich betreffen.
6. Ob es in Wien einen Petitionsweg zum Landtag gibt.

## Quellen

- Gesetz über Petitionen in Wien, RIS LrW 20000324 (gelesen 15.11.2026).
- Geschäftsordnung des Bundesrates § 25 (für den Vergleich; RIS 10000976).
- Europäisches Parlament: Petitionsportal, Seiten „How do I support a
  petition?", „How is my petition treated?", Datenschutzhinweis des Portals
  (PDF), rechtlicher Hinweis `https://www.europarl.europa.eu/legal-notice/en`;
  EPRS, „The right to petition the European Parliament", PE 767.225 (2025);
  Open-Data-API `https://data.europarl.europa.eu/api/v2`.
- Oberösterreich: `internetltgbeilagen/Start.jsp` und die Suche, Typen PET
  und PETAT, GP XXIX und XXVIII (15.11.2026); `274702.htm`.
- Vorarlberg: `suche.vorarlberg.at/VLR/vlr_gov.nsf` (Suche und eine
  Einzelseite).
- Burgenland: `ltmobil.bgld-landtag.at/vorlagen.nsf/PetZahl_GPXXII.xsp`,
  `…_GPXXIII.xsp`.
- Tirol: `www.tirol.gv.at/landtag/petitionen/`.
- Steiermark: `www.landtag.steiermark.at/cms/beitrag/12557087/122783133/`,
  `egov.stmk.gv.at/at.gv.stmk.petition-p/…`.
- Wien: `www.wien.gv.at/petition/online/` und eine Detailseite;
  `www.wien.gv.at/robots.txt`.
- data.gv.at, Suche „Petition" (ein Treffer: Petitionen des Parlaments).
