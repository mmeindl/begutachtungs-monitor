# CLAUDE.md

Rules, measurements and rejected alternatives: `docs/decisions.md`. Read the
relevant section before changing an area. Research memos that answer one
question once go to `docs/research/`.

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
- **Therefore:** nothing new hardcodes Austria where configuration would do.
  Countries become path segments (`/at`, `/de`), not separate codebases.

Why the tool exists and why it should work: `docs/why-this-tool.md`.

## Non-negotiables

### Private information is never committed

- `TODO.md` and `outreach/` are gitignored and exist only on the maintainer's
  machine. They stay that way. Nothing from them is copied into code, docs,
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
- **After every change to `server/utils/parliament/privacy.ts`,** run
  `pnpm audit:classifier` and read the old-against-new corpus comparison,
  every newly public name by hand. Tests alone have missed real leaks.
- **The licence differs per source, and the site says which applies where**
  (`/impressum#imp-license`, credit lines at the content). RIS open data is
  CC BY 4.0. On Parliament's side the result lists and API data of the
  stations after the Begutachtung are CC BY, their documents are free works,
  the Begutachtung data itself carries no grant, and everything about
  Stellungnahmen is excluded from reuse. Never write a blanket CC BY claim.
- **Where a document exists in both sources, RIS is read first**
  (`annexSourceFor`). That order and `READ_PARLIAMENT_COPY` do not move while
  the licence question (E3) is open.
- **Statement texts are linked, never fetched or parsed** by the product.
  Machine reading of statement texts happens only under the text-and-data-mining
  exception (§ 42h UrhG).
- **A new source (a Land, a country, a dataset) ships only with its licence
  checked and stated** in the Impressum.
- **No third-party resources at runtime:** no web fonts, CDN, analytics
  service or cookies. Page views are counted, visitors are not.
- The legal pages (`/impressum`, `/datenschutz`, the licence wording on
  `/ueber`) change only with the maintainer.

### Say what cannot be shown, and why

- Wherever the monitor follows a law and cannot show a step, the page says so
  and names the reason: a Land that does not publish the document, a source
  that failed, a text that could not be read. A gap never renders as an empty
  result, a zero or silence.
- A comparison shows only what is verified. A section that could not be
  matched or confirmed is listed as such, never dropped and never guessed.
- A claim about absence ("no Regierungsvorlage yet", "not promulgated") needs
  proof. Without it, show the weakest state the evidence supports.

### Framing: Nachverfolgung, not a blame counter

The monitor shows what became of the input, in both directions. Changes made
after the Begutachtung are shown as prominently as standstill. No rankings by
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

- **No Claude attribution:** no `Co-Authored-By` trailer in commits and no
  "Generated with" line in pull requests. This overrides the tool's default.
- **Commit messages are English** (German until 13.11.2026) and tell the
  story of the change. German terms of the subject stay German
  (Regierungsvorlage, Textgegenüberstellung). A rule that outlives the change
  also goes into `docs/decisions.md`.
- **Boring, low-ops tech.** No database, no accounts, no state layer. The
  predecessor project died in operation, not in construction. Anyone must be
  able to run a copy for under €100 a year.
- **Measure, then show.** Read samples, not only rates; a "changes nothing"
  result is suspect until the harness is shown to cover the path.
- Spelling in our own German text: "Paragraph", never "Paragraf".

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
5. A second verification signal for the consolidated reading, beyond the
   ministry's own Textgegenüberstellung.

"Upcoming" consultations have no verified data source. That is an open
research question, not a build item.

The maintainer's working list is private. If a task is not clearly ordinary
work, ask before building.
