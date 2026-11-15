# Landtagsregister: was sie außer Begutachtungsentwürfen führen

**Stand 14.11.2026** (gelesen am 14. und 15.11.2026). Eine Frage: Führen die
Register der Landtage, aus denen der Monitor Begutachtungsentwürfe liest
(Oberösterreich, Tirol, Steiermark, Kärnten), auch (a) Anträge von
Abgeordneten, (b) Anträge oder Berichte von Ausschüssen, (c) Petitionen und
(d) Volksbegehren, Bürgerinitiativen, Volksbefragungen? Und: Hat jeder der
anderen fünf Landtage überhaupt ein lesbares Register?

Gelesen heißt: die Such- und Listenseite des Registers abgerufen, je Typ
höchstens eine Liste und ein Beispiel, eine Anfrage nach der anderen, mit
mindestens drei Sekunden Abstand (PALLAST fünf). Gezählt heißt: die Zahl, die
das Register selbst über seiner Trefferliste nennt. Wo ein Typ zwar in der
Auswahl steht, aber nicht abgefragt wurde, steht das dabei. Die
Unterscheidung, um die es geht: „das Register führt es nicht" ist ein Befund,
„nicht geprüft" oder „heute nicht lesbar" ist keiner.

Die Nutzungsbedingungen sind wörtlich zitiert, mit Adresse. Eine rechtliche
Bewertung steht hier nicht.

## Die Antwort

Ja, für drei der vier Länder. Oberösterreichs Landtagsinformationssystem und
Steiermarks PALLAST sind keine Begutachtungsregister, sondern die
Gesamtregister ihrer Landtage: Sie führen Anträge von Abgeordneten mit
eigenem Typ und eigener Nummer, dazu Ausschussberichte und (Oberösterreich)
Petitionen. Tirols Landtagsevidenz ist nach dem Wortlaut des Landtags
dasselbe, wurde aber nicht gelesen: Ihre `robots.txt` sperrt den ganzen
Host. Kärnten hat kein Register des Landtags; der Landtag veröffentlicht je
Sitzung ein PDF der eingelangten Gegenstände, und darin stehen Anträge und
Petitionen.

Von den anderen fünf haben alle ein lesbares Register des Landtags, jedes
mit Anträgen von Abgeordneten. Einen eigenen Typ für Volksbegehren führt
nur Niederösterreich, und dort liefert die Suche nach ihm keinen Treffer.

## Überblick

„ja" heißt: Das Register führt den Typ, eine Liste wurde gelesen. „Typ
angeboten" heißt: Der Typ steht in der Auswahl des Registers, die Liste
wurde nicht abgerufen. „kein Typ" heißt: Die Auswahl des Registers nennt
keinen; ob die Gegenstände unter einem anderen Typ oder im Volltext stehen,
ist nicht geprüft.

| Land | Register | Anträge von Abgeordneten | Ausschüsse | Petitionen | Volksbegehren u. ä. |
|---|---|---|---|---|---|
| Oberösterreich | `www2.land-oberoesterreich.gv.at/internetltgbeilagen/` | ja: „Initiativantrag (IA)", 635 in der XXIX. GP | Typ angeboten: „Ausschussbericht (AB)", „Ausschuss (AS)" | ja: „Petitionen (PET)", 666 über alle Perioden | kein Typ |
| Tirol | `lte.tirol.gv.at/public/` | nicht gelesen (robots.txt) | nicht gelesen | nicht gelesen; der Landtag verlinkt eine „Petitionsübersicht" dort | nicht gelesen |
| Steiermark | `pallast2.stmk.gv.at/pallast-p/pub/documents` | ja: „Selbstständiger Antrag von Abgeordneten (§ 21 GeoLT)", 480 in der XIX. GP | Typ angeboten: „Bericht (§ 36 GeoLT)" | kein Typ „Petition"; Typ angeboten: „Bericht des Petitionsausschusses (§ 32 Abs. 4 GeoLT)" | kein Typ; ein Filter „Volksrechtegesetz" (nicht benutzt) |
| Kärnten | kein Register; PDF je Sitzung auf `ktn.gv.at/Politik/Landtag/Sitzungen` | ja, im PDF: „Anträge" (9 in der 40. Sitzung) | nur die „Zuweisung" je Antrag | ja, im PDF: „Petition" (1 in der 40. Sitzung) | nicht geprüft |
| Burgenland | `ltmobil.bgld-landtag.at/vorlagen.nsf/` | ja: „Klubvorlagen" (Initiativantrag, Selbständiger Antrag) | Ausschussbericht als Schritt im Gegenstand | ja: Ansicht „Petitionen", 52 in der XXII. GP | nicht geprüft |
| Niederösterreich | `noe-landtag.gv.at/gegenstaende` | ja: „IA", 665 Treffer | Typ angeboten: „AUA" Selbstständiger Antrag von Ausschüssen (§ 34 LGO 2001) | kein Typ „Petition"; Typ angeboten: „EL" Eingabe an den Landtag | Typ „ILGV" angeboten, Suche: 0 Treffer |
| Salzburg | `service.salzburg.gv.at/lpi/searchExtern` | ja: „Antrag", 702 Treffer in der 17. GP | Typ angeboten: „Ausschussbericht" (erscheint auch in der Antragsliste) | kein Typ | kein Typ |
| Vorarlberg | `suche.vorarlberg.at/VLR/vlr_gov.nsf/` | ja: „Selbstständiger Antrag", 2.265 Dokumente | Typ angeboten: „Ausschussvorlage" | ja: „Petition", 86 Dokumente | kein Typ |
| Wien | `www.wien.gv.at/infodat/` | ja: Typen „Initiativantrag", „Antrag", „Beschlussantrag" | kein Typ, der Ausschüsse nennt | kein Typ; in der Landtagssitzung ein „Bericht" über die behandelten Petitionen | kein Typ; „Volksbegehren", „Volksbefragung" als Schlagworte |

## Oberösterreich

**Register:** Landtagsinformationssystem „Landtagsbeilagen und -dokumente
(Landtagsmaterialien)",
`https://www2.land-oberoesterreich.gv.at/internetltgbeilagen/Start.jsp`. Ein
Suchformular mit GET-Parametern (`InternetLtgBeilagenSuche.jsp?…&beilageTyp=IA`);
es braucht eine Sitzung (Cookie `JSESSIONID…`), ohne sie antwortet es mit
`SessionLost.jsp`. Die Sitzung war nach einer Pause von einigen Stunden
verfallen.

**Typen:** Die Auswahl „Art" nennt 41 Typen, darunter „Initiativantrag (IA)",
„Antrag (A)", „Abänderungsantrag (ABA)", „Zusatzantrag (ZA)",
„Geschäftsantrag (GA)", „Ausschuss (AS)", „Ausschussbericht (AB)",
„Unterausschuss (UA)", „Petitionen (PET)", „Petitionen - Beantwortungen
(PETAT)", „Begutachtungsentwurf (BE)", „Bürgerinnen- und Bürgerbegutachtung
(BBG)", „Regierungsvorlage (RV)", „Kundmachung im LGBl (KULGBL)". Ein Typ für
Volksbegehren, Bürgerinitiative oder Volksbefragung steht nicht darin. Dazu
Filter nach Partei, Abgeordneten, Regierungsmitglied, Ausschuss, Art des
Beschlusses („angenommen", „abgelehnt", „eingebracht") und Eingangsdatum.
„Die vollständige Abfrage ist ab der XXV. Gesetzgebungsperiode (Beilage
1/1997 vom 31. Oktober 1997) möglich."

**Anträge von Abgeordneten:** Typ IA, XXIX. GP: „Zeilen 1 bis 10 von 635".
Je Zeile Nummer/Jahr (`985/2024`), Typ und Gegenstand, z. B. „Initiativantrag
betreffend gesetzliche Verankerung des Heizkostenzuschusses". Die Seite des
einzelnen Antrags wurde nicht erreicht: Die Adresse, die der Monitor für
Begutachtungsentwürfe nutzt (`InternetLtgBeilagenAnzeige2020.jsp?jahr=…&nummer=…`),
antwortet für `jahr=2024&nummer=985` mit „FEHLER: Informationen zur
Landtagsbeilage konnten nicht geladen werden"; Entwürfe tragen dort eine
Dokumentnummer (16000er), Anträge eine Beilagennummer. Der Klick auf eine
Trefferzeile (dasselbe Formular mit `nummer`/`jahr`) brachte das Suchformular
zurück. Was ein Antrag trägt, ist damit nicht gelesen.

**Ausschüsse:** Typen AB und AS angeboten; nicht abgefragt (die Abfrage fiel
in die verfallene Sitzung).

**Petitionen:** Typ PET, alle Perioden: „Zeilen 1 bis 50 von 666". Die
Petitionen tragen Dokumentnummern (`21390/2021`); die höchste Nummer der
ersten Seite ist `26029/2022`, eine „Beantwortung der Petition". Ob
Petitionen nach 2022 unter PET stehen, ist aus der ersten Seite nicht zu
sagen; nicht geprüft. Eingebracht von Gemeinden, Vereinen, Bürgerinitiativen
und Parteiorganisationen.

**Volksbegehren u. ä.:** kein Typ. Die Seite „Bürgerinnen- und
Bürgerrechte" des Landtags (`https://www.land-oberoesterreich.gv.at/12167.htm`)
nennt „Bürgerinnen- und Bürger-Initiative sowie die Bürgerinnen- und
Bürger-Abstimmung" und Petitionen („von den Abgeordneten im
Petitionsausschuss beraten"); ob eine Bürgerinitiative im Register steht,
ist nicht geprüft.

**Weiterverwendung:** `https://www2.land-oberoesterreich.gv.at/robots.txt`
antwortet 404. Die Nutzungsbedingungen des Landes
(`https://www.land-oberoesterreich.gv.at/nutzungsbedingungen.htm`),
Abschnitt „Informationsweiterverwendung": „Sämtliche Informationen, Daten
und Dokumente auf den Internetseiten des Landes Oberösterreich stehen
kostenlos zur Weiterverwendung bereit, sofern nicht bei der konkreten
Information anderes festgelegt ist, und die Nutzung bzw. Weiterverwendung
rechtmäßig erfolgt. […] Bei der Weiterverwendung sind die Nutzungsrechte des
Landes Oberösterreich sowie etwaiger Dritter zu wahren und entsprechende
Quellennachweise (z.B. „Quelle: Land Oberösterreich") anzuführen." Ob das
Landtagsinformationssystem als „Internetseite des Landes" gilt, sagt die
Seite nicht; das Register selbst nennt keine eigenen Bedingungen.

## Tirol

**Register:** Landtagsevidenz, `https://lte.tirol.gv.at/public/index.xhtml`
(vom Landtag als „Parlamentarische Materialien" verlinkt: „die jeweiligen
Tagesordnungen zu den Sitzungen sowie die behandelten
Verhandlungsgegenstände").

**Nicht gelesen.** `https://lte.tirol.gv.at/robots.txt` lautet:

```
# hier gibt es nichts zu sehen
User-agent: *
Disallow: /
```

Danach wurde an diesen Host keine Anfrage mehr gestellt. (Die Wurzel des
Hosts leitet auf die Anmeldung des Landes um, `login.tirol.gv.at`, SAML; der
öffentliche Teil liegt unter `/public/`.) Der Monitor liest
Begutachtungsentwürfe von diesem Host (`server/utils/laender/tirol.ts`).

**Was der Landtag über das Register sagt** (`www.tirol.gv.at`, gelesen):

- „Rechtliches" (`https://www.tirol.gv.at/landtag/wissenswertes/rechtliches/`):
  „Die zur Begutachtung ausgesandten Entwürfe […] sowie die in den Landtag
  eingebrachten Regierungsvorlagen sind in der Landtagsevidenz abrufbar.
  […] wobei letztere weiterführende Informationen wie Entstehung und
  Werdegang sowie sämtliche dazugehörige Protokolle enthält."
- „Petitionen" (`https://www.tirol.gv.at/landtag/petitionen/`): verlinkt eine
  „Petitionsübersicht" in der Evidenz
  (`https://lte.tirol.gv.at/public/ggs/petition/petitionList.xhtml`) — „eine
  Aufstellung der an den Tiroler Landtag gerichteten Petitionen, die man auch
  elektronisch unterstützen kann" —, seit 1. September 2013 mit
  elektronischer Zustimmung „zu Petitionen und zu BürgerInneninitiativen".
  Zustimmende werden namentlich gelistet, wenn sie der Veröffentlichung
  zustimmen.

Ob die Evidenz Anträge von Abgeordneten, Ausschussanträge oder Volksbegehren
führt, ist nicht geprüft.

**Weiterverwendung:** Impressum des Landes, gilt laut eigenem Hinweis „für
alle Online-Medien des Landes Tirol" (`https://www.tirol.gv.at/impressum/`),
Punkt 2: „Sämtliche Inhalte, das Layout, allfällige Ton- und
Videosequenzen, etc. sind durch das Urheberrecht und andere Rechte
geschützt. Alle diese Rechte bleiben dem Land Tirol vorbehalten. […] Wenn
Sie Informationsdienste dieser Webseite für andere Zwecke als zu ihrer
persönlichen Information verwenden wollen, müssen Sie zuvor einen Antrag nach
dem Tiroler Informationsweiterverwendungsgesetz stellen. Das bloße Verlinken
auf Inhalte dieser Webseite steht grundsätzlich jedermann frei […].
Gesonderte Lizenzen und Nutzungsbedingungen gelten für: Open Government
Data". Ob `lte.tirol.gv.at` zu den dort aufgezählten Online-Medien gehört,
sagt das Impressum nicht (es nennt `www.tirol.gv.at`, die App,
`eap.tirol.gv.at` und `data.tirol.gv.at`).

## Steiermark

**Register:** PALLAST, XIX. GP,
`https://pallast2.stmk.gv.at/pallast-p/pub/documents`. Vier Anfragen,
fünf bis sechs Sekunden Abstand, keine 403. Die Liste lässt sich über den
URL-Parameter `type=` filtern (wie der Monitor es für
`BEGUTACHTUNGSVERFAHREN` tut); weitere Filter sind Postbacks. Ohne Filter:
„3212 Treffer".

**Typen:** Die Auswahl „Typ wählen" nennt 40 Typen, darunter
„Selbstständiger Antrag von Abgeordneten (§ 21 GeoLT)", „Antrag allg.
(Landtag)", „Abänderungsantrag (§ 46 GeoLT)", „Unselbstständiger
Entschließungsantrag (§ 51 GeoLT)", „Misstrauensantrag", „Bericht (§ 36
GeoLT)", „Bericht des Petitionsausschusses (§ 32 Abs. 4 GeoLT)",
„Regierungsvorlage", „Beschluss", „Begutachtungsverfahren (§ 24 GeoLT iVm Art
68 L-VG)". Kein Typ „Petition", kein Typ für Volksbegehren. Daneben Filter
nach Fraktion, Ausschuss (darunter „Petitionen"), Regierungsmitglied,
Abgeordneten und die Kästchen „nur Gesetze", „Folgeanträge ausblenden" und
„Volksrechtegesetz" (nicht benutzt, ein Postback).

**Anträge von Abgeordneten:** `?type=SELBSTAENDIGER_ANTRAG`: „480 Treffer",
je Zeile Betreff, EZ/OZ (`1784/1`) und Fraktion. Beispiel `1784/1`, „Gesetz
vom […], mit dem das Steiermärkische Kultur- und Sportförderungsabgabegesetz
geändert wird" (`document?ref=ca589780-…`): Periode, EZ/OZ, Typ, „eingebracht
am 04.11.2026, 19:19:36", Antragsteller, Fraktionen, zuständiger Ausschuss,
Regierungsmitglied, Beilage (`.docx`), Begründung und Antragstext, PDF. Ein
Weg nach der Einbringung stand auf dieser Seite nicht (der Antrag war elf
Tage alt); ob spätere Schritte dort erscheinen, ist nicht geprüft.

**Ausschüsse:** Typ „Bericht (§ 36 GeoLT)" angeboten, nicht abgerufen.

**Petitionen:** kein Typ im Register; der Bericht des Petitionsausschusses ist
einer. Die Seite des Landtags „Petitionen an den Landtag Steiermark"
(`https://www.landtag.steiermark.at/cms/ziel/134911953/DE/`) nennt die
Einbringung schriftlich, mit Signatur per E-Mail oder „online mit digitaler
Signatur im Wege der Petitionsplattform"
(`https://egov.stmk.gv.at/at.gv.stmk.petition-p/pub/public/index.xhtml`); sie
sagt nicht, dass Petitionen veröffentlicht werden. Die Plattform antwortete
mit „Please enable JavaScript to view the page content" und einer
„support ID"; nicht weiter abgefragt.

**Volksbegehren u. ä.:** kein Typ; Filter „Volksrechtegesetz" nicht benutzt.

**Weiterverwendung:** Impressum von PALLAST
(`https://pallast2.stmk.gv.at/pallast-p/pub/impressum`): nur „Verantwortlich
für Inhalt und Text: Direktion Landtag Steiermark" mit Anschrift; zur
Weiterverwendung nichts. Das Impressum, das die Seite des Landtags verlinkt,
ist das des Landes (`https://www.landtag.steiermark.at/cms/ziel/5198747/DE`,
leitet auf `www.verwaltung.steiermark.at` um): „Texte, Bilder, Grafiken,
Sound, Animationen und Videos unterliegen dem Schutz des Urheberrechts und
anderer Schutzgesetze. Jede Nutzung, insbesondere die Speicherung in
Datenbanken, Vervielfältigung, Verbreitung, Bearbeitung und jede Form von
gewerblicher Nutzung sowie die Weitergabe an Dritte - auch in Teilen oder in
überarbeiteter Form - ohne Zustimmung des oder der Betreiber*in bzw.
Urheber*in ist untersagt." PALLASTs `robots.txt`: nicht abgerufen (Budget
von vier Anfragen).

## Kärnten

**Ein Register des Landtags gibt es nicht** — gesucht auf drei Wegen:

- Die Seiten des Landtags liegen im CMS des Landes
  (`https://www.ktn.gv.at/Politik/Landtag`): Besucherservice, Mediathek,
  Sitzungen, Protokolle, Abgeordnete. Keine Liste und keine Suche von
  Gegenständen.
- Die Adresse, die der Landtag in seinen PDFs nennt,
  `www.kaerntner-landtag.ktn.gv.at`, hat kein passendes TLS-Zertifikat;
  `https://kaerntner-landtag.ktn.gv.at/` leitet auf
  `www.ktn.gv.at/Politik/Landtag` um.
- `www.kaerntner-landtag.at` leitet auf die Seite eines Landtagsklubs um,
  nicht auf den Landtag.

**Was der Landtag veröffentlicht:** je Sitzung ein PDF „Eingelangte
Verhandlungsgegenstände" und eine „Einladung" mit Anlagen
(`https://www.ktn.gv.at/Politik/Landtag/Sitzungen`), dazu Landtagsfahrpläne.
Das PDF der 40. Sitzung vom 22. Oktober 2026 (zwei Seiten) führt unter
„Anträge:" neun „Antrag von Abgeordneten des …-Klubs betreffend …", je mit
„Zuweisung: Ausschuss für …", und unter „Petition:" eine „Petition vom
22.10.2026 betreffend aktive Erinnerungskultur und entschlossenes Handeln
gegen Rechtsextremismus", zugewiesen dem „Ausschuss für Recht, Verfassung,
Immunität, Volksgruppen, Europa und Petitionen". Keine Nummer je Gegenstand,
kein Dokument je Antrag, kein Weg danach. Ob ältere Sitzungen solche PDFs
behalten und seit wann, ist nicht geprüft; die Sitzungsseite verlinkt nur das
aktuelle.

Der Monitor liest Kärntens Entwürfe von den Seiten des Verfassungsdienstes
(`server/utils/laender/kaernten.ts`), nicht vom Landtag.

**Weiterverwendung:** Impressum des Landes
(`https://www.ktn.gv.at/Diverses/Impressum`): „Jede Nutzung bzw.
Weiterverwendung von Inhalten (dies gilt insbesondere für Texte, Bilder,
Grafiken und Programmcode) außerhalb der Internetseiten des Landes Kärnten
und die Portierung auf andere Medien bedarf ausnahmslos der schriftlichen
Genehmigung des Medieninhabers." `robots.txt`: nicht abgerufen.

## Burgenland

**Register:** ja. Die Seiten „Parlamentarische Materialien" des Landtags
(`https://www.bgld-landtag.at/parlamentarische-materialien/`, je Periode ab
GP XIX) betten Ansichten einer Domino-Anwendung ein,
`https://ltmobil.bgld-landtag.at/vorlagen.nsf/…`: „aktuelle Stunde",
„schriftliche Anfragen", „dringliche Anfragen", „Petitionen", „Vorlagen",
je als eigene Seite mit Blätterleiste. Die Seite der GP XXIII bettet vier
Ansichten mit dem Namen `…_GPXXII.xsp` ein (`AnfrZahl_GPXXII`,
`D_AnfrZahl_GPXXII`, `PetZahl_GPXXII`, `VorlZahl_GPXXII`) und eine mit
`…_GPXXIII.xsp`. Ob es Ansichten der GP XXIII für Vorlagen und Petitionen
gibt, ist nicht geprüft.

**Anträge von Abgeordneten:** Ansicht „Vorlagen — nach Zahl", Spalten Zahl,
Vorlagenart, Betreff. Vorlagenarten auf der ersten Seite:
„Klubvorlagen" (Initiativanträge, Selbständige Anträge,
Dringlichkeitsanträge), „Regierungsvorlagen", „Prüfungsaufträge /Berichte
Rechnungshof", „Berichte von Untersuchungsausschüssen". Höchste Zahl:
`22 - 2033`. Ein Gegenstand (`displayagt?OpenAgent&documentId=<unid>`,
Beispiel `22 - 2004`, Initiativantrag zum Gesetz über den Nationalpark
Neusiedler See - Seewinkel) trägt eine Zeitleiste: „2024-11-14 Einbringung"
mit PDF, „Zuweisung an Ausschuss", „Behandlung im Ausschuss", „Zuweisung an
Landtag" mit dem Ausschussbericht als PDF, „Behandlung im Landtag" (66.
Sitzung), „Beschluss — Abstimmungsergebnis: angenommen (dafür: …)" mit dem
beschlossenen Text als PDF.

**Ausschüsse:** als Schritt im Gegenstand (Ausschussbericht). Ob
Ausschussanträge eine eigene Vorlagenart sind, ist nicht geprüft.

**Petitionen:** Ansicht „Petitionen — nach Zahl", GP XXII: Zahl und Betreff,
höchste Zahl `52.0`, zwei Seiten. Eine Petition einzeln: nicht geöffnet.

**Volksbegehren u. ä.:** nicht geprüft.

**Weiterverwendung:** Impressum des Landtags
(`https://www.bgld-landtag.at/impressum/`): „Für den Inhalt verantwortlich:
Burgenländischer Landtag" mit Anschrift; zur Weiterverwendung nichts.
`https://ltmobil.bgld-landtag.at/robots.txt` antwortet 404;
`https://www.bgld-landtag.at/robots.txt` erlaubt `/` und sperrt u. a.
`/*?id=*` und `/typo3*`.

## Niederösterreich

**Register:** ja, „Verhandlungsgegenstände",
`https://noe-landtag.gv.at/gegenstaende`, seit der I. GP (1921). Zwei Wege:
das Formular (ein POST mit Feldern `tx_parliament_businesscases[…]`) und die
Suchzeile mit Operatoren als GET, `?q=typ%3AIA` — die Hilfe der erweiterten
Suche (`/gegenstaende/erweiterte-suche`) verlinkt selbst solche Adressen.
Jeder Gegenstand hat eine Seite `/gegenstaende/<GP>/<GP>-<Zahl>` und eine
PURL `/gegenstaende/uuid/<uuid>`; die Sitemap (`/sitemap.xml`) führt sie,
17 Teile, der erste mit 1.000 Einträgen.

**Typen** (Hilfe der erweiterten Suche): unter „Antrag" u. a. „IA"
Selbstständiger Antrag von Abgeordneten (Initiativantrag gem. § 32 LGO
2001), „AUA" Selbstständiger Antrag von Ausschüssen (gem. § 34 LGO 2001),
„DA", „RA", „AA", „ZA", „RV"; unter „Sonstiger Verhandlungsgegenstand" u. a.
„EL" Eingabe an den Landtag, „ILGV" „Initiative der Landesbürger und der
Gemeinden, Volksbegehren in der Landesgesetzgebung sowie Volksbefragungen",
„VA" Volksabstimmung, „GE" Einspruch gegen Gesetzesbeschlüsse. Ein Typ
„Petition" steht nicht darin.

**Anträge von Abgeordneten:** `?q=typ:IA`: „Gegenstände 1–25 von 665";
je Treffer Titel, Adresse, Geschäftszahl (`Ltg.-1145/XX-2026`), Typ, Kürzel,
ob Gesetzesentwurf, Periode, Einbringer. Ob die Suche ohne `gp:` alle
Perioden umfasst, sagt die Seite nicht.

**Ein Gegenstand** (Beispiel `Ltg.-500/XX-2024`, Typ „Eingabe an den Landtag
– Kürzel: EL", eine Eingabe einer Gemeinde zum NÖ Weinbaugesetz 2019):
Periode, Geschäftszahl, Typ, Status („Abgeschlossen"), eine „Historie" mit
Datum je Schritt („25.07.2024 Einbringung" mit PDF, „Zuweisung an
Landwirtschafts-Ausschuss", „Behandlung im Ausschuss … erledigt durch Brief
an die Stadtgemeinde …, kein Antrag an den Landtag") und die PURL.

**Ausschüsse:** Typ AUA angeboten, nicht abgefragt.

**Petitionen:** kein Typ; ob „Eingabe an den Landtag" Petitionen umfasst,
sagt die Seite nicht.

**Volksbegehren u. ä.:** `?q=typ:ILGV`: „Zu Ihrer Anfrage wurden leider
keine Ergebnisse gefunden." Der Typ ist angeboten; ob es keine solchen
Gegenstände gibt oder die Suche sie nicht findet, ist nicht geprüft.

**Weiterverwendung:** Impressum des Landtags
(`https://noe-landtag.gv.at/impressum`): „Jede Nutzung bzw.
Weiterverwendung von Inhalten (dies gilt insbesondere für Texte, Bilder,
Grafiken und Programmcode) außerhalb der Internetseiten des Landes
Niederösterreich und die Übernahme in andere Medien bedarf ausnahmslos der
schriftlichen Genehmigung des Medieninhabers." `robots.txt`
(`https://noe-landtag.gv.at/robots.txt`): `Allow: /`, gesperrt u. a.
`/*?id=*`, `/*cHash`, `/*tx_parliament*`.

## Salzburg

**Register:** ja, LPI („Landtags-Informationssystem"),
`https://service.salzburg.gv.at/lpi/searchExtern`, ein GET-Formular
(`artId`, `fraktionId`, `periode`, `session`, `beilage`, `titel`, `text`).
Die Seite „Parlamentarische Materialien" des Landtags
(`https://www.salzburg.gv.at/pol/landtag/parlamentarische-materialien`):
„Die Materialien-Dokumentation beginnt mit der 1. Session der 11.
Gesetzgebungsperiode (Mai 1994)"; für 1945–1994 verweist sie auf ALEX der
Nationalbibliothek.

**Typen** („Dokumentart"): Anfrage, Ausschussbericht, Regierungsvorlage,
Sitzungsprotokolle, Dringlicher Antrag, Dringliche Anfrage, Bericht der
Landesregierung, Anfragebeantwortung, Antrag, Mündliche Anfrage,
Entschließungsbericht, index. Kein Typ für Petitionen oder Volksbegehren.

**Anträge von Abgeordneten:** `artId=10&periode=17`: 702 Treffer auf einer
Seite, „Meldung vom 04.11.2026" bis „18.12.2024"; darunter auch Berichte von
Ausschüssen „zum Antrag …". Je Treffer Titel, Beilagennummer, „Meldung
Anschauen" (`viewExtern?id=<n>`), PDF (`www.salzburg.gv.at/00201lpi/…`),
teils Video. Ein Gegenstand (`viewExtern?id=41783`, Nr. 120 der Beilagen, 5.
Session der 17. GP, betreffend verbindliche Zweckbindung der
Wohnbauförderungsmittel): Beilagennummer, Session, Antragsteller und der
volle Text. Einen Weg (Zuweisung, Erledigung) zeigte die Seite nicht; die
Verbindung läuft über den Ausschussbericht, der die Beilagennummer des
Antrags nennt.

**Weiterverwendung:** „Rechtliche Hinweise" des Landes
(`https://www.salzburg.gv.at/dienststellen/kontakt/rechtliche-hinweise`,
leitet auf `/kontakt/rechtliche-hinweise` um), Abschnitt „Disclaimer –
Haftungsausschlusserklärung": „Die auf der Website des Landes Salzburg
veröffentlichten Beiträge sind urheberrechtlich geschützt. Jede
unberechtigte Vervielfältigung und/oder Verbreitung dieser Seiten stellt eine
Verletzung des österreichischen Urheberrechtsgesetzes dar." Das LPI selbst
nennt keine Bedingungen. `robots.txt`: nicht abgerufen.

## Vorarlberg

**Register:** ja, Landtagsinformationssystem (LIS). `suche.vorarlberg.at/vlr`
leitet auf die Seite des Landtags `https://vorarlberg.at/web/landtag/lis`
um, die das LIS einbettet:
`https://suche.vorarlberg.at/VLR/vlr_gov.nsf/frmSearch?OpenForm` (Domino).
Das Formular baut eine GET-Adresse
`alldocs?SearchView&SearchOrder=…&Query=FIELD fd_TypeOfDocumentTX Contains "…"`.
Jahre ab 1948.

**Typen:** Aktuelle Stunde, Anfrage, Ausschussvorlage, Bericht,
Entschließung, Petition, Protokoll, Regierungsvorlage, Selbstständiger
Antrag, Sonstiges. Kein Typ für Volksbegehren; unter den Themen steht
„Volksabstimmungen".

**Anträge von Abgeordneten:** „Insgesamt gefunden: 2265 Dokumente"; je
Treffer Titel, Typ, Sitzung, Jahr, Nummer, ältester der ersten Seite 1991.
Ein Gegenstand (`vlr_gov.nsf/0/<unid>?OpenDocument`, Beispiel „Gesetz über
eine Änderung des Bezügegesetzes 1998", Beilage 134/2025): Landtagsperiode,
Sitzung, Typ, „Eingelangt in der Landtagsdirektion 25.09.2025",
„Zugewiesen im Landtag 01.10.2025", „Behandelt im Landtag 12.11.2025",
„Status: Angenommen", „LGBI-Nr. 70/2025", Thema, Fraktionen, Personen, PDF,
Video.

**Ausschüsse:** Typ „Ausschussvorlage" angeboten, nicht abgefragt.

**Petitionen:** „Insgesamt gefunden: 86 Dokumente", die ältesten von 1979
und 1984, die jüngsten der ersten Seite 2021. Eine Petition einzeln: nicht
geöffnet.

**Weiterverwendung:** Impressum des Landes (`https://vorarlberg.at/impressum`),
Abschnitt „Rechtliche Hinweise, Haftungsausschluss und Nutzungsbedingungen
von Materialien (Bildrecht, Textrechte)": Die gelesenen Sätze betreffen
Bildmaterial („Das gesamte im Webauftritt des Landes Vorarlberg enthaltene
Bildmaterial ist nach dem Urheberrechtsgesetz geschützt."); einen Satz zu
Texten fand die Suche im Abschnitt nicht. „Die Nutzung der Webseiten des
Landes Vorarlberg unterliegt österreichischem Recht." Das LIS nennt keine
eigenen Bedingungen. `suche.vorarlberg.at/robots.txt` leitet auf dieselbe
Seite des Landtags um; eine `robots.txt` gibt es dort nicht.

## Wien

**Register:** ja, „Infodat Wien — Informationsdatenbank des Wiener
Landtages und Gemeinderates", `https://www.wien.gv.at/infodat/` (Next.js).
Die Startseite: „Mit Infodat Wien finden Sie 113748 Vorgänge, die seit 1983
vollständig erschlossen sind. Das gesamte politische Geschehen im Wiener
Landtag ab 23.11.1973 und im Wiener Gemeinderat ab 27.05.1983. Alle
Verhandlungsgegenstände im Plenum […] wie Beschlüsse […], Anfragen und
Anträge, Fragestunden und aktuelle Stunden." Ergebnislisten sind GET-Adressen
(`/infodat/suchergebnisse?legislativePeriodNumber=22&committees=L&sessionNumber=15&…`),
ein Vorgang `/infodat/ergdt?detvid=<n>`.

**Typen** („Vorgangstyp", aus den Daten der Suchseite): 40, darunter
„Antrag", „Initiativantrag", „Beschlussantrag", „Dringlicher Antrag",
„Schriftlicher Antrag", „Abänderungsantrag", „Zusatzantrag", „Gegenantrag",
„Misstrauensantrag", „Bericht", „Gesetzesentwurf (Erläuterungen und LGBl)",
„Antrag des Stadtsenates an den Gemeinderat". Kein Typ für Petitionen,
Ausschüsse oder Volksbegehren. Unter den Schlagworten stehen
„Volksbegehren", „Volksbefragung", „Volksabstimmung" und als Stelle
„Gemeinderat, Ausschuss für Petitionen und Bürgerinitiativen".

**Anträge von Abgeordneten:** Die 15. Sitzung des Landtags (20.10.2026):
„80 Vorgänge gefunden", auf der ersten Seite u. a. Antworten, Berichte,
Beschlussanträge. Ein Beschlussantrag (`ergdt?detvid=202247`, „Schaffung
eines Berufsgesetzes für Soziale Arbeit"): Sitzung mit Video, Aktenzahl
(`PGL-1455971-2026-KGR/LAT`) mit PDF, Betreff, Beteiligte mit Rolle,
„Erledigung: abgelehnt", Kommentar mit dem Stimmverhalten der Fraktionen,
Sitzungsprotokoll. Typ „Initiativantrag": nicht eigens abgefragt.

**Petitionen:** Dieselbe Sitzung führt einen „Bericht über die im ersten
Halbjahr des Jahres 2026 abschließend behandelten Petitionen (Postnummer
7)". Der Petitionsausschuss ist nach den Schlagworten einer des
Gemeinderats; ob Petitionen selbst als Vorgang stehen, ist nicht geprüft.

**Weiterverwendung:** Die Seiten der Infodat tragen `<meta name="robots"
content="noindex, nofollow"/>` und nennen keine Lizenz. Ihr Impressum ist
das der Stadt (`https://www.wien.gv.at/inhalt/impressum`): „Das Layout und
die Gestaltung des Angebots […] sind urheberrechtlich geschützt. Gleiches
gilt für die redaktionellen Beiträge im Einzelnen sowie ihre Auswahl und
Zusammenstellung; Veränderungen daran dürfen nicht vorgenommen werden. Eine
öffentliche Verwendung des Angebots darf nur mit Zustimmung der
verantwortlichen Seitenurheber*innen erfolgen. Davon ausgenommen sind die
offiziellen, kostenlosen Informationen und Mitteilungen der Stadt Wien […].
Gesonderte Lizenzen und Nutzungsbedingungen gelten für: Open Government Data
[…]". Die Impressumsseite selbst endet mit „Dieser Inhalt wird von der Stadt
Wien kostenfrei gemäß Creative Commons CC-BY 4.0 zur Verfügung gestellt" —
ein Vermerk je Inhaltsseite, wie ihn auch die Entwurfsseite trägt
(`server/utils/laender/wien.ts`); auf den gelesenen Infodat-Seiten steht er
nicht. `https://www.wien.gv.at/robots.txt` sperrt `/infodat/ergli` und
`/infodat/sukri`, nicht die heutigen Pfade.

## Nicht geprüft

- **Tirol, alles:** Die Landtagsevidenz wurde wegen ihrer `robots.txt`
  (`Disallow: /`) nicht gelesen; auch die verlinkte Petitionsübersicht nicht.
- **Oberösterreich:** die Seite eines einzelnen Antrags (die bekannte
  Adresse liefert für Beilagennummern einen Fehler, der Klick in der Liste
  das Formular); die Typen AB und AS; ob PET Petitionen nach 2022 führt.
- **Steiermark:** die Typen „Bericht (§ 36 GeoLT)" und „Bericht des
  Petitionsausschusses"; der Filter „Volksrechtegesetz"; die Perioden vor der
  XIX.; ob ein Antrag später seinen Weg zeigt; PALLASTs `robots.txt`; die
  Petitionsplattform (JavaScript-Abfrage).
- **Kärnten:** ob die Sitzungs-PDFs älterer Sitzungen erreichbar bleiben;
  Volksbegehren; `robots.txt`.
- **Ausschussanträge** in allen Ländern: nur die Typen der Auswahl, keine
  Liste geöffnet; ob „Ausschussbericht", „Bericht (§ 36 GeoLT)",
  „Ausschussvorlage" und „AUA" dasselbe meinen, ist nicht geprüft.
- **Volksbegehren, Bürgerinitiativen, Volksbefragungen:** nirgends im
  Volltext gesucht; in Burgenland und Kärnten gar nicht.
- **Burgenland:** Ansichten der GP XXIII für Vorlagen und Petitionen; eine
  Petition einzeln.
- **Wien:** der Typ „Initiativantrag" als eigene Liste; ob Petitionen als
  Vorgang stehen.
- **Salzburg, Kärnten, Steiermark (Landtagsseite):** `robots.txt`.
- **Zahlen:** Sie sind die Zahlen, die das Register über seiner Liste nennt,
  an dem Tag; nachgezählt wurde keine.
