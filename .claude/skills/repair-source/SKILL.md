---
name: repair-source
description: Diagnose and repair a source the Begutachtungs-Monitor can no longer read, be it a Land's list or draft page, the Commission's portal „Ihre Meinung zählt" or the register of the European Citizens' Initiative. Use when an issue labelled land-quelle or eu-quelle is open, when the maintainer pastes such an alarm mail, or says "the alarm fired", "a Land is not readable", "Salzburg shows 'gerade nicht abrufbar'", "the portal broke" or "repair the reader". Covers telling an outage, a block, a moved source, a changed page and our own regression apart with a handful of requests, recording the changed page as a fixture, the failing test, a fix that keeps the gate, and the handover note. Not for the site being down, the Stellungnahmen canary or the annex drift alarm; section 0 says where those go.
---

# Repair a source

A source that cannot be read is not an emergency. Each Land and each EU
source fails on its own, the page says „Gerade nicht abrufbar" and links the
source, and the issue closes itself when the source reads again. So nothing
here is worth a loosened check or a hurried request. What the alarm leaves
open is the reason. This skill leads from the open issue to one of four ends:
nothing to do, a block to report, a decision for the maintainer, or a branch
with a fix he can review.

**Status: provisional.** Written on 27.11.2026 from the code and the rules,
before a real alarm was repaired with it. See the last section.

## 0. Which alarm

| Issue label | What fired | Where it goes |
|---|---|---|
| `land-quelle` | a Land's `state` in `/api/laender` is not `ok`, twice, 90 s apart | this skill |
| `eu-quelle` | the portal's or the register's list answers `initiatives: null` | this skill |
| `downtime`, reason opens „canary:" | a known organisation is missing from a draft's Stellungnahmen | section 2 only, then stop and report. The fix is in list 142's mapping or `privacy.ts`, where who is named changes only with the maintainer (CLAUDE.md, "Legal") |
| `downtime`, any other reason | the site does not answer | `deploy/infrastructure.md` |
| `annex-drift` | the weekly drift run | the `ship` skill, step 7, point 5 |

`api` in an issue's list means our own endpoint gave no answer. That is the
site, not a source: `deploy/infrastructure.md`.

## 1. What holds through the whole repair

Read the area file first: `docs/decisions/laender.md` or `eu.md`, and in
`foundations.md` the entries "Upstream blocks are respected" and the one on
`robots.txt`. These decide most cases:

- **The gate is never loosened to let a page through.** Every Land reader
  holds its parse to what the page says of itself: a stated count, a table
  head, a floor of rows, two named sections. The reader's header and its
  `LandSourceError` lines say which. A maintenance page served with HTTP 200
  must never read as „keine Begutachtung offen". A fix teaches the reader the
  new page and then holds it to what the new page states. Where the new page
  states less than the old one, that is a decision for the maintainer.
- **A block ends the work.** HTTP 403, a bot check, a captcha or a login
  means: stop asking. The User-Agent is never changed, and no browser
  automation or other route goes around it. Steiermark's firewall allows one
  request a second and answers a burst with a block; after a 403 nothing is
  asked for two hours (`SitePacer`), and a request into a block prolongs it.
- **Few requests, through the project's client.** Fetch each page once, save
  it, and work on the saved copy. Never `curl` with its default identity, and
  never a loop over drafts.
- **Statement texts are never fetched.** A list of Stellungnahmen is read for
  the reader's own fields only.
- **No person's name leaves the source.** A fixture carries none, and a
  change to how a submitter or an official is read (`classifySubmitter`,
  `bgldSubmitter`, the EU readers' fixed lists of fields) stops the repair:
  every name newly shown is read by hand, with the maintainer.
- **A new host, a new system or a new interface is a new source.** Its
  licence and its `robots.txt` are checked before any code (`research-memo`
  skill), and whether to read it is the maintainer's decision. Report; do
  not build, and do not add the host to `UPSTREAM_HOSTS`.

## 2. Diagnose, cheapest evidence first

1. **The issue.** `gh issue list --label land-quelle --state all --limit 5`
   (or `eu-quelle`): which source, since when, and whether it has closed and
   reopened, which points to an outage that comes and goes. For the `gh`
   account see the `ship` skill, step 6.
2. **The live answer.** Ask the live site (`SITE` in
   `.github/workflows/uptime.yml`) what the probe asks: `api/laender` and
   `.sources[] | select(.state != "ok")`; for the EU `api/eu-recht/fenster`
   and `api/eu-recht/buergerinitiativen`, where `initiatives` is null. If
   everything reads again, it was an outage: say so and stop. An EU break
   shows only once the last good answer has aged out, so it began up to a day
   (portal) or two days (register) before the issue.
3. **The server's own reason.** A failed read of a Land logs
   `[laender] <land> nicht abrufbar: <reason>`: the gate's sentence, an HTTP
   status with the page's address, or „Upstream nicht erreichbar (…)" with
   what the last attempt died of („HTTP 503", „Zeitüberschreitung",
   „TypeError ENOTFOUND"). A failed read of the portal's or the register's
   list logs `[eu] … nicht abrufbar: <reason>` in the same words without the
   address, or the reader's sentence (`upstream/failureReason.ts`); „Antwort
   ist kein JSON" there is an error page or a bot check served with HTTP
   200. The command is "App logs" in `deploy/infrastructure.md`; run it with
   `--since -2d --no-pager` and a `grep -E '\[(laender|eu)\]'`, not with
   `-f`. Where the journal holds no line or leaves the cause open, step 4
   answers it.
4. **The page, once.** Write a scratch script in the scratchpad and run it
   from the repository root:

   ```ts
   // npx vite-node -c vitest.config.ts <scratchpad>/probe.ts
   import { writeFileSync } from 'node:fs'
   import { getText } from '<repo>/scripts/lib/http'
   import { WIEN_LIST } from '<repo>/server/utils/laender/wien'

   const html = await getText(WIEN_LIST, { script: 'repair-source', attempts: 1, timeoutMs: 15_000 })
   writeFileSync('<scratchpad>/wien-list.html', html)
   ```

   `scripts/lib/http.ts` sends the project's identity with the script's name
   appended. The address comes from the reader's exported constant or
   builder, never typed by hand. For JSON use `getJson`. Then run the
   reader's exported parser over the saved file in a second script, offline,
   as often as needed; a refusal prints the gate's sentence
   (`LandSourceError: w: Seite ohne die Abschnitte …`).
   - **Tirol's Landtag, Steiermark and Burgenland's archive pages** need a
     session. Read them through the reader's own functions, `LandSession`
     and the Land's pacer; do not rebuild a postback by hand.
   - **The EU sources:** one request at a time, 2.5 s apart
     (`PORTAL_GAP_MS`, `ECI_GAP_MS`), and no retry (`PORTAL_POLICY`,
     `ECI_POLICY`).
5. **Old against new.** The newest fixture of that page is the page as it
   was when the reader last read it:
   `tests/fixtures/laender/<land>-<page>-<date>.html`,
   `tests/fixtures/eu-portal/`, `tests/fixtures/eu-eci/`. Run the parser over
   both and compare the two pages where the gate's sentence points.

Then name the cause. One row fits:

| What the evidence shows | Cause | Next |
|---|---|---|
| A timeout, a 5xx or a DNS error, and it reads again later | outage | nothing to repair; report |
| HTTP 200 with a maintenance or error page | outage, and the gate did its job | nothing to repair; report |
| 403, a bot check, `LandSiteBlockedError` | block | stop and report the time of the first 403 in the journal, and the deploy before it if there was one |
| A redirect to another host, a 404 at the list's address, another system behind the same address | moved or relaunched | stop and report: a new source |
| The same address and the same content in another shape; the old fixture still parses, the new page does not | changed page | section 3 |
| The old fixture fails too, or the page equals the fixture and `git log` shows a recent change to the reader | our regression | section 3, with the test built on the existing fixture; name the commit |
| The page and the parser are fine here, and the live site still fails | something only production has: a block of its address, an old deploy, memory | report; `deploy/infrastructure.md` |

## 3. Repair a changed page

Work on a local branch (`ship` skill, step 0).

1. **Record the new page as a fixture,** beside the old one, under the same
   name with today's date from `date +%F`. Trim it to what the parser reads,
   as the existing ones are, and keep what the gate reads. Leave out every
   panel that names a private person (Burgenland's archive fixture shows
   how) and replace officials' names, addresses and numbers with
   placeholders (the portal's fixture shows how). Grep the file for names,
   „@" and telephone numbers before staging it, and give it a row in
   `tests/fixtures/README.md`. The old fixture stays while any live page,
   such as a Land's archive, still has the old shape.
2. **Write the test that fails on the old reader:** the new fixture through
   the parser, with the rows you expect. Read the expected ids, titles,
   dates and documents off the page by eye, never from the parser's output.
   Keep the gate's tests and add the new page's: a maintenance page throws,
   and so does the new fixture with its count or its table head removed.
3. **Fix the reader** with the smallest change that reads every shape still
   live. The gate keeps asking what the page states about itself. A changed
   address goes into the constant at the reader's head, with the date in its
   comment.
4. **Follow what the fix touches:**
   - A reader's `…_READER_VERSION` or `…_QUERY_VERSION` is bumped as its
     own comment says, in the same commit. For the EU readers also read the
     rule at `EU_READER_VERSION` (`server/utils/eu/readerVersion.ts`).
   - The reader's header describes the page; correct it, with the date.
   - A rule that outlives the fix goes into the area file.
   - If an address the legal pages show has changed, or a field is newly
     shown or withheld, name the old and the new wording to the maintainer
     before editing `/quellen` or its neighbours.
5. **Prove it.** Run `pnpm test`, the three typechecks and `pnpm lint`. Then
   read the live page once more through the fixed reader and compare its
   rows with the page as a browser shows it: every draft there, none
   invented, dates and document links right. If a dev server is running,
   ask its `/api/laender` and open one draft of the Land. A fix in a
   document reader (`landTgu*`, `draftPdfLaw.ts`, `landExplanations*`) is
   not this skill: it changes what a comparison says and is proven with
   Mode B of the `harness-round` skill.

## 4. Hand over

Report in English and in plain words, in this order:

1. The source, since when it could not be read, and the cause in one
   sentence.
2. The evidence: the gate's sentence or the status, and what changed on the
   page, as a short excerpt of before and after.
3. What was done: the branch, the files, the fixture and its date. Or why
   nothing was done.
4. What was checked and how, with the count of rows the live read gave, and
   what was not checked.
5. The requests sent to the source: how many, and to which addresses.
6. The decisions that are the maintainer's, numbered: a gate that can state
   less, a sentence on a legal page with its old and new wording, a name
   newly shown, a new source, a question to the publisher.

Commit, merge, push and deploy each wait for the maintainer's word (`ship`
skill). Write nothing on the issue, which is public, unless he asks, and
never close it by hand: the probe closes it once the source reads, and an
issue closed while the source still fails is opened again as a new alarm.
After the deploy, check that the issue did close, and read the journal for
403s where a session reader changed (`foundations.md`).

## Provisional: refine on first use

Tried so far: the probe of step 4 against Wien's list, and the offline parse
of the fresh page, a maintenance page and the fixture (27.11.2026). Not
tried: a session Land, an EU source, and a whole repair. The first time you
use this skill:

- follow it as written;
- note where reality differed: evidence that was missing, a cause the table
  does not hold, a step in the wrong place;
- at the end of the session, propose concrete edits to this file to the
  maintainer;
- once a real repair has confirmed it, remove this section.
