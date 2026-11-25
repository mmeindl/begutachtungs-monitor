---
paths:
  - "server/utils/parliament/{privacy,list142,orgAllowlist,organisations}.ts"
  - "server/utils/zaehlung/**"
  - "scripts/audit/classifier.ts"
  - "server/utils/annex/annexSource.ts"
  - "app/pages/{impressum,datenschutz,quellen,ueber,datenlage,statistik}.vue"
  - "server/plugins/zaehlung.ts"
  - "server/api/statistik.get.ts"
  - "server/api/stellungnahmen/**"
---

# Privacy, licences and the prose pages

Who is named and who is not, which licence covers what, and which prose page
says which fact. The legal locks themselves stand in CLAUDE.md, „Legal". What
an entry holds, and the other areas: `docs/decisions.md`.

## The prose pages and the monitor's own texts

- **Each of the prose pages has one job, and a fact stands on one of them**
  (16.11.2026). `/impressum`: the disclosure under § 25 MedienG. `/quellen`:
  which source is read and under which licence, one entry per source.
  `/datenschutz`: what is processed, and in `#names` who is named and
  who is not, for every source. `/datenlage`: what a source publishes.
  `/genauigkeit` (19.11.2026): how the monitor's comparisons are checked,
  how often they hold, and which faults the checks do not catch — what the
  monitor makes of a source, beside what the source publishes. The short
  „Methode" at each comparison stays, because it is about that document, and
  links there for the measurement.
  `/ueber`: what the monitor is, its limits, how to subscribe and support.
  The others link there instead of repeating it: a fact stated in two
  places drifts apart, as the licences on `/ueber` and in the Impressum
  did. `/impressum#license` stays as a short section, because a fragment
  cannot be redirected and the old `#imp-license` is linked from outside
  (`docs/decisions/foundations.md`, „A section's anchor does not repeat its
  page").
- **The monitor's own texts are CC BY 4.0** (16.11.2026, decided by the
  maintainer; `/quellen#eigene-texte`): explanations, method texts, the
  descriptions of routes and of the Datenlage. Not the material of the
  sources, which keeps its own terms, and not the name or the § mark. The
  code stays AGPL-3.0-or-later. The grant cannot be withdrawn for what was
  published under it.

## Privacy

- **No private person is named.** The pipeline filters on the server, before
  anything reaches the SSR payload. When in doubt a submitter is a person: an
  organisation shown as „Privatperson" is a cosmetic bug, a published name is
  a legal risk.
- **The naming segment decides.** „Nachname, Vorname; Universität Salzburg"
  is a person with an affiliation. A person attached behind an organisation's
  name is cut off; an e.U. counts as a natural person (§12.14).
- **List 142's institution flag can withhold a name but never publish one on
  its own.** It records how the submitter registered and also marks persons
  and law firms under a lawyer's name (§12.14). `P` hides a name, `I` alone
  publishes nothing, and `ORG_ALLOWLIST` outranks the flag: it is a person's
  statement that a name is an organisation whose staff registered privately
  (`classifySubmitter`).
- **A stored name is held against today's classifier** before it is served:
  a record outlives the rules that wrote it.
- **A change to `privacy.ts` is validated by a corpus comparison, not by
  tests:** old against new over every list-142 row, every newly public name
  read by hand. Tests alone have missed real leaks (§12.14). How: classify
  the rows with HEAD's `privacy.ts` (a copy in the scratchpad) and with the
  changed one, for the current and the previous period, over
  `{BEZUG_GP_CODE, BEZUG_ITYP, TYP: ["I"]}`. That filter keeps a period
  under the 100,000-row cap (GP XXVII/ME: 8,611 rows instead of the first
  100,000 of 235,864) and still holds every row a rule can publish, since
  the `P` veto hides the rest. Print every newly public string unmasked
  (each must be an organisation) and every newly hidden one with its naming
  segment masked (each should be a person), and repeat until both lists are
  clean. A count of „person-shaped" strings is a floor: short organisation
  names look like persons. `pnpm audit:classifier` finds candidates; it does
  not make this comparison.
- **Above the fetch cap, the rows that are not organisations are not called
  „Privatpersonen":** 955 of the 3,459 person rows in GP XXVIII are
  non-public statements (§12.14).
- **Statement texts and covering letters are linked, never fetched or
  parsed.** Covering letters are mostly scans, and the readable ones name an
  official's personal service address (§12.16).
- **Page views are counted, visitors are not.** Daily sums per page class and
  referring host; no address, no hash, no cookie, no per-request line
  (§12.65). Fetches of the feed and the calendar are counted apart and
  never added to the page views: readers and calendar apps ask on a timer.
  `/statistik` shows every counted day. The oldest day file is
  left out of every figure: counting starts inside that day, so it is always
  cut short (a rule, not a date, so a copy drops its own). A referring host
  is shown only from five visits, summed over the whole history.

## Measured figures

| What | Value | Sample, date |
|---|---|---|
| List 142 flag agrees with the name heuristic | 96.8 / 99.7 / 94.2 % | 106,626 rows · 16.09.2026 |

## Rejected alternatives

### Privacy

- **Extending the e.U. rule to GmbH, AG, OG and KG.** It hid 95 strings,
  among them Flughafen Wien AG (§12.14).

## Open questions

- **Licence.** Whether Parliament's „die Dokumente selbst sind freie Werke"
  holds for a Ministerialentwurf's documents too, and what covers the
  metadata of the Begutachtung lists. Until answered, the lock in
  CLAUDE.md („Legal") holds; the order itself is the rule „Licence decides
  the source order, not completeness" (`docs/decisions/annex.md`).
- **The basis for reading the Länder's documents** (15.11.2026,
  `docs/research/amtliche-werke-landesdokumente.md`): drafts, Erläuterungen
  and Vorlagen of a Land are most likely free works (§ 7 Abs. 1 UrhG);
  statements of third parties are not. Two points rest on our own
  reasoning and wait for a lawyer: whether a Begutachtungsentwurf counts
  as an official work, also one that never became law, and whether the
  database right (§ 76d UrhG) stands against reading a Land's register
  systematically.
