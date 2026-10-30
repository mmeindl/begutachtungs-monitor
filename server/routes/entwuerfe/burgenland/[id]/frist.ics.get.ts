/** GET /entwuerfe/burgenland/:id/frist.ics — `landFristIcs`. */
import { landFristIcs } from '../../../../utils/laender/fristIcs'

export default defineEventHandler((event) => landFristIcs(event, 'bgld', /^[0-9a-f]{32}$/))
