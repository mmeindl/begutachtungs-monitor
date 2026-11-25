# CLAUDE.md

Rules, measurements and rejected alternatives: `docs/decisions.md`. Read the
relevant section before changing an area. Research memos that answer one
question once go to `docs/research/`. Procedures (committing and deploying,
handing over a UI change, a measuring round, researching a new source) are
skills in `.claude/skills/`.

## What this is

Begutachtungs-Monitor: an open-source tool that follows a law through its
making and shows people where and how they can take part. Motto: *view your
state – state your view*. Live at https://begutachtungs-monitor.at.

- **Language:** the UI is German today; English follows soon. New code keeps
  copy where a second language can replace it, not scattered through logic.
- **Name:** the site moves to `viewyourstate.org/at`. The address comes from
  `runtimeConfig.public.siteUrl`; no new code writes a host name or assumes
  the site sits at the root path.

- **Goal:** follow a law from the EU draft through the national level to the
  regions, in every EU country and the important European ones, and make
  taking part in lawmaking easier.
- **Today:** Austria, the first country and the test of the idea: the Bund's
  Begutachtungsverfahren, the nine Länder, and the EU act a draft carries out.
  The core is the accountability layer: what became of a draft and of the
  input to it (Ministerialentwurf → Regierungsvorlage → law), section by
  section.
- **Next:** Germany. It has no central source for drafts (each ministry
  publishes its own), so expect a source per publisher, as with the Länder.
- **Also next:** the routes to a norm that `/wege` shows but the monitor does
  not follow yet. Before building one, read `docs/decisions.md`, "Routes to a
  norm, and what the monitor follows", and the last section of
  `docs/research/wege-zu-einer-rechtsnorm.md`.
- **Therefore:** nothing new hardcodes Austria where configuration would do.
  Countries become path segments (`/at`, `/de`), not separate codebases.

Why the tool exists and why it should work: `docs/why-this-tool.md`.

## Non-negotiables

### Private information is never committed

- `private/` is gitignored and exists only on the maintainer's machine: the
  to-do list, the timeline, outreach and correspondence, grant and Verein
  papers. They stay that way. Nothing from them is copied into code, docs,
  comments, commit messages or pull requests.
- Public files carry the reasoning, never who said it or how: no names, no
  quotes and no paraphrase that identifies the sender of private
  correspondence or a conversation.
- No personal data, credentials, e-mail addresses or server details in the
  repository. Before every commit, read the staged diff for exactly this.
- When unsure whether something is private, treat it as private and ask the
  maintainer (Manu).

### Legal: licences and data protection

- **Private persons are counted, never named.** The filter runs on the
  server, before anything reaches the SSR payload; in doubt a submitter is a
  person. What is named and what is not changes only with the maintainer.
- **After every change to `server/utils/parliament/privacy.ts`,** run the old
  and the new classifier over every list-142 row and read every newly public
  name by hand; `pnpm audit:classifier` reviews the new one's verdicts. Tests
  alone have missed real leaks.
- **The licence differs per source, and the site says which applies where**
  (`/quellen`, credit lines at the content). RIS open data is
  CC BY 4.0. On Parliament's side the result lists and API data of the
  stations after the Begutachtung are CC BY, their documents are free works,
  the Begutachtung data itself carries no grant, and everything about
  Stellungnahmen is excluded from reuse. Never write a blanket CC BY claim.
- **Where a document exists in both sources, RIS is read first**
  (`annexSourceFor`). That order and `READ_PARLIAMENT_COPY` do not move while
  the licence question is open (`docs/decisions.md`, "Open questions").
- **Statement texts are linked, never fetched or parsed** by the product.
  Machine reading of statement texts happens only under the text-and-data-mining
  exception (§ 42h UrhG).
- **A new source (a Land, a country, a dataset) ships only with its licence
  checked and stated** on `/quellen`.
- **No third-party resources at runtime:** no web fonts, CDN, analytics
  service or third-party cookie. The one cookie is our own, `quellen`, set
  only when a reader changes the sources of a list. Page views are counted,
  visitors are not.
- **Every code change, wherever it is made, is held against the legal
  pages:** `/impressum`, `/datenschutz`, `/quellen` and `/ueber`. If it could
  make a sentence there untrue or leave something unsaid, read the pages and
  adjust them in the same change. Typical causes: a new or changed source, a
  field or a name newly shown or withheld, anything stored, cached or
  counted, a cookie, a third party, hosting, money, a feature added or
  removed. Each fact stands on one page (`docs/decisions.md`, "Each of the
  prose pages has one job").
- An edit to a legal page is named to the maintainer with its old and new
  wording, never made in passing. What the pages claim in law (a licence, a
  legal basis, who is named) changes only with the maintainer's decision.

### Say what cannot be shown, and why

- Wherever the monitor follows a law and cannot show a step, the page says so
  and names the reason: a Land that does not publish the document, a source
  that failed, a text that could not be read. A gap never renders as an empty
  result, a zero or silence.
- A comparison shows only what is verified. A section that could not be
  matched or confirmed is listed as such, never dropped and never guessed.
- A claim about absence ("no Regierungsvorlage yet", "not promulgated") needs
  proof. Without it, show the weakest state the evidence supports.
- Every gap sentence opens with one of four lead words that say whose gap it
  is: „Nicht veröffentlicht", „Gerade nicht abrufbar", „Nicht lesbar",
  „Nicht im Monitor". Write it through `shared/utils/gaps.ts` and render it
  with `GapNote`; the rule and its exceptions are in `docs/decisions.md`,
  „A gap sentence opens with one of four lead words".

### Framing: Nachverfolgung, not a blame counter

The monitor shows what became of the input: changes made after the
Begutachtung as prominently as standstill. No rankings by
outcome, no accusation badges, and no figure presented as the effect of a
Stellungnahme. This binds UI and copy.

### Accessibility and design

- **WCAG 2.2 AA is required; AAA wherever it is cheap.** Text contrast is
  already AAA (7:1) and is computed, never judged by eye.
- **Boring and clean.** Two hues with one meaning each: blue means "you can
  do something here", yellow is the highlighter. Hierarchy comes from size
  and weight. No decoration that carries no information.
- Rules in full: `docs/decisions.md`, "Design and accessibility".

## Working rules

- **New work starts on a new local branch, never on `main`.** Before the
  first edit, open a branch from `main` named after the work and say so;
  work that continues an existing branch stays on it. Branches are never
  pushed: only `main` is, after the branch is merged into it locally.
  Commit, merge, push and deploy each need their own go-ahead from the
  maintainer (skill `ship`). Others edit
  this checkout at the same time: commit only your own hunks, and never
  `git stash`, reset or otherwise move the working tree.
- **No Claude attribution** in commits or pull requests.
  `.claude/settings.json` turns it off; never add it by hand.
- **Commit messages are English** and tell the story of the change. German
  terms of the subject stay German (Regierungsvorlage,
  Textgegenüberstellung). A rule that outlives the change also goes into
  `docs/decisions.md`.
- **Boring, low-ops tech.** No database, no accounts, no state layer. The
  predecessor project died in operation, not in construction. Anyone must be
  able to run a copy for under €100 a year.
- **Measure, then show.** Read samples, not only rates; a "changes nothing"
  result is suspect until the harness is shown to cover the path.
- **Check it yourself.** A drift run, a server check, a page in the browser
  or a note that says "blocked" is yours to test, not the maintainer's
  to-do. Re-measure every load-bearing number a subagent reports through
  the production module, and look at the page before repeating a claim
  about what it shows.
- **Change what was asked, everywhere it applies, and nothing else.** A UI or
  copy change reaches every place it occurs; a rename reaches every file
  that carries the old name, `private/` included. Neighbouring code stays
  as it is, and nothing is built, deleted or published unasked.
- **Dates come from `date`,** never from dates already in the text. A date
  later than today is an error.
- **In chat, plain words.** Define a term the first time it appears; no
  internal ids or status asides the maintainer has to decode.

### Words

In our own German text: „Paragraph", never „Paragraf" (quoted official
text, the regexes that match it and API parameters such as RIS's
`Paragraf=` keep theirs) · „Ministerium", never „Ressort" · „Anweisung",
never „Anordnung" · „Vermerk" for the pill at a § · the object is an
„Entwurf" (code: `Draft`), „Begutachtung" names the stage.

## Stack and commands

Nuxt 4 (Vue 3, TypeScript, SSR), Tailwind 4, pnpm. The Nitro server is a
caching proxy in front of the official APIs.

```sh
pnpm dev                 # http://localhost:3000
pnpm test                # vitest
pnpm lint
pnpm typecheck && pnpm typecheck:server && pnpm typecheck:tools
pnpm build               # run before a deploy, always after moving files
```

Gotchas that cost time before:

- In `app/`, import from `shared/` only as `#shared/…`. A relative path
  passes dev, tests and typecheck and breaks `pnpm build`.
- A helper used only in a `<template>` is not auto-imported at runtime,
  although the typecheck passes. Import it explicitly.
- Do not start a second dev server. If the browser and `curl` disagree, the
  running one is stale and needs a restart.
- A shared `useFetch`/`useAsyncData` key keeps the options of its first
  registration: never register it with `enabled: false` as a placeholder.
- No `v-html` for upstream content; the server reduces it to plain text.
- The current legislative period is never hardcoded without a fallback.
- An address that goes away keeps a 301 to its nearest successor, for good.
- No model call while a request is served.
- Never send a message to a running Workflow agent: it starts a second copy
  in the same worktree. Stop the workflow and relaunch it with the note.

Deployment: `deploy/README.md`.

## Data sources

The clients are the reference: `server/utils/parliament`, `server/utils/ris`,
`server/utils/laender` (one file per Land) and `server/utils/eu`. Verified
field maps and the upstream APIs' traps are in `docs/api-exploration.md`.
Which licence a source carries is stated under "Legal"
above, not derivable from code.

## Deferred on purpose: do not build these in a session

Each carries a standing cost (an obligation to operate, an outcome nobody can
promise, a partner, a recurring bill) and waits for funding or a decision by
the maintainer:

1. E-mail alerts. `/feed.xml` and `/kalender.ics` are the stateless
   substitute, shipped precisely to avoid the operations load.
2. Persistence and history (snapshots of deadlines and statement counts).
3. Base rates across hundreds of procedures.
4. Synthesis of statement texts (clustering, summaries).

"Upcoming" consultations have no verified data source. That is an open
research question, not a build item.

The maintainer's working list is private. If a task is not clearly ordinary
work, ask before building.
