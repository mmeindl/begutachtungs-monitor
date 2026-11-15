# Anliegen fixtures

Recordings of Parliament's detail JSON, nothing invented, fetched 2026-11-14
(`pnpm corpus:anliegen`, cached under `.cache/anliegen/`). Source pattern:
`https://www.parlament.gv.at/gegenstand/{GP}/{ITYP}/{nr}?json=True`.

Every file is cut to the `content` keys the reader uses (`ityp`, `doktyp`,
`title`, `zitation`, `einlangen`, `statementsstate`, `approvalstate`,
`status` without its documents, `phase` with each stage reduced to `date` and
`text`, `documents`, `names`, `reference` without `subject`). The speakers'
tables and protocol anchors beside the stages are left out. Anonymised: in
`names[]` only `funktext` and `frak_code` are kept and every `name` reads
„(gekürzt)", members included; the addressee of every „Antrag auf Einholung
einer Stellungnahme von …" reads „(gekürzt)" (keeping „ - angenommen"); the
deputies named in an „Antrag der Abgeordneten …" read „(gekürzt)".

The Petitionen an den Bundesrat (`BR-PET-BR-*.json`, fetched 2026-11-15 by the
same script through each row's own `HIS_URL`, source pattern
`https://www.parlament.gv.at/gegenstand/BR/PET-BR/{nr}?json=True`) are cut the
same way, with distinct placeholders so a test can hold them against every
answer: every `name` in `names[]` reads „Mitglied Platzhalter", a
Berichterstatter in the stages „Berichterstatter Platzhalter", the movers of an
Entschließungsantrag „Antragsteller Platzhalter"; their `/person/` links read
`/person/0`.

Licence: Petitionen and Bürgerinitiativen — Geschichtsseiten of Petitionen /
Bürgerinitiativen: CC BY 4.0 per Parliament's dataset pages; no Stellungnahmen
data in them. Volksbegehren — no dedicated dataset; item data of a Beilage.
Petitionen an den Bundesrat — Parliament's dataset „Petitionen" covers the
petitions to both chambers (checked 15.11.2026): CC BY 4.0.

- `XXVIII-BI-5.json` — 5/BI XXVIII: carried over from 53/BI XXVII, Kenntnisnahme im Ausschuss, Sammelbericht 159 d.B. taken note of in plenary. CC BY 4.0 (Bürgerinitiativen). Cut as above.
- `XXVIII-BI-1.json` — 1/BI XXVIII: forwarded to the Bildungsausschuss, adjourned there on 25.06.2025. CC BY 4.0 (Bürgerinitiativen). Cut as above.
- `XXVIII-PET-13.json` — 13/PET XXVIII: open (`statementsstate` and `approvalstate` „1"), in deliberation, adjourned and resumed; two „Petition überreicht von". CC BY 4.0 (Petitionen). Cut as above.
- `XXV-BI-1.json` — 1/BI XXV: „Ersuchen an die Präsidentin um Zuweisung an den Ausschuss für Arbeit und Soziales", no entry of that committee. CC BY 4.0 (Bürgerinitiativen). Cut as above.
- `XXV-BI-12.json` — 12/BI XXV: Kenntnisnahme im Ausschuss with the vote „mehrstimmig ( dafür: S,V dagegen: F,G,N nicht anwesend: T )". CC BY 4.0 (Bürgerinitiativen). Cut as above.
- `XXVIII-I-98.json` — 98 d.B. XXVIII, a Volksbegehren: erste Lesung, Verfassungsausschuss with both dated duties, Bericht 200 d.B., Kenntnisnahme. No dedicated dataset; item data of a Beilage. Cut as above; the movers of the erste Lesung read „(gekürzt)".
- `XXVIII-I-2.json` — 2 d.B. XXVIII, a Volksbegehren: carried over from 2547 d.B. XXVII, adjourned and resumed in the Umweltausschuss, Kenntnisnahme with the adopted Entschließung 6/AEA. No dedicated dataset; item data of a Beilage. Cut as above.
- `BR-PET-BR-56.json` — 56/PET-BR/2024: Ausschuss für BürgerInnenrechte und Petitionen, adjourned, „Übermittlung der Petition an das Bundesministerium für Klimaschutz, Umwelt, Energie, Mobilität, Innovation und Technologie"; one document; one „Petition überreicht von" (F). CC BY 4.0 (Petitionen). Cut as above.
- `BR-PET-BR-28.json` — 28/PET-BR/2011: committee report 8463/BR d.B., „Kenntnisnahme des Berichts angenommen / mehrstimmig", an adopted Entschließung 235/E-BR/2011 in the debate, „Keine Veröffentlichung der Dokumente"; a Berichterstatter and two movers as placeholders. CC BY 4.0 (Petitionen). Cut as above.
- `BR-PET-BR-22.json` — 22/PET-BR/2008: assigned to the Verkehrsausschuss of the Bundesrat, adjourned, „Neu zugewiesen an den Ausschuss für BürgerInnenrechte und Petitionen", transmitted to three Bundesministerien at once, „Keine Veröffentlichung der Dokumente". CC BY 4.0 (Petitionen). Cut as above.
