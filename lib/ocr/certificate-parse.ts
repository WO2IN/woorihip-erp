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

const SUPPLIER_NAMES = ['우리하이피', 'woorihip', 'woori']

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/㎛|μm|µm|um\b|\/m\b/g, 'um')
    .replace(/[^0-9a-z가-힣~.*]/g, '')
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
  return best?.value
}

function validDate(year: string, month: string, day: string) {
  const m = Number(month)
  const d = Number(day)
  return Number(year) >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31
}

export function parseCertificateText(text: string, candidates: CertificateCandidates): CertificateOcrFields {
  const rawLines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const lines = rawLines
    .map(normalize)
    .filter(line => line.length >= 2 && !SUPPLIER_NAMES.some(name => line.includes(name)))
  const flat = rawLines.join(' ')
  const fields: CertificateOcrFields = {}

  const company = bestMatch(lines, candidates.companies, 0.5)
  if (company) fields.company = company

  const companyProducts = company ? candidates.productsByCompany[company] ?? [] : []
  const product = bestMatch(lines, companyProducts, 0.55) ?? bestMatch(lines, candidates.products, 0.75)
  if (product) fields.product = product

  const material = bestMatch(lines, candidates.materials, 0.75)
  if (material) fields.material = material

  const specification = bestMatch(lines, candidates.specifications, 0.7)
  if (specification) fields.specification = specification

  const lot = flat.match(/(20\d{2})(\d{2})(\d{2})\s*-\s*0*(\d{1,2})(?:\s*~\s*0*(\d{1,2})\b)?/)
    ?? flat.match(/\b(20\d{2})(\d{2})(\d{2})(\d)\b/)
  if (lot && validDate(lot[1], lot[2], lot[3])) {
    fields.lotStart = `${lot[1]}${lot[2]}${lot[3]}`
    fields.lotStartNo = lot[4]
    if (lot[5] && Number(lot[5]) > Number(lot[4])) fields.lotEndNo = lot[5]
  }

  for (const match of flat.matchAll(/(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/g)) {
    if (validDate(match[1], match[2], match[3])) {
      fields.issueDate = `${match[1]}${match[2].padStart(2, '0')}${match[3].padStart(2, '0')}`
      break
    }
  }
  if (!fields.issueDate && fields.lotStart) fields.issueDate = fields.lotStart

  for (const match of flat.matchAll(/(?<![=\d.,])(\d{1,3}(?:,\d{3})+|\d+)\s*(EA|Kg|KG|kg|R)\b/g)) {
    const amount = Number(match[1].replace(/,/g, ''))
    if (amount > 0) {
      fields.quantity = String(amount)
      fields.quantityUnit = match[2].toUpperCase() === 'EA' ? 'EA' : match[2] === 'R' ? 'R' : 'Kg'
      break
    }
  }

  return fields
}
