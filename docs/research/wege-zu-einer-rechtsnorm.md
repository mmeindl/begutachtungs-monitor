# Wege zu einer Rechtsnorm, und wo man sich äußern kann

**Stand 14.11.2026.** Forschungsnotiz zu einer Frage: Auf welchen Wegen
entsteht in Österreich ein Bundesgesetz, eine Bundesverordnung (und andere
generelle Normen des Bundes), ein Landesgesetz und eine Landesverordnung, und
wo kann sich die Öffentlichkeit dabei äußern? Anlass ist die Grafik auf
`/wege` (`app/utils/wege.ts`), die aus dem Wissen des Codes gebaut wurde,
nicht aus dem Recht. Diese Notiz liefert die Rechtsgrundlagen, gleicht die
Grafik daran ab und hält fest, was ein Werkzeug bräuchte, um jeden Weg zu
verfolgen. Sie bewertet nicht, was davon gebaut werden soll.

## Frage und Methode

- **Primärquelle** ist der Normtext im RIS (Bundesrecht und Landesrecht
  konsolidiert, Fassung vom 14.11.2026), gelesen über
  `ris.bka.gv.at/NormDokument.wxe` und `GeltendeFassung.wxe`. Zitate sind
  wörtlich und gekürzt. Die Gesetzesnummern stehen unter „Quellen".
- **Zweitquelle** für den Bund sind die Seiten des Parlaments (RLW-Fachinfo
  „Wie funktionieren Begutachtungsverfahren zu Gesetzentwürfen?",
  03.02.2026; „Stellung nehmen zu Gesetzesinitiativen"; „Petitionen
  unterstützen") und, wo das Parlament nichts sagt, **seine eigenen Daten**:
  die Filter-API (Liste 101, Liste 142) und das Detail-JSON eines
  Gegenstands, am 14.11.2026 abgefragt. Für die EU sind es Texte aus dem
  Cellar (EUR-Lex selbst antwortet auf Abrufe ohne Browser mit leerem
  Inhalt).
- **Für die Länder** ist die Landesverfassung im RIS die Quelle, wo nötig die
  Geschäftsordnung des Landtags oder ein Ausführungsgesetz. Eine Zweitquelle
  je Land (Seite des Landtags) wurde **nur für Vorarlberg** gelesen; für die
  anderen acht steht „Zweitquelle nicht geprüft". Die Landesverfassung ist
  die authentische Fassung; die Zweitquelle bestätigte hier nur die Praxis.
- „nicht belegt" heißt: nicht gelesen oder nicht gefunden, nicht aus dem
  Gedächtnis ergänzt. „nicht geprüft" heißt: nicht nachgesehen.

## Auf einen Blick

1. **Art. 41 B-VG ist für Gesetzesvorschläge abschließend**, und § 69 Abs. 1
   GOG-NR wiederholt ihn wörtlich: Regierungsvorlage, Antrag von
   Abgeordneten (fünf), Antrag des Bundesrates, Antrag eines Drittels der
   Mitglieder des Bundesrates, Volksbegehren. Dazu kommt der Antrag eines
   Ausschusses (§ 27 GOG-NR), den die Verfassung nicht nennt. Zwei davon
   fehlen der Grafik: die beiden Anträge aus dem Bundesrat. Sie sind selten,
   aber kein toter Buchstabe (XXV/I/452 wurde BGBl. I Nr. 44/2015).
2. **§ 23b GOG-NR gilt nicht für „jede Gesetzesinitiative"**, wie
   `begutachtung-uebersprungen.md` §4c schreibt: Er nennt Regierungsvorlagen,
   Anträge von Abgeordneten *und Ausschüssen*, Gesetzesanträge des
   Bundesrates und Volksbegehren, dazu Petitionen und Bürgerinitiativen. Das
   Parlament selbst sperrt die Stellungnahme bei Regierungsvorlagen zu
   Staatsverträgen („Keine Begutachtung bei dem Doktyp "RVS" möglich";
   0 Stellungnahmen auf 131 solchen Vorlagen in GP XXVII und XXVIII).
3. **Zwei Zeilen der Grafik widerspricht das Recht oder das Parlament**: Der
   Ausschussantrag ist beim Parlament ein eigener Gegenstand (Typ BUA, 84 in
   GP XXVII, 18 in GP XXVIII) und nimmt nach § 23b Stellungnahmen an (eine
   gezählt); und ein Volksbegehren kann „in Form eines Gesetzesantrages"
   gestellt werden (Art. 41 Abs. 2 B-VG), ist also nicht immer „kein
   Gesetzestext".
4. **Verordnungen müssen nicht in Begutachtung.** Die WFA-Grundsatz-Verordnung
   rechnet ausdrücklich mit Verordnungen, bei denen „ein
   Begutachtungsverfahren … nicht vorgesehen ist" (§ 9 Abs. 4). RIS „Begut"
   hält nur Entwürfe von Ministerien (4.620 Datensätze, alle mit einem
   Ministerium als einbringender Stelle). Regulierungsbehörden begutachten
   auf eigener Grundlage und eigener Seite (E-ControlG § 36 Abs. 3, FMABG
   § 22 Abs. 3a, TKG 2021 § 206).
5. **Die Länder unterscheiden sich stark**: Begutachtung durch Verfassung
   vorgeschrieben in Kärnten, Niederösterreich, Steiermark, Tirol,
   Vorarlberg; als Bürgerbegutachtung „soll" oder „kann" in Burgenland und
   Oberösterreich; in Salzburg und Wien nicht in der Verfassung. Fünf Länder
   kennen eine Gesetzesinitiative von Gemeinden, die Steiermark als eigenes
   Instrument („Gemeindeinitiative", 50 Gemeinden). Vier Länder lassen
   Bürgerinnen und Bürger eine Volksabstimmung über einen Gesetzesbeschluss
   verlangen.

## Bund — Gesetzesinitiative

Art. 41 Abs. 1 B-VG: „Gesetzesvorschläge gelangen an den Nationalrat als
Anträge seiner Mitglieder, des Bundesrates oder eines Drittels der
Mitglieder des Bundesrates sowie als Vorlagen der Bundesregierung." Abs. 2
fügt das Volksbegehren hinzu. § 69 Abs. 1 und 2 GOG-NR sagt dasselbe; § 21
Abs. 1 GOG-NR zählt die Verhandlungsgegenstände auf und nennt darüber hinaus
keine weitere Art von Gesetzesvorschlag. **Die Liste ist für
Gesetzesvorschläge abschließend**, mit einer Ergänzung aus dem
Geschäftsordnungsrecht: dem Antrag eines Ausschusses (§ 27 GOG-NR, § 21
Abs. 2 GOG-NR „Selbständige Anträge von Ausschüssen").

| Weg | Rechtsgrundlage | Wer, wie viele | Begutachtung davor | Stellungnahme im Parlament (§ 23b) | Typ beim Parlament, Zahl GP XXVII / XXVIII |
|---|---|---|---|---|---|
| Regierungsvorlage | Art. 41 Abs. 1 B-VG | Bundesregierung | üblich, nicht vorgeschrieben (unten) | ja, § 23b Abs. 1 | RV, 365 / 131 |
| Regierungsvorlage zu einem Staatsvertrag | Art. 50 B-VG | Bundesregierung | möglich (WKG § 10 Abs. 1 nennt Staatsverträge) | **nein**: Parlament: „Keine Begutachtung bei dem Doktyp "RVS" möglich" | RVS, 105 / 26 |
| Antrag von Abgeordneten (Initiativantrag) | Art. 41 Abs. 1 B-VG; § 26 Abs. 4 GOG-NR: „von mindestens fünf Abgeordneten unterstützt" | 5 Abgeordnete | „nicht" (RLW: Entwürfe, „die nicht von der Bundesregierung sondern von Abgeordneten ausgehen", gehen nicht in Begutachtung; `stellungnahme-was-danach-passiert.md` §3) | ja, § 23b Abs. 1 | A (ohne A(E)), 895 / 183 |
| Antrag eines Ausschusses | § 27 Abs. 1 GOG-NR: „Selbständige Anträge auf Erlassung von Gesetzen …, die mit dem im Ausschuß behandelten Gegenstand in inhaltlichem Zusammenhang stehen" | Ausschuss | nein (kein Ministerialentwurf) | **ja**, § 23b Abs. 1 nennt „Ausschüssen"; 1 Stellungnahme auf 14/BUA XXVIII gezählt | BUA, 84 / 18 |
| Gesetzesantrag des Bundesrates | Art. 41 Abs. 1 B-VG; § 21 Abs. 1 und 3 GO-BR (Antrag von drei Bundesräten, Beschluss des Bundesrates) | Bundesrat | nein (nicht belegt, dass es vorkommt) | ja, § 23b Abs. 1; Parlament: „Begutachtung erst ab 1.8.2021 bei dem Doktyp "GABR" möglich" | GABR, 2 / 0 |
| Gesetzesantrag eines Drittels der Bundesräte | Art. 41 Abs. 1 B-VG; § 21 Abs. 6 GO-BR: von „mindestens einem Drittel der Mitglieder des Bundesrates unterzeichnet", dem Nationalrat zu übermitteln, „wenn dies von den Unterzeichnern verlangt wird" | ein Drittel der Bundesräte | nein (nicht belegt) | nach dem Wortlaut von § 23b Abs. 1 („Gesetzesanträge des Bundesrates") nicht eindeutig; Parlament: „erst ab 1.8.2021 bei dem Doktyp "GABR13" möglich" | GABR13, 4 / 0 |
| Volksbegehren | Art. 41 Abs. 2 B-VG: 100.000 Stimmberechtigte „oder … je ein Sechstel der Stimmberechtigten dreier Länder"; „kann in Form eines Gesetzesantrages gestellt werden" | Stimmberechtigte; Einleitung: ein Promille der Wohnbevölkerung (§ 3 Abs. 2 VoBeG 2018) | nein | ja, § 23b Abs. 1; 1.465 Stellungnahmen auf einem einzigen (`volksbegehren.md` §6) | VOLKBG, 43 / 5 |

**Vorrang und Fristen** beim Volksbegehren: § 24 GOG-NR („haben den Vorrang
vor allen übrigen Gegenständen"; Vorberatung binnen eines Monats, Bericht
nach weiteren vier Monaten). Erste Lesung: Regierungsvorlagen,
Bundesratsanträge und Volksbegehren nur auf Beschluss des Nationalrates,
Initiativanträge, „wenn es im Antrag verlangt wird" (§ 69 Abs. 3 und 4
GOG-NR).

**Ein Gesetzesantrag des Bundesrates wurde Gesetz**: XXV/I/452
(Versicherungsaufsichtsgesetz 2016, Änderung) nennt im Detail-JSON
„Bundesgesetzblatt I Nr. 44/2015". Die übrigen geprüften GABR und GABR13
blieben im Ausschuss (Status „zugewiesen", „auf der Tagesordnung").

### § 23b GOG-NR: wofür das Fenster gilt

Wortlaut Abs. 1: „Vorlagen der Bundesregierung sowie Selbständige Anträge
von Abgeordneten oder Ausschüssen auf Erlassung von Gesetzen,
Gesetzesanträge des Bundesrates und Volksbegehren sind auf der Website des
Parlaments zu veröffentlichen. Während des parlamentarischen
Gesetzgebungsverfahrens können dazu Stellungnahmen abgegeben werden." Abs. 2
erstreckt das auf Petitionen und Bürgerinitiativen „während ihrer
parlamentarischen Behandlung", Abs. 3 regelt die Veröffentlichung der
Stellungnahmen zu Ministerialentwürfen. Die Parlamentsseite „Stellung
nehmen zu Gesetzesinitiativen" zählt genau diese Gegenstände auf und
erwähnt Staatsverträge nicht; die Stellungnahme ist „bis zum Ende des
parlamentarischen Verfahrens möglich".

Was die Daten des Parlaments dazu sagen (Detail-JSON, Feld
`statementsstate`, 14.11.2026):

| Typ | `statementsstate` | Stellungnahmen gezählt (Liste 142) |
|---|---|---|
| RVS (Staatsvertrag) | `9` „Keine Begutachtung bei dem Doktyp "RVS" möglich" | 0 auf 131 Vorlagen, GP XXVII und XXVIII |
| AUB (Ausschussbericht) | `9` „Keine Begutachtung bei dem Doktyp "AUB" möglich" | nicht gezählt |
| BUA (Ausschussantrag) | `0` | 1 auf 14/BUA XXVIII; 0 auf 232/BUA XXVIII |
| GABR, GABR13, EBR (vor 1.8.2021) | `9` „Begutachtung erst ab 1.8.2021 … möglich" | 0 auf den geprüften |
| RV (Kontrolle) | — | 10 auf 2238 d.B. XXVII, wie in `stellungnahme-was-danach-passiert.md` |

Was `0` bedeutet, ist nicht dokumentiert (`api-exploration.md` §1 kennt
`1`, `2`, `4` als offen und `5` als geschlossen); `0` steht auch auf der
abgeschlossenen 2238 d.B.

**Abgleich mit den Notizen im Repository:**

- `volksbegehren.md` §2 und §6: Volksbegehren nehmen seit 1.8.2021
  Stellungnahmen an. **Stimmt** mit dem Wortlaut überein.
- `begutachtung-uebersprungen.md` §4c: „parliament publishes every
  Gesetzesinitiative … and accepts statements on it — including on
  Initiativanträge and on Regierungsvorlagen". **Stimmt für RV und Anträge,
  ist aber zu weit**: Regierungsvorlagen zu Staatsverträgen sind
  ausgenommen (Parlamentsdaten), und „every" verdeckt, dass auch
  Ausschussanträge und Bundesratsanträge dazugehören.
- `stellungnahme-was-danach-passiert.md` §2 nennt § 23b „as amended by
  BGBl. I 81/2024"; `volksbegehren.md` §6 schreibt, 81/2024 habe nur Abs. 3
  (Veröffentlichung der Stellungnahmen zu Ministerialentwürfen) gebracht.
  Beides verträgt sich; die Fassungsgeschichte wurde hier nicht gelesen.
- `docs/decisions.md`: das Fenster „lasts until the Bundesrat decides".
  Der Wortlaut sagt „während des parlamentarischen
  Gesetzgebungsverfahrens", die Parlamentsseite „bis zum Ende des
  parlamentarischen Verfahrens". Ob ein Einspruch des Bundesrates (Typ EBR)
  das Fenster wieder öffnet, ist **nicht belegt** (EBR-Gegenstände tragen
  seit 2021 `statementsstate` `0`, die zwei geprüften 0 Stellungnahmen).

### Begutachtung vor dem Parlament: die Rechtslage

Verfassung und Gesetz schreiben dem Bund keine öffentliche Begutachtung vor.
RLW (03.02.2026): Grundlage sind Rundschreiben des Verfassungsdienstes (1971,
erneuert 2008). Was es gibt:

- § 9 Abs. 3 WFA-Grundsatz-Verordnung: „Die Organe des Bundes haben … eine
  angemessene Begutachtungsfrist festzusetzen. Im Regelfall soll den zur
  Begutachtung eingeladenen Stellen eine Begutachtungsfrist von mindestens
  sechs Wochen zur Verfügung stehen." Abs. 4 setzt voraus, dass es
  Verordnungen gibt, bei denen „ein Begutachtungsverfahren … nicht
  vorgesehen ist".
- **Rechte der Kammern**, für Bund und Länder: § 93 Abs. 2 AKG: „Entwürfe von
  Gesetzen sind vor ihrer Einbringung in die jeweilige gesetzgebende
  Körperschaft der zuständigen Arbeiterkammer … zur Stellungnahme …
  zu übermitteln. Das gleiche gilt für Verordnungen und Kundmachungen".
  § 10 Abs. 1 WKG erstreckt das „Begutachtungsrecht" auf Verordnungen
  „einschließlich solcher aus dem Bereich der mittelbaren
  Bundesverwaltung", auf Staatsverträge und Vereinbarungen gemäß Art. 15a
  B-VG. (Damit ist die Lücke aus `stellungnahme-was-danach-passiert.md` §3,
  „the three provisions were not read in the RIS", für AKG und WKG
  geschlossen; § 66c ÄrzteG wurde nicht gelesen.)
- Konsultationsmechanismus (Art. 15a-Vereinbarung, BGBl. I Nr. 35/1999):
  Bund, Länder und Gemeinden „müssen einander Gesetz- und
  Verordnungsentwürfe zur Stellungnahme übermitteln" (RLW). Den Text der
  Vereinbarung hat `begutachtung-reformvorschlaege.md` §1 gelesen.
- RLW nennt zusätzlich Art. 14b Abs. 4 und Art. 21 Abs. 4 B-VG als
  besondere Konsultationsregeln zwischen Bund und Ländern (nicht gelesen).

## Bund — im Parlament

Was innerhalb der Station „Parlament" verzweigt, nach dem B-VG:

| Schritt | Rechtsgrundlage (gekürzt) | Folge für den Weg |
|---|---|---|
| Ausschuss lädt zu schriftlichen Äußerungen ein (Ausschussbegutachtung) | § 40 Abs. 1 GOG-NR: „Sachverständige oder andere Auskunftspersonen zur mündlichen oder schriftlichen Äußerung einzuladen"; RLW: „Auf Grundlage von § 40 GOG-NR wurden ausgewählte Personen oder Institutionen zur Abgabe schriftlicher Stellungnahmen" eingeladen | geladener Kreis, nicht die Öffentlichkeit; der Monitor erkennt sie (`readCommitteeConsultation`) |
| Bundesrat: Einspruch | Art. 42 Abs. 2, 3: „mit Gründen versehenen Einspruch", „binnen acht Wochen" | Rückkehr zum Nationalrat |
| Nationalrat: Beharrungsbeschluss | Art. 42 Abs. 4: „Wiederholt der Nationalrat seinen ursprünglichen Beschluss bei Anwesenheit von mindestens der Hälfte der Mitglieder, so ist dieser zu beurkunden und kundzumachen." | Gesetz trotz Einspruch; beim Parlament Typ EBR (8 in GP XXVII) |
| Keine Mitwirkung des Bundesrates | Art. 42 Abs. 5: Geschäftsordnung des Nationalrates, seine Auflösung, Bundeshaushaltsrecht, Bundesfinanzrahmengesetz, Bundesfinanzgesetz, Verfügungen über Bundesvermögen u. a. | Station Bundesrat entfällt |
| Zustimmung des Bundesrates | Art. 44 Abs. 2 (Verfassungsrecht, das Länderzuständigkeiten einschränkt, zwei Drittel); Art. 50 Abs. 2 Z 2 (Staatsverträge im selbständigen Wirkungsbereich der Länder) | Zustimmung statt Einspruch |
| Zustimmung der Länder | Art. 42a: gilt als erteilt, wenn der Landeshauptmann sie nicht binnen acht Wochen verweigert | Wartezeit vor der Kundmachung |
| Volksabstimmung über ein einfaches Gesetz | Art. 43: „wenn der Nationalrat es beschließt oder die Mehrheit der Mitglieder des Nationalrates es verlangt", vor der Beurkundung | eigene Station; Ablehnung beendet den Weg (Art. 45 Abs. 1: unbedingte Mehrheit) |
| Bundesverfassungsgesetz | Art. 44 Abs. 1: Hälfte der Mitglieder anwesend, zwei Drittel der Stimmen, ausdrücklich zu bezeichnen | kein eigener Weg, eine Mehrheitsregel |
| Volksabstimmung über eine Verfassungsänderung | Art. 44 Abs. 3: „Jede Gesamtänderung …, eine Teiländerung aber nur, wenn dies von einem Drittel der Mitglieder des Nationalrates oder des Bundesrates verlangt wird"; § 26 Abs. 1 GO-BR | Pflicht bei Gesamtänderung, sonst auf Verlangen |
| Beurkundung | Art. 47: Bundespräsident, Gegenzeichnung des Bundeskanzlers | — |
| Kundmachung | Art. 48, 49 Abs. 1: „vom Bundeskanzler im Bundesgesetzblatt kundzumachen"; BGBlG § 3 Z 1: Gesetzesbeschlüsse in BGBl. I | Station „Kundgemacht"; ein Gesetz aus einer Volksabstimmung „mit Berufung auf das Ergebnis der Volksabstimmung" (Art. 48) |

Dass Art. 43 oder Art. 44 Abs. 3 seit 1945 angewendet wurden, wurde hier
nicht aus einer Quelle belegt (siehe „Offen").

## Bund — andere Rechtsnormen

| Norm | Wer erlässt | Rechtsgrundlage | Begutachtung | Kundmachung |
|---|---|---|---|---|
| Verordnung eines Bundesministers | Bundesminister | Art. 18 Abs. 2 B-VG: „Jede Verwaltungsbehörde kann auf Grund der Gesetze innerhalb ihres Wirkungsbereiches Verordnungen erlassen." | möglich, nicht vorgeschrieben (WFA-GV § 9 Abs. 4); Kammern: AKG § 93 Abs. 2, WKG § 10 Abs. 1. In RIS „Begut": 3.012 von 4.574 Datensätzen (`api-exploration.md` §2) | BGBl. II (BGBlG § 4 Abs. 1 Z 2) |
| Verordnung der Bundesregierung | Bundesregierung | Art. 18 Abs. 2 B-VG | wie oben | BGBl. II (§ 4 Abs. 1 Z 2) |
| Verordnung anderer oberster Organe | Präsident des Nationalrates, des Rechnungshofes, VwGH, VfGH, Vorsitz der Volksanwaltschaft | § 4 Abs. 1 Z 2 BGBlG | nicht belegt | BGBl. II |
| Verordnung einer anderen Bundesbehörde, z. B. Regulierungsbehörde | E-Control, FMA, Regulierungsbehörde nach TKG u. a. | Art. 18 Abs. 2 B-VG; Kundmachung § 4 Abs. 2 Z 2 BGBlG | **gesetzlich vorgeschrieben, auf eigener Seite**: E-ControlG § 36 Abs. 3 („Vor der Erlassung von Verordnungen hat die Regulierungsbehörde eine öffentliche Begutachtung mit angemessener Frist durchzuführen"); FMABG § 22 Abs. 3a (für Verordnungen, Rundschreiben, Leitfäden; Stellungnahmen „auf ihrer Internet-Homepage zu veröffentlichen"); TKG 2021 § 206 (mindestens 30 Tage, Ergebnisse „der Öffentlichkeit zugänglich"). **Nicht in RIS „Begut"**: dort stehen nur Ministerien | BGBl. II, wo angeordnet; sonst „in anderer geeigneter Weise" (E-ControlG § 36 Abs. 3) |
| Staatsvertrag, genehmigungspflichtig | Bundespräsident schließt ab (Art. 65 Abs. 1), Nationalrat genehmigt | Art. 50 Abs. 1: „politischen Staatsverträgen und Staatsverträgen, die gesetzändernden oder gesetzesergänzenden Inhalt haben", und Änderungen der EU-Verträge; Bundesrat zustimmen bei Länderangelegenheiten (Abs. 2 Z 2) | möglich (WKG § 10); im Parlament keine Stellungnahme (Typ RVS) | BGBl. III (BGBlG § 5 Abs. 1 Z 1) |
| Staatsvertrag ohne Genehmigung | Bundespräsident, Bundesregierung oder Bundesminister (Art. 66 Abs. 2) | Art. 65 Abs. 1, Art. 66 Abs. 2 | nicht belegt | BGBl. III; Ausnahme § 5 Abs. 3 BGBlG |
| Vereinbarung Bund–Länder | Bundesregierung oder Bundesminister | Art. 15a Abs. 1 B-VG; bindet sie die Bundesgesetzgebung, „nur von der Bundesregierung mit Genehmigung des Nationalrates" | möglich (WKG § 10) | BGBl. I bei Genehmigung des Nationalrates (§ 3 Z 6), sonst BGBl. II (§ 4 Abs. 1 Z 7) |
| Notverordnung | Bundespräsident auf Vorschlag der Bundesregierung | Art. 18 Abs. 3–5 B-VG: wenn der Nationalrat „nicht rechtzeitig zusammentreten kann"; binnen vier Wochen ersetzt der Nationalrat sie durch ein Bundesgesetz oder verlangt die Aufhebung | nein (Natur der Sache; nicht belegt) | nicht belegt |
| Wiederverlautbarung | Bundeskanzler mit den zuständigen Bundesministern | Art. 49a B-VG: Gesetze „in ihrer geltenden Fassung … wiederzuverlautbaren", mit begrenzten Berichtigungen (Abs. 2) | nicht belegt | BGBl. I (§ 3 Z 2), bei Staatsverträgen BGBl. III (§ 5 Abs. 1 Z 2) |
| Aufhebung durch den VfGH | Verfassungsgerichtshof, Kundmachung durch den Bundeskanzler | Art. 140 Abs. 5 B-VG (zitiert in § 3 Z 3 BGBlG) | — | BGBl. I (§ 3 Z 3); bei Verordnungen BGBl. II (§ 4 Abs. 1 Z 4) |

Ein Bundesgesetz entsteht in allen Fällen über Art. 41 und 42; die Zeilen
darunter sind Normen, die ohne Nationalrat (oder nur mit seiner
Genehmigung) gelten, und Kundmachungen, die geltendes Recht ändern, ohne
dass jemand etwas beschließt (Wiederverlautbarung, VfGH-Aufhebung).

## Länder

Art. 97 Abs. 1 B-VG ist der Rahmen: „Zu einem Landesgesetz sind der
Beschluss des Landtages, die Beurkundung und Gegenzeichnung nach den
Bestimmungen der Landesverfassung und die Kundmachung durch den
Landeshauptmann im Landesgesetzblatt erforderlich." Alles Weitere regelt
jedes Land selbst. Die Tabellen zitieren die Landesverfassung (B: L-VG
Burgenland; K: K-LVG; N: NÖ LV 1979; O: Oö. L-VG; S: L-VG 1999 Salzburg;
St: L-VG 2010 Steiermark; T: Tiroler Landesordnung 1989; V: Landesverfassung
Vorarlberg; W: Wiener Stadtverfassung, WStV). Zweitquelle nicht geprüft,
außer Vorarlberg.

### Wer einen Gesetzesvorschlag in den Landtag bringt

| Land | Bestimmung | Regierung | Abgeordnete | Ausschüsse | Volksbegehren | Gemeinden | Sonst |
|---|---|---|---|---|---|---|---|
| Burgenland | Art. 29 Abs. 1, Art. 30 | ✓ | ✓ (Zahl nicht im L-VG) | ✓ | ✓ | ✓ als Volksbegehren: 10 Gemeinden einstimmig oder 18 Gemeinden (Art. 30 Abs. 1 Z 2, 3) | — |
| Kärnten | Art. 31 | ✓ | ✓ (Zahl nicht im K-LVG) | ✓ | ✓ (Abs. 2) | — | — |
| Niederösterreich | Art. 22 Abs. 1, Art. 26 | ✓ | ✓ (Zahl nicht in der LV) | ✓ | ✓, aber **als Vorlage der Landesregierung** (Art. 26 Abs. 2) | ✓ als Volksbegehren: 50 Gemeinden | — |
| Oberösterreich | Art. 30 Abs. 1, Art. 59 | ✓ | ✓ | ✓ | als „Initiativen der Landesbürgerinnen und Landesbürger" (Bürgerinitiative, 2 %) | — | — |
| Salzburg | Art. 21 L-VG; § 66 Landtags-GO | ✓ | ✓ | ✓ (nur in der GO: „Selbstständige Anträge von Ausschüssen") | ✓, als Vorlage der Landesregierung (Art. 21 Abs. 2) | — | — |
| Steiermark | Art. 69–71 L-VG; § 18 Abs. 1 GeoLT 2005 | ✓ | ✓, „von mindestens zwei Abgeordneten" (§ 18 GeoLT) | ✓ | ✓ | ✓ **Gemeindeinitiative**: „gleich lautende Gemeinderatsbeschlüsse von mindestens 50 Gemeinden" (Art. 71) | — |
| Tirol | Art. 35, Art. 37 | ✓ | ✓ | ✓ | ✓ | ✓ als Volksbegehren: 40 Gemeinden oder die Stadt Innsbruck | — |
| Vorarlberg | Art. 32, Art. 33 | ✓ | ✓, „von mindestens zwei Mitgliedern" | ✓ | ✓ | ✓ als Volksbegehren: 10 Gemeinden | — |
| Wien | § 125, § 131b WStV | ✓ (vom zuständigen Mitglied in der Landesregierung eingebracht) | ✓, „Unterstützung von fünf Landtagsabgeordneten" | nicht belegt | ✓ | — | — |

Zahl der Abgeordneten, wo „Zahl nicht in der Verfassung": in der
jeweiligen Geschäftsordnung, nicht geprüft.

### Begutachtung

| Land | Bestimmung | Gesetzesentwürfe der Regierung | Anträge im Landtag | Wer darf Stellung nehmen | Unterlassung |
|---|---|---|---|---|---|
| Burgenland | Art. 68 Abs. 4 L-VG; Bürgerinnen- und Bürgerbegutachtungsgesetz (LGBl., RIS 10000145) §§ 6–10 | „von grundsätzlicher Bedeutung **sollen** der Öffentlichkeit … bekanntgegeben werden" | auf Beschluss des Ausschusses | „Jede Landesbürgerin und jeder Landesbürger", sechs Wochen; die Stellungnahmen gehen „im Anhang zur Gesetzesvorlage" an den Landtag (§ 9 Abs. 2) | nicht geregelt |
| Kärnten | Art. 33 K-LVG | **Pflicht** („sind … einem Begutachtungsverfahren zu unterziehen") | auf Beschluss des Ausschusses (Abs. 2) | „jede Person", mindestens vier Wochen (Abs. 3) | „kein Rechtsanspruch", ohne Einfluss auf die Rechtmäßigkeit (Abs. 4) |
| Niederösterreich | Art. 25 NÖ LV | **Pflicht**; begutachtende Stellen genannt (Bund, Interessenvertretungen, Gemeindevertretungen) | nicht geregelt | „Jedermann" gegen Kostenersatz, „(Bürgerbegutachtung)" (Abs. 3) | ohne Einfluss (Abs. 4) |
| Oberösterreich | Art. 58 Oö. L-VG | Bürger-Begutachtung „von grundsätzlicher Bedeutung", **wenn die Landesregierung dies beschließt** | auf Beschluss des Ausschusses (Abs. 2) | Landesbürgerinnen und -bürger, sechs Wochen | ohne Einfluss (Abs. 4). Eine Pflicht zur allgemeinen Begutachtung steht nicht im L-VG (nicht belegt, ob anderswo) |
| Salzburg | — (L-VG schweigt); § 55 Abs. 7 Landtags-GO setzt sie voraus: „Gesetzentwürfe, die von der Landesregierung zur Begutachtung ausgesandt werden, sind … jeder Landtagspartei … zur Verfügung zu stellen" | keine Pflicht gefunden | nicht geregelt | nicht geregelt | — |
| Steiermark | Art. 68 L-VG; § 24 GeoLT | **Pflicht**, auch für **Verordnungsentwürfe** | „können vom jeweils befassten Ausschuss … unterzogen werden" | „Jede Person"; Frist „soll nicht kürzer als vier Wochen sein"; „Die Stellungnahmen sind zu veröffentlichen." (Abs. 4) | ohne Einfluss (Abs. 5) |
| Tirol | Art. 36 TLO | **Pflicht**, „es sei denn, daß die besondere Dringlichkeit … nicht zuläßt"; Gemeindeverbände und Kammern „jedenfalls … zu hören" | nicht geregelt | in der TLO nicht geregelt | hindert das Zustandekommen nicht (Abs. 3) |
| Vorarlberg | Art. 34 L-V | **Pflicht** („wird … durchgeführt") | nicht geregelt | „Jede Person kann während der Begutachtungsfrist Änderungsvorschläge erstatten"; Veröffentlichung „auf der Homepage des Landes" (Abs. 2) | nur zur Anhörung der Kammern geregelt (Abs. 3) |
| Wien | — (WStV schweigt; RIS-Volltextsuche „Begutachtungsverfahren" in Wien ohne Treffer zum Gesetzgebungsverfahren) | keine Pflicht gefunden | nicht geregelt | nicht geregelt | — |

Für alle neun gilt zusätzlich § 93 Abs. 2 AKG (Entwürfe von Gesetzen „vor
ihrer Einbringung in die jeweilige gesetzgebende Körperschaft") und § 10 WKG
(Kammerbegutachtung).

### Volksbegehren, Volksabstimmung, Volksbefragung

| Land | Volksbegehren (Schwelle) | Folge, wenn der Landtag nicht folgt | Volksabstimmung über einen Gesetzesbeschluss | Volksbefragung |
|---|---|---|---|---|
| Burgenland | 6.000; Einleitung 2.000; muss „in Form eines Gesetzesentwurfes" gestellt werden (Art. 30) | — | auf Beschluss des Landtags oder auf Verlangen von 12.000 (Art. 33); ausgenommen u. a. Katastrophen, fristgebundene Ausführungsgesetze, Abgaben | Landesregierung; auf Verlangen von 6.000 (Art. 67) |
| Kärnten | 7.500 (Art. 31 Abs. 2) | — | nur auf Beschluss des Landtags (Art. 34) | Landesregierung; Landtag, ein Drittel der Abgeordneten oder 7.500 (Art. 43) |
| Niederösterreich | 25.000 oder 50 Gemeinden; auch auf Landesverfassungsgesetze (Art. 26) | über 10 % Unterstützung und binnen eines Jahres nicht „wenigstens den Grundsätzen nach Rechnung getragen": Volksbefragung auf Verlangen (Art. 47a Abs. 3) | Mehrheit der Abgeordneten, 25.000 oder 50 Gemeinden binnen sechs Wochen (Art. 27) | Landesregierung; 25.000, 50 Gemeinden oder Landtag (Art. 47a) |
| Oberösterreich | Bürgerinitiative 2 % der Wahlberechtigten (Art. 59 Abs. 3) | bei 4 %: Bürger-Befragung; fällt sie für die Initiative aus, muss der Landtag binnen sechs Monaten neu beschließen, „Dieser Beschluss ist zu begründen" (Art. 59 Abs. 5–7) | nur auf Beschluss des Landtags (Art. 60) | nur die Befragung nach Art. 59; eine allgemeine Volksbefragung steht nicht im L-VG |
| Salzburg | 10.000, „in einer Volksabstimmung angenommen" (Art. 21 Abs. 2) — Wortlaut, siehe „Offen" | — | Landtag oder Mehrheit der Abgeordneten (Art. 22 Abs. 4); Gesamtänderung der Landesverfassung immer, Teiländerung auf Verlangen eines Drittels (Art. 23 Abs. 2) | Art. 5; auch auf Verlangen eines Drittels der Abgeordneten (Art. 29 Abs. 3); weitere Auslöser im Landesgesetz, nicht geprüft |
| Steiermark | 17.000, Beschluss binnen eines Jahres (Art. 69 Abs. 3) | ab 50.000 und ohne entsprechenden Beschluss: Volksabstimmung auf Verlangen (Art. 70) | Landtag, 50.000 oder 50 Gemeinden binnen sechs Wochen; nicht bei Dringlicherklärung mit zwei Dritteln (Art. 72) | 17.000, Landtag, ein Drittel der Abgeordneten, Landesregierung oder 50 Gemeinden (Art. 74) |
| Tirol | 7.500, 40 Gemeinden oder Innsbruck (Art. 37) | — | Landtag, 7.500 oder 40 Gemeinden binnen sechs Wochen; abgelehnt nur bei über 50 % Beteiligung (Art. 39) | Landesregierung; Landtag, 7.500 oder 40 Gemeinden (Art. 60) |
| Vorarlberg | 5.000 oder 10 Gemeinden (Art. 33 Abs. 4) | ab 10 % und Ablehnung durch den Landtag: Volksabstimmung (Abs. 5) | 10.000, 10 Gemeinden, Mehrheit der Abgeordneten oder Landtag binnen acht Wochen; bei bestimmten Verfassungsänderungen „jedenfalls" (Art. 35) | in Angelegenheiten der Verwaltung: 5.000, 10 Gemeinden, Landtag, Landesregierung (Art. 58) |
| Wien | 5 % der Wahlberechtigten, als Gesetzentwurf (§ 131b WStV) | — | nur auf Beschluss des Landtags; Ablehnung wirkt nur bei Beteiligung der Hälfte (§ 131c) | nur auf Gemeindeebene (§ 112a WStV) |

### Petitionen und landesspezifische Instrumente

| Land | Petition an den Landtag | Pflicht zu antworten | Weiteres |
|---|---|---|---|
| Burgenland | § 34 GO Landtag: Petitionsausschuss | „schriftlich zu beantworten oder hierüber dem Landtag zu berichten" | Bürgerinitiative an die Landesregierung, 25 % der Wahlberechtigten einer betroffenen Gemeinde (Art. 68 Abs. 1, 2) |
| Kärnten | im K-LVG nicht gefunden; GO nicht geprüft | — | Art. 1 Abs. 4: Bekenntnis zu „anderen Formen der partizipativen Demokratie" |
| Niederösterreich | in der LV nicht gefunden; GO nicht geprüft | — | — |
| Oberösterreich | Art. 64 | „in Behandlung zu nehmen und zu beantworten" | Bürger-Begutachtung auch für Verordnungen (Art. 61) |
| Salzburg | Art. 55 | Beschluss des Landtags nur, „wenn sie von einem Mitglied des Landtages oder der Landesregierung unterstützt wird" | Art. 5 Abs. 5: partizipative Demokratie |
| Steiermark | Art. 76 (Eingaben an Organe des Landes) | „umgehend in Behandlung zu nehmen und zu beantworten" | Initiativrecht gegenüber der Landesregierung (85.000 oder Bezirksquorum, Art. 73); Kontrollinitiative 2 % (Art. 51 Abs. 3) |
| Tirol | Art. 12: „Das Petitionsrecht steht jedermann zu" | nicht geregelt | — |
| Vorarlberg | Art. 10 | „innerhalb von drei Monaten beantwortet werden" | **Bürgerrat**: Richtlinie der Landesregierung, gestützt auf Art. 1 Abs. 4 L-V („fördert auch andere Formen der partizipativen Demokratie"); laut vorarlberg.at auf Verlangen von 1.000 Personen einzuberufen, gibt Empfehlungen. Den Text der Richtlinie nicht gelesen |
| Wien | Gesetz „Petitionen in Wien" (RIS 20000324): 500 Unterstützende ab 16 mit Hauptwohnsitz in Wien, auch elektronisch mit ID Austria; Petitionsausschuss des **Gemeinderates**, nur Angelegenheiten der Gemeindeverwaltung (§ 1) | Stellungnahmen des Ausschusses werden veröffentlicht (§ 3 Abs. 5) | — |

### Die Rolle der Bundesregierung, Verfassungsgesetze, Vereinbarungen

- **Art. 98 B-VG heute**: „Insoweit ein Gesetzesbeschluss der Zustimmung der
  Bundesregierung bedarf, ist er … dem Bundeskanzleramt bekanntzugeben. Die
  Zustimmung gilt als erteilt, wenn die Bundesregierung nicht innerhalb von
  acht Wochen … mitgeteilt hat, dass die Zustimmung verweigert wird."
  Zustimmungspflichtig ist nach Art. 97 Abs. 2 ein Landesgesetz, das „bei der
  Vollziehung die Mitwirkung von Bundesorganen vorsieht". Ein allgemeines
  Einspruchsrecht der Bundesregierung steht nicht mehr im B-VG. Für Landes-
  und Gemeindeabgaben nennen die Landesverfassungen einen Einspruch nach
  § 9 F-VG 1948 (TLO Art. 38 Abs. 6; Oö. L-VG Art. 60 Abs. 2; L-VG Salzburg
  Art. 22 Abs. 2); § 9 F-VG wurde nicht gelesen. Kärnten (Art. 33a) und
  Tirol (Art. 38 Abs. 7) erlauben, ein Gesetz ohne die nicht genehmigten
  Bestimmungen kundzumachen.
- **Landesverfassungsgesetze**: Art. 99 Abs. 2 B-VG, Hälfte der Abgeordneten
  anwesend, zwei Drittel der Stimmen.
- **Notverordnung der Landesregierung**: Art. 97 Abs. 3, 4 B-VG, im
  Einvernehmen mit einem Landtagsausschuss, wenn der Landtag nicht
  rechtzeitig zusammentreten kann.
- **Vereinbarungen zwischen Ländern**: Art. 15a Abs. 2 B-VG, nur im
  selbständigen Wirkungsbereich, der Bundesregierung „unverzüglich zur
  Kenntnis zu bringen". Wie der Landtag beteiligt ist, regelt die
  Landesverfassung, z. B. NÖ LV Art. 44 (Genehmigung; der Landtag kann
  beschließen, „daß die Vereinbarung durch Erlassung von Gesetzen zu
  erfüllen ist"). Für die anderen acht nicht geprüft.

### Je Land, was besonders ist

- **Burgenland**: das einzige Land mit eigenem Gesetz über die
  Bürgerbegutachtung, das die Weitergabe an den Landtag vorschreibt
  (§ 9 Abs. 2) und Einsender über den Beginn der Behandlung im Landtag
  informiert (§ 10 Abs. 2, „nach Möglichkeit"). Volksbegehren von Gemeinden
  sind unzulässig, wenn der Vorschlag das Land finanziell belastet (Art. 30
  Abs. 1a).
- **Kärnten**: Ein Gesetz, das eine Gemeinde auflöst, darf erst nach einer
  Volksbefragung in den betroffenen Gemeinden als Regierungsvorlage
  eingebracht werden (Art. 3 Abs. 3 K-LVG).
- **Niederösterreich**: Das Volksbegehren wird zur Regierungsvorlage (Art. 26
  Abs. 2) und läuft damit im Landtag auf dem Weg einer Vorlage. Verordnungen
  der Landesregierung „von allgemeiner Bedeutung" müssen in Begutachtung
  (Art. 45a).
- **Oberösterreich**: Die Bürgerinitiative ersetzt das Volksbegehren und
  kann auch Verwaltungsmaßnahmen verlangen (Art. 59 Abs. 1 Z 2); die einzige
  Begründungspflicht für den Landtag in einer Landesverfassung (Abs. 7).
- **Salzburg**: weder Begutachtungspflicht noch Antragsrecht der Ausschüsse
  in der Verfassung; beides nur in der Geschäftsordnung.
- **Steiermark**: das weiteste Paket: Begutachtungspflicht für Gesetze und
  Verordnungen mit Veröffentlichung der Stellungnahmen, Gemeindeinitiative,
  Volksbegehren mit nachfolgender Volksabstimmung, Anhörung der Gemeinden
  im Ausschuss (Art. 22 Abs. 4a L-VG 2010).
- **Tirol**: Volksabstimmung lehnt nur ab, wenn mehr als die Hälfte der
  Stimmberechtigten teilnimmt (Art. 39 Abs. 4).
- **Vorarlberg**: Veröffentlichung im Internet steht in der Verfassung
  (Art. 34 Abs. 2); Volksbegehren mit mindestens 10 % gehen bei Ablehnung in
  die Volksabstimmung (Art. 33 Abs. 5); Bürgerräte.
- **Wien**: Land und Gemeinde zugleich; Petitionen und Volksbefragungen sind
  Gemeinderecht. Eine Begutachtungspflicht steht nicht in der WStV.

### Landesverordnungen

| Wer | Rechtsgrundlage | Begutachtung |
|---|---|---|
| Landesregierung | Art. 101 Abs. 1 B-VG („Die Vollziehung jedes Landes übt eine vom Landtag zu wählende Landesregierung aus"), Art. 18 Abs. 2 B-VG | Pflicht: Niederösterreich (Art. 45a, „von allgemeiner Bedeutung"), Steiermark (Art. 68 Abs. 1); kann: Oberösterreich (Art. 61, Bürger-Begutachtung); sonst in der Landesverfassung nicht geregelt; Kammern nach AKG § 93 Abs. 2, WKG § 10 |
| Landeshauptmann (mittelbare Bundesverwaltung) | Art. 102 Abs. 1 B-VG | WKG § 10 Abs. 1 nennt Verordnungen „aus dem Bereich der mittelbaren Bundesverwaltung"; sonst nicht belegt |
| Bezirksverwaltungsbehörden | Art. 18 Abs. 2 B-VG | nicht belegt. Tirol veröffentlicht 158 Verkehrsverordnungen der Bezirkshauptmannschaften im IFG-Register (`laender-luecken.md`) |
| Gemeinden | nur Hinweis: eigene Verordnungen im eigenen Wirkungsbereich | nicht geprüft |

Wo Landesverordnungen kundgemacht werden (Landesgesetzblatt, Amtsblatt),
regelt jedes Land; nicht geprüft.

## EU

Art. 288 AEUV: „Die Verordnung hat allgemeine Geltung. Sie ist in allen
ihren Teilen verbindlich und gilt unmittelbar in jedem Mitgliedstaat. Die
Richtlinie ist … hinsichtlich des zu erreichenden Ziels verbindlich,
überlässt jedoch den innerstaatlichen Stellen die Wahl der Form und der
Mittel. Beschlüsse sind in allen ihren Teilen verbindlich." Für die
Vorzeilen der Grafik heißt das: Eine **Richtlinie** verlangt ein nationales
Gesetz oder eine Verordnung (Umsetzung); eine **Verordnung** gilt ohne
nationalen Akt, zieht aber begleitende Regeln nach sich (Zuständigkeit,
Strafen); ein **Beschluss** kann beides auslösen. Der Monitor kennt alle
drei als Akte, die ein Entwurf nennt (`EuActView.kind`: `richtlinie`,
`verordnung`, `beschluss`, `rahmenbeschluss`) und als Aussage des Vorblatts
`umsetzung`, `flankierend-vo`, `flankierend-rl` (`shared/types/eu.ts`).
Die Grafik nennt nur „EU-Richtlinie".

## Wo man sich äußern kann

„Station" in der Sprache der Grafik: Entwurf · Begutachtung ·
Regierungsvorlage · Parlament · Kundgemacht, sonst „außerhalb".

| Instrument | Rechtsgrundlage | Wer | Station | Veröffentlicht | Pflicht der Empfänger |
|---|---|---|---|---|---|
| Stellungnahme zu einem Ministerialentwurf (Gesetz) | keine gesetzliche Pflicht zur Begutachtung; § 9 Abs. 3 WFA-GV (Frist); Veröffentlichung § 23b Abs. 3 GOG-NR | jede Person (Parlament: ab 14 Jahren) | Begutachtung | ja, Privatpersonen nur mit Einwilligung | keine; Entschließung 200/E (2017) „ersucht" um Darstellung in der Vorlage (`begutachtung-reformvorschlaege.md`) |
| Stellungnahme zu einem Verordnungsentwurf eines Ministeriums | wie oben, Begutachtung optional (§ 9 Abs. 4 WFA-GV) | jede Person, an das Ministerium (Begleitschreiben) | Begutachtung | nicht beim Parlament; je Ministerium, nicht geprüft | keine |
| Kammerbegutachtung | § 93 Abs. 2 AKG, § 10 WKG | nur die Kammern | Begutachtung | nicht geregelt | Pflicht, zu übermitteln, nicht zu antworten |
| Konsultationsmechanismus | Art. 15a-Vereinbarung BGBl. I Nr. 35/1999 | Bund, Länder, Gemeindebund, Städtebund | Begutachtung | nicht geregelt | Kostenfolge (`begutachtung-reformvorschlaege.md`) |
| Begutachtung einer Regulierungsbehörde | E-ControlG § 36 Abs. 3; FMABG § 22 Abs. 3a; TKG 2021 § 206 | „interessierte Personen" / „interessierten Kreise" | Begutachtung (Verordnung) | FMA: Stellungnahmen „zu veröffentlichen"; TKG: „Ergebnisse … der Öffentlichkeit zugänglich"; E-Control: nicht geregelt | keine |
| Stellungnahme im Parlament | § 23b Abs. 1 GOG-NR | jede Person ab 14 | Regierungsvorlage, Parlament (RV, Initiativantrag, Ausschussantrag, Bundesratsantrag, Volksbegehren; nicht Staatsverträge) | ja, Privatpersonen nur mit Einwilligung | keine; „den parlamentarischen Klubs und dem zuständigen Bundesministerium … zur Verfügung gestellt" |
| Zustimmung zu einer Stellungnahme | Parlamentsfunktion, Liste 305 (`api-exploration.md` §1); Rechtsgrundlage nicht belegt | jede Person | wie die Stellungnahme | Namen sichtbar (Liste 305) | keine |
| Ausschussbegutachtung | § 40 Abs. 1 GOG-NR | vom Ausschuss Eingeladene | Parlament | in Einzelfällen Synopse (RLW) | keine |
| Petition | § 100 Abs. 1 Z 1 GOG-NR: „von einem Mitglied des Nationalrates überreicht" | jede Person über einen Abgeordneten | außerhalb | ja, als Gegenstand (PET) | Ausschussbericht mit einem von drei Anträgen (§ 100c Abs. 3) |
| Parlamentarische Bürgerinitiative | § 100 Abs. 1 Z 2 GOG-NR: „mindestens 500 österreichischen Staatsbürgern, die … das 16. Lebensjahr vollendet haben"; eigenhändige Unterschrift (Abs. 2) | Staatsbürger ab 16 | außerhalb | ja (BI); Erstunterzeichner wird über die Erledigung informiert (§ 100d) | wie Petition |
| Elektronische Unterstützung einer Petition oder Bürgerinitiative | Parlamentsseite „Petitionen unterstützen"; Rechtsgrundlage nicht belegt | Staatsbürger ab 16 | außerhalb | Zahl immer, Namen nur mit Einverständnis | „nur informativen Charakter" |
| Stellungnahme zu Petition oder Bürgerinitiative | § 23b Abs. 2 GOG-NR | jede Person ab 16 (Parlamentsseite) | außerhalb | ja, wie oben | keine |
| Volksbegehren | Art. 41 Abs. 2 B-VG; VoBeG 2018 §§ 3–6 (Unterstützungserklärung online mit ID Austria oder bei der Gemeinde; Eintragungszeitraum acht Tage) | Wahlberechtigte zum Nationalrat | eigener Weg in den Nationalrat | Zahl der Eintragungen; Text | Behandlung binnen Fristen (§ 24 GOG-NR), kein Beschluss geschuldet |
| Volksbefragung | Art. 49b B-VG: auf Antrag von Abgeordneten oder der Bundesregierung, Beschluss des Nationalrates | Wahlberechtigte | außerhalb | Ergebnis an Nationalrat und Bundesregierung | keine Bindung genannt |
| Volksabstimmung | Art. 43, 44 Abs. 3 B-VG | Wahlberechtigte | zwischen Parlament und Kundgemacht | Ergebnis „amtlich zu verlautbaren" (Art. 45 Abs. 2) | bindend: entscheidet über das Gesetz |
| Strategische Umweltprüfung | Hinweis: Öffentlichkeitsbeteiligung bei Plänen und Programmen nach Unionsrecht (RL 2001/42/EG), in vielen Bundes- und Landesgesetzen umgesetzt | — | außerhalb (Pläne, keine Normen im Sinn der Grafik) | nicht geprüft | nicht geprüft |
| Land: Begutachtung | siehe Tabelle „Begutachtung" | je Land | Begutachtung | Steiermark Pflicht; Vorarlberg Entwurf im Internet; sonst nicht geregelt | Burgenland: Weitergabe an den Landtag |
| Land: Ausschuss-Begutachtung von Anträgen | B Art. 68 Abs. 4, K Art. 33 Abs. 2, O Art. 58 Abs. 2, St Art. 68 Abs. 2 | je Land | Parlament (Landtag) | je Land | keine |
| Land: Volksbegehren, Volksabstimmung, Volksbefragung, Petition, Bürgerinitiative, Gemeindeinitiative, Bürgerrat | siehe Ländertabellen | je Land | Volksbegehren und Gemeindeinitiative: eigener Weg; Volksabstimmung: vor Kundgemacht; sonst außerhalb | je Land | O Art. 59 Abs. 7 (Begründung), V Art. 10 (drei Monate), St Art. 76, O Art. 64 (Beantwortung) |
| EU: „Ihre Meinung zählt" | Art. 11 Abs. 3 EUV („führt die Europäische Kommission umfangreiche Anhörungen der Betroffenen durch"); Mitteilung COM(2021) 219 | jede Person | vor dem Entwurf (Einholung von Erkenntnissen, öffentliche Konsultation, „zwölf Wochen"); Rückmeldung zu angenommenen Vorschlägen und zu Entwürfen delegierter und Durchführungsrechtsakte (Dauer nicht belegt) | Beiträge veröffentlicht (COM(2021) 219, Fn. 31); zusammenfassender Bericht „in der Regel … innerhalb von acht Wochen" | keine Antwort im Einzelfall |
| EU: Europäische Bürgerinitiative | Art. 11 Abs. 4 EUV; VO (EU) 2019/788 Art. 3: „mindestens einer Million …" aus „mindestens einem Viertel der Mitgliedstaaten", Mindestzahlen je Staat | Unionsbürger | vor dem Entwurf | Register | Kommission legt binnen sechs Monaten „in einer Mitteilung ihre rechtlichen und politischen Schlussfolgerungen" dar, mit Gründen (Art. 15 Abs. 2); Anhörung im EP (Art. 14 Abs. 2) |
| EU: Petition an das Europäische Parlament | Art. 227 AEUV: jede Person mit Wohnsitz in der Union, „die ihn oder sie unmittelbar betreffen" | — | außerhalb | nicht geprüft | nicht geprüft |
| Subsidiaritätsrüge | Art. 23g B-VG: Nationalrat und Bundesrat „in einer begründeten Stellungnahme"; der Bundesrat gibt den Landtagen „Gelegenheit zur Stellungnahme" (Abs. 3) | Parlamente, Landtage | EU-Entwurf | nicht geprüft | — |

## Abgleich mit der Grafik

Spalten: hat `app/utils/wege.ts` eine Zeile; die fünf Stationen
(✓ durchläuft, ◆ Stellungnahme möglich, – entfällt, ? je nach Fall), jeweils
nach dem Recht; wo sich die Öffentlichkeit äußern kann; ob der Monitor den
Weg verfolgt (aus Code und Doku).

### Bund

| Weg | Zeile heute | Entwurf | Begut. | RV | Parl. | Kundg. | Äußerung | Monitor |
|---|---|---|---|---|---|---|---|---|
| Ministerialentwurf → Regierungsvorlage → Gesetz | `gesetz` | ✓ | ◆ (WFA-GV § 9) | ◆ (§ 23b) | ◆ | ✓ (Art. 49) | Begutachtung, § 23b | ja |
| Ministerialentwurf → Initiativantrag | `gesetz-als-antrag` | ✓ | ◆ | – | ◆ | ✓ | wie oben | ja |
| Regierungsvorlage ohne Entwurf | `vorlage-ohne-begutachtung` | – | – (§ 40 möglich) | ◆ | ◆ | ✓ | § 23b, Ausschussbegutachtung | ja |
| Initiativantrag ohne Entwurf | `antrag-ohne-begutachtung` | – | – (§ 40 möglich) | – | ◆ | ✓ | § 23b | ja |
| Antrag eines Ausschusses (§ 27) | `ausschussantrag` | – | ? (§ 40) | – | **◆** (§ 23b Abs. 1; Grafik: ✓) | ✓ | § 23b | nein (RIS nennt keinen Gegenstand; Parlament führt BUA) |
| Gesetzesantrag des Bundesrates | **fehlt** | – | – | – | ◆ (§ 23b Abs. 1) | ? | § 23b | nein (Typ GABR nicht gelesen) |
| Gesetzesantrag eines Drittels der Bundesräte | **fehlt** | – | – | – | ? (§ 23b-Wortlaut) | ? | nicht belegt | nein |
| Volksbegehren | `volksbegehren` | – | – | – | ◆ | ? | Unterstützung, Eintragung, § 23b | nein |
| Gesetz mit Volksabstimmung (Art. 43, 44 Abs. 3) | **fehlt** | wie Herkunft | wie Herkunft | wie Herkunft | ✓, dann Volksabstimmung | ✓ bei Annahme | Stimmabgabe | nein |
| Bundesrat erhebt Einspruch, Beharrungsbeschluss | **fehlt** (Verzweigung) | — | — | — | ✓ | ✓ | § 23b-Fenster nach Einspruch nicht belegt | nicht geprüft |
| Verordnung eines Ministeriums, in Begutachtung | `verordnung` | ✓ | ◆ | – | – | ✓ (BGBl. II) | Begutachtung | ja |
| Verordnung ohne Begutachtung | **fehlt** | ? | – (§ 9 Abs. 4 WFA-GV) | – | – | ✓ | keine | nein |
| Verordnung einer Regulierungsbehörde | **fehlt** | ✓ | ◆ (eigene Seite; E-ControlG, FMABG, TKG) | – | – | ✓ (BGBl. II oder anders) | Begutachtung der Behörde | nein (nicht in RIS „Begut") |
| Staatsvertrag mit Genehmigung (Art. 50) | `staatsvertrag` (mit Art. 15a zusammen) | ? | ? | ✓ (RVS) | **✓ ohne Stellungnahme** (Parlament: „Keine Begutachtung bei dem Doktyp "RVS" möglich") | ✓ (BGBl. III) | Begutachtung, wo durchgeführt | Entwurf ja, Kundmachung nein |
| Staatsvertrag ohne Genehmigung | in `staatsvertrag` | ? | ? | – | – | ✓ (BGBl. III) | — | nein |
| Vereinbarung nach Art. 15a | in `staatsvertrag` | ? | ? | ? (Genehmigung, wenn sie die Bundesgesetzgebung bindet) | ? | ✓ (BGBl. I oder II) | Begutachtung, wo durchgeführt | Entwurf ja, Kundmachung nein |
| Notverordnung (Art. 18 Abs. 3) | **fehlt** | – | – | – | Nachbehandlung binnen vier Wochen | nicht belegt | — | nein |
| Wiederverlautbarung (Art. 49a) | **fehlt** | – | nicht belegt | – | – | ✓ (BGBl. I) | — | nicht geprüft |
| Aufhebung durch den VfGH | **fehlt** | – | – | – | – | ✓ (BGBl. I, § 3 Z 3) | — | nicht geprüft |

### Länder

| Weg | Zeile heute | Entwurf | Begut. | RV | Landtag | Kundg. | Äußerung | Monitor |
|---|---|---|---|---|---|---|---|---|
| Regierungsvorlage nach Begutachtung | `landesgesetz` | ✓ | ◆ in K, N, St, V (Recht für jede Person); B, O nur bei „grundsätzlicher Bedeutung"; T Pflicht, Recht der Öffentlichkeit in der TLO nicht genannt; S, W keine Pflicht. Grafik: ◆ für alle | ✓ | ✓ | ✓ (Art. 97 B-VG) | Begutachtung | ja, je Land verschieden (`laender-luecken.md`) |
| Gesetz ohne zugeordneten Entwurf | `landesgesetz-ohne-entwurf` | – | ? | ? | ✓ | ✓ | — | ja |
| Antrag von Abgeordneten oder Ausschuss mit Ausschuss-Begutachtung | **fehlt** | – | – | – | ◆ in B, K, O, St | ✓ | Begutachtung im Landtag | nein |
| Volksbegehren (alle neun) | **fehlt** | – | – (K Art. 33 Abs. 2: Ausschuss kann) | in N und S als Vorlage der Landesregierung | ✓ | ? | Unterstützung | nein |
| Gemeindeinitiative (St) und Volksbegehren von Gemeinden (B, N, T, V) | **fehlt** | – | – | – | ✓ | ? | Gemeinderat | nein |
| Bürgerinitiative (O) | **fehlt** | – | ? (Art. 58 Abs. 2) | – | ✓ | ? | Unterstützung, Befragung | nein |
| Gesetz mit Volksabstimmung | **fehlt** | wie Herkunft | wie Herkunft | wie Herkunft | ✓ | ✓ bei Annahme | Verlangen (B, N, St, T, V), Stimmabgabe | nein |
| Verordnung der Landesregierung | `landesverordnung` | ✓ | ◆ Pflicht in N, St; kann in O; sonst nicht geregelt | – | – | ✓ | Begutachtung | ja, wo das Land sie veröffentlicht |
| Verordnung des Landeshauptmanns oder einer Bezirksverwaltungsbehörde | **fehlt** | ? | ? | – | – | ? | nicht belegt | nein (Tirol: BH-Verordnungen ausgeschlossen) |
| Notverordnung der Landesregierung (Art. 97 Abs. 3) | **fehlt** | – | – | – | Nachbehandlung | ? | — | nein |
| Vereinbarung zwischen Ländern (Art. 15a Abs. 2) | **fehlt** | ? | ? | – | je Land (N: Genehmigung) | nicht geprüft | — | nicht geprüft |

### EU

| Vorzeile | Zeile heute | Was das Recht sagt | Monitor |
|---|---|---|---|
| EU-Richtlinie | `EU_LEAD` | Umsetzung nötig (Art. 288 AEUV) | ja (`umsetzung`) |
| EU-Verordnung | **fehlt** | gilt unmittelbar; nationale Begleitregeln | ja (`flankierend-vo`) |
| EU-Beschluss | **fehlt** | verbindlich für Adressaten | als Akt erkannt (`EuActView.kind`), keine eigene Aussage |
| Stadien vor dem Kommissionsvorschlag | **fehlt** | „Ihre Meinung zählt", Bürgerinitiative | nein |

### Was das Recht der Grafik widerspricht

1. **`ausschussantrag`**: „kein eigener Gegenstand im Parlament" stimmt nicht.
   Das Parlament führt Ausschussanträge als Typ BUA (84 in GP XXVII, 18 in
   GP XXVIII). Was fehlt, ist der Verweis im RIS-Datensatz des Gesetzes
   (`skippedLaws.ts`, „no-item"). Die Zelle „Parlament" müsste nach § 23b
   Abs. 1 eine Stellungnahme zulassen; auf 14/BUA XXVIII liegt eine.
2. **`volksbegehren`**: „eine Forderung, kein Gesetzestext" stimmt nur für
   Volksbegehren in Form einer Anregung; Art. 41 Abs. 2 B-VG und § 3 Abs. 1
   VoBeG lassen die „Form eines Gesetzesantrages" zu.
3. **`staatsvertrag`**: Die Zellen „Regierungsvorlage" und „Parlament" stehen
   auf „je nach Fall"; das ist richtig, aber wo der Weg durch das Parlament
   geht, gibt es dort **keine** Stellungnahme (RVS). Die Zeile legt das nicht
   nahe, widerspricht ihm aber auch nicht.
4. **`verordnung`**: „erlässt das Ministerium selbst" trifft auf die Zeile
   zu (RIS „Begut" hält nur Ministerien), lässt aber Verordnungen der
   Bundesregierung (BGBlG § 4 Abs. 1 Z 2) und anderer Behörden aus. Die
   Begutachtung ist nicht Teil jedes Verordnungswegs (§ 9 Abs. 4 WFA-GV);
   die Zeile meint die Verordnungen, die eine hatten.
5. **`landesgesetz`**: „Stellungnahme möglich" in der Begutachtung ist in
   Salzburg und Wien durch kein Landesverfassungsrecht gedeckt, in
   Burgenland und Oberösterreich nur für Entwürfe „von grundsätzlicher
   Bedeutung". „A second window in the Landtag is not documented" (Kommentar
   in `wege.ts`): Für Anträge im Landtag ist es in vier Ländern
   dokumentiert (B, K, O, St), als Ausschussbeschluss, nicht für jede
   Vorlage.
6. **Kommentar zu den fehlenden Bundesratsanträgen** („a path the docs do
   not verify is not drawn"): Jetzt belegt durch Art. 41 Abs. 1 B-VG,
   § 21 Abs. 6 GO-BR und die Parlamentsdaten (GABR, GABR13; einer wurde
   Gesetz).

### Welche Äußerung die Grafik zeigt

Die blauen Marken stehen heute für: Begutachtung eines Bundes- oder
Landesentwurfs (Gesetz, Verordnung, Staatsvertrag), § 23b zu Vorlage und
Initiativantrag, § 23b zum Volksbegehren. **Nicht gezeigt**: § 23b zum
Ausschussantrag und zum Bundesratsantrag; Ausschussbegutachtung im
Nationalrat und im Landtag; Begutachtung der Regulierungsbehörden;
Unterstützung und Eintragung eines Volksbegehrens; Verlangen und Stimmabgabe
bei einer Volksabstimmung; Petition, Bürgerinitiative und deren
elektronische Unterstützung (außerhalb des Wegs einer Norm); alle
EU-Instrumente; die Länderinstrumente außer der Begutachtung.

## Was sich verfolgen ließe

Nur Fakten, je mit Quelle; keine Empfehlung. „Lizenz" verweist für
Parlament und RIS auf `CLAUDE.md` („Legal"): RIS CC BY 4.0; beim Parlament
Ergebnislisten und API der Stationen nach der Begutachtung CC BY, die
Begutachtungsdaten ohne Einräumung, alles zu Stellungnahmen von der
Weiterverwendung ausgenommen. Mengen aus Liste 101 vom 14.11.2026.

| Weg / Instrument | Maschinenlesbare Quelle | Lizenz | Stationen; fehlende Station | Teilnahme: Kanal; veröffentlicht, zählbar | Menge |
|---|---|---|---|---|---|
| Ministerialentwurf → RV → BGBl. I | Parlament Liste 81, 101, Detail-JSON; RIS `Begut`, `RegV`, `BgblAuth` | CLAUDE.md | alle fünf | Formular beim Parlament; Liste 142; zählbar | 51–105 ME/Jahr (`volksbegehren.md` §9) |
| Initiativantrag | Liste 101 `ITYP A`, `ART A` | CC BY (Station nach der Begutachtung) | Parlament, Kundgemacht | § 23b-Formular; Liste 142 | 895 (XXVII), 183 (XXVIII) |
| Ausschussantrag | Liste 101, Typ BUA; Detail-JSON | CC BY | Parlament, Kundgemacht | § 23b-Formular; Liste 142 | 84 / 18 |
| Gesetzesantrag des Bundesrates, eines Drittels | Liste 101, Typen GABR, GABR13 | CC BY | Parlament (Bundesrat als Ursprung); Station „Bundesrat" fehlt | § 23b; Liste 142 | GABR 2 / 0, GABR13 4 / 0; XXVI 2 GABR13, XXV 2 GABR |
| Volksbegehren | Liste 101 `VHG VOLKBG`; RSS `Filter/api/filter/rss/101?VHG=VOLKBG` (`volksbegehren.md` §5.1); BMI für Unterstützung und Eintragung (keine API, keine offene Lizenz, `volksbegehren.md` §5.5–5.6) | Parlament CC BY; BMI ohne Lizenzangabe | Parlament; fehlt: „Unterstützungsphase", „Eintragung" | Unterstützung online (ID Austria) oder Gemeinde; Zahlen beim BMI; § 23b in Liste 142 | 43 / 5 im Nationalrat; 109 Eintragungsverfahren seit 1964 (`volksbegehren.md` §3) |
| Petition, Bürgerinitiative | Liste 101 `ITYP PET`, `BI`; Liste 142 (Stellungnahmen), Liste 305 (Zustimmungen, für SNME belegt; für PET/BI nicht geprüft) | CC BY für Ergebnislisten; Stellungnahmen ausgenommen | außerhalb des Wegs | Webformular; Zahl der Unterstützungen öffentlich | PET 148 / 29, BI 74 / 36 |
| Staatsvertrag (RVS), BGBl. III | Liste 101 Typ RVS; RIS `BgblAuth` Teil 3 (`api-exploration.md` §2b: `Teil1` · `Teil2` · `Teil3`) | CC BY / CC BY 4.0 | RV, Parlament, Kundgemacht | keine im Parlament | RVS 105 / 26 |
| Einspruch und Beharrungsbeschluss | Liste 101 Typ EBR | CC BY | fehlt: „Einspruch des Bundesrates" | nicht belegt | EBR 8 (XXVII) |
| Volksabstimmung, Volksbefragung (Bund) | nicht geprüft (BMI) | nicht geprüft | fehlt: „Volksabstimmung" | Stimmabgabe | nicht erhoben |
| Verordnung (Ministerium) | RIS `Begut` (nur Ministerien), RIS `BgblAuth` Teil 2 | CC BY 4.0 | Entwurf, Begutachtung, Kundgemacht | an das Ministerium, nicht veröffentlicht beim Parlament; nicht zählbar | 163–259 Begutachtungen/Jahr 2019–2026 (RIS, alle Arten); davon rund zwei Drittel Verordnungen |
| Verordnung einer Regulierungsbehörde | eigene Seiten (FMA, E-Control, RTR); maschinenlesbar nicht geprüft | nicht geprüft | Entwurf, Begutachtung, Kundgemacht | an die Behörde; FMA veröffentlicht | nicht erhoben |
| Wiederverlautbarung, VfGH-Aufhebung | RIS `BgblAuth` Teil 1 | CC BY 4.0 | nur Kundgemacht | — | nicht erhoben |
| Ausschussbegutachtung (Nationalrat) | Detail-JSON, Verlauf (`readCommitteeConsultation`) | CC BY | Parlament | geladener Kreis | 8 Gesetze je GP XXVII und XXVIII (`decisions.md`, Messzahlen) |
| Landesgesetz, Landesverordnung | die Länderquellen in `server/utils/laender/*.ts`; RIS Landesrecht (`LrKons`, LGBl.) | je Land, im Impressum der Seite festgehalten; hier nicht geprüft | wie heute | je Land (`laender-luecken.md`) | `laender-luecken.md` |
| Anträge, Volksbegehren, Petitionen in den Landtagen | Der Monitor liest bereits Landtagssysteme in Oberösterreich (Beilagen), Tirol (lte.tirol.gv.at), Steiermark (pallast2), Kärnten; ob dort auch Anträge, Petitionen und Volksbegehren stehen: nicht geprüft. Übrige Länder nicht geprüft | nicht geprüft | Landtag; fehlt: „Volksabstimmung", „Unterstützungsphase" | je Land | nicht erhoben |
| Wiener Petitionen | Plattform der Stadt; maschinenlesbar nicht geprüft | nicht geprüft | außerhalb | online mit ID Austria (Gesetz § 1 Abs. 2) | nicht erhoben |
| EU „Ihre Meinung zählt" | JSON-Endpunkt `ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives` (undokumentiert; am 14.11.2026 mit HTTP 200 beantwortet, Felder u. a. `foreseenActType`, `receivingFeedbackStatus`, `feedbackStartDate`) | nicht geprüft | fehlt: EU-Stadium vor „Entwurf" | Portal; Beiträge veröffentlicht | 4.164 Initiativen im Endpunkt |
| EU-Rechtsakt und Verfahren | Cellar SPARQL (vom Monitor genutzt, `server/utils/eu/cellar.ts`); Legislative Observatory des EP: nicht geprüft (Abruf leitet um) | im Repo festgehalten; hier nicht geprüft | fehlt: Kommissionsvorschlag, EP/Rat | — | nicht erhoben |
| Europäische Bürgerinitiative | `register.eci.ec.europa.eu/core/api/register/search/…` (JSON, HTTP 200) | nicht geprüft | vor dem Entwurf | Unterstützung online | 136 registriert, 15 erfolgreich, 13 laufend (Endpunkt, 14.11.2026) |
| Petition an das EP | nicht geprüft | nicht geprüft | außerhalb | nicht geprüft | nicht erhoben |

## Offen

- **Salzburg Art. 21 Abs. 2**: „Jeder von wenigstens 10.000 Stimmberechtigten
  gestellte und in einer Volksabstimmung angenommene Gesetzesantrag
  (Volksbegehren)". Ob davor eine Volksabstimmung über den Antrag stattfindet
  oder der Wortlaut anders zu lesen ist, regelt das Salzburger
  Volksabstimmungs- und Volksbegehrengesetz (RIS 10000485), nicht gelesen.
- **Vorarlberg Art. 33 Abs. 5 und 6** nach VfSlg 16.241/2001
  (`volksbegehren.md` §2): ob die heutige Fassung den Landtag nach einer
  Volksabstimmung bindet, nicht geprüft.
- **§ 23b und GABR13**: Der Wortlaut nennt „Gesetzesanträge des
  Bundesrates"; ob der Antrag eines Drittels darunter fällt, sagt nur die
  Praxis des Parlaments (Typ in Liste 101, `statementsstate` `0`). Nicht
  belegt.
- **`statementsstate` `0`**: Bedeutung undokumentiert; ob BUA, GABR13 und EBR
  heute Stellungnahmen annehmen, ist nur für BUA durch eine gezählte
  Stellungnahme belegt.
- **Ausschussanträge in einem Ausschussbericht**: Ob jeder § 27-Antrag als
  BUA erscheint oder manche nur im Bericht zu einem anderen Gegenstand (AUB),
  nicht geprüft.
- **Anwendungsfälle**: Volksabstimmung nach Art. 43 oder 44 Abs. 3,
  Volksbefragung nach Art. 49b, Notverordnungen nach Art. 18 Abs. 3 und
  Art. 97 Abs. 3: wie oft seit 1945, nicht belegt.
- **Rechtsgrundlage der elektronischen Unterstützung** von Petitionen und
  Bürgerinitiativen und der Zustimmung zu Stellungnahmen: nur die
  Parlamentsseite, keine Norm gefunden.
- **Antragsrecht der Abgeordneten** (Zahl) in Burgenland, Kärnten,
  Niederösterreich, Oberösterreich, Salzburg, Tirol: in den
  Geschäftsordnungen, nicht gelesen. Petitionen an Landtage in Kärnten und
  Niederösterreich: Geschäftsordnung nicht gelesen.
- **Begutachtung in Oberösterreich, Salzburg und Wien** außerhalb der
  Landesverfassung (Landtagsgeschäftsordnung, Erlässe): nicht gefunden, nicht
  ausgeschlossen.
- **Zweitquellen** für acht Länder; § 66c ÄrzteG; § 9 F-VG 1948; Art. 14b
  Abs. 4 und Art. 21 Abs. 4 B-VG; die Fristen der EU-Rückmeldungen zu
  angenommenen Vorschlägen und zu Entwürfen delegierter Rechtsakte; die
  Lizenzen der EU-Endpunkte und der Seiten der Regulierungsbehörden.
- **Nicht erreichbar**: EUR-Lex (leere Antwort ohne Browser; über den
  Cellar umgangen), die Parlamentsseite „Petitionen und Bürgerinitiativen"
  (404; Ersatz „Petitionen unterstützen"), die Kommissionsseite zu
  Konsultationen (HTTP 429), das Legislative Observatory (Umleitung, nicht
  verfolgt).

## Quellen

RIS, Fassung vom 14.11.2026, `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=<Abfrage>&Gesetzesnummer=<Nr>`:

- Bundesnormen: B-VG 10000138 (Art. 15a, 18, 41–50, 49a, 49b, 65, 66, 97–99, 101, 102, 23g; z. B. Art. 41 `https://www.ris.bka.gv.at/eli/bgbl/1930/1/A41/NOR40188242`); GOG-NR 10000576 (§§ 21, 23b, 24, 26, 27, 40, 69, 100–100d); GO-BR 10000976 (§§ 21, 26); BGBlG 20002988 (§§ 3–5); VoBeG 2018 20009719 (§§ 3–6); WFA-GV 20008150 (§§ 1, 9); AKG 1992 10008787 (§ 93); WKG 1998 10007962 (§ 10); E-ControlG 20007046 (§ 36); FMABG 20001456 (§ 22); TKG 2021 20011678 (§ 206).
- Landesrecht: Burgenland LrBgld 10000141 (L-VG), 10000142 (GO Landtag, § 34), 10000145 (Bürgerinnen- und Bürgerbegutachtung); Kärnten LrK 10000208; Niederösterreich LrNO 20000038; Oberösterreich LrOO 10000595; Salzburg LrSbg 10001123 (L-VG 1999), 10001124 (Landtags-GO, §§ 55, 66); Steiermark LrStmk 20000229 (L-VG 2010), 20000230 (GeoLT 2005, §§ 18, 24); Tirol LrT 10000103; Vorarlberg LrVbg 20000001; Wien LrW 20000308 (WStV), 20000324 (Petitionen in Wien).

Parlament:

- RLW-Fachinfo „Wie funktionieren Begutachtungsverfahren zu Gesetzentwürfen?", 03.02.2026 — parlament.gv.at/fachinfos/rlw/Wie-funktionieren-Begutachtungsverfahren-zu-Gesetzentwuerfen
- „Stellung nehmen zu Gesetzesinitiativen" — parlament.gv.at/beteiligen/stellung-nehmen/gesetzesinitiativen
- „Petitionen unterstützen" — parlament.gv.at/beteiligen/unterstuetzen/petitionen
- Filter-API Liste 101 (`ITYP` I, A, PET, BI; GP XXV–XXVIII), Liste 142 (Zählung je Gegenstand), Detail-JSON `/gegenstand/<GP>/I/<INR>?json=True` für XXVII/I/751, 2238, 21, 155, 616, 1615, 1940, 2705; XXV/I/452, 869; XXVI/I/496; XXVIII/I/14, 232, 287 — abgefragt 14.11.2026.

EU (Cellar, `http://publications.europa.eu/resource/celex/<CELEX>`, deutsch):

- AEUV Art. 288 (12016E288), Art. 227 (12016E227); EUV Art. 11 (12016M011); VO (EU) 2019/788 (32019R0788), Art. 3, 14, 15; Mitteilung COM(2021) 219 „Bessere Rechtsetzung" (52021DC0219).
- Endpunkte „Ihre Meinung zählt" und Register der Bürgerinitiative wie in der Tabelle, abgefragt 14.11.2026.

Land Vorarlberg: „Bürgerräte in Vorarlberg" — vorarlberg.at/-/buergerraete-in-vorarlberg (über die Suche gelesen, Richtlinie nicht im Volltext).

## Einschätzung: was davon in den Monitor gehört

Stand 14.11.2026. Dieser Abschnitt ist als einziger keine Erhebung, sondern
eine Einschätzung auf ihrer Grundlage; er ist der Ausgangspunkt für die
Sitzungen, die daraus bauen. Die Mengen der XXVIII. GP (Anträge 183,
Ausschussanträge 18, Staatsvertrags-Vorlagen 26, Petitionen 29,
Bürgerinitiativen 36, Volksbegehren 5) sind am selben Tag ein zweites Mal aus
der Liste 101 des Parlaments gezählt und stimmen.

### Maßstab

Die Grafik `/wege` zeigt jeden Weg, den es gibt. Verfolgt wird ein Weg erst,
wenn drei Dinge zutreffen: Es gibt eine amtliche, maschinenlesbare Quelle,
deren Weiterverwendung geklärt und im Impressum genannt ist; es gibt genug
Fälle; und der Betrieb wächst nicht um etwas, das laufend gepflegt werden
muss.

### Drei Gruppen

**Passt in die fünf Stationen, gleiche Quelle, gleiche Lizenz** (Liste 101
des Parlaments, Stationen nach der Begutachtung):

- Ausschussanträge (Typ BUA). Sie tragen dieselbe Nummernreihe wie
  Regierungsvorlagen (d.B.), § 23b GOG-NR lässt Stellungnahmen zu. Heute
  sagt der Monitor, er könne sie nicht sehen.
- Gesetzesanträge des Bundesrates. Kaum Fälle, kaum Arbeit; danach ist der
  Bund vollständig.
- Alle Initiativanträge auf ein Gesetz, nicht nur die ohne Entwurf, die
  Gesetz wurden. Jeder steht während des Verfahrens für Stellungnahmen
  offen. Offen ist, wie die Liste damit umgeht, dass die meisten nie
  beschlossen werden.
- Einspruch des Bundesrates und Beharrungsbeschluss: ein Ereignis in der
  Station Parlament, gezeigt wie die Abstimmung, keine eigene Station.
- Staatsverträge bis zur Kundmachung im BGBl. III: Quelle und Lizenz sind
  da, eine Stellungnahme im Parlament gibt es nicht. Nur Nachverfolgung.

Reihenfolge: die ersten beiden zuerst.

**Ein anderer Gegenstand, mit eigener Leiste auf eigener Seite:**

- Petitionen und Bürgerinitiativen: gleiche Quelle, aber kein Gesetz muss
  folgen, und sie haben keine Stationen. Nicht in die Liste der Entwürfe
  mischen.
- Volksbegehren: Die Einschätzung aus `volksbegehren.md` bleibt. In der
  Grafik zeigen, zum Ort der Unterstützung verlinken, nicht verfolgen.
- Verordnungen der Regulierungsbehörden: echte Beteiligung, aber je Behörde
  eine neue Quelle mit ungeprüften Bedingungen, im Aufwand wie ein Land.
- Verordnungen ohne Begutachtung: das Gegenstück zu den Gesetzen ohne
  Entwurf. Zurückgestellt, solange der Abgleich nur rund 85 % der
  Kundmachungen findet: „kein Entwurf" ließe sich nicht belegen.

**EU, ein eigenes Vorhaben:**

- Ein EU-Rechtsakt bekommt auf seiner Seite unter `/eu-recht` eine eigene
  Leiste (Konsultation, Vorschlag, Parlament und Rat, Amtsblatt,
  Umsetzungsfrist); ein Entwurf verweist dorthin wie heute.
- Erster Schritt ist keine Zeile Code, sondern die Prüfung der
  Nutzungsbedingungen der beiden Endpunkte („Ihre Meinung zählt", Register
  der Europäischen Bürgerinitiative) und eine Notiz dazu. Der Endpunkt der
  Konsultationen ist undokumentiert.

**Länder:** Ob die Landtagssysteme, die der Monitor schon liest, auch
Anträge, Petitionen und Volksbegehren führen, ist nicht geprüft. Land für
Land, wie alles dort.

### Stationen

Die fünf Stationen bleiben, wie sie sind: Sie sind die Leiste einer
innerstaatlichen Norm. Ein Antrag tritt an der dritten Station ein, die dann
seinen Namen trägt (wie heute „Initiativantrag" statt „Regierungsvorlage").
Einspruch und Volksabstimmung sind Ereignisse in einer Station. Die fünf
Kandidaten für neue Stationen aus „Was sich verfolgen ließe" werden keine
sechste Station: Was nicht hineinpasst, ist ein anderer Gegenstand und
bekommt seine eigene Leiste.

### Was die Beteiligung für das Produkt heißt

- Das Fenster des § 23b ist weiter, als der Monitor zeigt: Anträge von
  Abgeordneten, Ausschüssen und des Bundesrates, Volksbegehren, Petitionen
  und Bürgerinitiativen; nicht Staatsverträge.
- Fast nichts verpflichtet zu einer Antwort. Eine Stellungnahme begründet
  keine Pflicht; nur Petitionen (Ausschussbericht), Volksbegehren (Fristen)
  und die Europäische Bürgerinitiative (begründete Antwort) haben eine.
  Verbindlich ist allein die Volksabstimmung.
- Die Länder unterscheiden sich im Recht, nicht nur in der Praxis; das steht
  auf `/datenlage`.
