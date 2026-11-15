/**
 * How a Petition, a Bürgerinitiative and a Volksbegehren run through the
 * Nationalrat, in Parliament's own words — the measurement that gates the
 * pages under `/anliegen` (step 0 of
 * `docs/research/umsetzungsplan-petitionen-volksbegehren.md`).
 *
 * No page may name a step that was not counted here first. The readers of
 * the Vorlagen know a law's course; these items have another one, and two
 * fields that look like an answer are none: `status.number` 5 stands on
 * items still in deliberation, and `status.description` is often only the
 * last stage (14.11.2026). So the course is read from the stages, and this
 * script says which stage texts exist, how often, and how an item ends.
 *
 *     pnpm corpus:anliegen                       # XXII to the running period, all Volksbegehren, Bundesrat petitions
 *     pnpm corpus:anliegen -- --gp XXVIII        # one period's Petitionen and Bürgerinitiativen
 *     pnpm corpus:anliegen -- --kind volksbegehren
 *     pnpm corpus:anliegen -- --lines 40         # how many vocabulary lines per kind
 *
 * NO NAME OF A PRIVATE PERSON LEAVES THIS SCRIPT. `names[]` of a
 * Bürgerinitiative is its Erstunterzeichner; only the function text is
 * counted. A stage that requests a statement names whom it asks, officials
 * included: the line is cut at „von". Members of the Nationalrat in a
 * motion's text are cut too — the vocabulary needs the shape, not who.
 *
 * Reads only. Details are kept under `.cache/anliegen/`; delete the folder
 * to read the corpus again.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { stripHtmlToText } from '../../server/utils/parliament/htmlText'
import { endedWithPeriod, readAnliegenCourse, stagesByDate, unreadStagePositions, type AnliegenContent } from '../../server/utils/parliament/anliegen'
import { PARLIAMENT, getJson } from '../lib/http'
import { cachedJson } from '../lib/diskCache'
import { argPair } from '../lib/args'
import { pool, sleep } from '../lib/async'
import { ANLIEGEN_FIRST_LIST_GP, anliegenListGps } from '../../shared/utils/anliegen'
import { gpOfDay } from '../../shared/utils/gp'
import { todayIso } from '../../shared/utils/format'

const SCRIPT = 'corpus/anliegen'
/** One request at a time, and a pause between them. */
const PACE_MS = 300
const http = { script: SCRIPT, attempts: 3, backoffMs: (n: number) => 1000 * n, timeoutMs: 60_000 }
const cacheDir = join('.cache', 'anliegen')
const say = (line = '') => console.log(line)

type Kind = 'petition' | 'buergerinitiative' | 'volksbegehren' | 'petition-bundesrat'
const KINDS: readonly Kind[] = ['petition', 'buergerinitiative', 'volksbegehren', 'petition-bundesrat']
const onlyKind = argPair('kind') as Kind | null
if (onlyKind && !KINDS.includes(onlyKind)) {
  console.error(`--kind expects one of ${KINDS.join(', ')}`)
  process.exit(1)
}
const onlyGp = argPair('gp')
const lines = Number(argPair('lines') ?? 30)
/** The running period, from `GP_STARTS`: the table gains a row when a period convenes. */
const RUNNING_GP = gpOfDay(todayIso()) ?? ANLIEGEN_FIRST_LIST_GP
/** The periods the list offers (`ANLIEGEN_FIRST_LIST_GP` to the running one), oldest first. */
const PERIODS = onlyGp ? [onlyGp] : anliegenListGps(RUNNING_GP).reverse()

interface ListAnswer { count?: number; rows?: unknown[][] }
interface Stage { date?: string | null; text?: string | null }
interface Detail {
  content?: {
    ityp?: string
    doktyp?: string
    statementsstate?: unknown
    approvalstate?: unknown
    status?: { number?: number | null; description?: string | null } | null
    phase?: { name?: string | null; stages?: Stage[] | null }[] | null
    names?: { funktext?: string | null }[] | null
    reference?: { text?: string | null }[] | null
  }
}
/** `path`: the item's own address at Parliament, where the period column does
 *  not spell it — a Petition to the Bundesrat lives under
 *  `/gegenstand/BR/PET-BR/<nr>` (list 101, `HIS_URL`), whatever its period. */
interface Item { gp: string; ityp: string; inr: number; kind: Kind; path?: string }

/** A list read, checked against its own count and against what was asked for. */
async function list(id: number, name: string, body: Record<string, string[]>, holds: (row: unknown[]) => boolean): Promise<unknown[][]> {
  const answer = await cachedJson<ListAnswer>(join(cacheDir, `${name}.json`), async () => {
    await sleep(PACE_MS)
    return getJson(`${PARLIAMENT}/Filter/api/filter/data/${id}?js=eval&showAll=true`, { ...http, method: 'POST', body })
  })
  const rows = answer.rows ?? []
  if (answer.count !== rows.length) throw new Error(`Liste ${id} (${name}): ${rows.length} Zeilen, count ${answer.count}`)
  if (!rows.every(holds)) throw new Error(`Liste ${id} (${name}): der Filter hat nicht gegriffen`)
  return rows
}

await mkdir(cacheDir, { recursive: true })
const items: Item[] = []
/** `${gp}-${ityp}-${inr}` → list 143's AKTIV („J"/„N"), for the running period. */
const aktiv = new Map<string, string>()
const want = (k: Kind) => !onlyKind || onlyKind === k

for (const gp of PERIODS) {
  for (const [kind, ityp] of [['petition', 'PET'], ['buergerinitiative', 'BI']] as const) {
    if (!want(kind)) continue
    const rows = await list(101, `l101-${gp}-${ityp}`, { GP_CODE: [gp], ITYP: [ityp] }, (r) => r[0] === gp && r[1] === ityp)
    for (const r of rows) items.push({ gp, ityp, inr: Number(r[2]), kind })
    if (gp === RUNNING_GP) {
      const part = await list(143, `l143-${gp}-${ityp}`, { GP_CODE: [gp], ITYP: [ityp] }, (r) => r[0] === gp && r[1] === ityp)
      for (const r of part) aktiv.set(`${gp}-${ityp}-${Number(r[2])}`, String(r[23]))
    }
  }
}
if (want('volksbegehren') && !onlyGp) {
  const rows = await list(101, 'l101-volkbg', { VHG: ['VOLKBG'] }, (r) => r[1] === 'I' && r[11] === 'VOLKBG')
  for (const r of rows) items.push({ gp: String(r[0]), ityp: 'I', inr: Number(r[2]), kind: 'volksbegehren' })
}
if (want('petition-bundesrat') && !onlyGp) {
  const rows = await list(101, 'l101-pet-br', { ITYP: ['PET-BR'] }, (r) => r[1] === 'PET-BR')
  // Column 14, `HIS_URL`: „/gegenstand/BR/PET-BR/56". The first run built the
  // address from the period column and all 42 reads failed (step 0).
  for (const r of rows) items.push({ gp: String(r[0]), ityp: 'PET-BR', inr: Number(r[2]), kind: 'petition-bundesrat', path: String(r[14] ?? '') })
}

let fetched = 0
console.error(`${items.length} Gegenstände; lese die Details einzeln …`)
const details = await pool(items, 1, async (it) => {
  // A Petition to the Bundesrat is filed under „BR", not under its period.
  const dir = it.kind === 'petition-bundesrat' ? 'BR' : it.gp
  await mkdir(join(cacheDir, dir), { recursive: true })
  try {
    const d = await cachedJson<Detail>(join(cacheDir, dir, `${it.ityp}-${it.inr}.json`), async () => {
      fetched++
      await sleep(PACE_MS)
      const path = it.path && /^\/gegenstand\//.test(it.path) ? it.path : `/gegenstand/${it.gp}/${it.ityp}/${it.inr}`
      return getJson<Detail>(`${PARLIAMENT}${path}?json=True`, http)
    })
    // The endpoint has answered with another item of the same number
    // (volksbegehren.md §5.1): a record of the wrong type is no record.
    // A Bundesrat petition's record says `ityp` „PET-BR" like its list row.
    const c = d.content
    const right = it.kind === 'volksbegehren' ? c?.doktyp === 'VOLKBG' : c?.ityp === it.ityp
    return right ? d : null
  } catch {
    return null
  }
}, (done, total) => { if (done % 100 === 0) console.error(`  ${done}/${total}`) })
console.error(`${fetched} Details neu gelesen.`)

/** A stage's text as a shape: no numbers, no clubs, nobody's name. */
function shape(text: string): string {
  return stripHtmlToText(text)
    .replace(/\s+/g, ' ')
    .replace(/(Einholung einer Stellungnahme von) .*?( - (?:angenommen|abgelehnt))?$/i, '$1 <…>$2')
    .replace(/Antrag de[rs] Abgeordneten .*? (auf|betreffend)/i, 'Antrag der Abgeordneten <…> $1')
    .replace(/(antrag der Bundesr(?:äte|ätinnen|ätin|at)) .*? (auf|betreffend)/i, '$1 <…> $2')
    // The Bundesrat's rapporteur is named in the line („Berichterstattung
    // durch den Bundesrat …"): the shape, not who.
    .replace(/(Berichterstattung durch (?:den|die) Bundesr(?:at|ätin)) .*$/i, '$1 <…>')
    .replace(/\s*\(?[Dd]afür: .*$/, ' [Abstimmung]')
    .replace(/\d+/g, 'N')
    .trim()
    .slice(0, 130)
}

const stagesOf = (d: Detail | null): Stage[] => (d?.content?.phase ?? []).flatMap((p) => p.stages ?? [])
const textOf = (d: Detail | null): string => stagesOf(d).map((s) => stripHtmlToText(s.text ?? '')).join(' || ')

/** The running period, also when `--gp` reads an older one. */
const CURRENT_GP = RUNNING_GP

/**
 * How an item ended. Petitionen and Bürgerinitiativen through the shipped
 * reader (`readAnliegenCourse`), so this script measures what the page will
 * say; an `offen` item of a period that is over is said to have ended with
 * it (`endedWithPeriod`). Volksbegehren and the Bundesrat's petitions keep
 * the step-0 patterns below.
 */
function endOf(kind: Kind, d: Detail | null, gp = ''): string {
  if (!d) return 'nicht gelesen'
  if (kind === 'petition' || kind === 'buergerinitiative') {
    const course = readAnliegenCourse(d.content as AnliegenContent, kind)
    return endedWithPeriod(course, gp, CURRENT_GP) ? 'offen, mit der Periode beendet' : course.end
  }
  const t = textOf(d)
  if (kind === 'petition-bundesrat') {
    // The Bundesrat's own vocabulary (first read 15.11.2026): its committee
    // reports („Bericht N/BR d.B."), the plenary takes note („Kenntnisnahme
    // des Berichts angenommen"), and a Petition can be passed on
    // („Übermittlung der Petition an das Bundeskanzleramt / -ministerium").
    const parts: string[] = []
    if (/Bericht \d+\/BR d\.B\./.test(t)) parts.push('Ausschussbericht')
    if (/Kenntnisnahme des Berichts angenommen/.test(t)) parts.push('Plenum BR: Bericht zur Kenntnis')
    if (/Übermittlung der Petition an/.test(t)) parts.push('Übermittlung an Bundeskanzleramt/Ministerium')
    if (!parts.length && /Vertagung im Ausschuss/.test(t)) parts.push('zuletzt im Ausschuss vertagt')
    return parts.length ? parts.join(' + ') : 'offen/sonst'
  }
  if (kind === 'volksbegehren') {
    if (/Kenntnisnahme|zur Kenntnis (?:zu nehmen|genommen)/.test(t)) return /Entschließung[^|]*angenommen/.test(t) ? 'Kenntnisnahme + Entschließung' : 'Kenntnisnahme'
    if (/nächstfolgenden GP/.test(t + stripHtmlToText(d.content?.status?.description ?? ''))) return 'in die nächste Periode übernommen'
    if (/Bericht/.test(t)) return 'Ausschussbericht, kein Plenum gefunden'
    return stagesOf(d).length <= 1 ? 'nur Einlangen (Altdaten)' : 'offen/sonst'
  }
  const parts: string[] = []
  if (/durch Kenntnisnahme/.test(t)) parts.push('Kenntnisnahme im Ausschuss')
  // „den Präsidenten" and, in GP XXV, „die Präsidentin" — anchored on the
  // first, the first run counted 55 forwarded items as „plenary only".
  if (/Ersuchen an (?:den Präsidenten|die Präsidentin) um Zuweisung/.test(t)) parts.push('Zuweisung an Fachausschuss')
  if (/Volksanwaltschaft/.test(t.replace(/Stellungnahme von[^|]*/g, ''))) parts.push('Volksanwaltschaft')
  if (/Bundesregierung|zuständigen Bundesminister/.test(t.replace(/Stellungnahme von[^|]*/g, ''))) parts.push('Bundesregierung/Minister')
  if (/Ausschussbericht zur Kenntnis zu nehmen, angenommen|Ausschussbericht[^|]*zur Kenntnis genommen/.test(t)) parts.push('Plenum: Bericht zur Kenntnis')
  if (/nächstfolgenden GP|§ 21 Abs\. 1a/.test(stripHtmlToText(d.content?.status?.description ?? ''))) parts.push('in die nächste Periode übernommen')
  return parts.length ? parts.join(' + ') : 'offen/sonst'
}

const tally = <T>(xs: readonly T[], key: (x: T) => string): [string, number][] => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}
const flag = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 1) || '∅' : v == null ? '∅' : String(v))

const read = items.map((it, i) => ({ it, d: details[i] ?? null }))
for (const kind of KINDS) {
  const mine = read.filter((x) => x.it.kind === kind)
  if (!mine.length) continue
  say(`\n════ ${kind}: ${mine.length} Gegenstände, ${mine.filter((x) => !x.d).length} nicht gelesen`)
  say(`   je Periode: ${tally(mine, (x) => x.it.gp).map(([k, n]) => `${k} ${n}`).join(' · ')}`)

  say('\n── Wie sie enden (aus dem Verlauf), je Periode')
  for (const [gp] of tally(mine, (x) => x.it.gp).sort((a, b) => a[0].localeCompare(b[0]))) {
    const inGp = mine.filter((x) => x.it.gp === gp)
    if (kind === 'volksbegehren' && inGp.length < 3) continue
    say(`   ${gp} (${inGp.length}):`)
    for (const [k, n] of tally(inGp, (x) => endOf(kind, x.d, x.it.gp))) say(`     ${String(n).padStart(4)}  ${k}`)
  }
  if (kind === 'volksbegehren') {
    say('   alle Perioden:')
    for (const [k, n] of tally(mine, (x) => endOf(kind, x.d))) say(`     ${String(n).padStart(4)}  ${k}`)
  }

  say('\n── status.number gegen das Ende aus dem Verlauf')
  for (const [k, n] of tally(mine.filter((x) => x.d), (x) => `Status ${x.d!.content?.status?.number ?? '∅'} · ${endOf(kind, x.d, x.it.gp).startsWith('offen') ? 'offen/sonst' : 'beendet/weitergeleitet'}`)) say(`     ${String(n).padStart(4)}  ${k}`)

  say('\n── Die beiden Schalter (statementsstate · approvalstate)')
  for (const [k, n] of tally(mine.filter((x) => x.d), (x) => `${flag(x.d!.content?.statementsstate)} · ${flag(x.d!.content?.approvalstate)}`)) say(`     ${String(n).padStart(4)}  ${k}`)
  const withAktiv = mine.filter((x) => x.d && aktiv.has(`${x.it.gp}-${x.it.ityp}-${x.it.inr}`))
  if (withAktiv.length) {
    const agree = withAktiv.filter((x) => (aktiv.get(`${x.it.gp}-${x.it.ityp}-${x.it.inr}`) === 'J') === (flag(x.d!.content?.statementsstate) === '1'))
    say(`   Liste 143 AKTIV stimmt mit statementsstate überein: ${agree.length} von ${withAktiv.length}`)
    for (const x of withAktiv.filter((y) => !agree.includes(y))) say(`     ✗ ${x.it.gp}/${x.it.ityp}/${x.it.inr}: AKTIV ${aktiv.get(`${x.it.gp}-${x.it.ityp}-${x.it.inr}`)}, Schalter ${flag(x.d!.content?.statementsstate)}`)
  }

  say('\n── names[]: nur die Funktion')
  for (const [k, n] of tally(mine.flatMap((x) => x.d?.content?.names ?? []), (nm) => nm.funktext ?? '∅')) say(`     ${String(n).padStart(4)}  ${k}`)
  say('── reference[]')
  for (const [k, n] of tally(mine.flatMap((x) => x.d?.content?.reference ?? []), (r) => r.text ?? '∅')) say(`     ${String(n).padStart(4)}  ${k}`)

  say(`\n── Verlaufsvokabular (Formen, die häufigsten ${lines}; Gegenstände, auf denen die Form vorkommt)`)
  const forms = new Map<string, Set<number>>()
  mine.forEach((x, i) => {
    for (const s of stagesOf(x.d)) {
      const f = shape(s.text ?? '')
      if (!forms.has(f)) forms.set(f, new Set())
      forms.get(f)!.add(i)
    }
  })
  const ranked = [...forms].sort((a, b) => b[1].size - a[1].size)
  for (const [f, on] of ranked.slice(0, lines)) say(`     ${String(on.size).padStart(4)}  ${f}`)
  say(`   ${ranked.length} Formen insgesamt; ${ranked.filter(([, on]) => on.size === 1).length} kommen auf genau einem Gegenstand vor`)

  if (kind === 'petition-bundesrat') {
    say('\n── Ausschüsse (was vor dem Doppelpunkt einer Verlaufszeile steht)')
    const prefixes = mine.flatMap((x) => stagesOf(x.d).map((s) => /^([^:]*?[Aa]usschu(?:ss|ß)[^:]*?)\s*:/.exec(stripHtmlToText(s.text ?? ''))?.[1]?.trim()).filter((p): p is string => !!p))
    for (const [k, n] of tally(prefixes, (p) => p)) say(`     ${String(n).padStart(4)}  ${k}`)
    continue
  }

  // The shipped reader over the same records: how many stages it could not
  // place, and in which shapes. Positions only come back from the reader;
  // the text is masked here by `shape()`, as everywhere in this script.
  const readerKind = kind as Exclude<Kind, 'petition-bundesrat'>
  const readable = mine.filter((x) => x.d)
  if (kind === 'volksbegehren') {
    say('\n── Ende laut Leser (readAnliegenCourse), alle Perioden')
    for (const [k, n] of tally(readable, (x) => readAnliegenCourse(x.d!.content as AnliegenContent, readerKind).end)) say(`     ${String(n).padStart(4)}  ${k}`)
  }
  say('\n── unreadStages je Gegenstand (Leser)')
  for (const [k, n] of tally(readable, (x) => String(readAnliegenCourse(x.d!.content as AnliegenContent, readerKind).unreadStages)).sort((a, b) => Number(a[0]) - Number(b[0]))) say(`     ${String(n).padStart(4)} Gegenstände mit ${k}`)
  const unreadShapes = new Map<string, number>()
  for (const x of readable) {
    const content = x.d!.content as AnliegenContent
    const sorted = stagesByDate(content.phase)
    for (const at of unreadStagePositions(content, readerKind)) {
      const f = shape(sorted[at]?.html ?? '')
      unreadShapes.set(f, (unreadShapes.get(f) ?? 0) + 1)
    }
  }
  const unreadRanked = [...unreadShapes].sort((a, b) => b[1] - a[1])
  say(`\n── Vom Leser nicht erkannte Formen (die häufigsten 40 von ${unreadRanked.length}; Zahl der Zeilen)`)
  for (const [f, n] of unreadRanked.slice(0, 40)) say(`     ${String(n).padStart(4)}  ${f}`)
}
