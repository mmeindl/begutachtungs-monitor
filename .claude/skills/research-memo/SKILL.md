---
name: research-memo
description: Research a new source, country, Land, data set, participation route or stage of lawmaking before anything is built for the Begutachtungs-Monitor. Check the licence first, write a sourced German memo in docs/research/, offer options with costs, stop and report, then write an implementation plan once the maintainer has decided. Use when the maintainer asks "can we follow X?", "what would it take to add Germany / the EU cycle / this register?", "research whether…" or "why is X not possible?", and before writing a reader for any source the monitor does not read yet.
---

# Research memo

Every new source has started with research, and research comes before code.
A source the monitor shows has to have its licence checked and stated
(CLAUDE.md, "Legal"). A "no" has to carry a reason a layperson can judge.
Germany, the EU cycle and the remaining routes on `/wege` all start here.

**Status: provisional.** See the last section.

## 1. Read what exists

- `CLAUDE.md` in full.
- The area files of `docs/decisions/` the question touches. For a new route
  or stage, that is `routes.md`, "Routes to a norm, and what the monitor
  follows".
- `docs/research/`: an earlier memo may already answer half of it. Extend it
  rather than starting a parallel one.
- `docs/api-exploration.md` for known upstream traps.
- For a question about Austrian legislative procedure, Parliament's research
  service first. It publishes short, authoritative papers at
  `parlament.gv.at/fachinfos/rlw/` and `parlament.gv.at/fachdossiers/`. A
  question an expert can answer with a link to their own institution's page
  wastes the contact. A route the research service already describes can
  also overturn a headline figure.

## 2. Licence first

Before measuring anything, find out for each source:

- which licence covers what you would show;
- the licence sentence, quoted, with its URL;
- whether anything is excluded (Parliament excludes everything about
  Stellungnahmen, for example).

No licence found is a finding. Put it at the top of the report, because it
can stop everything else. Never assume CC BY.

## 3. Probe gently

- A few requests, cached locally, at 1 per second at most. Some sites sit
  behind firewalls that block bursts.
- Send no personal data in requests.
- Skip pages that name private persons. Say that you did.

## 4. Measure what decides

- the stages and the keys that join them to what the monitor already
  follows;
- where people can take part, and until when;
- volume: how many items per year, and how far back;
- running cost, since anyone must be able to run a copy for under €100 a
  year.

Every claim gets its source. Anything unchecked is marked „nicht belegt".
Anything impossible says why, in words a layperson can judge.

## 5. Write the memo

The memo is German, in `docs/research/<topic>.md`, with this structure:

1. Frage
2. Kurze Antwort
3. Lizenz (per source)
4. Quellen (table)
5. Befunde
6. Optionen: three per open item, each with its cost and a recommendation
7. Offene Fragen
8. Nicht geprüft

The memo is public. No names from private correspondence go in it. A source
told us something "auf Anfrage, <Datum>", without naming who.

## 6. Stop and report

Report in English: the recommendation first, then the decisions, numbered,
so the maintainer can answer "1. A 2. B". Do not build.

## 7. After the decisions

- Write `docs/research/umsetzungsplan-<topic>.md` with a „Stand des Baus"
  section that the build keeps current.
- Build only after approval. Implementation goes to Opus agents. The lead
  reviews and re-measures.
- Rules that outlive the plan go into their area file in `docs/decisions/`.

## Provisional: refine on first use

This skill was written from six sessions (EU cycle, Länder and EP petitions,
Volksbegehren, routes outside the stations). The first time you use it:

- follow it as written;
- note where reality differed: a missing step, a wrong order, a structure
  that did not fit the source;
- at the end of the session, propose concrete edits to this file to the
  maintainer;
- once a run has confirmed it, remove this section.
