import { type ApprovalRequest } from '@/lib/approval'
import { cn } from '@/lib/utils'

/* 출하성적서 양식들이 같이 쓰는 타입·셀·도면·결재 도우미. 양식 화면(basic-form, form-2)과 편집 화면이 함께 쓴다. */

export type Floor = '1' | '2' | '3'

export type Mark = '' | 'OK' | 'NG'

export type Judgment = '' | '합격' | '불합격'

export const VISUAL_ITEMS = [
  ['1', 'DISCOLORATION(변색)'],
  ['2', 'STAIN(얼룩)'],
  ['3', 'RUST(부식)'],
  ['4', 'CONTAMINATION(오염)'],
  ['5', 'BENT(변형)'],
  ['6', 'NO PLATING(미도금)'],
  ['7', 'LUMP(도금뭉침)'],
  ['8', 'CAMBER(휨)'],
  ['9', 'PLATING BURR(도금버)'],
  ['10', 'SCRATCH(스크래치)'],
] as const

export type DimRow = {
  name: string
  spec: string
  lower: string
  upper: string
  cycle: string
  /** 측정한 제품의 LOT No. */
  lotNo: string
  qty: string
  /** 우리하이피 측정값과 판정 */
  our: string
  ourJudge: Mark
  /** 고객 측정값과 판정 */
  cust: string
  custJudge: Mark
}

/** 양식 2 치수 항목. spec 은 기준값(26), tol 은 공차(-0.1, ±0.1). */
export type Form2Item = { name: string; spec: string; tol?: string }

/** 양식 2 치수 표 한 줄 (= LOT 하나). our·cust 는 치수 항목 순서대로 측정값. */
export type Form2Row = { lotNo: string; qty: string; our: string[]; cust: string[]; ourJudge: Mark; custJudge: Mark }

export type Report = {
  id: string
  /** 고른 양식 id (lib/doc-forms.ts). 없으면 기본 양식. */
  formId?: string
  /** 같은 입고 성적서 목록에서의 순서. 없으면 만든 순서 뒤에 붙는다. */
  sortOrder?: number
  floor: Floor
  done: boolean
  createdAt: string
  updatedAt: string
  customer: string
  product: string
  lotNo: string
  lotRange: string
  issuedOn: string
  spec: string
  material: string
  platingSpec: string
  sourceLotCardId: string
  /** 입고등록에서 발급한 바코드 (수입검사 → 이력카드에서 이어진 값) */
  barcode: string
  lotSize: string
  visual: Mark[]
  dimensions: DimRow[]
  /** 양식 2 치수 항목 (이름·규격). 없으면 전폭·두께 기본 항목. */
  form2Items?: Form2Item[]
  /** 양식 2 치수 표에 LOT No. 칸을 넣을지. 필요한 업체만 켠다 (기본 꺼짐). */
  form2ShowLot?: boolean
  /** 양식 2 치수 표 측정값 (LOT 줄마다) */
  form2Rows?: Form2Row[]
  platingResult: Mark
  adhesionSpec: string
  adhesionResult: Mark
  ourWriter: string
  ourApprover: string
  customerWriter: string
  customerApprover: string
  judgment: Judgment
}

function koDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${year}년${month}월${day}일`
}

export function JudgmentStamp({ judgment, date, className = 'h-[24mm] w-[24mm]' }: { judgment: string; date: string; className?: string }) {
  const fail = judgment === '불합격'
  const color = fail ? '#e11d48' : '#1d4ed8'
  return (
    <svg viewBox="0 0 120 120" className={className} aria-label={`${fail ? '불합격' : '합격'} 도장`}>
      <circle cx="60" cy="60" r="56" fill="none" stroke={color} strokeWidth="4" />
      <circle cx="60" cy="60" r="49" fill="none" stroke={color} strokeWidth="1.1" />
      <text x="60" y="44" textAnchor="middle" fontSize={fail ? 15 : 20} fontWeight="800" fill={color} letterSpacing={fail ? 1 : 2}>{fail ? '불합격' : '합격'}</text>
      <text x="60" y="64" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{date}</text>
      <text x="60" y="80" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>우리하이피(주)</text>
      <text x="60" y="96" textAnchor="middle" fontSize="11" fontWeight="800" fill={color} letterSpacing="1">Q.C</text>
    </svg>
  )
}

export function signStep(approval: ApprovalRequest | null, slot: '작성' | '승인') {
  if (!approval) return undefined
  if (slot === '작성') return approval.steps.find((step) => !step.role) ?? approval.steps[0]
  return approval.steps.find((step) => step.role === 'approval')
}

export function splitLotRange(lotRange: string) {
  const trimmed = lotRange.trim()
  const pair = trimmed.match(/^-?(\d+)\s*[~～\-]\s*(\d+)$/)
  if (pair) return { start: pair[1], end: pair[2] }
  const single = trimmed.match(/^-?(\d+)$/)
  if (single) return { start: single[1], end: '' }
  return { start: trimmed, end: '' }
}

export function formatLot(lotNo: string, lotRange: string) {
  const date = lotNo.trim()
  const { start, end } = splitLotRange(lotRange)
  if (!start) return date
  const head = date ? `${date}-${start}` : start
  return end ? `${head} ~ ${end}` : head
}

export type PlatingLink = { company: string; product: string; material: string; specification: string; fullWidth: string; gap: string; plateWidth: string }

export function matchedPlating(links: PlatingLink[], report: Pick<Report, 'customer' | 'product' | 'spec' | 'material' | 'platingSpec'>) {
  const product = report.product || report.spec
  const rows = links.filter((row) => (!report.customer || row.company === report.customer) && (!product || row.product === product) && (!report.material || row.material === report.material))
  return rows.find((row) => !report.platingSpec || row.specification === report.platingSpec) ?? rows[0] ?? null
}

function positiveMeasure(value: string) {
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  const number = match ? Number(match[0]) : 0
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function CellText({ value, className }: { value: string; className?: string }) {
  return <span className={cn('block px-0.5 text-center leading-tight', className)}>{value}</span>
}

export function MarkText({ value }: { value: Mark }) {
  return <span className="text-[8px] font-bold print:text-[10px]">{value}</span>
}

export function ProductDrawing({ spec, platingSpec, fullWidth, gap, plateWidth, className }: { spec: string; platingSpec: string; fullWidth: string; gap: string; plateWidth: string; className?: string }) {
  const match = spec.trim().match(/^(\d+(?:\.\d+)?)\s*[*x×X]\s*(\d+(?:\.\d+)?)/)
  const thickness = match?.[1] ?? ''
  const width = fullWidth || match?.[2] || ''
  if (/Au|금/.test(platingSpec) || gap || plateWidth) {
    return <GoldDrawing spec={spec} fullWidth={width} gap={gap} plateWidth={plateWidth} className={className} />
  }
  return <StripDrawing spec={spec} thickness={thickness} width={width} className={className} />
}

function StripDrawing({ spec, thickness, width, className }: { spec: string; thickness: string; width: string; className?: string }) {
  const x = 52
  const y = 26
  const face = 58
  const height = 52
  const dx = 6
  const dy = -4
  const right = x + face
  const bottom = y + height
  const edgeX = right + dx
  const edgeTop = y + dy
  const edgeBottom = bottom + dy
  const thickY = y + dy / 2
  const dimX = edgeX + 5
  const topFace = `${x},${y} ${x + dx},${edgeTop} ${edgeX},${edgeTop} ${right},${y}`
  const side = `${right},${y} ${edgeX},${edgeTop} ${edgeX},${edgeBottom} ${right},${bottom}`
  return (
    <svg viewBox="0 0 168 96" preserveAspectRatio="xMidYMid meet" className={cn('mx-auto block h-[98%] w-full min-h-[30mm]', className)} fontFamily="ui-sans-serif, system-ui, sans-serif">
      {spec && <text x={x + (face + dx) / 2} y="12" textAnchor="middle" fontSize="8" fill="#000000">{spec}</text>}
      <polygon points={topFace} fill="#e2e8f0" stroke="#000000" strokeWidth="1.1" strokeLinejoin="miter" />
      <polygon points={side} fill="#cbd5e1" stroke="#000000" strokeWidth="1.1" strokeLinejoin="miter" />
      <rect x={x} y={y} width={face} height={height} fill="#ffffff" stroke="#000000" strokeWidth="1.1" />
      {thickness && (
        <text x={x - 3} y={thickY} textAnchor="end" dominantBaseline="middle" fontSize="8" fill="#000000">{thickness}</text>
      )}
      {width && (
        <g stroke="#c2410c" fill="#c2410c">
          <line x1={edgeX} y1={edgeTop} x2={dimX} y2={edgeTop} strokeWidth="0.45" />
          <line x1={edgeX} y1={edgeBottom} x2={dimX} y2={edgeBottom} strokeWidth="0.45" />
          <line x1={dimX} y1={edgeTop} x2={dimX} y2={edgeBottom} strokeWidth="0.55" />
          <text x={dimX + 2.5} y={(edgeTop + edgeBottom) / 2} fontSize="8" stroke="none" dominantBaseline="middle">{width}</text>
        </g>
      )}
    </svg>
  )
}

/**
 * 금도금 제품 도면. 아래쪽 끝부터 간격① → 도금폭① → 간격② → 도금폭② … 순서로 쌓는다.
 * 도금 정보의 간격·도금폭에 12.132/24.793/25.125, 3/3 처럼 여러 값이 있으면 띠도 여러 개 그린다.
 * 치수선은 도금폭·간격·전폭을 세 줄로 나눠 겹치지 않게 놓는다.
 */
/** 도면 치수는 소수점 둘째 자리까지만 쓴다. 예) 12.132 → 12.13, 3 → 3.00. 숫자가 아니면 그대로. */
function twoDecimals(value: string) {
  const text = value.trim()
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text).toFixed(2) : text
}

function GoldDrawing({ spec, fullWidth, gap, plateWidth, className }: { spec: string; fullWidth: string; gap: string; plateWidth: string; className?: string }) {
  const split = (value: string) => value.split('/').map((part) => part.trim()).filter(Boolean)
  const gaps = split(gap)
  const plates = split(plateWidth)
  const segments: { kind: 'gap' | 'plate'; label: string; size: number }[] = []
  for (let index = 0; index < Math.max(gaps.length, plates.length, 1); index += 1) {
    if (gaps[index]) segments.push({ kind: 'gap', label: gaps[index], size: positiveMeasure(gaps[index]) })
    if (plates[index]) segments.push({ kind: 'plate', label: plates[index], size: positiveMeasure(plates[index]) })
  }
  const total = positiveMeasure(fullWidth)
  const sum = segments.reduce((acc, item) => acc + item.size, 0)
  const top = 10
  const height = 72
  const left = 20
  const boxWidth = 64
  const bottom = top + height
  const boxRight = left + boxWidth
  // 값이 있으면 실제 비율대로, 없으면 띠 하나를 적당한 크기로 그린다.
  const basis = Math.max(total, sum)
  const MIN_PLATE = 3.5
  let y = bottom
  const placed = (segments.length && basis > 0 ? segments : [{ kind: 'gap' as const, label: '', size: 16 }, { kind: 'plate' as const, label: '', size: 12 }])
    .map((item) => {
      const scaled = basis > 0 && segments.length ? (item.size / basis) * height : item.size
      const h = item.kind === 'plate' ? Math.max(MIN_PLATE, scaled) : Math.max(0, scaled)
      const y2 = y
      y -= h
      return { ...item, y1: Math.max(top, y), y2 }
    })
  // 품명은 가장 넓은 빈 구간(간격 또는 띠 위쪽 남는 부분) 가운데에 쓴다.
  const spaces = [...placed.filter((item) => item.kind === 'gap').map((item) => ({ y1: item.y1, y2: item.y2 })), { y1: top, y2: Math.max(top, y) }]
  const widest = spaces.reduce((best, item) => (item.y2 - item.y1 > best.y2 - best.y1 ? item : best), spaces[0])
  const labelY = (widest.y1 + widest.y2) / 2 + 2.5
  return (
    <svg viewBox="0 0 168 94" preserveAspectRatio="xMidYMid meet" className={cn('mx-auto block h-[98%] w-full min-h-[30mm]', className)} fontFamily="ui-sans-serif, system-ui, sans-serif">
      <defs>
        <linearGradient id="gold-band-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#facc15" />
        </linearGradient>
      </defs>
      <rect x={left} y={top} width={boxWidth} height={height} fill="#f8fafc" stroke="#000000" strokeWidth="1" />
      {placed.filter((item) => item.kind === 'plate').map((item, index) => (
        <rect key={index} x={left + 1} y={item.y1} width={boxWidth - 2} height={item.y2 - item.y1} fill="url(#gold-band-fill)" stroke="#d97706" strokeWidth="0.5" />
      ))}
      {spec && <text x={left + boxWidth / 2} y={labelY} textAnchor="middle" fontSize="8" fill="#000000">{spec}</text>}
      {placed.map((item, index) => (
        <DimensionSpan key={index} boxRight={boxRight} x={boxRight + (item.kind === 'gap' ? 8 : 31)} y1={item.y1} y2={item.y2} label={twoDecimals(item.label)} />
      ))}
      {fullWidth && <DimensionSpan boxRight={boxRight} x={boxRight + 53} y1={top} y2={bottom} label={twoDecimals(fullWidth)} bold />}
    </svg>
  )
}

/**
 * 치수선 하나. 제품 끝에서 치수선까지는 회색 점선(보조선), 치수선은 실선에 양 끝 사선 표시,
 * 숫자는 치수선 오른쪽 가운데에 흰 테두리를 둘러 선과 겹쳐도 읽히게 쓴다.
 */
function DimensionSpan({ boxRight, x, y1, y2, label, bold = false }: { boxRight: number; x: number; y1: number; y2: number; label: string; bold?: boolean }) {
  if (!label || y2 - y1 < 0.5) return null
  const mid = (y1 + y2) / 2
  const tick = (y: number) => <line x1={x - 1.6} y1={y + 1.6} x2={x + 1.6} y2={y - 1.6} stroke="#9a3412" strokeWidth="0.6" />
  return (
    <g>
      <line x1={boxRight + 1} y1={y1} x2={x + 2} y2={y1} stroke="#94a3b8" strokeWidth="0.4" strokeDasharray="1.4 1.1" />
      <line x1={boxRight + 1} y1={y2} x2={x + 2} y2={y2} stroke="#94a3b8" strokeWidth="0.4" strokeDasharray="1.4 1.1" />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#9a3412" strokeWidth="0.5" />
      {tick(y1)}
      {tick(y2)}
      <text
        x={x + 2.8}
        y={mid}
        fontSize={bold ? 7.4 : 6.6}
        fontWeight={bold ? 700 : 600}
        fill="#9a3412"
        stroke="#ffffff"
        strokeWidth="2"
        paintOrder="stroke"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  )
}
