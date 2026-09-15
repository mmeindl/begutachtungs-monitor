# How much legislation never sees a Begutachtung?

**As of 2026-09-15.** Research memo answering one question: the monitor shows
what happens *inside* the Begutachtungsverfahren — how much lawmaking happens
entirely *outside* it? Every figure below was measured live against
parlament.gv.at on 2026-09-15 and is reproducible with
`node scripts/begutachtung-skipped.mjs XXVIII`.

**Finding:** in GP XXVIII, **87 of 166 enacted laws (52.4 %) never went
through a Begutachtung** — and the dominant route is not the one you would
guess. Only 23 were Regierungsvorlagen filed without a Ministerialentwurf;
**64 were Initiativanträge**, bills introduced by MPs, which have no
ministerial draft stage at all and therefore never reach the consultation
system the monitor watches.

Measured again on the complete GP XXVII (2019–2024) to rule out a one-
coalition quirk: **535 of 830 laws, ≈ 63 % after the budget correction** —
and COVID emergency legislation does not account for it (§4).

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
   preceded it.

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

### GP XXVIII (as of 2026-09-15, period still running)

| | laws | share |
|---|---:|---:|
| Enacted laws reachable from GP XXVIII Gegenstände | 173 | |
| — exempt by design (budget procedure) | 7 | |
| **Base** | **166** | 100 % |
| With Begutachtung | 79 | 47.6 % |
| **Without Begutachtung** | **87** | **52.4 %** |
|   … as Regierungsvorlage without Ministerialentwurf | 23 | 13.9 % |
|   … as Initiativantrag | 64 | 38.6 % |

Substantive laws in the "without" column include the Teilpensionsgesetz, all
three parts of the Betrugsbekämpfungsgesetz 2025, the Anti-Mogelpackungs-
Gesetz, the Preisauszeichnungsgesetz, the EPaRÄG 2025, the
Budgetsanierungsmaßnahmengesetz II, the Pensionsanpassungsgesetz 2026, the
Asylgesetz-Novelle, the Waffengesetz-Novelle and three ORF-Novellen (two to
the ORF-Gesetz, one to the ORF-Beitrags-Gesetz).

### GP XXVII (2019–2024, complete period)

Measured the same way, to test whether GP XXVIII is a quirk of one coalition.
830 enacted laws, **535 without Begutachtung (64.5 % raw)** — 62 as
Regierungsvorlage without Ministerialentwurf, **473 as Initiativantrag**.

Two corrections, both stated rather than applied:

- **The exemption list does not yet cover GP XXVII.** 27 budget-procedure
  items (BFG 2020–2023, BFRG ×5, Vorbelastungen) are still counted as
  skipped. They have not been reviewed individually, so the honest figure is
  "≈ 63 % after the budget correction", not a fourth significant digit.
- **COVID does not explain it.** 83 of the 473 Initiativantrag laws carry a
  pandemic-related title — the emergency legislation of 2020/21 was indeed
  routed past Begutachtung at scale. But removing all 83 from both sides
  leaves **≈ 63 %**. The pattern is not a crisis artefact.

Two periods, two governments, one crisis between them: **roughly half to
two-thirds of enacted law never passes through a public consultation.** GP
XXVIII's 52.4 % is the more conservative and the more current number, and is
the one to quote.

### Denominator caveat

The base is "laws reachable from GP XXVIII Gegenstände", not "everything
published in BGBl I during those months". Laws enacted early in the period
that originated in GP XXVII are outside the corpus. For a period-to-period
comparison this is consistent; for "share of all law in year X" it is not the
right frame.

## 5. What this is *not*

An Initiativantrag is a legitimate instrument, not a trick. MPs have the
right of initiative and use it for their own affairs, for opposition bills
that never pass, and for genuinely urgent matters. The finding is **not**
"64 laws were smuggled past the public".

The finding is narrower and harder to argue with: **the consultation stage is
optional, and about half of enacted law does not pass through it.** Whether
that should be so is a political question this memo does not answer — see
`outreach/verfahrensfragen.md` for what still needs a procedural expert.

Accordingly, and per the framing rule in `CLAUDE.md`: this number belongs in
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
  stations) is noted in `TODO.md`; it is deliberately downstream of this
  measurement.
- **An open question, not a claim:** whether Austria has any legal duty to
  hold a Begutachtung, and what the status of the six-week Frist actually is.
  The memo's argument is strongest if the answer is "none, and a
  recommendation" — which is exactly why it must be verified by someone
  qualified before it is said in public. See `outreach/verfahrensfragen.md`.

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
