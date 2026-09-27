/**
 * How often does an Ausschussbericht record a hearing — Expertinnen und
 * Experten, Auskunftspersonen, an „öffentliches Hearing" — and where is that
 * written down? The evidence behind „Anhörungen im Ausschuss an der Station"
 * (TODO.md § 5c).
 *
 * The Ausschuss station on a draft page names the committee and its report,
 * and nothing of what the committee heard. 2420 d.B. (XXVII, the
 * Informationsfreiheitsgesetz) is the example that raised it: a public
 * hearing with invited experts, among them civil-society organisations. Two
 * things decide whether that is worth building, and both need the corpus:
 *
 *  1. HOW OFTEN — over the Ausschussberichte our draft pages reach (the
 *     report on a Regierungsvorlage that came out of a Ministerialentwurf)
 *     and, as the comparison, over every Ausschussbericht of the period.
 *  2. WHERE — a field in the detail JSON (a stage of the report or of the
 *     Vorlage's Verlauf, a names table with a Funktion, a press-release
 *     title), or only prose in the report document itself. And, for the
 *     prose, which VOCABULARY a parser would need, with the words that look
 *     like a hearing and are not: „Anhörung" is also the Anhörungsrecht of a
 *     law's own text, „Auskunftsperson" the Untersuchungsausschuss.
 *
 *     npx vite-node scripts/corpus/anhoerungen.ts -- --gp XXVIII
 *     npx vite-node scripts/corpus/anhoerungen.ts -- --gp XXVII,XXVIII
 *     npx vite-node scripts/corpus/anhoerungen.ts -- --gp XXVII --snippets <dir>
 *
 * `--snippets <dir>` writes one file per rule with the matching paragraphs,
 * for reading by eye. Named individuals are masked there and guest lists are
 * never written (the Auskunftspersonen are private persons as often as not);
 * stdout carries counts and organisations only.
 *
 * Reads only: list 101 (`VHG=AUB`), list 81, and the detail JSON and
 * „Berichterstattung" HTML of each item, cached under `.cache/anhoerungen/`
 * so a rerun is free. The ME → RV join is the SHIPPED one
 * (`parseStages` → `findRvLinks`, what the draft page follows), cross-checked
 * against the Vorlage's own `preconst`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findRvLinks, mapDocuments, parseStages, type RawDocumentGroup } from '../../server/utils/parliament/detailJson'
import { stripHtmlToText } from '../../server/utils/parliament/htmlText'
import { argPair } from '../lib/args'
import { pool } from '../lib/async'
import { cachedJson, cachedText } from '../lib/diskCache'
import { PARLIAMENT as BASE, getJson, getText } from '../lib/http'

const SCRIPT = 'corpus/anhoerungen'
const CONCURRENCY = 4

const gps = (argPair('gp') ?? 'XXVIII,XXVII').split(',').map((g) => g.trim().toUpperCase()).filter(Boolean)
for (const gp of gps) {
  if (!/^[IVXLC]+$/.test(gp)) {
    console.error(`--gp expects roman numerals, got ${gp}`)
    process.exit(1)
  }
}
const snippetDir = argPair('snippets')

const http = {
  script: SCRIPT,
  attempts: 3,
  backoffMs: (retry: number) => 500 * retry,
  timeoutMs: 30_000,
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const listJson = (listId: number, body: unknown): Promise<Any> =>
  getJson(`${BASE}/Filter/api/filter/data/${listId}?js=eval&showAll=true`, { ...http, method: 'POST', body })

// ---------------------------------------------------------------------------
// The vocabulary. Features per PARAGRAPH (a <p> of the Word export): a
// hearing sentence and its guest list are separate paragraphs, and the
// substantive text around them is too, so the paragraph is the unit that
// keeps an Anhörungsrecht in the Erläuterungen apart from the committee's
// own account of its sitting.
// ---------------------------------------------------------------------------

const F = {
  auskunft: /Auskunftsperson/i,
  expert: /\bExpert(?:e|en|in|innen|:innen|\*innen|Innen|_innen)\b/,
  sachv: /Sachverständig/,
  hearing: /hearing/i,
  anhoerung: /Anhörung/,
  beigezogen: /beige?zogen|beizuziehen|Beiziehung/,
  // „§ 40 Abs. 1 GOG-NR", „§ 40 Abs. 1 des Geschäftsordnungsgesetzes (des
  // Nationalrates)", „§ 40 Abs. 1 der Geschäftsordnung" — the Beiziehung of
  // Sachverständigen and Auskunftspersonen. „Abs." carries a dot, so no
  // [^.] window here (the first run missed all 30 that way).
  gog40: /§\s*40\s*(?:Abs\.\s*1\s*)?(?:des\s+|der\s+)?(?:GOG|Geschäftsordnung)/,
  gog37a: /§\s*37a\b/,
  /** The committee's account of its own sitting, as opposed to the law's text. */
  procedural: /in Verhandlung genommen|Verhandlungen (?:vertagt|fortgesetzt|wieder aufgenommen)|in seiner Sitzung|in ihrer Sitzung|der Ausschuss (?:hat|beschloss)|Ausschuss hat|Sitzung (?:am|vom)|Debatte|ergriffen/i,
  /** The committee deciding something — what separates its Beiziehung from a law's. */
  decision: /einstimmig|beschlo(?:ss|ssen)|Vor Beginn der Verhandlungen|geladen|zur Verfügung|in Verhandlung genommen/,
  statements: /\bStatements?\b|Fragen [^.]{0,80}beantwortet/,
  committee: /[Aa]usschuss|Verhandlungen/,
  /**
   * The WRITTEN form of § 40 Abs. 1: the committee sends the item out for
   * Stellungnahmen and publishes what comes back — „einer
   * Ausschussbegutachtung unterziehen", „schriftliche Äußerungen einholen".
   * A second Begutachtung, at the committee, and not a hearing.
   */
  written: /Ausschussbegutachtung|schriftliche\w* (?:Äußerung|Stellungnahme)|Stellungnahmen? (?:einzuholen|eingeholt|einholen)/,
  /** A motion for any of this that FAILED (155, 398 d.B.): it records a vote, not a hearing. */
  // „fand keine Mehrheit", „fand nicht die Mehrheit", „fand nicht die
  // Zustimmung der Ausschussmehrheit" (136, 2658 d.B.), „wurde abgelehnt".
  ausschussbeg: /Ausschussbegutachtung/,
  rejected: /\babgelehnt\b|keine Mehrheit|nicht die (?:erforderliche )?Mehrheit|nicht die Zustimmung|keine Zustimmung|in der Minderheit/,
  oralGuest: /Auskunftsperson|Expert(?:e|en|in|innen|:innen|\*innen|Innen|_innen)\b|Sachverständig|[Hh]earing/,
  /** Untersuchungsausschuss, where „Auskunftsperson" is the term of the VO-UA. */
  uAusschuss: /Untersuchungsausschuss|Verfahrensordnung|VO-UA/,
} as const

type Feature = keyof typeof F

/**
 * The rules, by KIND. § 40 Abs. 1 GOG-NR carries both the oral Beiziehung
 * of Auskunftspersonen/Sachverständigen and the written Ausschussbegutachtung,
 * so the paragraph number alone says neither (the first run counted 386 d.B.,
 * an Ausschussbegutachtung, as a hearing). A paragraph that reports a failed
 * motion counts as `rejected`, never as a record.
 */
type Kind = 'oral' | 'written' | 'rejected' | 'unclear'
const RULES: [string, Kind, (f: Set<Feature>) => boolean][] = [
  ['abgelehnter Antrag (§ 40 / schriftlich / Hearing)', 'rejected', (f) => f.has('rejected') && (f.has('gog40') || f.has('written') || f.has('hearing'))],
  // „beizuziehen" alone is enough next to § 40: the Präsidenten of VfGH and
  // VwGH at the budget talks, the heads of the Datenschutzbehörde (182,
  // 2154 d.B.) are Beiziehungen that never say „Auskunftsperson".
  ['§ 40 GOG + Gäste (Auskunftsperson/Expert/Sachv./Hearing/beizuziehen)', 'oral', (f) => !f.has('rejected') && f.has('gog40') && !f.has('written') && (f.has('oralGuest') || f.has('beigezogen'))],
  ['Auskunftsperson', 'oral', (f) => !f.has('rejected') && f.has('auskunft') && !f.has('uAusschuss')],
  ['Hearing + Expert/Sachv./§ 37a', 'oral', (f) => !f.has('rejected') && f.has('hearing') && (f.has('expert') || f.has('sachv') || f.has('auskunft') || f.has('gog37a'))],
  // Without the committee's own verbs this rule is the law's text: 9 of 10
  // first-run hits were AVG/StPO Sachverständige (15, 16, 270, 512 d.B.),
  // and a bare „zur Verfügung" in AVG prose still let 270 d.B. through.
  ['Expert/Sachv. + beigezogen', 'oral', (f) => !f.has('rejected') && (f.has('expert') || f.has('sachv')) && f.has('beigezogen') && (f.has('procedural') || (f.has('decision') && f.has('committee')))],
  ['Statements der Expert…', 'oral', (f) => f.has('expert') && f.has('statements') && f.has('procedural')],
  ['Anhörung + Expert/Sachv./Auskunft', 'oral', (f) => !f.has('rejected') && f.has('anhoerung') && (f.has('expert') || f.has('sachv') || f.has('auskunft'))],
  // The word itself, or the written phrases next to § 40. Without that anchor
  // „schriftliche Stellungnahmen" is the MINISTRY's consultation, retold in
  // the Erläuterungen (1255, 1257 d.B.: a Dialogforum, a stakeholder round).
  ['Ausschussbegutachtung / schriftliche Äußerungen', 'written', (f) => !f.has('rejected') && (f.has('ausschussbeg') || (f.has('written') && f.has('gog40')))],
  ['§ 40 GOG, sonst nichts', 'unclear', (f) => !f.has('rejected') && f.has('gog40') && !f.has('oralGuest') && !f.has('written')],
]

/** Lexical forms, so a parser knows how the same thing is spelled. Counted once per report. */
const FORMS: [string, RegExp][] = [
  ['„Expert:innen"', /Expert:innen/],
  ['„Expertinnen und Experten"', /Expertinnen und Experten/],
  ['„Experten und Expertinnen"', /Experten und Expertinnen/],
  ['„ExpertInnen"', /ExpertInnen/],
  ['„Expert*innen"/„Expert_innen"', /Expert[*_]innen/],
  ['„Experten" (only masc.)', /\bExperten\b(?! und Expertinnen)/],
  ['„Expertenhearing"/„Experten-Hearing"', /Experten-?[Hh]earing|Expert(?::innen|innen)-?[Hh]earing/],
  ['„öffentliches Hearing"/„öffentlichen Hearings"', /öffentliche[ns]? Hearings?/],
  ['„Hearing" (other)', /(?<!öffentliche[ns]? )(?<!Experten-?)(?<!innen-?)[Hh]earing/],
  ['„Auskunftsperson(en)"', /Auskunftsperson/],
  ['„Sachverständige(n)"', /Sachverständige/],
  ['„beigezogen"', /beige?zogen/],
  ['„Beiziehung"/„beizuziehen"', /Beiziehung|beizuziehen/],
  ['„Beziehung … als Auskunftsperson" (Tippfehler)', /Beziehung[^.]{0,200}Auskunftsperson/],
  ['„als Auskunftsperson(en) geladen"/„zu laden"', /Auskunftspersonen? (?:gemäß [^.]{0,30})?(?:geladen|zu laden)/],
  ['„zur Verfügung" (standen … zur Verfügung)', /zur Verfügung/],
  ['„§ 100b GOG" (Petitionsausschuss-Anhörung)', /§\s*100b/],
  ['„§ 40 (Abs. 1) GOG-NR"', /§\s*40\b/],
  ['„§ 37a (Abs. 1 Z 3) GOG-NR"', /§\s*37a\b/],
  ['„Anhörung"', /Anhörung/],
]

/** Who was heard, by institution kind. Counted per report. */
const HINTS: [string, RegExp][] = [
  ['Budgetdienst (Parlament)', /Budgetdienst/],
  ['Rechnungshof', /Rechnungsh/],
  ['Bundesministerium/-kanzleramt', /Bundesministeri|Bundeskanzleramt|Sektionschef/],
  ['Universität/WIFO/IHS', /Universit|Univ\.|WIFO|IHS|Institut/],
  ['Bundesrat (Mitglieder)', /Mitglieder? des Bundesrates/],
  ['Volksbegehren (Bevollmächtigte)', /Bevollmächtigt/],
  ['Bürgerinitiative/Petition (Erstunterzeichner)', /Erstunterzeichn|Einbringer/],
  ['öffentlich', /öffentlich/],
]

interface Para {
  cls: string
  text: string
}

/** <p class=…>…</p> of the Word export → class + plain text. */
function paragraphs(html: string): Para[] {
  const out: Para[] = []
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const cls = /class\s*=\s*"?([^"\s>]+)/i.exec(m[1] ?? '')?.[1] ?? ''
    const text = stripHtmlToText(m[2] ?? '')
    if (text) out.push({ cls, text })
  }
  return out
}

function featuresOf(text: string): Set<Feature> {
  const set = new Set<Feature>()
  for (const [k, re] of Object.entries(F) as [Feature, RegExp][]) if (re.test(text)) set.add(k)
  return set
}

/**
 * Masks what reads like a person's name, for the eyeball files only: a run
 * of academic or official titles and the capitalised words behind it. Crude
 * on purpose — it over-masks, which is the safe direction.
 */
function maskNames(text: string): string {
  return text
    // A colon introduces the guest list: never written.
    .replace(/:\s[\s\S]*$/, ': […]')
    // Two capitalised words in a row that are not a German compound noun — a name, as often as not.
    .replace(/\b[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?\s+[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?\b/g, (m) =>
      /(?:ung|ausschuss|schaft|heit|keit|ministerium|gesetz|amt|rat|sitzung|bericht|antrag|verhandlungen|debatte|vorlage|begehren|initiative|dienst|hof)\b/i.test(m) || /^(?:Der|Die|Das|Den|Dem|Des|Im|In|An|Als|Nach|Vor|Bei|Zur|Zum|Mit|Gemäß|Dabei|Anschließend)\s/.test(m) ? m : '[Name]')
    .replace(
      /(?:(?:Univ\.-Prof\.|Ao\.? ?Univ\.-Prof\.|Prof\.|DDr\.|Dr\.|Mag\.|MMag\.|Dipl\.-Ing\.|DI|Ing\.|Hofrat|Hofrätin|Sektionschef(?:in)?|Abgeordnete[rn]?|Bundesminister(?:in)?|Staatssekretär(?:in)?|Frau|Herrn?|MR|Dkfm\.|KR)\s*)+(?:[A-ZÄÖÜ][\p{L}'’-]+(?:,? ?(?:LL\.M\.|MA|BA|MSc|MBA|MES|BSc|PhD|Bakk\.)?)\s*){1,4}/gu,
      '[Name] ',
    )
}

// ---------------------------------------------------------------------------
// The structured side: every place in the two detail JSONs a hearing could
// be a field rather than a sentence.
// ---------------------------------------------------------------------------

interface StructuredHit {
  where: string
  text: string
}

/** A hearing word in a short upstream string (a stage, a press-release title). */
const STRUCT_RE = /hearing|Expert(?:e|en|in|innen|:innen|\*innen|Innen)\b|Auskunftsperson|Anhörung|Sachverständig|Einholung einer (?:schriftlichen )?Stellungnahme|öffentlich/i

function scanStages(stages: Any[] | null | undefined, where: string, hits: StructuredHit[], funktionen: Map<string, number>) {
  if (!Array.isArray(stages)) return
  for (const trace of parseStages(stages)) {
    if (STRUCT_RE.test(trace.text)) hits.push({ where, text: trace.text })
  }
  for (const s of stages) {
    for (const key of ['names', 'reden']) {
      const table = s?.[key]?.data
      if (!table || !Array.isArray(table.rows)) continue
      const col = (table.header ?? []).findIndex((h: Any) => /Funktion|Wortmeldungsart/.test(h?.label ?? ''))
      for (const row of table.rows) {
        const f = col >= 0 ? stripHtmlToText(String(row?.[col] ?? '')) : ''
        const label = `${where}.${key}: ${f || '(leer)'}`
        funktionen.set(label, (funktionen.get(label) ?? 0) + 1)
        if (STRUCT_RE.test(f)) hits.push({ where: `${where}.${key}`, text: f })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// One report
// ---------------------------------------------------------------------------

interface Report {
  inr: number
  title: string
  /** /gegenstand/<gp>/I/<n> items among `reference` (HG and MG), i.e. the Vorlagen it reports on. */
  rvs: { inr: number; art: string }[]
  referenceArts: string[]
  docTitle: string | null
  textState: 'html' | 'pdf-only' | 'none'
  /** Rules that fired, over all paragraphs. */
  rules: Set<string>
  kinds: Set<Kind>
  /** „Antrag auf Einholung einer Stellungnahme von X" stages in the Vorlage's Verlauf, accepted ones. */
  einholung: string[]
  einholungRejected: number
  forms: Set<string>
  /** Candidate-shaped paragraphs that no rule accepted, by feature signature. */
  misses: string[]
  /** Guests counted structurally: Aufzählung paragraphs right after a trigger ending in a colon. */
  guests: number | null
  orgs: string[]
  structAb: StructuredHit[]
  structRv: StructuredHit[]
  structRvCorrespondence: StructuredHit[]
  eyeball: { rule: string; text: string; procedural: boolean }[]
  /** ITYP of the Hauptgegenstand (I, A, BI, PET, VOLKBG, III …). */
  hgType: string
  /** Institution words in the hearing paragraphs — who was heard, by kind, never by name. */
  hints: Set<string>
  error?: string
}

const isAufz = (p: Para) => /Aufz|Liste|Aufzaehl|Aufzähl/i.test(p.cls) || /^[-–•]\s/.test(p.text)

/** The trailing parenthetical of a guest-list item — the affiliation, never the name. */
function affiliationOf(item: string): string | null {
  const m = /\(([^()]{3,120})\)\s*[,;.]?\s*(?:und)?\s*$/.exec(item)
  if (!m) return null
  const org = m[1]!.trim()
  if (/§|d\.\s?B\.|GOG|Abs\./.test(org)) return null
  return org
}

async function readReport(gp: string, inr: number, dir: string, funktionen: Map<string, number>, rvCache: Map<number, Promise<Any>>): Promise<Report> {
  const r: Report = {
    inr,
    title: '',
    rvs: [],
    referenceArts: [],
    docTitle: null,
    textState: 'none',
    rules: new Set(),
    kinds: new Set(),
    einholung: [],
    einholungRejected: 0,
    forms: new Set(),
    misses: [],
    guests: null,
    orgs: [],
    structAb: [],
    structRv: [],
    structRvCorrespondence: [],
    eyeball: [],
    hgType: '?',
    hints: new Set(),
  }
  try {
    const detail: Any = await cachedJson(join(dir, `AB-${inr}.json`), () =>
      getJson(`${BASE}/gegenstand/${gp}/I/${inr}?json=True`, http),
    )
    const c = detail?.content ?? {}
    r.title = stripHtmlToText(String(c.title ?? ''))
    for (const ref of c.reference ?? []) {
      r.referenceArts.push(String(ref?.art ?? '?'))
      if (ref?.art === 'HG' || ref?.art === 'HGS') {
        r.hgType = /\/gegenstand\/[IVXLC]+\/([A-Z-]+)\//.exec(String(ref?.url ?? ''))?.[1] ?? r.hgType
      }
      const m = /\/gegenstand\/([IVXLC]+)\/I\/(\d+)/.exec(String(ref?.url ?? ''))
      if (m && m[1] === gp) r.rvs.push({ inr: Number(m[2]), art: String(ref?.art ?? '?') })
    }

    // Structured, report side.
    scanStages(c.stages, 'AB.stages', r.structAb, funktionen)
    for (const n of c.names ?? []) {
      const label = `AB.names: ${n?.funktext ?? '(leer)'}`
      funktionen.set(label, (funktionen.get(label) ?? 0) + 1)
      if (STRUCT_RE.test(String(n?.funktext ?? ''))) r.structAb.push({ where: 'AB.names', text: String(n.funktext) })
    }

    // Structured, Vorlage side: its Verlauf and the Parlamentskorrespondenz titles.
    // A /I/ reference is any d.B. item — a Bericht der Bundesregierung, a
    // Staatsvertrag. Only `doktyp: "RV"` is a Regierungsvorlage (2238 d.B.).
    const referenced = r.rvs
    r.rvs = []
    for (const rv of referenced) {
      if (!rvCache.has(rv.inr)) {
        rvCache.set(rv.inr, cachedJson(join(dir, `RV-${rv.inr}.json`), () =>
          getJson(`${BASE}/gegenstand/${gp}/I/${rv.inr}?json=True`, http),
        ))
      }
      const rc = (await rvCache.get(rv.inr))?.content ?? {}
      if (rc.doktyp !== 'RV') continue
      r.rvs.push(rv)
      scanStages(rc.stages, 'RV.stages', r.structRv, funktionen)
      for (const ph of rc.phase ?? []) {
        // Every phase, named in the hit: a hearing in the Bundesrat's committee is a different station.
        scanStages(ph?.stages, `RV.phase[${ph?.name ?? '?'}]`, r.structRv, funktionen)
      }
      for (const ph of rc.phase ?? []) {
        for (const t of parseStages(ph?.stages)) {
          const m = /Antrag auf Einholung einer (?:schriftlichen )?Stellungnahme von (.+?)\s*-\s*(angenommen|abgelehnt)/.exec(t.text)
          if (!m) continue
          if (m[2] === 'angenommen') r.einholung.push(m[1]!.trim())
          else r.einholungRejected++
        }
      }
      for (const pk of rc.correspondence ?? []) {
        const t = String(pk?.title ?? '')
        if (STRUCT_RE.test(t)) r.structRvCorrespondence.push({ where: 'RV.correspondence', text: t })
      }
    }

    // Prose: the report document.
    const docs = mapDocuments(c.documents as RawDocumentGroup[] | null)
    const doc = docs.find((d) => /^Berichterstattung\b/.test(d.title)) ?? docs.find((d) => /^Bericht\b/.test(d.title)) ?? docs[0]
    if (!doc) return r
    r.docTitle = doc.title
    const html = doc.formats.find((f) => f.type === 'html')
    if (!html) {
      r.textState = 'pdf-only'
      return r
    }
    r.textState = 'html'
    const body = await cachedText(join(dir, `AB-${inr}.html`), () => getText(html.url, http))
    const paras = paragraphs(body)
    let triggerIdx = -1
    for (const [i, p] of paras.entries()) {
      const f = featuresOf(p.text)
      const firedRules = RULES.filter(([, , test]) => test(f))
      const fired = firedRules.map(([name]) => name)
      if (fired.length) {
        for (const name of fired) r.rules.add(name)
        for (const [, kind] of firedRules) r.kinds.add(kind)
        for (const [form, re] of FORMS) if (re.test(p.text)) r.forms.add(form)
        if (triggerIdx < 0 && /:\s*$/.test(p.text)) triggerIdx = i
        r.eyeball.push({ rule: fired[0]!, text: p.text, procedural: f.has('procedural') })
        if (firedRules.some(([, kind]) => kind === 'oral')) for (const [hint, re] of HINTS) if (re.test(p.text)) r.hints.add(hint)
      } else if (f.has('expert') || f.has('hearing') || f.has('auskunft') || f.has('anhoerung') || f.has('gog37a')) {
        // Shaped like a candidate and rejected — the false-negative pile, and
        // the Anhörungsrecht pile.
        const sig = [...f].filter((k) => k !== 'procedural').sort().join('+')
        r.misses.push(sig)
        r.eyeball.push({ rule: `MISS ${sig}`, text: p.text, procedural: f.has('procedural') })
      }
    }
    // The guest list, counted as a structure and never read out.
    if (triggerIdx >= 0) {
      let n = 0
      for (let j = triggerIdx + 1; j < paras.length && isAufz(paras[j]!); j++) {
        n++
        const org = affiliationOf(paras[j]!.text)
        if (org) r.orgs.push(org)
      }
      r.guests = n || null
    }
  } catch (err) {
    r.error = String(err)
  }
  return r
}

// ---------------------------------------------------------------------------
// The ME-derived population
// ---------------------------------------------------------------------------

/** Regierungsvorlagen the draft pages of this GP reach, by the shipped join. */
async function meDerivedRvs(gp: string, dir: string): Promise<{ viaStages: Set<number>; meCount: number }> {
  const list: Any = await cachedJson(join(dir, 'list81.json'), () => listJson(81, { GP_CODE: [gp] }))
  const inrs: number[] = (list.rows ?? [])
    .filter((row: unknown[]) => Array.isArray(row) && row[0] === gp)
    .map((row: unknown[]) => Number(row[2]))
    .filter((n: number) => Number.isFinite(n))
  const viaStages = new Set<number>()
  await pool(inrs, CONCURRENCY, async (inr) => {
    const detail: Any = await cachedJson(join(dir, `ME-${inr}.json`), () =>
      getJson(`${BASE}/gegenstand/${gp}/ME/${inr}?json=True`, http),
    )
    for (const link of findRvLinks(parseStages(detail?.content?.stages))) {
      if (link.gp === gp) viaStages.add(link.inr)
    }
  }, (done, total) => { if (done % 100 === 0) console.error(`  ME ${done}/${total}`) })
  return { viaStages, meCount: inrs.length }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const pct = (n: number, of: number) => (of ? `${Math.round((1000 * n) / of) / 10} %` : '–')
const kvn = (k: number, n: number) => `${k} von ${n} (${pct(k, n)})`

function tally<T>(items: T[]): [T, number][] {
  const m = new Map<T, number>()
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

for (const gp of gps) {
  const dir = join('.cache', 'anhoerungen', gp)
  mkdirSync(dir, { recursive: true })

  const list: Any = await cachedJson(join(dir, 'list101-AUB.json'), () => listJson(101, { GP_CODE: [gp], VHG: ['AUB'] }))
  const abInrs: number[] = (list.rows ?? [])
    .filter((row: unknown[]) => Array.isArray(row) && row[0] === gp && row[1] === 'I' && row[5] === 'AUB')
    .map((row: unknown[]) => Number(row[2]))
    .filter((n: number) => Number.isFinite(n))
    .sort((a: number, b: number) => a - b)
  console.error(`${gp}: ${abInrs.length} Ausschussberichte (list count ${list.count})`)

  const { viaStages, meCount } = await meDerivedRvs(gp, dir)
  console.error(`${gp}: ${meCount} Ministerialentwürfe → ${viaStages.size} Regierungsvorlagen über die Stages`)

  const funktionen = new Map<string, number>()
  const rvCache = new Map<number, Promise<Any>>()
  const reports = await pool(abInrs, CONCURRENCY, (inr) => readReport(gp, inr, dir, funktionen, rvCache), (done, total) => {
    if (done % 100 === 0) console.error(`  AB ${done}/${total}`)
  })

  // preconst cross-check: a Vorlage whose own record names a Ministerialentwurf.
  const viaPreconst = new Set<number>()
  for (const [inr, p] of rvCache) {
    const pre = (await p)?.content?.preconst
    if (Array.isArray(pre) && pre.some((x: Any) => x?.ityp === 'ME')) viaPreconst.add(inr)
  }

  const ok = reports.filter((r) => !r.error)
  const errors = reports.filter((r) => r.error)
  const onRv = ok.filter((r) => r.rvs.length > 0)
  const meDerived = ok.filter((r) => r.rvs.some((rv) => viaStages.has(rv.inr)))
  const meDerivedHg = ok.filter((r) => r.rvs.some((rv) => rv.art === 'HG' && viaStages.has(rv.inr)))
  const meDerivedPre = ok.filter((r) => r.rvs.some((rv) => viaPreconst.has(rv.inr)))

  const readable = (rs: Report[]) => rs.filter((r) => r.textState === 'html')
  const prose = (rs: Report[]) => rs.filter((r) => r.rules.size > 0)
  const pk = (rs: Report[]) => rs.filter((r) => r.structRvCorrespondence.length > 0)

  console.log(`\n=== GP ${gp}`)
  console.log(`Ausschussberichte (list 101, VHG=AUB): ${reports.length}${errors.length ? `, davon ${errors.length} Fehler` : ''}`)
  console.log(`  mit einer Vorlage /I/ in reference (HG/MG):   ${onRv.length}   (reference.art: ${tally(ok.flatMap((r) => r.referenceArts)).map(([a, n]) => `${a} ${n}`).join(', ')})`)
  console.log(`  zu einer RV aus einem ME (Stages-Join):      ${meDerived.length}   davon als Hauptgegenstand ${meDerivedHg.length}`)
  console.log(`  zu einer RV mit ME im preconst (Gegenprobe):  ${meDerivedPre.length}   (Stages ${viaStages.size} RV, preconst ${viaPreconst.size} RV unter den berichteten)`)
  const onlyStage = meDerived.filter((r) => !meDerivedPre.includes(r)).map((r) => r.inr)
  const onlyPre = meDerivedPre.filter((r) => !meDerived.includes(r)).map((r) => r.inr)
  if (onlyStage.length || onlyPre.length) {
    console.log(`  Abweichung: nur Stages ${onlyStage.map((n) => `${n} d.B.`).join(', ') || '–'}; nur preconst ${onlyPre.map((n) => `${n} d.B.`).join(', ') || '–'}`)
  }
  console.log(`  Berichtstext: ${tally(ok.map((r) => r.textState)).map(([s, n]) => `${s} ${n}`).join(', ')}; Dokumenttitel ${tally(ok.map((r) => r.docTitle ?? '(keins)')).slice(0, 6).map(([t, n]) => `${JSON.stringify(t)} ${n}`).join(', ')}`)

  const block = (label: string, rs: Report[]) => {
    const rd = readable(rs)
    const p = prose(rd)
    const has = (k: Kind) => rd.filter((r) => r.kinds.has(k))
    const oral = has('oral')
    const written = has('written')
    const ein = rs.filter((r) => r.einholung.length > 0)
    const structOral = rs.filter((r) => [...r.structAb, ...r.structRv].some((h) => !/Einholung einer/.test(h.text) && /hearing|Expert|Auskunftsperson|Anhörung/i.test(h.text)))
    console.log(`\n${label}`)
    console.log(`  MÜNDLICH (Auskunftspersonen/Expert:innen/Hearing), Prosa:   ${kvn(oral.length, rd.length)}`)
    console.log(`  SCHRIFTLICH (Ausschussbegutachtung), Prosa:                 ${kvn(written.length, rd.length)}`)
    console.log(`  SCHRIFTLICH, Feld „Antrag auf Einholung einer Stellungnahme von …" im RV-Verlauf: ${kvn(ein.length, rs.length)}   davon auch in der Prosa ${ein.filter((r) => r.kinds.has('written')).length}; Prosa ohne Feld ${written.filter((r) => r.einholung.length === 0).length}`)
    if (ein.length) {
      const per = ein.map((r) => r.einholung.length).sort((a, b) => a - b)
      console.log(`    Adressaten je Bericht: Median ${per[Math.floor(per.length / 2)]}, Spanne ${per[0]}–${per.at(-1)}; abgelehnte Einholungsanträge im Verlauf ${rs.reduce((a, r) => a + r.einholungRejected, 0)}`)
    }
    console.log(`  MÜNDLICH, als Feld (AB-/RV-Stages, Namens-Tabellen):          ${kvn(structOral.length, rs.length)}`)
    console.log(`  mündlich ODER schriftlich (Prosa):                           ${kvn(p.filter((r) => r.kinds.has('oral') || r.kinds.has('written')).length, rd.length)}`)
    console.log(`  nur abgelehnter Antrag: ${rd.filter((r) => r.kinds.has('rejected') && !r.kinds.has('oral') && !r.kinds.has('written')).length}; nur „§ 40, sonst nichts": ${rd.filter((r) => r.kinds.has('unclear') && !r.kinds.has('oral') && !r.kinds.has('written')).length}`)
    console.log(`  PK-Titel der RV mit Anhörungswort: ${kvn(pk(rs).length, rs.length)}   davon mündlich in der Prosa ${pk(rs).filter((r) => r.kinds.has('oral')).length}`)
    console.log(`  Prosa-Treffer je Regel (ein Bericht kann mehrere haben):`)
    for (const [rule, kind] of RULES) console.log(`    ${String(rd.filter((r) => r.rules.has(rule)).length).padStart(4)}  [${kind}] ${rule}`)
    console.log(`  Mündlich nur über genau eine Regel gefunden:`)
    for (const [rule, n] of tally(oral.map((r) => [...r.rules].filter((x) => RULES.find(([name]) => name === x)?.[1] === 'oral')).filter((x) => x.length === 1).map((x) => x[0]!))) console.log(`    ${String(n).padStart(4)}  ${rule}`)
    console.log(`  Schreibweisen (Berichte mit mündlicher Anhörung, je Bericht einmal):`)
    for (const [form, n] of tally(oral.flatMap((r) => [...r.forms]))) console.log(`    ${String(n).padStart(4)}  ${form}`)
    const g = oral.map((r) => r.guests).filter((n): n is number => n !== null).sort((a, b) => a - b)
    console.log(`  Gästeliste als Aufzählung erkennbar: ${g.length} von ${oral.length}; Personen je Liste Median ${g.length ? g[Math.floor(g.length / 2)] : '–'}, Summe ${g.reduce((a, b) => a + b, 0)}, Spanne ${g.length ? `${g[0]}–${g.at(-1)}` : '–'}`)
    console.log(`  mündlich, nach Art des Hauptgegenstands: ${tally(oral.map((r) => r.hgType)).map(([t, n]) => `${t} ${n}`).join(', ') || '–'}   (Nenner: ${tally(rd.map((r) => r.hgType)).map(([t, n]) => `${t} ${n}`).join(', ')})`)
    console.log(`  Institutionen in den mündlichen Absätzen: ${tally(oral.flatMap((r) => [...r.hints])).map(([t, n]) => `${t} ${n}`).join(', ') || '–'}`)
    console.log(`  Beispiele mündlich: ${oral.slice(0, 12).map((r) => `${r.inr} d.B.`).join(', ') || '–'}`)
    console.log(`  Beispiele schriftlich: ${written.slice(0, 12).map((r) => `${r.inr} d.B.`).join(', ') || '–'}`)
    return oral
  }

  const pAll = block(`Alle Ausschussberichte`, ok)
  block(`Ausschussberichte zu einer RV (egal woher)`, onRv)
  block(`Ausschussberichte zu einer RV aus einem ME  ← was die Entwurfsseiten erreichen`, meDerived)
  console.log(`  ME-abgeleitete mit einem Treffer (Prosa oder Feld):`)
  for (const r of meDerived.filter((x) => x.rules.size || x.einholung.length)) {
    console.log(`    ${r.inr} d.B. — ${[...r.kinds].join('+') || 'nur Feld'} — Regeln: ${[...r.rules].join('; ') || '–'} — Einholung-Feld: ${r.einholung.length} — Institutionen (mündlich): ${[...r.hints].join(', ') || '–'}`)
  }
  console.log(`\nAdressaten der Ausschussbegutachtung (Feld im RV-Verlauf, alle Berichte, Top 25 — Institutionen):`)
  const seenRv = new Set<string>()
  const addressees: string[] = []
  for (const r of ok) for (const a of r.einholung) { const k = `${r.rvs.map((x) => x.inr).join(',')}|${a}`; if (!seenRv.has(k)) { seenRv.add(k); addressees.push(a) } }
  for (const [a, n] of tally(addressees).slice(0, 25)) console.log(`  ${String(n).padStart(4)}  ${maskNames(a)}`)

  console.log(`\nAbgelehnte Kandidaten (Absätze mit einem Anhörungswort, keine Regel), nach Merkmalen:`)
  for (const [sig, n] of tally(ok.flatMap((r) => r.misses)).slice(0, 20)) console.log(`  ${String(n).padStart(5)}  ${sig}`)

  console.log(`\nStruktur-Treffer (Stages/Tabellen) außer „Einholung einer Stellungnahme", nach Ort und Wortlaut:`)
  for (const [k, n] of tally(ok.flatMap((r) => [...r.structAb, ...r.structRv].filter((h) => !/Einholung einer/.test(h.text)).map((h) => `${h.where} | ${maskNames(h.text).slice(0, 110)}`))).slice(0, 25)) {
    console.log(`  ${String(n).padStart(4)}  ${k}`)
  }
  console.log(`\nFunktion-/Wortmeldungsart-Spalten in AB- und RV-Tabellen (ganzes Vokabular):`)
  for (const [k, n] of [...funktionen].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${String(n).padStart(5)}  ${k}`)

  console.log(`\nOrganisationen in den Gästelisten (Klammerzusatz, alle Berichte, Top 30):`)
  for (const [org, n] of tally(pAll.flatMap((r) => r.orgs)).slice(0, 30)) console.log(`  ${String(n).padStart(4)}  ${org}`)

  if (errors.length) console.log(`\nFehler: ${errors.slice(0, 10).map((r) => `${r.inr} d.B.: ${r.error}`).join('\n  ')}`)

  if (snippetDir) {
    mkdirSync(snippetDir, { recursive: true })
    const byRule = new Map<string, string[]>()
    for (const r of ok) {
      for (const e of r.eyeball) {
        const key = e.rule.startsWith('MISS') ? 'MISS' : e.rule
        const lines = byRule.get(key) ?? []
        lines.push(`${r.inr} d.B.${meDerived.includes(r) ? ' [ME]' : ''}${e.procedural ? '' : ' [nicht-prozedural]'} | ${e.rule}\n  ${maskNames(e.text).slice(0, 600)}\n`)
        byRule.set(key, lines)
      }
    }
    for (const [rule, lines] of byRule) {
      writeFileSync(join(snippetDir, `${gp}-${rule.replace(/[^\p{L}\d]+/gu, '_')}.txt`), lines.join('\n'))
    }
    console.error(`Snippets → ${snippetDir}`)
  }
}
