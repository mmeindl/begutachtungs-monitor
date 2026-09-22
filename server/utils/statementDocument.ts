/**
 * Where a Stellungnahme's own document is — asked on click, never in advance.
 *
 * List 142 carries no document links (`docs/api-exploration.md` §list 142);
 * the PDF sits in the item's detail JSON, one request per Stellungnahme. A
 * page with 700 rows must not make 700 upstream calls to decorate its links,
 * so each row links a redirect of ours (`/api/stellungnahmen/…/dokument`),
 * and the lookup happens for the one document a reader actually opens. One
 * click less than the upstream page for uploaded PDFs, which is what a
 * journalist working through fifty organisations' submissions asked for.
 * The picking itself is `pickStatementDocument` in `parliament/list142.ts`,
 * pure and tested; this file is the cached lookup around it.
 *
 * Cache discipline (`cache/base.ts`): the detail JSON names the person, with
 * postcode and town, and is therefore fetched uncached, like list 142. What
 * is kept is the resolved target — a URL, nothing personal — in the derived
 * layer, for a week: a filed Stellungnahme does not change.
 */
import type { StatementDocument } from '#shared/types'
import { DERIVED_CACHE } from './cache/base'
import {
  pickStatementDocument,
  statementPageUrl,
  type StatementItemType,
} from './parliament/list142'
import { fetchGegenstand } from './upstream/parliament'

export const getStatementDocument = defineCachedFunction(
  async (gp: string, ityp: StatementItemType, inr: number): Promise<StatementDocument> => {
    const res = await fetchGegenstand(gp, ityp, inr)
    return pickStatementDocument(res.content?.documents, statementPageUrl(gp, ityp, inr))
  },
  {
    name: 'statement-document',
    base: DERIVED_CACHE,
    getKey: (gp: string, ityp: StatementItemType, inr: number) => `${gp}-${ityp}-${inr}`,
    maxAge: 60 * 60 * 24 * 7,
    swr: false,
  },
)
