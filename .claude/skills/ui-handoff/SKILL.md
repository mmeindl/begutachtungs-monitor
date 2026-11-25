---
name: ui-handoff
description: Finish and hand over a visible change to the Begutachtungs-Monitor: a component, page, copy, layout or style change under app/ or shared/ copy. Use before calling a UI change done, and whenever the maintainer asks "show me a link", "where can I see it", "I don't see it", "anything left?" or "can I test it?". Covers matching the existing idiom, applying the change at every place it belongs, checking it at desktop and true phone width with the bundled screenshot script, and the handover message with localhost links.
---

# UI handoff

The maintainer reviews in his own browser. To review, he needs every place
changed, a link to each, what to look at there, and what nobody has checked.
Four of his standing questions mark where a handover fell short: "show me a
link", "I don't see it" (the change sat at one place of five), "anything
left?" and "why did you change that?".

## 1. Before building: idiom and scope

- **Find the existing idiom first.** The rules are in `docs/decisions/ui.md`,
  "Design and accessibility", and in the box grammar and one-hue rules there.
  Grep for a component or pattern that already does this job. A new pattern
  needs a reason that you can state.
- **Change only what was asked.** Do not restyle neighbours or add a section
  nobody asked for. A good idea next door goes into the report as a
  suggestion.
- **Propose a choice with real alternatives** before building it: what you
  would build, what you rejected and why. Then wait for "do it".

## 2. Apply it at every place it belongs

- Grep every instance: the component, the class, the copy string. Check every
  page kind that renders the same thing (`app/pages/`: Bund drafts, Länder,
  EU law, Anliegen, Bundesrecht, the prose pages).
- Copy used in more than one place lives in one module, not in each template.
- A rejected phrase or style is removed everywhere, not only where it was
  noticed.
- A helper used only in a `<template>` is not auto-imported at runtime.
  Import it explicitly.

## 3. Check it

- **Dev server.** The maintainer's runs on :3000. Use it, and never start a
  second one there. If the browser and `curl` disagree, or an edit is
  missing from the bundle, the server is stale. Ask him to restart it.
  Branches, worktrees and fake data get their own server on another port
  (`pnpm dev --port 3111`). Stop it afterwards.
- **Screenshots** at desktop width and at true phone width. Chrome's own
  `--window-size` cannot go below about 500 px, so use the bundled script:

  ```sh
  node .claude/skills/ui-handoff/scripts/shot.mjs <url> <outdir> [--widths=1280,390] [--selector=<css>] [--full]
  ```

  It writes `<width>.png` per width and reports horizontal overflow, naming
  the widest elements, plus the browser's errors and warnings. A Vue
  "accessed during render but not defined" warning is a missing import or a
  stale server. Use `--selector` for one section of a long page. Put the
  output in the scratchpad, never in the repo. **Look at the images
  yourself** before handing over.
- **Pick worst cases:** the longest title, the most stations, an empty
  section, a gap note, a page with a deadline and one without.
- **What a screenshot cannot show:** hover and focus states, keyboard order,
  and a control that changes the URL. Drive those with the DevTools protocol,
  or list them as unchecked.
- **Colours:** if a colour changed, compute the contrast. Text needs 7:1.
- **Checks:** `pnpm lint`, the three typechecks and `pnpm test`.

## 4. The handover message

In this order:

1. **What changed**, one line per place.
2. **Links** to `http://localhost:3000/…`, one per page kind affected, with
   the worst cases. Name what to look at on each one.
3. **Not checked:** a real phone, a screen reader, a click only a browser
   can do, and anything else you did not see with your own eyes.
4. **Legal pages:** if one was touched, give the old and new wording.
5. **State:** uncommitted, and which preview servers or worktrees are still
   running. Clean them up unless they are needed for the review.
6. **One closing question** ("Should I commit?") that a single "yes" can
   answer. Committing then follows the `ship` skill.
