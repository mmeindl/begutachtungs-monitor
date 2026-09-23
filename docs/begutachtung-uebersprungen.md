# How much legislation never sees a Begutachtung?

**As of 2026-09-16** (first measured 2026-09-15; the headline was revised down
a day later, see §4a). Research memo answering one question: the monitor shows
what happens *inside* the Begutachtungsverfahren — how much lawmaking happens
entirely *outside* it?

Reproduce with, in this order:

```
npx vite-node scripts/corpus/begutachtungSkipped.ts XXVIII   # the corpus and the base rate
npx vite-node scripts/corpus/meAntragJoin.ts    XXVIII      # the §4a correction (slow: one document per item)
npx vite-node scripts/corpus/begutachtungSkipped.ts XXVIII   # again — now it reads the correction
```

**Finding:** in GP XXVIII, **80 of 166 enacted laws (48.2 %) never went
through a Begutachtung.** The raw count is 87 (52.4 %); seven of those were
consulted as a Ministerialentwurf and then introduced by another route, proven
by text comparison rather than guessed (§4a). The dominant route is not the
one you would guess: only 23 were Regierungsvorlagen filed without a
Ministerialentwurf, while **64 were Initiativanträge**, bills introduced by
MPs, which have no ministerial draft stage at all.

**And the Initiativanträge are mostly not the parliament's own.** 48 of the 64
were filed by members of the governing parties alone — under the current
coalition, 42 of 50. Counting both routes, **65 of 166 enacted laws (39.2 %)
are government or coalition bills that skipped the stage.** That is the number
that survives the obvious objection (§1).

Measured again on the complete GP XXVII (2019–2024) to rule out a one-
coalition quirk: **485 of 809 (60.0 %)** corrected, 514 raw; 442 of them
(54.6 %) government or coalition bills; 429 of its 473 Initiativanträge
(90.7 %) from the governing parties alone — and COVID emergency legislation
does not account for it (§4).

**Say "Begutachtung", not "public consultation".** Since § 23b GOG-NR
(01.08.2021) parliament publishes every bill and accepts statements on it, and
people use it: the skipped laws of GP XXVIII carry **960** parliamentary
Stellungnahmen, those of GP XXVII carry **139,501**. These bills skipped the
*ministerial* stage — the one with a deadline, an invited circle and a
ministry obliged to receive the result. They did not all vanish from public
view. §4c has the numbers and what they mean for the wording in the product.

**This is not new ground.** The Parliament's own research service published a
Fachdossier on the same shift in October 2024; what it found, and what is left
for this memo to add, is §4b. Reading it first would have saved a day.

**Status: research note, not a work package.** What it gates and why is §6.

---

## 1. Why the obvious measurement is the wrong one

The tempting number is "Regierungsvorlagen without a Ministerialentwurf".
For GP XXVIII that is 32 of 117 (27 %), and it is misleading in the
direction that matters: it measures only the *polite* bypass.

A government that wants to avoid a Begutachtung does not file a
Regierungsvorlage without one — that is conspicuous. It routes the bill
through its own MPs as an **Initiativantrag**. An Initiativantrag is a
legitimate constitutional instrument (MPs hold the right of initiative), it
needs no ministerial draft, and it is not a Regierungsvorlage, so it is
invisible to the 27 % figure entirely.

The same effect was already visible in the amendment-engine corpus
(`api-exploration.md` §2a): 25 of 54 sampled Novellen came via
Initiativantrag or Ausschussantrag.

So the unit here is the **BGBl I number** — of the laws that actually
passed, how many were publicly consulted first? Three routes lead to one:

| Route | Consulted? |
|---|---|
| Regierungsvorlage **with** a Ministerialentwurf | yes |
| Regierungsvorlage **without** one | no |
| Initiativantrag (selbständiger Antrag, `ART=A`) | no, by construction |

### The objection, and the measurement that answers it

Anyone who knows the procedure deflates the headline in one sentence:
*Initiativanträge are parliament exercising its own right of initiative —
that is not a finding.* Correct, as long as it is the MPs. If it is the
governing parties, the bill is a government project taking the short road.

The detail JSON answers this directly: `names[]` carries the named proposers
with a `frak_code` per club. Which clubs were in government has to be supplied
by hand — `frak_code` gives the club, not its role, and the role changes
mid-period (GP XXVIII has two coalitions; GP XXVII opens under a caretaker
government of no party at all). The table lives in the script next to the
exemption list, for the same reason: there is no field for it.

| Who filed the skipped Initiativanträge | GP XXVIII | GP XXVII |
|---|---:|---:|
| **governing parties alone** | **48 (75.0 %)** | **429 (90.7 %)** |
| cross-party | 10 | 21 |
| all clubs together | 6 | 12 |
| opposition alone | 0 | 11 |

The dominant filing is a single club combination: `N+S+V` 48 times in GP
XXVIII, `G+V` 432 times in GP XXVII. In GP XXVII, of roughly fifty bills filed
by opposition MPs, eleven became law.

One caveat that cuts the other way: `names[]` lists only the named proposers,
not the "Kolleginnen und Kollegen" of the motion text. "Governing parties
alone" therefore always means: *the named proposers* are.

A second one specific to GP XXVIII: between 24.10.2024 and 02.03.2025 the
ÖVP-Grüne government was caretaker **and** without a majority in the house, so
a bill filed by those two clubs could not pass on their votes. The script
reports that window separately (14 Anträge, 6 of them coalition-only) rather
than folding it into the total.

## 2. Method

Three list calls and one detail call per Gegenstand, all on the Parliament
filter API — no RIS, no scraping.

1. **List 101**, `{GP_CODE, ITYP:["I"], VHG:["RV"]}` → every
   Regierungsvorlage of the period (GP XXVIII: 117).
2. **List 101**, `{GP_CODE, ITYP:["A"]}`, then `ART === 'A'` in code → every
   selbständiger Antrag on a Bundesgesetz (164). `A(E)`
   (Entschließungsantrag) and `AMIN` (Ministeranklage) are filtered out: they
   cannot become law.
3. **List 81**, `{GP_CODE}` → the Ministerialentwürfe that were actually in
   Begutachtung, used to verify rather than believe the `preconst` pointer.
4. Per Gegenstand, `/gegenstand/{GP}/{ITYP}/{INR}?json=True`:
   `content.status.bgbllinks` says whether it became law;
   `content.preconst[]` with `ityp: "ME"` says whether a Ministerialentwurf
   preceded it; `content.names[]` gives the proposers and their clubs (§1).
5. Per Ministerialentwurf, the same detail call: title, `einlangen`, the end
   of the Begutachtungsfrist out of `stages`, and whether `stages` point
   forward to a Regierungsvorlage — the inputs to the correction in §4a.
6. **List 142**, once per skipped law as
   `{BEZUG_GP_CODE, BEZUG_ITYP, BEZUG_INR}` **without `showAll`**, reading only
   `count` → the statements parliament itself collected (§4c). Per bill rather
   than per period on purpose: the period-wide query is capped and mixes up two
   different `GP_CODE` dimensions, both silently (§4c).
7. Per Gegenstand and per Ministerialentwurf, the `Gesetzestext` document as
   HTML — the corpus for the text join in `scripts/corpus/meAntragJoin.ts`. This
   is the only step that costs a document fetch per item, which is why it is
   a separate script with its own cache.

**One trap, paid for once (16.09.2026).** List 81 and list 101 do not share a
column layout. In list 81 the title is column 4 (`Betreff`) and column 6 is
the `Ressort`; in list 101 column 6 is the title. Comparing the two lists by
index silently matches law titles against ministry abbreviations and returns
a clean, confident zero. Take titles from the detail JSON, and give every
matching pass a control that is supposed to produce hits.

**Deduplication.** One BGBl number can be reachable from two Gegenstände (a
Regierungsvorlage whose Ausschuss absorbed an Initiativantrag). The BGBl
number is therefore the key, counted once; where two routes claim one number
the consulted route wins and the collision is reported, not silently
resolved.

**`preconst` is not a reliable solo signal** — it is not a universal field.
126 d.B. carries no `preconst` key at all (and no `stages`), so its absence
is not proof on its own. Cross-checked independently against list 81 by title
and date: of the 32 Regierungsvorlagen without a `preconst` ME, 28 have no
matching Ministerialentwurf before them at all, and the remaining 4 match
only on a 25-character prefix of a generic ASVG title, i.e. different laws.

## 3. The exemption problem, and why it is hand-maintained

Some laws are exempt by design. The Bundesfinanzgesetze and the
Bundesfinanzrahmengesetz follow the constitutional budget timetable and never
go to Begutachtung. Calling a BFG "skipped" is simply wrong, and any reader
who knows the procedure would discard the whole number on the spot.

**There is no structured signal for this.** Measured on GP XXVIII:

- list 101's `Gruppe` column is `null` on all 117 Regierungsvorlagen;
- the `THEMEN` tag `"Budget und Finanzen"` covers both the genuinely exempt
  **Bundesfinanzgesetz 2026** and the **Anti-Mogelpackungs-Gesetz** and
  **Preisauszeichnungsgesetz**, which are ordinary consumer law.

A keyword or THEMEN rule would therefore exempt precisely the cases that are
the finding. The exemption list is consequently explicit, per item, with a
reason per entry, and the script prints every non-exempt skipper in full so
the list is maintained by reading the corpus rather than by guessing a rule —
the same review loop as the classifier audit (`architecture.md` §12.9).

Seven items are exempt for GP XXVIII (BFG 2025–2028, BFRG ×2, Vorbelastungen).

**Two candidate classes are deliberately left in the count** pending a ruling
from someone who knows the procedure:

- **Budgetprovisorium** (71/A, 123/A) — budget subject matter, but filed as
  an Initiativantrag during government formation.
- **Parliament's own organisational law** (Geschäftsordnungsgesetz,
  Informationsordnungsgesetz, Bundesbezügegesetz, Klubfinanzierungsgesetz,
  Parteienfinanzierung, Parlamentsmitarbeitergesetz — ~6 items). Here the
  Initiativantrag is arguably the constitutionally *correct* route: these are
  the Nationalrat's own affairs, and a ministerial draft would be the odd
  thing.

Both classes move the headline by a few points, not by half. That is the
point of listing them openly instead of tuning the number.

## 4. Results

### GP XXVIII (as of 2026-09-16, period still running)

| | laws | share |
|---|---:|---:|
| Enacted laws reachable from GP XXVIII Gegenstände | 173 | |
| — exempt by design (budget procedure) | 7 | |
| **Base** | **166** | 100 % |
| With Begutachtung | 79 | 47.6 % |
| **Without Begutachtung (raw)** | **87** | **52.4 %** |
|   … as Regierungsvorlage without Ministerialentwurf | 23 | 13.9 % |
|   … as Initiativantrag | 64 | 38.6 % |
|     … of those, filed by governing parties alone | 48 | 28.9 % |
| **Without Begutachtung, corrected (§4a)** | **80** | **48.2 %** |
|   … government or coalition bills among them | 65 | 39.2 % |
|   … of the 87 raw, with § 23b statements in parliament (§4c) | 43 | 960 statements |

Substantive laws in the "without" column include the Teilpensionsgesetz, all
three parts of the Betrugsbekämpfungsgesetz 2025, the Anti-Mogelpackungs-
Gesetz, the Preisauszeichnungsgesetz, the EPaRÄG 2025, the
Budgetsanierungsmaßnahmengesetz II, the Pensionsanpassungsgesetz 2026, the
Asylgesetz-Novelle, the Waffengesetz-Novelle and three ORF-Novellen (two to
the ORF-Gesetz, one to the ORF-Beitrags-Gesetz).

### GP XXVII (2019–2024, complete period)

Measured the same way, to test whether GP XXVIII is a quirk of one coalition.
830 enacted laws reachable, 21 exempt by design, **514 of the remaining 809
without Begutachtung (63.5 % raw)** — 62 as Regierungsvorlage without
Ministerialentwurf, **473 as Initiativantrag**.

Both corrections are now applied, not merely stated:

- **The exemption list covers GP XXVII since 2026-09-16.** Curated by reading
  all 535 raw titles: 27 carry a budget-procedure name, 21 are exempt (5
  Bundesfinanzgesetze, 8 Bundesfinanzrahmengesetze incl. three amendments
  within the Art-51 timetable, 8 Vorbelastungen). **Six deliberately stay in
  the count**, each with a reason in the script: four bundle a Vorbelastungen
  authorisation with substantive law (the CHIP-Gesetz-Begleitmaßnahmengesetz,
  two Unternehmens-Energiekostenzuschussgesetz amendments, a COVID asset
  authorisation) — the authorisation is budget execution, the attached law is
  not and could have been consulted; two are the Budgetprovisorium 2020, the
  same contested class left in for GP XXVIII.
- **The ME→Antrag route (§4a) is applied too.** 29 of the 473 motions continue
  a consulted draft, taking the period to **60.0 %**. (The discarded title
  method claimed 170 — the clearest evidence it was measuring titles, not
  bills.)
- **COVID does not explain any of it.** 83 of the 473 Initiativantrag laws
  carry a pandemic-related title — the emergency legislation of 2020/21 was
  indeed routed past Begutachtung at scale. But removing all 83 from both
  sides leaves **≈ 63 %** on the raw basis. The pattern is not a crisis
  artefact.

Two periods, two governments, one crisis between them: **five to six of every
ten enacted laws never pass through a Begutachtung.** GP XXVIII is the more
conservative and the more current measurement, and **48.2 % is the figure to
quote** — not the raw 52.4 %, for the reason in §4a. Where a single number
must carry the claim, use the government-and-coalition cut instead: **39.2 %
of enacted law is a government project that skipped the stage.** It is
smaller, it is harder to argue with, and it is the one that matches what is
actually being asserted.

Whatever number is used, it needs the noun right: these laws skipped the
*Begutachtung*, not "public participation" — see §4c before writing a slide.

### Denominator caveat

The base is "laws reachable from GP XXVIII Gegenstände", not "everything
published in BGBl I during those months". Laws enacted early in the period
that originated in GP XXVII are outside the corpus. For a period-to-period
comparison this is consistent; for "share of all law in year X" it is not the
right frame.

## 4a. The correction: bills that were consulted after all

A ministry can draft a bill, send it to Begutachtung as a Ministerialentwurf,
and then have it introduced by its own MPs as an Initiativantrag instead of
filing a Regierungsvorlage. Those laws **were** publicly consulted. The first
version of this memo counted every one of them as skipped.

**The route is invisible in the structured data.** A Ministerialentwurf's
`stages` carry a forward pointer to its successor — measured on GP XXVIII, 96
of 132 drafts have one, and **every single pointer names a Regierungsvorlage.
Not one names an Antrag.** There is no field, no flag and no link for this
path; it can only be found by comparing titles and dates.

**Titles do not work, and the failure is instructive.** The first attempt
compared titles. Calibrated against 91 pairs known to belong together (a draft
and its own Regierungsvorlage), a quarter fell below any usable threshold —
"Einkommensteuergesetz, Änderung" carries no information — while in the larger
corpus the same titles over-matched wildly: 170 candidates in GP XXVII against
37 real ones. A key that is both too blind and too greedy is not a key.

**What works is the text.** Both sides publish a document called
`Gesetzestext`. `scripts/corpus/meAntragJoin.ts` compares 5-word shingles of it.

Three details earn their keep, and the second one is a mistake worth keeping
on the record:

- **A document-frequency filter.** Legal texts share formulas — *"tritt mit
  dem der Kundmachung folgenden Tag in Kraft"* — and at five words those
  produce a small, reliable overlap between any two texts. The first run
  pinned four different Anträge to one draft at 3 % each. Dropping shingles
  that appear in more than 2 % of documents took the noise median to zero.
- **Containment, not Jaccard — and the calibration could not see the
  difference.** An Antrag often lifts one piece out of a large draft: 72/A is
  570 words, its 6/ME is 11,934. Even if the Antrag were *entirely* inside the
  draft, Jaccard could not exceed 570/11,934 ≈ 4.8 %, so it scored 3.1 % and
  was discarded despite an identical title. Its containment is 95 %. The first
  calibration missed this because its true pairs were drafts against their
  *own* Regierungsvorlage, which are of similar length — **calibrated on a
  population that lacked the property that breaks the measure.** The fix is
  containment of the smaller text, plus a second calibration set built by
  cutting a tenth out of each Regierungsvorlage to manufacture the asymmetry
  on purpose.
- **The threshold is set for precision, not recall.** A false hit asserts of a
  named law that it was consulted; a miss only leaves the count too high. At a
  25 % floor the method catches 99 % of known-true pairs in both periods with
  **zero** false positives, and 72–77 % of the artificially asymmetric ones —
  the latter is a lower bound, since a slice may contain material added after
  the consultation, where finding nothing is the right answer.

Reported in two tiers, and the boundary is read off the data rather than
chosen: hits cluster at 77–100 % and again at 30–35 %, with nothing between.

| | GP XXVIII | GP XXVII |
|---|---:|---:|
| Raw count without Begutachtung | 87 (52.4 %) | 514 (63.5 %) |
| Initiativanträge continuing a consulted draft (confirmed) | 7 | 29 |
| … weak matches, shared passages only | 3 | 20 |
| **Corrected** | **80 (48.2 %)** | **485 (60.0 %)** |
| … with weak matches deducted too | 77 (46.4 %) | 486 (58.6 %) |
| … of which government or coalition bills | 65 (39.2 %) | 442 (54.6 %) |

**Where the method stays silent:** 6 Anträge in GP XXVIII and 59 in GP XXVII
are shorter than ~250 words, too little text to judge. They keep counting as
skipped, which for them is an assumption rather than a measurement. Both
scripts say so in their output; the JSON names them.

**Eight cases are their own finding.** The Initiativantrag was filed *while
the Begutachtungsfrist to the matching draft was still running*: two in GP
XXVIII (763/A and 764/A on 23.03.2026, one day before their deadline) and six
in GP XXVII. The most consequential is **2173/A, the
COVID-19-Impfpflichtgesetz** — 100 % coverage with 164/ME, filed before that
draft's consultation had closed. The consultation was open, the submissions
were still arriving, and the bill went into the house anyway. This belongs in
the product as a fact on the individual procedure, and it is squarely
*Nachverfolgung* rather than blame: it says what happened to the input.

## 4b. Prior art: the Parliament's own Fachdossier

The Rechts-, Legislativ- und Wissenschaftlicher Dienst (RLW) of the
Parlamentsdirektion published
[*Wie haben sich Gesetzesinitiativen in der XXVII. GP verändert?*](https://www.parlament.gv.at/fachinfos/rlw/Wie-haben-sich-Gesetzesinitiativen-in-der-XXVII.-GP-veraendert/)
on 31.10.2024, with a [press release](https://www.parlament.gv.at/aktuelles/pk/jahr_2024/pk1033)
on 11.11.2024. It reports, for GP XXVII:

- 53 % of Gesetzesbeschlüsse rested on selbständige Anträge, 38 % on
  Regierungsvorlagen — the first period in which motions outweighed government
  bills.
- In the 2023/24 session, 93 of 99 successful motions came from ÖVP and Grüne
  MPs; of roughly 50 filed by SPÖ, FPÖ and NEOS, none succeeded.
- **19 of those 93 began as a Ministerialentwurf** — the phenomenon §4a had to
  measure independently.
- It names the empty-vehicle pattern: *Trägerraketen*, motions changing a
  punctuation mark that are filled with content in committee. The dossier page
  and the press release give different counts (14 and 19 of 99); read the
  dossier before quoting either.

**What remains for this memo**, stated plainly so the overlap is not oversold:
the RLW measured initiative *types* and their share of Beschlüsse for one
period. This measures the **BGBl unit** — of the laws that actually entered
into force, how many were consulted — across two periods, with an explicit
exemption list, a correction for the ME→Antrag route, and a script anyone can
rerun. Adjacent and complementary, not a discovery.

The practical lesson is the cheaper one: the institution being measured
published its own analysis of the same shift two years earlier, and half a
day of searching would have found it before any of the measuring started.

## 4c. Skipping the Begutachtung is not disappearing from view

**§ 23b GOG-NR, in force since 01.08.2021:** parliament publishes every
Gesetzesinitiative on its website and accepts statements on it — including on
Initiativanträge and on Regierungsvorlagen, for as long as the bill is before
the house. List 142 with `BEZUG_ITYP: "A"` or `"I"` returns them.

Measured on the laws this memo calls skipped:

| | laws with statements | statements |
|---|---:|---:|
| GP XXVIII (of 87 skipped) | 43 | 960 |
| GP XXVII (of 514 skipped) | 139 | 139,501 |

**Ask per bill, without `showAll`, and read `count`.** The obvious query — one
`showAll=true` call per period — is wrong twice over, and both failures are
silent. `showAll` is capped at 100,000 rows with no marker (GP XXVII reports
`count: 180709` and delivers exactly 100,000), and `GP_CODE` is the period of
the *statement* while `BEZUG_GP_CODE` is the period of the bill it belongs to.
Together those two produced 30 laws / 679 statements for GP XXVIII where the
correct query gives 43 / 960, and roughly half the true total for GP XXVII.
Both traps are now written up in `api-exploration.md` §1.

The distribution is extreme and worth seeing. GP XXVIII: the
Waffengesetz-Novelle alone has 466, the Fachhochschulgesetz 78, a
Dienstrechts-Novelle 72. GP XXVII is dominated by the pandemic —
**96,064 on the COVID-19-Impfpflichtgesetz**, 27,312 on an Epidemiegesetz
amendment. The Impfpflichtgesetz is also one of the eight §4a cases: consulted
as 164/ME, introduced as an Antrag before that consultation closed, then met
with the largest wave of public statements in the corpus — about two thirds of
every statement in this table.

**This is not the same procedure**, and the difference is the whole point:

| | ministerial Begutachtung | § 23b statements |
|---|---|---|
| deadline | yes, six weeks recommended | none — open while the bill is in the house |
| who is asked | an invited circle (Länder, Kammern, courts) | nobody; you have to find it |
| who receives it | the drafting ministry, before it files | published; no addressee obliged to read |
| when | before the bill exists as a bill | after it is already in parliament |

So the accurate sentence is **"ohne Begutachtung"**, never "ohne
Öffentlichkeit" and never "nie öffentlich konsultiert". The bills skipped the
stage where input can still cheaply change a draft; they remained visible in
the stage where it mostly cannot.

Two consequences:

1. **For the product, this is an opportunity, not only a caveat.** 466 people
   filed on the Waffengesetz-Novelle through a channel the monitor currently
   cannot see at all. A consultation the tool misses is worse than a
   consultation it explains.
2. **For the argument, it cuts both ways.** It weakens "these laws escaped the
   public" and strengthens the actual claim — that participation is being
   moved to the point where it is least able to change anything. The second is
   the more interesting finding anyway.

### A third location, and what happens to input that lands there

§ 23b is not the only channel that stays open when no draft is on the table.
**Petitionen and parlamentarische Bürgerinitiativen** accept statements and
endorsements for as long as the item is before the house — the same list 142,
`BEZUG_ITYP: "PET"` or `"BI"`. Measured 2026-09-16, GP XXVIII: **27 Petitionen
carrying 420 statements, 36 Bürgerinitiativen carrying 792** — 1,212
submissions across 63 items.

The question worth asking is not how many arrive but what becomes of them, and
for once a completed period answers it. GP XXVII, from `status.description` on
each Gegenstand:

| | Bürgerinitiativen (74) | Petitionen (148) |
|---|---:|---:|
| Ausschussbericht **zur Kenntnis genommen** | 50 | 115 |
| carried into the next GP (§ 21 Abs. 1a GOG) | 18 | 0 |
| Sammelbericht of the Petitionsausschuss | 3 | — |
| still on a committee agenda / Mitteilung | — | 18 |
| assigned to a subject committee, **Beratungen nicht aufgenommen** | — | ~5 |
| **a subject committee actually reported** | **3** | **4** |

The last row is the whole finding. Arbeit und Soziales (×2) and
Konsumentenschutz took up a Bürgerinitiative and reported; Familie und Jugend,
Verkehr, Unterricht and Gesundheit did so for a Petition — and the
Gesundheitsausschuss report carries an **angenommene Entschließung**. So input
through this channel does occasionally move something. It happens in about
**4–5 % of cases**.

**The carry-over is not a quiet death, and not an escape either.** All 18
Bürgerinitiativen marked „Verhandlungsgegenstand der nächstfolgenden GP" carry
an explicit successor link into GP XXVIII (`XXVIII/BI/1`–`18`) — the data
records where each went, which is more than the Ministerialentwurf → Antrag
route does (§4a). Following them through: ten ended in Kenntnisnahme a second
time, four produced a Mitteilung, three are still on the Petitionsausschuss
agenda and one reached the Bildungsausschuss. Carrying over buys a second
round, not a different outcome. Counted through, **60 of 74 GP-XXVII
Bürgerinitiativen end in Kenntnisnahme**.

**Why this belongs in this memo and not in the product.** It completes the
migration argument: participation does not disappear when a draft skips the
Begutachtung, it relocates, and there are now three measured locations for it —
the ministerial Begutachtung, where a ressort must process what arrives before
it files; § 23b statements, where nobody is obliged to; and Petitionen/BI,
where a committee notes it, three times in four.

It is deliberately **not** a work package, for the reason
`docs/volksbegehren.md` gives: there is no successor document. Even the 4–5 %
that move produce Petition → Ausschussbericht → perhaps an Entschließung, and
no two versions of a text to compare. The accountability core — *what became of
the input, § by §* — has nothing to bite on. One objection from the
Volksbegehren analysis does *not* carry over, and it should be recorded
honestly: there, a mechanical tracker could only ever print 47/47
Kenntnisnahme. Here the wins exist, are identifiable and are nameable. They are
simply rare.

## 5. What this is *not*

An Initiativantrag is a legitimate instrument, not a trick. MPs have the
right of initiative and use it for their own affairs, for opposition bills
that never pass, and for genuinely urgent matters. The finding is **not**
"64 laws were smuggled past the public".

The finding is narrower and harder to argue with: **the consultation stage is
optional, roughly half of enacted law does not pass through it, and most of
that is government business rather than parliamentary business.** Whether that
should be so is a political question this memo does not answer, and one of
several that still need a procedural expert.

Nor is it "these laws escaped the public" (§4c). They skipped the stage where
input is cheap to act on. Several of them drew thousands of statements later,
at the point where a text is hardest to change — which is a sharper thing to
say, and a true one.

The club split (§1) sharpens the finding and must not be allowed to flip it
into an accusation. It says the skipped bills are mostly the government's, not
that anyone broke a rule — on present understanding there is no rule to break,
which is the open question that gates the whole memo (§6). "The governing
parties file their bills this way" is a description of a practice. It becomes
a charge only once someone establishes what the practice is owed, and that is
not this document's call to make.

Accordingly, and per the framing rule (`docs/architecture.md` §4): this
number belongs in
the product, if at all, as *a fact on an individual procedure* ("dieser
Entwurf ging ohne Begutachtung ins Parlament") and as *a system-level
statistic*. **Never as a ministry ranking** — "BMF skipped consultation more
often than anyone else" is the blame counter the framing rule forbids, and
this dataset would make it trivially easy to build.

## 6. What it gates

- **Mechanism 2 (evidence for the carrier).** This is a base rate about the
  consultation regime itself. A respond-or-explain duty argues about what
  ministries do *with* Stellungnahmen; this number argues about whether a
  consultation happens at all. Related reform, not the same one — worth being
  precise about which rule the evidence supports.
- **A procedural prerequisite for showing ME-less procedures in the UI.**
  The product decision (state "ohne Begutachtung" instead of rendering empty
  stations) is not taken yet; it is deliberately downstream of this
  measurement.
- **And §4a is a hard blocker on that label.** "Ohne Begutachtung" on a
  procedure that *was* consulted, and merely arrived by another route, is a
  false statement about a named law on a public page — the worst failure this
  project can ship. Aggregate figures can carry a range; a page about a single
  law cannot. Either the label waits for a per-procedure check strong enough
  to stand alone, or it says only what is certain ("kein Ministerialentwurf zu
  dieser Vorlage") and leaves the inference to the reader. The second is
  cheaper, true today, and the better sentence anyway.

  **Stand 18.09.2026: the per-procedure check exists, and the label is bound
  to it.** The "Zweite Runde" rows on `/` and `/entwuerfe` carried "ohne
  Begutachtung" off a missing `preconst` pointer alone — the inference this
  section warns against, shipped. It now runs the same cross-check this
  memo's §2 ran offline: list 81 of the period, title similarity, only drafts
  that began before the Vorlage was filed (`server/utils/parliament/precedingDraft.ts`).
  Calibrated against the 85 pointer-confirmed ME→RV pairs of GP XXVIII, a
  Jaccard threshold of 0.50 recovers 72 of 81 measurable pairs and fires on 3
  of the 32 pointerless Vorlagen — all three the generic ASVG/Dienstrecht
  family §2 already identified as false matches. Those three lose the label
  although they earned it; that direction is the point. **The residual gap is
  the other nine:** where a title genuinely changes between draft and
  Vorlage, the check would not find the predecessor, so roughly one in ten
  such histories stays invisible to it — which is why the wording stays
  procedural and per-row, and why no aggregate is derived from it in the
  product.
- **An open question, not a claim:** whether Austria has any legal duty to
  hold a Begutachtung, and what the status of the six-week Frist actually is.
  The memo's argument is strongest if the answer is "none, and a
  recommendation" — which is exactly why it must be verified by someone
  qualified before it is said in public.

## 7. API by-products

- **List 101's type filter is solved** (it was open as §13.7): `ITYP` takes
  `I` (Verhandlungsgegenstand) and `A` (Antrag); `VHG` takes `RV`, `ANTR`;
  `ART` distinguishes `RV`, `A`, `A(E)`, `AMIN`. One call enumerates every
  Regierungsvorlage of a period.
- **List 101 `Status` ⇔ `statementsstate`.** Status `2` means the item is
  still in the house and taking Stellungnahmen, `5` means it is finished.
  Verified 117/117 on GP XXVIII against the detail JSON's `statementsstate`.
  That makes "which Regierungsvorlagen currently accept Stellungnahmen" **one
  list call** instead of a fan-out.
- **`content.status.bgbllinks` works on Anträge too**, not just on
  Regierungsvorlagen — the cheap "did this become law" signal for any
  Gegenstand type.
- **`content.names[]` carries proposers with a club code** (`frak_code`,
  `funktext: "Eingebracht von"`) on Anträge. Named proposers only — the
  "Kolleginnen und Kollegen" are not enumerated.
- **List 142 takes `BEZUG_ITYP`** — `"A"` returns the statements parliament
  collected on Initiativanträge under § 23b GOG-NR, `"I"` those on
  Regierungsvorlagen (the latter already shipped as "Stellungnahmen zur
  Regierungsvorlage"). GP XXVIII: 781 on motions. The `Zu` column names the
  bill they belong to. This is a second, entirely separate statement corpus
  from the Begutachtung ones, on procedures the monitor does not cover today.
- **Every Gegenstand type publishes a `Gesetzestext` document as HTML** — ME,
  Antrag ("Gesetzestext (Arbeitsdokument ParlDion)") and Regierungsvorlage
  alike. Comparable across types, which is what makes the text join in §4a
  possible; the Erläuterungen and the Textgegenüberstellung are not
  comparable and stay out of it.
- **A Ministerialentwurf's `stages` carry a forward pointer to its successor**
  — "Regierungsvorlage (186 d.B.)" with a `/gegenstand/…` href, plus the end
  of the Begutachtungsfrist as text. Useful beyond this memo: it is a second,
  independent path for the ME→RV join in `ris-join.md`, which today works off
  the Regierungsvorlage's `preconst`. **But it only ever points at a
  Regierungsvorlage** (96/96 on GP XXVIII) — a draft that resurfaces as an
  Initiativantrag has no forward link at all.
