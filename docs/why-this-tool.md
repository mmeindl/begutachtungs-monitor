# Why this tool? — What the monitor adds over parlament.gv.at

Everything the Begutachtungs-Monitor shows comes from the Austrian
Parliament's own open interfaces (CC BY 4.0). The record there is complete
and authoritative, and the full texts of all documents live there — this
project does not replace parlament.gv.at and does not want to.

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

## What the monitor does not do yet (roadmap, in order)

1. **Text diff ME → RV** — showing *what* changed after the consultation,
   not just *that* a next stage exists. Available nowhere today; the core of
   the accountability layer.
2. **E-mail deadline alerts** — the predecessor's (OffenesParlament.at)
   most-loved feature. The account-free tier already exists: an RSS feed of
   new consultations (`/feed.xml`) and a subscribable deadline calendar
   (`/kalender.ics`); e-mail needs persistence and consent flows and comes
   with grant funding.
3. **Base rates across procedures** — the statistical layer described above.
4. **Statement-corpus synthesis** (clustering/summarizing large statement
   corpora) — stage 2, only with a research partner, because the full texts
   are excluded from the open-data license and require the § 42h UrhG
   text-and-data-mining exception.

## Non-goals

- Replacing or mirroring parlament.gv.at — links lead upstream everywhere;
  the full texts of drafts and statements are read there.
- Publishing anything about private individuals beyond aggregate counts.
- Scoring or shaming: the monitor tracks outcomes in both directions. Where
  ministries amend drafts after consultation — which happens routinely — the
  monitor makes that visible with the same prominence as input that went
  nowhere.
