---
paths:
  - "app/pages/wege.vue"
  - "app/pages/eu-recht/wege*"
  - "app/components/wege/**"
  - "app/utils/{wege,wegeMarks,notFollowed}.ts"
---

# Routes to a norm

Which routes to a norm exist, how `/wege` draws them, and which ones the
monitor follows. What an entry holds, and the other areas:
`docs/decisions.md`.

## Routes to a norm, and what the monitor follows

Settled on 14.11.2026; the facts are in
`docs/research/wege-zu-einer-rechtsnorm.md`, whose last section
(„Einschätzung") gives the order to build in. A session that builds a route
not yet followed, or the EU cycle, starts there.

- **A route is followed only when three things hold:** an official,
  machine-readable source whose reuse is checked and stated on `/quellen`;
  enough cases to matter; and no upkeep that somebody has to carry by hand.
- **What is followed.** Committee motions, motions of the Bundesrat, every
  Initiativantrag on a law, the Bundesrat's objection as an event, treaties
  up to BGBl. III (14.11.2026); Petitionen, Bürgerinitiativen and
  Volksbegehren in the Nationalrat as an object of their own (15.11.2026).
  Not followed: the regulators' Verordnungen (no machine-readable source of
  their consultations; `docs/research/wege-ausserhalb-der-stationen.md`) and
  Verordnungen without a Begutachtung, which wait until a missing draft can
  be proven: the promulgation match's misses are not an error rate (of 15
  old misses read, 7 were promulgated and missed, 5 never were).
- **The five stations stay five.** They are the rail of one national norm. A
  motion has no third station: „Regierungsvorlage" is drawn pale with its
  reason („keine · Antrag eines Ausschusses", `noRvReasonDe`), and the
  motion enters at „Parlament", its kind and Einlangen the station's first
  fact — on its page, in the list and on `/wege` alike (16.11.2026,
  maintainer's decision). The Bundesrat's objection and a Volksabstimmung
  are events inside a station. Whatever does not fit is a different object
  and gets a rail of its own on a page of its own — an EU act under
  `/eu-recht`, a Petition, Bürgerinitiative or Volksbegehren under
  `/anliegen` (`docs/decisions/anliegen.md`). No sixth station.
- **One page of ways per jurisdiction** (16.11.2026). The EU is a
  jurisdiction of its own, as for its object pages, so a country's ways and
  the EU's are two pages, and a second country gets a page of its own
  instead of sharing one with Austria. The country's page stays at `/wege`
  (Bund, Länder, Anliegen an das Parlament; of „Nicht im Monitor" the
  Volksbefragung and the Länder's instruments); the EU's stands at
  `euWegePath()`, `/eu-recht/wege` until step 6 moves it to `/eu/wege` with
  every other EU address (EU-Rechtsakt, Europäische Bürgerinitiative; the
  Petition an das Europäische Parlament). Both are „Wege der Gesetzgebung";
  the H1 adds where („in Österreich", from `EU_MEMBER_STATE_NAME_DE`; „in der
  EU"), so the place never becomes part of the name. The EU's lede is its
  own: an act walks to „Geltung" or „Umsetzung", and a Citizens' Initiative
  is no text that comes to apply. One component draws both (`WegeView`)
  from one object per page (`WegePage` in `app/utils/wege.ts`); every
  matrix, seam and instrument carries its jurisdiction, and each page's
  legend names only the marks it draws. A third jurisdiction is an id, an
  address in `WEGE_PATH_OF`, its words in `WEGE_PAGE_COPY`, its rows tagged,
  and a page file of three lines.
- **The seam is a link in both directions, where a law crosses**
  (16.11.2026), never a generic „see also". On the EU's page the
  directive's note „Umsetzung durch Bund oder Land" is itself the link to
  the country's page, beside „Entwürfe, die EU-Recht umsetzen"; the header
  „Umsetzung oder Geltung" carries none, as „Geltung" does not cross. On
  the country's page one line of the card, „EU-Recht" with „EU-Richtlinie,
  EU-Verordnung", opens the page — it enters the Bund's and the Länder's
  paths alike, so it belongs to neither matrix; a directive exists before
  the draft that carries it out, so the page reads EU, Bund, Länder, and
  mirrors the EU's page, which ends with the link here — and links the
  EU's page and the list of drafts that carry out EU law (`WEG_SEAMS`). It
  is a group of the card, not a paragraph above it. `?weg=` selects a row
  only on the page that holds it (`wegSelected`); `wegHref` leads each id to
  its page, and the EU object pages' state cards lead to the EU's page with
  their row where their kind is read (`euWegFor`).
- **The graphic shows every route that exists, the monitor follows
  fewer.** A route that is not followed stands in the graphic as „nicht im
  Monitor" with its reason. Every followed object has a matrix of its own
  with the stations of its own rail, names and order read from the rail's
  code (`WEG_MATRICES`, `WegMatrix`), each on its jurisdiction's page: the
  national norm (Bund and Länder a matrix each, the same five stations, the
  last two named „Parlament" and „Bundesgesetzblatt" or „Landtag" and
  „Landesgesetzblatt" in the header, so no sentence translates one), an EU
  act (Konsultation · Vorschlag · Parlament und Rat · Amtsblatt · Umsetzung
  oder Geltung), a European Citizens' Initiative, an Anliegen an das
  Parlament (the Nationalrat's three kinds and the Petition an den
  Bundesrat, whose rail names its last column „Bundesrat"; four columns,
  since the committee's Erledigung is part of the committee's row); one
  card, one legend, the blue mark wherever one can take part, each row
  naming how („Rückmeldung möglich"). The matrices read as one grid: the
  first column is „Weg" in each, a bar carries its name and no sentence,
  and the station columns have one width in every matrix, so all marks
  stand in five verticals. A header that does not fit breaks between words
  or at a compound's joint („Regierungs-vorlage", `wegHeaderLabel`), never
  where the browser guesses, and stands on the bottom line, next to its
  marks. Five columns are what these rails have, not a rule: a rail with
  four or six stations gets four or six. The pages are „Wege der
  Gesetzgebung" and each runs: how a text becomes law (Bund, Länder; an EU
  act), how people start something themselves (Anliegen; the Citizens'
  Initiative), then what is not followed. Table or rails is the card's
  question, not the window's (a container query at 50rem): the table stays
  while the card holds the five station columns and 200 px for the paths.
  Only the instruments the monitor does not follow are a list without
  stations, „Nicht im Monitor", each with its reason.
- **Each thing stands once among the pages of ways** (15./16.11.2026). What
  is a route to a norm is a row, and only a row: a Volksbegehren in the Bund
  or a Land, an initiative of Gemeinden or citizens, and the
  Volksabstimmung, which sits between the Beschluss and the Kundmachung — a
  row with no column of its own (no sixth station), its note saying where
  it falls, its Kundmachung „je nach Fall". The list „Nicht im Monitor"
  keeps what has no path to a norm or no source: the EP petition (no
  interface, and the portal refuses programs), the Volksbefragung (one so
  far, bound to no law), and the Länder's Volksbefragung, petitions and
  Bürgerrat. A reason says what was found; „Quellen nicht geprüft" stands
  only where nobody has read them.
- **The graphic follows the law, not the code** (14.11.2026). Every cell of
  `app/utils/wege.ts` names in a comment the provision the memo cites for it;
  what the memo lists under „Offen" is „je nach Fall" or left out, never a
  mark. Whether the monitor follows a row is read from the code and named at
  the row. Rows that are a DRAFT in Begutachtung (a Verordnungsentwurf, a
  Land's Gesetzesentwurf) keep their blue mark, and a sibling row or a link
  to `/datenlage#begutachtung-vorgeschrieben` says that the law does not
  prescribe it everywhere. Routes that pass only „Kundgemacht"
  (Notverordnung, Wiederverlautbarung, VfGH-Aufhebung) are not rows: nobody
  can take part on them.
- **A link on a page of ways shows what its words name, and a mark means one
  thing** (16.11.2026). A row's link leads to its kind: where hardly one of
  a kind is open on a given day (Volksbegehren, Petition an den Bundesrat)
  to the list without „Nur offene", never to an empty one; „Richtlinie" to
  the directives Austria has to transpose, and the open feedback windows
  stand behind the two EU stations that carry them. An
  Ausschussbegutachtung is „je nach Fall" at Begutachtung at both levels,
  never a dash beside a note that names it and never in the Landtag's
  column. The legend names every mark, the dash too. A blue mark links to
  where that can be done now (`wegCellHref`): the list of exactly the row's
  kind at that station with „Stellungnahme möglich" on, written by the
  list's own query helpers; the Anliegen list of the kind with its open
  default; the EU's open windows or Citizens' Initiatives. Its name says
  where it leads („Stellungnahme möglich: Ausschussantrag, Parlament –
  offene anzeigen", `wegCellLinkName`); on the rails the mark's word is the
  link. A mark whose kind no view holds open there gets no link, its reason
  at the row (`openSkip`): „als Initiativantrag" (the route is known only
  once kundgemacht), the Ausschussantrag (a row under its own option only
  where „ohne Entwurf" is evidenced, never before its law), the Bundesrat's
  motion (no option of its own). The header „Parlament" of the Bund leads
  to the list's tab, although it is empty on days when nothing is between
  Beschluss and Kundmachung.
