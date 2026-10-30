/** GET /entwuerfe/niederoesterreich/:id/frist.ics — `landFristIcs`. */
import { landFristIcs } from '../../../../utils/laender/fristIcs'

export default defineEventHandler((event) => landFristIcs(event, 'noe', /^[A-Za-z0-9][A-Za-z0-9_().-]{2,119}$/))
