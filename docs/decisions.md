# Decisions

What binds future work and cannot be read off the code: standing rules, the
measurements that carry the product's claims, and alternatives that were
tried and rejected. They stand in one file per area under `docs/decisions/`.
Each area file holds its area's rules, measured figures, rejected
alternatives and open questions together. Its frontmatter names the code it
governs, and `.claude/rules/` links to it, so Claude Code loads the file when
it reads or edits that code.

The numbers in parentheses (§12.31) are sections of `docs/architecture.md`,
the change-by-change log this record replaced. It is kept under a tag, as are
`docs/ris-join.md` (the reasoning behind each weight of the RIS↔Parliament
join is in `server/utils/ris/risJoin.ts`) and an earlier, longer version of
`docs/api-exploration.md`:

```sh
git show architecture-archive-2026-11:docs/architecture.md
git show ris-join-archive-2026-11:docs/ris-join.md
git show api-exploration-archive-2026-11:docs/api-exploration.md
```

The story of a change belongs in its commit message. A rule that outlives the
change belongs in the area file it governs.

**What an entry holds:** the rule, one reason, and a pointer to the code or
the measurement. What a change moved (counts before and after), the
calibration of a threshold and the history of a bug stay in the commit
message or at the constant. A figure enters an area's „Measured figures"
where the product or a rule stands on it, never as the delta of one fix. A
rejected alternative gets an entry of its own only where it carries a reason
the rule does not.

In the figures, dates are the day of measurement. GP = Gesetzgebungsperiode,
ME = Ministerialentwurf, RV = Regierungsvorlage.

## The areas

| File | What it holds |
|---|---|
| `docs/decisions/foundations.md` | What the product runs on, upstream sources, addresses, language models, feeds and calendars, operations |
| `docs/decisions/legal.md` | Privacy, the prose pages' jobs, the monitor's own licence, open licence questions |
| `docs/decisions/framing.md` | Framing and what the page may claim; the procedure's figures |
| `docs/decisions/ui.md` | The detail pages, design and accessibility, the gap lead words |
| `docs/decisions/lists.md` | The lists and the homepage, „Ohne Entwurf" and the select „Art", the span select, search |
| `docs/decisions/parliament.md` | „Ohne Begutachtung" in the Bund, the joins, Parliament's items and how they are read |
| `docs/decisions/comparison.md` | The § comparison, the Begründungen, Erläuterungen read from a PDF, a new law's text |
| `docs/decisions/lesefassung.md` | The consolidated reading: engine, oracle and bench figures |
| `docs/decisions/annex.md` | The ministry's Textgegenüberstellung: principles, readers, gate |
| `docs/decisions/draft-check.md` | The annex held word for word against the draft, the Vermerk, the check's known limits |
| `docs/decisions/measuring.md` | The harnesses and the bench, what a round must pass, `/genauigkeit` |
| `docs/decisions/laender.md` | The Länder |
| `docs/decisions/eu.md` | EU law and federal law carried out by the Länder |
| `docs/decisions/eu-feedback.md` | Who gave feedback on the Commission's portal |
| `docs/decisions/routes.md` | Routes to a norm, and what the monitor follows |
| `docs/decisions/anliegen.md` | Anliegen an das Parlament |

Procedures (committing, a measuring round, handing over a UI change,
researching a source) are skills in `.claude/skills/`, not entries here.

## Where the former sections went

Until 25.11.2026 this file held every entry, in four parts. A reference of
the form `docs/decisions.md, „X"` finds its section here; one that names an
entry by its bold title finds it with `grep -rn "X" docs/decisions/`.

| Former section | Now in |
|---|---|
| Foundations | `foundations.md`; the prose pages and the monitor's own texts in `legal.md` |
| Privacy | `legal.md` |
| Framing and what the page may claim | `framing.md`; the station tabs and the homepage in `lists.md` |
| Ohne Begutachtung | `parliament.md`; Salzburg, the other Länder and what a Land law changed in `laender.md`; the select „Art" in `lists.md`; Erläuterungen read from a PDF in `comparison.md` |
| Joins | `parliament.md` |
| Comparisons | `comparison.md` |
| The consolidated reading (Lesefassung) and the annex | `lesefassung.md`, `annex.md`, `draft-check.md`; the reviewer attack in the `harness-round` skill |
| Measuring | `measuring.md`; „Before a parser change" in the `harness-round` skill |
| Länder | `laender.md`; the span select in `lists.md`; upstream blocks and `robots.txt` in `foundations.md` |
| EU law and federal law carried out by the Länder | `eu.md`; the feedback list in `eu-feedback.md` |
| Routes to a norm, and what the monitor follows | `routes.md`; Parliament's items and their readers in `parliament.md`; a new law's text in `comparison.md` |
| Anliegen an den Nationalrat | `anliegen.md`; „The EU cycle starts with a licence check" in `eu.md` |
| Language models | `foundations.md` |
| Search | `lists.md` |
| The detail pages | `ui.md` |
| Design and accessibility | `ui.md` |
| Feeds and calendars | `foundations.md` |
| Operations | `foundations.md` |
| Measured figures: The procedure | `framing.md` |
| Measured figures: The corpus | `parliament.md`; the list-142 flag in `legal.md` |
| Measured figures: The monitor's own accuracy and coverage | `parliament.md`; rows in `laender.md`, `comparison.md`, `lists.md` |
| Measured figures: What becomes of a draft | `parliament.md`; the reasoning's change in `comparison.md` |
| Measured figures: The consolidated reading and the annex | `lesefassung.md`, `annex.md`, `draft-check.md`; the § comparison's rows in `comparison.md` |
| Measured figures: Länder, EU law, federal law carried out by the Länder | `eu.md` and `laender.md` |
| Measured figures: Laws without a Begutachtung | `parliament.md`, `laender.md`, `comparison.md`, `annex.md` |
| Measured figures: Anliegen an den Nationalrat | `anliegen.md`; the ordinance join in `parliament.md` |
| Rejected: The engine and the annex | `lesefassung.md`, `annex.md`, `draft-check.md`; the health endpoint in `foundations.md` |
| Rejected: The draft check's known limits | `draft-check.md`, „Known limits" |
| Rejected: Länder and EU | `laender.md` and `eu.md` |
| Rejected: Operations and data | `foundations.md`; search in `lists.md` |
| Rejected: Privacy | `legal.md` |
| Rejected: Framing | `framing.md` |
| Rejected: Joins and comparisons | `parliament.md`, `comparison.md`; LGBl matching in `laender.md`; open deadlines at a period change in `framing.md` |
| Rejected: Interface | `ui.md`; the span and list items in `lists.md`; „Ganzer Paragraph danach" in `lesefassung.md`; renaming `/entwuerfe` in `foundations.md` |
| Open questions | the open questions of `legal.md`, `framing.md`, `parliament.md`, `annex.md` |
