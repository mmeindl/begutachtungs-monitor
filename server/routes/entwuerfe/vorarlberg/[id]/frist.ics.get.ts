/** GET /entwuerfe/vorarlberg/:id/frist.ics — `landFristIcs`. */
import { landFristIcs } from '../../../../utils/laender/fristIcs'

export default defineEventHandler((event) => landFristIcs(event, 'vbg', /^\d{4,10}$/))
