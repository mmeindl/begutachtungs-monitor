# Why this tool? — What the monitor adds over parlament.gv.at

Everything the Begutachtungs-Monitor shows comes from official sources: the
Austrian Parliament's own filter interfaces and the RIS Open-Government-Data
API of the Bundeskanzleramt. **The licence differs per source**, and the site
states which applies where (`/impressum#imp-license`): the RIS data — draft
texts, Textgegenüberstellung, Bundesrecht — is CC BY 4.0, as are the
Parliament datasets for the stations *after* the consultation; the
Begutachtungsverfahren itself is expressly excluded from open-data reuse by
Parliament's own licence page, which is one reason this tool stays
metadata-only there.

The full texts of all documents live upstream — this project does not replace
parlament.gv.at and does not want to.

The difference is the question each site answers. **parlament.gv.at is an
archive**: everything is on record, organized per item (Gegenstand), built
for people who already know the procedure and its vocabulary. **The monitor
is a lens**: it answers one question — *what became of the public's input?* —
for people who don't work in the building: citizens, journalists, NGOs,
submitters.

In one sentence: *the Parliament archives; the monitor answers — in both
directions, showing where input changed a draft just as prominently as where
it did not.*

## The concrete differences

Verified 2026-08-23 against a real procedure (8/ME, XXVIII. GP — the
"Bundestrojaner" package, and 88/ME, the VAT reduction with 707 statements).
Differences 1 (comparison) and 5 (the two sources) were added later and rest
on their own corpus measurements: `docs/ris-join.md` for the join and its
gaps, `docs/architecture.md` §12.13 for the Textgegenüberstellung.

### 1. The whole chain on one page

On parlament.gv.at, a Ministerialentwurf's page mentions the resulting
Regierungsvorlage only as a row inside the procedural-history table, and the
promulgated law (BGBl) does not appear on the ME page at all — it is only
linked from the RV's own page. Answering "what became of this draft?" is a
multi-page navigation that requires knowing the hops exist.

The monitor shows the full chain — Ministerialentwurf → Regierungsvorlage →
Bundesgesetzblatt (with the RIS link) — on one page, labeled in plain
language, for every consultation where it exists. Where no RV exists, it says
so explicitly; a draft that went nowhere is part of the answer too.

Since September 2026 it also shows *what* changed between the first two
stations: a paragraph-by-paragraph comparison of the draft against the
Regierungsvorlage, aligned by heading rather than by number so a merely
renumbered § compares as unchanged — plus the ministry's own
Textgegenüberstellung, which says what the law reads today and what the draft
would make of it, on the same page for the drafts that carry one. Both are
rendered inline, one passage with the changed words marked; a side-by-side
mode and expandable context are on the roadmap below. What is not compared
yet are the stations *after* the Regierungsvorlage, where a consultation
result can still be undone.

### 2. Statement aggregation

Parliament lists submissions as a raw, paginated list — for 88/ME that is
707 entries. There is no count by submitter type, no extraction of which
organisations took part, and no ranking by endorsements ("Zustimmungen").

The monitor aggregates: total counts, the split between organisations,
private persons, and non-public submissions, and the most-endorsed
organisations at a glance — deliberately privacy-preserving (organisations
are named; private persons appear only in aggregate, never by name; full
texts are never copied and remain on parlament.gv.at).

### 3. Audience and legibility

The upstream filter UI is insider tooling: procedure jargon, no deadline
emphasis, no stable, shareable, plain-language page per consultation. The
monitor leads with what a non-insider needs — open consultations, days until
the deadline, what the draft is about in plain terms — on clean URLs that a
journalist can cite or an NGO can send to its members, with accessibility
(WCAG AAA targets) and zero tracking.

### 4. The cross-procedure view

Everything upstream is organized per Gegenstand. Questions across
procedures — "how many consultations are open right now?", "how often do
drafts change after Begutachtung, per ministry, across hundreds of
procedures?" — are structurally impossible to answer there. The monitor's
dashboard is that view; the base-rate statistics are on the roadmap and are
the evidence layer this project ultimately exists for.

### 5. Two official sources, and the gaps between them

An Austrian consultation is published in two places: at Parliament (the
procedure — arrival, deadline, statements, the later stations) and in the
RIS `Begut` application of the Bundeskanzleramt (the texts — draft,
Erläuterungen, Textgegenüberstellung). Neither list is complete. Measured
across the whole XXVII. legislative period: **12 of 350 Ministerialentwürfe
have no RIS record at all**, and one RIS draft bill has no Parliament item in
that window (it was published twelve days before the period ended, so it may
belong to the next one). Anyone watching a single source will eventually miss
a consultation, and neither source says when that happens.

The monitor reads both, joins them on a tested composite key
(`docs/ris-join.md`) and says per consultation which source knows it — "im
RIS nicht veröffentlicht" is a displayed state, not an error. The join is
also what puts the ministry's own Textgegenüberstellung on the page.

**One gap is still open and worth naming here:** RIS also publishes
consultations on **Verordnungsentwürfe**, which never reach Parliament's list
— in the XXVII. window 624 of them against 342 draft bills. Until they are
covered (roadmap below), "currently open" on this site means *draft bills*,
not every consultation running in the country.

### 6. Subscription without accounts

Following consultations upstream means re-checking the filter page; there
is no subscribable calendar of consultation deadlines. The monitor offers
one (`/kalender.ics`, webcal): every Begutachtungsfrist lands in the
calendar people already use, as an all-day event that updates itself when
a deadline is extended — plus an RSS feed of new consultations
(`/feed.xml`) for any feed reader. No account, no e-mail address, no
tracking.

## What the monitor does not do yet (roadmap, in order)

1. **Consultations on Verordnungsentwürfe** — see difference 5. The larger
   half by count, published in RIS only, and invisible here today.
2. **The Erläuterungen beside the paragraph they explain** — the ministry's
   reasoning is linked as a document and not read. Its besonderer Teil is
   written per amendment instruction ("Zu Z 4 (§ 54c …)"), i.e. addressed at
   exactly the units the comparison already builds, so it can stand next to
   them instead of in a separate PDF. This is the step that turns "what
   changed" into "why, according to the ministry" — and it is what makes a
   relevance decision possible without reading the whole package.
3. **Comparison beyond the Regierungsvorlage** — committee version, plenary
   version, promulgated law. The same engine with different inputs; the
   late, wholesale amendment is the classic way a consultation result
   disappears, and nobody watches that seam.
4. **Reading modes for the comparison** — a side-by-side mode next to the
   inline one, and unchanged passages expandable where they stand instead of
   only through the filter. A wholly rewritten § is where inline reads
   worst, and that is exactly the § worth reading.
5. **E-mail deadline alerts** — the predecessor's (OffenesParlament.at)
   most-loved feature. The account-free tier already exists (see
   difference 6); e-mail needs persistence and consent flows and comes
   with grant funding.
6. **Base rates across procedures** — the statistical layer described above.
7. **Statement-corpus synthesis** (clustering/summarizing large statement
   corpora) — stage 2, only with a research partner. The reason is not the
   open-data licence: Parliament does not hold the rights to the statements,
   so no licence of theirs could cover them either way. It is the authors'
   own copyright — a Stellungnahme belongs to the chamber, Land, NGO or
   person who wrote it — that puts machine reading of the corpus under the
   § 42h UrhG text-and-data-mining exception, and its research variant is
   the one that cannot be signed away in terms of use.

## Non-goals

- Replacing or mirroring parlament.gv.at — links lead upstream everywhere;
  the full texts of drafts and statements are read there.
- Publishing anything about private individuals beyond aggregate counts.
- Scoring or shaming: the monitor tracks outcomes in both directions. Where
  ministries amend drafts after consultation — which happens routinely — the
  monitor makes that visible with the same prominence as input that went
  nowhere.
