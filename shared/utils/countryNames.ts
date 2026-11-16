/**
 * A country's name in German from the ISO 3166 alpha-3 code the
 * Commission's portal gives („AUT" → „Österreich"), for the list of who gave
 * feedback (`app/utils/euFeedback.ts`, 16.11.2026): its column „Land", its
 * order by Land and the citizens' rows per country.
 *
 * NO TABLE OF NAMES: the names come from the runtime's own CLDR data
 * (`Intl.DisplayNames`, region names), which takes the two-letter code; this
 * file keeps only the mapping from three letters to two, which ISO fixes and
 * which does not change with a language. A second language passes its own
 * locale. A code the mapping does not know, or a runtime without
 * `Intl.DisplayNames`, gives the code itself — never nothing.
 */

/* ISO 3166-1, alpha-3 → alpha-2, the officially assigned codes, plus XKX
 * (Kosovo, the user-assigned code the EU uses). */
const ALPHA2 = Object.fromEntries(
  [
    'ABW:AW AFG:AF AGO:AO AIA:AI ALA:AX ALB:AL AND:AD ARE:AE ARG:AR ARM:AM ASM:AS ATA:AQ ATF:TF ATG:AG AUS:AU AUT:AT AZE:AZ ',
    'BDI:BI BEL:BE BEN:BJ BES:BQ BFA:BF BGD:BD BGR:BG BHR:BH BHS:BS BIH:BA BLM:BL BLR:BY BLZ:BZ BMU:BM BOL:BO BRA:BR BRB:BB ',
    'BRN:BN BTN:BT BVT:BV BWA:BW CAF:CF CAN:CA CCK:CC CHE:CH CHL:CL CHN:CN CIV:CI CMR:CM COD:CD COG:CG COK:CK COL:CO COM:KM ',
    'CPV:CV CRI:CR CUB:CU CUW:CW CXR:CX CYM:KY CYP:CY CZE:CZ DEU:DE DJI:DJ DMA:DM DNK:DK DOM:DO DZA:DZ ECU:EC EGY:EG ERI:ER ',
    'ESH:EH ESP:ES EST:EE ETH:ET FIN:FI FJI:FJ FLK:FK FRA:FR FRO:FO FSM:FM GAB:GA GBR:GB GEO:GE GGY:GG GHA:GH GIB:GI GIN:GN ',
    'GLP:GP GMB:GM GNB:GW GNQ:GQ GRC:GR GRD:GD GRL:GL GTM:GT GUF:GF GUM:GU GUY:GY HKG:HK HMD:HM HND:HN HRV:HR HTI:HT HUN:HU ',
    'IDN:ID IMN:IM IND:IN IOT:IO IRL:IE IRN:IR IRQ:IQ ISL:IS ISR:IL ITA:IT JAM:JM JEY:JE JOR:JO JPN:JP KAZ:KZ KEN:KE KGZ:KG ',
    'KHM:KH KIR:KI KNA:KN KOR:KR KWT:KW LAO:LA LBN:LB LBR:LR LBY:LY LCA:LC LIE:LI LKA:LK LSO:LS LTU:LT LUX:LU LVA:LV MAC:MO ',
    'MAF:MF MAR:MA MCO:MC MDA:MD MDG:MG MDV:MV MEX:MX MHL:MH MKD:MK MLI:ML MLT:MT MMR:MM MNE:ME MNG:MN MNP:MP MOZ:MZ MRT:MR ',
    'MSR:MS MTQ:MQ MUS:MU MWI:MW MYS:MY MYT:YT NAM:NA NCL:NC NER:NE NFK:NF NGA:NG NIC:NI NIU:NU NLD:NL NOR:NO NPL:NP NRU:NR ',
    'NZL:NZ OMN:OM PAK:PK PAN:PA PCN:PN PER:PE PHL:PH PLW:PW PNG:PG POL:PL PRI:PR PRK:KP PRT:PT PRY:PY PSE:PS PYF:PF QAT:QA ',
    'REU:RE ROU:RO RUS:RU RWA:RW SAU:SA SDN:SD SEN:SN SGP:SG SGS:GS SHN:SH SJM:SJ SLB:SB SLE:SL SLV:SV SMR:SM SOM:SO SPM:PM ',
    'SRB:RS SSD:SS STP:ST SUR:SR SVK:SK SVN:SI SWE:SE SWZ:SZ SXM:SX SYC:SC SYR:SY TCA:TC TCD:TD TGO:TG THA:TH TJK:TJ TKL:TK ',
    'TKM:TM TLS:TL TON:TO TTO:TT TUN:TN TUR:TR TUV:TV TWN:TW TZA:TZ UGA:UG UKR:UA UMI:UM URY:UY USA:US UZB:UZ VAT:VA VCT:VC ',
    'VEN:VE VGB:VG VIR:VI VNM:VN VUT:VU WLF:WF WSM:WS XKX:XK YEM:YE ZAF:ZA ZMB:ZM ZWE:ZW',
  ].join(' ').split(/\s+/).filter(Boolean).map((pair) => pair.split(':') as [string, string]),
)

const displayNames = new Map<string, Intl.DisplayNames | null>()

function namesFor(locale: string): Intl.DisplayNames | null {
  if (!displayNames.has(locale)) {
    let names: Intl.DisplayNames | null
    try {
      names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' })
    } catch {
      names = null
    }
    displayNames.set(locale, names)
  }
  return displayNames.get(locale) ?? null
}

/** The country's name in `locale` (German by default); the code itself where it cannot be named. */
export function countryNameOf(alpha3: string, locale = 'de'): string {
  const alpha2 = ALPHA2[alpha3.toUpperCase()]
  if (!alpha2) return alpha3
  return namesFor(locale)?.of(alpha2) ?? alpha3
}
