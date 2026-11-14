# Landtage: Gesetzgebungsperioden der neun Länder seit 2004

**Stand 14.11.2026.** Forschungsnotiz zu einer Frage: Wann begann jede
Gesetzgebungsperiode der neun Landtage, von der am 01.01.2004 laufenden bis
zur heutigen, und wie schreibt das Land selbst ihren Namen? Die Liste filtert
beim Bund nach den Perioden des Nationalrats (`GP_STARTS` in
`shared/utils/gp.ts`: Beginn am Tag der konstituierenden Sitzung, Ende am Tag
vor der nächsten); dieselbe Rechnung braucht sie je Land.

**Methode.** Je Periode das Datum der konstituierenden Sitzung (nicht den
Wahltag) aus der Sitzungsliste oder dem Protokoll des Landtags gelesen, dazu
die Wikipedia-Liste der Abgeordneten dieser Periode. Wo das Land die alte
Sitzung nicht mehr online hat, ist die zweite amtliche Quelle das
Stenographische Protokoll des **Bundesrates**: Jeder neue Landtag wählt in
seiner ersten Sitzung die Bundesräte des Landes (Art. 35 B-VG), und der
Landtagspräsident teilt das dem Bundesrat schriftlich mit, mit dem Tag der
Sitzung. Diese Schreiben stehen wörtlich im Protokoll der folgenden
Bundesratssitzung (Abschnitt „Einlauf“). Die Seiten der Länder wurden einzeln
und langsam abgerufen; PDFs mit `pdftotext` gelesen, nicht über eine
Zusammenfassung.

**Beweismaß.** Ein Datum gilt als belegt, wenn zwei unabhängige Quellen
übereinstimmen und mindestens eine amtlich ist (Landtag oder Land, Protokoll,
Landesgesetzblatt, RIS, Parlament). Wikipedia ist nie die einzige Quelle.
„Indirekt“ heißt: Die amtliche Quelle nennt den Tag, aber nicht ausdrücklich
als konstituierende Sitzung (etwa der Amtsantritt der Landesregierung, die
der neue Landtag in derselben Sitzung wählt). Solche Zeilen stehen im
Abschnitt „Offen“, auch wenn sie in den Datenblock aufgenommen sind.

**Wahltag** ist nur Gegenprobe. Wo hinter dem Wahltag „(ungeprüft)“ steht,
wurde er für diese Notiz nicht abgerufen; er ist dann kein Beleg für
irgendetwas.

Abkürzungen in den Tabellen: **WP** = Wikipedia-Liste der Abgeordneten der
jeweiligen Periode (`https://de.wikipedia.org/wiki/Liste_der_Abgeordneten_zum_…`,
voller Link je Land unter der Tabelle); **BR nnn** = Stenographisches
Protokoll der nnn. Sitzung des Bundesrates.

## Auf einen Blick

| Land | Bezeichnung des Landes | Perioden | belegt | offen |
|---|---|---|---|---|
| Burgenland | „XXIII. Gesetzgebungsperiode“ | 6 (XVIII–XXIII) | 6 | – |
| Kärnten | „33. Gesetzgebungsperiode“ | 6 (28.–33.) | 6 | – |
| Niederösterreich | „XX. Gesetzgebungsperiode“ | 5 (XVI–XX) | 5 | – |
| Oberösterreich | „XXIX. Gesetzgebungsperiode“, auf den Protokollseiten auch „29.“ | 4 (XXVI–XXIX) | 4 | – |
| Salzburg | „17. Gesetzgebungsperiode“ | 6 (12.–17.) | 6 | – |
| Steiermark | „XIX. Gesetzgebungsperiode“ | 6 (XIV–XIX) | 6 | – |
| Tirol | „XVIII. Gesetzgebungsperiode“ | 5 (XIV–XVIII) | 4 | XVI indirekt |
| Vorarlberg | „XXXII. Vorarlberger Landtag“ | 6 (XXVII–XXXII) | 1 | XXVIII strittig, vier indirekt |
| Wien | „22. Wahlperiode“ | 6 (17.–22.) | 6 | – |

Die am 01.01.2004 laufende Periode ist je Land die erste Zeile. In
Niederösterreich (XVI ab 24.04.2003), Oberösterreich (XXVI ab 23.10.2003) und
Tirol (XIV ab 21.10.2003) hatte sie erst 2003 begonnen.

## Burgenland

Römische Ziffern, „Gesetzgebungsperiode“: das Protokoll der 1. Sitzung 2025
ist überschrieben „01. (konstituierenden) Sitzung der XXIII.
Gesetzgebungsperiode“. Die Wortprotokolle stehen auf
`bgld-landtag.at` je Periode; XVIII (2000–2005) ist dort nicht mehr online.

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| XVIII | XVIII. Gesetzgebungsperiode | 28.12.2000 | 03.12.2000 (Wikipedia-Spiegel) | BR 672 (15.02.2001): „Der Burgenländische Landtag hat in seiner 1. Sitzung der XVIII. Gesetzgebungsperiode am 28. Dezember 2000 … gewählt“ | WP | Vorzeitig beendet: Auflösung durch Landesgesetz LGBl. Nr. 51/2005 (Suchtreffer im RIS, Text nicht gelesen). Auch XVII endete vorzeitig (LGBl. Nr. 62/2000, ebenso nur Suchtreffer). |
| XIX | XIX. Gesetzgebungsperiode | 25.10.2005 | 09.10.2005 (ungeprüft) | Landtag, Protokollliste XIX. GP: „Wortprotokoll 01. Sitzung, vom 25. Oktober 2005“ | WP | – |
| XX | XX. Gesetzgebungsperiode | 24.06.2010 | 30.05.2010 (ungeprüft) | Landtag, Protokollliste XX. GP: „Wortprotokoll 01. Sitzung vom 24. Juni 2010“ | WP | – |
| XXI | XXI. Gesetzgebungsperiode | 09.07.2015 | 31.05.2015 (ungeprüft) | Landtag, Protokollliste XXI. GP: 01. Sitzung 9. Juli 2015 | WP | – |
| XXII | XXII. Gesetzgebungsperiode | 17.02.2020 | 26.01.2020 (WP) | Landtag, Protokollliste XXII. GP: „Wortprotokoll der 01. Landtagssitzung vom 17. Feber 2020“ | WP | Vorgezogene Wahl (Jänner statt Herbst 2020); Auflösungsbeschluss nicht nachgesehen. |
| XXIII | XXIII. Gesetzgebungsperiode | 06.02.2025 | 19.01.2025 (WP) | Protokoll „01. (konstituierenden) Sitzung der XXIII. Gesetzgebungsperiode, Donnerstag, 06. Februar 2025“ | WP | – |

Quellen:
- BR 672: https://www.parlament.gv.at/dokument/BR/BRSITZ/672/fname_113941.pdf
- XIX: https://www.bgld-landtag.at/der-landtag/archiv/xix-gp-protokolle/
- XX: https://www.bgld-landtag.at/der-landtag/archiv/xx-gp-protokolle/
- XXI: https://www.bgld-landtag.at/der-landtag/archiv/xxi-gp-protokolle/
- XXII: https://www.bgld-landtag.at/landtagssitzungen/xxii-gp-protokolle/
- XXIII: https://www.bgld-landtag.at/fileadmin-landtag/user_upload/Protokolle/XXIII.GP/1._Landtagssitzung.pdf
- WP: `Liste_der_Abgeordneten_zum_Burgenländischen_Landtag_(XVIII._Gesetzgebungsperiode)` bis `(XXIII._…)`. Die Seite zu XVIII nennt den Beginn („begann am 28. Dezember 2000“), die zu XIX ebenso („25. Oktober 2005“).

## Kärnten

Arabische Ziffern, „Gesetzgebungsperiode“ (Ordner „33. GP Stenografische
Protokolle“, Kopf der Protokolle „… Sitzung des Kärntner Landtages – 32.
Gesetzgebungsperiode“). Die Seite „Stenographische Protokolle“ des Landes führt
alle Perioden ab der 28. mit der jeweils 1. Sitzung; das ist die vollständigste
amtliche Liste aller neun Länder.

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| 28. | 28. Gesetzgebungsperiode | 08.04.1999 | 07.03.1999 (ungeprüft) | Land Kärnten, Stenographische Protokolle: „1. LTG-Sitzung am 8. April 1999“ | WP | – |
| 29. | 29. Gesetzgebungsperiode | 31.03.2004 | 07.03.2004 (BR 708 nennt die „Neuwahlen zum Kärntner Landtag am 7. März 2004“) | ebd.: „1. LTG-Sitzung am 31. März 2004“ | WP | – |
| 30. | 30. Gesetzgebungsperiode | 31.03.2009 | 01.03.2009 (ungeprüft) | ebd.: „1. LTG-Sitzung am 31. März 2009“ | WP | Nur vier Jahre (2009–2013); vorgezogene Wahl 2013, Auflösungsbeschluss nicht nachgesehen. |
| 31. | 31. Gesetzgebungsperiode | 28.03.2013 | 03.03.2013 (ungeprüft) | ebd.: „1. LTG-Sitzung am 28. März 2013 Konstituierung“ | WP | – |
| 32. | 32. Gesetzgebungsperiode | 12.04.2018 | 04.03.2018 (ungeprüft) | ebd.: „1. (konstituierende) LTG-Sitzung am 12. April 2018“ | WP | – |
| 33. | 33. Gesetzgebungsperiode | 13.04.2023 | 05.03.2023 (oesterreich.gv.at, Suchtreffer) | ebd.: „1. (konstituierende) LTG-Sitzung am 13. April 2023“ | WP | – |

Quellen:
- Land Kärnten: https://www.ktn.gv.at/Politik/Landtag/Stenographische-Protokolle (die PDF-Links dort tragen ablaufende Token und taugen nicht als Zitat)
- WP: `Liste_der_Abgeordneten_zum_Kärntner_Landtag_(28._Gesetzgebungsperiode)` bis `(33._…)`

## Niederösterreich

Römische Ziffern, „Gesetzgebungsperiode“ (`noe-landtag.gv.at/sitzungen/XX`,
„XX. GP“). Die Sitzungsseite des Landtags nennt zu jeder Periode den
Zeitraum; der Anfangstag ist der Tag der konstituierenden Sitzung.
**Abweichung vom Bundesmodell:** Das Land lässt eine Periode an dem Tag
enden, an dem die nächste beginnt („XIX. GP (22.03.2018 – 23.03.2023)“,
„XX. GP (seit 23.03.2023)“), nicht am Vortag. Für einen Filter zählt nur der
Beginn; das Ende ergibt sich wie beim Bund als Vortag der nächsten Periode.

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| XVI | XVI. Gesetzgebungsperiode | 24.04.2003 | 30.03.2003 (WP) | Landtag, Sitzungen: „XVI. GP (24.04.2003 – 10.04.2008)“ | WP | – |
| XVII | XVII. Gesetzgebungsperiode | 10.04.2008 | 09.03.2008 (WP) | ebd.: „XVII. GP (10.04.2008 – 24.04.2013)“ | WP | – |
| XVIII | XVIII. Gesetzgebungsperiode | 24.04.2013 | 03.03.2013 (WP) | ebd.: „XVIII. GP (24.04.2013 – 22.03.2018)“ | WP | WP-Liste schreibt „Legislaturperiode“. |
| XIX | XIX. Gesetzgebungsperiode | 22.03.2018 | 28.01.2018 (WP) | ebd.: „XIX. GP (22.03.2018 – 23.03.2023)“ | WP | – |
| XX | XX. Gesetzgebungsperiode | 23.03.2023 | 29.01.2023 (WP) | ebd.: „XX. GP (seit 23.03.2023)“ | WP | – |

Quellen:
- Landtag: https://noe-landtag.gv.at/sitzungen (je Periode `…/sitzungen/XVI` usw.)
- WP: `Liste_der_Abgeordneten_zum_Landtag_von_Niederösterreich_(XVI._Gesetzgebungsperiode)` bis `(XX._…)`. Die Seite zu XV nennt sich im Einleitungssatz irrtümlich „XIV.“; für diese Notiz ohne Belang, XV lag vor 2004.

## Oberösterreich

Der Landtag schreibt römisch („gp=XXIX“ im Beilagensystem, Dateinamen
„0270001_gp_XXVII_landtagssitzung_01_…“), die Protokollseiten des Landes
schreiben „29. Gesetzgebungsperiode“. Für die Anzeige empfiehlt sich die
römische Form wie beim Landtag. Alle vier Perioden begannen an einem
23. Oktober, 2021 an einem Samstag.

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| XXVI | XXVI. Gesetzgebungsperiode | 23.10.2003 | 28.09.2003 (ungeprüft) | Land OÖ, Wortprotokolle 26. GP: „1. Sitzung am 23. und 27. Oktober 2003“; BR 702: „Der Oberösterreichische Landtag hat am 23. Oktober 2003 …“ | WP | **Die 1. Sitzung lief über zwei Tage** (23. und 27.10.). Beginn ist der 23.10. |
| XXVII | XXVII. Gesetzgebungsperiode | 23.10.2009 | 27.09.2009 (ungeprüft) | Land OÖ, Wortprotokolle 27. GP: „Wortprotokoll der 1. Sitzung am 23. Oktober 2009“ | WP | – |
| XXVIII | XXVIII. Gesetzgebungsperiode | 23.10.2015 | 27.09.2015 (ungeprüft) | Land OÖ, Wortprotokolle 28. GP: 1. Sitzung 23. Oktober 2015 | WP | – |
| XXIX | XXIX. Gesetzgebungsperiode | 23.10.2021 | 26.09.2021 (WP) | Land OÖ, Wortprotokolle 29. GP: „Wortprotokoll der 1. Sitzung des Oö. Landtags am 23. Oktober 2021“; Landeskorrespondenz „Neuer Oö. Landtag und neue Oö. Landesregierung“ | WP | – |

Quellen:
- 26. GP: https://www.land-oberoesterreich.gv.at/33677.htm
- 27. GP: https://www.land-oberoesterreich.gv.at/92799.htm
- 28. GP: https://www.land-oberoesterreich.gv.at/169978.htm
- 29. GP: https://www.land-oberoesterreich.gv.at/270114.htm ; https://www.land-oberoesterreich.gv.at/268223.htm
- BR 702: https://www.parlament.gv.at/dokument/BR/BRSITZ/702/fname_012851.pdf
- WP: `Liste_der_Abgeordneten_zum_Oberösterreichischen_Landtag_(XXVI._Gesetzgebungsperiode)` bis `(XXIX._…)`

## Salzburg

Arabische Ziffern, „Gesetzgebungsperiode“ (Ablage
`salzburg.gv.at/00201lpi/17Gesetzgebungsperiode/…`). Die Protokolle der
jeweils ersten Sitzung liegen als PDF unter
`…/{N}Gesetzgebungsperiode/1Session/`; nur das der 13. Periode war unter den
erprobten Dateinamen nicht zu finden, das Verzeichnis selbst antwortet 403.

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| 12. | 12. Gesetzgebungsperiode | 27.04.1999 | 07.03.1999 (ungeprüft) | Protokoll „1. Sitzung, Dienstag, den 27. April 1999“ (Angelobung der Mitglieder) | WP | – |
| 13. | 13. Gesetzgebungsperiode | 28.04.2004 | 07.03.2004 (BR 708) | BR 708 (17.05.2004): „In der ersten Sitzung des Salzburger Landtages nach der am 7. März 2004 erfolgten Neuwahl wurden am 28. April 2004 …“ | WP | Protokoll des Landtags nicht gefunden (s. oben). |
| 14. | 14. Gesetzgebungsperiode | 22.04.2009 | 01.03.2009 (ungeprüft) | Protokoll „1. Sitzung, Mittwoch, 22. April 2009“ | WP | Nur vier Jahre (2009–2013); vorgezogene Wahl 2013. Ein RIS-Treffer LGBl. Nr. 15/2013 (28.02.2013) könnte die Auflösung sein, nicht gelesen. |
| 15. | 15. Gesetzgebungsperiode | 19.06.2013 | 05.05.2013 (Protokoll der 1. Sitzung nennt „die Wahl vom 5. Mai 2013“, Suchauszug) | Protokoll „1. Sitzung, Mittwoch, 19. Juni 2013“ | WP | – |
| 16. | 16. Gesetzgebungsperiode | 13.06.2018 | 22.04.2018 (WP) | Protokoll „1. Sitzung, Mittwoch, 13. Juni 2018“ (Dateiname „Konstituierung“) | WP | – |
| 17. | 17. Gesetzgebungsperiode | 14.06.2023 | 23.04.2023 (WP) | Protokoll „1. Sitzung – Konstituierende Sitzung des Salzburger Landtages, Mittwoch, 14. Juni 2023“ | WP | – |

Quellen:
- 12.: https://www.salzburg.gv.at/00201lpi/12Gesetzgebungsperiode/1Session/1s1s12gp.pdf
- 13.: https://www.parlament.gv.at/dokument/BR/BRSITZ/708/fname_021613.pdf
- 14.: https://www.salzburg.gv.at/00201lpi/14Gesetzgebungsperiode/1Session/1s1s14gp.pdf
- 15.: https://www.salzburg.gv.at/00201lpi/15Gesetzgebungsperiode/1Session/1s1s15gp.pdf
- 16.: https://www.salzburg.gv.at/00201lpi/16Gesetzgebungsperiode/1Session/1s1s16gp%20Konstituierung.pdf
- 17.: https://www.salzburg.gv.at/00201lpi/17Gesetzgebungsperiode/1Session/1S1S17GP.pdf
- WP: `Liste_der_Abgeordneten_zum_Salzburger_Landtag_(12._Gesetzgebungsperiode)` bis `(17._…)`

## Steiermark

Römische Ziffern, „Gesetzgebungsperiode“ („1. Sitzung des Landtages
Steiermark, XIX. Gesetzgebungsperiode, 18. Dezember 2024“). Der Landtag führt
für jede Periode ab XIV eine Seite „Stenographische Berichte“; die Startseite
nennt den Beginn der laufenden Periode auch selbst („Begutachtungen XIX.
Periode (ab 18. Dezember 2024)“). Diese Seiten liegen auf
`landtag.steiermark.at`, nicht auf dem PALLAST-System, und antworteten ohne
Sperre.

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| XIV | XIV. Gesetzgebungsperiode | 07.11.2000 | 15.10.2000 (ungeprüft) | Landtag, Berichte XIV.: „01. Landtagssitzung vom 07.11.2000 – Konstituierung“ | WP | Letzte Sitzung „81. Landtagssitzung vom 07.07.2005 – **Auflösung**“: vorzeitig beendet. WP nennt als Ende den 25.10.2005, also den Beginn von XV. |
| XV | XV. Gesetzgebungsperiode | 25.10.2005 | 02.10.2005 (ungeprüft) | Landtag, Berichte XV.: „1. Landtagssitzung vom 25.10.2005“ | WP | WP nennt die 64. Sitzung (02.06.2010) als letzte, der Landtag führt eine 65. (6./7.07.2010). Für den Beginn ohne Belang. |
| XVI | XVI. Gesetzgebungsperiode | 21.10.2010 | 26.09.2010 (WP-Artikel zum Landtag) | Landtag, Berichte XVI.: „1. Sitzung des Landtages Steiermark vom 21. Oktober 2010“ | WP | – |
| XVII | XVII. Gesetzgebungsperiode | 16.06.2015 | 31.05.2015 (Protokoll und WP) | Stenografischer Bericht „1. Sitzung des Landtages Steiermark, XVII. Gesetzgebungsperiode, 16. Juni 2015“ | WP-Artikel „Landtag Steiermark“ (die Liste der Periode nennt kein Datum) | Vorzeitig beendet: Selbstauflösung am 05.09.2019 (WP; amtlich nicht nachgesehen). |
| XVIII | XVIII. Gesetzgebungsperiode | 17.12.2019 | 24.11.2019 (WP) | Landtag, Berichte XVIII.: „1. Sitzung des Landtages Steiermark vom 17. Dezember 2019“ | WP | – |
| XIX | XIX. Gesetzgebungsperiode | 18.12.2024 | 24.11.2024 (WP) | Stenografischer Bericht „1. Sitzung …, XIX. Gesetzgebungsperiode, 18. Dezember 2024“; Startseite „ab 18. Dezember 2024“ | WP | – |

Quellen:
- XIV: https://www.landtag.steiermark.at/cms/ziel/181952103/DE/
- XV: https://www.landtag.steiermark.at/cms/ziel/181952086/DE/
- XVI: https://www.landtag.steiermark.at/cms/ziel/181952069/DE/
- XVII: https://www.landtag.steiermark.at/cms/ziel/181952052/DE/ ; https://landtag.steiermark.at/cms/dokumente/12468665_181952052/59f7caea/1_Stenografisches_Protokoll.pdf
- XVIII: https://www.landtag.steiermark.at/cms/ziel/155295847/DE/
- XIX: https://www.landtag.steiermark.at/cms/ziel/181952035/DE/ ; https://www.landtag.steiermark.at/cms/dokumente/12978777_181952035/eac032f2/1_Stenografisches_Protokoll.pdf
- WP: `Liste_der_Abgeordneten_zum_Landtag_Steiermark_(XIV._Gesetzgebungsperiode)` bis `(XIX._…)`; für XVII `https://de.wikipedia.org/wiki/Landtag_Steiermark`

## Tirol

Römische Ziffern, „Gesetzgebungsperiode“ („1. (Konstituierende) Sitzung der
XVIII. Gesetzgebungsperiode“). Der Landtag führt online nur die Sitzungen der
XVII. und XVIII. Periode; für die älteren sind die Schreiben des
Landtagspräsidenten an den Bundesrat die amtliche Quelle.

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| XIV | XIV. Gesetzgebungsperiode | 21.10.2003 | 28.09.2003 (ungeprüft) | BR 702 (06.11.2003): „Betreff: Konstituierende Sitzung des Tiroler Landtages am 21. Oktober 2003“ | WP | Vorzeitig beendet: Auflösungsbeschluss 20.03.2008 (Tätigkeitsbericht 2008 des Landesrechnungshofs, Suchauszug). Die WP-Liste zu XIII nennt als Ende „Angelobung des Landtags der XV. Gesetzgebungsperiode am 21. Oktober 2003“, gemeint ist XIV. |
| XV | XV. Gesetzgebungsperiode | 01.07.2008 | 08.06.2008 (Wikipedia-Spiegel) | BR 758 (22.07.2008): „Konstituierende Sitzung des Tiroler Landtages am 1. Juli 2008“ | WP | – |
| XVI | XVI. Gesetzgebungsperiode | 24.05.2013 | 28.04.2013 (Wikipedia, Suchauszug) | **indirekt:** Videoarchiv des Landtags 2013, „24.05.2013 – Vormittag“, die erste Sitzung nach der Wahl (davor 14.03.2013, danach 26.06.2013); die Seite benennt die Sitzung nicht | WP | BR 821 (06.06.2013) verzeichnet das Schreiben des Tiroler Landtags, sein Wortlaut ist im Protokoll aber nur als Bild beigelegt und nicht lesbar. |
| XVII | XVII. Gesetzgebungsperiode | 28.03.2018 | 25.02.2018 (ungeprüft) | Landtag, „Überblick Landtagssitzungen“: erste Sitzung 28. März 2018; Ankündigung „Konstituierende Sitzung der XVII. Gesetzgebungsperiode“, „Mittwoch, 28.03.2018, 10:30 Uhr“ | WP | Vorzeitig beendet: Selbstauflösung 24.06.2022 (WP). |
| XVIII | XVIII. Gesetzgebungsperiode | 25.10.2022 | 25.09.2022 (WP) | Landtag, „Überblick Landtagssitzungen“: „1. (Konstituierende) Sitzung“ 25. Oktober 2022 | WP | – |

Quellen:
- BR 702: https://www.parlament.gv.at/dokument/BR/BRSITZ/702/fname_012851.pdf
- BR 758: https://www.parlament.gv.at/dokument/BR/BRSITZ/758/fname_142684.pdf
- XVI: https://www.tirol.gv.at/landtag/live/archiv/2013/ ; https://www.tirol.gv.at/landtag/live/archiv/2013/24052013-vormittag/
- XVII/XVIII: https://www.tirol.gv.at/landtag/sitzungen/landtagssitzungen/ueberblick-landtagssitzungen/ ; https://www.tirol.gv.at/landtag/meldungen/meldung/konstituierende-sitzung-der-xvii-gesetzgebungsperiode/ ; https://www.tirol.gv.at/landtag/meldungen/meldung/1-konstituierende-sitzung-der-xviii-gesetzgebungsperiode/
- WP: `Liste_der_Abgeordneten_zum_Tiroler_Landtag_(XIV._Gesetzgebungsperiode)` bis `(XVIII._…)`

## Vorarlberg

**Das Land zählt den Landtag, nicht die Periode:** „der XXXII. Vorarlberger
Landtag in seiner 1. Sitzung in diesem Jahr am 6. November 2024“ (Schreiben
der Landtagsdirektion an den Bundesrat). Die Sitzungen werden **je
Kalenderjahr** neu gezählt („1. Sitzung des XXVIII. Vorarlberger Landtages im
Jahre 2008“); die konstituierende Sitzung ist die erste Sitzung des neuen
Landtags in seinem ersten Jahr, nicht „die 1. Sitzung“ schlechthin. Wikipedia
schreibt „XXXII. Gesetzgebungsperiode“; als Anzeige empfiehlt sich die Form
des Landes. Nach Wikipedia beginnt die Periode laut Art. 16 Abs. 2 der
Landesverfassung mit dem ersten Zusammentritt des neuen Landtags (nicht im
Gesetzestext nachgesehen).

Eine Sitzungsliste des Landtags mit den konstituierenden Sitzungen war nicht
zu finden. Die zweite amtliche Quelle ist deshalb meist die Übersicht
„Vorarlberger Landesregierungen seit 1945“ des Vorarlberger Landesarchivs
(Verba volant Nr. 99, Stand 06.11.2024): Sie nennt die Amtszeit jeder
Landesregierung, die der neue Landtag wählt. Das ist nur ein **indirekter**
Beleg, und für 2004 widerspricht er dem Landtag selbst (siehe XXVIII).

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| XXVII | XXVII. Vorarlberger Landtag | 05.10.1999 | **widersprüchlich:** 13.09.1999 (Landesarchiv), 15.09.1999 (WP) | indirekt: Landesarchiv, Regierung „Sausgruber 2“ ab 5. Oktober 1999 | WP: „in der konstituierenden Sitzung am 5. Oktober 1999 angelobt“ | Der Wahltag ist für diese Notiz nicht geklärt. |
| XXVIII | XXVIII. Vorarlberger Landtag | **strittig:** 05.10.2004 (Landtag), 01.10.2004 (Landesarchiv), 20.09.2004 (WP) | 19.09.2004 (Landesarchiv; WP: „Am Tag zuvor“) | BR 713 (07.10.2004), Schreiben des Landtagspräsidenten vom 05.10.2004: „der XXVIII. Vorarlberger Landtag in seiner 1. Sitzung in diesem Jahr am 05.10.2004“ | Landesarchiv: Regierung „Sausgruber 3“ ab 1. Oktober 2004; WP: „in der konstituierenden Sitzung am 20. September 2004 angelobt“ | Drei Daten, keine zwei stimmen überein. Der 20.09.2004, ein Tag nach der Wahl, ist sehr wahrscheinlich ein Fehler der WP-Liste. Zwischen 01.10. und 05.10. entscheidet erst das Protokoll des Landtags. Nicht im Datenblock. |
| XXIX | XXIX. Vorarlberger Landtag | 14.10.2009 | 20.09.2009 (Landesarchiv, WP) | indirekt: Landesarchiv, Regierung „Sausgruber 4 / Wallner 1“ ab 14. Oktober 2009 | WP: „in der konstituierenden Sitzung am 14. Oktober 2009 angelobt“ | – |
| XXX | XXX. Vorarlberger Landtag | 15.10.2014 | 21.09.2014 (Landesarchiv, WP) | indirekt: Landesarchiv, Regierung „Wallner 2“ ab 15. Oktober 2014 | WP: „in der konstituierenden Sitzung am 15. Oktober 2014 angelobt“ | – |
| XXXI | XXXI. Vorarlberger Landtag | 06.11.2019 | 13.10.2019 (Landesarchiv, WP) | indirekt: Landesarchiv, Regierung „Wallner 3“ ab 6. November 2019 | WP: konstituierende Sitzung „fand am 6. November 2019 statt“ | – |
| XXXII | XXXII. Vorarlberger Landtag | 06.11.2024 | 13.10.2024 (Landesarchiv, WP) | Schreiben der Landtagsdirektion an den Bundesrat, 06.11.2024 (2305/GO-BR/2024): „der XXXII. Vorarlberger Landtag in seiner 1. Sitzung in diesem Jahr am 6. November 2024“; Landesarchiv „Wallner 4“ seit 6. November 2024 | WP | – |

Quellen:
- Landesarchiv: https://zenodo.org/records/14167396 (Verba volant Nr. 99, Herausgeber Vorarlberger Landesarchiv)
- BR 713: https://www.parlament.gv.at/dokument/BR/BRSITZ/713/fnameorig_029479.html
- 2305/GO-BR/2024: https://www.parlament.gv.at/dokument/BR/GO-BR/2305/imfname_1659821.pdf
- WP: `Liste_der_Abgeordneten_zum_Vorarlberger_Landtag_(XXVII._Gesetzgebungsperiode)` bis `(XXXII._…)`

## Wien

Arabische Ziffern, „**Wahlperiode**“ („Wiener Landtag, 22. Wahlperiode,
1. Sitzung vom 10. Juni 2025“). **Doppelrolle bestätigt:** Gemeinderat und
Landtag konstituieren sich in jeder Periode seit 2001 am selben Tag, als zwei
getrennte Sitzungen mit eigenen Protokollen (2020: Landtag ab 17.19 Uhr nach
dem Gemeinderat). Die Sitzungsberichte stehen je Jahr unter
`wien.gv.at/mdb/ltg/{Jahr}/` und `…/mdb/gr/{Jahr}/`; die Jahresseiten nennen
die Wahlperiode nicht, die Protokolle selbst schon.

| Periode | Bezeichnung des Landes | konstituierende Sitzung | Wahltag | Quelle 1 | Quelle 2 | Anmerkung |
|---|---|---|---|---|---|---|
| 17. | 17. Wahlperiode | 27.04.2001 | 25.03.2001 (ungeprüft) | Landtag 2001: „1. Sitzung vom 27. April 2001“; Gemeinderat 2001: dasselbe Datum | WP: „von 27. April 2001 bis zum 18. November 2005“ | – |
| 18. | 18. Wahlperiode | 18.11.2005 | 23.10.2005 (WP) | Landtag 2005: „1. Sitzung vom 18. November 2005“; Gemeinderat ebenso | WP (17. WP): Ende „18. November 2005“; die Liste der 18. WP selbst nennt kein Datum | – |
| 19. | 19. Wahlperiode | 25.11.2010 | 10.10.2010 (ungeprüft) | Landtag 2010: „1. Sitzung vom 25. November 2010“; Gemeinderat ebenso | WP | – |
| 20. | 20. Wahlperiode | 24.11.2015 | 11.10.2015 (ungeprüft) | Landtag 2015: „1. Sitzung vom 24. November 2015“; Gemeinderat ebenso | WP | – |
| 21. | 21. Wahlperiode | 24.11.2020 | 11.10.2020 (ungeprüft) | Landtag, Wörtliches Protokoll 21. WP, 1. Sitzung, 24.11.2020; Gemeinderat 2020: 1. Sitzung 24.11.2020 | WP | – |
| 22. | 22. Wahlperiode | 10.06.2025 | 27.04.2025 (WP) | Wörtliches Protokoll „Wiener Landtag, 22. Wahlperiode, 1. Sitzung vom 10. Juni 2025“; Gemeinderat ebenso | WP | Vorgezogene Wahl (April 2025 statt Herbst); Beschluss nicht nachgesehen. |

Quellen:
- Landtag: https://www.wien.gv.at/mdb/ltg/2001/ , `…/2005/`, `…/2010/`, `…/2015/`, `…/2020/`, `…/2025/`; https://www.wien.gv.at/mdb/ltg/2025/ltg-001-w-2025-06-10.pdf
- Gemeinderat: https://www.wien.gv.at/mdb/gr/2001/ , `…/2005/`, `…/2010/`, `…/2015/`, `…/2020/`, `…/2025/`
- WP: `Liste_der_Abgeordneten_zum_Wiener_Landtag_und_Mitglieder_des_Wiener_Gemeinderats_(17._Wahlperiode)` bis `(22._…)`

## Was das einfache Modell bricht

- **Vorzeitige Enden** (der Landtag löst sich auf, die Wahl kommt früher):
  Burgenland XVIII (2005) und XVII (2000), Steiermark XIV (Auflösung
  07.07.2005) und XVII (05.09.2019), Tirol XIV (20.03.2008) und XVII
  (24.06.2022); verkürzt ohne nachgesehenen Beschluss: Kärnten 30., Salzburg
  14. (beide 2009–2013), Burgenland XXII, Wien 21. Für den Filter ändert das
  nichts: Auch nach einer Auflösung bleibt der alte Landtag bis zum
  Zusammentritt des neuen im Amt (so die WP-Listen; in den Landesverfassungen
  nicht nachgesehen), und das Modell „Ende = Vortag der nächsten
  konstituierenden Sitzung“ trägt.
- **Keine Periode begann vor dem Ende der vorigen.** Die einzige
  Überlappung ist eine der Schreibweise: Niederösterreich lässt die alte
  Periode am Anfangstag der neuen enden.
- **Eine erste Sitzung über zwei Tage:** Oberösterreich 2003 (23. und
  27.10.). Beginn ist der erste Tag.
- **Zählweise:** Vorarlberg zählt Landtage und Sitzungen je Kalenderjahr;
  Wien zählt Wahlperioden; Kärnten und Salzburg arabisch, die übrigen
  römisch; Oberösterreich schreibt beides.
- **Wien:** Landtag und Gemeinderat am selben Tag, getrennte Sitzungen.

## Offen

| Land | Periode | Problem | was es schließen würde |
|---|---|---|---|
| Vorarlberg | XXVIII (2004) | **strittig:** 05.10.2004 (Landtagspräsident an den Bundesrat), 01.10.2004 (Landesarchiv, Amtsbeginn der Regierung), 20.09.2004 (WP). Nicht im Datenblock. | Sitzungsbericht des XXVIII. Landtags 2004 im Landtagsarchiv (`suche.vorarlberg.at/VLR`) oder Anfrage an die Landtagsdirektion |
| Vorarlberg | XXVII, XXIX, XXX, XXXI | amtlicher Beleg nur **indirekt** (Amtsbeginn der Landesregierung laut Landesarchiv); im Datenblock, weil zwei Quellen übereinstimmen, aber nach dem Befund für 2004 schwächer als die übrigen Zeilen | je das Schreiben des Landtagspräsidenten an den Bundesrat (Protokoll der folgenden Bundesratssitzung) oder der Sitzungsbericht des Landtags |
| Vorarlberg | XXVII | Wahltag widersprüchlich (13.09. Landesarchiv, 15.09. WP) | nur Gegenprobe; Wahlergebnis des Landes 1999 |
| Tirol | XVI (2013) | amtlicher Beleg **indirekt:** das Videoarchiv zeigt den 24.05.2013 als erste Sitzung nach der Wahl, ohne sie zu benennen; der Wortlaut des Schreibens an den Bundesrat (BR 821) ist im Protokoll nur als Bild beigelegt | Bild in BR 821 lesen, oder die Tagesordnung der Sitzung in `lte.tirol.gv.at` |
| alle | Wahltage mit „(ungeprüft)“ | nicht abgerufen; nur Gegenprobe | – |

## Vorschlag für die Datenform

Nur Zeilen, deren Beginn zwei übereinstimmende Quellen haben; Vorarlberg
XXVIII fehlt deshalb. Die Zeilen mit nur indirektem amtlichem Beleg sind
kommentiert. `land` wie `LAND_CODES` in `shared/utils/laender.ts`; `period`
ist die Ziffer, wie das Land sie schreibt, `noun` und `style` je Land, damit
die Anzeige („XXIII. Gesetzgebungsperiode“, „22. Wahlperiode“, „XXXII.
Vorarlberger Landtag“) aus den Daten kommt und nicht aus einer Bedingung im
Code. Das Ende einer Periode ist wie beim Bund der Vortag des nächsten Beginns
und wird nicht gespeichert.

```ts
const LAND_PERIOD_NAMING = {
  bgld: { style: 'roman', noun: 'Gesetzgebungsperiode' },
  ktn: { style: 'arabic', noun: 'Gesetzgebungsperiode' },
  noe: { style: 'roman', noun: 'Gesetzgebungsperiode' },
  ooe: { style: 'roman', noun: 'Gesetzgebungsperiode' },
  sbg: { style: 'arabic', noun: 'Gesetzgebungsperiode' },
  stmk: { style: 'roman', noun: 'Gesetzgebungsperiode' },
  t: { style: 'roman', noun: 'Gesetzgebungsperiode' },
  vbg: { style: 'roman', noun: 'Vorarlberger Landtag' },
  w: { style: 'arabic', noun: 'Wahlperiode' },
} as const

const LAND_PERIOD_STARTS = [
  { land: 'bgld', period: 'XVIII', start: '2000-12-28' },
  { land: 'bgld', period: 'XIX', start: '2005-10-25' },
  { land: 'bgld', period: 'XX', start: '2010-06-24' },
  { land: 'bgld', period: 'XXI', start: '2015-07-09' },
  { land: 'bgld', period: 'XXII', start: '2020-02-17' },
  { land: 'bgld', period: 'XXIII', start: '2025-02-06' },

  { land: 'ktn', period: '28', start: '1999-04-08' },
  { land: 'ktn', period: '29', start: '2004-03-31' },
  { land: 'ktn', period: '30', start: '2009-03-31' },
  { land: 'ktn', period: '31', start: '2013-03-28' },
  { land: 'ktn', period: '32', start: '2018-04-12' },
  { land: 'ktn', period: '33', start: '2023-04-13' },

  { land: 'noe', period: 'XVI', start: '2003-04-24' },
  { land: 'noe', period: 'XVII', start: '2008-04-10' },
  { land: 'noe', period: 'XVIII', start: '2013-04-24' },
  { land: 'noe', period: 'XIX', start: '2018-03-22' },
  { land: 'noe', period: 'XX', start: '2023-03-23' },

  { land: 'ooe', period: 'XXVI', start: '2003-10-23' },
  { land: 'ooe', period: 'XXVII', start: '2009-10-23' },
  { land: 'ooe', period: 'XXVIII', start: '2015-10-23' },
  { land: 'ooe', period: 'XXIX', start: '2021-10-23' },

  { land: 'sbg', period: '12', start: '1999-04-27' },
  { land: 'sbg', period: '13', start: '2004-04-28' },
  { land: 'sbg', period: '14', start: '2009-04-22' },
  { land: 'sbg', period: '15', start: '2013-06-19' },
  { land: 'sbg', period: '16', start: '2018-06-13' },
  { land: 'sbg', period: '17', start: '2023-06-14' },

  { land: 'stmk', period: 'XIV', start: '2000-11-07' },
  { land: 'stmk', period: 'XV', start: '2005-10-25' },
  { land: 'stmk', period: 'XVI', start: '2010-10-21' },
  { land: 'stmk', period: 'XVII', start: '2015-06-16' },
  { land: 'stmk', period: 'XVIII', start: '2019-12-17' },
  { land: 'stmk', period: 'XIX', start: '2024-12-18' },

  { land: 't', period: 'XIV', start: '2003-10-21' },
  { land: 't', period: 'XV', start: '2008-07-01' },
  { land: 't', period: 'XVI', start: '2013-05-24' }, // amtlich nur indirekt (Videoarchiv), siehe „Offen“
  { land: 't', period: 'XVII', start: '2018-03-28' },
  { land: 't', period: 'XVIII', start: '2022-10-25' },

  { land: 'vbg', period: 'XXVII', start: '1999-10-05' }, // amtlich nur indirekt (Landesarchiv), siehe „Offen“
  // XXVIII fehlt: Beginn strittig (05.10. / 01.10. / 20.09.2004), siehe „Offen“
  { land: 'vbg', period: 'XXIX', start: '2009-10-14' }, // amtlich nur indirekt
  { land: 'vbg', period: 'XXX', start: '2014-10-15' }, // amtlich nur indirekt
  { land: 'vbg', period: 'XXXI', start: '2019-11-06' }, // amtlich nur indirekt
  { land: 'vbg', period: 'XXXII', start: '2024-11-06' },

  { land: 'w', period: '17', start: '2001-04-27' },
  { land: 'w', period: '18', start: '2005-11-18' },
  { land: 'w', period: '19', start: '2010-11-25' },
  { land: 'w', period: '20', start: '2015-11-24' },
  { land: 'w', period: '21', start: '2020-11-24' },
  { land: 'w', period: '22', start: '2025-06-10' },
] as const
```

Solange Vorarlberg XXVIII fehlt, hat die Reihe für Vorarlberg eine Lücke von
2004 bis 2009: Ein Entwurf aus dieser Zeit fiele sonst still in XXVII. Der Code
muss eine fehlende Periode als Lücke führen und benennen, nicht die vorige
verlängern.

## Was nicht erreichbar war

- `landtag.ktn.gv.at` gibt es nicht (DNS); der Kärntner Landtag liegt unter
  `ktn.gv.at/Politik/Landtag`.
- `bgld-landtag.at` hat kein Archiv der XVIII. Periode (404 unter dem Muster
  der anderen).
- Salzburg: Protokoll der 1. Sitzung der 13. Periode unter keinem erprobten
  Dateinamen; das Verzeichnis antwortet 403.
- Tirol: die Broschüre des Landtags und das LGBl-PDF 25/2013 kamen leer bzw.
  als HTML zurück; Sitzungen vor 2018 führt der Landtag nicht.
- Vorarlberg: keine Sitzungsliste des Landtags gefunden; `vorarlberg.at/-/landtag`
  gibt 404.
- Oberösterreich: die Protokoll-PDFs der 1. Sitzung von XXVIII und XXIX sind
  nur über Sitzungs-URLs mit Session-ID verlinkt; gelesen wurde die
  Listenseite, nicht das PDF.
- Keines der Länder hat mit 403 gesperrt; die PALLAST-Seiten der Steiermark
  wurden nicht gebraucht.
