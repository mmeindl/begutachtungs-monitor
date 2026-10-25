/** GET /entwuerfe/tirol/:id/frist.ics — `landFristIcs`. */
import { landFristIcs } from '../../../../utils/laender/fristIcs'

export default defineEventHandler((event) => landFristIcs(event, 't', /^(?:20\d{2}-\d{1,5}|v[0-9a-f]{32})$/))
