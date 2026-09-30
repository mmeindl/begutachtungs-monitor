#!/usr/bin/env vite-node
/**
 * Der SSR-Rauchtest: rendert der **gebaute** Server seine Seiten wirklich?
 *
 * Usage:  npx vite-node scripts/ci/ssrSmoke.ts -- [--port=3100] [--cache=.cache/ssr-cassette]
 *         (setzt `pnpm build` voraus — die Prüfung gilt `.output/`, nicht dem Dev-Server)
 *
 * **Die zweite Hälfte einer Fehlerklasse, die zweimal ausgeliefert wurde.**
 * „vue-tsc grün, Laufzeit 500": ein Bezeichner, den nur ein `<template>`
 * benutzt, wird vom Typecheck gesehen und zur Laufzeit nicht
 * auto-importiert; ein `shared/`-Modul, relativ importiert, läuft im
 * Dev-Server, in vitest und im Typecheck und bricht erst im Rollup-Bündel
 * (23.09.2026, `14a65d8`). Die erste Hälfte ist der Bezeichner-Scan
 * `tests/templateImports.test.ts` — statisch, also blind für alles, was erst
 * beim Rendern auffällt. Diese hier ist die andere: sie startet das
 * Artefakt, das deployt wird, und holt sich die Seiten.
 *
 * **Nicht `@nuxt/test-utils`.** Das baut sich seine eigene Instanz; was hier
 * geprüft werden muss, ist genau das Bündel, das auf den Server kopiert wird
 * — inklusive dessen Auflösung externer Module, denn daran hing der zweite
 * Fall.
 *
 * **Nächtlich, nicht je Push.** Ein Build kostet Minuten, und die Klasse ist
 * selten; `ci.yml` bleibt die schnelle Schleife (`.github/workflows/ssr-smoke.yml`).
 *
 * ## Gestubbt an `upstream/fetch.ts`
 *
 * Genauer: an dessen einzigem `fetch(` — das Modul hält den einen HTTP-Aufruf
 * des ganzen `server/`-Baums, und `scripts/lib/harnessCache.ts` greift seit
 * dem Prüfstand an derselben Stelle. Der gebaute Server wird deshalb in
 * DIESEN Prozess importiert (`.output/server/index.mjs` startet beim Import
 * seinen Listener), nachdem `globalThis.fetch` ersetzt ist. Kein
 * Unterprozess, kein zweiter Ladepfad, keine zweite Kopie der Kassette.
 *
 * Die Kassette ist dieselbe Mechanik wie beim Drift-Alarm: was einmal geholt
 * wurde, liegt auf der Platte und wird wiedergegeben; was fehlt, wird geholt
 * und dazugelegt. **Ehrlich benannt, wie dort:** damit merkt der Lauf nichts
 * davon, wenn ein Upstream ein Dokument nachträglich ändert. Was er merkt,
 * ist jede Änderung an unserem Code — und das ist, wofür er da ist.
 *
 * ## Was geprüft wird
 *
 * Statuscode und ein Merkmal je Route. Der Statuscode allein reicht nicht:
 * Nuxt rendert seine Fehlerseite mit 500, aber eine Seite, deren Abschnitt
 * still leer bleibt, antwortet 200. Das Merkmal ist deshalb der `<title>`,
 * den die Seite selbst setzt — die Fehlerseite trägt ihn nicht.
 *
 * Die zwei Detailseiten stehen NICHT mit fester Nummer hier. Eine
 * Geschäftszahl, die im Jänner aus der Liste fällt, ist eine rote Nacht ohne
 * Befund; sie werden deshalb aus der Liste des laufenden Servers geholt.
 *
 * ## Durch Fehlerinjektion geprüft (26.09.2026)
 *
 * Ein Prüfstand, der nie rot war, prüft nichts. Zwei Injektionen in
 * `app/pages/ueber.vue`, beide gebaut und gefahren:
 *
 *  1. Ein Bezeichner im `<template>`, den nichts bindet. `pnpm build` grün,
 *     `/ueber` 500 — aber `pnpm typecheck` fängt ihn, also ist das NICHT die
 *     Klasse, um die es geht.
 *  2. `{{ (undefined as unknown as string).toUpperCase() }}`. `pnpm
 *     typecheck` 0 Fehler, `pnpm lint` grün, `pnpm build` Exit 0 — und
 *     `/ueber` antwortet 500. Das ist sie: typrichtig, gebaut, und beim
 *     Rendern kaputt. Die übrigen 13 Routen blieben in beiden Läufen grün,
 *     der Befund ist also die Seite und nicht der Lauf.
 */
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { argAssigned } from '../lib/args'
import { installFetchCache } from '../lib/harnessCache'

const port = Number(argAssigned('port') ?? 3100)
const cache = argAssigned('cache') ?? '.cache/ssr-cassette'
const OUTPUT = '.output/server/index.mjs'

if (!existsSync(OUTPUT)) {
  console.error(`${OUTPUT} fehlt — dieser Test prüft das gebaute Artefakt. Zuerst: pnpm build`)
  process.exit(2)
}

/**
 * Der echte `fetch`, VOR der Kassette festgehalten.
 *
 * Die Routen unten laufen über ihn: würden sie durch die Kassette gehen,
 * läge die gerenderte Seite als „Upstream-Antwort" auf der Platte und der
 * nächste Lauf prüfte seinen eigenen Abdruck statt den Server.
 */
const drive = globalThis.fetch
installFetchCache(cache)

process.env.NITRO_PORT = String(port)
process.env.PORT = String(port)
// Der gebaute Server startet beim Import seinen Listener.
await import(pathToFileURL(OUTPUT).href)

const base = `http://127.0.0.1:${port}`

/** Wartet, bis der Listener antwortet — der Import kehrt vor dem Binden zurück. */
async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      await drive(`${base}/api/dashboard`, { signal: AbortSignal.timeout(2_000) })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`Der gebaute Server antwortet nach 30 s nicht auf ${base}`)
}

interface Route {
  path: string
  /** Was im Körper stehen muss — der `<title>`, den die Seite selbst setzt. */
  marker: string
  status?: number
}

/**
 * Die festen Routen: jede gerenderte Seite, die drei Server-Routen, und der
 * Fall, der KEIN 500 sein darf.
 */
const ROUTES: Route[] = [
  { path: '/', marker: '<title>Begutachtungs-Monitor · Laufende Begutachtungen in Österreich</title>' },
  { path: '/entwuerfe', marker: '<title>Entwürfe · Begutachtungs-Monitor</title>' },
  // Eine abgeschlossene Periode mit Stationsfilter — die andere Hälfte der
  // Liste, und die, die ohne Stationskarte anders rendert (§12.27).
  { path: '/entwuerfe?gp=XXVII&status=all&station=bgbl', marker: '<title>Entwürfe · Begutachtungs-Monitor</title>' },
  { path: '/live', marker: '<title>Begutachtungs-Monitor live · Begutachtungs-Monitor</title>' },
  { path: '/ueber', marker: '<title>Über das Projekt · Begutachtungs-Monitor</title>' },
  { path: '/impressum', marker: '<title>Impressum &amp; Offenlegung · Begutachtungs-Monitor</title>' },
  { path: '/datenschutz', marker: '<title>Datenschutz · Begutachtungs-Monitor</title>' },
  { path: '/so-funktionierts', marker: '<title>So funktioniert&#x27;s · Begutachtungs-Monitor</title>' },
  { path: '/feed.xml', marker: '<rss' },
  { path: '/kalender.ics', marker: 'BEGIN:VCALENDAR' },
  { path: '/sitemap.xml', marker: '<urlset' },
  // Eine Nummer, die es nicht gibt, ist ein 404 und kein 500 — die
  // Unterscheidung, die `http/params.ts` für Seitenrouten trifft.
  { path: '/entwuerfe/XXVIII/999999', marker: '', status: 404 },
]

/** Die zwei Detailseiten, aus der Liste des laufenden Servers geholt. */
async function detailRoutes(): Promise<Route[]> {
  const out: Route[] = []
  const drafts = (await (await drive(`${base}/api/drafts?status=all`)).json()) as {
    items?: { gp: string; inr: number }[]
  }
  const first = drafts.items?.[0]
  if (first) out.push({ path: `/entwuerfe/${first.gp}/${first.inr}`, marker: '<title>' })
  const ris = (await (await drive(`${base}/api/ris-drafts?status=all`)).json()) as {
    items?: { id: string }[]
  }
  const firstRis = ris.items?.[0]
  if (firstRis) out.push({ path: `/entwuerfe/${firstRis.id}`, marker: '<title>' })
  if (out.length < 2) {
    throw new Error('Keine Detailseite zu prüfen — die Liste des Servers ist leer, und das ist selbst ein Befund')
  }
  return out
}

await waitForServer()

const routes = [...ROUTES, ...(await detailRoutes())]
let failed = 0
for (const route of routes) {
  const want = route.status ?? 200
  const started = Date.now()
  let line: string
  try {
    const res = await drive(`${base}${route.path}`, { signal: AbortSignal.timeout(120_000) })
    const body = await res.text()
    const ok = res.status === want && (route.marker === '' || body.includes(route.marker))
    line = `${ok ? '✔' : '✘'} ${String(res.status).padStart(3)}  ${route.path}  (${Date.now() - started} ms, ${body.length} B)`
    if (!ok) {
      failed++
      if (res.status !== want) line += `\n     erwartet: HTTP ${want}`
      else line += `\n     fehlt im Körper: ${route.marker}`
    }
  } catch (err) {
    failed++
    line = `✘   –  ${route.path}\n     ${String(err).slice(0, 160)}`
  }
  console.log(line)
}

console.log(`\n${routes.length - failed} von ${routes.length} Routen gerendert`)
// Der Listener hält den Prozess am Leben; hier ist alles gesagt.
process.exit(failed === 0 ? 0 : 1)
