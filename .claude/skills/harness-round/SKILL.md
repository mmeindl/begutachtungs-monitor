---
name: harness-round
description: Measure the Begutachtungs-Monitor's comparison engine with the harnesses in scripts/harness. Mode A is a measuring round whose figures go onto /genauigkeit. Mode B is a fix loop in which every change to the annex, station, comparison or Länder readers is proven by the instruments. Use when the maintainer asks for "a round", new /genauigkeit figures, "measure it", "prove it", a fix night on the diff engine, or when a change under server/utils that touches how documents are read or compared needs evidence before it ships.
---

# Harness round

Both modes run the same instruments: `scripts/harness/*.ts`, which
`scripts/harness/round.sh` runs in four lanes. Mode A measures the current
commit and publishes the figures. Mode B uses the instruments to prove each
fix one at a time, and ends in Mode A.

**Status:** Mode A is established. `round.sh` and `genauigkeit.ts` codify it,
and their header comments are the reference. **Mode B is provisional;** see
the last section.

## The rules every measurement follows

They are in `docs/decisions/measuring.md`, which loads with any file under
`scripts/harness/`. Read it before the first command. The ones that cost the most when forgotten:

- **A figure on a page comes out of a harness record, never out of a hand.**
- **A null result is evidence only once the instrument reaches the changed
  path.** Check what the harness reads (XML or PDF, a copy of the check or the
  shipped function) against what the service reads. When an offline check
  moves a lot and the end-to-end figure does not move at all, suspect the
  harness first.
- **Read samples, not only rates.** Before you build on a harness class, dump
  its lines (`--refusals=`, `--dump=`) and read them. Some labels are derived
  by exclusion and are guesses.
- **Re-measure an agent's numbers through the production module.** Agents'
  scratch scripts do not share the production normalisation.
- **No build or deploy while a harness asks a server.** A build stalls it, and
  the run dies partway through.
- **A run against the dev server on :3000 needs it warm and left alone.** Its
  derived cache lives in memory, and any edit under `app/`, `server/` or
  `shared/` restarts Nuxt and throws it away. Finish the code first, then run,
  and touch only docs and `scripts/` while it runs. Two runs in parallel slow
  each other down. Scripts must survive a dropped request: use a fetch helper
  with `AbortSignal.timeout` and a catch, and `curl -m`. A draft that never
  answered drops out of the sample. It is not "0 hits".
- **A word check against RIS HTML skips `span.sr-only`.** RIS repeats
  „Paragraph 3, Absatz eins" there for screen readers, and that swamps the
  diff.

## Mode A: measuring round

The commands are in the header of `scripts/harness/round.sh`. Follow them
from there, so the script stays the single source.

1. **Clean commit.** The builder refuses a `+dirty` round. If the maintainer's
   tree is dirty, measure in a clean scratch worktree at HEAD: symlink
   `node_modules`, `.nuxt` and `.cache`, and set
   `HARNESS_CACHE=<main checkout>/.harness-cache`.
2. **Run** `pnpm build && pnpm ci:ssr-smoke`, then `pnpm harness:round <outdir>`.
   The outdir goes in the scratchpad. The round takes minutes. Report progress
   from `<outdir>/progress.log` instead of going silent.
3. **Gates.** Every `<outdir>/*.txt` ends in `exit 0`. A station lane at
   `exit 1` means its baseline is older than the list. Redraw it from
   `station.json`, with a reason for every residue that is not editorial.
4. **Window.** Every report carries the window it measured. Check that the
   newest draft is recent, and say which period the round names.
5. **Build the figures** with `genauigkeit.ts --in=<outdir>` (flags are in its
   header), then **read the diff of `shared/data/genauigkeit.json`** before
   committing it. Words for a figure live in `shared/utils/genauigkeit.ts`. A
   new fault class needs its key in one group; the test fails otherwise.
6. **Copy.** Any changed sentence on `/ueber` is named to the maintainer with
   its old and new wording first.
7. **Commit** with the `ship` skill. The message names the round's commit and
   window.

## Mode B: fix loop (provisional)

1. **Work in a worktree** for each line of work, set up as in Mode A step 1.
2. **Baseline first.** Run vitest, the three typechecks, and the instruments
   that cover the area, so every later move has a reference:

   | Area | Instruments |
   |---|---|
   | Annex reading (PDF/XML) | `harness:annex`, `harness:fault-injection` (both paths, `--xml`) |
   | Comparison engine, consolidated reading | `harness:kons --cache --oracle` |
   | Stations and their badges | `station.ts` against `stationBaseline.json` |
   | Länder | `harness:land-guard`, `landStations.ts --cached-only` |
   | What the page shows per § | `accounting.ts`, which needs a running server |

3. **For each fix:**
   1. Write a test that fails on the old code.
   2. Make the fix.
   3. Re-run the instruments that cover its path.
   4. **Read every verdict that moved** and explain each one: an intended
      gain, a regression, or an instrument artefact.
4. **Agents** implement on `fx-*` branches, each with an independent reviewer.
   You re-measure their figures yourself. Set up their worktrees yourself:
   - `git worktree add -b fx-<name> <scratchpad>/wt/<name> <base>`, naming
     the exact base commit in the brief. A tool-made worktree may be cut
     from a stale `main`.
   - Symlink `node_modules`, `.harness-cache`, `.cache` and `.data`. Run
     `pnpm exec nuxt prepare` once, because a fresh worktree has no `.nuxt`.
   - Make sure `.git/info/exclude` lists `/node_modules`, `/.harness-cache`,
     `/.cache` and `/.data` without a trailing slash, so a symlink can never
     be staged.
   - Brief agents to use neither `git reset --hard` (the sandbox blocks it)
     nor a bare `git stash`. To move to a newer base, use
     `git merge --ff-only <base>`.
   - Bring branches together one at a time on an integration branch, and
     run the full checks after each one. Cross-branch breaks show up there.
5. **Close** with a full Mode A round. Update `/datenlage`, `/genauigkeit` and
   the area file in `docs/decisions/` where a rule outlives the fix. Ask before landing on
   main. After the push, take the annex-drift baseline as the `ship` skill
   describes.

### Before a fix ships

These two rules stood in `docs/decisions.md` until 25.11.2026. They are
procedure, so they live here.

- **Before a parser change, compare old against new over the whole corpus and
  read every item that moves.** Zeros measured on tuning data are in-sample.
- **A fix of the struck-text rule is attacked by a reader before it ships**
  (22.11.2026). Four reviews in a row, each by readers who had not written
  the code, found the fix before them accounting for more than the draft
  strikes; two of the holes had cleared a real §
  (`docs/decisions/draft-check.md`, „Each instruction accounts only where and
  for what it strikes"), a third was found only on drafts the check had never
  been measured on. The rule
  that came of it: a change that lets the check account for more is given
  to an independent reader with the instruction to break it, and every
  finding to a second reader who tries to refute it; a change that makes it
  account for less needs the corpus read alone, every § that moves and,
  for a change to how a line is read, every real instruction line through
  the reader before and after (9,401 distinct lines of GP XXVIII, a matter
  of seconds). Removing a reading can move the accounting to a looser
  fallback: when „§ 5 Abs. 1 erster Satz lautet:" stopped counting as the
  Absatz written anew, its payload, printed from the § designation on,
  would have counted as the whole §. The fallback is checked with the fix.

### Provisional: refine on first use

Mode B was written from five sessions (19.–23.11.2026). Its runnable order
survived in only one session brief. The first time you use it:

- follow it as written;
- note every place where reality differed: a changed command, a missing
  instrument, a wrong order, a step that was not needed;
- at the end of the session, propose concrete edits to this file to the
  maintainer;
- once a run has confirmed the mode, remove this section.
