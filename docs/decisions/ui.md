---
paths:
  - "app/**/*.vue"
  - "app/assets/**"
  - "app/utils/{terms,spine,railLink,typography,pauseLines,contact}.ts"
  - "shared/utils/gaps.ts"
---

# Design, accessibility and the detail pages

The design system, accessibility and the order of a detail page. What an entry
holds, and the other areas: `docs/decisions.md`.

## The detail pages

A detail page is the page of one draft, law, Vorlage or Anliegen. These
rules hold for all of them; each names the component that carries it, and
the reasoning in full stands in that component's header comment.

- **One order, top to bottom** (15.09.2026): the header (kind and number,
  title, sender, the source and „Zitieren"), the state card, the door card
  while a window for input is open, „Worum geht es?" where the source
  summarises the item, then one section per station in the stations' order
  — Der Entwurf, Die Begutachtung, Die Regierungsvorlage, Im Parlament, Im
  Bundesgesetzblatt. The door card is the one deliberate break with that
  order: the page's action must not sink below a long comparison
  (`app/pages/entwuerfe/[gp]/[inr].vue`).
- **On the page of a Vorlage, an Antrag or a motion the item's own blocks
  stand in its station's section** (16.11.2026, `ItemOwnBlocks`), not in
  sections of their own: the rail has no station for them.
- **A door quotes the receiving institution only where its sentence was
  read** (`statementQuote.ts`, `euFeedbackQuote.ts`). Read: Parliament's
  form for a Ministerialentwurf, a Regierungsvorlage, an Initiativantrag,
  an Ausschussantrag, a Petition and a Bürgerinitiative; the Commission's
  portal per stage; the Citizens' Initiative. No quote, because no
  institution's sentence exists or was read: a Verordnung's and a Land's
  draft (filed at the ministry or the Land's office, no form), a
  Gesetzesantrag des Bundesrates and a Petition an den Bundesrat (no open
  window to read).
- **The state card names the state, and nothing stands under its heading**
  (15.11.2026, `ProcedureCard`): no sentence, no date, no count, no
  countdown; one card for every detail page.
- **Five stations, vertical at every width** (15.09.2026, `SpineRail`). The
  yellow dot and wash mark the station the text is on; nothing else on the
  rail is yellow. A new fact extends a row's fact line; it adds no row („The
  five stations stay five", `docs/decisions/routes.md`). On the rail a fact
  never links (`SpineRail`).
- **A step not reached gets no section** (15.09.2026). A station's section
  renders exactly when the station has happened and something to say; until
  then the station is a row of the rail in plain text, not a link, and the
  page has no heading for it, no „ausstehend" section and no empty one. The
  rail's link into a section exists exactly where the section renders (the
  `sections` and `stationAnchors` computeds of each page; on the Länder
  pages the conditions in `LandStationSections`).
- **The door stands twice:** once in the door card at the top, once at the
  end of the section where the decision to file is made, solid, with the
  card's label (`DoorButton`). It lands in the form („A door lands in the
  form", under „Design and accessibility").
- **One door card per open window** (20.11.2026, `DraftDoorCard`): two
  windows open at once are two stacked cards, each with its own heading,
  tone and solid buttons; never the second window's buttons as outlines in
  the first card.
- **A box says what one does with it** (03.10.2026, the docblock of
  `FactList`): the accent-washed box is the door you act on, the white card
  an instrument you operate (state card, comparison, statement tables), the
  unfilled hairline frame facts to consult, bare text to read.
- **A comparison opens with its list** (02.10.2026 for the Bund, 23.10.2026
  for the Länder): no sentence above it repeats what the legend and the
  group pills count. Only a rare warning that the list may be misread
  stands above, in `ComparisonCaveats`.
- **The comparison's left side is the Regierungsvorlage** for every station
  after it; the Ministerialentwurf is the left side only for the Vorlage
  itself, so each change is attributed to who made it. Both ends stay freely
  selectable. Details: `defaultFromFor` in `shared/utils/lawStations.ts`.
- **The Erläuterungen's Allgemeiner Teil stands on the page in the
  ministry's words** (17.09.2026, `ExplanationsSection` under „Was das
  Ministerium begründet"); Parliament's Kurzinformation stays under „Worum
  geht es?".

## Design and accessibility

- **Two hues, one meaning each.** Blue means „you can do something here",
  yellow is the highlighter. Selection is ink: a selected control is the one
  you cannot act on.
- **AAA contrast (7:1), computed, never judged by eye.** The gray hierarchy
  is therefore flat; hierarchy comes from size and weight.
- **The site promises AA and aims for AAA** (maintainer, 24.11.2026).
  `/ueber#a11y` says the two apart: WCAG 2.2 AA is what a reader can hold
  the monitor to, and a miss there is a fault to fix; AAA is the direction,
  named where it is met (contrast) and where it is not (target size). It
  also says what has not been tested: no independent audit and no test with
  people who use assistive technology, until one has happened.
- **Target size is AA by decision:** 44 px for coarse pointers, 36 px for
  fine ones, because 44 px on desktop made controls taller than the rows they
  sit under. `/ueber` names the exception.
- **One hover state for every link: a 2 px underline** (03.10.2026,
  `link-inline`, `link-quiet`, `link-muted` in `main.css`). Hover never
  removes an underline. What has an edge (a row, a chip, a control) answers
  with the hover ground instead.
- **A link in metadata wears the line's muted ink** (03.10.2026,
  `link-muted`): captions and credit lines under a box, the footer. Blue
  `link-inline` and `link-quiet` stay for content.
- **Every link that leaves the site opens a new window and says so.**
- **The serif names the page's structure, the sans its apparatus**
  (03.10.2026): the page title and the chapter heads (h1, h2) are serif; an
  h3 is sans in `text-lg` (`PageSubsection`), a box's name sans at body size
  in semibold (`card-heading`), a fact's label in a frame medium weight
  (`FactList`).
- **The middle dot separates in credit lines and figures** („Quelle: … ·
  Grafik: …", „1.085 · 23,0 %"; maintainer, 20.11.2026).
- **A marked change is also spoken** (23.11.2026, `DiffText`), through CSS
  generated content, never a hidden span, which would land in copied law
  text and the page search.
- **A sheet holds rows or one object with a job of its own, never prose.**
- **Every multi-colour categorical palette passes the palette validator;**
  text never carries the data colour.
- **What a control changes sits at it or below it, never above.** Stable
  headings, selectors in the section head, the source line as a footnote.
- **Text runs the full width of its column** (maintainer, 17.11.2026). The
  page column (`max-w-2xl` … `max-w-5xl` on the page's root) is the only
  measure; no paragraph, help text, gap sentence, list or method text inside
  it gets a width of its own (`max-w-prose`, `max-w-md`, `…ch`): a narrower
  text leaves a ragged empty band and reads as a layout fault. Boxes that
  are not text (a card on the error page, a control in a toolbar) may be
  capped.
- **Help opens in place, below, as a native `<details>`** (14.11.2026). No
  tooltips, no (i) icons, no popovers, no `title` carrying meaning: the
  reader meets a term at the tag, and a phone has no hover. Three levels: a
  term opens its one to three sentences under its own row (`TermNote`);
  „Methode", the last item of a section's credit line, opens the section's
  method text under the line (`SectionCredits` `#method`); a gap stays a
  sentence at its place. Open help text sits behind a 4 px `baseline` rule
  on the left (`TermNote`); the rule means help and nothing else, so the
  warnings above a comparison (`ComparisonCaveats`) have none. A control is
  never also a disclosure, so filter toggles and the count pills in a
  group's header button define nothing. Definitions live in
  `app/utils/terms.ts`, method texts as components in
  `app/components/method/` — copy out of logic, one place per language.
- **A method text is the credit line in full sentences, and it is scanned,
  not read** (18.11.2026, `MethodGegenueberstellung` and the others). A
  `<dl>` whose terms are the answers themselves („Der Text ist vom
  Ministerium", „Die Markierung ist von uns"), in the order of the line
  above it, set in the help size with the terms in medium weight (at body
  size and semibold they read as headings of the page). It says
  what a reader needs to read this section: whose text, what is ours, how
  it is checked, what a withheld row means. Why a document exists in law,
  exceptions inside a check and pointers to other sections stay out. Where
  a section stands on several kinds of page, the text varies with the
  document shown and a caveat appears only where it applies: a sentence
  true on one page and false on another is the fault to avoid.
- **The page says „Ministerium", never „Ressort"** (18.11.2026). One word
  per thing: two words for one body make a reader ask whether they differ.
  „Ressort" stays where a source is quoted in its own words and in English
  comments and identifiers.
- **The page says „Anweisung", never „Anordnung"** (maintainer,
  24.11.2026), for what a draft orders („In § 6a wird die Jahreszahl …
  ersetzt"); the compound is „Änderungsanweisung". „Novellierungsanordnung",
  the legal term, stays out of reader copy. The harness's own reason strings
  (`STRICT_UNCHECKED`, the annex gate's reasons) keep their words: the page
  never prints them.
- **A list shows its frame while loading; the loading line and the gap
  sentence stand where the rows will be** (maintainer, 16.11.2026,
  `ListBoxState`, `listBoxStatusOf`, `EntryList`'s `state`). Everything
  that does not depend on the data renders at once and stays put: heading,
  lede, the list box, its column header (plain labels until rows exist),
  the controls whose content is known without the data, the credit line.
  A tab with a count is data: the tabs stand as labels without counts,
  disabled with the loading line as their reason (`EuFensterList`), or,
  without counts, usable; a search over rows that are not there is
  disabled; a count line waits. No fake rows and no grey bars: decoration
  that carries no information. One piece for every list; a detail page
  gated as a whole has no frame to show and keeps `FetchGate`.
- **A list's notes state, they do not explain** (14.11.2026). Above the
  rows stands only what is true of the list right now and differs from what
  its controls claim, one sentence each: a source that failed, a filter that
  could not apply, a Land the list does not hold in full. What a row's label
  means is explained on that row's page, at the term (`TermNote`); what the
  list leaves out by design goes into one „Methode" at the list's foot
  (`SectionCredits` `#method`, `MethodEntwurfsliste`). No „nicht" is
  weakened, a claim about absence keeps its proof, and two different gaps are
  never one sentence.
- **A gap sentence opens with one of four lead words that say whose gap it
  is** (15.11.2026, `shared/utils/gaps.ts`, `GapNote`): „Nicht
  veröffentlicht" (the source does not publish it; the word of
  `/datenlage`), „Gerade nicht abrufbar" (no answer just now, no claim
  about fault), „Nicht lesbar" (this document, our reading failed or a check
  refused it), „Nicht im Monitor" (our scope or method, for every case of
  its kind). The lead word is semibold in the text's own ink; no colour, no
  symbol. A label puts the object first: „Kundmachung: gerade nicht
  abrufbar"; so does the heading of an error box with a retry button
  („Stellungnahmen: gerade nicht abrufbar", bare where it names nothing).
  One verb for a failed request, never „derzeit", „verfügbar" or „gerade
  nicht lesbar"; gap sentences say „der Monitor", not „wir". A state of the
  procedure („noch keine Regierungsvorlage", „Beschlossen – nicht
  kundgemacht") is no gap and takes none, nor does a sentence that follows
  from a gap already named („Ganze Paragraphen in der vorgeschlagenen
  Fassung zeigt der Monitor deshalb auch nicht …"). A record that lists no
  document proves no absence: a missing Erläuterungen document is „Nicht
  lesbar", never „Nicht veröffentlicht". A kind of document the monitor
  does not read at a source is its scope and no failed reading: „Nicht im
  Monitor: … liest der Monitor nicht aus", and so every sentence about a
  Bund text held as a PDF only that is not read (a Gesetzestext, a draft's
  Erläuterungen, a draft's or an Antrag's Textgegenüberstellung;
  22.11.2026). A Regierungsvorlage's Textgegenüberstellung and its
  Erläuterungen are read from Parliament's PDF; one that yields nothing is
  „Nicht lesbar", because there a reading failed. A scan without a text
  layer stays „Nicht lesbar": that is one document's property. Kept apart
  on purpose: the verification check's own leads („Nicht geprüft:",
  „Nicht gezeigt:"), the Lesefassung's per-§ reasons, and the list's count
  line, whose clauses already say „gerade nicht abrufbar".
- **A door lands in the form** (15.11.2026). A button that sends the reader
  to file a Stellungnahme leads as close to the form as the source allows,
  never to a page from which the reader must find it. So every Parliament
  door is two buttons, „Stellungnahme als Privatperson" and „… für eine
  Organisation", each opening its form (`StatementFormDoors`,
  `statementFormUrl`, where the parameters and the item types checked
  stand). A choice instead of an instruction: a sentence telling the reader
  which button to open on Parliament's page was rejected, it hands
  Parliament's layout to the reader. An address that rests on an
  unofficial parameter must fail into a longer way, never a dead link. An
  address that carries a source's internal ids is read from the source, not
  written into code (Vorarlberg's form server, `parseVbgFormUrl`, falling
  back to the page that links it). Checked in a browser on each item type,
  not in CI: a browser test against an outside site fails for reasons that
  are not ours.
- **The monitor asks for a correction where it makes a claim of its own**
  (17.11.2026, `SectionCredits`). „Fehler melden" ends a section's credit
  line exactly when the line names something as the monitor's; a line that
  only credits publishers gets none. It opens in place, never a bare
  `mailto:` link, and is a muted item of the line, never the accent box:
  blue buttons are the doors into lawmaking.
- **Every page invites people to work with the project, in one line of
  the footer** (maintainer, 17.11.2026; `AppFooter`, `COOPERATION_DE`).
  One line and the address, no link to a longer text and no section: rows
  in the doors' grammar would be read as doors into lawmaking. It names no
  price and promises nothing.
- **Mail leaves from the reader's program, not from the server**
  (17.11.2026, `app/utils/contact.ts`): no contact form. Not built until
  readers are seen to answer the invitations; if built, it sends only to the
  monitor's own address, never a copy to an address typed in, and does not
  render where no sending path is configured.
- **The contact address is configuration**
  (`runtimeConfig.public.contactEmail`, `useContact`), as the site's
  address is: no page writes it out.
- **A pause line stands on the plain 404 and says nothing about a draft**
  (maintainer, 23.11.2026; `app/utils/pauseLines.ts`, `app/error.vue`). It
  is the one exception to „no decoration that carries no information", and
  it is kept to one place so that it stays one: not on a 410, a refusal or
  a failure, which carry information about an item, and never elsewhere on
  the site. How a line is written, and what was rejected: `pauseLines.ts`.
- **A missing page keeps the site around it; a failure stands alone**
  (maintainer, 23.11.2026; `app/error.vue`). A 404, a 410 and a refusal
  render in the site's layout, so a reader who followed an old link has
  ways on; a failure keeps the card and depends on nothing but itself:
  there the layout may be what failed.

## Rejected alternatives

- **A filter that isolates one change type.** Readers want to suppress types;
  the legend hides them (§12.17).
- **A hue per station** (03.10.2026). The party colours already take the
  free hues; violet sits too close to link blue, green means „inserted" in
  a diff, and amber and sepia carry meanings of their own. Stations differ
  by shape and ink weight. Ministries and the vote line get no hue either:
  both are led or named by parties.
- **Yellow as the action colour, or another action hue** (03.10.2026). A
  highlighter points, it does not invite, and links without their blue lost
  the one convention every reader brings. Green collides with the diff's
  inserted green, violet with link blue.
- **The stations as a horizontal stepper** (15.09.2026). The German station
  names hyphenate in the prose column („Regierungsvorla-ge").
- **„Geltendes Recht" as a station, Ausschuss and Plenum as two.** The law in
  force is no step of the procedure (it is a fact of the Entwurf, „ändert 2
  Gesetze"); readers ask what Parliament did, not which body did it.
