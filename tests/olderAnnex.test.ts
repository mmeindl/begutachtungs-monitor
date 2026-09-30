import { describe, expect, it } from 'vitest'
import { parseTextComparison, printsHeaderPair } from '../server/utils/annex/comparisonRows'
import { holdsAsAnnex } from '../server/utils/annex/olderAnnex'
import { draftArticles as draft } from './helpers/builders'

/**
 * The Gegenüberstellung under an older name — „begtxt", „GGUe" — decided by
 * content (`server/utils/annex/olderAnnex.ts`, docs/architecture.md §12.13).
 *
 * The name no longer vouches for the document, so the table path asks for
 * the mandated header pair: the row-shape fallback that reads a header-less
 * annex the ressort NAMED as one would read a Vorblatt's two-column table
 * just as happily.
 */

const ONE_LAW = draft({ title: 'Änderung des Aktiengesetzes' })
const pair = (a: string, b: string) => `<tr><td>${a}</td><td>${b}</td></tr>`
const doc = (body: string) => `<risdok><nutzdaten><abschnitt>${body}</abschnitt></nutzdaten></risdok>`
const HEADER = '<tr><td><ueberschrift typ="tgue">Geltende Fassung</ueberschrift></td><td><ueberschrift typ="tgue">Vorgeschlagene Fassung</ueberschrift></td></tr>'
const ROW = pair('<absatz typ="abs"><gldsym>§ 5.</gldsym> (1) Alter Text.</absatz>', '<absatz typ="abs"><gldsym>§ 5.</gldsym> (1) Neuer Text.</absatz>')

describe('holdsAsAnnex', () => {
  it('takes a table that prints the header pair', () => {
    const xml = doc(`<table>${HEADER}${ROW}</table>`)
    expect(printsHeaderPair(xml)).toBe(true)
    expect(holdsAsAnnex(parseTextComparison(xml, ONE_LAW), 'table', xml)).toBe(true)
  })

  it('refuses a two-column table without it, although the reader would parse it', () => {
    // The reader's row-shape fallback reads this as a comparison — right for
    // a document named „TGÜ", not for one whose name only says „maybe".
    const xml = doc(`<table>${pair('Problemanalyse', 'Die Novelle setzt eine Richtlinie um.')}${pair('Ziele', 'Rechtssicherheit')}</table>`)
    const parsed = parseTextComparison(xml, ONE_LAW)
    expect(parsed.rows.length).toBeGreaterThan(0)
    expect(printsHeaderPair(xml)).toBe(false)
    expect(holdsAsAnnex(parsed, 'table', xml)).toBe(false)
  })

  it('refuses a document the reader got no rows out of, header or not', () => {
    // The Stabilitätsgesetz 2012 case: a real annex behind an empty spacer
    // column, which today's reader cannot read. It keeps today's answer.
    const xml = doc(`<table>${HEADER}</table>`)
    expect(holdsAsAnnex(parseTextComparison(xml, ONE_LAW), 'table', xml)).toBe(false)
  })

  it('trusts the PDF reader, which refuses a document without the header pair itself', () => {
    const rows = parseTextComparison(doc(`<table>${HEADER}${ROW}</table>`), ONE_LAW)
    expect(holdsAsAnnex(rows, 'pdf', null)).toBe(true)
    expect(holdsAsAnnex({ rows: [], refusal: null }, 'pdf', null)).toBe(false)
  })

  it('never takes a table read without its document', () => {
    const rows = parseTextComparison(doc(`<table>${HEADER}${ROW}</table>`), ONE_LAW)
    expect(holdsAsAnnex(rows, 'table', null)).toBe(false)
  })
})
