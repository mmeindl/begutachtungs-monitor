# Der EU-Zyklus: Quellen, Lizenzen, Stadien

**Stand 14.11.2026.** Forschungsnotiz zu einer Frage: Aus welchen amtlichen
Quellen ließe sich für einen EU-Rechtsakt auf seiner Seite unter `/eu-recht`
eine eigene Leiste bauen, von der Konsultation der Kommission bis zur
Umsetzungsfrist, und was erlauben diese Quellen? Anlass ist
`docs/decisions.md`, „Routes to a norm, and what the monitor follows": Der
EU-Zyklus beginnt mit einer Lizenzprüfung, nicht mit Code. Die fünf
Stationen der innerstaatlichen Norm bleiben, wie sie sind; diese Notiz
betrifft nur die Seite des Rechtsakts.

Die Notiz erhebt und schlägt eine Leiste vor. Sie entscheidet nichts: Die
Entscheidungen stehen am Ende und sind die des Maintainers. Gebaut wird erst
nach einem Umsetzungsplan in der Form von `umsetzungsplan-weitere-wege.md`.

## Frage und Methode

- **Bestand:** die Rechtsakte, die die EU-Karte heute kennt, gelesen aus dem
  Faktenspeicher `.data/eu-recht/XXVIII.json` (gebaut 06.11.2026): 231
  Rechtsakte, die 157 Entwürfe nennen.
- **Abfragen** am 14.11.2026, eine nach der anderen, mit einem allgemeinen
  Client-Namen und ohne Hinweis auf das Projekt: der Cellar (SPARQL), das
  Portal „Ihre Meinung zählt", das Register der Europäischen
  Bürgerinitiative, die Open-Data-API des Europäischen Parlaments, eine Seite
  des Legislative Observatory. Rechtstexte (Beschlüsse über die
  Weiterverwendung) deutsch aus dem Cellar,
  `http://publications.europa.eu/resource/celex/<CELEX>`.
- **Musterakt** für alle Proben: Richtlinie (EU) 2024/1069 (CELEX
  `32024L1069`), Verfahren 2022/0117(COD), Vorschlag COM(2022) 177.
- **Stichprobe** für das Portal: 51 der 188 Rechtsakte mit einem
  COM-Vorschlag, nach Vorschlagsjahr geschichtet (fester Zufallsstartwert),
  je zwei Abrufe mit 2,5 s Abstand.
- „nicht belegt" heißt: nicht gelesen oder nicht gefunden, nicht aus dem
  Gedächtnis ergänzt. „nicht geprüft" heißt: nicht nachgesehen.
- Zitate aus den Quellen sind wörtlich und gekürzt; englische Quellen
  bleiben englisch.

## Auf einen Blick

1. **Der Cellar, den der Monitor schon liest, kennt das ganze Verfahren.**
   208 der 231 Rechtsakte hängen an einem Dossier mit datierten Ereignissen
   (Vorschlag der Kommission, Parlament, Rat, Unterzeichnung, Amtsblatt);
   184 tragen die Verfahrensnummer, 188 die Nummer des COM-Vorschlags. Für
   die Stadien ab dem Vorschlag braucht es **keine neue Quelle**.
2. **Für die Konsultation braucht es eine neue Quelle,** das Portal „Ihre
   Meinung zählt". Seine Inhalte stehen nach dem rechtlichen Hinweis der
   Kommission unter CC BY 4.0; die Schnittstelle ist **undokumentiert**. Der
   Schlüssel zum Cellar ist die COM-Nummer. In der Stichprobe fand sich die
   Initiative für 29 von 36 Vorschlägen ab 2017 und für keinen von 15 davor.
3. **Rückmeldungen enthalten Namen von Privatpersonen, und die Einwilligung
   ist widerrufbar.** Die Zahl der Rückmeldungen steht schon im Datensatz der
   Initiative; die einzelnen Rückmeldungen müsste der Monitor gar nicht
   abrufen. Der Datensatz der Initiative enthält außerdem Namen, E-Mail und
   Telefonnummer von Bediensteten der Kommission.
4. **Alle 231 Rechtsakte sind beschlossen.** Die Beteiligung auf EU-Ebene
   liegt bei ihnen in der Vergangenheit; offen ist nur die Umsetzung in
   Österreich, die der Monitor schon zeigt. Wo man sich auf EU-Ebene *jetzt*
   äußern kann, betrifft Vorschläge, die noch kein Rechtsakt sind und die
   kein Entwurf nennt: ein anderer Bestand als der heutige.
5. **Die Bürgerinitiative ist kein Stadium eines Rechtsakts.** Das Register
   ist weiterverwendbar (CC BY 4.0), aber kein Feld verbindet eine Initiative
   mit einem Rechtsakt.
6. **Das Europäische Parlament hat eine dokumentierte API unter CC BY 4.0,**
   nach Verfahrensnummer abfragbar. Gebraucht wird sie nicht, solange der
   Cellar die Ereignisse des Parlaments führt; das Register des Rates ebenso
   wenig.

## 1. Lizenzen

| Quelle | Schnittstelle | Weiterverwendung laut Quelle | Was nicht übernommen werden darf oder soll |
|---|---|---|---|
| EUR-Lex / Cellar | SPARQL, dokumentiert, in Verwendung | Metadaten CC0 1.0 (im Impressum, `#imp-eurlex`) | Texte der Rechtsakte (nur Link), Logo |
| „Ihre Meinung zählt" | JSON, **undokumentiert** | CC BY 4.0 für Inhalte der EU; Beiträge Dritter nicht | Rückmeldungen (Namen, Texte, Anhänge), Personendaten der Bediensteten |
| Register der Bürgerinitiative | JSON, Dokumentation nicht gefunden | CC BY 4.0 für Inhalte der EU | Namen und E-Mail der Organisatoren, Geldgeber, Logos |
| Europäisches Parlament, Open Data | REST, dokumentiert (OpenAPI) | CC BY 4.0, höchstens 500 Abrufe in 5 Minuten | nichts Einschlägiges; nicht benötigt |
| Legislative Observatory | nur HTML | rechtlicher Hinweis **nicht gelesen** (HTTP 403) | nur verlinken |
| Rat, öffentliches Register | nicht geprüft | Beschluss (EU) 2017/1842: unentgeltlich, mit Quellenangabe | nicht benötigt |

### 1.1 EUR-Lex und der Cellar: was schon gedeckt ist

Das Impressum nennt die Quelle seit 04.11.2026 (`app/pages/impressum.vue`,
`#imp-eurlex`). Der rechtliche Hinweis von EUR-Lex wurde damals im Browser
gelesen (Skripte erhalten eine Bot-Prüfung) und **heute nicht erneut**:
Metadaten von EUR-Lex sind der Public Domain gewidmet (CC0 1.0), Rechtstexte
nach Beschluss 2011/833/EU weiterverwendbar, redaktionelle Inhalte CC BY 4.0,
das Logo gar nicht —
`https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=de`.

Der Wortlaut des Impressums ist enger als das, was die Leiste bräuchte. Er
nennt „die Umsetzungsfrist einer Richtlinie und das Datum ihres
Beschlusses" und den Link. Der Code liest heute schon mehr Metadaten
(amtlicher Titel, Amtsblattfundstelle, ELI, Inkrafttreten;
`server/utils/eu/cellar.ts`). Die Leiste käme mit Verfahrensnummer, Nummer
des Vorschlags und den Ereignissen des Dossiers (Art, Datum, Organ) dazu.
Das sind Metadaten derselben Quelle unter derselben Widmung; **der Satz im
Impressum müsste sie aber nennen**, und das Impressum ändert sich nur mit dem
Maintainer.

### 1.2 „Ihre Meinung zählt" (Portal der Kommission)

**Schnittstelle.** Das Portal ist eine Einzelseiten-Anwendung unter
`https://ec.europa.eu/info/law/better-regulation/have-your-say_de`. Sie lädt
ihre Daten von drei Adressen, die alle ohne Schlüssel mit JSON antworten:

- `…/better-regulation/brpapi/searchInitiatives?text=…&size=…&language=EN`
  (Suche; 4.164 Initiativen),
- `…/better-regulation/brpapi/groupInitiatives/<id>` (eine Initiative mit
  ihren Veröffentlichungen; 97 KB für den Musterakt, weil jeder Titel in 24
  Sprachen und jede Sprachfassung jedes Dokuments mitkommt),
- `…/better-regulation/api/allFeedback?publicationId=<id>&page=…&size=…`
  (die Rückmeldungen zu einer Veröffentlichung).

**Eine dokumentierte oder amtliche Schnittstelle: nicht gefunden.**
`brpapi/v3/api-docs` und `brpapi/swagger-ui.html` liefern nur die Hülle der
Anwendung. Das Skript der Anwendung und ihre englische Textdatei
(`…/better-regulation/assets/i18n/en.json`, 1.167 Schlüssel) enthalten kein
Wort zu API, Weiterverwendung oder Lizenz. Eine Websuche fand nur Werkzeuge
Dritter, die dieselben Adressen abgreifen. Ob auf `data.europa.eu` ein
Datensatz des Portals liegt: nicht belegt. Die `robots.txt` von
`ec.europa.eu` enthält im Block für alle Clients keine Regel zu
`/info/law/` oder zu den Schnittstellen.

**Bedingungen.** Das Portal hat eigene Seiten nur zu Verhaltensregeln
(„Rules for feedback and suggestions") und zum Datenschutz („specific
privacy statement"), keine zur Weiterverwendung. Es gilt der rechtliche
Hinweis der Kommission, `https://commission.europa.eu/legal-notice_en`:

> „Unless otherwise indicated (e.g. in individual copyright notices), content
> owned by the EU on this website is licensed under the Creative Commons
> Attribution 4.0 International (CC BY 4.0) licence. This means that reuse is
> allowed, provided appropriate credit is given and changes are indicated."

> „You may be required to clear additional rights if a specific content
> depicts identifiable private individuals or includes third-party works."

Grundlage ist der Beschluss 2011/833/EU der Kommission (CELEX `32011D0833`).
Art. 6 Abs. 1: Dokumente werden „uneingeschränkt und ohne Beantragung zur
Weiterverwendung bereitgestellt"; als Bedingung nennt Abs. 2 „die
Verpflichtung des Nutzers, die Quelle des Dokuments anzugeben" und „die
ursprüngliche Bedeutung oder Botschaft des Dokuments nicht verzerrt
darzustellen". Art. 2 Abs. 2 lit. b nimmt aus: „Dokumente, deren
Weiterverwendung die Kommission nicht gestatten kann, weil sie geistiges
Eigentum Dritter sind".

Dass der Hinweis von `commission.europa.eu` auch für die Anwendung unter
`ec.europa.eu/info/law/better-regulation` gilt, sagt die Anwendung selbst
nicht: Ihr Skript enthält keinen Link auf einen rechtlichen Hinweis; welcher
Link in ihrer Fußzeile steht, ist ohne Browser **nicht belegt**. Der
Beschluss 2011/833/EU gilt unabhängig davon für alle veröffentlichten
Dokumente der Kommission (Art. 2 Abs. 1).

**Daraus folgt:**

- *Daten der Initiative* (Titel, Art des geplanten Rechtsakts, Stadium,
  Zeitraum der Rückmeldung, Zahl der Rückmeldungen, Aktenzeichen): von der
  Kommission erstellt, weiterverwendbar mit Quellenangabe und Hinweis auf
  Änderungen.
- *Rückmeldungen* (Text, Anhänge): geistiges Eigentum der Einsender, von der
  Lizenz nicht erfasst. Sie werden verlinkt, nicht übernommen. Das deckt
  sich mit der Regel des Monitors für Stellungnahmen.
- *Personendaten in Rückmeldungen.* Die Datenschutzerklärung des Portals:
  „The publication of your name together with your contribution or feedback
  is based on your consent"; und für die Zeit nach Fristende: „you may
  choose to have your personal details removed online and your contribution
  made anonymous". Eine Rückmeldung trägt die Felder `firstName`, `surname`,
  `organization`, `country`, `userType` (`EU_CITIZEN`, `NON_EU_CITIZEN`,
  `NGO`, `COMPANY`, `BUSINESS_ASSOCIATION`, `PUBLIC_AUTHORITY`, …) und
  `publication` (`WITHINFO` oder `ANONYMOUS`). In der Probe (zehn
  Rückmeldungen zum Musterakt) waren Vor- und Nachname bei jeder
  `WITHINFO`-Rückmeldung gefüllt, auch bei `EU_CITIZEN`. Ein Speicher, der
  Namen hält, würde einen Widerruf nicht mitbekommen.
- *Personendaten von Bediensteten.* Jede Veröffentlichung im Datensatz der
  Initiative trägt `authorName`, `authorSurname`, `authorMail`,
  `authorPhoneNumber`, manche `surveyContactMail`. Das Portal zeigt diese
  Angaben auf seinen Seiten nicht erkennbar an (nicht geprüft); der Monitor
  dürfte sie weder speichern noch ausgeben.

**Was wegzulassen wäre,** damit der Monitor Privatpersonen zählt und nie
nennt:

1. `allFeedback` wird nicht abgerufen. Die Zahl steht als `totalFeedback`
   an jeder Veröffentlichung der Initiative (Musterakt: 10 zum Fahrplan, 146
   zur öffentlichen Konsultation, 22 zum Vorschlag; die Rückmeldeliste
   zählte ebenfalls 22).
2. Keine Aufschlüsselung nach Art des Einsenders: Sie ließe sich nur aus
   den einzelnen Rückmeldungen zählen, also durch Abruf der Namen.
3. Aus dem Datensatz der Initiative wird eine feste Liste von Feldern
   gelesen; die Autorenfelder und Kontaktadressen gehören nicht dazu und
   erreichen weder Speicher noch SSR-Payload.
4. Dokumente (Fahrplan, Folgenabschätzung, Beiträge) werden auf dem Portal
   verlinkt, nicht geladen.

### 1.3 Register der Europäischen Bürgerinitiative

**Schnittstelle.** `https://register.eci.ec.europa.eu/core/api/register/search/ALL/EN/0/3`
(Liste; Kopf am 14.11.2026: 162 Anträge, 136 registriert, 15 erfolgreich, 13
laufend, 14 beantwortet) und
`…/core/api/register/details/<Jahr>/<Nummer>` (eine Initiative, 124 KB für
ECI(2022)000002). Eine Dokumentation: nicht gefunden.

**Bedingungen.** Die Seite der Bürgerinitiative
(`https://citizens-initiative.europa.eu`) verlinkt in der Fußzeile den
rechtlichen Hinweis `https://european-union.europa.eu/legal-notice_en`, im
Wortlaut gleich dem der Kommission: CC BY 4.0 für Inhalte der EU, Rechte
Dritter und erkennbarer Privatpersonen vorbehalten, Logos ausgenommen.

**Was der Datensatz enthält:** Titel und Ziele in 24 Sprachen, Status,
Daten der Registrierung und der Sammlung, Unterschriften je Mitgliedstaat,
die Antwort der Kommission mit Links (CELEX der Mitteilung). Außerdem
Personendaten: die Mitglieder der Organisatorengruppe mit `fullName`,
`email`, `residenceCountry` (Schalter `privacyApplied`), die Geldgeber mit
Name und Betrag (Schalter `privateSponsor`, `anonymized`), das Logo der
Initiative (von der Weiterverwendung ausgenommen).

**Kein Schlüssel zu einem Rechtsakt.** Der Datensatz verweist auf den
Registrierungsbeschluss der Kommission (`commissionDecision.celex`,
`32022D0482`) und auf ihre Antwort, nicht auf einen Rechtsakt, der aus der
Initiative hervorging. Eine Bürgerinitiative ist damit kein Stadium der
Leiste, sondern ein Instrument neben dem Weg einer Norm, wie `/wege` es
heute zeigt.

### 1.4 Europäisches Parlament

**Open-Data-Portal, API v2.** Dokumentiert als OpenAPI unter
`https://data.europarl.europa.eu/api/v2`. Der Kopf der Beschreibung nennt
die Lizenz „CC BY 4.0 - Attribution 4.0 International" und die Grenze:
„Maximum number of requests 500 in 5min." Ein Verfahren:
`…/api/v2/procedures/2022-0117?format=application%2Fld%2Bjson` (17 KB):
`label` „2022/0117(COD)", 18 Ereignisse mit Datum und Art
(`REFERRAL`, `COMMITTEE_ADOPTING_REPORT`, `PLENARY_ADOPT_POSITION`,
`SIGNATURE`, `PUBLICATION_OFFICIAL_JOURNAL`, …), Verweise auf Dokumente.

Rechtsgrundlage ist der Beschluss des Präsidiums des Europäischen Parlaments
über offene Daten, ABl. C, C/2025/341 vom 10.01.2025 (CELEX `32025D00341`),
Art. 4: „Für die Weiterverwendung der offenen Daten des Parlaments gelten
die Bedingungen gemäß der Lizenz Creative Commons Namensnennung 4.0
International (CC BY 4.0). Rohdaten, Metadaten oder sonstige Dokumente
vergleichbarer Art können alternativ … (CC0 1.0) veröffentlicht werden."

Der rechtliche Hinweis des Portals selbst
(`https://data.europarl.europa.eu/en/legal-notice`) wird erst im Browser
aufgebaut und wurde **nicht gelesen**.

**Legislative Observatory.** Die Verfahrensseite ist erreichbar:
`https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2022/0117(COD)`
(die frühere Adresse `oeil.secure…` leitet dorthin um). Sie ist HTML; eine
maschinenlesbare Fassung bietet sie nicht an. Ihr rechtlicher Hinweis,
`https://www.europarl.europa.eu/legal-notice/en`, antwortet einem Skript
mit HTTP 403: **nicht gelesen**. Die Seite eignet sich als Linkziel; sie
lässt sich aus der Verfahrensnummer des Cellar bilden.

### 1.5 Rat der Europäischen Union

Der Cellar führt die Ereignisse des Rates im Dossier (siehe 2.1); das
öffentliche Register des Rates braucht keine Station und wurde **nicht
abgefragt**. Zur Vollständigkeit die Grundlage, Beschluss (EU) 2017/1842 des
Rates (CELEX `32017D1842`): Dokumente werden „für alle", „ohne dass dies
jeweils beantragt werden muss", „unentgeltlich" und „zu kommerziellen und
nichtkommerziellen Zwecken" bereitgestellt (Art. 4), mit der „Verpflichtung
des Nutzers, die Quelle des Dokuments anzugeben" (Art. 6 Abs. 1 lit. a);
ausgenommen ist „geistiges Eigentum Dritter" (Art. 2 Abs. 2 lit. a).

## 2. Stadien, wie die Quellen sie führen

### 2.1 Der Cellar: Dossier und Ereignisse

Ein Rechtsakt hängt an einem Dossier (`cdm:dossier`), das Dossier trägt die
Kennungen und eine Liste von Ereignissen (`cdm:event_legal`). Für den
Musterakt:

| Was | Eigenschaft | Wert |
|---|---|---|
| Verfahrensnummer | `cdm:procedure_code_interinstitutional_reference_procedure` | `2022/0117/COD` |
| Art des Verfahrens | `…_has_type_concept_type_procedure_code_interinstitutional` | `OLP` |
| Vorschlag | `cdm:dossier_type_reference` / `_year_reference` / `_number_reference` | `COM` / `2022` / `177` |
| Vorschlag als Werk | `cdm:dossier_initiated_by_act_preparatory` → `cdm:work_id_document` | `celex:52022PC0177` |
| Stand | `…_has_status_file-status` | `PROP_ADOPTED` |
| Ereignis | `cdm:event_legal_part_of_dossier`, `…_date`, `…_has_type_concept_type_event_legal`, `…_initiated_by_institution` | 23 Ereignisse, alle datiert |

**Falle bei der Messung.** Vom Rechtsakt zum Dossier führen zwei
Eigenschaften, und nur eine ist überall gesetzt:
`cdm:resource_legal_produced_by_dossier` am Rechtsakt findet 76 der 231
Dossiers, die Gegenrichtung `cdm:dossier_produces_resource_legal` am Dossier
208. Die erste Zahl war das Messinstrument, nicht der Befund.

**Über alle 231 Rechtsakte** (vier Abfragen zu je 60 CELEX, drei für die
Ereignisse):

| Was | Zahl |
|---|---|
| Rechtsakte in der Karte | 231 (151 Richtlinien, 66 Verordnungen, 13 Beschlüsse, 1 Rahmenbeschluss) |
| mit Dossier | 208 (149 Richtlinien, 56 Verordnungen, 2 Beschlüsse, 1 Rahmenbeschluss); 207 mit einem, 1 mit zwei |
| mit Verfahrensnummer | 184 |
| mit COM-Nummer des Vorschlags | 188 |
| Dossiers mit Bezugsart `OP_DATPRO` statt `COM` | 20 (12 Verordnungen, 6 Richtlinien, 2 Beschlüsse); Bedeutung der Bezugsart nicht belegt |
| Dossiers mit mindestens einem Ereignis | 199 von 208; 4.479 Ereignisse, alle datiert, 85 Arten |
| ohne Dossier | 23 (11 Beschlüsse, 10 Verordnungen, 2 Richtlinien: 2009/106/EG und (EU) 2024/825) |

Die 23 ohne Dossier sind nach ihrer Art (21 Beschlüsse und Verordnungen)
vermutlich Rechtsakte der Kommission, die kein Verfahren zwischen den
Organen haben; je Rechtsakt geprüft wurde das nicht. Warum die Richtlinie
(EU) 2024/825 keines trägt, ist nicht belegt.

**Welche Ereignisse wie oft vorkommen** (Zahl der Dossiers mit mindestens
einem solchen Ereignis, von 199):

| Ereignisart | Dossiers | Lesart |
|---|---|---|
| `ADP_byCOM`, `ADP_PROPLEG_byCOM` | 198 (eines von beiden) | Annahme des Vorschlags durch die Kommission |
| `OPI_byEESC` / `OPI_byCOR` | 161 / 71 | Stellungnahme des Wirtschafts- und Sozialausschusses / des Ausschusses der Regionen |
| irgendein Ereignis des Parlaments (`…byEP…`) | 187 | u. a. `REF_OF_byEP` 105, `AMEND_R1_byEP` 101, `OPI_R1_byEP` 69, `ADP_R1_POS_byEP` 64 |
| irgendein Ereignis des Rates (`…byCONSIL`) | 188 | u. a. `DIS_byCONSIL` 143, `APR_R1_byCONSIL` 127 |
| `SIGN_byEP_CONSIL` | 160 | Unterzeichnung |
| `PUB_OJ` | 165 | Veröffentlichung im Amtsblatt |

Das Vokabular wechselt mit der Zeit: Der Standpunkt des Parlaments in erster
Lesung heißt in jüngeren Dossiers `ADP_R1_POS_byEP`, in älteren
`OPI_R1_byEP`. Eine Leiste darf also nur Ereignisarten zeigen, die auf einer
gelesenen Liste stehen; alles andere bleibt ungelesen, nicht „nicht
geschehen". Die Bedeutung jeder Art steht in der Autoritätstabelle
`http://publications.europa.eu/resource/authority/event/<Code>`; die
Bezeichnungen dort wurden **nicht abgefragt**, die Lesarten oben folgen aus
dem Musterakt und sind vor dem Bau zu belegen.

### 2.2 Das Portal: Initiative und Veröffentlichungen

Eine Initiative (`groupInitiatives/<id>`) ist eine Folge von
Veröffentlichungen; jede hat Art, Stadium, Aktenzeichen, Datum, Ende der
Rückmeldefrist und Zahl der Rückmeldungen. Der Musterakt, Initiative 13192:

| `type` | `frontEndStage` | `reference` | veröffentlicht | Frist bis | `totalFeedback` |
|---|---|---|---|---|---|
| `INIT_PLANNED` | `INIT_PLANNED` | Ares(2021)5351797 | 03.09.2021 | — | 0 |
| `ROADMAP` | `ROADMAP` | Ares(2021)6011536 | 04.10.2021 | 01.11.2021 | 10 |
| `OPC_LAUNCHED` | `OPC_LAUNCHED` | ANTISLAPP | 04.10.2021 | 10.01.2022 | 146 |
| `PROP_DIR` | `ADOPTION_WORKFLOW` | **COM(2022)177** | 29.04.2022 | 29.06.2022 | 22 |

Die Stadien in den Worten des Portals (seine Textdatei): `INIT_PLANNED`
„In preparation", `ROADMAP` „Roadmap", `PLANNING_WORKFLOW` „Call for
evidence", `OPC_LAUNCHED` „Public consultation", `ISC_WORKFLOW` „Draft act",
`ADOPTION_WORKFLOW` „Commission adoption"; dazu als Filter
„Interinstitutional discussions" und „Publication in Official Journal",
die in keiner der 29 gelesenen Initiativen als Veröffentlichung vorkamen.

### 2.3 Wie ein Rechtsakt über die Quellen hinweg heißt

| Kennung | Beispiel | Cellar | Portal | Parlament | Monitor heute |
|---|---|---|---|---|---|
| CELEX des Rechtsakts | `32024L1069` | ja | nein | nicht geprüft | Schlüssel der Karte |
| ELI | `http://data.europa.eu/eli/dir/2024/1069/oj` | ja | nein | nicht geprüft | Link, Zitat |
| Verfahrensnummer | `2022/0117(COD)` | ja (184 von 231) | nein | Schlüssel (`2022-0117`) | — |
| Nummer des Vorschlags | `COM(2022) 177` | ja (188 von 231) | ja, an der Veröffentlichung | nicht geprüft | — |
| CELEX des Vorschlags | `52022PC0177` | ja | nein | nicht geprüft | — |
| Nummer der Initiative | `13192` | nein | Schlüssel | nein | — |

**Der Weg ist: CELEX → Dossier im Cellar → COM-Nummer → Initiative im
Portal;** und CELEX → Dossier → Verfahrensnummer → Parlament. Den zweiten
Schritt zum Portal gibt es nur über die Volltextsuche, und er hat drei
Fallen, alle aus der Stichprobe:

- **`exactMatch: true` ist kein Beleg.** Bei 8 von 51 Abfragen meldete die
  Suche einen genauen Treffer, und der erste Treffer trug die gesuchte
  Nummer an keiner Veröffentlichung (Suche nach COM(2021)20: 291 Treffer,
  der erste eine Initiative von 2026). Belegt ist die Zuordnung erst, wenn
  eine Veröffentlichung der Initiative genau die COM-Nummer als `reference`
  führt.
- **HTTP 406 auf manche Suchwörter.** 5 von 51 Abfragen (COM(2013)449,
  COM(2016)863, COM(2024)497, COM(1995)722, COM(1987)134), wiederholbar,
  auch mit `Accept: application/json`. Was die Antwort bedeutet, ist nicht
  belegt; sie ist jedenfalls nicht „keine Initiative".
- **Ein Vorschlag, mehrere Rechtsakte, und umgekehrt.** COM(2023)148 gehört
  zu zwei Rechtsakten der Karte ((EU) 2024/1747 und (EU) 2024/1711, eine
  Initiative). Im Cellar tragen acht Dossiers eine zusammengesetzte Nummer
  („722 - 3", „662 - 3"): Teile eines Pakets.

### 2.4 Vorschlag für die Leiste

Aus dem, was die Quellen führen, nicht aus dem Lehrbuch. Fünf Stationen;
dass es wieder fünf sind, ist Zufall und nicht die Leiste der
innerstaatlichen Norm.

| Station | Quelle | Datum | Kennung | Link | Deckung |
|---|---|---|---|---|---|
| 1 Konsultation | Portal (neu) | Beginn und Ende je Veröffentlichung | Nummer der Initiative | Seite der Initiative im Portal | Vorschläge ab 2017, Stichprobe 29 von 36; davor keine |
| 2 Vorschlag der Kommission | Cellar | `ADP_byCOM` / `ADP_PROPLEG_byCOM` | COM-Nummer, CELEX `5…PC…` | Vorschlag auf EUR-Lex | 198 von 208 Dossiers |
| 3 Parlament und Rat | Cellar | Standpunkt des Parlaments, Billigung des Rates, Unterzeichnung | Verfahrensnummer | Verfahrensseite im Legislative Observatory | Parlament 187, Rat 188, Unterzeichnung 160 von 208 Dossiers |
| 4 Amtsblatt | Cellar (schon gelesen) | Veröffentlichung, Inkrafttreten | CELEX, ELI, Fundstelle | Rechtsakt auf EUR-Lex | Fundstelle bei 230 von 230 (gemessen 06.11.2026, `cellar.ts`); `PUB_OJ` als Ereignis in 165 Dossiers |
| 5 Umsetzung in Österreich | Cellar und die Karte (schon da) | Umsetzungsfrist (Richtlinien, Regel D3); Begutachtung und Stand je Entwurf | — | die Entwürfe im Monitor | wie heute |

- **Station 1 hat Ereignisse, keine Unterstationen:** Fahrplan oder
  Aufforderung zur Stellungnahme, öffentliche Konsultation, je mit Zeitraum
  und Zahl der Rückmeldungen. Die Rückmeldefrist zum angenommenen Vorschlag
  (in allen 29 gefundenen Initiativen vorhanden) ist ein Ereignis der
  Station 2.
- **Stellungnahmen des Wirtschafts- und Sozialausschusses und des
  Ausschusses der Regionen** sind Ereignisse der Station 3, wie der
  Einspruch des Bundesrates ein Ereignis der Station Parlament ist.
- **Ein Rechtsakt der Kommission** (ohne Dossier, oder Dossier `OP_DATPRO`)
  hat keine Stationen 2 und 3 in dieser Form. Seine Leiste hätte
  „Entwurf des Rechtsakts" (Portal, Stadium `ISC_WORKFLOW`) vor dem
  Amtsblatt. Ob sich seine Initiative finden lässt, wurde **nicht
  geprüft**: Der Schlüssel wäre die C-Nummer, die die Abfragen dieser Notiz
  nicht erhoben haben.
- **Station 5 bleibt, was die Seite heute zeigt** (Zeitleiste, Zeilen der
  Entwürfe), mit Regel D6: zwei Daten und ein Stand, kein Urteil. Dieselbe
  Regel müsste für die neuen Stationen gelten: Daten, keine Dauern und kein
  „es dauerte".

## 3. Wo man sich äußern kann

| Stadium | Kanal | Wer | Frist | Veröffentlicht |
|---|---|---|---|---|
| Fahrplan / Aufforderung zur Stellungnahme | Portal, Rückmeldung mit EU-Login | jede Person | im Musterakt 4 Wochen (`feedbackPeriod` 4) | ja; Name nur mit Einwilligung |
| Öffentliche Konsultation | Portal, Fragebogen in „EU Survey" | jede Person | „zwölf Wochen" (COM(2021) 219, zitiert in `wege-zu-einer-rechtsnorm.md`); im Musterakt 14 | Beiträge ja; zusammenfassender Bericht als Dokument der Initiative |
| Angenommener Vorschlag | Portal, Rückmeldung | jede Person | im Musterakt 8 Wochen (`feedbackPeriod` 8) | ja |
| Entwurf eines delegierten oder Durchführungsrechtsakts | Portal, Rückmeldung | jede Person | in einer gelesenen Initiative 4 Wochen (24.05.–21.06.2018) | ja |
| Parlament und Rat | kein Kanal für Einzelne im Verfahren selbst; Petition an das Parlament (Art. 227 AEUV) | Personen mit Wohnsitz in der Union | — | nicht geprüft |
| Parlament und Rat, über Österreich | Subsidiaritätsrüge von Nationalrat und Bundesrat (Art. 23g B-VG) | Parlamente, Landtage über den Bundesrat | — | nicht geprüft |
| Umsetzung in Österreich | Begutachtung des Entwurfs; Stellungnahme im Parlament (§ 23b GOG-NR) | jede Person | je Entwurf | ja; im Monitor |
| vor jedem Vorschlag | Europäische Bürgerinitiative | Unionsbürger | Sammelfrist hier nicht belegt (VO (EU) 2019/788 nicht erneut gelesen) | Register |

- Die Fristen der drei Rückmeldearten sind hier **nur an Beispielen
  abgelesen**, nicht aus einer Regel der Kommission belegt (so schon
  `wege-zu-einer-rechtsnorm.md`, „Offen").
- Das Portal nimmt keine anonymen Beiträge an: „to avoid misuse you are
  required to identify yourself"; veröffentlicht wird der Name nur nach
  Wahl.
- Ob die Kommission die Rückmeldungen zum angenommenen Vorschlag an
  Parlament und Rat weitergibt: nicht belegt.
- Eine Pflicht zur Antwort im Einzelfall kennt keines dieser Instrumente
  außer der Bürgerinitiative (`wege-zu-einer-rechtsnorm.md`, Tabelle „Wo man
  sich äußern kann").

**Für die 231 Rechtsakte der Karte ist jede Zeile außer „Umsetzung in
Österreich" Vergangenheit.** Sie sind beschlossen. Eine Station kann zeigen,
dass und wann man sich äußern konnte und wie viele es taten; ein offenes
Fenster auf EU-Ebene kann sie nur zeigen, wenn die Seite auch Vorschläge
führt, die noch kein Rechtsakt sind. Solche nennt kein Entwurf, also kennt
die Karte sie nicht. Offen wäre bei einem beschlossenen Rechtsakt allenfalls
eine spätere Initiative zu ihm (Bewertung, Überarbeitung, delegierter
Rechtsakt); einen Schlüssel dafür hat diese Notiz nicht gefunden, die
Volltextsuche nach der Nummer liefert Hunderte ungenaue Treffer.

## 4. Menge und Aktualität

| Was | Zahl | Stand |
|---|---|---|
| Rechtsakte in der Karte | 231, von 157 Entwürfen genannt | Speicher vom 06.11.2026 |
| mit Verfahren im Cellar | 208 (90 %) | 14.11.2026 |
| mit COM-Vorschlag | 188; davon Vorschlag ab 2017: 86, davor: 102 | 14.11.2026 |
| Stichprobe Portal, Vorschlag ab 2017 | 36 abgefragt: 29 belegt gefunden, 5 Treffer ohne die Nummer, 1 ohne genauen Treffer, 1 HTTP 406 | 14.11.2026 |
| Stichprobe Portal, Vorschlag vor 2017 | 15 abgefragt: 0 gefunden | 14.11.2026 |
| von den 29: mit öffentlicher Konsultation | 11 (Rückmeldungen 34 bis 39.046) | 14.11.2026 |
| von den 29: mit Fahrplan oder Aufforderung samt Frist | 18 | 14.11.2026 |
| von den 29: mit Rückmeldefrist zum Vorschlag | 29 (Median 23 Rückmeldungen, höchstens 457) | 14.11.2026 |
| Initiativen im Portal insgesamt | 4.164 | 14.11.2026 |
| Bürgerinitiativen | 136 registriert, 13 laufend | 14.11.2026 |

Hochgerechnet bekämen **rund 70 der 231 Rechtsakte** eine Station
„Konsultation" (86 × 29/36); die übrigen rund 160 trügen den Satz, warum
nicht. Das ist eine Hochrechnung aus einer Stichprobe, keine Zählung.

Wie viele Initiativen im Portal gerade offen sind, war im ersten Durchgang
**nicht gemessen** (gemessen im Nachtrag unten: 49):
Der vermutete Filter (`receivingFeedbackStatus=OPEN`) wurde von der
Schnittstelle nicht beachtet (Antwort: alle 4.164). Unter den ersten 100
Einträgen der ungefilterten Liste standen 53 offene Fenster (18
Aufforderungen, 17 Entwürfe von Rechtsakten, 11 angenommene Vorschläge, 7
öffentliche Konsultationen).

**Wie oft sich etwas ändert:**

- *Cellar, beschlossene Rechtsakte:* Das Verfahren ist abgeschlossen
  (`PROP_ADOPTED` bei 162 Dossiers). Die Metadaten werden trotzdem gepflegt:
  Das Dossier des Musterakts wurde zuletzt am 02.09.2026 geändert, zwei
  Jahre nach der Veröffentlichung. Der Monitor hält Cellar-Antworten heute
  einen Monat (`PUBLISHED_DOCUMENT_TTL_S`); das reicht.
- *Portal, abgeschlossene Konsultationen:* Zeiträume und Zahlen ändern sich
  nach Fristende nicht mehr, ausgenommen entfernte Beiträge (nicht
  gemessen). Namen können nachträglich verschwinden (1.2); das betrifft den
  Monitor nur, wenn er sie hielte.
- *Portal insgesamt und Register der Bürgerinitiative:* täglich
  (`latestUpdateDate` der ersten drei Einträge der Liste der
  Bürgerinitiativen: 10., 12. und 13.11.2026).

## 5. Betrieb

**Abrufe je Bau der Karte** (heute liest der Bau je Rechtsakt eine
Cellar-Abfrage, höchstens zwei gleichzeitig):

| Schritt | Abrufe | Dauer | Anmerkung |
|---|---|---|---|
| Dossiers aller Rechtsakte (Cellar) | 4 (je 60 CELEX) oder 231 einzeln | Sekunden | gemessen in Stapeln; einzeln passt zum heutigen Zwischenspeicher je CELEX |
| Ereignisse aller Dossiers (Cellar) | 3 (je 70 Dossiers) oder in derselben Abfrage je Rechtsakt | Sekunden | 4.479 Zeilen insgesamt |
| Portal: Suche und Initiative | 2 je Rechtsakt mit Vorschlag ab 2017, rund 170 | rund 7 Minuten bei 2,5 s Abstand | nur im Vorwärmlauf, nie in einer Seitenanfrage |
| Parlament, Rat, Bürgerinitiative | 0 | — | nicht benötigt |

**Was gespeichert werden müsste.** Nichts Neues der Art nach: Der
Faktenspeicher auf der Platte (`server/utils/cache/factStore.ts`, heute für
die EU-Karte und die Bund-zu-Land-Karte) hält je Rechtsakt die gelesene
Leiste. Je Rechtsakt sind das eine Handvoll Ereignisse (Art, Datum) und
höchstens vier Veröffentlichungen des Portals (Art, zwei Daten, eine Zahl,
eine Nummer): einige hundert Bytes, für 231 Rechtsakte weit unter den 1 MB
der heutigen Datei. Keine Datenbank, kein Konto, kein Schlüssel.

**Speicher im Prozess.** Die Antwort des Portals zu einer Initiative ist
groß (97 KB beim Musterakt, weil alle Sprachfassungen mitkommen); die
Grenze `maxBytes` der Cellar-Abrufe (256 KB) wäre für das Portal eigens zu
setzen. Gelesen wird eine Antwort nach der anderen, gehalten nur die
wenigen Felder; der Speicherbedarf bleibt flach wie beim heutigen Bau.

**Wenn eine Quelle ausfällt.**

- *Cellar:* wie heute. Ein Fehler ist keine Antwort und wird nicht
  gespeichert; die Station sagt, dass sie nicht gelesen werden konnte.
- *Portal:* dieselbe Regel, mit drei eigenen Fällen. Ein Fehler oder HTTP
  406: „konnte nicht gelesen werden", mit Link zum Portal. Ein Treffer ohne
  die COM-Nummer: „im Portal nicht gefunden", nie „keine Konsultation";
  eine Aussage über Abwesenheit ließe sich aus der Suche nicht belegen. Ein
  Vorschlag vor 2017: der Satz, dass das Portal solche Vorschläge nicht
  führt (belegt durch die Stichprobe, nicht durch eine Angabe des Portals;
  seit wann es besteht, ist nicht belegt).
- *Die Schnittstelle des Portals ändert sich ohne Ankündigung.* Sie ist
  nicht zugesagt. Die Adresse der Anwendung trug am 14.11.2026
  Dateinamen mit Prüfsummen (`main-OWKIXSPM.js`), die Rückmeldungen liegen
  unter einem anderen Pfad (`api/`) als die Initiativen (`brpapi/`). Ein
  Leser müsste die Form der Antwort prüfen und bei Abweichung die Station
  als ungelesen ausweisen. Das ist die Art Bruch, an der das
  Vorgängerprojekt starb, hier begrenzt auf eine Station.

**Kosten.** Kein Entgelt, kein Dienst, keine laufende Rechnung. Der
Vorwärmlauf würde um rund sieben Minuten länger.

## Was nicht gezeigt werden kann, und warum

1. **Eine Konsultation zu Vorschlägen vor 2017:** Das Portal führt sie nicht
   (0 von 15).
2. **Eine Konsultation, wo die Suche die Initiative nicht belegt** (in der
   Stichprobe 7 von 36 ab 2017): „nicht gefunden", nie „keine".
3. **Wer sich geäußert hat:** Privatpersonen werden gezählt, nie genannt;
   die Zahl ohne Aufschlüsselung (1.2).
4. **Was aus den Rückmeldungen wurde:** Keine Quelle verbindet eine
   Rückmeldung mit einer Änderung am Vorschlag. Die Leiste zeigt Zeitraum
   und Zahl, keine Wirkung (Rahmung des Monitors).
5. **Das Verfahren der 23 Rechtsakte ohne Dossier** und Parlament und Rat
   bei Rechtsakten der Kommission: Es gibt keines in dieser Form.
6. **Einzelne Schritte älterer Verfahren:** Das Vokabular der Ereignisse
   wechselt; gezeigt wird nur, was auf der gelesenen Liste steht.
7. **Triloge und Verhandlungen im Rat:** nicht als eigene Ereignisse
   erhoben; ob der Cellar sie durchgehend führt, nicht geprüft.
8. **Ein offenes Fenster auf EU-Ebene** auf der Seite eines beschlossenen
   Rechtsakts: Es gibt keines mehr (Abschnitt 3).
9. **Eine Bürgerinitiative, die zu einem Rechtsakt führte:** kein Schlüssel
   im Register (1.3).
10. **Ob eine Richtlinie rechtzeitig umgesetzt wurde:** unverändert Regel
    D6.

## Entscheidungen des Maintainers

**Getroffen am 14.11.2026;** sie stehen mit dem Plan in
`umsetzungsplan-eu-zyklus.md`. Die Liste unten ist der Stand davor.

1. **Umfang:** nur die Rechtsakte, die die Karte schon kennt (Rückschau),
   oder auch Vorschläge, die noch kein Rechtsakt sind (offene Fenster auf
   EU-Ebene, ein neuer Bestand mit eigener Liste)?
2. **Reihenfolge:** zuerst die Stationen aus dem Cellar (keine neue Quelle),
   dann die Konsultation aus dem Portal, oder beides zusammen?
3. **Das Portal als Quelle trotz undokumentierter Schnittstelle:** verwenden,
   vorher bei der Kommission anfragen, oder die Station nur als Link führen?
4. **Rückmeldungen:** nur die Zahl (kein Abruf der einzelnen Rückmeldungen),
   oder Organisationen nennen wie bei den Stellungnahmen im Parlament?
5. **Impressum:** ein neuer Eintrag für das Portal der Kommission (CC BY 4.0,
   Quellenangabe, Hinweis auf Änderungen) und ein weiterer Satz im Eintrag
   `#imp-eurlex` für Verfahrensnummer, Vorschlag und Ereignisse.
6. **Bürgerinitiative:** bleibt im Block unter der Tabelle von `/wege`, mit
   Link zum Register, und wird nicht verfolgt?
7. **Parlament und Rat:** keine eigene Quelle, nur der Link zum Legislative
   Observatory aus der Verfahrensnummer?
8. **Rechtsakte der Kommission:** eigene, kürzere Leiste (nach einer
   weiteren Probe mit der C-Nummer) oder vorerst nur der Satz, dass es kein
   Verfahren zwischen den Organen gab?

## Nachtrag: anhängige Vorschläge und offene Fenster

**14.11.2026, zweiter Durchgang.** Der Maintainer will auch Vorschläge
führen, die noch kein Rechtsakt sind. Damit entfällt Punkt 8 unter „Was
nicht gezeigt werden kann" für diese Vorschläge, und Entscheidung 1 ist
getroffen. Vier Proben dazu:

**Offene Fenster im Portal: eine Abfrage.** Die Suchmaske der Anwendung
nennt ihre Felder im Skript: `text`, `topic`, `frontEndStage`, `category`,
`feedbackStatus`, `feedbackOpenDateFrom`, `feedbackOpenDateClosedBy`,
`frontEndType`, `documentCategory`. Die Schnittstelle nimmt sie unter diesen
Namen (der im ersten Durchgang geratene Name `receivingFeedbackStatus` wird
ignoriert):

| Abfrage | Treffer | davon |
|---|---|---|
| `feedbackStatus=OPEN` | 49 | 18 Aufforderungen zur Stellungnahme, 17 Entwürfe von Rechtsakten, 11 angenommene Vorschläge, 7 öffentliche Konsultationen (eine Initiative kann zwei Fenster haben) |
| `feedbackStatus=OPEN&frontEndType=LEG_PROP` | 22 | 20 Vorschläge für Verordnungen, 2 für Richtlinien; 11 angenommene Vorschläge, 9 Aufforderungen, 4 öffentliche Konsultationen |
| `feedbackStatus=UPCOMING` | 495 | ohne Datum; was „upcoming" zusagt, ist nicht belegt |

Die Fristenden der 49 lagen zwischen 16.11.2026 und 09.02.2027. Alle
offenen Fenster kommen in **einer** Antwort (`size=100`); der tägliche
Abgleich kostet einen Abruf, dazu einen je neuer Initiative.

**Anhängige Verfahren im Cellar: zwei Kennzeichen, die sich
widersprechen.** Unter den Dossiers des ordentlichen
Gesetzgebungsverfahrens (`OLP`) tragen 308 den Stand `PROP_PENDING`; bei 120
davon steht `cdm:dossier_pending-proposal` auf 0, und 11 mit Stand
`PROP_ADOPTED` tragen es auf 1. Nach Verfahrensjahr: 125 der 308 aus 2025
und 2026, 35 aus 2023, aber auch 90 aus 2010 bis 2016. Ein Vorschlag von
2011, der „anhängig" heißt, ist vermutlich zurückgezogen oder liegen
geblieben; `cdm:dossier_withdrawn-proposal` wurde nicht ausgewertet. Für
die Seite heißt das: „anhängig" ist eine Angabe des Cellar, kein Befund,
und wird als solche ausgewiesen; ein Ende ohne Rechtsakt lässt sich aus
dieser Abfrage nicht belegen.

**Die Rückmeldeliste deckt auch öffentliche Konsultationen.**
`api/allFeedback?publicationId=15080` (die öffentliche Konsultation des
Musterakts) meldet 146 Einträge, so viele wie `totalFeedback`. Unter den
ersten zehn: 4 `NGO`, 3 `EU_CITIZEN`, 2 `COMPANY`, 1 `OTHER`. Organisationen
zu nennen und Privatpersonen zu zählen, wie bei den Stellungnahmen im
Parlament, ist damit technisch möglich: `userType` ist ein Strukturmerkmal.
`OTHER`, und jede Zeile, bei der Art und Organisationsfeld einander
widersprechen, wäre im Zweifel eine Person. Offen bleiben die Menge (eine
Konsultation der Stichprobe hatte 39.046 Einträge; es bräuchte eine
Obergrenze) und der Widerruf (1.2: Namen nur kurz halten, nie im
Faktenspeicher). Ob das gebaut wird, ändert die Regel, was genannt wird,
und ist die Entscheidung des Maintainers (Entscheidung 4).

**Ein Vorschlag hat im Lauf seines Lebens drei Kennungen:** vor der Annahme
durch die Kommission nur die Nummer der Initiative im Portal, danach
COM-Nummer und Verfahrensnummer, nach dem Beschluss das CELEX des
Rechtsakts. Die heutige Adresse (`/eu-recht/richtlinie/2024/1069`) gibt es
erst am Ende. Seiten für anhängige Vorschläge brauchen eine eigene Adresse,
die später auf den Rechtsakt weiterleitet.

**Was aus einem Vorschlag wurde,** im Sinn des Monitors (was wurde aus dem
Text): Vorschlag und beschlossener Rechtsakt liegen beide im Cellar. Ein
Vergleich wäre ein eigenes Vorhaben: Heute nimmt der Monitor von EUR-Lex nur
Metadaten (Texte wären nach Beschluss 2011/833/EU weiterverwendbar, die
Regel müsste sich ändern), es gibt keine amtliche Textgegenüberstellung als
Prüfsignal, und die Artikel werden zwischen Vorschlag und Rechtsakt neu
gezählt. Zwischen Konsultation und Vorschlag gibt es keinen Text zum
Vergleichen; die Kommission legt einen eigenen Bericht bei (im Musterakt
`FACT_SUM_REPORT_CONSULT`), der sich verlinken lässt.

**Nationale Umsetzungsmaßnahmen stehen im Cellar** (dritter Durchgang,
14.11.2026). Zu einer Richtlinie führt der Cellar, was die Mitgliedstaaten
der Kommission als Umsetzung gemeldet haben
(`cdm:measure_national_implementing_implements_resource_legal`, Staat in
`cdm:work_created_by_agent`). Zur Richtlinie (EU) 2019/1158: 832 Maßnahmen
aus 27 Staaten, 109 aus Österreich, 117 aus Deutschland. Eine Maßnahme
(CELEX `72019L1158AUT_202301434`) trägt Titel („Oö. Mutterschutzgesetz …"),
Art (`Landesgesetz`), Fundstelle (LGBl. Nr. 122/1993), Tag der Meldung
(03.03.2023), Aktenzeichen der Kommission und die Adresse im RIS. Eine
Meldung ist die Angabe des Mitgliedstaats, kein Befund über die Umsetzung:
Hier wurde ein Landesgesetz von 1993 zu einer Richtlinie von 2019 gemeldet.

| Richtlinien nach spätester Umsetzungsfrist | gesamt | mit Meldung aus Österreich | ohne |
|---|---|---|---|
| Frist in den zwei Jahren vor dem 14.11.2026 | 56 | 54 | 2 |
| Frist in den zwei Jahren danach | 55 | 29 | 26 |

Welche zwei Richtlinien ohne Meldung sind und warum (verspätete Meldung,
keine Umsetzung nötig), wurde nicht gelesen.

**Was der Bau der Schritte 0 und 1 berichtigt hat** (15.11.2026, über die
235 Rechtsakte der Karte vom 14.11.2026, mit dem Produktionsmodul gemessen;
Zahlen in `docs/decisions.md`):

- Abschnitt 2.1 nennt `OPI_R1_byEP` als ältere Form des Standpunkts des
  Parlaments in erster Lesung. Die Bezeichnungen der Autoritätstabelle,
  inzwischen gelesen, sagen es genauer: `ADP_R1_POS_byEP` und
  `AMEND_R1_byEP` heißen beide „Standpunkt des EP in erster Lesung",
  `OPI_R1_byEP` „Stellungnahme des Parlaments in 1. Lesung". Alle drei
  stehen auf der Liste (`shared/utils/euEvents.ts`).
- Wer einen Rechtsakt erlassen hat, steht als Autor am Rechtsakt
  (`cdm:work_created_by_agent`): Parlament und Rat 167, Rat allein 27,
  Kommission 41. Die 23 „ohne Dossier" aus 2.1 sind damit geklärt: 21 sind
  Rechtsakte der Kommission, zwei nicht (Verordnung (EWG, Euratom)
  Nr. 1182/71 und Richtlinie (EU) 2024/825).
- Der Tag des Vorschlags ist der des Dokuments (`cdm:work_date_document`
  am vorbereitenden Rechtsakt des Dossiers); das Ereignis `ADP_byCOM` ist
  im Musterakt einen Tag später datiert. Das Legislative Observatory nennt
  den Tag des Dokuments.
- Ab wann ein Rechtsakt gilt, ist lesbar: Der Cellar typisiert jedes Datum
  des Inkrafttretens (`EV` „Inkrafttreten", `MA` „Anwendung", `MA/PART`
  „Teilweise Anwendung", `PE` „Wirksamwerden"). 38 der 68 Verordnungen
  tragen einen eigenen Geltungsbeginn, 12 der 13 Beschlüsse nur ein
  Wirksamwerden.
- Das Legislative Observatory hat nicht zu jedem Verfahren eine Seite
  (alle 187 Verfahrensnummern der Karte je einmal abgefragt, 180 mit
  Seite): Für 1988/1016(CNS), 1990/0292(SYN), 1992/0412(COD) und
  2013/0033(NLE) antwortet es mit 404, ebenso für 2016/0224(COD),
  2018/0063(COD) und 2023/0077(COD), die es in Akten „A" und „B" geteilt
  hat („2016/0224A(COD)" gibt es). Der Cellar führt die Nummer ohne den
  Buchstaben. Die deutsche Adresse (`/oeil/de/`) liefert die englische
  Seite.
- Ein Datum des Cellar war falsch: Die Veröffentlichung der Richtlinie (EU)
  2024/884 steht als Ereignis am 19.04.2024, im Amtsblatt und im
  Observatory am 19.03.2024. Die Seite liest die Fundstelle vom Rechtsakt,
  nicht aus dem Ereignis.

## Offen

- Der rechtliche Hinweis, den die Anwendung „Ihre Meinung zählt" selbst
  verlinkt; die rechtlichen Hinweise von `data.europarl.europa.eu` und
  `europarl.europa.eu` (beide ohne Browser nicht lesbar).
- Die Bedeutung von HTTP 406 der Suche und der Bezugsart `OP_DATPRO`.
- Die Bezeichnungen der 85 Ereignisarten in der Autoritätstabelle des
  Cellar; welche davon die Leiste liest.
- Die Adresse der Seite einer Initiative im Portal: Das Skript baut sie als
  `…/have-your-say/initiatives/<Pfad der Initiative>_<Sprache>`; wie der
  Pfad aus Nummer und Kurztitel entsteht und ob die Nummer allein genügt,
  ist nicht belegt (die Anwendung antwortet auf jede Adresse mit ihrer
  Hülle, ein Skript kann es nicht prüfen).
- Der Schlüssel von einem Rechtsakt der Kommission zu seiner Initiative
  (C-Nummer), und von einem beschlossenen Rechtsakt zu späteren Initiativen
  über ihn.
- Seit wann das Portal Vorschläge führt; die Fristen der Rückmeldearten als
  Regel; ob Rückmeldungen zum Vorschlag an Parlament und Rat gehen.
- Ob die Open-Data-API des Parlaments Verfahren vor der 9. Wahlperiode
  führt: nicht geprüft; nur nötig, falls sie doch Quelle wird.

## Quellen

Alle abgefragt am 14.11.2026.

- **Cellar,** SPARQL `https://publications.europa.eu/webapi/rdf/sparql`:
  Eigenschaften von `32024L1069`; Dossier
  `http://publications.europa.eu/resource/cellar/3d6781fc-c6d5-11ec-b6f4-01aa75ed71a1`
  (`procedure/2022_117`) und seine Ereignisse; Dossiers und Ereignisse der
  231 CELEX der Karte.
- **Rechtstexte, deutsch, aus dem Cellar**
  (`http://publications.europa.eu/resource/celex/<CELEX>`): Beschluss
  2011/833/EU der Kommission (`32011D0833`), Art. 2 und 6; Beschluss (EU)
  2017/1842 des Rates (`32017D1842`), Art. 2, 4, 6; Beschluss des Präsidiums
  des Europäischen Parlaments, C/2025/341 (`32025D00341`), Art. 1–5.
- **Kommission:** rechtlicher Hinweis
  `https://commission.europa.eu/legal-notice_en`; Portal
  `https://ec.europa.eu/info/law/better-regulation/have-your-say_en`, seine
  Textdatei `…/better-regulation/assets/i18n/en.json` (Seiten „Rules for
  feedback and suggestions", „Protection of your personal data"), die drei
  Schnittstellen aus 1.2 (Initiative 13192, Veröffentlichung 15883);
  `https://ec.europa.eu/robots.txt`.
- **Bürgerinitiative:** `https://citizens-initiative.europa.eu/index_en`
  (Fußzeile), `…/how-it-works/data-protection_en`,
  `https://european-union.europa.eu/legal-notice_en`, die zwei
  Schnittstellen aus 1.3.
- **Europäisches Parlament:** `https://data.europarl.europa.eu/api/v2`
  (OpenAPI-Beschreibung), `…/api/v2/procedures/2022-0117`;
  `https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2022/0117(COD)`.
- **Nicht erreichbar oder nicht lesbar:**
  `https://www.europarl.europa.eu/legal-notice/en` (HTTP 403 für ein
  Skript); `https://data.europarl.europa.eu/en/legal-notice` (Inhalt erst
  im Browser); `https://citizens-initiative.europa.eu/legal-notice_en`
  (404; der verlinkte Hinweis liegt bei `european-union.europa.eu`);
  EUR-Lex selbst (Bot-Prüfung; über den Cellar gelesen).
- **Im Repository:** `server/utils/eu/cellar.ts`, `cellarService.ts`,
  `euMapStore.ts`, `euMapService.ts`; `app/pages/eu-recht/`;
  `app/pages/impressum.vue` (`#imp-eurlex`); `docs/api-exploration.md` §2d;
  `docs/decisions.md`, „EU law and federal law carried out by the Länder"
  und „Routes to a norm, and what the monitor follows";
  `docs/research/wege-zu-einer-rechtsnorm.md`.
