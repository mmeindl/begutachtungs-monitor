# Datenlage: die Zustände der Länder, gegen die Quellen geprüft

**Stand 14.11.2026.** Eine Frage: Stimmen die Zustände, die
`shared/utils/datenlage.ts` je Land und Schritt führt, mit dem überein, was
das Land veröffentlicht und was der Monitor liest? Etwa fünfzehn waren aus
`laender-luecken.md` erschlossen, nicht gemessen.

Geprüft auf zwei Wegen. **Gemessen** heißt: aus den Listen des Monitors
gezählt (`/api/laender` für GP XXVI, XXVII, XXVIII und die laufenden, über
alle neun Länder 1.560 Zeilen). **Gelesen** heißt: die Seite des Landes
selbst abgerufen, je ein Abruf, am 14.11.2026. Steiermarks Landtagssystem
war an dem Tag für die Periodenlisten nicht abrufbar und wurde nicht eigens
abgefragt; was dazu hier steht, stammt von der Seite des Landes.

Die Unterscheidung, um die es geht: „das Land veröffentlicht es nicht" ist
die Lücke des Landes, „der Monitor liest es nicht" ist unsere.

## Was nicht stimmt

| Land · Schritt | Zustand heute | Beleg | Zustand, der belegt ist |
|---|---|---|---|
| Vorarlberg · Abgeschlossene Begutachtungen | nicht veröffentlicht („Entwurf verschwindet mit Fristende") | Gelesen: Das Land führt je Gesetzesvorhaben eine eigene Seite, verzeichnet unter „Laufende und kürzlich abgeschlossene Gesetzesvorhaben" (`vorarlberg.at/laufende-gesetzesvorhaben`): 10 laufende, 21 abgeschlossene. Ein Entwurf mit Fristende 20.11.2023 steht dort samt Dokumenten. Wie lange „kürzlich" reicht, sagt das Land nicht. | liest der Monitor noch nicht |
| Vorarlberg · Weg nach der Begutachtung | nicht veröffentlicht | Gelesen, dieselbe Seite: „Regierungsvorlage 50/2025 – Teil A, Teil B", „Gesetzesbeschluss 50/2025". | liest der Monitor noch nicht |
| Vorarlberg · Kundmachung | nicht veröffentlicht | Gelesen, dieselbe Seite: „Landesgesetzblatt Nr. 37/2025 vom 15. Juli 2025". | liest der Monitor noch nicht |
| Vorarlberg · Texte im Vergleich | nicht veröffentlicht | Folgt aus dem Weg: Vorlage und Beschluss liegen als Dokumente dort. | liest der Monitor noch nicht |
| Vorarlberg · Stellungnahmen | nicht veröffentlicht | Gelesen: Auf der Seite des Vorhabens stehen „Externe Stellungnahmen" als Dateien (Vergabenachprüfungsgesetz, Fristende 10.11.2026: vier). Das Land schreibt, Stellungnahmen würden auf seiner Homepage veröffentlicht, die von natürlichen Personen nur mit Einwilligung. Richtig bleibt: auf der Seite der laufenden Begutachtungen stehen keine. | liest der Monitor noch nicht |
| Vorarlberg · Verordnungsentwürfe | nicht veröffentlicht | Gelesen: Die Begutachtungsseite führt nur Gesetzesentwürfe, das Gesetzgebungsportal nennt keine Stelle für Verordnungsentwürfe. Dass es keine gibt, ist damit nicht belegt. | nicht erhoben |
| Steiermark · Abgeschlossene Begutachtungen | veröffentlicht („seit Juni 2015") | Gelesen: Die „Plattform Landesrecht" des Landes nennt für Gesetzesentwürfe ein Archiv von November 2000 bis 16.12.2019 und die laufende Periode. Die Grenze Juni 2015 ist die des Monitors. | liest der Monitor teilweise |
| Burgenland · „Was ändert der Entwurf?" | nicht veröffentlicht („keine beigelegt") | Gemessen: Sechs Gesetzesentwürfe tragen eine Textgegenüberstellung (Fristenden 21.06.2022 bis 30.09.2024; fünf als eigenes Dokument, einer im Sammeldokument), von 130 im Zeitraum der GP XXVII. Im Zeitraum der GP XXVI keiner von 71, der GP XXVIII keiner von 40. Der Monitor liest sie nicht. | teilweise veröffentlicht (selten beigelegt); dazu: liest der Monitor noch nicht |
| Tirol · Kundmachung | veröffentlicht | Gemessen: Für Gesetze nennt sie der Landtag. Für die 17 Verordnungsentwürfe nennt sie niemand; der Monitor sucht über den Titel und findet 3. Oberösterreich hat für denselben Befund „teilweise". | teilweise veröffentlicht (für Verordnungen nicht genannt) |
| Oberösterreich · Frist | veröffentlicht | Gemessen: Alle 7 Verordnungsentwürfe ohne Beginn. Burgenland, Niederösterreich und Vorarlberg haben für den fehlenden Beginn „teilweise". | teilweise veröffentlicht (Verordnungsentwürfe ohne Beginn) |
| Bund · Weg nach der Begutachtung | veröffentlicht | Zwei bekannte Lücken der Quelle: Ein Entwurf, der als Antrag weitergeht, trägt keinen Verweis; bei zusammengeführten Entwürfen verknüpft das Parlament nur einen mit der Vorlage. Der Zustand „veröffentlicht" hat laut Legende keine Lücke. | teilweise veröffentlicht |

Mit Vorarlberg fallen auch drei Sätze, die dasselbe behaupten:
`VBG_RETENTION` („zeigt einen Entwurf nur, solange seine Begutachtung
läuft"), die Zusammenfassung in `LAND_COVERAGE.vbg` und der Kommentar an
`LAND_FOLLOWED_STATIONS`. Richtig ist: Die Seite, die der Monitor liest,
verliert den Entwurf mit dem Fristende; das Land führt ihn an anderer Stelle
weiter.

## Was die Messung bestätigt

| Land · Schritt | Zustand | Beleg |
|---|---|---|
| Salzburg · Frist | teilweise („bei abgeschlossenen nur noch der Beginn") | Gemessen: Von 749 abgeschlossenen Entwürfen der drei Zeiträume trägt keiner ein Fristende, alle 16 laufenden tragen eines. Der Zellentext „ja" sagt das nicht; „ja, solange sie läuft" wäre genau. |
| Steiermark · Verordnungsentwürfe | liest der Monitor noch nicht | Gelesen: Das Land führt sie auf der „Plattform Landesrecht" ab 2008 (Archiv August 2004 bis 2007) mit Geschäftszahl, Fristende und Dokumenten; die Liste zeigte 43 Einträge. Der Grund kann die Stelle nennen. |
| Steiermark · Stellungnahmen | veröffentlicht | Gelesen: „Alle Stellungnahmen zu Entwürfen werden gemäß Art. 68 Abs. 4 L-VG veröffentlicht"; bei Verordnungen „nach Ablauf der Begutachtungsfrist vollständig und unverändert" (§ 2 Abs. 4 Volksrechtegesetz). |
| Oberösterreich · Kundmachung | teilweise | Gemessen: Titelsuche findet 0 von 6 Verordnungen (GP XXVIII), 1 von 1 (GP XXVII). |
| Oberösterreich, Tirol · Verordnungsentwürfe | teilweise | Gemessen: Oberösterreich 7 von 7 ohne Beginn; Tirol 17 von 17 ohne Frist. |
| Burgenland, Niederösterreich, Vorarlberg · Frist | teilweise (Beginn nicht genannt) | Gemessen: kein Entwurf dieser drei trägt einen Beginn (Burgenland 581, Niederösterreich 8, Vorarlberg 3). |
| Kärnten · Abgeschlossene, Frist | teilweise | Gemessen: Alle 73 abgeschlossenen Gesetzesentwürfe im Zeitraum der GP XXVII ohne Beginn und Frist, eingeordnet über die Regierungsvorlage; 30 stehen in keinem Zeitraum. |
| Tirol · Abgeschlossene (Liste) | teilweise | Gemessen: Der älteste Gesetzesentwurf der Liste begann am 18.09.2026. |
| Wien · Verordnungsentwürfe | veröffentlicht | Gemessen: ein Verordnungsentwurf auf der Seite. |
| Wien · Weg | nicht veröffentlicht („nennt die Vorlage nicht") | Gelesen: Die Seite verweist für „alle seit 1978 eingebrachten Gesetzesentwürfe" pauschal auf die Informationsdatenbank des Landtages, ohne Verknüpfung je Entwurf. Der Grund stimmt; die Vorlagen selbst sind dort veröffentlicht. |

## Nicht geprüft, mit demselben Risiko wie Vorarlberg

- **Niederösterreich**, nachgelesen am 14.11.2026 auf der Seite des Landes
  („Allgemeine Informationen – Bürgerbegutachtung"): Die Liste führt „alle
  derzeit aktuellen" Begutachtungen, ein Archiv hat sie nicht. Zum Weg sagt
  das Land: „Ein Gesetzesentwurf wird nach Abschluss des
  Begutachtungsverfahrens in den Landtag eingebracht", einzusehen unter den
  Landtagsvorlagen, ohne Verknüpfung je Entwurf. Zu den Stellungnahmen: Sie
  „werden auf der Website des NÖ Landtages veröffentlicht", die von
  Privatpersonen mit Namen nur nach Zustimmung. Daraus: **Weg** bleibt
  „nicht veröffentlicht", der Grund ist die fehlende Verknüpfung (wie Wien),
  nicht das Verschwinden; **Stellungnahmen** sind „liest der Monitor noch
  nicht". Abgeschlossene, Kundmachung und Texte bleiben; ob der Gegenstand
  im Landtag den Begutachtungsentwurf selbst führt, ist nicht geprüft.
- **Tirol · Abgeschlossene** („teilweise", Lücke des Landes): Die
  Landtagsevidenz führt jeden Gegenstand dauerhaft (`laender-luecken.md`
  § 6c); heute nicht neu gelesen. Dann wäre der Teil, der fehlt, der des
  Monitors.
- **Steiermark, Burgenland · Weg und Texte** („nicht erhoben"): bleibt so.
  Die Seite des Landes Steiermark sagt nur allgemein, was nach der
  Begutachtung geschieht.
- **Zahl der Stellungnahmen** (alle neun „nicht gezählt"): für fünf Länder
  im Memo gemessen. Auf den heute gelesenen Seiten der Steiermark und
  Vorarlbergs steht keine Zahl. Burgenland und Niederösterreich: nicht
  geprüft.

## Wirkung auf den Hinweis „Nicht vollständig in dieser Liste"

Keine der Korrekturen oben nimmt ein Land in den Hinweis einer
Startseitenliste auf oder aus ihm heraus (`landsIncompleteFor`, nachgerechnet
für alle drei Listen). Es ändert sich, wessen Lücke `/datenlage` nennt: für
Vorarlberg in fünf Zellen von der des Landes zu der des Monitors.
