# Why this tool?

Everything the Begutachtungs-Monitor shows comes from official sources:
Parliament, the federal legal information system (RIS), the nine Länder and
the EU's publications office. It replaces none of them.

The difference is the question each site answers. **The official sites are
archives**: everything is on record, organised per item, built for people who
already know the procedure and its vocabulary. **The monitor is a lens**: it
answers one question, *what became of this draft and of the public's input?*,
for people who do not work in the building: citizens, journalists, NGOs and
the people who filed a Stellungnahme.

It answers in both directions, and shows where a draft changed as prominently
as where nothing happened.

## What the monitor adds

### 1. The whole chain on one page

On parlament.gv.at a Ministerialentwurf's page mentions the resulting
Regierungsvorlage only as a row in the procedural history, and the
promulgated law does not appear there at all. Answering "what became of this
draft?" takes several pages and the knowledge that the hops exist.

The monitor shows the chain on one page, in plain language: Begutachtung,
Regierungsvorlage, the versions in Parliament, the Bundesgesetzblatt. Where a
station does not exist, it says so; where it could not find out, it says that
instead.

### 2. What changed, section by section

No official site compares two versions of a draft. The monitor compares any
two stations of a procedure, paragraph by paragraph, inline or side by side,
aligned by heading so that a merely renumbered § reads as unchanged. Beside a
changed paragraph stands the ministry's own reasoning for it, taken from the
Erläuterungen (attached for 76 % of the paragraphs measured).

This matters after the Regierungsvorlage too: 52 of 91 drafts of the current
period were changed again in Parliament.

### 3. How the law would read

A draft that amends a law is a list of instructions ("in § 5 Abs. 2 wird das
Wort … ersetzt"). The monitor shows the resulting text of the changed
paragraphs, but only where the ministry's own Textgegenüberstellung confirms
it. Of 108 paragraphs confirmed that way and later enacted, none deviated
from the enacted text. What cannot be confirmed is listed as not shown, with
the reason.

### 4. Statements, counted

Parliament lists statements as a paginated list; one draft had 707 entries.
The monitor counts them, separates organisations from private persons and
non-public statements, and sorts by endorsements. Private persons appear only
as a count, never by name. Statement texts stay where they are: linked, never
copied.

### 5. Two federal sources, and the gap between them

A federal consultation is published in two places: at Parliament (the
procedure) and in RIS (the texts). Neither list is complete. Across the whole
XXVII. period, 12 of 350 Ministerialentwürfe have no RIS record.
Consultations on draft ordinances appear in RIS only
and make up about two thirds of its consultation records. Anyone watching one
source misses consultations, and neither source says when.

The monitor reads both, joins them, and says per draft which source knows it.

### 6. The Länder

Each of the nine Länder publishes its drafts on its own site, in its own
format. The monitor lists them beside the federal ones, with deadlines and,
where a Land publishes them, statements, the comparison and the promulgated
law. The Länder differ widely in what they publish; where a Land does not
publish a document, the page names that as the reason.

### 7. Where a draft comes from

Many drafts carry out EU law, and many Länder drafts carry out a federal law.
The monitor shows which EU act a draft transposes and, starting from the act,
which federal and Länder drafts carry it out.

### 8. Laws that had no Begutachtung

A consultation site shows only what was consulted. The monitor also lists the
laws that were passed without one: 57 of 205 federal laws of the current
period, and 8 more with a consultation by the committee only.

### 9. Finding and following without an account

- Full-text search across the documents of all running consultations.
- A calendar subscription (`/kalender.ics`) that puts every deadline into the
  calendar people already use, and a feed of new consultations (`/feed.xml`),
  each also per Land.
- No account, no e-mail address, no tracking, no cookies.

The figures above and how they were measured: `docs/decisions.md`, section 2.

## Why it should work

1. **Standstill becomes visible at no cost.** Journalists, members of
   parliament and organisations that filed a Stellungnahme already ask what
   became of a draft. The monitor gives them the answer without a day of
   research; it does not replace them.
2. **Base rates across many procedures.** How often drafts change after the
   Begutachtung, how long each station takes, how often there is no
   Begutachtung at all: such figures are the evidence a debate about a duty
   to respond to statements needs.
3. **Feedback to the people who took part.** A tool that only counted what
   went nowhere would teach that taking part is pointless. Ministries do
   amend drafts after the Begutachtung, routinely, and nobody could see it.
   Showing where a draft changed is what makes the next Stellungnahme worth
   writing.

A transparency tool has an effect when someone acts on what it shows. On its
own it changes nothing.

## Where it comes from

OffenesParlament.at (Forum Informationsfreiheit) covered Ministerialentwürfe
in Begutachtung with a scraper and e-mail alerts. It never left beta and has
been offline for years; its
[repository](https://github.com/Forum-Informationsfreiheit/OffenesParlament)
was archived in April 2026. The monitor rebuilds that slice on the official
interfaces and adds what follows the consultation.

## What it does not do

- **E-mail alerts.** They need stored addresses and consent, and someone to
  operate them. The calendar and the feed are the substitute.
- **A statistics view across procedures.** The base rates are measured and
  published in `docs/decisions.md`; on the site a draft's share of changed
  provisions is set against its period, and there is no page of its own yet.
- **Summaries of what the statements say.** The monitor counts statements and
  links them; it does not read them.
- **Announced consultations.** No source lists a consultation before it
  starts.
- **Other countries.** Austria is the first; Germany is next.
- **Judge.** No scores, no rankings by outcome, and no figure presented as
  the effect of a Stellungnahme.

Which licence applies to which source is stated on the site:
[Impressum](https://begutachtungs-monitor.at/impressum#imp-license).
