/**
 * The organisations the name heuristic of `privacy.ts` cannot recognise,
 * each verified by hand — DATA, apart from the rules that use it. It grew to
 * more than 180 entries when the classifier's review queue was worked
 * through (28.09.2026, docs/architecture.md §12.14), and a list that size
 * buried the rules it serves.
 *
 * PURE MODULE — no imports at all.
 */

/**
 * Known organisations the heuristic cannot recognize (architecture.md §12.9):
 * brand-style names without any legal form or org keyword, and — since the
 * upstream `TYP` flag started vetoing (`classifySubmitter`) — organisations
 * whose staff filed through the private-person registration. Matched
 * case-insensitively against the full normalized name. Because an entry here
 * publishes the name, this list may contain organisations only, never
 * persons — add entries solely after verifying the exact spelling in the
 * Parliament data (list 142 `names[].name`). `scripts/audit/classifier.ts`
 * prints the candidates as lists 1 and 3.
 *
 * The value is the name to PRINT; `null` prints the matched text as it
 * stands — the whole string on a full match, and on a semicolon match the
 * head alone, never the tail after it (`allowlistedName`). It exists
 * because Parliament's two name fields are "Nachname, Vorname", and an
 * organisation that fills them in gets stored inverted:
 * "Pressefreiheit, Institut für", "GmbH, Verkehrsverbund Ost-Region (VOR)".
 * Those rows were on the site in that shape for as long as they were public.
 * A display name is a de-inversion READ OFF the same string — never an
 * invention, and never a person's name.
 */
export const ORG_ALLOWLIST = new Map<string, string | null>([
  ['epicenter.works', null], // verified 2026-08-23 via 14/SN-8/ME (GP XXVIII)
  ['weisser ring', null], // verified 2026-09-15, list 142 GP XXVIII ("WEISSER RING", 3 rows)
  ['vier pfoten', null], // verified 2026-09-15, list 142 GP XXVII ("Vier Pfoten; Stiftung für Tierschutz")

  /* Verified 2026-09-16 from the TYP-veto corpus comparison — every one an
   * organisation, none containing a natural person's name. GP XXVIII: */
  ['dachverband berufliche inklusion, dabei-austria', null],
  ['fachstelle suchtprävention, soziale dienste bgld gmbh', null],
  /* GP XXVII: */
  ['der universität innsbruck, rektorat', 'Universität Innsbruck, Rektorat'],
  ['tirol kliniken gmbh, rechtsabteilung', null],
  ['sabaini gmbh, firma', 'Sabaini GmbH'],
  ['umwelt, forum wissenschaft &', 'Forum Wissenschaft & Umwelt'],
  ['öh universität innsbruck, stv doktorat phil hist univ. innsbruck', null],
  ['(tu wien), studienkommission raumplanung', 'TU Wien, Studienkommission Raumplanung'],
  ['akademie, junge', 'Junge Akademie der Österreichischen Akademie der Wissenschaften'],
  ['bundestheater holding gmbh, bth', 'Bundestheater-Holding GmbH'],
  ['pressefreiheit, institut für', 'Institut für Pressefreiheit'],
  ['gmbh, verkehrsverbund ost-region (vor)', 'Verkehrsverbund Ost-Region (VOR) GmbH'],
  ['patentanwaltskammer, österr.', 'Österreichische Patentanwaltskammer'],

  /* Verified 2026-09-23, list 142 GP XXVIII, one row each — brand-style
   * names whose only org word sits in the segment AFTER the semicolon,
   * where the affiliation guard in `classifyByName` no longer reads it. */
  ['ebay', null],
  ['akzente salzburg', null],

  /* Verified 2026-09-28 from the whole review queue — list 142 flags `I`,
   * this module filed them as "person", GP XXVIII/XXVII, ME and RV. Every
   * one read and identified as an organisation or a public body; what no
   * general pattern could publish safely. Most are heads: acronyms, brand
   * names and bodies whose department follows the semicolon ("ASFINAG;
   * Vorstand", "BAK; Wirtschaftswissenschaft"). A head match prints the head
   * alone, which is what makes "Digital Society", "LinkedIn Ireland UC" and
   * "ÖPU NÖ" safe to list: in this data each also files as "<head>; <title>
   * <Vorname Nachname> …", and that person stays off the page. Left out on
   * purpose: law firms and practices named after their owners, sole traders
   * (e.U.), bare names, and every string whose identity was not certain. */
  ['akm autoren, komponisten und musikverleger reggenmbh', null],
  ['akv europa', null],
  ['alter orden vom st. georg', null],
  ['amazon', null],
  ['microsoft', null],
  ['google', null],
  ['ambulatorium amalienbad', null],
  ['anti-diskriminierung - unabhängiger bedienstetenschutz', null],
  ['access info europe', null],
  ['ages', null],
  ['arche noah', null],
  ['article 19', null],
  ['asb - arge schuldnerberatungen', null],
  ['asfinag', null],
  ['at&t / warnermedia', null],
  ['aucen', null],
  ['austrian cats united', null],
  ['austrian society for artificial intelligence (asai)', null],
  ['austrianstartups', null],
  ['austromed', null],
  ['austropapier', null],
  ['auva', null],
  ['bag intensiv- und anästhesiepflege des ögkv, bargi und öbai', null],
  ['bak', null],
  ['barmherzige brüder', null],
  ['bawo - wohnen für alle', null],
  ['bawo, bundesarbeitsgemeinschaft wohnungslosenhilfe', null],
  ['bildung brennt', null],
  ['biobauern gegen gentechnik', null],
  ['biogas; bruck/leitha gmbh & co kg', 'Biogas Bruck/Leitha GmbH & Co KG'],
  ['bizeps', null],
  ['bka - verfassungsdienst', null],
  ['bmb', null],
  ['bmbwf', null],
  ['bmsgpk - abt. i/a/4', null],
  ['böp', null],
  ['bote aus der buckligen welt', null],
  ['brightstar lottery', null],
  ['bsa ahs', null],
  ['bsa-ahs', null],
  ['bund sozialdemokratischer akademikerinnen', null],
  ['canal+ luxembourg s.à r.l.', null],
  ['casino innsbruck', null],
  ['cmg-ae', null],
  ['complexity science hub vienna', null],
  ['cultural broadcasting archive', null],
  ['data intelligence offensive', null],
  ['deca - eine stimme für energieeffizienz', null],
  ['deca dienstleister energieeffizienz & contracting', null],
  ['department für integrierte sensorsysteme', null],
  ['der standard', null],
  ['die sharing-anbieter dott, lime und voi', null],
  ['digital society', null],
  ['digital society.at', null],
  ['digitize!', null],
  ['dignitas - menschenwüridg leben - menschenwürdig sterben', null],
  ['doctors against forced organ harvesting', null],
  ['dowas', null],
  ['energie steiermark', null],
  ['epex spot', null],
  ['european energy exchange (eex), epex spot', null],
  ['epicenter.works - for digital rights', null],
  ['fachschaft raumplanung', null],
  ['fdj united', null],
  ['fhwien der wkw', null],
  ['forschung burgenland', null],
  ['fstv-bildungswissenschaften und stv erziehungswissenschaften', null],
  ['freiheitlichen wirtschaft', null],
  ['grüne wirtschaft', null],
  ['grüne bäuerinnen und bauern (gbb)', null],
  ['gemeinwohlenergie innsbruck', null],
  ['gesundheit burgenland', null],
  ['göd', null],
  ['gras - grüne & alternative student_innen', null],
  ['gras - grüne & alternative studentinnen', null],
  ['grüne & alternative student_innen (gras)', null],
  ['great spa towns of europe world heritage site', null],
  ['grenzenlos - interkultureller austausch', null],
  ['gymnasium draschestraße (grg23vbs)', null],
  ['haus der barmherzigkeit', null],
  ['helping hands', null],
  ['htu wien', null],
  ['iapö', null],
  ['ifwa', null],
  ['ifkbw:nhf', null],
  ['iibw', null],
  ['ispa', null],
  ['pharmig', null],
  ['vvo', null],
  ['imwind', null],
  ['infoladen-servicebuchhandlung', null],
  ['initiative stadtbildschutz, verein', null],
  ['isda', null],
  ['ivs wien', null],
  ['iwo', null],
  ['jam music lab pu', null],
  ['jku linzq', null], // upstream's spelling, printed as it stands
  ['jugend eine welt - don bosco entwicklungszusammenarbeit', null],
  ['jugend für das leben', null],
  ['kaizen gaming', null],
  ['kardinal könig haus', null],
  ['kelag, kng', null],
  ['kiwi - kinder in wien', null],
  ['kommaustria', null],
  ['ksv 1870', null],
  ['ksw', null],
  ['kunst uni graz', null],
  ['kz-gedenkstätte mauthausen/mauthausen memorial', null],
  ['landeshauptleute', null],
  ['laola1', null],
  ['licht ins dunkel', null],
  ['linkedin ireland uc', null],
  ['linz school of education', null],
  ['liste perspektive', null],
  ['lkh wiener neustadt', null],
  ['logopädieaustria', null],
  ['lsg wahrnehmung von leistungsschutzrecht', null],
  ['lvwg steiermark', null],
  ['mdw', null],
  ['megaphon', null],
  ['nawi graz koordinationsbüro', null],
  ['netzpolitik.org und fragdenstaat', null],
  ['nsks, zso, sks', null],
  ['öaab-lehrerinnen und lehrer vorarlberg', null],
  ['öaw', null],
  ['öbvp', null],
  ['ögkv', null],
  ['öglmkc', null],
  ['öli-ug', null],
  ['open knowledge fourndation', null],
  ['open science - lebenswissenschaften im dialog', null],
  ['öpu/fcg', null],
  ['öpuk', null],
  ['öpu nö', null],
  ['öquasta und galp vereine für qual.sicherung im med. labor', null],
  ['orange 94.0 - das freie radio in wien', null],
  ['orf', null],
  ['öskor; radiologietechnologie', null], // upstream „ÖSKOR * …", the star read as the separator it is (`privacy.ts`)
  ['österr. apothekerverlagsgesmbh', null],
  ['österreichischer mieter-, siedler und wohnungseigentümerbund', null],
  ['övsv', null],
  ['physioaustria', null],
  ['pro mente oö', null],
  ['pro thayatal', null],
  ['protect', null],
  ['queer base', null],
  ['quintessenz', null],
  ['rechtsanwälte für grundrechte - anwälte für aufklärung', null],
  ['rechtsanwälte für grundrechte – anwälte für aufklärung', null],
  ['rechtsanwälte für grundrechte- anwälte für aufklärung (“rfg-afa“)', null],
  ['rechtsschutzbeauftragter der justiz', null],
  ['redcare pharmacy', null],
  ['referat für studieren mit beeinträchtigung(en)', null],
  ['refurbed', null],
  ['reporter ohne grenzen', null],
  ['schlichtung für verbrauchergeschäfte', null],
  ['schuldenberatung fsw', null],
  ['schutzgebietsverwaltung wildnisgebiet dürresntein-lassingtal', null],
  ['slö wien', null],
  ['sol - menschen für solidarität - ökologie - lebensstil. zvr-zahl: 384533867', null],
  ['sportunion west-wien', null],
  ['spusu', null],
  ['stift klosterneuburg', null],
  ['studienvertretungen technische mathematik, lehramt und geodäsie und geoinformation', null],
  ['supro - gesundheitsförderung und prävention', null],
  ['swv wien', null],
  ['tourismusschulen semmering', null],
  ['ulv tu graz', null],
  ['uniability', null],
  ['unser burgenland', null],
  ['vertretungsnetz', null],
  ['vöwg/vkö', null],
  ['vsstö', null],
  ['wiener kreis für psychoanalyse und selbstpsychologie', null],
  ['wiener linien', null],
  ['wu wien', null],
  ['za-bmhs', null],
  ['zamg', null],
  ['zara - zivilcourage und anti-rassismus-arbeit', null],
  ['koordinator für psychiatrie, sucht- und drogenfragen', null],
  ['abteilung für unternehmensrechnung & revision - wu wien', null],
  ['fakultätsleitung und der studienprogrammleitung der fakultät für psychologie der uni wien', null],
  ['hv ph salzburg, stv lehramt uni salzburg, fv soe uni salzburg', null],
  ['bezirksvorstehung innere stadt (1010 wien)', null],
  // Both read 28.09.2026 (XXVII 164/ME, flag I): public bodies the audit's
  // „Nachname, Vorname" test would misread, listed there as reviewed.
  ['parlamentsdirektion, rechts-, legislativ- und wissenschaftlicher dienst', null],
  ['tierschutzombudspersonen k, nö, oö, slzbg, stmk, tirol, vlbg und wien', null],

  /* Read 28.09.2026 (GP XXVI/ME, flag I): „KÜRZEL*voller Name", once the
   * star is read as the separator it is (`privacy.ts`) the shape of
   * `leadsWithUnsignedSegment` — a head without an organisation word before
   * one with it — and so filed as a person. Each an organisation, the whole
   * string without a personal name; full entries, so they print whole. */
  ['afpa; austrian financial and insurance professionals association', null],
  ['agn; arbeitsgemeinschaft für notfallmedizin', null],
  ['arbeit plus; soziale unternehmen österreich', null],
  ['argesodit; arbeitsgemeinschaft der sozialen dienstleistungsanbieter in tirol', null],
  ['austrian mobile power; the e-mobility alliance', null],
  ['bodenfreiheit; verein zur erhaltung von freiräumen', null],
  ['circulus pro disciplina ferentarii; club für lehrendes schiesswesen', null],
  ['die grünen burgenland; grüner gemeindevertreterinnenverband (gvv burgenland)', null],
  ['die termiten; plattform kritische sozialarbeit in tirol', null],
  ['entschleunigung und orientierung; institut für alterskompetenzen', null],
  ['epicenter.works for digital rights; epizentrum - plattform für grundrechtsbasierte zukunftspolitik (vormals akvorrat)', null],
  ['feykom; rat der kurdischen gesellschaft in österreich', null],
  ['noe3; ärztinnen und ärzte für niederösterreich', null],
  ['novartis; sandoz gmbh', null],
  ['plasser & theurer; export von bahnbaumaschinen gesellschaft m.b.h.', null],
  ['rtaustria; berufsfachverband für radiologietechnologie österreich', null],
  ['ulv; verband des wissenschaftlichen und künstlerischen personals an den österreichischen universitäten', null],
  ['wifo; österreichisches institut für wirtschaftsforschung', null],
  // The star as a slash, not a separator: „Deutsch als Fremd*Zweitsprache".
  ['ödaf - österreichischer verband für deutsch als fremd; zweitsprache', 'ÖDaF - Österreichischer Verband für Deutsch als Fremd*Zweitsprache'],
  // Read as „<Vorname Nachname> Institut" by the head rule of `classifyByName`.
  ['wolfgang pauli institut', null],
  ['medizinisches institut kreispunkt physiotherapie', null],
])
