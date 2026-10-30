/** GET /entwuerfe/steiermark/:id/frist.ics — `landFristIcs`. */
import { landFristIcs } from '../../../../utils/laender/fristIcs'

export default defineEventHandler((event) => landFristIcs(event, 'stmk', /^(?:1[78]-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/))
