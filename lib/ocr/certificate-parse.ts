export type CertificateOcrFields = {
  company?: string
  product?: string
  lotStart?: string
  lotStartNo?: string
  lotEndNo?: string
  issueDate?: string
  material?: string
  specification?: string
  quantity?: string
  quantityUnit?: 'Kg' | 'EA' | 'R'
}

export type CertificateCandidates = {
  companies: string[]
  productsByCompany: Record<string, string[]>
  products: string[]
  materials: string[]
  specifications: string[]
}

export type CertificateParse = {
  fields: CertificateOcrFields
  scores: Partial<Record<keyof CertificateOcrFields, number>>
}

const SUPPLIER_NAMES = ['우리하이피', 'woorihip', 'woori']

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/㎛|μm|µm|um\b|\/m\b/g, 'um')
    .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1~$2')
    .replace(/[^0-9a-z가-힣~.*]/g, '')
}

/** 숫자 사이 OCR 오독(O/l/I)과 대시 기호를 고친다. */
export function repairOcrText(text: string) {
  return text
    .replace(/[∼〜～﹣－—–]/g, '~')
    .replace(/[·•]/g, '.')
    .replace(/(?<=\d)[Oo](?=\d)/g, '0')
    .replace(/(?<=\d)[Il|](?=\D|$)/g, '1')
    .replace(/(?<!\p{L})[Il|](?=\d)/gu, '1')
    .replace(/(?<=\d)[Ss](?=\d)/g, '5')
}

function bigrams(value: string) {
  const grams: string[] = []
  for (let index = 0; index < value.length - 1; index += 1) grams.push(value.slice(index, index + 2))
  return grams
}

function dice(a: string, b: string) {
  if (!a || !b) return 0
  if (a === b) return 1
  const left = bigrams(a)
  const right = bigrams(b)
  if (!left.length || !right.length) return 0
  const pool = [...right]
  let hits = 0
  for (const gram of left) {
    const at = pool.indexOf(gram)
    if (at >= 0) {
      hits += 1
      pool.splice(at, 1)
    }
  }
  return (2 * hits) / (left.length + right.length)
}

function scoreCandidate(line: string, candidate: string) {
  const target = normalize(candidate)
  if (target.length < 2) return 0
  if (line === target) return 1
  if (target.length >= 4 && line.includes(target)) return 0.95
  const hangul = candidate.replace(/[^가-힣]/g, '')
  if (hangul.length >= 2 && line.includes(hangul)) return 0.9
  return dice(line, target)
}

function bestMatch(lines: string[], candidates: string[], threshold: number) {
  let best: { value: string; score: number } | null = null
  for (const candidate of candidates) {
    for (const line of lines) {
      const score = scoreCandidate(line, candidate)
      if (score >= threshold && (!best || score > best.score || (score === best.score && candidate.length > best.value.length))) {
        best = { value: candidate, score }
      }
    }
  }
  return best
}

function validDate(year: string, month: string, day: string) {
  const m = Number(month)
  const d = Number(day)
  return Number(year) >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31
}

export function parseCertificateText(text: string, candidates: CertificateCandidates): CertificateParse {
  const repaired = repairOcrText(text)
  const rawLines = repaired.split('\n').map(line => line.trim()).filter(Boolean)
  const lines = rawLines
    .map(normalize)
    .filter(line => line.length >= 2 && !SUPPLIER_NAMES.some(name => line.includes(name)))
  const flat = rawLines.join(' ')
  const fields: CertificateOcrFields = {}
  const scores: CertificateParse['scores'] = {}

  const company = bestMatch(lines, candidates.companies, 0.62)
  if (company) {
    fields.company = company.value
    scores.company = company.score
  }

  const companyProducts = company ? candidates.productsByCompany[company.value] ?? [] : []
  const product = bestMatch(lines, companyProducts, 0.58) ?? bestMatch(lines, candidates.products, 0.72)
  if (product) {
    fields.product = product.value
    scores.product = product.score
  }

  const material = bestMatch(lines, candidates.materials, 0.72)
  if (material) {
    fields.material = material.value
    scores.material = material.score
  }

  const specification = bestMatch(lines, candidates.specifications, 0.66)
  if (specification) {
    fields.specification = specification.value
    scores.specification = specification.score
  }

  const lot = flat.match(/(20\d{2})\s*(\d{2})\s*(\d{2})\s*[-~]\s*0*(\d{1,3})(?:\s*[-~]\s*0*(\d{1,3}))?/)
    ?? flat.match(/\b(20\d{2})(\d{2})(\d{2})(\d)\b/)
  if (lot && validDate(lot[1], lot[2], lot[3])) {
    const startNo = Number(lot[4])
    const endNo = lot[5] ? Number(lot[5]) : 0
    fields.lotStart = `${lot[1]}${lot[2].padStart(2, '0')}${lot[3].padStart(2, '0')}`
    fields.lotStartNo = String(startNo)
    scores.lotStart = 0.92
    if (endNo > startNo && endNo <= startNo + 40) {
      fields.lotEndNo = String(endNo)
      scores.lotEndNo = 0.9
    }
  }

  const datePatterns = [
    /(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/g,
    /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/g,
  ]
  for (const pattern of datePatterns) {
    for (const match of flat.matchAll(pattern)) {
      if (!validDate(match[1], match[2], match[3])) continue
      fields.issueDate = `${match[1]}${match[2].padStart(2, '0')}${match[3].padStart(2, '0')}`
      scores.issueDate = 0.95
      break
    }
    if (fields.issueDate) break
  }
  if (!fields.issueDate && fields.lotStart) {
    fields.issueDate = fields.lotStart
    scores.issueDate = 0.55
  }

  for (const match of flat.matchAll(/(?<![=\d.,])(\d{1,3}(?:[,.]\d{3})+|\d+)\s*(EA|개|PCS|pcs|Kg|KG|kg|Ｋｇ|R)(?![A-Za-z가-힣])/g)) {
    const amount = Number(match[1].replace(/[,.]/g, ''))
    if (amount <= 0 || amount > 1_000_000) continue
    const unit = match[2].toUpperCase()
    fields.quantity = String(amount)
    fields.quantityUnit = unit === 'EA' || unit === '개' || unit === 'PCS' ? 'EA' : unit === 'R' ? 'R' : 'Kg'
    scores.quantity = 0.9
    break
  }

  return { fields, scores }
}

const FIELD_GROUPS: (keyof CertificateOcrFields)[][] = [
  ['company'],
  ['product'],
  ['lotStart', 'lotStartNo', 'lotEndNo'],
  ['issueDate'],
  ['quantity', 'quantityUnit'],
  ['material'],
  ['specification'],
]

/** 여러 번 읽은 결과에서 점수가 모이는 값을 고른다. */
export function mergeCertificateParses(parses: CertificateParse[]): CertificateOcrFields {
  const fields: CertificateOcrFields = {}
  for (const group of FIELD_GROUPS) {
    const primary = group[0]
    const votes = new Map<string, { total: number; best: number; fields: CertificateOcrFields }>()
    for (const parse of parses) {
      const value = parse.fields[primary]
      const score = parse.scores[primary] ?? 0
      if (!value || score <= 0) continue
      const vote = votes.get(value) ?? { total: 0, best: 0, fields: parse.fields }
      vote.total += score
      if (score > vote.best) {
        vote.best = score
        vote.fields = parse.fields
      }
      votes.set(value, vote)
    }
    const winner = [...votes.values()].sort((a, b) => b.total - a.total || b.best - a.best)[0]
    if (!winner) continue
    for (const key of group) {
      const value = winner.fields[key]
      if (value) (fields as Record<string, string>)[key] = value
    }
  }
  return fields
}
