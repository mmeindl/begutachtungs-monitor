import { describe, expect, it } from 'vitest'
import { mailtoOf, reportMailtoOf } from '../app/utils/contact'

const ADDRESS = 'hinweis@example.org'

/** What a mail program reads out of the link. */
function read(href: string) {
  const [target, query = ''] = href.split('?')
  const params = new URLSearchParams(query.replace(/\+/g, '%2B'))
  return { target, subject: params.get('subject'), body: params.get('body') }
}

describe('mailtoOf', () => {
  it('is the bare address without subject and body', () => {
    expect(mailtoOf(ADDRESS)).toBe(`mailto:${ADDRESS}`)
  })

  it('encodes the subject, umlauts and ampersands included', () => {
    const href = mailtoOf(ADDRESS, 'Länder & Bund')
    expect(href).not.toContain(' ')
    expect(read(href).subject).toBe('Länder & Bund')
  })

  it('writes line breaks as CRLF', () => {
    expect(mailtoOf(ADDRESS, 'x', 'a\nb')).toContain('body=a%0D%0Ab')
    expect(mailtoOf(ADDRESS, 'x', 'a\r\nb')).toContain('body=a%0D%0Ab')
  })
})

describe('reportMailtoOf', () => {
  const page = { url: 'https://example.org/entwuerfe/XXVIII/44?von=rv', path: '/entwuerfe/XXVIII/44?von=rv' }

  it('names the page in the subject and its full address in the body', () => {
    const mail = read(reportMailtoOf(ADDRESS, page))
    expect(mail.target).toBe(`mailto:${ADDRESS}`)
    expect(mail.subject).toBe('Fehlerhinweis: /entwuerfe/XXVIII/44?von=rv')
    expect(mail.body).toBe('Seite: https://example.org/entwuerfe/XXVIII/44?von=rv\r\n\r\nWas stimmt nicht?\r\n')
  })

  it('names the claim the section calls ours', () => {
    const mail = read(reportMailtoOf(ADDRESS, page, 'Einordnung der Einbringer:innen'))
    expect(mail.body).toContain('\r\nBetrifft: Einordnung der Einbringer:innen\r\n')
  })

  it('keeps the query of the page from ending the link\'s own', () => {
    const href = reportMailtoOf(ADDRESS, { url: 'https://example.org/entwuerfe?q=a&land=wien', path: '/entwuerfe?q=a&land=wien' })
    expect(href.split('?')).toHaveLength(2)
    expect(read(href).subject).toBe('Fehlerhinweis: /entwuerfe?q=a&land=wien')
  })
})
