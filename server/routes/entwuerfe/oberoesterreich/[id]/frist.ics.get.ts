/** GET /entwuerfe/oberoesterreich/:id/frist.ics — `landFristIcs`. */
import { landFristIcs } from '../../../../utils/laender/fristIcs'

export default defineEventHandler((event) => landFristIcs(event, 'ooe', /^(?:20\d{2}-\d{1,6}|v\d{1,9})$/))
