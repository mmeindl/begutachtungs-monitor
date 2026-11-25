---
paths:
  - "app/pages/**"
  - "app/components/{draft,entry,statements}/**"
  - "app/utils/{outcomes,deadlines,doors,entryView,statementRows}.ts"
  - "shared/utils/{promulgation,draftStations,clubs,changeShare,rvLatency}.ts"
---

# Framing and what the page may claim

What the page may claim, and in which tone: the Nachverfolgung frame binds UI
and copy everywhere. What an entry holds, and the other areas:
`docs/decisions.md`.

## Framing and what the page may claim

- **Nachverfolgung, not pillory.** Amendments after the Begutachtung are wins
  and are shown as prominently as standstill. No blame counters, no „ignored"
  rhetoric, no accusation badges.
- **Lists sort by participation, never by outcome.** Success and shelving get
  one colour; colour marks deadline urgency only. No computed „X Monate ohne
  Vorlage" column, no section that opens with failures only (§12.21, §12.28).
- **Rankings stay within one legislative period.** Across periods the list is
  a COVID monument that never changes (§12.21). At a period change the
  accountability sections fall back to the previous period as a whole and
  name it; open deadlines of the previous period are always carried over
  (§12.35, §12.36).
- **Rankings order objects, never actors.** The framing rule binds tone,
  completeness and conclusion; it does not forbid saying who issued a draft.
  Ruled out are a figure that counts only failures, a ranking that invites
  „the worst", and a conclusion the data does not carry.
- **No change figure is read as the effect of a Stellungnahme.** The ME→RV
  change rate (~98 %) separates nothing. Where the Regierungsvorlage was
  tabled on or before the Frist, the page says so under „Eingebracht":
  temporal, not causal (§12.38; `tabledBeforeFristEnd` in
  `app/utils/outcomes.ts`).
- **How much a station changed is counted once, in its comparison.** The
  legend counts the units per kind, at every station alike. No share of the
  draft in the station frame and no bar against the period's range: the
  row would repeat the legend, and the range is too wide to place a single
  draft. The measure stays in the corpus script (details: `ownChangeShare`
  in `shared/utils/changeShare.ts`).
- **A station frame holds what only it can say:** that the station was
  reached, when, and its documents. What the comparison under it shows is
  not repeated above it (17.11.2026): a count of changed Begründungen
  answers no reader's question, which is asked at one Paragraph and
  answered there, where a changed Begründung opens. The credit line under
  the comparison links the Erläuterungen. Before a row is added to a frame,
  ask whether the comparison could show it instead.
- **Copy about statements on a Regierungsvorlage says where they go** (the
  Klubs) and never what they achieve (§12.14). The ministry is not named
  (15.11.2026; why: „Open questions" below). How long the window lasts:
  `SECOND_ROUND_WINDOW` in `app/utils/spine.ts`.
- **What a reader can expect from a Stellungnahme** stands on the door card,
  closed under Parliament's quote (23.11.2026, `StatementExpectation`): it
  is no vote, who decides what is taken up, no answer is due, and a change
  can rarely be traced to one Stellungnahme. Procedure only, from
  Parliament's Fachinfo: no promise of an effect and no denial of one.
  Closed on purpose (why: in the component). On every Austrian door whose
  procedure was read, the nine Länder included (none requires an answer
  to a submitter). Not on the EU's doors: the Commission's own quote says
  what follows, and on a consultation promises a report, so „keine
  Antwort" beside it would read as a contradiction. Not on a Petition an
  den Bundesrat or a Gesetzesantrag des Bundesrates: the forms differ on
  who receives a Stellungnahme, and none was open to read, so the wording
  is not inferred. Read it when one opens. A Staatsvertrag has no form. Why:
  `docs/research/nebenwirkungen.md`.
- **Statements open newest first** (23.11.2026, maintainer's decision). A
  first row ranked by Zustimmungen puts the best-mobilised on top and reads
  as a vote. „Meiste Zustimmungen" stays one click away.
- **„Bisher keine Regierungsvorlage" only when proven.** An unread chain, a
  missing `preconst` pointer or an exhausted fetch budget shows the weakest
  state the evidence supports. Silence can be repaired, a false accusation
  cannot (§12.21, §12.26, §12.28).
- **In a closed period where no draft links beyond the Begutachtung, absence
  is an archive gap, not a finding** (§12.27).
- **„Text unverändert beschlossen" needs a text list that says so**
  (14.11.2026). No list is unknown, never „unverändert": the page then says
  „beschlossen" and nothing about the text. An Abänderungsantrag adopted in
  plenary still says „im Plenum geändert". Details: `amendedStations` in
  `app/utils/spine.ts`.
- **„Noch nicht kundgemacht" needs one of two signals:** Parliament's own
  „Keine Kundmachung" stage, or no promulgation within the window after the
  final decision (`PROMULGATION_WINDOW_DAYS`); no count at all while an
  Einspruch is undecided (14.11.2026; details: `promulgationState`,
  `finalDecisionOf` in `shared/utils/promulgation.ts`).
  A successor is named only through Parliament's own link, never by title:
  every similarity threshold added pairs from different laws (§12.10,
  §12.21, §12.33).
- **Not „not promulgated" while time can still explain it.** For ordinances
  „pending" covers the first 180 days (§12.32).
- **Club votes:** „alle Klubs dafür", never „einstimmig"; no counts derived
  from seats, no per-party scorecard. The vote covers the whole law and never
  stands as a verdict on a § or a Stellungnahme (§12.34).
- **A failed source says so; it never renders as an empty result.** An empty
  answer names what was searched. „Nothing found" for something unchecked is
  the most expensive lie the product can tell. A failed fetch never counts
  as empty and refutes nothing (§12.13, §12.31, §12.58).
- **Pages without a parliamentary Gegenstand show no statement sections,**
  and the count cell says „nicht gezählt", never 0: nobody publishes who
  filed (§12.16, §12.28).
- **The Gegenstand half and the RIS half of the corpus are never pooled into
  one total** and never share a schema with invented empty fields (§12.19,
  §12.28).
- **The length of a Frist is flagged only at both edges** („Kurze Frist",
  „Volle Frist"). Never a flag against the six-week norm alone: it would
  stand on most pages and work as a blame counter (`fristClassOf` in
  `app/utils/deadlines.ts`).
- **A number on the homepage and the same number on the page it links to
  agree.** Every change to a filter is checked against it.

## Measured figures

### The procedure

| What | Value | Sample, date |
|---|---|---|
| ME→RV text changed | XXVII 98.9 %, XXVI 97.0 % | 274/277, 98/101 · 27.09.2026 (§12.38) |
| Change share of a draft's own provisions, p25 / median / p75 | XXVII 46 / 63 / 77 %, XXVI 35 / 50 / 73 % | 03.10.2026 (§12.38, §12.40) |
| Fristende → first RV | median 40 days, p90 189 | GP XXVII (§12.23) |
| Nationalrat decision → promulgation | median 20 days, p90 29, max 82 | 84 laws, GP XXVIII · 03.10.2026 (§12.21) |
| Drafts changed again in Parliament after the RV | 52 of 91 | GP XXVIII (§12.18) |
| Regierungsvorlagen whose Erläuterungen say what became of the Begutachtung | 0 of 17 | 17 with readable Erläuterungen, GP XXVIII · 08.09.2026 |
| Largest Begutachtung | XXVII 106,184 statements, XXVIII 846 | (§12.21) |
| Ordinance, Frist → BGBl II | median 57 days, p90 179, max 538 | 22.10.2026 (§12.32) |

## Rejected alternatives

- **KPI tiles or a summary sentence on the homepage.** No user question asks
  for those numbers; a number stands at what it counts (§12.20).
- **„X % ohne Begutachtung" or „X drafts changed" as a headline.** A
  scoreboard without a win side (§12.20).
- **Measuring a weight or effect of statements on a Vorlage.** Committee
  changes are common with or without statements (§12.14).
- **A party axis.** The sources carry no party; „blocking" is not observable
  (a Begutachtung without a Vorlage covers coalition disputes, elections,
  changed EU law, merged drafts and rightly withdrawn ones); and before
  Parliament only governing parties appear.
- **A threshold on the new period's age for carrying over open deadlines.**
  Every threshold would have been wrong at one of the last two changes
  (§12.36).

## Open questions

- **Does a Stellungnahme on a Regierungsvorlage reach the ministry?**
  (15.11.2026, `docs/research/stellungnahmen-empfaenger.md`) Parliament's
  general pages say released Stellungnahmen go to the Klubs and the
  responsible ministry, for every kind of item; its form on a
  Regierungsvorlage, an Ausschussantrag, a Petition and a Bürgerinitiative
  names the Klubs only. Until the Parlamentsdirektion answers, the site names
  the Klubs alone after the Begutachtung.
- **Outcome claims in periods with partial linkage.** `chainCoverageOf`
  silences outcome claims only where no draft of a closed period links
  beyond the Begutachtung. Where only some do, a missing link cannot be told
  from a draft that stalled: sampled at eight drafts per period, links first
  appear in GP XVIII (3 of 8) and are reliable from GP XX (7 of 8;
  `docs/api-exploration.md`, „Both corpora are well populated from GP XVI
  on"). In between, „keine Regierungsvorlage" may be an archive gap. The
  code has no period floor for it.
