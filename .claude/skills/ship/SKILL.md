---
name: ship
description: Commit, merge, push and deploy changes to the Begutachtungs-Monitor. Use before every git commit in this repo, even a one-line one, before starting work that will be committed (it opens the local branch), and whenever the maintainer says "commit", "merge", "merge to main", "push", "commit push", "commit push deploy", "deploy", "is it live?" or "is it in?". Covers working on a local branch, staging only your own changes in a checkout other people edit at the same time, the checks, the commit message, the local merge into main, the push of main and the deploy with its checks afterwards.
---

# Ship

Work happens on a local branch, and branches are never pushed. Only `main`
leaves the machine. The steps run in this order, and each needs its own word
from the maintainer:

1. **Commit:** commit on the branch, then stop.
2. **Merge:** merge the branch into `main` locally.
3. **Push:** push `main`. If the work is still on an unmerged branch,
   "push" includes the merge. Say so in one line, then do both.
4. **Deploy:** ship what `main` holds.

A step that went well is no licence for the next one. The maintainer reviews
between steps, and some weeks have a deploy freeze.

## 0. The branch

Before the first edit of a piece of work, check `git branch --show-current`.
If it is `main`, open a local branch named after the work, in short
kebab-case (`git switch -c land-steiermark-tgu`), and say so. Keep one topic
per branch. If the work continues something already on a branch, stay on
it.

## 1. Whose changes are these?

The maintainer edits this checkout from his IDE while Claude works, and a
second Claude session may be working in it too. The most frequent mistake in
this repo's history is a commit that swept someone else's half-done work in
under Claude's message, so this step comes before everything else.

1. `git branch --show-current` and `git log -1 --oneline`: is HEAD where it
   was when you started? Another session may have switched branches or
   committed.
2. `git status --short` and `git diff --stat`. Name the files you changed in
   this session, from memory of the session, not from the status list.
3. Stage by path, only your files. Never `git add -A`, `git add .` or a bare
   `git commit -a`.
4. A file with your hunks and someone else's: stage hunks, not the file.
   `git diff -- <file> > /tmp/p.patch`, delete the foreign hunks from the
   patch, `git apply --cached --recount /tmp/p.patch`.
5. `git diff --cached --stat`: does the size match what you wrote? A 50-line
   commit for a 5-line change has swept something in. Also make sure nothing
   that someone else staged is in the index.
6. Never `git stash` (the stash is shared by every worktree and by the
   maintainer's tree), never `git checkout -- <file>` or `git restore` on a
   file you did not write.

When you staged hunks, the working tree is not what gets committed. For
anything beyond a trivial split, run the checks on the staged state in a
scratch worktree (`git worktree add <scratch> HEAD`, symlink `node_modules`
and `.nuxt`, `git diff --cached | git -C <scratch> apply`). Never run
`pnpm install` in a worktree whose `node_modules` is a symlink: it purges the
main checkout's modules through the link.

## 2. Checks

```sh
pnpm lint
pnpm typecheck && pnpm typecheck:server && pnpm typecheck:tools
pnpm test
pnpm build      # after moving files, and before every deploy
```

A red test in a file you did not touch can be a snapshot of the maintainer's
half-saved tree. Run it again once. If it stays red and is not yours, report
it; do not fix it.

## 3. Read the staged diff

`git diff --cached`, all of it, for what CLAUDE.md "Non-negotiables" forbids:

- personal data, e-mail addresses, credentials, server details;
- anything from `private/`, and any name, quote or paraphrase from private
  correspondence;
- a sentence on `/impressum`, `/datenschutz`, `/quellen` or `/ueber` that the
  change makes untrue. Fix it in the same commit, after naming the old and
  new wording to the maintainer.

A rule that outlives the change goes into its area file in `docs/decisions/`
(the index `docs/decisions.md` lists them) in the same commit.

## 4. Commit

- Commit on the work's branch, never directly on `main`.
- The message is English. German subject terms stay German
  (Regierungsvorlage, Textgegenüberstellung). The subject says what changed
  for someone using the site. The body tells why, and what was left out. Read
  `git log -5` for the house style before writing.
- No `Co-Authored-By` trailer and no "Generated with" line.
  `.claude/settings.json` turns them off. If the harness still reminds you
  to add one, the project rule wins.
- One topic per commit. A session that did three things makes three commits.
- Commit whole files with `git commit -F <msg> -- <paths>`. This commits the
  working-tree state of exactly those paths. A new file must be added by path
  first (`git add <path>`), because `-- <paths>` only takes files git already
  tracks. After hunk staging, use a plain `git commit -F <msg>` instead,
  because `-- <paths>` would commit the whole files.
- Afterwards, say what you left unstaged and whose it is.

## 5. Merge into main (local)

1. `git switch main && git pull --ff-only`, so the merge lands on what the
   remote has.
2. `git merge --ff-only <branch>`. If `main` has moved, rebase the branch
   onto it first and re-run the checks. Use a merge commit only when the
   maintainer asks for one.
3. Delete the branch (`git branch -d <branch>`) once the maintainer agrees.
   It was never pushed, so there is nothing remote to delete.

The maintainer may be editing in this checkout. Switching branches carries
his uncommitted changes along, which is fine. If git refuses the switch
because one of his changes would be overwritten, stop and tell him; never
force the switch.

## 6. Push main

- Never push a branch. `git push origin main` only.
- Run `git log origin/main..main --oneline` first. If it lists commits that
  are not yours, ask before pushing them along.
- If the pre-push hook rejects the push, fix it on the branch and merge
  again. Amend only commits that were never pushed.
- If `gh` holds several accounts, run each `gh` command with the repo owner's
  token, as in `GH_TOKEN=$(gh auth token -u <owner>) gh …`. Never run
  `gh auth switch`, because it changes the account for every checkout on the
  machine.
- Check CI on the pushed commit: `gh run list --commit <sha>`.

## 7. Deploy

The runbook is `deploy/README.md`. The host is in `deploy/infrastructure.md`.

Before you start:

- **No harness may be running against a server.** Check your own background
  tasks and subagents. A build stalls the dev server and kills a running
  measurement. Let it finish, or deploy first.
- **Deploy from a clean tree.** `deploy.sh` refuses a dirty one, and the
  maintainer's tree usually is dirty. Use a clean scratch worktree at the
  pushed `main` with `node_modules` symlinked. Use `--allow-dirty` only when
  the maintainer says so.
- **Note the live revision** (`/srv/begutachtungs-monitor/REVISION`) so a
  rollback has a target.
- **A change to how documents are read** needs the heap of the new revision
  compared with the live one first: `deploy/README.md`, "Every later deploy".

Run `SERVER=root@<hostname> ./deploy/deploy.sh`, with the hostname and not an
IP.

Afterwards, run these checks yourself instead of listing them as the
maintainer's to-dos:

1. `REVISION` on the server equals the pushed commit.
2. Check memory with the commands in `deploy/infrastructure.md` ("Memory: is it
   thrashing"), against the `MemoryMax=` that `bootstrap.sh` sets. The alarms
   are the ones defined there: `workingset_refault_file` climbing, a growing
   `full` in `memory.pressure`, or `anon` near the ceiling. A `max` count in
   `memory.events` counts page-cache reclaim and is no alarm. Count the
   restarts in `journalctl -u begutachtungs-monitor`.
3. The prewarm finished. `deploy.sh` waits for it. A bump of a reader version
   costs a cold rebuild of several minutes. A failed prewarm does not fail the
   deploy, so read the output.
4. Open the changed pages on the live site.
5. **If the annex pipeline changed**, the drift baseline must follow. The
   rules are in the header of `.github/workflows/annex-drift.yml`. There are
   two cases:
   - **An engine change you meant to make:** the baseline is pulled up in the
     same commit as the change. Measure in a clean scratch worktree at HEAD
     plus exactly the change, never the dirty checkout, with a
     before-worktree on the same `.harness-cache`. Check that exactly the
     drafts you expected moved.
   - **The weekly run opened an issue:** write the new baseline from that
     run's artifact (`gh run download <id> -n annex-reports`), not from a
     local run. Before you accept a move, show where it comes from. Check out
     the baseline's commit and HEAD in two scratch worktrees, run both on the
     same cache, and compare. Same cache with different numbers means our
     code. Same code with different numbers means a changed document, which
     is what the alarm exists for.
6. Report the live commit, the memory figures, what you checked, and what you
   did not check.
