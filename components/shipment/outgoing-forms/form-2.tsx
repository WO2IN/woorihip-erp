import type React from 'react'
import { cn } from '@/lib/utils'
import { type ApprovalRequest } from '@/lib/approval'
import {
  CellText,
  formatLot,
  JudgmentStamp,
  MarkText,
  matchedPlating,
  ProductDrawing,
  signStep,
  VISUAL_ITEMS,
  type Form2Item,
  type Form2Row,
  type PlatingLink,
  type Report,
} from './sheet-parts'

/** 치수검사·III·IV 표의 NO 칸과 아래 '제품도면' 세로 제목 칸의 폭. 모두 같은 폭으로 맞춘다. */
const NO_COL = '7mm'

/** 결재칸 '작성·승인' 머리줄 높이. 글씨에 딱 맞게 낮게 두고, 남는 높이는 우리하이피·고객 서명 칸이 반씩 나눈다 (화면 3.5+14.5, 출력 3.5+17.5). */
const HEAD_ROW = '3.5mm'

/** 치수검사 LOT 줄 수 */
export const LOT_ROWS = 10
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']

/**
 * 기본 치수 항목: 품명 규격(두께*폭)에서 나온 전폭(-0.1)·두께(±0.1),
 * 그리고 도금 정보 설정에 간격·도금폭 값이 있으면 그 값들 (간격 ① → 도금폭 ① → 간격 ② … 순서, 하나뿐이면 번호 없음).
 */
export function defaultForm2Items(report: Report, links: PlatingLink[]): Form2Item[] {
  const size = (report.product || report.spec).trim().match(/^(\d+(?:\.\d+)?)\s*[*x×X]\s*(\d+(?:\.\d+)?)/)
  const gaps = platingParts(links, report, 'gap')
  const plates = platingParts(links, report, 'plateWidth')
  const label = (name: string, index: number, count: number) => (count > 1 ? `${name} ${CIRCLED[index] ?? index + 1}` : name)
  const middle: Form2Item[] = []
  for (let index = 0; index < Math.max(gaps.length, plates.length); index += 1) {
    if (index < gaps.length) middle.push({ name: label('간격', index, gaps.length), spec: gaps[index] })
    if (index < plates.length) middle.push({ name: label('도금폭', index, plates.length), spec: plates[index] })
  }
  return [
    { name: '전폭', spec: size?.[2] ?? '', tol: '-0.1' },
    { name: '두께', spec: size?.[1] ?? '', tol: '±0.1' },
    ...middle,
  ].slice(0, 8)
}

/** 양식 2 치수 표 줄 (LOT_ROWS 줄로 맞춘다). 아직 없으면 예전 치수검사의 LOT·수량·판정을 가져온다. */
export function form2RowsOf(report: Report): Form2Row[] {
  return Array.from({ length: LOT_ROWS }, (_, index) => {
    const saved = report.form2Rows?.[index]
    if (saved) return { ...saved, our: [...(saved.our ?? [])], cust: [...(saved.cust ?? [])] }
    const old = report.dimensions[index]
    return { lotNo: old?.lotNo ?? '', qty: old?.qty ?? '', our: [], cust: [], ourJudge: old?.ourJudge ?? '', custJudge: old?.custJudge ?? '' }
  })
}

/** 글자 하나의 대략 폭 (글씨 크기 1 기준). 한글·동그라미 숫자는 1, 숫자·기호는 그보다 좁다. */
function textEm(text: string) {
  let width = 0
  for (const char of text) width += /[가-힣①-⑧±]/.test(char) ? 1 : char === ' ' ? 0.3 : 0.58
  return width
}

/**
 * 치수 항목 머리줄 글씨 크기. 측정값 칸 폭에 가장 긴 글(이름·규격·범위)이 들어가도록 정한다.
 * 칸이 넓으면 크게(최대 출력 13px), 좁으면 작게(최소 출력 7px). 화면은 출력의 8/13 비율.
 */
function itemHeadFont(items: Form2Item[], showLot: boolean, crowded: boolean) {
  // 서식 안쪽 폭 202mm 에서 NO·LOT·판정 2칸·수량 칸을 뺀 나머지를 측정값 칸(항목 × 2)이 나눈다.
  const side = 7 + (showLot ? (crowded ? 18 : 24) : 0) + (crowded ? 9 + 9 + 10 : 36)
  const columnPx = ((202 - side) / (items.length * 2)) * 3.78
  const longest = Math.max(1, ...items.flatMap((item) => [
    textEm(item.name.replace(/\s+(?=[①-⑧]$)/, '')),
    textEm(item.spec.trim()),
    item.tol?.trim() ? textEm(`(${item.tol.trim()})`) : 0,
  ]))
  const print = Math.max(7, Math.min(13, Math.floor(((columnPx * 0.85) / longest) * 2) / 2))
  return { print, screen: Math.round(print * (8 / 13) * 10) / 10 }
}

/** 성적서에 저장한 치수 항목. 아직 손대지 않았으면 기본 항목. */
export function form2ItemsOf(report: Report, links: PlatingLink[]): Form2Item[] {
  if (!report.form2Items) return defaultForm2Items(report, links)
  // 예전에 '26 (-0.1)' 처럼 한 칸에 적은 것은 기준값과 공차로 나눈다.
  return report.form2Items.map((item) => {
    const match = item.tol === undefined ? item.spec.match(/^(.*?)\s*\(([^)]*)\)\s*$/) : null
    return match ? { ...item, spec: match[1], tol: match[2] } : item
  })
}

/** 도금 정보의 간격·도금폭 값 목록 (12.1/24.8 처럼 여러 개면 나눈다). */
export function platingParts(links: PlatingLink[], report: Report, kind: 'gap' | 'plateWidth'): string[] {
  const link = matchedPlating(links, report)
  return (link?.[kind] ?? '').split(/[\/,]/).map((part) => part.trim()).filter(Boolean)
}

/**
 * '1.…', '2.…' 로 시작하는 설명문을 번호 목록으로 보여 준다. 줄이 넘어가면 번호 아래는 비우고 글이 번호 오른쪽에 맞춰 이어진다.
 * 저장된 글의 중간 줄바꿈(칸 폭에 맞춰 넣었던 것)은 띄어쓰기로 이어 붙인다.
 */
function NumberedSpec({ text }: { text: string }) {
  const items: { no: string; body: string }[] = []
  for (const line of text.split('\n').map((part) => part.trim()).filter(Boolean)) {
    const match = line.match(/^(\d+\.)\s*(.*)$/)
    if (match) items.push({ no: match[1], body: match[2] })
    else if (items.length) items[items.length - 1].body += ` ${line}`
    else items.push({ no: '', body: line })
  }
  return (
    <div className="w-full break-keep text-left" style={{ fontSize: '9px', lineHeight: 1.25 }}>
      {items.map((item, index) => (
        // 번호 사이에는 빈 줄 하나만큼 띄운다 (글씨 크기 9px × 줄 간격 1.25).
        <div key={index} className="flex gap-0.5" style={index > 0 ? { marginTop: '1.25em' } : undefined}>
          <span className="shrink-0">{item.no}</span>
          <span className="min-w-0">{item.body}</span>
        </div>
      ))}
    </div>
  )
}

/** 출하성적서 양식 2. 양식 1을 복사해 시작했다. 여기를 고쳐 새 양식을 만든다. */
export function OutgoingForm2({
  report,
  approval,
  writerName,
  links,
}: {
  report: Report
  approval: ApprovalRequest | null
  /** 작성란에 넣을 이름 (지금 로그인한 사람) */
  writerName: string
  links: PlatingLink[]
}) {
  const leftVisual = VISUAL_ITEMS.slice(0, 5)
  const rightVisual = VISUAL_ITEMS.slice(5)
  const items = form2ItemsOf(report, links)
  const rows = form2RowsOf(report)
  const showLot = report.form2ShowLot === true
  /** 항목이 6개를 넘으면 칸이 좁아져 글씨와 옆 칸(LOT·판정·수량)을 줄인다. */
  const crowded = items.length > 6
  const headFont = itemHeadFont(items, showLot, crowded)
  return (
    <>
      <div className="flex items-center border border-black">
        <img src="/logo.png" alt="WOORI" className="h-8 w-auto px-2 print:h-12" />
        <h2 className="flex-1 text-center text-[16px] font-extrabold tracking-wide text-black print:text-[22px]">Quality Assurance Report</h2>
      </div>
      <table className="w-full border-collapse text-center">
        <tbody>
          <tr>
            <th className="border border-black bg-slate-200 py-0.5">CUSTOMER(고객명)</th>
            <th className="border border-black bg-slate-200">DESCRIPTION(품명)</th>
            <th className="border border-black bg-slate-200">LOT NO(로트번호)</th>
            <th className="border border-black bg-slate-200">ISSUED DATE(발행일자)</th>
          </tr>
          <tr className="h-5">
            <td className="border border-black"><CellText value={report.customer} /></td>
            <td className="border border-black"><CellText value={report.product} /></td>
            <td className="border border-black"><CellText value={formatLot(report.lotNo, report.lotRange)} /></td>
            <td className="border border-black"><CellText value={report.issuedOn} /></td>
          </tr>
          <tr>
            <th colSpan={2} className="border border-black bg-slate-200 py-0.5">재질</th>
            <th className="border border-black bg-slate-200 py-0.5">도금스펙</th>
            <th className="border border-black bg-slate-200">LOT SIZE(수량)</th>
          </tr>
          <tr className="h-5">
            <td colSpan={2} className="border border-black"><CellText value={report.material} /></td>
            <td className="border border-black"><CellText value={report.platingSpec} /></td>
            <td className="border border-black"><CellText value={report.lotSize} /></td>
          </tr>
        </tbody>
      </table>

      <div className="mt-1 border border-black bg-slate-200 px-1 py-0.5 text-left font-bold text-black">
        Ⅰ. VISUAL INSPECTION (Sampling Plan : n=100mm/Reel, 5Reel/Shipping or n=50ea/Shipping, c=0)
      </div>
      <table className="w-full border-collapse text-center">
        <thead>
          <tr className="bg-slate-200">
            <th className="w-5 border border-black">NO</th>
            <th className="border border-black">INSPECTION ITEMS</th>
            <th className="w-8 border border-black">Ac/Re</th>
            <th className="w-12 border border-black">RESULT</th>
            <th className="w-5 border border-black">NO</th>
            <th className="border border-black">INSPECTION ITEMS</th>
            <th className="w-8 border border-black">Ac/Re</th>
            <th className="w-12 border border-black">RESULT</th>
          </tr>
        </thead>
        <tbody>
          {leftVisual.map((left, index) => {
            const right = rightVisual[index]
            return (
              <tr key={left[0]} className="h-4">
                <td className="border border-black">{left[0]}</td>
                <td className="border border-black px-1 text-left">{left[1]}</td>
                <td className="border border-black">0/1</td>
                <td className="border border-black"><MarkText value={report.visual[index]} /></td>
                <td className="border border-black">{right[0]}</td>
                <td className="border border-black px-1 text-left">{right[1]}</td>
                <td className="border border-black">0/1</td>
                <td className="border border-black"><MarkText value={report.visual[index + 5]} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-1 border border-black bg-slate-200 px-1 py-0.5 text-left font-bold text-black">
        II. DIMENSION INSPECTION (Sampling Plan : n=100mm/Reel, 5Reel/Shipping or n=50ea/Shipping, c=0)
      </div>
      {/* LOT 표: 한 가로줄 = LOT 하나. 항목마다 우리하이피·고객 측정값을 따로 적는다. */}
      <table className="w-full shrink-0 table-fixed border-collapse text-center">
        {/* table-fixed 는 첫 줄로 폭을 정하는데 '판정'이 두 칸을 묶고 있어 폭을 colgroup 으로 준다. 판정 칸은 수량 칸과 같은 폭. */}
        <colgroup>
          <col style={{ width: NO_COL }} />
          {showLot && <col style={{ width: crowded ? '18mm' : '24mm' }} />}
          {Array.from({ length: items.length * 2 }, (_, index) => <col key={index} />)}
          <col style={{ width: crowded ? '10mm' : '12mm' }} />
          <col style={{ width: crowded ? '9mm' : '12mm' }} />
          <col style={{ width: crowded ? '9mm' : '12mm' }} />
        </colgroup>
        <thead>
          <tr className="bg-slate-200">
            <th rowSpan={2} className="border border-black">NO</th>
            {showLot && <th rowSpan={2} className="border border-black">LOT No.</th>}
            <th colSpan={items.length} className="border border-black">우리하이피</th>
            <th colSpan={items.length} className="border border-black border-l-[3px] [border-left-style:double]">고객</th>
            <th rowSpan={2} className="border border-black border-l-[3px] [border-left-style:double]">수량</th>
            <th colSpan={2} className="border border-black">판정</th>
          </tr>
          <tr className="bg-slate-200">
            {[0, 1].map((group) => items.map((item, index) => (
              <th key={`${group}-${index}`} style={{ '--head-fs': `${headFont.screen}px`, '--head-fs-print': `${headFont.print}px` } as React.CSSProperties} className={cn('border border-black px-0 leading-tight text-[length:var(--head-fs)] print:text-[length:var(--head-fs-print)]', group === 1 && index === 0 && 'border-l-[3px] [border-left-style:double]')}>
                {/* 이름은 한 줄로: '도금폭 ①' 은 칸에서 번호 앞 띄어쓰기를 빼 '도금폭①' 로 보인다. */}
                <span className="block whitespace-nowrap tracking-tighter">{item.name.replace(/\s+(?=[①-⑧]$)/, '')}</span>
                {/* 규격과 범위는 줄을 나눠 칸이 좁아도 숫자가 잘리지 않게 한다. */}
                {item.spec.trim() && <span className="block whitespace-nowrap font-semibold">{item.spec.trim()}</span>}
                {item.tol?.trim() && <span className="block whitespace-nowrap font-semibold">({item.tol.trim()})</span>}
              </th>
            )))}
            <th className="border border-black px-0 font-medium">우리</th>
            <th className="border border-black px-0 font-medium">고객</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: LOT_ROWS }, (_, index) => {
            const row = rows[index]
            return (
              <tr key={index}>
                <td className="border border-black">{index + 1}</td>
                {/* LOT 번호는 칸을 넘지 않게: 항목이 많으면 글씨를 줄이고, 그래도 길면 칸 안에서 줄을 바꾼다. */}
                {showLot && <td className="overflow-hidden border border-black px-0"><CellText value={row.lotNo} className={cn('break-all', crowded && 'text-[6.5px] print:text-[10px]')} /></td>}
                {(['our', 'cust'] as const).map((group) => items.map((_, item) => (
                  <td key={`${group}-${item}`} className={cn('border border-black px-0', group === 'cust' && item === 0 && 'border-l-[3px] [border-left-style:double]')}>
                    <CellText value={row[group][item] ?? ''} className="px-0" />
                  </td>
                )))}
                {/* 측정값과 수량·판정 사이는 두 줄 테두리로 나눈다. */}
                <td className="border border-black border-l-[3px] [border-left-style:double]"><CellText value={row.qty} /></td>
                <td className="border border-black"><MarkText value={row.ourJudge} /></td>
                <td className="border border-black"><MarkText value={row.custJudge} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-1 border border-black bg-slate-200 px-1 py-0.5 text-left font-bold text-black">
        III. PLATING THICKNESS(도금두께) (Sampling Plan : y)
      </div>
      <table className="w-full table-fixed border-collapse text-center">
        <colgroup>
          <col style={{ width: NO_COL }} />
          <col className="w-[24mm]" />
          <col />
          <col className="w-[52mm]" />
          <col className="w-12" />
        </colgroup>
        <thead>
          <tr className="bg-slate-200">
            <th className="border border-black">NO</th>
            <th colSpan={2} className="border border-black">SPECIFICATION</th>
            <th className="w-[52mm] border border-black">Measurement Data</th>
            <th className="w-12 border border-black">RESULT</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={2} className="border border-black">1</td>
            <td rowSpan={2} className="w-[24mm] border border-black" style={{ borderRightStyle: 'dotted' }}>X-Ray 측정</td>
            <td className="h-6 border border-black px-1" style={{ borderBottomStyle: 'dotted' }}>{report.platingSpec.split(' / ')[0] ?? ''}</td>
            <td className="h-6 border border-black px-1" style={{ borderBottomStyle: 'dotted' }}>첨부 : 도금성적서</td>
            <td rowSpan={2} className="border border-black"><MarkText value={report.platingResult} /></td>
          </tr>
          <tr>
            <td className="h-6 border border-black px-1">{report.platingSpec.split(' / ')[1] ?? ''}</td>
            <td className="h-6 border border-black px-1">첨부 : 도금성적서</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-1 border border-black bg-slate-200 px-1 py-0.5 text-left font-bold text-black">
        IV. FUNCTIONAL TEST (Sampling Plan : n=100mm/EA, 2EA/Shipping, c=0)
      </div>
      <table className="w-full shrink-0 table-fixed border-collapse text-center">
        <thead>
          <tr className="bg-slate-200">
            <th style={{ width: NO_COL }} className="border border-black">NO</th>
            <th className="w-[34mm] border border-black">INSPECTION ITEMS</th>
            <th className="w-[36mm] border border-black">SPECIFICATION</th>
            {/* 남는 폭은 이 칸이 가져간다. 모든 칸에 폭을 주면 남는 폭이 NO 칸까지 나눠져 아래 칸들과 어긋난다. */}
            <th className="border border-black">TEST SAMPLE</th>
            <th className="w-12 border border-black">RESULT</th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-[28mm]">
            <td className="border border-black">1</td>
            <td className="border border-black font-semibold">ADHESION TEST<br />(밀착성 시험)</td>
            <td className="border border-black p-0">
              <div className="flex h-[28mm] items-center justify-center px-1">
                {/* 인쇄 CSS 가 text-[8px] 를 13px 로 키워 36mm 칸을 넘치므로, 이 설명문은 클래스 대신 글씨 크기를 직접 정해 인쇄에서도 9px 로 둔다. */}
                <NumberedSpec text={report.adhesionSpec} />
              </div>
            </td>
            <td className="border border-black" />
            <td className="border border-black"><MarkText value={report.adhesionResult} /></td>
          </tr>
        </tbody>
      </table>

      {/* 아래 칸: 도면 · 결재 · 종합판정. 열 폭을 위 FUNCTIONAL TEST 표에 맞춘다.
          제품도면 세로 제목 = NO 열, 도면 = INSPECTION ITEMS + SPECIFICATION 열. 종합판정은 우리하이피·고객 줄에 각각 둔다. */}
      <table className="mt-1 h-[36mm] w-full shrink-0 table-fixed border-collapse text-center print:h-[42mm]">
        <colgroup>
          <col style={{ width: NO_COL }} />
          <col className="w-[70mm]" />
          <col className="w-5" />
          <col />
          <col />
          <col className="w-5" />
          <col className="w-[30mm]" />
        </colgroup>
        <tbody>
          <tr style={{ height: HEAD_ROW }}>
            <th rowSpan={4} className="border border-black p-0 font-semibold"><span className="inline-block [writing-mode:vertical-rl]">제품도면</span></th>
            {/* 도면은 칸 안에 띄워 그린다. 도면 크기가 표 높이를 밀어내면 결재칸 줄 높이가 서로 달라진다. */}
            <td rowSpan={4} className="relative border border-black p-0">
              <div className="absolute inset-0 flex items-center justify-center px-0.5 py-0.5">
                <ProductDrawing spec={report.product || report.spec} platingSpec={report.platingSpec} fullWidth={report.dimensions[0]?.spec ?? ''} gap={matchedPlating(links, report)?.gap ?? ''} plateWidth={matchedPlating(links, report)?.plateWidth ?? ''} />
              </div>
            </td>
            <th rowSpan={2} className="border border-black [writing-mode:vertical-rl]">우리하이피</th>
            <th className="border border-black bg-slate-200 py-0 text-[7px] font-medium leading-none print:text-[10px]">작성</th>
            <th className="border border-black bg-slate-200 py-0 text-[7px] font-medium leading-none print:text-[10px]">승인</th>
            <th rowSpan={2} className="border border-black font-semibold [writing-mode:vertical-rl]">종합판정</th>
            <td rowSpan={2} className="border border-black py-1">
              <div className="flex items-center justify-center">
                <JudgmentStamp judgment={report.judgment} date={report.issuedOn} className="h-[15mm] w-[15mm] print:h-[18mm] print:w-[18mm]" />
              </div>
            </td>
          </tr>
          <tr className="h-[14.5mm] print:h-[17.5mm]">
            {(['작성', '승인'] as const).map((label) => {
              const step = signStep(approval, label)
              const signed = step?.status === 'approved' && !!step.userId
              const name = label === '작성' ? (writerName || report.ourWriter) : '조승현'
              return (
                <td key={label} className="border border-black">
                  {signed ? <img src={`/api/auth/signature?userId=${encodeURIComponent(step.userId)}`} alt={step.name} className="mx-auto h-8 object-contain" /> : (
                    <CellText value={name} className="text-[13px] font-semibold print:text-[15px]" />
                  )}
                </td>
              )
            })}
          </tr>
          <tr style={{ height: HEAD_ROW }}>
            <th rowSpan={2} className="border border-black [writing-mode:vertical-rl]">고객</th>
            <th className="border border-black bg-slate-200 py-0 text-[7px] font-medium leading-none print:text-[10px]">작성</th>
            <th className="border border-black bg-slate-200 py-0 text-[7px] font-medium leading-none print:text-[10px]">승인</th>
            <th rowSpan={2} className="border border-black font-semibold [writing-mode:vertical-rl]">종합판정</th>
            {/* 고객 종합판정은 고객이 직접 적는 칸이라 비워 둔다. */}
            <td rowSpan={2} className="border border-black" />
          </tr>
          <tr className="h-[14.5mm] print:h-[17.5mm]">
            <td className="border border-black"><CellText value={report.customerWriter} /></td>
            <td className="border border-black"><CellText value={report.customerApprover} /></td>
          </tr>
        </tbody>
      </table>
      <footer className="mt-1 flex shrink-0 items-center justify-between text-[8px] text-slate-600 print:mt-2 print:text-[11px]">
        <span>QEP-840-08</span>
        <span>우리하이피 주식회사</span>
        <span>A4(210*279)</span>
      </footer>
    </>
  )
}
