#!/usr/bin/env vite-node
/**
 * What the annex gate catches when the annex is deliberately broken.
 *
 * `harness/annexPdf.ts` measures the gate against the corpus as it is, so it
 * can only ever report what the ressorts happen to have got wrong. That is
 * half a measurement: a gate is also defined by the faults it lets through,
 * and the corpus contains no labelled ones. So faults are injected into §§
 * the gate has just confirmed, and the gate is asked again.
 *
 * **Why this had to exist as a script.** Every threshold of the two
 * right-column rules — `MIN_STANDING_STRETCH`, `MIN_NEW_WORDS`,
 * `MIN_MISSING_WORDS`, `DRAFT_THRESHOLD` — and the sentence in
 * `annex/rightColumn.ts` that states the gate's reach come from an injection
 * run that lived in a
 * scratch file. A claim whose instrument is gone is a claim nobody can
 * re-check, and the reach is exactly the number that gets read as "the gate is
 * complete" if it is left unstated. This is the instrument, kept.
 *
 * **Four faults, and each one is a real failure mode of this project.**
 *
 * - **L** — drop the second sentence of a confirmed §'s left column and
 *   re-diff. That is what the PDF path does when a line is filed into the
 *   wrong column: the word diff then paints standing law green and the page
 *   claims the draft adds what the law already contains. The left check cannot
 *   see it, because containment is one-directional — it asks whether the
 *   standing § accounts for the column, never whether the column accounts for
 *   the §.
 * - **R-alt** — append a sentence of *another* §'s standing text to the right
 *   column. Old law misfiled into the proposed column; the GSpG § 56 shape,
 *   where the annex's right column carries "daß" twice.
 * - **R-neu** — append a sentence of another §'s *proposed* column. Text
 *   dragged out of a neighbouring provision of the same draft. It was the
 *   known blind spot of rule 2 as long as its word bag was built for the
 *   whole draft: the words are in the draft, only in the wrong §. This run is
 *   what measured that (12,4 % caught on the PDF path, 32,1 % on the table
 *   path) and what measured the per-§ reference that answered it (77,0 % and
 *   83,2 %; 12,0 / 32,3 and 77,0 / 82,1 when it was first run).
 * - **U** — add a row printing another §'s standing text **identically in both
 *   columns**. A mirrored row the annex files under the wrong §, which is the
 *   shape the table path produces by construction: a Teil-, Abschnitt- or
 *   Unterabschnitt heading stands above the § it heads and therefore inherits
 *   the number of the § before it. The gate catches **none of it, by
 *   construction** — the left check reads only the rows shown as a change and
 *   both right-column rules read only inserted text — and that is the point of
 *   running it: the blind spot is stated as a measured 0 %, not assumed. What
 *   the run does decide is `silenced` (below).
 *
 * **And the reader's faults in the right column** (21.11.2026), the Länder
 * harness's classes, built by the same edits (`lib/rightColumnFaults.ts`), in
 * every § the left check confirms: **Zahl** (the first figure of the new text
 * plus seven — a figure, not a label), **Spalte-Bezeichnung** (its first
 * Absatz, Ziffer or Litera label moved by one), **Wort** (its longest word
 * swapped), **Satz-weg** (its last sentence gone), and **R-weg**, a sentence
 * the draft keeps lost from the right column, which the page then shows
 * struck. Both right-column rules read new words against bags, from floors
 * up (`MIN_NEW_WORDS`, `MIN_MISSING_WORDS`), and neither reads struck text:
 * these were the Länder's blind spot until 20.11.2026, and the run says what
 * they are for the Bund's gate (the draft check of the table reads struck
 * text since 22.11.2026, `struckAccount`). The same faulted rows are held by the oracle
 * against the unchanged result too („Lesefehler in der rechten Spalte",
 * record field `column`), since 21.11.2026: there they are the annex's
 * column the page would show, and the question is whether it is marked.
 *
 * | 21.11.2026, GP XXVIII | Tor PDF | Tor Tabelle | Orakel PDF | Orakel Tabelle |
 * |---|---:|---:|---:|---:|
 * | Zahl               | 34/1382 | 1/770 | 1021/1024 (99,7 %) | 698/699 (99,9 %) |
 * | Spalte-Bezeichnung | 28/701  | 1/408 |  356/613 (58,1 %)  | 285/452 (63,1 %) |
 * | Satz-weg           | 11/335  | 0/172 |  257/259 (99,2 %)  | 153/157 (97,5 %) |
 * | R-weg              | 10/1162 | 2/845 |  670/722 (92,8 %)  | 521/557 (93,5 %) |
 *
 * R-weg since 22.11.2026, when check 4 began to read the words of every
 * striking region of a row: 674/722 (93,4 %) and 528/557 (94,8 %).
 *
 * **And the whole chain the page runs** (21.11.2026, `judgeChain`): the same
 * faults, Satz links verloren (fault L) and, since 22.11.2026, the two
 * foreign sentences (R-alt, R-neu), judged by the gate and then by
 * the table of `annex/annexMark.ts` — the draft check over the faulted rows,
 * the oracle again over the same result with the faulted rows in the annex.
 * Over the §§ the page showed without a mark before the fault: withheld,
 * marked (either pill), shown without a mark; under each value of
 * `OBJECTION_OVER_CONFIRMATION`, each over the §§ it shows without a mark.
 * GP XXVIII, 22.11.2026, since the struck-text check reads an address as a
 * path and each instruction only for what it strikes there, the rule in
 * force ('missing'; under 'clean' and 'unconfirmed' in brackets):
 *
 * | 22.11.2026 | PDF | Tabelle |
 * |---|---:|---:|
 * | Zahl im Text       | 1069/1076 (99,3 %; 98,9; 99,6) | 610/612 (99,7 %; 98,9; 99,7) |
 * | Bezeichnung        |  444/486 (91,4 %; 90,5; 91,2)  | 263/282 (93,3 %; 89,8; 93,2) |
 * | Wort getauscht     | 1354/1372 (98,7 %; 98,5; 99,3) | 868/876 (99,1 %; 99,0; 99,8) |
 * | neuer Satz fehlt   |  221/228 (96,9 %; 95,7; 96,9)  | 124/125 (99,2 %; 93,8; 99,2) |
 * | behaltener Satz gestrichen | 860/951 (90,4 %; 90,2; 92,8) | 627/686 (91,4 %; 90,9; 93,6) |
 * | Satz links verloren | 815/1027 (79,4 %; 77,8; 82,8) | 242/306 (79,1 %; 79,7; 79,2) |
 *
 * Behaltener Satz gestrichen stood at 792/954 and 579/685 when the check
 * first read struck text; an independent review then found it accounting
 * more widely than the draft supports (an address without its parents, a
 * position counted for any sentence, a payload for its whole §). Of the 91
 * PDF misses since, by what accounts for the struck sentence in the
 * harness's own line (`; gestrichen: …` against the unfaulted §): a payload
 * of the same or the next unit 38, the Lesefassung confirming against the
 * check 23, the head zone ahead of the § designation 14 (on this path a
 * division heading the injector takes for a sentence), a position the draft
 * counts in that unit 8, a repeal 5, a quoted old wording 3. Of the 58 on
 * the table path: a position 25, a payload 17, the Lesefassung 16.
 *
 * **A sentence of another § in the right column, through the chain too**
 * (22.11.2026): R-alt and R-neu were judged by the gate alone, which catches
 * 66 to 83 % of them, and that was the figure `/genauigkeit` drew — for a
 * fault the page marks nearly always, since the draft check holds the new
 * words against the wording the draft writes for that §:
 *
 * | 22.11.2026 | PDF | Tabelle |
 * |---|---:|---:|
 * | fremder geltender Satz rechts | 986/986 (658 einbehalten, 328 markiert) | 289/289 (228, 61) |
 * | fremder Entwurfssatz rechts   | 980/983 (793, 187)                      | 275/288 (224, 51) |
 *
 * Both are held to 95 %, R-neu on the PDF path only. What passes on the table
 * path is one shape, all 13 in one draft (the Strafprozessrechts-
 * änderungsgesetz): the donor § opens with its heading, so the „sentence"
 * appended is a heading — „Beendigung des Ermittlungsverfahrens und Absehen
 * von der Einleitung eines Ermittlungsverfahrens (1) ..." — and both
 * word-for-word checks pass a heading at the foot of a §'s new text as the
 * heading of the § that follows, which is where the table path files one
 * (the draft check objects to the Absatz number behind it at most, and the
 * oracle's confirmation then stands against that). With a full stop behind
 * it the oracle contradicts; a plain foreign sentence it contradicts always
 * (probed 22.11.2026). Two of the three PDF misses are the same shape — a
 * division heading („ABSCHNITT II …") and a line without a closing sign
 * behind an omission mark —, the third a donor whose words the draft writes
 * for that § too. Neither check asks whether the heading is the following
 * §'s: that is the limit, and `--misses` shows each such place
 * (`faultSite`). U stays with the gate: a row alike in both columns shows no
 * new and no struck word, so neither check of the table reads it.
 *
 * A kept sentence struck passed wherever the draft check held before the
 * fault, while it read no old text: 216 of 955 and 148 of 683 were caught.
 * Since it holds what the column strikes against what the draft strikes,
 * what passes is struck text an instruction for the § accounts for (the
 * classes above) — in none of the misses the review read did the faulted
 * column agree with the draft —, and on the PDF path a division's heading
 * the injector takes for the row's first sentence (`keptSentenceGone`).
 * Zahl, Wort and neuer Satz fehlt are held to 95 % under
 * `--mindestens` (`CHAIN_FLOORED`), on both paths; the two foreign sentences
 * as said above. Neuer Satz fehlt stood at
 * 206 of 233 on the PDF path while the draft check excused missing wording
 * behind an elision mark as far as the column's edge: every one of the 27
 * misses was a § that closes on such a mark. Since the mark stands only for
 * what follows the last word the column prints (`behindElision` in
 * `laender/landTguStrict.ts`), 7 of 230 pass. Each class not held says why,
 * in the record (`CHAIN_NOT_FLOORED`).
 *
 * Until these builders said what they build, the oracle stood at 89,3 and
 * 87,8 % for Zahl, 95,9 and 96,0 % for Satz-weg and 73,2 and 98,1 % for
 * R-weg: Zahl changed labels (96 of the 115 PDF misses a Ziffer or Absatz
 * marker), and the edit landed at the first place the stretch's text
 * occurred, inside „§ 139." for a stretch „1"; Satz-weg dropped a bare „(3)"
 * or cut a date after its day; R-weg struck the heading stack before
 * „§ 31.". The table path's R-weg fell: its old „sentence" took the
 * Absatz's „(1)" with it, and check 5 missed the marker, not the words; the
 * marker stays now and only the sentence goes (`withKeptSentenceLost`).
 * Spalte-Bezeichnung was caught by check 5 where the label is an Absatz's,
 * and nowhere else; check 6 (`labelBroken`) reads the rest: 597 of 602 on
 * the PDF path, 435 of 442 on the table path.
 *
 * The left column is untouched in both R faults, so "die linke Prüfung
 * besteht" reads 100 % there by construction — that is the statement, not a
 * defect of the run. Fault U reads 100 % there for a different reason: its row
 * never enters the left bag at all.
 *
 * **Both references in one run.** Rule 2 is measured twice per §: against the
 * whole draft's Gesetzestext, as it was until 2026-09-10, and against the
 * Novellierungsanordnungen addressed to that § (`annex/rightColumn.ts`,
 * `draftReference`).
 * One run rather than two, because a comparison across two runs of a script
 * whose corpus can change is not a comparison.
 *
 * **How to read the table.** Per fault: how many §§ it could be injected into,
 * how many still pass the left check, and how many each rule catches. Beside
 * it, the corpus false-positive side, which is the number that has to stay
 * small — a rule that fires on sound annexes withholds real law, and this
 * harness would otherwise reward exactly that. Every § that only the narrow
 * reference refuses is printed with the words it is missing, because a count
 * cannot be inspected. The counts are the two right-column causes of
 * `harness/annexPdf.ts` over the same population, so the two harnesses
 * cross-check each other.
 *
 * **What it says on 2026-09-26** (GP XXVIII, both paths run separately; the
 * populations grew with the reading, the rates did not move):
 *
 * | | §§ | linke Prüfung | Regel 1 | Regel 2 ganz | Regel 2 je § | zusammen je § |
 * |---|---:|---:|---:|---:|---:|---:|
 * | L, PDF-Pfad    | 971 | 896 (92,3 %) | 385 (39,6 %) | 148 (15,2 %) | 355 (36,6 %) | 598 (61,6 %) |
 * | L, Tabellenpfad| 272 | 271 (99,6 %) | 153 (56,3 %) |  54 (19,9 %) | 103 (37,9 %) | 182 (66,9 %) |
 * | R-alt, PDF     | 932 | 932 (100 %)  |   9 ( 1,0 %) | 229 (24,6 %) | 614 (65,9 %) | 618 (66,3 %) |
 * | R-alt, Tabelle | 263 | 263 (100 %)  |   1 ( 0,4 %) | 118 (44,9 %) | 208 (79,1 %) | 208 (79,1 %) |
 * | R-neu, PDF     | 931 | 931 (100 %)  |  10 ( 1,1 %) | 115 (12,4 %) | 717 (77,0 %) | 717 (77,0 %) |
 * | R-neu, Tabelle | 262 | 262 (100 %)  |   1 ( 0,4 %) |  84 (32,1 %) | 218 (83,2 %) | 219 (83,6 %) |
 * | U, PDF         | 932 | 932 (100 %)  |   9 ( 1,0 %) |   5 ( 0,5 %) |   7 ( 0,8 %) |  16 ( 1,7 %) |
 * | U, Tabelle     | 263 | 263 (100 %)  |   2 ( 0,8 %) |   0 ( 0,0 %) |   2 ( 0,8 %) |   4 ( 1,5 %) |
 *
 * Read across: fault L gets past the left check in 92 to 100 % of cases,
 * which is what the right column had to be checked for at all; rule 1 is the
 * one that answers it. R-alt is rule 2's own case, and R-neu was the fault it
 * was measurably weakest on until its reference narrowed to one §. False
 * alarms without any fault (26.09.2026, over 2.495 §§ of the PDF path and
 * 1.452 of the table path): **21 and 19** §§ on the PDF path (rule 1 and
 * rule 2 per §) and **6 and 4** on the table path — 19 and 22 / 5 and 4 on
 * 2026-09-11; rule 2 stood at 7 and 0 with the
 * whole-draft reference; of the extra ones, the seventeenth is the one the better
 * addressing of 2026-09-11 uncovered (Obstweinverordnung § 13, whose right
 * column carries the start of the next Novellierungsanordnung. The PDF has
 * decided: that annex prints the draft's instructions in its right column
 * („4. § 13 samt Überschrift lautet: …“) instead of the proposed version,
 * under a proper header pair — 1 of 114 PDF annexes of GP XXVIII, 15 of 685
 * rows (2026-09-11). Our share is the row boundary alone: the PDF reader cuts
 * rows only at a § sign, so the start of the next instruction lands in the §
 * above. Cutting rows at an instruction number would mend it and touches
 * every annex, so it waits for a corpus measurement; until then the gate
 * withholds the § and gives the true reason; this is the R-neu fault, found
 * unstaged in the corpus), the eighteenth the one the shared
 * markup rule handed from the left check to rule 2 (MPBV § 11, below).
 *
 * **The populations keep growing, and that is the point of re-running it.**
 * Five engine changes of 2026-09-11 moved the PDF path 918/881/880 →
 * 942/905/904 and the table path 244/236/235 → 246/238/237; by 26.09.2026
 * they stand at 971/932/931 and 272/263/262 — §§ that used to fail the left
 * check now reach the injection site at all, most recently through the two
 * rules for the head of a Ganz-§-Zeile. The rates stayed put, which
 * is the finding: a bigger corpus, the same gate.
 *
 * The reach stated in `annex/rightColumn.ts` — 1.019 of 1.092, rule 1 464,
 * rule 2 181, together 567 — was measured over both paths at once and with a
 * narrower injection site (the § was skipped when its *first* changed row was
 * too short, even where a later one qualified). This script takes the first
 * row that satisfies the conditions, which is why its population is 1.161
 * rather than 1.092; the rates agree within a percentage point (43,4 % and
 * 52,4 % against 42,5 % and 51,9 %).
 *
 * Nothing is re-implemented here: the left check is `coverageOfParagraph` and
 * the right column is `rightColumnCheck`, the very functions the request path
 * calls, for the same reason `harness/annexPdf.ts` calls `verifyAnnex` — a
 * rule measured through a copy of itself measures the copy. What this run does
 * *not* replicate is `MAX_PARAGRAPHS`: it measures the rules over the whole
 * annex, so its false-alarm count is three higher than the gate's on the PDF
 * path (18 against 15), and the three sit in the tail of Sammelnovellen that
 * no request reaches. With the ceiling emulated the two numbers are equal.
 *
 * **And two faults in the engine's RESULT, since 01.10.2026** — the other gate,
 * the one in front of the consolidated text (`kons/tguOracle.ts`).
 * The annex is its witness there, and the question is whether the oracle
 * notices a result that holds MORE than the annex proposes. The engine runs
 * over every draft as in `harness/me.ts` (same modules), and in each § the
 * oracle confirms:
 *
 * - **E** — one of the engine's deletions undone: a whole struck unit of at
 *   least six words is put back where it stood. The Seilbahn-Entwurf § 10
 *   shape, where the engine kept an Absatz the Beilage strikes in a changed
 *   row and the oracle confirmed it (30.09.2026).
 * - **E-neben** — a replaced stretch put back beside its replacement:
 *   „ersetzt" read as „eingefügt".
 *
 * | 01.10.2026, GP XXVIII | E vorher | E nachher | E-neben vorher | E-neben nachher |
 * |---|---:|---:|---:|---:|
 * | PDF-Pfad     | 37/78 (47,4 %) | 76/78 (97,4 %) | 122/133 (91,7 %) | 132/132 (100 %) |
 * | Tabellenpfad | 69/89 (77,5 %) | 85/87 (97,7 %) | 109/113 (96,5 %) | 112/113 (99,1 %) |
 *
 * „Nachher" is with check 4 (`keptDeletion`). Without injection it withdraws
 * five of 1.948 confirmations; `--alarme`
 * prints each with its annex rows and the result, because a count cannot be
 * inspected. `--misses` lists what still gets through.
 *
 * **And the word classes, since 19.11.2026** — the question asked of the
 * oracle being whether it notices a result that is wrong by one word, one
 * figure or one place, where the classes above only ever asked about whole
 * units. One fault per § and class, at a deterministic site (the middle one
 * that qualifies), into the same confirmed §§, judged with every argument the
 * request path passes (`kons/consolidate.ts`):
 *
 * - **Wort-weg / Wort-neu / Wort-tausch** — one word dropped, another word of
 *   the same § put in, or a word replaced by one, inside a stretch a changed
 *   row prints in its proposed column (`wordGround`: the seven-word window
 *   around the site stands there, and only once in the result).
 *   **Wort-weg-Sinn** is the sub-class where the word dropped is one whose
 *   loss flips or widens the provision (nicht, kein*, nur, auch, oder, und,
 *   muss/müssen, kann/können, darf/dürfen, ausschließlich).
 * - **Zahl** — a figure changed by its last digit (amounts, percentages,
 *   years, ordinals, counts; not a date's day, not a citation's number).
 * - **Verweis** — the number or letter behind „§", „Abs.", „Z", „lit.",
 *   „Art." moved by one.
 * - **Ziffer-Reihe** — two neighbouring Ziffern of one Absatz swapped, both
 *   printed in changed rows: Reihe one level down, below check 5.
 * - **Überschrift** — a word of the § heading replaced, where a changed row
 *   prints the heading as such (before the § symbol, or as a heading row).
 * - **Ungedruckt-weg / -neu / -Zahl** — the word faults where no changed row
 *   prints anything: the engine touching text the draft does not touch.
 *   Check 3's ground. Broken down by whether an unchanged row prints the
 *   site or nothing does.
 * - **Zurück / Zurück-gleich** (19.11.2026) — an Absatz the engine struck put
 *   back under its old number, the Absätze after it renumbered back: a
 *   deletion with its renumbering carried out by neither half (BVergGVS
 *   § 30). „-gleich" where it opens like the Absatz after it. Before checks 4
 *   and 5 learnt the shape: 41 of 46 caught on the PDF path and 20 of 25 on
 *   the table path, 2 of 3 of „-gleich" on each; after: all of them.
 *
 * `checkOf` names which of the five checks caught each fault (P2r: check 2's
 * row order). 19.11.2026, GP XXVIII, 104 PDF and 137 table drafts — before
 * any change to the oracle, and after the three oracle commits of that night
 * (ordinals in `stripMarkers`, the heading a § opens with, the row order):
 *
 * | | PDF vorher | PDF nachher | Tabelle vorher | Tabelle nachher |
 * |---|---:|---:|---:|---:|
 * | Wort-weg        | 1365/1377 (99,1 %) | 1372/1377 (99,6 %) | 987/988 (99,9 %) | 988/988 (100 %) |
 * | Wort-weg-Sinn   | 1206/1224 (98,5 %) | 1219/1224 (99,6 %) | 854/861 (99,2 %) | 859/860 (99,9 %) |
 * | Wort-neu        | 1375/1377 (99,9 %) | 1376/1377 (99,9 %) | 987/988 (99,9 %) | 988/988 (100 %) |
 * | Wort-tausch     | 1375/1377 (99,9 %) | 1376/1377 (99,9 %) | 987/988 (99,9 %) | 988/988 (100 %) |
 * | Zahl            |  438/482 (90,9 %)  |  481/482 (99,8 %)  | 268/295 (90,8 %) | 294/296 (99,3 %) |
 * | Verweis         |  971/972 (99,9 %)  |  970/971 (99,9 %)  | 642/643 (99,8 %) | 642/643 (99,8 %) |
 * | Ziffer-Reihe    |  268/268 (100 %)   |  269/269 (100 %)   |  40/113 (35,4 %) | 113/113 (100 %) |
 * | Überschrift     |  971/1087 (89,3 %) | 1030/1087 (94,8 %) |  44/57 (77,2 %)  |  57/57 (100 %) |
 * | Ungedruckt-weg  |  671/1037 (64,7 %) |  674/1037 (65,0 %) | 569/849 (67,0 %) | 566/849 (66,7 %) |
 * | Ungedruckt-neu  |  251/1037 (24,2 %) |  247/1037 (23,8 %) | 236/849 (27,8 %) | 238/849 (28,0 %) |
 * | Ungedruckt-Zahl |  480/522 (92,0 %)  |  500/522 (95,8 %)  | 334/383 (87,2 %) | 374/385 (97,1 %) |
 *
 * The populations shift by a few §§ between the columns: a § the oracle no
 * longer confirms is no injection site. The classes of 01.10. and 26.10.
 * moved too — E 117/118 → 118/118 and 104/106 → 106/106 —, and without
 * injection the PDF path keeps its 1.548 confirmations (APG § 4 withdrawn,
 * PKG § 49b gained) while the table path withdraws three of 1.155 (StPO § 23,
 * EU-JZG § 2a, ApoBetrO § 33a; each named in its commit).
 *
 * Read: inside a printed stretch check 2 catches nearly everything, because it
 * wants each stretch as one unbroken run. What it let through were the
 * places its exceptions reach — the heading stack above a § and the stretch
 * read as a group heading alone —, figures `stripMarkers` took for a
 * Ziffer's marker („das 18. Lebensjahr", „nach dem 2. Hauptstück", a year
 * ending a sentence) on both sides alike, and on the table path the ORDER of
 * rows, since every row was looked up from the start of the result.
 *
 * **The second round of 19.11.2026** — check 3 in place (`unplacedChange`),
 * the § heading in the heading area of a cell, a struck Absatz that opens
 * like the next one (checks 4 and 5) —, from the base of that night to the
 * last of the three commits:
 *
 * | | PDF vorher | PDF nachher | Tabelle vorher | Tabelle nachher |
 * |---|---:|---:|---:|---:|
 * | Wort-weg        | 1374/1379 (99,6 %) | 1374/1376 (99,9 %) | 988/988 (100 %)  | 988/988 (100 %) |
 * | Wort-weg-Sinn   | 1221/1226 (99,6 %) | 1223/1223 (100 %)  | 859/860 (99,9 %) | 859/860 (99,9 %) |
 * | Überschrift     | 1031/1088 (94,8 %) | 1086/1087 (99,9 %) |  57/57 (100 %)   |  57/57 (100 %) |
 * | Ungedruckt-weg  |  676/1037 (65,2 %) | 1023/1033 (99,0 %) | 567/850 (66,7 %) | 845/849 (99,5 %) |
 * | Ungedruckt-neu  |  248/1037 (23,9 %) | 1030/1033 (99,7 %) | 238/850 (28,0 %) | 848/849 (99,9 %) |
 * | Ungedruckt-Zahl |  500/522 (95,8 %)  |  518/520 (99,6 %)  | 374/385 (97,1 %) | 383/384 (99,7 %) |
 * | Zurück          |   41/46 (89,1 %)   |   45/45 (100 %)    |  20/25 (80,0 %)  |  25/25 (100 %) |
 * | Reihe           | 1114/1128 (98,8 %) | 1121/1127 (99,5 %) | 814/820 (99,3 %) | 814/819 (99,4 %) |
 *
 * The other word classes and E stay where they were. Without injection the
 * PDF path keeps 1.543 of its 1.549 confirmations and the table path 1.151
 * of 1.153; every one withdrawn was read. Four are engine gaps behind a
 * refused instruction (IESG § 20 and IEF § 29, a § the draft dissolves into
 * another, its body kept; BBG § 61 and BAO § 48h, a heading the draft adds),
 * one a clean-applied result without a heading the annex prints (AußWG
 * § 70a), and three are correct results lost to the annex (corrected by the
 * branch review the same night): BD-EG § 38, where the annex reprints § 37's
 * heading over the new § 38 — the enacted § 38 has none (NOR40271540) —, and
 * TDBG § 40b, where the annex leaves Z 6 out („1. bis 6. …") though the
 * draft changes it — the BGBl bench's one identical confirmation lost at
 * 60, 120 and 200 Bundesgesetzblätter —, and HSG § 7, whose proposed column
 * numbers an Absatz (2) no instruction renumbers. The bench withdraws two
 * wrong confirmations besides (BVergGVS § 30, GSpG § 61) and moves nothing
 * on the XML path.
 *
 * **What check 3 in place was chosen over.** A count-based check 6 (the
 * engine's result less the standing text must change every word's count by
 * exactly as much as the annex's changed rows) caught every Ungedruckt fault
 * too, and withdrew 50 confirmations on the PDF path and 6 on the table
 * path: about 44 of them noise — group titles and a neighbouring §'s heading
 * carried into a cell, abbreviations spelt two ways („EKB-InvestitionsV"),
 * rows the table path pairs differently from the draft. Check 3 in place as
 * first prototyped withdrew 11 and 7, the LCS cutting a correct new Absatz
 * at words it shares with the next one, a placeholder „…" read as an
 * omission, a citation's last number lost to a chain's cut. All three are
 * read correctly now (`unplacedEitherWay`, `GLUED_ELLIPSIS_RE`, the second
 * cut of `keysOf`); `docs/decisions.md` keeps check 6 among the rejected.
 *
 * **What the oracle still cannot see.**
 * - A change whose four-word window also stands where the annex shows a
 *   change: the 10, 3 and 2 Ungedruckt misses on the PDF path, 4, 1 and 1 on
 *   the table path („Innen- [und] Außenbereich"). Reading a change under
 *   both tie-breaks of the LCS costs 0.7 points of Ungedruckt-weg on the PDF
 *   path (99,7 → 99,0 %) and none on the table path, for ten alarms on
 *   correct results that it removes.
 * - A change the annex itself leaves out is a contradiction, not a
 *   confirmation (TDBG § 40b): correct results the annex does not show are
 *   lost, by design.
 * - A group heading the draft changes: the result carries no group
 *   headings (`konsTree.context`), and nothing here holds them.
 * - A unit missing from RIS that the annex skips silently (Lücke-beide,
 *   3 of 16), as before.
 * - A § heading the draft adds beneath a group heading that both columns
 *   print: where the geltende column prints the group heading in front of
 *   the § symbol, `stackOkFor` lets any prefix go, so a result without the
 *   new heading is still confirmed (found by the branch review, 19.11.2026;
 *   not a regression — the BBG § 61 rule covers §§ without such a stack).
 * - Wort-weg on the PDF path rose 99,6 → 99,9 % by its denominator, not by
 *   catches: the misses sat in §§ whose confirmations check 3 in place
 *   withdraws.
 *
 * Held to the `--mindestens` floor (`flooredWordClasses`): every class at
 * ≥ 95 % on both paths with ≥ 20 tries when measured — Überschrift,
 * Ungedruckt-weg/-neu and Zurück since 19.11.2026, Payload since 20.11.2026,
 * Bezeichnung and Spalte-Bezeichnung since 21.11.2026
 * (`flooredClasses`). Zurück-gleich has 3 tries per path and is printed,
 * not floored.
 *
 * **Duplicate Absatz numbers are RIS's, not the engine's** (19.11.2026). The
 * Reihe fault used to swap two Absätze of the same number — Listing Act
 * § 117 „… 11, 11, …", 2. WaffV § 16 „… 7, 7" — a no-op counted as a miss.
 * Both pairs stand in RIS's own consolidated text (two Novellen gave the
 * same number); the one result that holds a number twice where the standing
 * § did not, EAG § 25c (3), prints it twice in the annex as well — the
 * draft's own numbering. Such sites are skipped, and every result holding a
 * number twice is listed with where it came from.
 *
 * `--urteile` prints every verdict on a line of its own, so two runs of an
 * oracle change can be compared § by § with `diff` rather than by totals.
 *
 * Usage:  npx vite-node -c vitest.config.ts scripts/harness/faultInjection.ts --gp=XXVIII [--xml] [--limit=N] [--only=8] [--misses] [--alarme] [--urteile] [--zeige=<§> [--voll]] [--liste-aus-cache]
 */
import { annexParagraphKey, comparableTokens, designationKey } from '../../server/utils/annex/annexText'
import { PARAGRAPH_THRESHOLD, coverageOfParagraph, isDisplayedChange } from '../../server/utils/annex/coverage'
import { paragraphReference } from '../../server/utils/annex/verdict'
import {
  MIN_STANDING_STRETCH,
  draftBags,
  draftReference,
  rightColumnCheck,
  type StandingText,
  type WordBag,
} from '../../server/utils/annex/rightColumn'
import { parseAnnexPdf } from '../../server/utils/annex/annexPdf'
import { pagesOf } from '../../server/utils/annex/annexPdfPages'
import { diffTokens } from '../../server/utils/diff/wordDiff'
import { plainText, type LawNode } from '../../server/utils/lawtext/konsTree'
import { displayTokens, normalizeText } from '../../server/utils/lawtext/normalize'
import { parseRisXml } from '../../server/utils/lawtext/risXml'
import { articleBlocks, draftArticles, type DraftArticle } from '../../server/utils/lawtext/draftArticles'
import { getText, type KonsLawAtDate, type KonsParagraphRef } from '../../server/utils/ris/konsLaw'
import { fetchParagraphTree } from '../../server/utils/harness/risKonsHistory'
import { parseTextComparison, type ComparisonRow } from '../../server/utils/annex/comparisonRows'
import { isScanned } from '../../server/utils/annex/tableCells'
import { applyNovelle, instructionsFromUnits, renamedOrigins, type Instruction, type StandingLaw } from '../../server/utils/kons/lawApply'
import { annexScope } from '../../server/utils/kons/consolidate'
import { ABSATZ_ORDER_NOTE, KEPT_DELETION_NOTE, LABEL_NOTE, PLACE_NOTE, ROW_ORDER_NOTE, absatzSequence, containmentKey, designatedUnitsOf, oracleVerdict, paragraphRows, rowsByParagraph, silentOmissions, standingUnitsOf, type OracleReport, type OracleVerdict, type StandingUnits } from '../../server/utils/kons/tguOracle'
import { printedStretches } from '../../server/utils/annex/elision'
import { segmentUnits } from '../../server/utils/lawtext/lawUnits'
import { isDivision, isSchedule, unitKey } from '../../server/utils/text/designation'
import { unitsByKey } from '../../server/utils/kons/konsGate'
import { loadKey } from './konsJudge'
import { installFetchCache, isBegutSearch } from '../lib/harnessCache'
import { windowLine, windowOf } from '../lib/annexReport'
import { renditionOfPages, witnessVerdict, type DraftRendition, type WitnessInstruction, type WitnessPlace } from '../../server/utils/kons/draftWitness'
import { writeFileSync } from 'node:fs'
import { argAssigned, argFlag } from '../lib/args'
import { corpusReach, floorOf, harnessStamp, type FloorStatus } from '../lib/harnessRecord'
import { risJson as risQuery, scriptUserAgent } from '../lib/http'
import { asArray, pickTextComparisons } from '../lib/ris'
import { bumpedDesignation, donorSentence, keptSentenceGone, lastSentenceGone, raisedNumber, secondSentenceGone, swappedWord } from '../lib/rightColumnFaults'
import { chainedAbsaetze } from '../lib/faultSites'
import { annexSources, resolveKonsLaw } from '../lib/productionSources'
import { annexStrictChecks } from '../../server/utils/annex/annexStrict'
import { markOf, OBJECTION_OVER_CONFIRMATION, type ObjectionRule } from '../../server/utils/annex/annexMark'
import { insertedStretches } from '../../server/utils/annex/rightColumn'
import type { StrictCheck } from '../../server/utils/laender/landTguStrict'

// The Begut list is fetched afresh; `--liste-aus-cache` replays the cached one on purpose (`lib/harnessCache.ts`).
const cache = installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache', { fresh: isBegutSearch, replay: argFlag('liste-aus-cache') })

const SCRIPT = 'harness/faultInjection'

/* eslint-disable @typescript-eslint/no-explicit-any */
const risJson = (params: Record<string, string>): Promise<any> => risQuery(params, { script: SCRIPT })

/**
 * Sentence boundaries in Austrian legal prose, which is mostly abbreviations.
 *
 * A plain `/(?<=\.)\s+(?=[A-Z])/` cuts "gemäß § 3 Abs. 2 Z 4 lit. b" into four
 * sentences, and the injected fault would then be a fragment rather than a
 * lost sentence — the instrument would be measuring itself. Kept verbatim from
 * the probe the published reach numbers were measured with (2026-09-10), so
 * this run stays comparable with them; it belongs here and not in production,
 * because nothing that ships splits sentences.
 */
const SENTENCE_SPLIT = /(?<![\s(](?:Abs|Nr|Z|Art|lit|sublit|BGBl|bzw|usw|vgl|idF|iVm|Dr|Mag|Ing|ca|Jg|Hrsg|Anm|gem|zB|bspw|inkl|exkl|Bd|Aufl|Kap|Pkt|Rz|RGBl|dRGBl|StGBl|ABl|EG|EU|EWR|GmbH|Co|AG|OG|KG|St|Hl|Nov|Dez|Jän|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Okt|Vorst|Univ|Prof|Präs|Min|Sekt|Abt|Gr|Erg|Fn|Ziff|S|sog)\.)(?<=[.;:!?])\s+(?=[A-ZÄÖÜ(„"])/

const toks = (text: string): string[] => comparableTokens(normalizeText(text))

/**
 * What one fault did to one §, under both references rule 2 can have.
 *
 * The two bags are measured in the same run on purpose: the whole-draft bag
 * and the per-§ bag differ only in what rule 2 may draw on, and a comparison
 * across two runs of a script whose corpus can change is not a comparison.
 */
interface Verdict {
  /** The left check on the faulted rows — 100 % by construction for R faults */
  leftPasses: boolean
  rule1: boolean
  /** Rule 2 against the whole draft's Gesetzestext */
  rule2Wide: boolean
  /** …and against the §'s own Novellierungsanordnungen plus its law's unreadable ones */
  rule2Para: boolean
}

/** One fault over the corpus. */
interface FaultTally {
  label: string
  tried: number
  leftPasses: number
  rule1: number
  rule2Wide: number
  rule2Para: number
  eitherWide: number
  eitherPara: number
  /**
   * What the gate as shipped withholds: the left check fails, or rule 1, or
   * rule 2 against the §'s instructions (19.11.2026). The columns above
   * cannot be added up to it, because they overlap.
   */
  shipped: number
  /**
   * Of `shipped`, the sites the gate as shipped withheld without the fault
   * too (20.11.2026): caught, but not because of this fault. Beside the
   * per-rule counts below, for the record `/genauigkeit` is built from.
   */
  shippedAlready: number
  /** Catches that were already firing without any fault — not this fault's */
  rule1Already: number
  rule2WideAlready: number
  rule2ParaAlready: number
  /**
   * The opposite, and the one nobody was counting: a rule that fired on the
   * sound § and falls silent once the fault is in.
   *
   * It is not a hypothetical. Both right-column rules exempt whatever stands in
   * the *left* column of the § (`rightColumnCheck`, `leftTokens`) — rightly, so
   * a sentence the ministry merely moved does not read as new — and every pair
   * row counts towards it, `unchanged` rows included. Text smuggled into the
   * left column is therefore an alibi for the right one, which is exactly what
   * fault U tests.
   */
  silenced: number
}

function tally(label: string): FaultTally {
  return { label, tried: 0, leftPasses: 0, rule1: 0, rule2Wide: 0, rule2Para: 0, eitherWide: 0, eitherPara: 0, shipped: 0, shippedAlready: 0, rule1Already: 0, rule2WideAlready: 0, rule2ParaAlready: 0, silenced: 0 }
}

function record(into: FaultTally, verdict: Verdict, base: Verdict): void {
  into.tried++
  if (verdict.leftPasses) into.leftPasses++
  if (verdict.rule1) into.rule1++
  if (verdict.rule2Wide) into.rule2Wide++
  if (verdict.rule2Para) into.rule2Para++
  if (verdict.rule1 || verdict.rule2Wide) into.eitherWide++
  if (verdict.rule1 || verdict.rule2Para) into.eitherPara++
  const withheld = (v: Verdict): boolean => !v.leftPasses || v.rule1 || v.rule2Para
  if (withheld(verdict)) into.shipped++
  if (withheld(verdict) && withheld(base)) into.shippedAlready++
  if (verdict.rule1 && base.rule1) into.rule1Already++
  if (verdict.rule2Wide && base.rule2Wide) into.rule2WideAlready++
  if (verdict.rule2Para && base.rule2Para) into.rule2ParaAlready++
  if ((base.rule1 && !verdict.rule1) || (base.rule2Para && !verdict.rule2Para)) into.silenced++
}

/** One § of one annex, resolved against RIS and ready to be broken. */
interface Judged {
  law: string | null
  para: string
  rows: ComparisonRow[]
  standing: StandingText
  /** The left column carried enough prose and the standing § accounts for it */
  leftPasses: boolean
  /** Whether the left check was even applicable (enough comparable words) */
  prose: boolean
}

/** The whole gate on one §'s rows, so a fault and its absence are measured alike. */
function judge(rows: readonly ComparisonRow[], standing: StandingText, wide: WordBag, para: WordBag): Verdict {
  const cover = coverageOfParagraph(rows, standing.text)
  const right = rightColumnCheck(rows, standing, wide)
  const narrow = rightColumnCheck(rows, standing, para)
  return {
    leftPasses: cover.prose && cover.ratio >= PARAGRAPH_THRESHOLD,
    // From the per-§ reference, the one the gate passes: since 25.10.2026 rule 1
    // asks it which stretches an adding instruction of this § carries
    // (`WordBag.carries`); the whole-draft bag has no such answer.
    rule1: narrow.alreadyStanding,
    rule2Wide: right.notInDraft,
    rule2Para: narrow.notInDraft,
  }
}

/** The rows of a § with one row replaced — the fault, and nothing else, changed. */
function withRow(rows: readonly ComparisonRow[], at: ComparisonRow, replacement: ComparisonRow): ComparisonRow[] {
  return rows.map((row) => (row === at ? replacement : row))
}

/**
 * The § with one more row, printing the same text in both columns — fault U.
 *
 * The shape of a mis-filed mirrored row: the annex prints a line that belongs
 * to another provision, identically left and right, and the row inherits the
 * designation of the § it stands under. It is what actually happens on the
 * table path, where a Teil-, Abschnitt- or Unterabschnitt heading stands
 * *above* the § it heads and therefore inherits the number of the one before it
 * (measured 11.09.2026: 52 of the 59 §§ such a rule would newly withhold).
 *
 * The donor is another §'s standing text rather than an invented sentence,
 * because the fault this measures is misfiling, not fabrication.
 */
function withMirroredRow(rows: readonly ComparisonRow[], like: ComparisonRow, text: string): ComparisonRow[] {
  return [...rows, { ...like, gld: null, current: text, proposed: text, change: 'unchanged', elided: false, segments: null, editorial: false }]
}

/**
 * The § with the first new text `edit` can break broken — Zahl, Wort,
 * Satz-weg (21.11.2026), the Länder's faults (`lib/rightColumnFaults.ts`).
 * A row the annex prints as inserted has its column edited; in a changed row
 * the first inserted stretch the edit applies to is found in the proposed
 * column and edited there, and the row is re-diffed as the reader would
 * diff it. Null where no new text has anything to break. The edit is told
 * what the column prints around the stretch: whether „1." is a Ziffer's
 * label depends on what stands in front of it and after it.
 */
function withNewTextEdited(rows: readonly ComparisonRow[], edit: (text: string, before: string, behind: string) => string | null): ComparisonRow[] | null {
  for (const row of rows) {
    if (row.kind !== 'pair' || row.elided) continue
    if (row.change === 'inserted') {
      const proposed = edit(row.proposed, '', '')
      if (proposed !== null) return withRow(rows, row, { ...row, proposed })
      continue
    }
    if (row.change !== 'changed' || !row.segments) continue
    // Where the stretch stands, by the diff's own words: the proposed
    // column's display words run index for index with the equal and inserted
    // segments. Until 21.11.2026 the first occurrence of the stretch's text
    // was edited, and a stretch „1" or „3" landed in „§ 139." or „§ 83."
    // before it — 13 of the 115 misses of „Zahl" on the PDF path.
    const words = displayTokens(row.proposed)
    let j = 0
    for (const segment of row.segments) {
      if (segment.type === 'removed') continue
      const n = segment.text.split(' ').length
      const at = j
      j += n
      if (segment.type !== 'inserted' || words.slice(at, at + n).join(' ') !== segment.text) continue
      const edited = edit(segment.text, at > 0 ? `${words.slice(0, at).join(' ')} ` : '', at + n < words.length ? ` ${words.slice(at + n).join(' ')}` : '')
      if (edited === null) continue
      const proposed = [...words.slice(0, at), edited, ...words.slice(at + n)].join(' ')
      return withRow(rows, row, { ...row, proposed, segments: diffTokens(row.current, proposed).segments })
    }
  }
  return null
}

/**
 * The § with a sentence it keeps lost from the right column — R-weg
 * (21.11.2026): the first sentence of a row that stands alike in both
 * columns, long enough to be a sentence (`MIN_STANDING_STRETCH`), gone from
 * the proposed one, and the row re-diffed (`keptSentenceGone`, shared with
 * the Länder harness). The page then shows the draft striking a sentence it
 * leaves alone. Neither of the gate's rules reads struck text, so the gate is
 * blind to it by construction; the table's draft check reads it since
 * 22.11.2026 (the chain, `judgeChain`).
 *
 * **A sentence of the law's text (21.11.2026)**: on the PDF path a row's
 * first „sentence" by the splitter is the heading stack with the § opening
 * („Allgemeines § 31. (1) Die …"), and 199 of the oracle's 218 misses were
 * that stack struck, not a sentence. What stands before the § designation
 * and the markers after it are cut off, and what is left has to be a
 * sentence (`isSentence`).
 */
function withKeptSentenceLost(rows: readonly ComparisonRow[]): ComparisonRow[] | null {
  for (const row of rows) {
    if (row.kind !== 'pair' || row.elided || (row.change !== 'changed' && row.change !== 'unchanged')) continue
    const proposed = keptSentenceGone(row.current, row.proposed, SENTENCE_SPLIT, toks)
    if (proposed === null) continue
    return withRow(rows, row, { ...row, proposed, change: 'changed', segments: diffTokens(row.current, proposed).segments })
  }
  return null
}

interface DraftResult {
  cite: string
  judged: number
  injected: number
}

// --- The whole chain the page runs: gate, then the table (`annexMark.ts`) ---
/**
 * A fault in the annex judged as the page judges it (21.11.2026): the gate
 * (`judge`), then the table of `annex/annexMark.ts` — the draft check on the
 * faulted rows and the oracle on them — with three outcomes: withheld,
 * marked (either pill), shown without a mark. Over the §§ the page shows
 * without a mark before the fault, and under each value of the table's one
 * open cell (`OBJECTION_OVER_CONFIRMATION`).
 *
 * The gate is `judge` per § (the left check and both rules against the §'s
 * instructions), so the states the whole annex adds — a change too long for
 * the word diff, the repeal rule, a § printed twice — are not modelled; none
 * applies to a § the gate verified before the fault. The oracle judges again
 * the § of our result it confirmed, the annex's rows swapped for the faulted
 * ones (`chainOracle`); where the rows it reads for that § hold no faulted
 * row (another cut of the §), its confirmation stands — which can only
 * understate what is caught, and is counted (`oracleAsked`).
 */
type ChainKey = 'zahl' | 'bezeichnung' | 'wort' | 'satzweg' | 'rweg' | 'links' | 'ralt' | 'rneu'
interface ChainTally {
  label: string
  tried: number
  withheld: number
  marked: number
  unmarked: number
  /** The same under each value of `OBJECTION_OVER_CONFIRMATION`, each over the §§ it shows without a mark before the fault; the figures above are the rule's in force. */
  byRule: Record<ObjectionRule, { tried: number; withheld: number; marked: number; unmarked: number }>
  /** Faults in §§ the oracle confirmed before, and of those the ones where it read the faulted row again — in the rest its confirmation stands. */
  oracleBefore: number
  oracleAsked: number
  /** What got through unmarked, for `--misses`: the §, and which check let it pass. */
  misses: string[]
}
const RULES: readonly ObjectionRule[] = ['missing', 'clean', 'unconfirmed']
const chainTally = (label: string): ChainTally => ({ label, tried: 0, withheld: 0, marked: 0, unmarked: 0, byRule: { missing: { tried: 0, withheld: 0, marked: 0, unmarked: 0 }, clean: { tried: 0, withheld: 0, marked: 0, unmarked: 0 }, unconfirmed: { tried: 0, withheld: 0, marked: 0, unmarked: 0 } }, oracleBefore: 0, oracleAsked: 0, misses: [] })
const chainFaults: Record<ChainKey, ChainTally> = {
  zahl: chainTally('Zahl im Text, rechts'),
  bezeichnung: chainTally('Bezeichnung, rechts'),
  wort: chainTally('Wort getauscht, rechts'),
  satzweg: chainTally('neuer Satz fehlt, rechts'),
  rweg: chainTally('behaltener Satz rechts gestrichen'),
  links: chainTally('Satz links verloren'),
  ralt: chainTally('fremder geltender Satz rechts'),
  rneu: chainTally('fremder Entwurfssatz rechts'),
}
/** The classes held to 95 % under `--mindestens` (withheld or marked, the rule in force), on both paths unless `CHAIN_NOT_FLOORED` names one. */
const CHAIN_FLOORED: readonly ChainKey[] = ['zahl', 'wort', 'satzweg', 'ralt', 'rneu']
const CHAIN_FLOOR = 95
/**
 * Why a class is not held to the floor (22.11.2026), on one path or on both:
 * where the draft check holds the faulted §, the § stays clean whatever the
 * oracle says (`annex/annexMark.ts`), so each of these misses where the draft
 * check cannot see the fault (and where the oracle, holding the columns by
 * containment, cannot see what a column lacks) — the floor would fail by
 * construction, not because the chain fell. In the record as `notFloored`.
 */
const CHAIN_NOT_FLOORED: Partial<Record<ChainKey, { path?: 'pdf' | 'table'; why: string }>> = {
  bezeichnung: { why: 'eine Absatz- oder Ziffernbezeichnung hält die Prüfung gegen den Entwurf, wo ein Text des Entwurfs für den Paragraphen dieselbe Bezeichnung irgendwo druckt' },
  rweg: { why: 'die Prüfung gegen den Entwurf rechnet einen gestrichenen Satz dem Entwurf zu, wo eine Anordnung dieselbe oder die nächste Einheit neu fasst oder in derselben Einheit Sätze nur nach ihrer Lage streicht („der letzte Satz entfällt“); oder die Lesefassung bestätigt den Paragraphen gegen ihren Einwand; auf dem PDF-Pfad hält der Injektor auch eine Abschnittsüberschrift vor der Paragraphenbezeichnung für einen Satz' },
  links: { why: 'ein Satz, der links fehlt, steht rechts als neu: schreibt ihn der Entwurf selbst, hält ihn die Prüfung gegen den Entwurf; ob er schon galt, prüft nur die linke Spalte gegen das RIS' },
  rneu: { path: 'table', why: 'beginnt der Paragraph des Spenders mit einer Überschrift, ist der Spender diese Überschrift; eine Überschrift am Ende des neuen Textes halten die Prüfung gegen den Entwurf und das Orakel für die des folgenden Paragraphen' },
}
const notFlooredOf = (key: ChainKey): string | undefined => {
  const not = CHAIN_NOT_FLOORED[key]
  return not && (!not.path || not.path === (xmlMode ? 'table' : 'pdf')) ? not.why : undefined
}
/**
 * What the oracle says per draft (`injectIntoResults`): for every § group of
 * the annex it confirmed, the oracle again over the same result with some of
 * the annex's rows swapped for faulted ones — whether it still confirms, and
 * whether a swapped row was among the rows it reads at all.
 */
const chainOracle = { judges: new Map<string, ((swap: ReadonlyMap<ComparisonRow, ComparisonRow>) => { confirms: boolean; read: boolean })[]>() }
const showsChangeOf = (rows: readonly ComparisonRow[]): boolean => insertedStretches(rows).length > 0 || rows.some(isDisplayedChange)

async function inject(doc: any): Promise<DraftResult | null> {
  const meta = doc?.Data?.Metadaten
  const begut = meta?.Bundesrecht?.Begut
  const cite = String(begut?.Begutachtungsverfahrennummer ?? begut?.Verfahrensnummer ?? meta?.Bundesrecht?.Kurztitel ?? meta?.Technisch?.ID ?? '?').slice(0, 34)
  const beginn: string | null = begut?.BeginnBegutachtungsfrist ?? null
  if (!beginn) return null

  const contents = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  const main = contents.find((c) => c?.ContentType === 'MainDocument')
  const annex = pickTextComparisons(contents, (c) => String(c?.Name ?? ''))[0]
  if (!annex) return null
  const annexXml = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  const pdfUrl = asArray<any>(annex?.Urls?.ContentUrl).find((u) => u?.DataType === 'Pdf')?.Url ?? null
  const annexXmlText = annexXml ? await getText(annexXml) : null
  const readable = annexXmlText !== null && !isScanned(annexXmlText)
  // One path per run, the same switch `harness/annexPdf.ts` uses: the two
  // parsers fail differently, so an aggregate over both would hide which one
  // the gate is protecting the reader from.
  if (xmlMode !== readable) return null
  if (!readable && !pdfUrl) return null

  const mainXml = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Xml')?.Url ?? null
  if (!mainXml) return null
  const draftBlocks = parseRisXml(await getText(mainXml))
  const articles = draftArticles(draftBlocks)
  const amending = articles.filter((a) => a.amends)
  if (amending.length === 0) return null
  // Rule 2's two references, both built as the gate builds them: the whole
  // draft's Gesetzestext, and the §-wise index over its Novellierungs-
  // anordnungen (`draftBags`). Which of the two a § of the annex gets is
  // `bagFor`'s decision, not this script's.
  const bags = draftBags(draftBlocks)
  // The reference as it was until 2026-09-10: every word of the draft, for
  // whichever § asks. Kept beside the new one so the two are measured in the
  // same run over the same corpus.
  const wide: WordBag = { has: (w) => bags.whole.has(w), read: bags.whole.size > 0 }
  coverage.units += bags.units
  coverage.addressed += bags.addressed
  coverage.rightly += bags.rightlyWithoutParagraph
  for (const [reason, n] of bags.reasons) coverage.reasons.set(reason, (coverage.reasons.get(reason) ?? 0) + n)

  const parsed = readable
    ? parseTextComparison(annexXmlText, articles)
    : parseAnnexPdf(await pagesOf(new Uint8Array(await (await fetch(pdfUrl!, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })).arrayBuffer())), articles)
  if (parsed.refusal || parsed.rows.length === 0) return null

  const byKey = new Map<string | null, DraftArticle>(articles.map((a) => [a.key, a]))
  const resolved = new Map<string, KonsLawAtDate | null>()
  /**
   * The law of an Artikel as the page finds it (`resolveKonsLaw`, 21.11.2026):
   * the Stammnorm with the draft's clause, on the day as it stood. `byName`
   * is the Lesefassung's extra step (`kons/consolidate.ts`): a clause that
   * cites no Stammnorm is looked up by its name; the annex check does not
   * take it (`verifyAnnex`). A failure throws, and the draft is not reached.
   */
  const lawOf = async (key: string | null, byName = false): Promise<KonsLawAtDate | null> => {
    const id = `${key ?? ''}|${byName}`
    if (resolved.has(id)) return resolved.get(id)!
    const article = key === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(key)
    let law: KonsLawAtDate | null = null
    if (article?.amends && article.bgbl) law = await resolveKonsLaw(article.bgbl.organ, article.bgbl.nummer, beginn, article.title ?? '', article.clause)
    else if (article?.amends && byName && article.clause) law = await resolveKonsLaw('', '', beginn, article.title ?? '', article.clause)
    resolved.set(id, law)
    return law
  }
  const indexes = new Map<KonsLawAtDate, Map<string, KonsParagraphRef>>()
  const indexOf = (law: KonsLawAtDate): Map<string, KonsParagraphRef> => {
    let index = indexes.get(law)
    if (!index) {
      index = new Map<string, KonsParagraphRef>()
      for (const [label, ref] of Object.entries(law.paragraphs)) {
        const key = designationKey(label)
        if (key !== null && !index.has(key)) index.set(key, ref)
      }
      indexes.set(law, index)
    }
    return index
  }

  // Per §, not per row: the annex splits one provision over as many rows as
  // its layout needs, and a fault injected into one row is a fault in the §.
  const groups = new Map<string, { law: string | null; para: string; rows: ComparisonRow[] }>()
  for (const row of parsed.rows) {
    if (row.kind !== 'pair') continue
    const para = row.gld ?? row.para
    if (!para) continue
    const key = annexParagraphKey(row.law, para)
    const group = groups.get(key) ?? { law: row.law, para, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }

  const judgedParas: Judged[] = []
  for (const group of groups.values()) {
    const law = await lawOf(group.law)
    if (!law) continue
    const key = designationKey(group.para)
    if (key === null) continue
    // Across a version gap on the day, as the gate reads it (`paragraphAcrossGap`).
    const ref = indexOf(law).get(key) ?? (group.rows.some(isDisplayedChange) ? await annexSources.paragraphAcrossGap!(law.gesetzesnummer, key, beginn) : null)
    if (!ref) continue
    const tree = await fetchParagraphTree(ref)
    // A § RIS holds as a table is not represented as a tree, so there is
    // nothing to hold the column against and nothing to break.
    if (!tree) continue
    const heading = [...tree.context, tree.heading ?? ''].join(' ')
    const standing: StandingText = { text: [...tree.context, plainText(tree)].join(' '), heading }
    const cover = coverageOfParagraph(group.rows, standing.text)
    judgedParas.push({
      law: group.law,
      para: group.para,
      rows: group.rows,
      standing,
      leftPasses: cover.prose && cover.ratio >= PARAGRAPH_THRESHOLD,
      prose: cover.prose,
    })
  }

  // The false-positive side, over the population the shipped gate applies the
  // two right-column causes to: every § whose left column did not *fail*
  // (`verifyAnnex` records 'standing' first, so a § that failed the left check
  // never reaches the right-column causes). The counts are therefore the two
  // "einbehalten" lines of `harness/annexPdf.ts`, up to `MAX_PARAGRAPHS` —
  // see the note under the table.
  /**
   * The §-wise reference for one § of the annex — `draftReference`'s own
   * decision, joined as the gate joins it for a renumbered §
   * (`paragraphReference`), so the script measures the shipped lookup and not
   * a second reading of the index. `shown` is what the annex prints a block of its own
   * for, per law, which is the distinction that keeps a merged block from
   * reading as unexplained text.
   */
  const shown = new Map<string | null, Set<string>>()
  for (const group of groups.values()) {
    const key = designationKey(group.para)
    if (key === null) continue
    const into = shown.get(group.law) ?? new Set<string>()
    into.add(key)
    shown.set(group.law, into)
  }
  const references = new Map<string | null, (para: string) => WordBag>()
  const bagOf = (para: Judged): WordBag => {
    let reference = references.get(para.law)
    if (!reference) {
      reference = draftReference(bags, para.law, shown.get(para.law) ?? new Set<string>())
      references.set(para.law, reference)
    }
    const lookup = reference
    return paragraphReference(para, (_law, designation) => lookup(designation))
  }
  // Where that lookup landed, which is the coverage question: a § whose law
  // the index does not know falls back to the whole draft (the rule as it
  // shipped), and a § its law knows but never addresses gets the general bag
  // alone — the only class that can produce a new false alarm.
  for (const para of judgedParas) {
    if (!bags.byLaw.has(para.law) && !bags.general.has(para.law)) coverage.noLawBag++
    else if (bags.byLaw.get(para.law)?.get(designationKey(para.para) ?? '') === undefined) coverage.noOwnBag++
    else coverage.ownBag++
  }

  const base = new Map<Judged, Verdict>()
  for (const para of judgedParas) {
    const verdict = judge(para.rows, para.standing, wide, bagOf(para))
    base.set(para, verdict)
    if (para.prose && !para.leftPasses) continue
    corpus.held++
    if (verdict.rule1) corpus.rule1++
    if (verdict.rule2Wide) corpus.rule2Wide++
    if (verdict.rule2Para) corpus.rule2Para++
    if (verdict.rule1 || verdict.rule2Wide) corpus.eitherWide++
    if (verdict.rule1 || verdict.rule2Para) corpus.eitherPara++
    // The whole risk of the narrower reference. Every § that only the per-§
    // bag refuses is named here with the words it is missing, because a false
    // alarm withholds real law and a count cannot be inspected.
    if (verdict.rule2Para && !verdict.rule2Wide) {
      const check = rightColumnCheck(para.rows, para.standing, bagOf(para))
      const own = bags.byLaw.get(para.law)?.get(designationKey(para.para) ?? '')
      corpus.newAlarms.push(`${cite} ${para.para}${para.law ? ` [${para.law.slice(0, 28)}]` : ''} — ${check.missingWords}/${check.newWords} fehlen${own ? '' : ', ohne eigenen Sack'}: ${check.missing.slice(0, 9).join(' ')}`)
    }
    if (verdict.rule2Wide && !verdict.rule2Para) {
      corpus.lostAlarms.push(`${cite} ${para.para} — nur der ganze Entwurf meldete`)
    }
  }

  let injected = 0
  const confirmed = judgedParas.filter((p) => p.leftPasses)
  /** The faults of this draft for the chain, judged by the gate; the table judges them once the oracle has spoken. */
  const chain: { key: ChainKey; para: Judged; rows: ComparisonRow[]; verdict: Verdict }[] = []
  for (const para of confirmed) {
    const baseVerdict = base.get(para)!
    // The right column's new text misread, and a kept sentence lost from it
    // (21.11.2026): every § the left check confirms, as the Länder harness
    // asks every § it shows — not only those with a site for the faults below.
    const edits = [[faults.Zahl, raisedNumber, 'zahl'], [faults.Bezeichnung, bumpedDesignation, 'bezeichnung'], [faults.Wort, swappedWord, 'wort'], [faults.SatzWeg, (t: string) => lastSentenceGone(t, SENTENCE_SPLIT), 'satzweg']] as const
    for (const [into, edit, key] of edits) {
      const faulted = withNewTextEdited(para.rows, edit)
      if (!faulted) continue
      const verdict = judge(faulted, para.standing, wide, bagOf(para))
      record(into, verdict, baseVerdict)
      chain.push({ key, para, rows: faulted, verdict })
    }
    const lostRight = withKeptSentenceLost(para.rows)
    if (lostRight) {
      const verdict = judge(lostRight, para.standing, wide, bagOf(para))
      record(faults.Rweg, verdict, baseVerdict)
      chain.push({ key: 'rweg', para, rows: lostRight, verdict })
    }
    // The injection site: a row the page shows as a word diff, whose left
    // column is long enough that losing one sentence of it still leaves a
    // judgeable §. A row picked without those conditions would measure the
    // annex's line breaks rather than the gate.
    const site = para.rows.find((row) => {
      if (row.kind !== 'pair' || row.change !== 'changed' || row.elided || !row.segments) return false
      // Three sentences, thirty words, a second of six at least (`secondSentenceGone`, shared with the Länder harness).
      return secondSentenceGone(row.current, SENTENCE_SPLIT, toks) !== null
    })
    if (!site) continue
    injected++

    // Fault L: the sentence is gone from the left column and the word diff is
    // recomputed, exactly as it would have been had the parser lost the line.
    const lostCurrent = secondSentenceGone(site.current, SENTENCE_SPLIT, toks)!
    const faultL = withRow(para.rows, site, { ...site, current: lostCurrent, segments: diffTokens(lostCurrent, site.proposed).segments })
    const verdictL = judge(faultL, para.standing, wide, bagOf(para))
    record(faults.L, verdictL, baseVerdict)
    chain.push({ key: 'links', para, rows: faultL, verdict: verdictL })

    // Both R faults take their donor from another § of the same law that the
    // gate also confirmed — one from the standing text RIS holds for it, one
    // from what the annex proposes for it.
    const donors = confirmed.filter((other) => other !== para && other.law === para.law)
    const sentence = (text: string): string | null => donorSentence(text, SENTENCE_SPLIT, toks)
    const oldDonor = donors.map((other) => sentence(other.standing.text)).find((s) => s !== null) ?? null
    const newDonor = donors.map((other) => sentence(other.rows.map((r) => r.proposed).join(' '))).find((s) => s !== null) ?? null

    for (const [donor, into, key] of [[oldDonor, faults.Rold, 'ralt'], [newDonor, faults.Rnew, 'rneu']] as const) {
      if (donor === null) continue
      const garbled = `${site.proposed} ${donor}`
      const faultR = withRow(para.rows, site, { ...site, proposed: garbled, segments: diffTokens(site.current, garbled).segments })
      const verdictR = judge(faultR, para.standing, wide, bagOf(para))
      record(into, verdictR, baseVerdict)
      chain.push({ key, para, rows: faultR, verdict: verdictR })
    }

    // Fault U: one more row, another §'s standing text printed in both columns.
    // The TODO's own wording for the class — „eine falsch gepaarte Zeile, die in
    // beiden Spalten dasselbe druckt, ist unsichtbar" — and this run is what
    // turns „unsichtbar" from a fear into a number. Nothing can catch it by
    // construction: the left check reads only the rows the page shows as a
    // change (`isDisplayedChange`), and both right-column rules read only what
    // the word diff shows as *inserted*, of which a mirrored row has nothing.
    // The number that is not settled in advance is `silenced`.
    if (oldDonor !== null) record(faults.U, judge(withMirroredRow(para.rows, site, oldDonor), para.standing, wide, bagOf(para)), baseVerdict)
  }
  // The draft's PDF in the same record: the second witness's reading (`kons/draftRendition.ts`).
  const mainPdf = asArray<any>(main?.Urls?.ContentUrl).find((u) => u?.DataType === 'Pdf')?.Url ?? null
  chainOracle.judges.clear()
  await injectIntoResults(cite, draftBlocks, amending.length, parsed.rows, (key) => lawOf(key, true), () => renditionOf(mainPdf))
  judgeChain(cite, parsed.rows, { articles, blocks: draftBlocks }, base, chain)
  return { cite, judged: confirmed.length, injected }
}

/**
 * The table over this draft's faults (`chainFaults`). The draft check runs
 * once per class over the whole annex with every faulted § in place — its
 * § groups are judged each on their own, so the faults do not meet — and
 * once over the rows as parsed for the state before the fault.
 */
function judgeChain(cite: string, rows: readonly ComparisonRow[], draft: { articles: readonly DraftArticle[]; blocks: ReturnType<typeof parseRisXml> }, base: ReadonlyMap<Judged, Verdict>, chain: readonly { key: ChainKey; para: Judged; rows: ComparisonRow[]; verdict: Verdict }[]): void {
  const withheld = (v: Verdict): boolean => !v.leftPasses || v.rule1 || v.rule2Para
  const before = annexStrictChecks(rows, draft)
  const after = new Map<ChainKey, Map<string, StrictCheck>>()
  for (const key of new Set(chain.map((c) => c.key))) {
    const mine = chain.filter((c) => c.key === key)
    const faulted = new Set(mine.map((c) => annexParagraphKey(c.para.law, c.para.para)))
    const others = rows.filter((r) => r.kind !== 'pair' || !(r.gld ?? r.para) || !faulted.has(annexParagraphKey(r.law, (r.gld ?? r.para)!)))
    after.set(key, annexStrictChecks([...others, ...mine.flatMap((c) => c.rows)], draft))
  }
  for (const c of chain) {
    const groupKey = annexParagraphKey(c.para.law, c.para.para)
    if (withheld(base.get(c.para)!)) continue
    const oracleBefore = chainOracle.judges.has(groupKey)
    const inputBefore = { verdict: 'verified' as const, uncheckedReason: null, showsNewText: insertedStretches(c.para.rows).length > 0, showsChange: showsChangeOf(c.para.rows), strict: before.get(groupKey), oracleConfirmed: oracleBefore }
    // Each value of the open cell over the §§ it shows without a mark before the fault; the class's own figures are the rule's in force.
    const rules = RULES.filter((rule) => markOf(inputBefore, rule).kind === 'gate')
    if (rules.length === 0) continue
    const inForce = rules.includes(OBJECTION_OVER_CONFIRMATION)
    const tally = chainFaults[c.key]
    for (const rule of rules) tally.byRule[rule].tried++
    if (inForce) tally.tried++
    if (withheld(c.verdict)) {
      for (const rule of rules) tally.byRule[rule].withheld++
      if (inForce) tally.withheld++
      continue
    }
    const swap = new Map<ComparisonRow, ComparisonRow>()
    c.para.rows.forEach((r, i) => {
      if (c.rows[i] !== r && c.rows[i]) swap.set(r, c.rows[i]!)
    })
    const again = oracleBefore ? (chainOracle.judges.get(groupKey) ?? []).map((judge) => judge(swap)) : []
    const oracleAfter = oracleBefore && again.every((a) => a.confirms)
    if (inForce && oracleBefore) tally.oracleBefore++
    if (inForce && again.some((a) => a.read)) tally.oracleAsked++
    const input = { verdict: 'verified' as const, uncheckedReason: null, showsNewText: insertedStretches(c.rows).length > 0, showsChange: showsChangeOf(c.rows), strict: after.get(c.key)!.get(groupKey), oracleConfirmed: oracleAfter }
    for (const rule of rules) tally.byRule[rule][markOf(input, rule).kind === 'gate' ? 'unmarked' : 'marked']++
    if (!inForce) continue
    if (markOf(input).kind === 'gate') {
      tally.unmarked++
      // What accounts for the struck words (`struckAccount`), to tell a miss's class from the harness's own line (22.11.2026).
      const by = input.strict?.struck
      const struck = by ? `; gestrichen: benannt ${by.named}, neu gefasst ${by.rewritten}, aufgehoben ${by.repealed}, nach Lage ${by.byPosition}, Notation ${by.notation}` : ''
      tally.misses.push(`${cite} ${c.para.para}${c.para.law ? ` [${c.para.law.slice(0, 28)}]` : ''} — Entwurfsprüfung ${input.strict?.state ?? '—'}${input.strict?.state === 'holds' ? ` (${input.strict.newWords} neue Wörter)` : ''}, Orakel ${oracleAfter ? `bestätigt${again.some((a) => a.read) ? '' : ' (die Fehlerzeile nicht gelesen)'}` : 'nicht'}${struck} — ${faultSite(c.para.rows, c.rows)}`)
    } else tally.marked++
  }
}

/**
 * Where a faulted § differs from the § it was built from, for `--misses`: the
 * column and the text around the first difference, with what stood there
 * before. A miss is read at this place — without it a line says only which
 * check let the § pass, and the reader of a miss has to rebuild the fault.
 */
function faultSite(before: readonly ComparisonRow[], after: readonly ComparisonRow[]): string {
  for (let i = 0; i < before.length; i++) {
    const a = before[i]!
    const b = after[i]
    if (!b || a === b) continue
    for (const column of ['proposed', 'current'] as const) {
      if (a[column] === b[column]) continue
      let at = 0
      while (at < a[column].length && a[column][at] === b[column][at]) at++
      return `${column === 'proposed' ? 'rechts' : 'links'} …${b[column].slice(Math.max(0, at - 50), at)}‖${b[column].slice(at, at + 110)} (vorher: ${a[column].slice(at, at + 60) || '—'})`
    }
  }
  return 'keine Zeile geändert'
}

// --- Faults in the RESULT: the oracle (`kons/tguOracle.ts`) ------------------

/**
 * A removed stretch has to be a unit or a sentence, not a word: six words is
 * `MIN_STANDING_STRETCH`, the floor the right-column rules work from.
 */
const MIN_KEPT_TOKENS = MIN_STANDING_STRETCH

/** One fault class of the engine's result, over the §§ the oracle confirmed. */
interface OracleTally {
  label: string
  tried: number
  caught: number
  /** …of which by the check that asks whether the result holds what the annex strikes */
  byKept: number
  /** The word classes: which of the five checks caught it (`checkOf`) */
  byCheck: Map<string, number>
  /** „Ungedruckt": tried and caught per kind of site */
  kinds: Map<string, [number, number]>
  misses: string[]
}

const oracleTally = (label: string): OracleTally => ({ label, tried: 0, caught: 0, byKept: 0, byCheck: new Map(), kinds: new Map(), misses: [] })

/**
 * The result with ONE of the engine's deletions undone — the fault class
 * „eine Einheit zu viel" (30.09.2026).
 *
 * Built from the engine's own word diff of the standing § against its result,
 * so the stretch put back is text the engine removed and the annex confirmed
 * as removed: exactly the Seilbahn § 10 shape, where the engine kept an
 * Absatz the Beilage strikes. `replaced` picks the other half of the class —
 * a stretch the engine replaced, put back beside its replacement: old and new
 * text side by side, which is „ersetzt" read as „eingefügt".
 *
 * **A unit, not a diff segment.** The LCS pairs a deleted Litera's „die" or
 * „der" with the same word further on, so one struck unit comes out of the
 * diff as several removed segments with one- or two-word equal runs between
 * them. Putting back one of those segments would inject a fragment no engine
 * produces; the pure class therefore puts back the whole *block* — removed
 * segments joined across equal runs shorter than `BRIDGE` — which is exactly
 * the standing text there, because the bridging words are shared.
 *
 * `control` is the same text rebuilt from the same segments without the
 * fault, and it is judged too: the segments are display tokens joined by
 * spaces, and a site where that alone moves the verdict measures the
 * reconstruction, not the oracle.
 */
function withKeptRemoval(before: string, got: string, replaced: boolean): { control: string; faulted: string; kept: string } | null {
  const { segments } = diffTokens(before, got)
  if (!segments) return null
  const keep = new Set<number>()
  for (let i = 0; i < segments.length && keep.size === 0; i++) {
    if (segments[i]!.type !== 'removed') continue
    if (replaced) {
      const besideInsert = segments[i - 1]?.type === 'inserted' || segments[i + 1]?.type === 'inserted'
      if (besideInsert && toks(segments[i]!.text).length >= MIN_KEPT_TOKENS) keep.add(i)
      continue
    }
    // The block: removed segments bridged by short equal runs, no insertion
    // inside it or beside it.
    const block = [i]
    let j = i
    while (segments[j + 1]?.type === 'equal' && toks(segments[j + 1]!.text).length < BRIDGE && segments[j + 2]?.type === 'removed') {
      j += 2
      block.push(j)
    }
    const besideInsert = segments[i - 1]?.type === 'inserted' || segments[j + 1]?.type === 'inserted'
    const size = block.reduce((n, k) => n + toks(segments[k]!.text).length, 0)
    if (!besideInsert && size >= MIN_KEPT_TOKENS) for (const k of block) keep.add(k)
    i = j
  }
  if (keep.size === 0) return null
  const join = (put: (i: number) => boolean): string => segments.filter((s, i) => s.type !== 'removed' || put(i)).map((s) => s.text).join(' ')
  const kept = [...keep].map((k) => segments[k]!.text).join(' … ')
  return { control: join(() => false), faulted: join((i) => keep.has(i)), kept }
}

/** Equal runs shorter than this inside a struck unit are the LCS pairing a function word by chance. */
const BRIDGE = 3

/** The ids of a §'s Absätze — where the faults pick their Absatz. */
const absOf = (node: LawNode): string[] => node.children.filter((c) => c.level === 'abs').map((c) => c.id)

/** „(1h)" → „1h", every Absatz marker the annex's proposed column prints for this §. */
function printedAbsaetze(rows: readonly ComparisonRow[], elidedOnly: boolean): Set<string> {
  const out = new Set<string>()
  for (const r of rows) {
    if (r.kind !== 'pair' || !r.proposed || (elidedOnly && !r.elided)) continue
    for (const m of normalizeText(r.proposed).matchAll(/(?:^|\s)\((\d+[a-z]*)\)(?=\s|$)/g)) out.add(m[1]!)
  }
  return out
}

/**
 * The structural faults of 26.10.2026 — the two the oracle could not see
 * while it compared text alone (check 5, `absatzOrderBroken`):
 *
 * - **Reihe** — two neighbouring Absätze of the result swapped, both printed
 *   by the annex. 48/ME KOG § 35: the new (1h) after (2), every word right.
 * - **Fehlt** — an Absatz of the result dropped that the annex prints only in
 *   an elision chain („(1) bis (26) …"), so no text check reads it. 126/ME
 *   StAG § 42: the (26) another Artikel inserts.
 *
 * Built on the tree, so the faulted result is a result the engine could
 * produce: the same Absätze, in another order or one fewer.
 */
function structuralFault(node: LawNode, rows: readonly ComparisonRow[], kind: 'Reihe' | 'Fehlt'): LawNode | null {
  const abs = node.children.filter((c) => c.level === 'abs')
  if (kind === 'Reihe') {
    const printed = printedAbsaetze(rows, false)
    for (let i = 0; i + 1 < node.children.length; i++) {
      const [a, b] = [node.children[i]!, node.children[i + 1]!]
      if (a.level !== 'abs' || b.level !== 'abs' || !printed.has(a.id) || !printed.has(b.id)) continue
      // Two Absätze of one number swapped are the same sequence: no fault,
      // and counted as a miss it measured the injector (Listing Act § 117,
      // „… 11, 11, …", until 19.11.2026). Where a § holds the same number
      // twice is reported on its own (`results.dupAbs`).
      if (a.id === b.id || abs.filter((c) => c.id === a.id || c.id === b.id).length > 2) continue
      const children = [...node.children]
      children[i] = b
      children[i + 1] = a
      return { ...node, children }
    }
    return null
  }
  const { chained, withText } = chainedAbsaetze(rows)
  // One of two Absätze of one number (RIS's own, `results.dupAbs`) is no site: the other one still stands.
  const drop = abs.find((c) => chained.has(c.id) && !withText.has(c.id) && c !== abs[0] && c !== abs[abs.length - 1] && abs.filter((x) => x.id === c.id).length === 1)
  return drop ? { ...node, children: node.children.filter((c) => c !== drop) } : null
}

/** The same Absatz out of the standing § — `Fehlt` takes it from both sides. */
function withoutAbsatz(node: LawNode, id: string): LawNode {
  return { ...node, children: node.children.filter((c) => !(c.level === 'abs' && c.id === id)) }
}

/**
 * **Lücke** — a unit the annex leaves out WITHOUT its „…", missing
 * (14.11.2026). 707EA278 prints § 1.02 as „1. … 4. …" in both columns, and
 * the oracle reads the jump as an omission where the standing § carries the
 * units between (`silentOmissions`). That reading must not cost a real loss:
 *
 * - **Lücke** — the unit dropped from the result alone: the engine lost a
 *   unit the annex never printed. No text check reads the omitted unit, so
 *   only the bag of removed words (check 3) and, for Absätze, check 5 can
 *   say so.
 * - **Lücke-beide** — the unit dropped from the result AND the standing §:
 *   the annex assumes a unit RIS does not carry, the 126/ME shape. The jump
 *   then proves nothing and must not be read (`fremd`).
 *
 * The sites are the §§ the oracle confirms with such a jump in a row; before
 * the reading existed it confirmed none of the §§ the reading moves, which is
 * why the class was built first — its zero is the measurement that nothing
 * could be lost then. Each miss is also judged without the reading: a miss
 * both share is not the reading's.
 *
 * 14.11.2026, GP XXVIII, PDF path: Lücke 16 of 16 caught (all by check 3),
 * Lücke-beide 3 of 16 — the 13 misses are confirmed without the reading too:
 * the annex names nothing between its two markers, and RIS without the unit
 * reads exactly like a unit repealed long ago. Table path: no site — its
 * cells hold one unit each.
 */
function withoutUnit(node: LawNode, style: StandingUnits['style'], id: string): LawNode {
  if (style === 'abs') return { ...node, children: node.children.filter((c) => !(c.level === 'abs' && c.id === id)) }
  const drop = (n: LawNode): LawNode => ({ ...n, children: n.children.filter((c) => !(c.level === 'z' && c.id === id)) })
  const abs = node.children.filter((c) => c.level === 'abs')
  return abs.length === 1 && !abs[0]!.id ? { ...node, children: node.children.map((c) => (c === abs[0] ? drop(c) : c)) } : drop(node)
}

/**
 * **Datum** — the day of a date the annex prints in a changed row, moved by
 * one: „1. Juli" → „2. Juli". Until 26.10.2026 `stripMarkers` took every
 * „1." for a Ziffer's marker, on both sides, and a result that missed a
 * moved Inkrafttreten read exactly like one that made it.
 */
function dateFault(got: string, rows: readonly ComparisonRow[]): string | null {
  const shown = rows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged').map((r) => normalizeText(r.proposed)).join(' ')
  for (const m of got.matchAll(/(?<!\d)(\d{1,2})\.(\s*)(Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/g)) {
    // The date with the words around it, so it is THIS date the annex
    // prints — „1. Oktober" alone stands inside „31. Oktober", and a date in
    // an Absatz the annex leaves out is a fault nothing could see.
    const window = normalizeText(got.slice(Math.max(0, m.index! - 30), m.index! + m[0].length + 20)).replace(/^\S*\s/, '').replace(/\s\S*$/, '')
    if (!shown.includes(window)) continue
    const day = Number(m[1])
    const moved = `${day >= 28 ? day - 1 : day + 1}.${m[2]}${m[3]}`
    return got.slice(0, m.index) + moved + got.slice(m.index! + m[0].length)
  }
  return null
}

// --- Word faults in the RESULT (19.11.2026) ----------------------------------

/**
 * How many words on each side of a site have to be printed with it before
 * the site counts as printed: a seven-word window is a phrase, not a
 * coincidence, and the run also asks that it stand only once in the result.
 */
const SITE_HALF = 3

/** The words whose loss turns a provision into its opposite or widens it. */
const FLIP_WORDS = new Set(['nicht', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines', 'nur', 'auch', 'oder', 'und', 'muss', 'müssen', 'kann', 'können', 'darf', 'dürfen', 'ausschließlich'])

/** What stands before a number that makes it a citation rather than a figure. */
const DESIGNATORS = new Set(['§', '§§', 'Abs.', 'Absatz', 'Absätze', 'Abs', 'Z', 'Z.', 'Ziffer', 'Ziffern', 'lit.', 'lit', 'Art.', 'Artikel', 'Nr.', 'Anlage', 'Anhang', 'Satz', 'Teil', 'Abschnitt', 'Hauptstück', 'Kapitel', 'Pkt.', 'Tz.', 'Rz.', 'Unterabschnitt', 'TP', 'Tarifpost', 'sublit.'])
/** The designators a Verweis fault changes the number behind. */
const CITATION_HEADS = new Set(['§', '§§', 'Abs.', 'Z', 'lit.', 'Art.'])
const CHAIN_WORDS = new Set(['bis', 'und', 'oder', 'sowie', 'bzw.'])
const MONTHS = new Set(['Jänner', 'Januar', 'Feber', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'])

/** „36," → „36", „(Abs." → „Abs." — a token as a word, for the vocabularies above. */
const bare = (token: string): string => token.replace(/^[„"'([]+|["'),;:\]]+$/g, '')
/** A figure as the text prints it: „2026", „1,5", „30%", „1.000" — never a bracketed marker. */
const NUMBER_TOKEN_RE = /^(\d+(?:[.,]\d+)*)(%?[),.;:]*)$/
/** A citation's own id: „5", „5a", „12.", „a", „b)" with its punctuation. */
const CITATION_ID_RE = /^(\d+[a-z]*|[a-z])([),.;:]*)$/

/** A number changed by one digit, the last one: „2026" → „2027", „1 000" stays a figure. */
function bumped(digits: string): string {
  const last = Number(digits[digits.length - 1])
  return digits.slice(0, -1) + String(last === 9 ? 8 : last + 1)
}

/**
 * Where a word fault may go in one confirmed §, and what the annex prints
 * there — the shared ground of every word class below.
 *
 * The result is the string the oracle reads (`plainText`), split at its
 * single spaces, so a faulted result differs from the confirmed one by the
 * fault alone. A word is **printed in a changed row** when the seven-word
 * window around it, in the oracle's own comparison form (`containmentKey`),
 * stands inside a stretch a changed, non-elided row prints in its proposed
 * column, and nowhere else in the result — a phrase that stands twice could
 * be the copy the annex never printed, and a miss there would measure the
 * injector. A word is **not printed** when no window that contains it stands
 * in a changed row's stretch in either column, and the window around it is
 * standing text (in the § the engine started from): text the draft does not
 * touch.
 */
interface WordGround {
  tokens: string[]
  gotKey: string
  printed: (i: number) => boolean
  unprinted: (i: number) => 'unverändert gedruckt' | 'nicht gedruckt' | null
  /** The changed row's printed stretch a site stands in — for `--alarme` */
  stretchAt: (i: number) => string | null
}

function wordGround(got: string, before: string, rows: readonly ComparisonRow[]): WordGround {
  const tokens = got.split(' ')
  const gotKey = containmentKey(got)
  const beforeKey = containmentKey(before)
  const stretchesOf = (pick: (r: ComparisonRow) => boolean, column: 'proposed' | 'current'): { raw: string; key: string }[] =>
    rows.filter((r) => r.kind === 'pair' && !r.elided && pick(r) && r[column])
      .flatMap((r) => printedStretches(normalizeText(r[column])))
      .map((raw) => ({ raw, key: containmentKey(raw) }))
      .filter((s) => s.key !== '')
  const changedProposed = stretchesOf((r) => r.change !== 'unchanged', 'proposed')
  const changedAny = [...changedProposed, ...stretchesOf((r) => r.change !== 'unchanged', 'current')]
  const unchanged = stretchesOf((r) => r.change === 'unchanged', 'proposed')
  const joined = (list: { key: string }[]): string => list.map((s) => s.key).join('\u0000')
  const proposedHay = joined(changedProposed)
  const anyHay = joined(changedAny)
  const unchangedHay = joined(unchanged)
  const shortKeys = new Set(changedAny.filter((s) => s.raw.split(/\s+/).length <= 2).map((s) => s.key))
  const windows = new Map<string, string | null>()
  const windowKey = (i: number, half: number): string | null => {
    const id = `${i}/${half}`
    if (!windows.has(id)) windows.set(id, i - half < 0 || i + half >= tokens.length ? null : containmentKey(tokens.slice(i - half, i + half + 1).join(' ')))
    return windows.get(id)!
  }
  const once = (needle: string): boolean => needle !== '' && gotKey.indexOf(needle) >= 0 && gotKey.indexOf(needle) === gotKey.lastIndexOf(needle)
  return {
    tokens,
    gotKey,
    printed: (i) => {
      const k = windowKey(i, SITE_HALF)
      return k !== null && once(k) && proposedHay.includes(k)
    },
    unprinted: (i) => {
      const k = windowKey(i, SITE_HALF)
      if (k === null || !once(k) || !beforeKey.includes(k)) return null
      // Every window that holds the word, wide and narrow, and the word
      // itself where a changed row prints only one or two: a stretch the
      // word stands at the edge of would otherwise read as not printed.
      for (let j = i - SITE_HALF; j <= i + SITE_HALF; j++) {
        const w = windowKey(j, SITE_HALF)
        if (w !== null && anyHay.includes(w)) return null
      }
      for (let j = i - 1; j <= i + 1; j++) {
        const w = windowKey(j, 1)
        if (w !== null && anyHay.includes(w)) return null
      }
      if (shortKeys.has(containmentKey(tokens[i]!)) || shortKeys.has(containmentKey(`${tokens[i - 1]} ${tokens[i]}`)) || shortKeys.has(containmentKey(`${tokens[i]} ${tokens[i + 1]}`))) return null
      return unchangedHay.includes(k) ? 'unverändert gedruckt' : 'nicht gedruckt'
    },
    stretchAt: (i) => {
      const k = windowKey(i, SITE_HALF)
      return k === null ? null : (changedProposed.find((s) => s.key.includes(k))?.raw ?? null)
    },
  }
}

/** A word of real text — letters, and a comparison form the oracle keeps. */
const isWord = (token: string): boolean => /\p{L}{2,}/u.test(token) && containmentKey(token) !== ''

/**
 * Another word of the same §, far from the site: what an engine that put a
 * payload's word in the wrong place, or kept one of the old wording, leaves.
 * Taken half the § away and scanned on, so the choice is deterministic.
 */
function donorWord(tokens: readonly string[], i: number): string | null {
  const unlike = new Set([tokens[i - 1], tokens[i], tokens[i + 1]].filter((t): t is string => t !== undefined).map((t) => bare(t).toLowerCase()))
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[(i + Math.floor(tokens.length / 2) + k) % tokens.length]!
    const word = bare(t)
    if (/^\p{L}{4,}$/u.test(word) && !unlike.has(word.toLowerCase())) return word
  }
  return null
}

/** Is the number at `i` a citation's — „Abs. 1 bis 3": every one of them? */
function inCitation(tokens: readonly string[], i: number): boolean {
  for (let k = i - 1; k >= Math.max(0, i - 6); k--) {
    const t = tokens[k]!
    if (DESIGNATORS.has(bare(t)) || DESIGNATORS.has(t)) return true
    if (!(CITATION_ID_RE.test(t) || NUMBER_TOKEN_RE.test(t) || CHAIN_WORDS.has(t) || t === ',')) return false
  }
  return false
}

/** One word fault: the result with it, and how it reads for `--misses`. */
interface WordFault {
  got: string
  at: number
  shows: string
}

const middle = <T>(list: readonly T[]): T | undefined => list[Math.floor(list.length / 2)]
const excerpt = (tokens: readonly string[], i: number, replaced: string): string =>
  `…${tokens.slice(Math.max(0, i - 8), i).join(' ')} ${replaced} ${tokens.slice(i + 1, i + 9).join(' ')}…`

/** The result with token `i` replaced (or dropped, for `null`), the rest as it was. */
function edit(tokens: readonly string[], i: number, by: string | null): string {
  return [...tokens.slice(0, i), ...(by === null ? [] : [by]), ...tokens.slice(i + 1)].join(' ')
}

/**
 * The word classes inside a stretch the annex prints in a changed row —
 * check 2's ground: it wants every such stretch as one unbroken run of the
 * result, so a word lost, added or swapped inside one breaks it.
 *
 * - **Wort-weg** — one word dropped; **Wort-weg-Sinn** the same where the
 *   word is one whose loss flips or widens the provision (`FLIP_WORDS`).
 * - **Wort-neu** — another word of the same § put in.
 * - **Wort-tausch** — a word replaced by another word of the same §.
 * - **Zahl** — a figure changed by its last digit: amounts, percentages,
 *   years, counts; not a date's day (class Datum) and not a citation's number.
 * - **Verweis** — the number or letter behind „§", „Abs.", „Z", „lit." or
 *   „Art." moved by one: „§ 5" → „§ 6", „lit. a" → „lit. b".
 */
function printedWordFaults(ground: WordGround): Partial<Record<'weg' | 'wegSinn' | 'neu' | 'tausch' | 'zahl' | 'verweis', WordFault>> {
  const { tokens } = ground
  const sites = tokens.map((_, i) => i).filter((i) => ground.printed(i))
  const words = sites.filter((i) => isWord(tokens[i]!))
  const out: ReturnType<typeof printedWordFaults> = {}
  const weg = middle(words)
  if (weg !== undefined) out.weg = { got: edit(tokens, weg, null), at: weg, shows: excerpt(tokens, weg, `[−${tokens[weg]}]`) }
  const flip = words.find((i) => FLIP_WORDS.has(bare(tokens[i]!).toLowerCase()))
  if (flip !== undefined) out.wegSinn = { got: edit(tokens, flip, null), at: flip, shows: excerpt(tokens, flip, `[−${tokens[flip]}]`) }
  const neu = middle(words)
  const neuWord = neu === undefined ? null : donorWord(tokens, neu)
  if (neu !== undefined && neuWord) out.neu = { got: edit(tokens, neu, `${neuWord} ${tokens[neu]}`), at: neu, shows: excerpt(tokens, neu, `[+${neuWord}] ${tokens[neu]}`) }
  const tausch = middle(words)
  const tauschWord = tausch === undefined ? null : donorWord(tokens, tausch)
  if (tausch !== undefined && tauschWord) out.tausch = { got: edit(tokens, tausch, tauschWord), at: tausch, shows: excerpt(tokens, tausch, `[${tokens[tausch]}→${tauschWord}]`) }
  const figures = sites.filter((i) => {
    const t = tokens[i]!
    if (!NUMBER_TOKEN_RE.test(t) || inCitation(tokens, i)) return false
    // A date's day is class Datum's.
    return !(/^\d{1,2}\.$/.test(t) && MONTHS.has(bare(tokens[i + 1] ?? '')))
  })
  const zahl = middle(figures)
  if (zahl !== undefined) {
    const [, digits, tail] = NUMBER_TOKEN_RE.exec(tokens[zahl]!)!
    const by = `${bumped(digits!)}${tail}`
    out.zahl = { got: edit(tokens, zahl, by), at: zahl, shows: excerpt(tokens, zahl, `[${tokens[zahl]}→${by}]`) }
  }
  const cited = sites.filter((i) => i > 0 && CITATION_HEADS.has(tokens[i - 1]!) && CITATION_ID_RE.test(tokens[i]!))
  const verweis = middle(cited)
  if (verweis !== undefined) {
    const [, id, tail] = CITATION_ID_RE.exec(tokens[verweis]!)!
    const moved = /^\d/.test(id!) ? id!.replace(/^\d+/, (n) => bumped(n)) : id === 'z' ? 'y' : String.fromCharCode(id!.charCodeAt(0) + 1)
    const by = `${moved}${tail}`
    out.verweis = { got: edit(tokens, verweis, by), at: verweis, shows: excerpt(tokens, verweis, `[${tokens[verweis]}→${by}]`) }
  }
  return out
}

/**
 * **Ungedruckt** — the same word faults where the annex prints nothing that
 * changes: in an Absatz it elides or leaves out, or prints unchanged. The
 * engine touching text the draft does not touch. Only check 3 (the bags of
 * removed and inserted words) and, for unchanged rows, nothing else reads
 * there.
 */
function unprintedWordFaults(ground: WordGround): Partial<Record<'weg' | 'neu' | 'zahl', WordFault & { kind: string }>> {
  const { tokens } = ground
  const kinds = new Map<number, string>()
  for (let i = 0; i < tokens.length; i++) {
    const kind = ground.unprinted(i)
    if (kind) kinds.set(i, kind)
  }
  const sites = [...kinds.keys()]
  const words = sites.filter((i) => isWord(tokens[i]!))
  const out: ReturnType<typeof unprintedWordFaults> = {}
  const weg = middle(words)
  if (weg !== undefined) out.weg = { got: edit(tokens, weg, null), at: weg, kind: kinds.get(weg)!, shows: excerpt(tokens, weg, `[−${tokens[weg]}]`) }
  const neuWord = weg === undefined ? null : donorWord(tokens, weg)
  if (weg !== undefined && neuWord) out.neu = { got: edit(tokens, weg, `${neuWord} ${tokens[weg]}`), at: weg, kind: kinds.get(weg)!, shows: excerpt(tokens, weg, `[+${neuWord}] ${tokens[weg]}`) }
  const zahl = middle(sites.filter((i) => NUMBER_TOKEN_RE.test(tokens[i]!) && !inCitation(tokens, i) && !(/^\d{1,2}\.$/.test(tokens[i]!) && MONTHS.has(bare(tokens[i + 1] ?? '')))))
  if (zahl !== undefined) {
    const [, digits, tail] = NUMBER_TOKEN_RE.exec(tokens[zahl]!)!
    const by = `${bumped(digits!)}${tail}`
    out.zahl = { got: edit(tokens, zahl, by), at: zahl, kind: kinds.get(zahl)!, shows: excerpt(tokens, zahl, `[${tokens[zahl]}→${by}]`) }
  }
  return out
}

/**
 * **Ziffer-Reihe** — two neighbouring Ziffern of one Absatz swapped, both
 * printed in changed rows: the Reihe fault one level down, where check 5
 * (Absätze only) does not reach. Built on the tree, markers travelling with
 * their Ziffern, so the result is one the engine could produce — a new
 * Ziffer inserted one place off.
 */
function zifferSwap(node: LawNode, gotKey: string, rows: readonly ComparisonRow[]): { node: LawNode; shows: string } | null {
  const hay = rows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged' && r.proposed)
    .flatMap((r) => printedStretches(normalizeText(r.proposed))).map(containmentKey).join('\u0000')
  const printed = (z: LawNode): boolean => {
    const own = containmentKey(z.text)
    const probe = (own.length >= 15 ? own : containmentKey(plainText(z))).slice(0, 60)
    return probe.length >= 10 && gotKey.indexOf(probe) === gotKey.lastIndexOf(probe) && hay.includes(probe)
  }
  const hosts = [node, ...node.children.filter((c) => c.level === 'abs')]
  for (const host of hosts) {
    for (let i = 0; i + 1 < host.children.length; i++) {
      const [a, b] = [host.children[i]!, host.children[i + 1]!]
      if (a.level !== 'z' || b.level !== 'z' || a.id === b.id || plainText(a) === plainText(b) || !printed(a) || !printed(b)) continue
      const swapped = [...host.children]
      swapped[i] = b
      swapped[i + 1] = a
      const faultedHost = { ...host, children: swapped }
      const faulted = host === node ? faultedHost : { ...node, children: node.children.map((c) => (c === host ? faultedHost : c)) }
      return { node: faulted, shows: `${host === node ? '' : `Abs. ${host.id} `}Z ${a.id} ↔ Z ${b.id}` }
    }
  }
  return null
}

/**
 * **Bezeichnung** (21.11.2026) — one Ziffer's or Litera's label in the
 * result moved by one („3." → „4.", „b)" → „c)"), where a changed row prints
 * the unit: the page shows the designations, and the oracle compares the
 * text without them (`stripMarkers`; check 5 reads Absätze only). The BGBl
 * bench fails on a shown § with designations that are not the law's; this
 * says what the draft-time check reaches. Caught by none of the five checks
 * (0 of 510 on the PDF path, 0 of 349 on the table path) until check 6
 * (`labelBroken`, 21.11.2026): 513 of 514 and 348 of 349, floored since.
 */
function designationBumped(node: LawNode, gotKey: string, rows: readonly ComparisonRow[]): { node: LawNode; shows: string } | null {
  const hay = rows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged' && r.proposed)
    .flatMap((r) => printedStretches(normalizeText(r.proposed))).map(containmentKey).join('\u0000')
  const printed = (u: LawNode): boolean => {
    const probe = containmentKey(plainText(u)).slice(0, 60)
    return probe.length >= 10 && gotKey.indexOf(probe) === gotKey.lastIndexOf(probe) && hay.includes(probe)
  }
  const sites: LawNode[] = []
  const walk = (n: LawNode): void => {
    for (const c of n.children) {
      if ((c.level === 'z' || c.level === 'lit') && /\d|[a-z]\)/.test(c.marker) && printed(c)) sites.push(c)
      walk(c)
    }
  }
  walk(node)
  const site = middle(sites)
  if (!site) return null
  const bump = (t: string): string => t.replace(/\d+|[a-y](?=\))|^[a-y]$/, (m) => (/\d/.test(m) ? String(Number(m) + 1) : String.fromCharCode(m.charCodeAt(0) + 1)))
  const moved = bump(site.marker)
  if (moved === site.marker) return null
  const swap = (n: LawNode): LawNode => (n === site ? { ...n, marker: moved, id: bump(n.id) } : { ...n, children: n.children.map(swap) })
  return { node: swap(node), shows: `${site.level === 'z' ? 'Z' : 'lit.'} ${site.marker} → ${moved}` }
}

/**
 * **Komma** and **Ungedruckt-Komma** (21.11.2026, audit G020) — one comma of
 * the result dropped, where a changed row prints the site and where nothing
 * prints it (`wordGround`). Check 2 compares a printed stretch character for
 * character; check 3's bags compare words without their punctuation. Not
 * floored: the two figures say what the check reaches.
 */
function commaDropped(ground: WordGround, printedSite: boolean): (WordFault & { kind?: string }) | null {
  const { tokens } = ground
  const sites = tokens.map((_, i) => i).filter((i) => /\p{L}{2,},$/u.test(tokens[i]!) && (printedSite ? ground.printed(i) : ground.unprinted(i) !== null))
  const at = middle(sites)
  if (at === undefined) return null
  const by = tokens[at]!.slice(0, -1)
  return { got: edit(tokens, at, by), at, shows: excerpt(tokens, at, `[${tokens[at]}→${by}]`), ...(printedSite ? {} : { kind: ground.unprinted(at)! }) }
}

/**
 * **Überschrift** — one word of the § heading replaced by another word of
 * the §, where the annex prints the heading in a changed row: a heading the
 * draft rewrites and the engine got wrong.
 */
function headingFault(node: LawNode, tokens: readonly string[], rows: readonly ComparisonRow[]): { node: LawNode; shows: string } | null {
  if (!node.heading) return null
  const headingKey = containmentKey(node.heading)
  if (headingKey.length < 4) return null
  // Printed AS the heading: what a changed row prints before the § symbol
  // (the PDF path), or a heading row of its own (the table path) — a heading
  // word that merely recurs in the body is no heading the annex printed.
  const printedAsHeading = rows.some((r) => {
    if (r.kind !== 'pair' || r.elided || r.change === 'unchanged' || !r.proposed) return false
    const text = normalizeText(r.proposed)
    const symbol = /§+\s*\d+[a-z]*\.?\s/.exec(text)
    const head = symbol ? text.slice(0, symbol.index) : !r.gld && text.length <= 120 && !/[.;:]$/.test(text) ? text : null
    return head !== null && containmentKey(head).endsWith(headingKey)
  })
  if (!printedAsHeading) return null
  const words = node.heading.split(' ')
  const longest = words.reduce((best, w, i) => (bare(w).length > bare(words[best]!).length ? i : best), 0)
  const donor = donorWord([...words, ...tokens], longest)
  if (!donor || !/\p{L}/u.test(words[longest]!)) return null
  const heading = words.map((w, i) => (i === longest ? w.replace(bare(w), donor) : w)).join(' ')
  return heading === node.heading ? null : { node: { ...node, heading }, shows: `„${node.heading}" → „${heading}"` }
}

/**
 * **Zurück** — the struck Absatz back in the result under the number it had,
 * the rest of the result as the engine made it: „Abs. 8 entfällt; Abs. 9
 * erhält die Absatzbezeichnung (8)" carried out by neither half (BVergGVS
 * § 30, 58/ME XXVIII, 19.11.2026). Built on the tree, so the faulted result
 * is one the engine could produce. Only where exactly one Absatz went and a
 * changed row of the annex prints it. **Zurück-gleich** is the sub-class
 * where the restored Absatz opens with the words of the one after it — the
 * shape check 4 skipped until 19.11.2026, because the LCS pairs the proposed
 * Absatz with the struck one's opening.
 */
function restoredAbsatz(beforeNode: LawNode, node: LawNode, rows: readonly ComparisonRow[]): { node: LawNode; shows: string; sameOpening: boolean } | null {
  const before = beforeNode.children.filter((c) => c.level === 'abs')
  const after = node.children.filter((c) => c.level === 'abs')
  if (before.length !== after.length + 1 || before.some((a) => !a.id) || after.some((a) => !a.id)) return null
  const gotKey = containmentKey(plainText(node))
  const changedCur = rows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged' && r.current).flatMap((r) => printedStretches(normalizeText(r.current))).map(containmentKey).join('\u0000')
  const opening = (n: LawNode): string => containmentKey(plainText(n).split(/\s+/).slice(0, 3).join(' '))
  for (const [i, a] of before.entries()) {
    const k = containmentKey(plainText(a))
    if (k.length < 20 || gotKey.includes(k.slice(0, 60)) || !changedCur.includes(k.slice(0, 40))) continue
    // The Absätze after it take back the numbers they had.
    const children = node.children.map((c) => {
      const j = after.indexOf(c)
      return j >= i ? { ...c, id: before[j + 1]!.id, marker: before[j + 1]!.marker } : c
    })
    const at = i === 0 ? children.findIndex((c) => c.level === 'abs') : children.findIndex((c) => c.level === 'abs' && c.id === before[i - 1]!.id) + 1
    if (at < 0 || (i > 0 && at === 0)) return null
    children.splice(at, 0, a)
    const next = before[i + 1]
    return { node: { ...node, children }, shows: `Abs. ${a.id} samt Nummern zurück`, sameOpening: next !== undefined && opening(a) === opening(next) }
  }
  return null
}

/** Which of the oracle's checks a verdict's note comes from — the columns of the word table. */
function checkOf(note: string | null): string {
  if (!note) return '?'
  if (note.startsWith('Geltende Fassung')) return 'P1'
  if (note.startsWith(ROW_ORDER_NOTE)) return 'P2r'
  if (note.startsWith(PLACE_NOTE)) return 'P3o'
  if (note.startsWith('Vorgeschlagene Fassung') || note.startsWith('Gestrichene Fassung')) return 'P2'
  if (note.startsWith('Engine') || note.startsWith('Wortdiff')) return 'P3'
  if (note.startsWith(KEPT_DELETION_NOTE)) return 'P4'
  if (note.startsWith(ABSATZ_ORDER_NOTE)) return 'P5'
  if (note.startsWith(LABEL_NOTE)) return 'P6'
  return '?'
}

/** A unit as the report names it: „§ 5", or a schedule's own key („Anl. 8"). */
const unitLabel = (id: string): string => (id.startsWith('Anl.') ? id : `§ ${id}`)

/**
 * The engine on this draft, and the oracle on its result — once as computed,
 * once per fault.
 *
 * The engine run is `harness/me.ts`'s, step for step, through the same
 * production modules (`instructionsFromUnits`, `applyNovelle`, `oracleVerdict`),
 * on the annex rows this run has already parsed for the path it measures.
 * The law is found as the page finds it (`lawOf`, `resolveKonsLaw`).
 */
async function injectIntoResults(
  cite: string,
  draftBlocks: ReturnType<typeof parseRisXml>,
  amendingCount: number,
  rows: readonly ComparisonRow[],
  lawOf: (key: string | null) => Promise<KonsLawAtDate | null>,
  renditionLoader: () => Promise<DraftRendition | null> = async () => null,
): Promise<void> {
  const byParagraph = rowsByParagraph(rows)
  const articleKeys = new Set(draftArticles(draftBlocks).flatMap((a) => (a.key === null ? [] : [a.key])))
  const rendition = await renditionLoader()
  for (const { blocks, article } of articleBlocks(draftBlocks).filter((p) => p.article.amends)) {
    const units = segmentUnits(blocks).filter((u) => u.blocks.some((b) => b.kind === 'novao'))
    const { instructions, refused: grammarRefused } = instructionsFromUnits(units)
    if (instructions.length === 0) continue
    const resolved = await lawOf(article.key)
    if (!resolved) continue
    const wanted = new Set<string>()
    let wholeText = false
    const touched = new Set<string>()
    for (const { op, payload } of instructions) {
      const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
      if (address?.level === 'document') wholeText = true
      if (address?.para) {
        wanted.add(loadKey(address.para))
        // Keyed as the page keys it (`unitKey`): „Anhang VIII" is „Anl. 8",
        // never § 8. By the bare number a schedule was scored against the §
        // of its number, and a Roman one not at all (19.11.2026).
        const id = isDivision(address.para) ? null : unitKey(address.para)
        if (id) touched.add(id)
      }
      if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') for (const p of payload) if (p.id) touched.add(isSchedule(p.marker) ? (unitKey(p.marker) ?? p.id) : p.id)
    }
    const paragraphs: LawNode[] = []
    for (const [label, ref] of Object.entries(resolved.paragraphs)) {
      if (!wholeText && !wanted.has(loadKey(label))) continue
      const tree = await fetchParagraphTree(ref)
      if (tree) paragraphs.push(tree)
    }
    const law: StandingLaw = { paragraphs }
    const applied = applyNovelle(law, instructions)
    const { law: after, renamed } = applied
    /** The instructions that acted on a § of this run, as the page hands them to the witness (`kons/consolidate.ts`). */
    const touchingOf = (list: readonly Instruction[], report: typeof applied, node: LawNode): WitnessInstruction[] =>
      list.flatMap((ins, i) => (('target' in ins.op && ins.op.target.level === 'document') || report.touches(i, node) ? [witnessInstruction(ins)] : []))
    // Paired as the page pairs them (`kons/consolidate.ts`): a renumbered §
    // against the standing § it came from.
    const originOf = renamedOrigins(renamed)
    // The annex asked as the page asks it (`annexScope`, 21.11.2026). This
    // script keyed packages only, so a single Novelle whose annex files rows
    // under its key, and one beside a law the draft enacts, were asked by the
    // bare number here and by the key on the page.
    const annex = annexScope(byParagraph, article.key, amendingCount > 1, articleKeys)
    const lawKey = annex.law ?? undefined
    // Held under the unit key, as the page holds them (`unitsByKey`).
    const afterById = unitsByKey(after.paragraphs)
    const beforeById = unitsByKey(law.paragraphs)
    for (const id of [...touched].sort()) {
      const node = afterById.get(id)
      if (!node) continue
      const origin = originOf(id)
      const beforeNode = origin === null ? null : (beforeById.get(origin) ?? null)
      const before = beforeNode ? plainText(beforeNode) : null
      const got = plainText(node)
      const paraRows = paragraphRows(annex.rows, id, annex.law, origin)
      const standingUnits = beforeNode ? standingUnitsOf(beforeNode) : null
      const report = oracleVerdict(id, before, got, paraRows, absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, standingUnits, designatedUnitsOf(node))
      results.verdicts.set(report.verdict, (results.verdicts.get(report.verdict) ?? 0) + 1)
      const touching = touchingOf(instructions, applied, node)
      /**
       * The page's gate since 20.11.2026: the oracle, and where it contradicts
       * the second witness (`kons/draftWitness.ts`) — a faulted result shown
       * on the witness is shown, and counts as a miss of its class.
       */
      const judgedVerdict = (...args: Parameters<typeof oracleVerdict>): OracleReport => {
        const judged = oracleVerdict(...args)
        if (judged.verdict !== 'widersprochen' || !rendition) return judged
        const [pid, b, g, r, ra, sa, su, ru] = args
        const witnessed = witnessVerdict(pid, b, g, r, touching, rendition, ra, sa, su, ru)
        return witnessed.released ? { ...judged, verdict: 'bestätigt', note: `Zeuge: ${witnessed.places.map((pl) => `„${pl.annex}" / „${pl.draft}"`).join('; ')}` } : judged
      }
      /**
       * Every fault class is judged through this one call (21.11.2026), with
       * what the page's gate passes (`kons/consolidate.ts`): the faulted
       * result's Absätze, the standing § as the fault left it — its text,
       * its Absätze, its units — and the witness. Until then Reihe, Fehlt and
       * Datum were judged without the standing units, E and E-neben without
       * either Absatz sequence as well, so check 5 and the reading of a
       * silent omission were off for them. E's faulted result is a text with
       * no tree of its own: the Absätze read are the unfaulted result's.
       */
      const judgeAsPage = (faultedGot: string, faultedNode: LawNode, faultedBefore: LawNode | null = beforeNode): OracleReport =>
        judgedVerdict(id, faultedBefore ? plainText(faultedBefore) : null, faultedGot, paraRows, absatzSequence(faultedNode), faultedBefore ? (absatzSequence(faultedBefore) ?? null) : null, faultedBefore ? standingUnitsOf(faultedBefore) : null, designatedUnitsOf(faultedNode))
      if (report.verdict === 'widersprochen' && rendition) {
        const witnessed = witnessVerdict(id, before, got, paraRows, touching, rendition, absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, standingUnits, designatedUnitsOf(node))
        if (witnessed.released) {
          results.witnessed++
          for (const kind of PAYLOAD_KINDS) {
            const mutated = mutatedPayload(instructions, touching, witnessed.places, kind)
            if (!mutated) continue
            const again = applyNovelle(law, mutated.instructions)
            const faultedNode = unitsByKey(again.law.paragraphs).get(id)
            const faultedGot = faultedNode ? plainText(faultedNode) : null
            if (faultedGot === got) continue
            const into = oracleFaults.Payload
            into.tried++
            into.kinds.set(kind, (into.kinds.get(kind) ?? [0, 0]).map((n, k) => n + (k === 0 ? 1 : 0)) as [number, number])
            // Who showed a fault that got through: the oracle (the misread
            // turned our wording into the annex's — nobody's catch, before the
            // witness or after) or the witness itself.
            let by: 'Orakel' | 'Zeuge' | null = null
            if (faultedNode !== undefined && faultedGot !== null) {
              const judged = oracleVerdict(id, before, faultedGot, paraRows, absatzSequence(faultedNode), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, standingUnits, designatedUnitsOf(faultedNode))
              if (judged.verdict === 'bestätigt') by = 'Orakel'
              else if (judged.verdict === 'widersprochen' && witnessVerdict(id, before, faultedGot, paraRows, touchingOf(mutated.instructions, again, faultedNode), rendition, absatzSequence(faultedNode), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, standingUnits, designatedUnitsOf(faultedNode)).released) by = 'Zeuge'
            }
            const shownAnyway = by !== null
            if (!shownAnyway) {
              into.caught++
              into.kinds.set(kind, (into.kinds.get(kind) ?? [0, 0]).map((n, k) => n + (k === 1 ? 1 : 0)) as [number, number])
            } else into.misses.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} (${kind}, gezeigt vom ${by}) — ${mutated.shows.slice(0, 220)}`)
          }
        }
      }
      // `--urteile`: every verdict on a line of its own, so two runs of an
      // oracle change can be compared § by § (`diff`), not by their totals.
      if (argFlag('urteile')) console.log(`URTEIL ${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 40)}]` : ''} — ${report.verdict}${report.note ? ` — ${report.note.slice(0, 120)}` : ''}`)
      // An Absatz number the result holds twice — and whether the standing §
      // already held it twice (RIS's text) or the engine made the second one.
      const twice = (n: LawNode | null): string[] => (n ? absOf(n).filter((a, i, all) => a && all.indexOf(a) !== i) : [])
      const dup = twice(node)
      if (dup.length > 0) {
        const standingDup = twice(beforeNode)
        const engineMade = dup.filter((a) => !standingDup.includes(a))
        results.dupAbs.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} — ${report.verdict}, doppelt (${dup.join(', ')}) ${engineMade.length === 0 ? 'schon im geltenden Text' : `ERST IM ERGEBNIS (${engineMade.join(', ')})`}; geltend: ${beforeNode ? absOf(beforeNode).join(', ') : '—'}; Ergebnis: ${absOf(node).join(', ')}`)
      }
      // Every § with a row the annex prints with a silent omission, whatever
      // its verdict — what the reading can reach at all.
      const gaps = silentOmissions(paraRows, standingUnits).skipped
      // Every verdict the reading moves, named — a count cannot be read.
      const unread = oracleVerdict(id, before, got, paraRows, absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, null, designatedUnitsOf(node))
      if (unread.verdict !== report.verdict) {
        results.moved.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} — ${unread.verdict} → ${report.verdict}${report.note ? ` — ${report.note.slice(0, 100)}` : ''}`)
        if (argFlag('alarme')) results.moved.push(...silentOmissions(paraRows, standingUnits).rows.filter((r) => r.kind === 'pair').flatMap((r) => [`          geltend      : ${r.current.slice(0, 400)}`, `          vorgeschlagen: ${r.proposed.slice(0, 400)}`]), `          Ergebnis     : ${got.slice(0, 400)}`)
      }
      if (gaps.length > 0) {
        results.silent.set(report.verdict, (results.silent.get(report.verdict) ?? 0) + 1)
        results.silentSites.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} — ${report.verdict}, ausgelassen ${gaps.join(', ')}${report.note ? ` — ${report.note.slice(0, 90)}` : ''}`)
      }
      // Check 2's row order (19.11.2026): every § it speaks on would have
      // passed check 2 with each row looked up from the start.
      if (report.note?.startsWith(ROW_ORDER_NOTE)) {
        results.rowOrder.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} — ${report.note}`)
        if (argFlag('alarme')) results.rowOrder.push(...paraRows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged').map((r) => `          ${r.change.padEnd(11)}: ${r.proposed.slice(0, 160)}`), `          Ergebnis: ${got.slice(0, 400)}`)
      }
      // Check 3 in place (19.11.2026): every § it speaks on had passed the
      // bags of check 3, so its alarms are the confirmations it withdraws.
      if (report.note?.startsWith(PLACE_NOTE)) {
        results.placeAlarms.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} — ${report.note}`)
        if (argFlag('alarme')) results.placeAlarms.push(...paraRows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged').flatMap((r) => [`          geltend      : ${r.current.slice(0, 300)}`, `          vorgeschlagen: ${r.proposed.slice(0, 300)}`]), `          geltend (RIS): ${(before ?? '').slice(0, 300)}`, `          Ergebnis     : ${got.slice(0, 300)}`)
      }
      // Check 5's false-alarm side, like check 4's below: every § it speaks
      // on had passed the other four.
      if (report.note?.startsWith(ABSATZ_ORDER_NOTE)) {
        results.order++
        results.orderAlarms.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} — ${report.note}`)
        if (argFlag('alarme')) {
          results.orderAlarms.push(...paraRows.filter((r) => r.kind === 'pair').map((r) => `          ${r.elided ? 'ausgelassen' : r.change.padEnd(11)}: ${r.proposed.slice(0, 160)}`), `          Ergebnis-Absätze: ${(absatzSequence(node) ?? []).join(', ')}`)
        }
      }
      // The false-alarm side of the new check: it runs last, so every § it
      // speaks on had passed the other three — confirmed until 01.10.2026.
      if (report.note?.startsWith(KEPT_DELETION_NOTE)) {
        results.kept++
        results.keptAlarms.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} — ${report.note}`)
        // An alarm withholds a § from the page, so it has to be readable
        // against its annex rows, not just counted (`--alarme`).
        if (argFlag('alarme')) {
          const changed = paraRows.filter((r) => r.kind === 'pair' && r.change !== 'unchanged' && !r.elided)
          results.keptAlarms.push(...changed.flatMap((r) => [`          geltend    : ${r.current}`, `          vorgeschlagen: ${r.proposed}`]), `          Ergebnis   : ${got}`)
        }
      }
      // `--zeige=18` (with `--only`): one § as the oracle sees it, to read a miss.
      if (argAssigned('zeige') === id) {
        console.log(`\n  ── ${unitLabel(id)}${lawKey ? ` [${lawKey}]` : ''}: ${report.verdict}${report.note ? ` — ${report.note}` : ''}`)
        console.log(`     Überschrift: ${node.heading ?? '—'}`)
        for (const r of paraRows.filter((r) => r.kind === 'pair')) console.log(`     ${r.elided ? 'ausgelassen' : r.change.padEnd(11)}${r.editorial ? ' (red.)' : ''} gld=${r.gld ?? '—'}\n        geltend      : ${r.current.slice(0, argFlag('voll') ? undefined : 600)}\n        vorgeschlagen: ${r.proposed.slice(0, argFlag('voll') ? undefined : 600)}`)
        console.log(`     geltend : ${(before ?? '—').slice(0, 900)}\n     Ergebnis: ${got.slice(0, 900)}\n`)
        // Where a stretch stops matching: the longest prefix of its comparison
        // form the text holds, and what follows on each side.
        for (const r of paraRows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged')) {
          for (const [label, cell, text] of [['geltend', r.current, before ?? ''], ['vorgeschlagen', r.proposed, got]] as const) {
            for (const stretch of printedStretches(normalizeText(cell))) {
              const k = containmentKey(stretch)
              const hay = containmentKey(text)
              if (k === '' || hay.includes(k)) continue
              let n = 0
              while (n < k.length && hay.includes(k.slice(0, n + 1))) n++
              const at = hay.indexOf(k.slice(0, n))
              console.log(`     Bruch ${label}: …${k.slice(Math.max(0, n - 40), n)}‖ Beilage: ${k.slice(n, n + 40)} | Text: ${n > 0 ? hay.slice(at + n, at + n + 40) : '—'}`)
            }
          }
        }
        // The draft's instructions that name this §: as the units read, as the
        // engine applied them, and those the grammar could not read.
        const names = (line: string): boolean => new RegExp(`§\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\da-z])`).test(normalizeText(line))
        for (const u of units) if (names(u.blocks.map((b) => b.text).join(' '))) console.log(`     Anordnung: ${u.blocks.map((b) => b.text).join(' ').slice(0, 400)}`)
        for (const r of applied.results) if (names(r.line)) console.log(`     angewendet=${r.applied}${r.reason ? ` (${r.reason})` : ''}: ${r.line.slice(0, 160)}`)
        for (const r of grammarRefused) if (names(r.line)) console.log(`     ungelesen: ${r.reason} — ${r.line.slice(0, 160)}`)
        // The designations RIS's own document prints, beside what the tree made of them.
        const ref = Object.values(resolved.paragraphs).find((r) => r.id === (origin ?? id))
        if (ref?.xmlUrl) console.log(`     RIS-Dokument ${ref.xmlUrl}\n       gldsym: ${[...(await getText(ref.xmlUrl)).matchAll(/<gldsym>([^<]*)<\/gldsym>/g)].map((m) => m[1]).join(' ')}\n       Baum  : ${beforeNode ? absOf(beforeNode).join(', ') : '—'}`)
      }
      if (report.verdict === 'bestätigt') {
        // For the whole chain (`judgeChain`): this § again, the annex's rows swapped for faulted ones.
        const judgeAgain = (swap: ReadonlyMap<ComparisonRow, ComparisonRow>) => {
          const swapped = paraRows.map((r) => swap.get(r) ?? r)
          const read = swapped.some((r, i) => r !== paraRows[i])
          return { read, confirms: !read || oracleVerdict(id, before, got, swapped, absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, standingUnits, designatedUnitsOf(node)).verdict === 'bestätigt' }
        }
        for (const r of paraRows) {
          if (r.kind !== 'pair' || !(r.gld ?? r.para)) continue
          const k = annexParagraphKey(r.law, (r.gld ?? r.para)!)
          chainOracle.judges.set(k, [...(chainOracle.judges.get(k) ?? []), judgeAgain])
        }
      }
      if (report.verdict !== 'bestätigt' || before === null) continue
      results.confirmed++
      // The reader's faults in the annex's right column (21.11.2026), built as
      // the gate's are (`withNewTextEdited`, `withKeptSentenceLost`) and held
      // against the unchanged result: does the oracle see that the column
      // the page shows is not the draft? Without the witness, which settles
      // the result and not the column.
      for (const [into, faulted] of [
        [oracleFaults.SpalteZahl, withNewTextEdited(paraRows, raisedNumber)],
        [oracleFaults.SpalteBezeichnung, withNewTextEdited(paraRows, bumpedDesignation)],
        [oracleFaults.SpalteWort, withNewTextEdited(paraRows, swappedWord)],
        [oracleFaults.SpalteSatzWeg, withNewTextEdited(paraRows, (t: string) => lastSentenceGone(t, SENTENCE_SPLIT))],
        [oracleFaults.SpalteRweg, withKeptSentenceLost(paraRows)],
      ] as const) {
        if (!faulted) continue
        into.tried++
        const judged = oracleVerdict(id, before, got, faulted, absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, standingUnits, designatedUnitsOf(node))
        if (judged.verdict !== 'bestätigt') {
          into.caught++
          into.byCheck.set(checkOf(judged.note), (into.byCheck.get(checkOf(judged.note)) ?? 0) + 1)
          continue
        }
        const row = faulted.find((r, i) => r !== paraRows[i])
        const was = row ? paraRows[faulted.indexOf(row)]!.proposed : ''
        const at = row ? [...row.proposed].findIndex((ch, i) => ch !== was[i]) : -1
        into.misses.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''} — „…${was.slice(Math.max(0, at - 70), at + 50)}…" → „…${row ? row.proposed.slice(Math.max(0, at - 70), at + 50) : ''}…"`)
      }
      // The reverse (20.11.2026): a fault in the annex's proposed column of a
      // confirmed § — a figure changed — contradicts our result, and the
      // witness may then show it. The result is the unfaulted one, so a
      // release here shows no wrong text; counted to show how often the
      // witness stands in where the annex alone is wrong.
      const annexFault = numberInAnnex(paraRows)
      if (annexFault && rendition) {
        const judged = oracleVerdict(id, before, got, annexFault, absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, standingUnits, designatedUnitsOf(node))
        if (judged.verdict === 'widersprochen') {
          oracleFaults.BeilageZahl.tried++
          if (!witnessVerdict(id, before, got, annexFault, touching, rendition, absatzSequence(node), beforeNode ? (absatzSequence(beforeNode) ?? null) : null, standingUnits, designatedUnitsOf(node)).released) oracleFaults.BeilageZahl.caught++
          else oracleFaults.BeilageZahl.misses.push(`${cite} ${unitLabel(id)} — gezeigt ist das unveränderte Ergebnis`)
        }
      }
      for (const kind of ['Reihe', 'Fehlt'] as const) {
        const faulted = structuralFault(node, paraRows, kind)
        if (!faulted) continue
        const into = oracleFaults[kind]
        into.tried++
        // „Fehlt" is the 126/ME shape: the Absatz is missing from the text
        // the engine started from as much as from its result — another
        // Artikel was to insert it — so no word was removed, and only the
        // annex's chain names it.
        const dropped = kind === 'Fehlt' ? absOf(node).find((a) => !absOf(faulted).includes(a)) ?? null : null
        const judged = judgeAsPage(plainText(faulted), faulted, dropped && beforeNode ? withoutAbsatz(beforeNode, dropped) : beforeNode)
        if (judged.verdict !== 'bestätigt') into.caught++
        if (judged.note?.startsWith(ABSATZ_ORDER_NOTE)) into.byKept++
        else if (judged.verdict === 'bestätigt') {
          // Where the annex names the dropped Absatz, so a miss can be read: the reach of check 5 is where a marker can stand.
          const cell = dropped === null ? undefined : paraRows.map((r) => normalizeText(r.proposed)).find((p) => p.includes(`(${dropped})`))
          const at = cell?.indexOf(`(${dropped})`) ?? -1
          into.misses.push(`${cite} ${unitLabel(id)} — Absätze ${(absatzSequence(faulted) ?? []).join(', ')}${dropped ? ` — ohne (${dropped}), Beilage: „…${cell ? cell.slice(Math.max(0, at - 50), at + 20) : '?'}…"` : ''}`)
        }
      }
      if (gaps.length > 0 && beforeNode && standingUnits) {
        const gap = gaps[Math.floor(gaps.length / 2)]!
        for (const [both, into] of [[false, oracleFaults.Luecke], [true, oracleFaults.LueckeBeide]] as const) {
          const faulted = withoutUnit(node, standingUnits.style, gap)
          const faultedBeforeNode = both ? withoutUnit(beforeNode, standingUnits.style, gap) : beforeNode
          into.tried++
          const judged = judgeAsPage(plainText(faulted), faulted, faultedBeforeNode)
          if (judged.verdict !== 'bestätigt') into.caught++
          if (judged.note?.startsWith(ABSATZ_ORDER_NOTE)) into.byKept++
          // The same fault without the reading: a miss it shares was a miss
          // before the reading existed, and is not the reading's.
          const without = judgedVerdict(id, plainText(faultedBeforeNode), plainText(faulted), paraRows, absatzSequence(faulted), absatzSequence(faultedBeforeNode) ?? null, null, designatedUnitsOf(faulted)).verdict
          if (judged.verdict === 'bestätigt') into.misses.push(`${cite} ${unitLabel(id)} — ohne ${standingUnits.style === 'abs' ? `(${gap})` : `${gap}.`} von ${gaps.join(', ')}; ohne die Lesart: ${without}`)
        }
      }
      // The word classes, judged as production judges (`judgeAsPage`).
      const judgeWord = (into: OracleTally, faultedGot: string, faultedNode: LawNode, shows: string, stretch: string | null, kind?: string): void => {
        const judged: OracleReport = judgeAsPage(faultedGot, faultedNode)
        into.tried++
        if (kind) into.kinds.set(kind, (into.kinds.get(kind) ?? [0, 0]).map((n, k) => n + (k === 0 ? 1 : judged.verdict !== 'bestätigt' ? 1 : 0)) as [number, number])
        if (judged.verdict !== 'bestätigt') {
          into.caught++
          const check = checkOf(judged.note)
          into.byCheck.set(check, (into.byCheck.get(check) ?? 0) + 1)
          return
        }
        into.misses.push(`${cite} ${unitLabel(id)}${lawKey ? ` [${String(lawKey).slice(0, 24)}]` : ''}${kind ? ` (${kind})` : ''} — ${shows.slice(0, 220)}${judged.note?.startsWith('Zeuge') ? ` — ${judged.note.slice(0, 300)}` : ''}`)
        if (argFlag('alarme')) {
          if (stretch) into.misses.push(`        Beilage, geänderte Zeile: ${stretch.slice(0, 500)}`)
          else into.misses.push(...paraRows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged').map((r) => `        vorgeschlagen (${r.change}): ${r.proposed.slice(0, 300)}`))
        }
      }
      const ground = wordGround(got, before, paraRows)
      const printedFaults = printedWordFaults(ground)
      for (const [kind, into] of [['weg', oracleFaults.WortWeg], ['wegSinn', oracleFaults.WortWegSinn], ['neu', oracleFaults.WortNeu], ['tausch', oracleFaults.WortTausch], ['zahl', oracleFaults.Zahl], ['verweis', oracleFaults.Verweis]] as const) {
        const fault = printedFaults[kind]
        if (fault) judgeWord(into, fault.got, node, fault.shows, ground.stretchAt(fault.at))
      }
      const unprintedFaults = unprintedWordFaults(ground)
      for (const [kind, into] of [['weg', oracleFaults.UngedrucktWeg], ['neu', oracleFaults.UngedrucktNeu], ['zahl', oracleFaults.UngedrucktZahl]] as const) {
        const fault = unprintedFaults[kind]
        if (fault) judgeWord(into, fault.got, node, fault.shows, null, fault.kind)
      }
      const swapped = zifferSwap(node, ground.gotKey, paraRows)
      if (swapped) judgeWord(oracleFaults.ZifferReihe, plainText(swapped.node), swapped.node, swapped.shows, null)
      const reheaded = headingFault(node, ground.tokens, paraRows)
      if (reheaded) judgeWord(oracleFaults.Ueberschrift, plainText(reheaded.node), reheaded.node, reheaded.shows, null)
      const relabelled = designationBumped(node, ground.gotKey, paraRows)
      if (relabelled) judgeWord(oracleFaults.Bezeichnung, plainText(relabelled.node), relabelled.node, relabelled.shows, null)
      for (const [printedSite, into] of [[true, oracleFaults.Komma], [false, oracleFaults.UngedrucktKomma]] as const) {
        const comma = commaDropped(ground, printedSite)
        if (comma) judgeWord(into, comma.got, node, comma.shows, printedSite ? ground.stretchAt(comma.at) : null, comma.kind)
      }
      if (argAssigned('zeige') === id) {
        for (const [label, faulted] of [['Überschrift', reheaded ? plainText(reheaded.node) : null], ['Ziffer-Reihe', swapped ? plainText(swapped.node) : null], ...Object.entries(printedFaults).map(([k, f]) => [k, f.got] as const), ...Object.entries(unprintedFaults).map(([k, f]) => [`ungedruckt-${k}`, f.got] as const)] as const) {
          if (!faulted) continue
          const judged = judgeAsPage(faulted, node)
          const at = [...faulted].findIndex((ch, i) => ch !== got[i])
          console.log(`     ${label}: ${judged.verdict}${judged.note ? ` — ${judged.note}` : ''}\n        …${faulted.slice(Math.max(0, at - 80), at + 80)}…`)
        }
      }

      const dated = dateFault(got, paraRows)
      if (dated) {
        oracleFaults.Datum.tried++
        const judged = judgeAsPage(dated, node)
        if (judged.verdict !== 'bestätigt') oracleFaults.Datum.caught++
        else {
          oracleFaults.Datum.misses.push(`${cite} ${unitLabel(id)}`)
          if (argFlag('alarme')) {
            const at = dated.split('').findIndex((ch, i) => ch !== got[i])
            oracleFaults.Datum.misses.push(`        Ergebnis mit Fehler: …${dated.slice(Math.max(0, at - 60), at + 40)}…`, ...paraRows.filter((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged').map((r) => `        vorgeschlagen: ${r.proposed.slice(0, 200)}`))
          }
        }
      }
      if (beforeNode) {
        const restored = restoredAbsatz(beforeNode, node, paraRows)
        if (restored) {
          judgeWord(oracleFaults.Zurueck, plainText(restored.node), restored.node, restored.shows, null)
          if (restored.sameOpening) judgeWord(oracleFaults.ZurueckGleich, plainText(restored.node), restored.node, restored.shows, null)
        }
      }
      for (const [replaced, into] of [[false, oracleFaults.E], [true, oracleFaults.Ersatz]] as const) {
        const fault = withKeptRemoval(before, got, replaced)
        if (!fault) continue
        if (judgeAsPage(fault.control, node).verdict !== 'bestätigt') {
          results.controlMoved++
          continue
        }
        const judged = judgeAsPage(fault.faulted, node)
        into.tried++
        if (judged.verdict !== 'bestätigt') into.caught++
        if (judged.note?.startsWith(KEPT_DELETION_NOTE)) into.byKept++
        if (judged.verdict === 'bestätigt') {
          into.misses.push(`${cite} ${unitLabel(id)} — ${paraRows.length} Zeilen, behalten: "${fault.kept.slice(0, 90)}"`)
          if (argFlag('alarme')) {
            const changed = paraRows.filter((r) => r.kind === 'pair' && r.change !== 'unchanged' && !r.elided)
            into.misses.push(...changed.flatMap((r) => [`    geltend      : ${r.current}`, `    vorgeschlagen: ${r.proposed}`]), `    Ergebnis mit Fehler: ${fault.faulted}`)
          }
        }
      }
    }
  }
}

// --- The second witness's faults (20.11.2026) ---------------------------------

/** What a reader can do wrong to a payload: a word lost, a figure misread, two words swapped, the text cut at a line's end. */
const PAYLOAD_KINDS = ['weg', 'zahl', 'tausch', 'schnitt'] as const
type PayloadKind = (typeof PAYLOAD_KINDS)[number]

/** An instruction as the page hands it to the witness (`kons/consolidate.ts`). */
function witnessInstruction(ins: Instruction): WitnessInstruction {
  return { op: ins.op, line: ins.line, payload: ins.payload.map((p) => plainText(p)) }
}

/** The draft's PDF as pages, through the harness cache like every other fetch. */
async function renditionOf(url: string | null): Promise<DraftRendition | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { headers: { 'User-Agent': scriptUserAgent(SCRIPT) } })
    if (!res.ok) return null
    const { extractText, getDocumentProxy } = await import('unpdf')
    const doc = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()), { verbosity: 0 })
    try {
      const { text } = await extractText(doc, { mergePages: false })
      return renditionOfPages(Array.isArray(text) ? text : [text])
    } finally {
      await doc.loadingTask.destroy()
    }
  } catch {
    return null
  }
}

const WORD_AT = (w: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u')

/** One reader's fault in `text` at the word `w` — null where the kind finds no hold there. */
function misread(text: string, w: string, kind: Exclude<PayloadKind, 'schnitt'>): string | null {
  const m = WORD_AT(w).exec(text)
  if (!m) return null
  const at = m.index
  if (kind === 'weg') return `${text.slice(0, at)}${text.slice(at + w.length)}`.replace(/\s{2,}/g, ' ')
  if (kind === 'tausch') {
    const next = /^(\s+)([\p{L}\p{N}][^\s]*)/u.exec(text.slice(at + w.length))
    if (!next) return null
    return `${text.slice(0, at)}${next[2]}${next[1]}${w}${text.slice(at + w.length + next[0].length)}`
  }
  // A figure near the word: its last digit raised by one.
  const window = text.slice(Math.max(0, at - 60), at + w.length + 60)
  const num = /\d+/.exec(window)
  if (!num) return null
  const pos = Math.max(0, at - 60) + num.index + num[0].length - 1
  return `${text.slice(0, pos)}${(Number(text[pos]) + 1) % 10}${text.slice(pos + 1)}`
}

/** The words our side of a place has that the annex's has not; else all of ours. */
function placeWords(place: WitnessPlace): string[] {
  const mine = place.draft.split(/\s+/).map((t) => t.replace(/^[„"'([]+|["'),.;:\]]+$/g, '')).filter((t) => /[\p{L}\p{N}]/u.test(t))
  const theirs = new Set(place.annex.split(/\s+/).map((t) => t.replace(/^[„"'([]+|["'),.;:\]]+$/g, '')))
  const own = mine.filter((t) => !theirs.has(t))
  return own.length ? own : mine
}

/**
 * The draft's instructions with one payload misread at a place the witness
 * settled — the new text the engine applies, never the PDF (the danger the
 * witness has to answer: our reader takes the new text wrongly, the engine
 * applies it faithfully). Null where the kind finds no hold.
 */
function mutatedPayload(instructions: readonly Instruction[], touching: readonly WitnessInstruction[], places: readonly WitnessPlace[], kind: PayloadKind): { instructions: Instruction[]; shows: string } | null {
  const lines = new Set(touching.map((t) => t.line))
  for (const place of places) {
    for (const w of placeWords(place)) {
      for (const [i, ins] of instructions.entries()) {
        if (!lines.has(ins.line)) continue
        const op = ins.op
        if (kind !== 'schnitt' && (op.kind === 'replacePhrase' || op.kind === 'insertPhrase')) {
          const text = op.kind === 'replacePhrase' ? op.to : op.text
          const changed = misread(text, w, kind)
          if (changed === null || changed === text) continue
          const copy = [...instructions]
          copy[i] = { ...ins, op: op.kind === 'replacePhrase' ? { ...op, to: changed } : { ...op, text: changed } }
          return { instructions: copy, shows: `${place.draft} → „${changed.slice(0, 160)}"` }
        }
        if (ins.payload.length === 0 || !ins.payload.some((p) => WORD_AT(w).test(plainText(p)))) continue
        const payload = structuredClone(ins.payload)
        let done: string | null = null
        if (kind === 'schnitt') {
          // Cut at a line's end: the last block of the new text lost.
          if (payload.length > 1) done = `ohne den letzten Block: ${plainText(payload.pop()!).slice(0, 120)}`
          else {
            const host = (function deepest(n: LawNode): LawNode | null { if (n.children.length > 1) return n; for (const c of n.children) { const d = deepest(c); if (d) return d } return null })(payload[0]!)
            if (host) done = `ohne die letzte Einheit: ${plainText(host.children.pop()!).slice(0, 120)}`
            else {
              const node = payload[0]!
              const cut = node.text.search(/[.;:]\s+\S[^.;:]*[.;:]?\s*$/)
              if (cut > 0) { done = `abgeschnitten nach: …${node.text.slice(Math.max(0, cut - 60), cut + 1)}`; node.text = node.text.slice(0, cut + 1) }
            }
          }
        } else {
          const visit = (n: LawNode): boolean => {
            for (const field of ['heading', 'text'] as const) {
              const value = n[field]
              if (typeof value !== 'string') continue
              const changed = misread(value, w, kind)
              if (changed !== null && changed !== value) { n[field] = changed; done = `${place.draft} → „${changed.slice(0, 160)}"`; return true }
            }
            return n.children.some(visit)
          }
          payload.some(visit)
        }
        if (done === null) continue
        const copy = [...instructions]
        copy[i] = { ...ins, payload }
        return { instructions: copy, shows: done }
      }
    }
  }
  return null
}

/** A figure in a changed row's proposed column raised by one: the annex's fault, not ours. */
function numberInAnnex(rows: readonly ComparisonRow[]): ComparisonRow[] | null {
  const at = rows.findIndex((r) => r.kind === 'pair' && !r.elided && r.change !== 'unchanged' && /\d{2,}/.test(r.proposed))
  if (at < 0) return null
  const row = rows[at]!
  const m = /\d{2,}/.exec(row.proposed)!
  const pos = m.index + m[0].length - 1
  const proposed = `${row.proposed.slice(0, pos)}${(Number(row.proposed[pos]) + 1) % 10}${row.proposed.slice(pos + 1)}`
  return rows.map((r, i) => (i === at ? { ...r, proposed } : r))
}

// --- CLI ----------------------------------------------------------------------
const gp = argAssigned('gp') ?? 'XXVIII'
const limit = Number(argAssigned('limit') ?? 400)
const only = argAssigned('only') ?? null
const xmlMode = argFlag('xml')

/** The corpus without any fault — the number that has to stay small. */
const corpus = { held: 0, rule1: 0, rule2Wide: 0, rule2Para: 0, eitherWide: 0, eitherPara: 0, newAlarms: [] as string[], lostAlarms: [] as string[] }
/** How far the §-wise addressing reaches — the precondition of the whole change. */
const coverage = { units: 0, addressed: 0, rightly: 0, reasons: new Map<string, number>(), ownBag: 0, noOwnBag: 0, noLawBag: 0 }
const faults = {
  L: tally('L     zweiter Satz links verloren'),
  Rold: tally('R-alt fremder geltender Satz rechts'),
  Rnew: tally('R-neu fremder Entwurfssatz rechts'),
  U: tally('U     fremder Satz beidspaltig gleich'),
  Zahl: tally('Zahl  erste Zahl des Textes, neu, +7'),
  Bezeichnung: tally('Spalte-Bezeichnung erste Marke, neu, +1'),
  Wort: tally('Wort  längstes neues Wort getauscht'),
  SatzWeg: tally('Satz-weg letzter neuer Satz fehlt'),
  Rweg: tally('R-weg Satz rechts verloren'),
}
/** The engine's result as the oracle judged it, without any fault. */
const results = { witnessed: 0, verdicts: new Map<OracleVerdict, number>(), silent: new Map<OracleVerdict, number>(), silentSites: [] as string[], moved: [] as string[], confirmed: 0, controlMoved: 0, kept: 0, keptAlarms: [] as string[], order: 0, orderAlarms: [] as string[], dupAbs: [] as string[], rowOrder: [] as string[], placeAlarms: [] as string[] }
const oracleFaults = {
  E: oracleTally('E     eine Einheit zu viel'),
  Ersatz: oracleTally('E-neben alter Text neben dem neuen'),
  Reihe: oracleTally('Reihe zwei Absätze vertauscht'),
  Fehlt: oracleTally('Fehlt Absatz der Auslassung fehlt'),
  Datum: oracleTally('Datum Tag eines Datums verschoben'),
  Luecke: oracleTally('Lücke ausgelassene Einheit fehlt'),
  LueckeBeide: oracleTally('Lücke-beide fehlt auch im geltenden'),
  WortWeg: oracleTally('Wort-weg ein gedrucktes Wort fehlt'),
  WortWegSinn: oracleTally('Wort-weg-Sinn nicht/nur/oder … fehlt'),
  WortNeu: oracleTally('Wort-neu ein Wort des § zu viel'),
  WortTausch: oracleTally('Wort-tausch ein Wort ersetzt'),
  Zahl: oracleTally('Zahl letzte Ziffer einer Zahl'),
  Verweis: oracleTally('Verweis § 5 → § 6, lit. a → b'),
  ZifferReihe: oracleTally('Ziffer-Reihe zwei Ziffern vertauscht'),
  Ueberschrift: oracleTally('Überschrift ein Wort ersetzt'),
  UngedrucktWeg: oracleTally('Ungedruckt-weg Wort fehlt'),
  UngedrucktNeu: oracleTally('Ungedruckt-neu Wort zu viel'),
  UngedrucktZahl: oracleTally('Ungedruckt-Zahl Zahl geändert'),
  Zurueck: oracleTally('Zurück Absatz samt Nummern zurück'),
  ZurueckGleich: oracleTally('Zurück-gleich … gleicher Anfang'),
  Bezeichnung: oracleTally('Bezeichnung Ziffer/Litera umbenannt'),
  Komma: oracleTally('Komma gedrucktes Komma fehlt'),
  UngedrucktKomma: oracleTally('Ungedruckt-Komma Komma fehlt'),
  Payload: oracleTally('Payload neuer Text falsch gelesen'),
  BeilageZahl: oracleTally('Beilage-Zahl Zahl in der Beilage'),
  SpalteZahl: oracleTally('Spalte-Zahl erste Zahl des Textes +7'),
  SpalteBezeichnung: oracleTally('Spalte-Bezeichnung erste Marke +1'),
  SpalteWort: oracleTally('Spalte-Wort längstes neues Wort getauscht'),
  SpalteSatzWeg: oracleTally('Spalte-Satz-weg letzter neuer Satz fehlt'),
  SpalteRweg: oracleTally('Spalte-R-weg Satz rechts verloren'),
}
/** The reader's faults in the annex's right column, held by the oracle against the unchanged result. */
const columnClasses = [oracleFaults.SpalteZahl, oracleFaults.SpalteBezeichnung, oracleFaults.SpalteWort, oracleFaults.SpalteSatzWeg, oracleFaults.SpalteRweg]
/** The word classes of 19.11.2026, printed in a table of their own with the check that caught each. */
const wordClasses = [oracleFaults.WortWeg, oracleFaults.WortWegSinn, oracleFaults.WortNeu, oracleFaults.WortTausch, oracleFaults.Zahl, oracleFaults.Verweis, oracleFaults.ZifferReihe, oracleFaults.Ueberschrift, oracleFaults.UngedrucktWeg, oracleFaults.UngedrucktNeu, oracleFaults.UngedrucktZahl, oracleFaults.Zurueck, oracleFaults.ZurueckGleich, oracleFaults.Bezeichnung, oracleFaults.Komma, oracleFaults.UngedrucktKomma]
/** The word classes held to `--mindestens`: ≥ 95 % on both paths with ≥ 20 tries when measured. */
const flooredWordClasses = [oracleFaults.WortWeg, oracleFaults.WortWegSinn, oracleFaults.WortNeu, oracleFaults.WortTausch, oracleFaults.Zahl, oracleFaults.Verweis, oracleFaults.ZifferReihe, oracleFaults.Ueberschrift, oracleFaults.UngedrucktWeg, oracleFaults.UngedrucktNeu, oracleFaults.UngedrucktZahl, oracleFaults.Zurueck, oracleFaults.Bezeichnung]
/**
 * Every class `--mindestens` holds, one list for the floor and the record.
 * Not „Lücke-beide": a unit RIS lacks where the annex jumps over it silently
 * is a blind spot by construction (`withoutUnit`), not a reach. Payload since
 * 20.11.2026 (416/432 on the PDF path, 183/187 on the table path): the second
 * witness shows what the annex does not confirm, and a misread payload it
 * lets through is a § shown that is not the draft. Bezeichnung and
 * Spalte-Bezeichnung since 21.11.2026, with check 6 (`labelBroken`): a
 * label of the result, or of the annex's column, that is not the other's.
 */
const flooredClasses = [oracleFaults.E, oracleFaults.Ersatz, oracleFaults.Reihe, oracleFaults.Fehlt, oracleFaults.Datum, oracleFaults.Luecke, ...flooredWordClasses, oracleFaults.Payload, oracleFaults.SpalteBezeichnung]
/**
 * A floored class that cannot occur on one path by construction, with why
 * (21.11.2026): the floor and the record say „nicht anwendbar" there, not
 * „nicht gehalten" — but only while the run finds no site (`floorOf`).
 * „Lücke" reads a jump between two unit markers of ONE row
 * (`silentOmissions`), from a unit or from a cell that opens the § with its
 * designation; a cell of the table path holds one unit and opens no §.
 */
const NOT_ON_PATH: Record<string, { path: 'pdf' | 'table'; why: string }> = {
  Lücke: { path: 'table', why: 'eine Zelle des Tabellenpfads hält eine Einheit und eröffnet keinen Paragraphen: zwischen zwei Markern einer Zeile lässt sie nichts aus' },
}
const notApplicableOf = (key: string): string | undefined => (NOT_ON_PATH[key]?.path === (xmlMode ? 'table' : 'pdf') ? NOT_ON_PATH[key]!.why : undefined)

const docs: any[] = []
// As many pages as `--limit` asks for; the loop stopped at page 4 whatever the
// limit said, as `harness/annexPdf.ts` did until 30.09.2026.
for (let page = 1; page <= Math.ceil(limit / 100) && docs.length < limit; page++) {
  const body = await risJson({
    Applikation: 'Begut',
    'Begut.Gesetzgebungsperiode': gp,
    DokumenteProSeite: 'OneHundred',
    Seitennummer: String(page),
  })
  const refs = asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)
  if (refs.length === 0) break
  docs.push(...refs)
}
const listWindow = windowOf(docs.slice(0, limit), cache.served)
console.log(`GP ${gp}: ${docs.length} Entwürfe aus dem RIS — ${windowLine(listWindow)}\n`)

let drafts = 0
/** The drafts of the list the run looked at, and those it could not read, with why — the record's reach. */
let requested = 0
const unreached: { id: string; cause: string }[] = []
for (const doc of docs.slice(0, limit)) {
  const label = `${doc?.Data?.Metadaten?.Bundesrecht?.Begut?.Begutachtungsverfahrennummer ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? ''} ${doc?.Data?.Metadaten?.Bundesrecht?.Titel ?? ''}`
  if (only && !label.toLowerCase().includes(only.toLowerCase())) continue
  requested++
  try {
    const result = await inject(doc)
    if (!result) continue
    drafts++
    console.log(`  ·  ${result.cite.padEnd(9)} ${String(result.judged).padStart(3)} bestätigte Paragraphen, ${String(result.injected).padStart(3)} davon mit Injektionsstelle`)
  } catch (err) {
    console.log(`  ?  ${String(doc?.Data?.Metadaten?.Bundesrecht?.Kurztitel ?? '?').slice(0, 9).padEnd(9)} ${String(err).slice(0, 90)}`)
    unreached.push({ id: String(doc?.Data?.Metadaten?.Technisch?.ID ?? label.trim()), cause: String(err).slice(0, 200) })
  }
}

const pct = (n: number, of: number): string => (of === 0 ? '   —  ' : `${((n / of) * 100).toFixed(1).padStart(5)} %`)
console.log(`\n${'='.repeat(86)}`)
console.log(xmlMode ? 'Fehlerinjektion in die lesbaren XML-Beilagen (der Tabellenpfad)' : 'Fehlerinjektion in die gerasterten Beilagen (PDF-Textebene)')
console.log(`  auswertbare Entwürfe : ${drafts}`)
console.log(`\n  Ohne Injektion — Fehlalarme über die Paragraphen, die die linke Prüfung nicht verfehlen`)
console.log(`  (dieselbe Grundmenge wie die beiden Einbehalt-Zeilen in harness/annexPdf.ts, ${corpus.held} Paragraphen;`)
console.log(`   dieser Lauf kennt keine MAX_PARAGRAPHS-Decke, zählt also auch den Schwanz der Sammelnovellen mit)`)
console.log(`    „bereits geltend"                      : ${String(corpus.rule1).padStart(4)} (${pct(corpus.rule1, corpus.held)})`)
console.log(`    „nicht im Entwurf", ganzer Entwurf     : ${String(corpus.rule2Wide).padStart(4)} (${pct(corpus.rule2Wide, corpus.held)})`)
console.log(`    „nicht im Entwurf", je Paragraph       : ${String(corpus.rule2Para).padStart(4)} (${pct(corpus.rule2Para, corpus.held)})`)
console.log(`    eine der beiden, ganzer Entwurf        : ${String(corpus.eitherWide).padStart(4)} (${pct(corpus.eitherWide, corpus.held)})`)
console.log(`    eine der beiden, je Paragraph          : ${String(corpus.eitherPara).padStart(4)} (${pct(corpus.eitherPara, corpus.held)})`)
for (const line of corpus.newAlarms) console.log(`      + ${line}`)
for (const line of corpus.lostAlarms) console.log(`      - ${line}`)

// Whether the §-wise reference reaches the §§ at all. It is the precondition
// of the whole change: an instruction nobody could address contributes to the
// general bag, so poor coverage does not fail a § — it silently returns the
// rule to the whole-draft bag, and a rate nobody prints cannot say so.
console.log(`\n  Adressierung der Novellierungsanordnungen`)
console.log(`    Anordnungen gelesen              : ${coverage.units}`)
console.log(`    davon mit mindestens einem §     : ${coverage.addressed} (${pct(coverage.addressed, coverage.units)})`)
// The rest is two different things, and a residual that adds them up reads as
// a bigger gap than it is: an Inhaltsverzeichnis, a Titel and an Abschnitt
// heading name no § and belong in the general bag whatever the grammar learns.
console.log(`    ohne Paragraph, zu Recht         : ${coverage.rightly} (${pct(coverage.rightly, coverage.units)})`)
console.log(`    ohne Paragraph, ungelesen        : ${coverage.units - coverage.addressed - coverage.rightly} (${pct(coverage.units - coverage.addressed - coverage.rightly, coverage.units)})`)
console.log(`    Paragraphen der Beilage mit eigenem Sack : ${coverage.ownBag}`)
console.log(`    …nur mit dem allgemeinen Sack ihres Gesetzes: ${coverage.noOwnBag}`)
console.log(`    …ohne jede Anordnung für ihr Gesetz (Rückfall auf den ganzen Entwurf): ${coverage.noLawBag}`)
for (const [reason, n] of [...coverage.reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`      ${String(n).padStart(4)}× im allgemeinen Sack: ${reason}`)
}

console.log(`\n  Mit Injektion, je Fehler ("nicht im Entwurf" mit beiden Bezügen)`)
console.log(`  Fehler                                §§   linke Prüfung besteht   „bereits geltend"    n.i.E. ganz         n.i.E. je §         beide ganz          beide je §          Tor, wie ausgeliefert`)
for (const fault of Object.values(faults)) {
  const cell = (n: number): string => `${String(n).padStart(6)} (${pct(n, fault.tried)})`
  console.log(`  ${fault.label.padEnd(36)} ${String(fault.tried).padStart(4)}   ${cell(fault.leftPasses)}   ${cell(fault.rule1)}   ${cell(fault.rule2Wide)}   ${cell(fault.rule2Para)}   ${cell(fault.eitherWide)}   ${cell(fault.eitherPara)}   ${cell(fault.shipped)}`)
}
// A rule that was already firing on the sound § did not catch the fault; it
// was there before it. Small by construction (the false-positive rate above),
// and printed rather than assumed.
for (const fault of Object.values(faults)) {
  if (fault.rule1Already === 0 && fault.rule2WideAlready === 0 && fault.rule2ParaAlready === 0 && fault.shippedAlready === 0) continue
  console.log(`    ${fault.label.trim()}: davon schon ohne Injektion gemeldet — Regel 1 ${fault.rule1Already}, Regel 2 ganz ${fault.rule2WideAlready}, je § ${fault.rule2ParaAlready}, Tor wie ausgeliefert ${fault.shippedAlready}`)
}
// And the other direction: a fault that takes an alarm *away*. Zero is the
// claim, not the assumption — the left column exempts the right one, so text
// smuggled left is an alibi.
for (const fault of Object.values(faults)) {
  if (fault.silenced === 0) continue
  console.log(`    ${fault.label.trim()}: bringt eine vorher feuernde Regel zum Schweigen — ${fault.silenced}`)
}

// The oracle's side: faults in the engine's RESULT rather than in the annex.
console.log(`\n  Orakel (kons/tguOracle.ts) über das Ergebnis der Engine, ohne Injektion`)
for (const [verdict, n] of [...results.verdicts].sort((a, b) => b[1] - a[1])) console.log(`    ${verdict.padEnd(14)}: ${String(n).padStart(5)}`)
console.log(`    Paragraphen mit Auslassung ohne Zeichen (\`silentOmissions\`): ${[...results.silent].map(([v, n]) => `${v} ${n}`).join(', ') || '0'}`)
for (const line of results.silentSites) console.log(`      · ${line}`)
console.log(`    davon mit anderem Urteil als ohne diese Lesart: ${results.moved.length}`)
for (const line of results.moved) console.log(`      ± ${line}`)
console.log(`    Prüfung 4 („Gestrichenes steht noch im Ergebnis") meldet ohne Injektion: ${results.kept}`)
for (const line of results.keptAlarms) console.log(`      + ${line}`)
console.log(`    Prüfung 3 am Ort („wo die Gegenüberstellung nichts ändert") meldet ohne Injektion: ${results.placeAlarms.filter((l) => !l.startsWith('          ')).length}`)
for (const line of results.placeAlarms) console.log(`      ${line.startsWith('          ') ? '' : '+ '}${line}`)
console.log(`    Prüfung 2, Reihenfolge der Zeilen („an anderer Stelle") meldet ohne Injektion: ${results.rowOrder.filter((l) => !l.startsWith('          ')).length}`)
for (const line of results.rowOrder) console.log(`      ${line.startsWith('          ') ? '' : '+ '}${line}`)
console.log(`    Prüfung 5 („Absätze der Beilage nicht so im Ergebnis") meldet ohne Injektion: ${results.order}`)
for (const line of results.orderAlarms) console.log(`      + ${line}`)
console.log(`\n  Mit Injektion ins Ergebnis, über ${results.confirmed} bestätigte Paragraphen mit geltendem Text (Kontrolle verschob ${results.controlMoved})`)
console.log(`  Fehler                                §§   gefangen            davon Prüfung 4 (Reihe, Fehlt, Lücke: Prüfung 5)`)
for (const fault of [oracleFaults.E, oracleFaults.Ersatz, oracleFaults.Reihe, oracleFaults.Fehlt, oracleFaults.Datum, oracleFaults.Luecke, oracleFaults.LueckeBeide]) {
  const cell = (n: number): string => `${String(n).padStart(6)} (${pct(n, fault.tried)})`
  console.log(`  ${fault.label.padEnd(36)} ${String(fault.tried).padStart(4)}   ${cell(fault.caught)}   ${cell(fault.byKept)}`)
}
console.log(`\n  Wortfehler im Ergebnis (19.11.2026), dieselben bestätigten Paragraphen — gefangen von Prüfung 1 bis 6`)
console.log(`  Fehler                                §§   gefangen               P1     P2    P2r     P3    P3o     P4     P5     P6`)
for (const fault of wordClasses) {
  const by = (check: string): string => String(fault.byCheck.get(check) ?? 0).padStart(6)
  console.log(`  ${fault.label.padEnd(36)} ${String(fault.tried).padStart(4)}   ${String(fault.caught).padStart(6)} (${pct(fault.caught, fault.tried)})   ${by('P1')} ${by('P2')} ${by('P2r')} ${by('P3')} ${by('P3o')} ${by('P4')} ${by('P5')} ${by('P6')}`)
  for (const [kind, [tried, caught]] of fault.kinds) console.log(`      ${kind.padEnd(22)} ${String(tried).padStart(4)}   ${String(caught).padStart(6)} (${pct(caught, tried)})`)
}
console.log(`\n  Lesefehler in der rechten Spalte der Beilage, vom Orakel gegen das unveränderte Ergebnis gehalten — gefangen von Prüfung 1 bis 6`)
console.log(`  Fehler                                §§   gefangen               P1     P2    P2r     P3    P3o     P4     P5     P6`)
for (const fault of columnClasses) {
  const by = (check: string): string => String(fault.byCheck.get(check) ?? 0).padStart(6)
  console.log(`  ${fault.label.padEnd(36)} ${String(fault.tried).padStart(4)}   ${String(fault.caught).padStart(6)} (${pct(fault.caught, fault.tried)})   ${by('P1')} ${by('P2')} ${by('P2r')} ${by('P3')} ${by('P3o')} ${by('P4')} ${by('P5')} ${by('P6')}`)
}
// The second witness (20.11.2026): §§ the oracle contradicts and the draft's
// PDF settles, and what a misread payload does there.
console.log(`\n  Zweiter Zeuge (Gesetzestext im PDF des Entwurfs): ${results.witnessed} widersprochene Paragraphen gezeigt`)
for (const fault of [oracleFaults.Payload, oracleFaults.BeilageZahl]) {
  console.log(`  ${fault.label.padEnd(36)} ${String(fault.tried).padStart(4)}   ${String(fault.caught).padStart(6)} (${pct(fault.caught, fault.tried)})`)
  for (const [kind, [tried, caught]] of fault.kinds) console.log(`      ${kind.padEnd(22)} ${String(tried).padStart(4)}   ${String(caught).padStart(6)} (${pct(caught, tried)})`)
  for (const line of fault.misses) console.log(`      durchgelassen: ${line}`)
}
// An Absatz number held twice: in RIS's own text, or made by the engine —
// the latter a § the page would show with two Absätze of one number.
console.log(`\n  Ergebnisse mit einer Absatznummer zweimal: ${results.dupAbs.length}`)
for (const line of results.dupAbs) console.log(`      · ${line}`)
if (argFlag('misses')) {
  for (const fault of [oracleFaults.E, oracleFaults.Ersatz, oracleFaults.Reihe, oracleFaults.Fehlt, oracleFaults.Datum, oracleFaults.Luecke, oracleFaults.LueckeBeide, ...wordClasses, ...columnClasses]) {
    for (const line of fault.misses) console.log(`    ${line.startsWith('        ') ? '' : `${fault.label.split(' ')[0]} durchgelassen: `}${line}`)
  }
}

/**
 * `--mindestens=95`: fail (exit 1) when the oracle catches less than this
 * share of any fault class it was tried on at least 20 times (26.10.2026).
 *
 * The five classes are the oracle's measured reach, and a reach that is only
 * printed regresses unseen — the first three classes stood at 1 to 3 % for
 * weeks before anyone injected them. With a floor, a change to
 * `kons/tguOracle.ts` or to the engine that loses a class fails the run the
 * way a test does. Twenty tries, because below that one miss is five points.
 *
 * A class below twenty tries is not held (`floorOf`): printed as „nicht
 * gehalten" and recorded so (20.11.2026), where the floor used to skip it
 * unsaid — „Fehlt" with 0 tries on the PDF path passed the floor of
 * 20.11.2026 as if held. The outcome goes into the record before the exit,
 * so a run whose floor failed leaves a record that says so.
 */
const keyOf = (label: string): string => label.trim().split(/\s+/)[0]!
const floorArg = argAssigned('mindestens')
const floor = floorArg === null ? null : floorOf(flooredClasses.map((f) => ({ key: keyOf(f.label), tried: f.tried, caught: f.caught, notApplicable: notApplicableOf(keyOf(f.label)) })), Number(floorArg))
if (floor) {
  for (const f of flooredClasses) {
    const status = floor.status.get(keyOf(f.label))
    if (status === 'verfehlt') console.log(`  ✗ unter ${floor.min} %: ${f.label.trim()} — ${f.caught}/${f.tried}`)
    if (status === 'nicht gehalten') console.log(`  · nicht gehalten (unter 20 Versuchen): ${f.label.trim()} — ${f.caught}/${f.tried}`)
    if (status === 'nicht anwendbar') console.log(`  · nicht anwendbar auf diesem Pfad: ${f.label.trim()} — ${notApplicableOf(keyOf(f.label))}`)
  }
  if (floor.passed) console.log(`  ✓ jede Fehlerklasse mit mindestens 20 Versuchen zu mindestens ${floor.min} % gefangen${floor.unheld.length ? `; nicht gehalten: ${floor.unheld.join(', ')}` : ''}`)
}

/**
 * The annex gate's classes under the same flag (21.11.2026), each at its own
 * floor: the gate catches 60 to 80 % of them by design, so 95 % would fail
 * every run, and with no floor a change that weakens the left check or a
 * right-column rule showed only as a smaller figure on /genauigkeit after a
 * round. Each floor is the class's lower measured share over both paths,
 * rounded down to five (20.11.2026: L 62,9 % PDF, 66,5 % table; R-alt 68,9 /
 * 79,4 %; R-neu 79,5 / 76,0 %). U and the reader's faults in the right
 * column are blind spots by construction, measured near 0 %, and not held.
 */
const GATE_FLOORS: Record<string, number> = { L: 60, 'R-alt': 65, 'R-neu': 75 }
const gateStatus = (f: FaultTally): FloorStatus => {
  const key = keyOf(f.label)
  return floorOf([{ key, tried: f.tried, caught: f.shipped }], GATE_FLOORS[key]!).status.get(key)!
}
const gateFloor = floor && new Map(Object.values(faults).filter((f) => keyOf(f.label) in GATE_FLOORS).map((f) => [keyOf(f.label), gateStatus(f)] as const))
for (const [key, status] of gateFloor ?? []) {
  const f = Object.values(faults).find((x) => keyOf(x.label) === key)!
  if (status === 'verfehlt') console.log(`  ✗ Tor unter ${GATE_FLOORS[key]} %: ${f.label.trim()} — ${f.shipped}/${f.tried}`)
  if (status === 'nicht gehalten') console.log(`  · Tor nicht gehalten (unter 20 Versuchen): ${f.label.trim()} — ${f.shipped}/${f.tried}`)
}
const gatePassed = ![...(gateFloor?.values() ?? [])].includes('verfehlt')

// The whole chain (`judgeChain`): withheld, marked, shown without a mark — over the §§ shown unmarked before the fault.
console.log(`\n  Die ganze Kette der Seite (Tor, dann Wort für Wort): Fehler in Paragraphen, die vorher ohne Markierung gezeigt wurden`)
console.log(`    Klasse                              Versuche  einbehalten  markiert  ohne Markierung   (Regel ${OBJECTION_OVER_CONFIRMATION}; gefangen je Wert: ${RULES.join(' / ')})`)
for (const t of Object.values(chainFaults)) {
  console.log(`    ${t.label.padEnd(36)}${String(t.tried).padStart(8)}${String(t.withheld).padStart(13)}${String(t.marked).padStart(10)}${String(t.unmarked).padStart(17)}   ${pct(t.withheld + t.marked, t.tried)} gefangen   (${RULES.map((rule) => `${t.byRule[rule].withheld + t.byRule[rule].marked}/${t.byRule[rule].tried}`).join(' / ')}); Orakel vorher bestätigt ${t.oracleBefore}, danach gefragt ${t.oracleAsked}`)
}
if (argFlag('misses')) for (const t of Object.values(chainFaults)) for (const m of t.misses) console.log(`      ${t.label}: ${m}`)
const chainFloored = CHAIN_FLOORED.filter((k) => notFlooredOf(k) === undefined)
const chainFloor = floor && floorOf(chainFloored.map((k) => ({ key: k, tried: chainFaults[k].tried, caught: chainFaults[k].withheld + chainFaults[k].marked })), CHAIN_FLOOR)
for (const k of CHAIN_FLOORED.filter((c) => !chainFloored.includes(c))) if (floor) console.log(`  · Kette auf diesem Pfad nicht gehalten: ${chainFaults[k].label} — ${notFlooredOf(k)}`)
for (const k of chainFloored) {
  const status = chainFloor?.status.get(k)
  if (status === 'verfehlt') console.log(`  ✗ Kette unter ${CHAIN_FLOOR} %: ${chainFaults[k].label} — ${chainFaults[k].withheld + chainFaults[k].marked}/${chainFaults[k].tried}`)
  if (status === 'nicht gehalten') console.log(`  · Kette nicht gehalten (unter 20 Versuchen): ${chainFaults[k].label}`)
}
if (chainFloor?.passed) console.log(`  ✓ die Kette fängt ${chainFloored.map((k) => chainFaults[k].label).join(', ')} zu mindestens ${CHAIN_FLOOR} %`)
const chainPassed = !chainFloor || chainFloor.passed
if (gateFloor && gatePassed) console.log(`  ✓ das Tor fängt L, R-alt und R-neu mindestens zu ${Object.entries(GATE_FLOORS).map(([k, v]) => `${k} ${v} %`).join(', ')}`)

/**
 * `--json=<file>`: the tallies above as a record (19.11.2026), for
 * `scripts/harness/genauigkeit.ts`, which writes the figures `/genauigkeit`
 * shows. Each class with its key (the label's first word), its label, how
 * often it was tried and caught; the annex faults with what the shipped gate
 * catches (`shipped`) and how many of those it withheld without the fault
 * too (`alreadyWithheld`). `floored` marks the classes `--mindestens` holds,
 * `floor` what it made of each, and the record's `floor` the outcome — null
 * where the run had no floor, which the builder refuses. An annex class the
 * gate's floor holds (`GATE_FLOORS`) carries its `floorMin` and its `floor`.
 */
const jsonPath = argAssigned('json')
if (jsonPath) {
  const floored = new Set<object>(flooredClasses)
  const out = {
    ...harnessStamp(),
    // Of the drafts of the list, every one whose reading threw; a draft
    // without an annex on this path is read and not counted in `drafts`.
    ...corpusReach(requested, unreached),
    gp,
    path: xmlMode ? 'table' : 'pdf',
    window: listWindow,
    drafts,
    floor: floor ? { min: floor.min, passed: floor.passed, failed: floor.failed, unheld: floor.unheld, notApplicable: floor.notApplicable } : null,
    annex: Object.values(faults).map((f) => ({
      key: keyOf(f.label),
      label: f.label.trim(),
      tried: f.tried,
      caught: f.shipped,
      alreadyWithheld: f.shippedAlready,
      ...(gateFloor?.has(keyOf(f.label)) ? { floorMin: GATE_FLOORS[keyOf(f.label)], floor: gateFloor.get(keyOf(f.label)) } : {}),
    })),
    result: [oracleFaults.E, oracleFaults.Ersatz, oracleFaults.Reihe, oracleFaults.Fehlt, oracleFaults.Datum, oracleFaults.Luecke, oracleFaults.LueckeBeide, ...wordClasses, oracleFaults.Payload].map((f) => ({
      key: keyOf(f.label),
      label: f.label.trim(),
      tried: f.tried,
      caught: f.caught,
      floored: floored.has(f),
      ...(floor && floored.has(f) ? { floor: floor.status.get(keyOf(f.label)) } : {}),
      // Why the class cannot occur on this path, where its floor says „nicht anwendbar".
      ...(floor?.status.get(keyOf(f.label)) === 'nicht anwendbar' && floored.has(f) ? { notApplicable: notApplicableOf(keyOf(f.label)) } : {}),
    })),
    // The annex's right column misread, as the oracle sees it against the unchanged result.
    column: columnClasses.map((f) => ({ key: keyOf(f.label), label: f.label.trim(), tried: f.tried, caught: f.caught, floored: floored.has(f), ...(floor && floored.has(f) ? { floor: floor.status.get(keyOf(f.label)) } : {}) })),
    // The whole chain the page runs, gate then table (`judgeChain`, 21.11.2026), under each value of the table's open cell.
    chain: (Object.entries(chainFaults) as [ChainKey, ChainTally][]).map(([key, t]) => ({ key, label: t.label, tried: t.tried, withheld: t.withheld, marked: t.marked, unmarked: t.unmarked, byRule: t.byRule, oracleBefore: t.oracleBefore, oracleAsked: t.oracleAsked, floored: chainFloored.includes(key), ...(chainFloor && chainFloored.includes(key) ? { floorMin: CHAIN_FLOOR, floor: chainFloor.status.get(key) } : {}), ...(notFlooredOf(key) ? { notFloored: notFlooredOf(key) } : {}) })),
    chainRule: OBJECTION_OVER_CONFIRMATION,
  }
  writeFileSync(jsonPath, `${JSON.stringify(out, null, 1)}\n`)
  console.log(`\nBericht geschrieben: ${jsonPath}`)
}
if ((floor && !floor.passed) || !gatePassed || !chainPassed) process.exit(1)
