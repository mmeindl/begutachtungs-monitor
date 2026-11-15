# „Im Plenum geändert" ohne Plenarfassung: wie viele Seiten, und stimmt es?

**Stand 14.11.2026.** Seit diesem Tag zählt ein im Plenum angenommener
Abänderungsantrag als Änderung (`amendedStations` in `app/utils/spine.ts`),
auch wo der Datensatz des Parlaments keinen geänderten Text führt. Gefragt
war: Wie viele Seiten ändern damit ihre Aussage, und ist die neue Aussage
wahr?

## Messung

Alle Bundesgesetze der GP XXVI, XXVII und XXVIII aus dem BGBl. Teil I (RIS,
`BgblAuth`), je Gesetz die Regierungsvorlagen und Initiativanträge, die RIS
nennt: 1.212 Datensätze des Parlaments, alle gelesen (466 am 14.11.2026
frisch, die der GP XXVIII ausnahmslos frisch). Ausgewertet mit den
Funktionen der Seite, `amendedStationsOf` und `findPlenaryAmendments`.
119 Gesetze nennt RIS ohne Vorlage und ohne Antrag (Ausschussanträge u. a.);
sie sind nicht gemessen. Welcher Ministerialentwurf zu welcher Vorlage
gehört, kommt aus den Datensätzen aller 671 Ministerialentwürfe der drei
Perioden (`findRvLinks`): Die Messung deckt die Entwurfsseiten.

| | GP XXVI | GP XXVII | GP XXVIII |
|---|---|---|---|
| Vorlagen und Anträge, die Gesetz wurden | 188 | 836 | 188 |
| davon mit angenommenem Abänderungsantrag im Plenum | 55 | 238 | 54 |
| davon mit „Geändert im Plenum" in der Textliste | 55 | 158 | 54 |
| **Aussage geändert** (Antrag angenommen, kein solcher Text) | 0 | **80** | 0 |

Die 80 der GP XXVII: 55 Seiten von Initiativanträgen, 4 von
Regierungsvorlagen ohne Entwurf, 21 Regierungsvorlagen mit Entwurf, die auf
22 Seiten von Ministerialentwürfen stehen, drei davon Entwürfe der GP XXVI
(129, 148 und 162/ME), deren Vorlage erst in der GP XXVII kam. Kundgemacht
zwischen 27.12.2019 und 08.04.2022.

## Ist die neue Aussage wahr?

**Zwei Zeugen, wo es beide gibt, sind sich immer einig.** In allen
Datensätzen, die eine Textliste führen, steht „Geändert im Plenum" genau
dort, wo ein Abänderungsantrag im Plenum angenommen wurde: 267 von 267, und
kein einziger Plenartext ohne angenommenen Antrag.

**Zwölf der 80 gegen das Parlament gelesen** (sechs mit Entwurf, vier
Anträge, zwei Vorlagen ohne Entwurf): 461, 481, 411, 110, 52, 951, 71 und
55 d.B., 46/A, 480/A, 397/A, 1662/A. Bei jedem nennt der Verlauf den
Abänderungsantrag als „angenommen" vor der zweiten und dritten Lesung, und
der Datensatz des Abänderungsantrags (AA-115, AA-90, AA-88, AA-45, AA-19,
AA-165, AA-44, AA-46, AA-5, AA-48, AA-17, AA-148) nennt als Bezug genau
diese Vorlage oder diesen Antrag. Zwölf von zwölf: „im Plenum geändert"
stimmt.

## Was die Messung daneben zeigt

Die 80 haben eine gemeinsame Ursache, und sie reicht weiter. 306 Datensätze
der GP XXVII (kundgemacht 2019 bis Anfang 2022) führen **gar keine
Textliste**: Der Schlüssel `statements` fehlt, die Dokumente der Vorlage
stehen unter `documents`. In der GP XXVI und XXVIII führen ihn alle.
`amendedStationsOf` liest das Fehlen als leere Liste, und die leere Liste
gilt als Antwort „kein geänderter Text".

- **80** davon haben einen angenommenen Abänderungsantrag: seit 14.11.2026
  „im Plenum geändert". Wo auch der Ausschuss änderte, steht das nicht dabei.
- **226** haben keinen (118 Initiativanträge, 22 Vorlagen ohne Entwurf,
  86 Vorlagen auf 86 Seiten von Ministerialentwürfen): Ihre Seiten sagen
  „Text unverändert beschlossen".
  Belegt ist das nicht. Unter den Datensätzen der GP XXVII mit Textliste hat
  der Ausschuss den Text bei 193 von 530 geändert (36 %).

Gelesen wurden zwölf der 226, dazu drei Ausschussberichte im Volltext:

| Seite | Die Seite sagt | Der Ausschussbericht sagt |
|---|---|---|
| `/entwuerfe/XXVII/77` (770 d.B., Bericht 786 d.B.) | Text unverändert beschlossen | „unter Berücksichtigung des oben erwähnten Abänderungsantrages … beschlossen"; Antrag auf Zustimmung zum „angeschlossenen Gesetzentwurf" |
| `/entwuerfe/XXVI/170` (19 d.B., Bericht 92 d.B.) | Text unverändert beschlossen | dasselbe; der Antrag korrigiert ein Redaktionsversehen |
| `/entwuerfe/XXVI/161` (1 d.B., Bericht 14 d.B.) | Text unverändert beschlossen | dasselbe |

Drei von drei gelesenen Berichten: Der Ausschuss hat den Text geändert, die
Seite sagt „unverändert". Das galt schon vor dem 14.11.2026.

**Ein Zeuge für den Ausschuss, noch nicht geeicht.** Ändert der Ausschuss,
hängt am Bericht ein Dokument „Gesetzestext". Für Regierungsvorlagen traf
das in der Stichprobe mit Textliste sechs von sechs Mal zu (zwei geändert,
vier unverändert). Für Initiativanträge nicht: Vier geänderte tragen ihn,
aber auch zwei von zwei, die das Parlament als unverändert führt. Der
Satz des Berichts („dem angeschlossenen Gesetzentwurf" gegen „dem von der
Bundesregierung vorgelegten Gesetzentwurf") wäre der genauere Zeuge; gezählt
ist er nicht.

## Was daraus wurde (14.11.2026)

Fehlt die Textliste, gilt sie als unbekannt (`amendedIn: null`), nicht als
leer. Die Seite eines Ministerialentwurfs liest dann die Kopie der Liste im
eigenen Datensatz des Entwurfs, und die führt den Ausschusstext oft doch:
`/entwuerfe/XXVII/77`, `/entwuerfe/XXVI/170` und `/entwuerfe/XXVI/161`
sagen seither „im Ausschuss geändert", wie ihre Ausschussberichte;
`/entwuerfe/XXVII/43` sagt „im Ausschuss und im Plenum geändert". Wo auch
diese Kopie nichts nennt, und auf den Seiten von Anträgen und Vorlagen ohne
Entwurf, steht „beschlossen" und „Der Nationalrat hat den Text beschlossen."
(`/entwuerfe/XXVII/antrag/1106`). Mit Liste und ohne Änderung bleibt „Text
unverändert beschlossen" (`/entwuerfe/XXVIII/47`, `/entwuerfe/XXVII/139`).

## Offen

- Wie viele der 86 Entwurfsseiten ihre Antwort aus der Kopie bekommen, ist
  nicht gezählt; gelesen sind vier.
- Ob der Zeuge am Ausschussbericht reicht, um auf den Seiten von Anträgen
  und Vorlagen ohne Entwurf „im Ausschuss geändert" zu sagen: über alle
  Datensätze mit Textliste eichen, nach Vorlagen und Anträgen getrennt. Der
  Beschluss des Nationalrates (BNR) führt den beschlossenen Text als HTML
  und wäre der zweite Weg.
