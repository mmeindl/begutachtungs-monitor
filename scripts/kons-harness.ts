#!/usr/bin/env vite-node
/**
 * Verification harness for the amendment engine (docs/architecture.md §12.12).
 *
 * Usage:  npx vite-node scripts/kons-harness.ts BGBLA_2022_I_187 [Kurztitel]
 *         npx vite-node scripts/kons-harness.ts --discover=12
 *
 * `--discover=N` takes the N most recent Bundesgesetze that amend exactly one
 * law ("Bundesgesetz, mit dem das X geändert wird") and runs all of them, so
 * the numbers are a corpus result rather than an anecdote.
 *
 * The idea, and the reason a consolidated law text is publishable at all:
 * for an amendment already promulgated, RIS holds **both** the law before it
 * and the law after it. Each consolidated paragraph version names the
 * amendment that produced it in its `Kundmachungsorgan` ("… zuletzt geändert
 * durch BGBl. I Nr. 187/2022"), so the before/after pair is exact — no date
 * arithmetic, which matters because amendments are routinely retroactive
 * (GSpG § 20: promulgated 2022-12-06, in force from 2022-01-01).
 *
 * The authentic Bundesgesetzblatt (`Applikation=BgblAuth`) publishes the
 * amendment in the same legistic XML as `Begut`, so the instructions are the
 * enacted ones — no drift between what was drafted and what was passed.
 *
 * Three numbers come out, and only the third licenses publication:
 *   angewendet — instructions the engine could carry out at all
 *   geprüft    — paragraphs RIS can confirm or refute
 *   identisch  — paragraphs where the engine produced the law that exists
 */
import { applyNovelle, instructionsFromUnits, resolveTarget, type StandingLaw } from '../server/utils/lawApply'
import { plainText, type LawNode } from '../server/utils/lawStructure'
import { parseRisXml, segmentUnits, type TextBlock } from '../server/utils/lawText'
import { promulgationByArticle } from '../server/utils/lawTitles'
import type { NovaoAddress } from '../server/utils/novao'
import { amendedBy, fetchAllVersions, fetchParagraphTree, getText, resolveGesetzesnummer, resolveLawByBgbl, versionPairFor, type KonsParagraphRef } from '../server/utils/risKons'
import { extraTokens, isSubsetOfRis, verdictForTrees } from '../server/utils/applyReport'
import { installFetchCache } from './harness-cache'
import { appendFileSync, writeFileSync } from 'node:fs'

interface Verdict {
  bgbl: string
  law: string
  instructions: number
  read: number
  applied: number
  checked: number
  identical: number
  untouched: number
  incomplete: number
  divergent: number
  unverifiable: number
  /** Paragraphs whose instructions all applied — the set a per-paragraph gate would publish */
  cleanTotal: number
  cleanIdentical: number
  cleanDivergent: number
  note: string | null
}

type VersionPair = { before: KonsParagraphRef | null; after: KonsParagraphRef; afters: KonsParagraphRef[] }

const RIS = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht'
const UA = { 'User-Agent': 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)', Accept: 'application/json' }
const verbose = !process.argv.includes('--quiet')
/**
 * `--dump=<file>` writes one JSON line per checked paragraph: verdict, the
 * three texts, the trees before and after, and every instruction that
 * addressed the paragraph with its operands. The detector work
 * (`server/utils/applyGuard.ts`) needs to be evaluated against exactly this
 * record set, and a dump makes that a one-second offline loop instead of a
 * reason to keep adding flags to this script (2026-09-09).
 */
const dumpFile = process.argv.find((a) => a.startsWith('--dump='))?.slice('--dump='.length) ?? null
if (dumpFile) writeFileSync(dumpFile, '')
if (process.argv.includes('--cache')) installFetchCache(process.env.HARNESS_CACHE ?? '.harness-cache')

/* eslint-disable @typescript-eslint/no-explicit-any */
async function risJson(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${RIS}?${new URLSearchParams(params)}`, { headers: UA, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

function asArray<T>(x: T | T[] | null | undefined): T[] {
  return x === null || x === undefined ? [] : Array.isArray(x) ? x : [x]
}

/**
 * The Bundesgesetze that amend exactly one law — the cases a harness can score.
 *
 * The captured name is only a *hint* for the title fallback in `resolveLaw`;
 * the law's identity comes from its Promulgationsklausel. The optional
 * "das X erlassen und" skips a Stammgesetz enacted in the same BGBl
 * ("… mit dem das ESG-Rating-Verordnung-Vollzugsgesetz erlassen und das
 * Finanzmarktaufsichtsbehördengesetz geändert wird", BGBl. I Nr. 28/2026):
 * one law is amended, which is what the harness needs, and the old capture
 * swallowed both names into one unusable title (2026-09-09).
 */
async function discoverSingleLawAmendments(count: number): Promise<{ id: string; law: string }[]> {
  const out: { id: string; law: string }[] = []
  for (let page = 1; page <= 12 && out.length < count; page++) {
    const body = await risJson({
      Applikation: 'BgblAuth',
      DokumenteProSeite: 'OneHundred',
      Seitennummer: String(page),
      'Sortierung.SortedByColumn': 'Kundmachungsdatum',
      'Sortierung.SortDirection': 'Descending',
    })
    for (const ref of asArray<any>(body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference)) {
      const id = ref?.Data?.Metadaten?.Technisch?.ID
      const titel = String(ref?.Data?.Metadaten?.Bundesrecht?.Titel ?? '').replace(/<br\/>[\s\S]*/, '').trim()
      // "das", "die" and "der": the first version of this filter took only
      // neuter laws and so skipped every -ordnung (Gewerbeordnung,
      // Exekutionsordnung, Strafprozeßordnung …), a quarter of the corpus.
      const m = /^Bundesgesetz, mit dem (?:(?:das|die|der) \S[^,]*? erlassen und )?(?:das|die|der) ([^,]+?) geändert wird$/.exec(titel)
      if (id && m && out.length < count) out.push({ id, law: m[1]! })
    }
  }
  return out
}

/**
 * The law's name as the Promulgationsklausel writes it — "Das
 * Unternehmensgesetzbuch - UGB, dRGBl. S. 219/1897, …" → "Unternehmensgesetzbuch".
 * A long title with the short one in parentheses ("Das Bundesgesetz
 * betreffend die Bundesstraßen (Bundesstraßengesetz 1971 - BStG 1971), …")
 * yields the parenthesised short title.
 */
function lawNameFromClause(blocks: readonly TextBlock[]): string | null {
  const clause = blocks.find((b) => b.kind !== 'novao' && /\bwird wie folgt geändert\b/i.test(b.text))
  if (!clause) return null
  const m = /^(?:Das|Die|Der)\s+(.+?),\s*(?:d?RGBl|BGBl|StGBl|JGS)\b/i.exec(clause.text)
  if (!m) return null
  const paren = /\(([^()]+?)(?:\s+[-–]\s+[^()]+)?\)\s*$/.exec(m[1]!)
  const name = paren ? paren[1]! : m[1]!
  return name.replace(/\s+[-–]\s+\S+(?:\s+\d{4})?$/, '').trim() || null
}

interface ResolvedLaw {
  gesetzesnummer: string
  kurztitel: string
  versions: Map<string, KonsParagraphRef[]>
  pairs: Map<string, VersionPair>
  via: string
}

/**
 * Which law the Novelle amends — confirmed by the law itself.
 *
 * The join runs on the Promulgationsklausel's Stammnorm (`lawTitles.ts`),
 * because titles do not match: the BgblAuth Kurztitel is "Änderung des
 * Luftfahrtgesetzes", and the name lifted from the Titel fails whenever RIS
 * drops a year ("Bundesgesetz gegen den unlauteren Wettbewerb 1984") or the
 * Titel carries a long form. 6 of 25 Novellen dropped out of a run on the
 * title join alone (2026-09-09).
 *
 * A candidate counts only when a version of that law names this BGBl in its
 * Kundmachungsorgan — the same join the before/after pairs rest on. Without
 * that check the Stammnorm join scored the UGB Novelle (BGBl. I Nr. 26/2026)
 * against the Drittlandunternehmen-Berichterstattungsgesetz: the UGB's
 * Stammnorm is a dRGBl citation, so the clause's first *BGBl* is its last
 * amendment, and that BGBl happened to create a different law.
 *
 * The Stammnorm join also returns null when one Sammel-BGBl created several
 * laws (LMSVG in BGBl. I Nr. 13/2006 next to the Kontroll- und
 * Digitalisierungs-Durchführungsgesetz; UStG 1994 next to its Anhang) — the
 * production resolver refuses ambiguity by design. The title hint and the
 * clause name then pick the law out, checked the same way.
 */
async function resolveLaw(blocks: readonly TextBlock[], bgblNumber: string, kundmachung: string, titleHint: string | undefined): Promise<ResolvedLaw | { note: string }> {
  const stammnormen = [...promulgationByArticle(blocks).values()]
  if (stammnormen.length > 1) return { note: `Sammelnovelle: ${stammnormen.length} Stammnormen` }
  const candidates: { gesetzesnummer: string; kurztitel: string; via: string }[] = []
  const tried: string[] = []
  const add = (gesetzesnummer: string | null, kurztitel: string, via: string): void => {
    if (gesetzesnummer && !candidates.some((c) => c.gesetzesnummer === gesetzesnummer)) candidates.push({ gesetzesnummer, kurztitel, via })
  }
  if (stammnormen[0]) {
    const law = await resolveLawByBgbl(stammnormen[0], kundmachung)
    tried.push(`Stammnorm ${stammnormen[0].organ} ${stammnormen[0].nummer}`)
    add(law?.gesetzesnummer ?? null, law?.kurztitel ?? '', 'Stammnorm')
  }
  const clauseName = lawNameFromClause(blocks)
  for (const [name, via] of [[titleHint, 'Titel'], [clauseName, 'Promulgationsklausel']] as const) {
    if (!name) continue
    tried.push(`Kurztitel "${name}"`)
    add(await resolveGesetzesnummer(name), name, via)
  }
  for (const c of candidates) {
    const versions = await fetchAllVersions(c.gesetzesnummer)
    const pairs = new Map<string, VersionPair>()
    for (const [label, list] of versions) {
      const pair = versionPairFor(list, bgblNumber)
      if (pair) pairs.set(label, pair)
    }
    if (pairs.size > 0) return { ...c, versions, pairs }
  }
  if (candidates.length === 0) return { note: `Gesetz nicht im BrKons gefunden (${tried.join(', ') || 'keine Promulgationsklausel'})` }
  return { note: `${bgblNumber} in keiner Fassung von ${candidates.map((c) => c.kurztitel || c.gesetzesnummer).join(' / ')} als Kundmachungsorgan genannt` }
}

/**
 * The key an instruction's address and a RIS label share. RIS prints an
 * Anlage as "Anl. 2"; an instruction says "Anlage 2" (or "Anhang 2"). §§ and
 * Artikel already agree ("§ 5", "Art. 3"). Without this the anchor of "Nach
 * der Anlage 2 wird folgende Anlage 3 eingefügt" (UStG, BGBl. I Nr. 37/2026)
 * was never loaded and the refusal looked like the engine's (2026-09-09).
 *
 * "Art. 2 § 7" — a law organised in Artikel — stays unmatched on purpose:
 * which Artikel a bare "§ 7" means is a question for the engine, and a
 * harness that guessed would hide that the engine cannot ask it yet.
 */
function labelKey(label: string): string {
  return label.replace(/\s+/g, ' ').trim().replace(/^(?:Anlage|Anhang)\b/, 'Anl.')
}

/** "§ 5" → "5", the id `parseKonsParagraph` gives a paragraph — mirrors the engine's own lookup. */
function paraId(label: string): string | null {
  return /(\d+[a-z]*(?:\.\d+)?)/.exec(label)?.[1] ?? null
}

const missingCauses = new Map<string, number>()

/**
 * What RIS knows about a target the engine could not find. The count alone
 * cannot tell a harness gap from an engine gap: of 42 such refusals in one
 * run, one was a label the harness never loaded, four followed a renumbering
 * the grammar had refused, two addressed an Absatz an *earlier* instruction
 * had wrongly deleted whole, and 32 were "Art. II § 7" addressing the engine
 * does not read (2026-09-09). Each line says which it is, so the next run
 * needs no archaeology.
 */
function missingTargetNote(address: NovaoAddress, resolved: ResolvedLaw, before: StandingLaw, unparsed: ReadonlySet<string>, kundmachung: string): string {
  const count = (cause: string): string => {
    missingCauses.set(cause, (missingCauses.get(cause) ?? 0) + 1)
    return cause
  }
  if (!address.para) return count('Adresse ohne Paragraph')
  const key = labelKey(address.para)
  const byKey = new Map([...resolved.versions.keys()].map((l) => [labelKey(l), l] as const))
  const label = byKey.get(key)
  if (!label) {
    // "§ 19" in a law organised in Artikel is "Art. 2 § 19" to RIS; "§ 1" may also collide with "Art. 1".
    const id = paraId(address.para)
    const similar = [...resolved.versions.keys()].filter((l) => l !== key && (l.endsWith(` ${key}`) || paraId(l) === id)).slice(0, 3)
    return `${count('RIS kennt das Label nicht')}: "${address.para}"${similar.length ? ` — RIS hat: ${similar.join(', ')}` : ''}`
  }
  const pair = resolved.pairs.get(label)
  if (pair && !pair.before) return `${count('entsteht erst durch diese Novelle')}: ${label}`
  if (unparsed.has(label)) return `${count('RIS-Dokument geladen, aber nicht als Paragraph lesbar')}: ${label}`
  const node = before.paragraphs.find((p) => p.id === paraId(label))
  if (!node) return `${count('im RIS vorhanden, vom Prüfstand nicht geladen')}: ${label}`
  const sub = address.abs ?? address.z ?? address.lit
  if (!sub) return `${count('Paragraph stand im Ausgangstext — eine frühere Anweisung hat ihn entfernt oder umbenannt')}: ${label}`
  const ids = [address.lit ?? address.z ?? address.abs!, ...address.siblings]
  const missing = ids.filter((id) => resolveTarget(before, address, id) === null)
  if (missing.length === 0) return count('Untereinheit stand im Ausgangstext — eine frühere Anweisung hat sie entfernt')
  const before_ = resolved.pairs.get(label)?.before ?? null
  return `${count('Untereinheit nicht im Ausgangstext')}: ${label} ${address.lit ? 'lit.' : address.z ? 'Z' : 'Abs.'} ${missing.join(', ')} (RIS-Fassung ${before_?.inkrafttreten ?? `vor ${kundmachung}`})`
}

async function verify(bgblId: string, titleHint?: string): Promise<Verdict> {
  const meta = await risJson({ Applikation: 'BgblAuth', Suchworte: bgblId, DokumenteProSeite: 'Ten' })
  const ref = asArray<any>(meta?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference).find((r) => r?.Data?.Metadaten?.Technisch?.ID === bgblId)
  const blank = (note: string): Verdict => ({ bgbl: bgblId, law: titleHint ?? '?', instructions: 0, read: 0, applied: 0, checked: 0, identical: 0, untouched: 0, incomplete: 0, divergent: 0, unverifiable: 0, cleanTotal: 0, cleanIdentical: 0, cleanDivergent: 0, note })
  if (!ref) return blank('BGBl nicht gefunden')

  const bundesrecht = ref.Data.Metadaten.Bundesrecht
  const bgblNumber: string = bundesrecht.BgblAuth?.Bgblnummer
  const kundmachung: string = bundesrecht.BgblAuth?.Ausgabedatum ?? ''
  const xmlUrl: string | undefined = asArray<any>(ref.Data.Dokumentliste.ContentReference)
    .flatMap((c) => asArray<any>(c.Urls.ContentUrl))
    .find((u) => u.DataType === 'Xml')?.Url
  if (!xmlUrl) return blank('kein XML')

  const blocks = parseRisXml(await getText(xmlUrl))
  const units = segmentUnits(blocks)
  const { instructions, refused } = instructionsFromUnits(units.filter((u) => u.blocks.some((b) => b.kind === 'novao')))
  const total = instructions.length + refused.length
  if (total === 0) return blank('keine Novellierungsanordnungen')

  const resolved = await resolveLaw(blocks, bgblNumber, kundmachung, titleHint)
  if ('note' in resolved) return { ...blank(resolved.note), bgbl: bgblNumber, law: titleHint ?? String(bundesrecht.Kurztitel ?? ''), instructions: total, read: instructions.length }
  const { versions, pairs } = resolved
  const kurztitel = resolved.kurztitel || titleHint || String(bundesrecht.Kurztitel ?? '')

  /** The newest version that already existed when this amendment was promulgated. */
  const lastBefore = (list: readonly KonsParagraphRef[]): KonsParagraphRef | null => {
    const candidates = list.filter((v) => (v.inkrafttreten ?? '9999') <= kundmachung)
    return candidates[candidates.length - 1] ?? list[0] ?? null
  }

  // Only the paragraphs the instructions name are fetched — a law like the
  // Umsatzsteuergesetz has hundreds, and loading all to change six is a
  // minute of RIS traffic for nothing. "Im gesamten Gesetzestext" needs all.
  const wanted = new Set<string>([...pairs.keys()].map(labelKey))
  let wholeText = false
  for (const { op } of instructions) {
    const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
    if (!address) continue
    if (address.level === 'document') wholeText = true
    if (address.para) wanted.add(labelKey(address.para))
  }
  const paragraphs: LawNode[] = []
  /** Fetched, but `parseKonsParagraph` found no paragraph in the document — an Anlage without `<absatz>` blocks, for one. */
  const unparsed = new Set<string>()
  for (const [label, list] of versions) {
    if (!wholeText && !wanted.has(labelKey(label))) continue
    const chosen = pairs.get(label)?.before ?? (pairs.has(label) ? null : lastBefore(list))
    if (!chosen) continue
    const tree = await fetchParagraphTree(chosen)
    if (tree) paragraphs.push(tree)
    else unparsed.add(label)
  }
  const law: StandingLaw = { paragraphs }

  const { law: after, results, unresolved } = applyNovelle(law, instructions)
  // The question a per-paragraph publication gate turns on: when the engine
  // reports no refusal for a §, is that § actually right? Refusals are known
  // at draft time; correctness is not, because the law has not been passed yet.
  const refusedIds = new Set([...unresolved].map((p) => /(\d+[a-z]*)/.exec(p)?.[1] ?? p))
  for (const r of refused) {
    const m = /§+\s*(\d+[a-z]*)/.exec(r.line)
    if (m) refusedIds.add(m[1]!)
  }
  const applied = results.filter((r) => r.applied).length

  if (verbose) {
    console.log(`\n${bgblNumber} vom ${kundmachung} — ${kurztitel} (Join: ${resolved.via})`)
    console.log(`  ${total} Anweisungen, ${instructions.length} gelesen, ${applied} angewendet; ${law.paragraphs.length}/${versions.size} Paragraphen geladen`)
    for (const r of refused) console.log(`    ✗ [Grammatik] ${r.reason} — ${r.line.slice(0, 100)}`)
    for (const [i, r] of results.entries()) {
      if (r.applied) continue
      console.log(`    ✗ [Anwendung] ${r.reason} — ${r.line.slice(0, 100)}`)
      if (!/nicht im geltenden Text/i.test(r.reason ?? '')) continue
      const op = instructions[i]!.op
      const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
      if (address) console.log(`        ↳ RIS: ${missingTargetNote(address, resolved, law, unparsed, kundmachung)}`)
    }
  }

  let checked = 0
  let identical = 0
  let untouched = 0
  let incomplete = 0
  let unverifiable = 0
  let cleanTotal = 0
  let cleanIdentical = 0
  let cleanDivergent = 0
  const divergences: { label: string; got: string; expected: string; before: string }[] = []
  for (const [label, pair] of [...pairs].sort()) {
    const id = /(\d+[a-z]*)/.exec(label)?.[1]
    const node = after.paragraphs.find((p) => p.id === id)
    // Every version this BGBl created is law text that exists; the engine's
    // end state is scored against the best match among them (see
    // `versionPairFor`). The report names the version that matched.
    const truths: { ref: KonsParagraphRef; text: string; tree: LawNode }[] = []
    for (const ref of pair.afters) {
      const tree = await fetchParagraphTree(ref)
      if (tree) truths.push({ ref, text: plainText(tree), tree })
    }
    if (!node || truths.length === 0) continue
    checked++
    const got = plainText(node)
    const beforeNode = law.paragraphs.find((p) => p.id === id)
    const beforeText = beforeNode ? plainText(beforeNode) : null
    const rank = { identisch: 0, 'unvollständig': 1, 'unverändert': 2, abweichend: 3 }
    const best = truths
      .map((t) => ({ ...t, verdict: verdictForTrees(beforeNode ?? null, node, t.tree) }))
      .sort((a, b) => rank[a.verdict] - rank[b.verdict])[0]!
    let verdict = best.verdict
    const expected = best.text
    const matched = best.ref
    // A word diff too large for the DP grid is neither confirmed nor refuted.
    const comparable = beforeText === null || verdict !== 'abweichend' || extraTokens(beforeText, got, expected).comparable
    // Several cuts, and the engine's end state matches none of them alone —
    // "In § 5 werden folgende Abs. 4 bis 6 angefügt" in force from 2028 while
    // Abs. 2a from 2026 (ORF-Beitrags-Gesetz, BGBl. I Nr. 59/2025). If every
    // token the engine wrote is in *some* cut, it did not invent anything;
    // the harness simply has no single text to hold it against.
    const staged = verdict === 'abweichend' && comparable && truths.length > 1 && isSubsetOfRis(beforeText ?? '', got, truths.map((t) => t.text).join(' '))
    if (staged) verdict = 'unvollständig'
    if (id && !refusedIds.has(id)) {
      cleanTotal++
      if (verdict === 'identisch') cleanIdentical++
      else if (verdict === 'abweichend' && comparable) cleanDivergent++
    }
    if (dumpFile) {
      const touching = instructions
        .map((ins, i) => ({ ins, res: results[i]! }))
        .filter(({ ins }) => {
          const op = ins.op
          const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
          if (address?.level === 'document') return true
          if (address?.para && paraId(address.para) === id) return true
          // An instruction that creates this § names its anchor, not the § itself.
          if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') return ins.payload.some((p) => p.id === id)
          return false
        })
        .map(({ ins, res }) => ({
          kind: ins.op.kind,
          applied: res.applied,
          reason: res.reason,
          line: ins.line,
          op: ins.op,
          payload: ins.payload,
        }))
      const refusedLines = refused.filter((r) => /§+\s*(\d+[a-z]*)/.exec(r.line)?.[1] === id)
      const history = (versions.get(label) ?? []).map((v) => ({ inkrafttreten: v.inkrafttreten, amendedBy: amendedBy(v) }))
      appendFileSync(
        dumpFile,
        `${JSON.stringify({ bgbl: bgblNumber, law: kurztitel, label, id, verdict, refused: id !== undefined && refusedIds.has(id), before: beforeText, got, expected, beforeTree: beforeNode ?? null, afterTree: node, touching, refusedLines, afterVersion: matched.inkrafttreten, history, comparable, staged })}\n`,
      )
    }
    const mark = { identisch: '✓', 'unverändert': '·', 'unvollständig': '~', abweichend: '✗' }[verdict]
    if (verdict === 'identisch') identical++
    else if (verdict === 'unverändert') untouched++
    else if (verdict === 'unvollständig') incomplete++
    // A word diff the DP grid refused (lawDiff MAX_DP_CELLS) lands in
    // `abweichend` because the gate must not pass what it cannot check. For
    // the headline number that conflates two different facts: "checked and
    // wrong" and "too long to check". The gate stays strict; the report splits.
    else if (!comparable) unverifiable++
    else divergences.push({ label, got, expected, before: beforeText ?? '' })
    if (verbose) {
      const what = verdict === 'identisch' ? `identisch (Fassung ab ${matched.inkrafttreten}${pair.afters.length > 1 ? `, ${pair.afters.length} Schnitte` : ''})` : staged ? `gestaffelt — ${truths.length} Schnitte, in keinem allein, in allen zusammen` : verdict === 'unvollständig' ? 'unvollständig — nichts Eigenes erfunden' : verdict === 'unverändert' ? 'unverändert gelassen' : comparable ? 'eigene Abweichung' : 'nicht prüfbar (Wortdiff zu groß)'
      console.log(`    ${mark}  ${label.padEnd(9)} ${what}`)
    }
  }
  if (verbose) {
    for (const d of divergences) {
      const extra = extraTokens(d.before, d.got, d.expected)
      console.log(`    --- ${d.label} — Engine änderte, RIS nicht: +[${extra.inserted.slice(0, 8).join(' ')}] -[${extra.removed.slice(0, 8).join(' ')}]`)
    }
  }

  return { bgbl: bgblNumber, law: kurztitel, instructions: total, read: instructions.length, applied, checked, identical, untouched, incomplete, divergent: divergences.length, unverifiable, cleanTotal, cleanIdentical, cleanDivergent, note: null }
}

/** The first place two texts part company, with context on both sides. */
function firstDifference(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return `…${a.slice(Math.max(0, i - 30), i + 70)}…`
}

// --- CLI ----------------------------------------------------------------------
const discover = process.argv.find((a) => a.startsWith('--discover='))
const ids = process.argv.slice(2).filter((a) => /^BGBLA_/.test(a))
const cases: { id: string; law?: string }[] = discover
  ? await discoverSingleLawAmendments(Number(discover.split('=')[1] ?? 10))
  : ids.map((id) => ({ id, law: process.argv[process.argv.indexOf(id) + 1]?.startsWith('-') ? undefined : process.argv[process.argv.indexOf(id) + 1] }))

if (cases.length === 0) {
  console.error('Usage: npx vite-node scripts/kons-harness.ts <BGBl-ID> [Kurztitel] | --discover=N')
  process.exit(1)
}

const verdicts: Verdict[] = []
for (const c of cases) {
  try {
    verdicts.push(await verify(c.id, c.law))
  } catch (err) {
    console.log(`\n${c.id}: ${String(err)}`)
  }
}

const scored = verdicts.filter((v) => v.note === null)
const sum = (pick: (v: Verdict) => number) => scored.reduce((n, v) => n + pick(v), 0)
console.log(`\n${'='.repeat(78)}`)
console.log(`Prüfstand über ${scored.length} Novellen${verdicts.length > scored.length ? ` (${verdicts.length - scored.length} nicht auswertbar)` : ''}`)
const pct = (n: number, of: number) => (of === 0 ? '—' : `${((n / of) * 100).toFixed(1)} %`)
console.log(`  Anweisungen           : ${sum((v) => v.instructions)}`)
console.log(`  grammatikalisch gelesen: ${sum((v) => v.read)} (${pct(sum((v) => v.read), sum((v) => v.instructions))})`)
console.log(`  angewendet             : ${sum((v) => v.applied)} (${pct(sum((v) => v.applied), sum((v) => v.instructions))})`)
console.log(`  geprüfte Paragraphen   : ${sum((v) => v.checked)}`)
console.log(`    identisch mit dem RIS: ${sum((v) => v.identical)} (${pct(sum((v) => v.identical), sum((v) => v.checked))})`)
console.log(`    unverändert gelassen : ${sum((v) => v.untouched)} (${pct(sum((v) => v.untouched), sum((v) => v.checked))})  — ungefährlich, wird verweigert`)
console.log(`    unvollständig        : ${sum((v) => v.incomplete)} (${pct(sum((v) => v.incomplete), sum((v) => v.checked))})  — nichts Eigenes erfunden`)
console.log(`    eigene Abweichung    : ${sum((v) => v.divergent)} (${pct(sum((v) => v.divergent), sum((v) => v.checked))})  — die einzige gefährliche Klasse`)
console.log(`    nicht prüfbar        : ${sum((v) => v.unverifiable)} (${pct(sum((v) => v.unverifiable), sum((v) => v.checked))})  — Wortdiff zu groß, weder bestätigt noch widerlegt`)
const clean = sum((v) => v.cleanTotal)
console.log(`\n  Nur Paragraphen ohne jede Verweigerung (das, was ein Gate anzeigen würde):`)
console.log(`    davon geprüft        : ${clean} von ${sum((v) => v.checked)}`)
console.log(`    identisch            : ${sum((v) => v.cleanIdentical)} (${pct(sum((v) => v.cleanIdentical), clean)})`)
console.log(`    eigene Abweichung    : ${sum((v) => v.cleanDivergent)} (${pct(sum((v) => v.cleanDivergent), clean)})  — die Restgefahr eines Gates`)
if (missingCauses.size > 0) {
  console.log(`  „nicht im geltenden Text" (${[...missingCauses.values()].reduce((a, b) => a + b, 0)}), laut RIS:`)
  for (const [cause, n] of [...missingCauses].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)}× ${cause}`)
}
for (const v of verdicts.filter((x) => x.note)) console.log(`  ? ${v.bgbl}: ${v.note}`)
