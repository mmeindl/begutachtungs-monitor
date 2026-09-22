/**
 * Shared contract between server routes and the app.
 * Server routes map upstream Parliament API data into these shapes;
 * pages/components consume ONLY these types — never raw upstream rows.
 *
 * GDPR invariant: names of private individuals never leave the server.
 * `StatementMeta.submitterName` is non-null only for organisations.
 */

export * from './common'
export * from './drafts'
export * from './statements'
export * from './dashboard'
export * from './ris'
export * from './lawDiff'
export * from './annex'
export * from './explanations'
export * from './search'
export * from './bgbl'
