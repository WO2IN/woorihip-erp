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
  type PlatingLink,
  type Report,
} from './sheet-parts'

/** 출하성적서 양식 1 (기본 양식). A4 한 장 서식 안쪽 내용. */
export function OutgoingFormBasic({
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

      <table className="mt-1 w-full border-collapse text-center">
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

      <div className="mt-1 border border-black bg-slate-200 px-1 py-0.5 text-center font-bold text-black">
        II. DIMENSION INSPECTION (Sampling Plan : n=100mm/Reel, 5Reel/Shipping or n=50ea/Shipping, c=0)
      </div>
      <table className="w-full shrink-0 table-fixed border-collapse text-center">
        <thead>
          <tr className="bg-slate-200">
            <th rowSpan={2} className="w-5 border border-black">NO</th>
            <th rowSpan={2} className="w-[16mm] border border-black">항목/구분</th>
            <th colSpan={3} className="border border-black">SPEC</th>
            <th rowSpan={2} className="w-[16mm] border border-black">검사주기</th>
            <th rowSpan={2} className="w-[24mm] border border-black">LOT No.</th>
            <th rowSpan={2} className="w-[12mm] border border-black">수량</th>
            <th colSpan={2} className="border border-black">우리하이피</th>
            <th colSpan={2} className="border border-black">고객</th>
          </tr>
          <tr className="bg-slate-200">
            <th className="border border-black">규격</th>
            <th className="w-[10mm] border border-black">하한(-)</th>
            <th className="w-[10mm] border border-black">상한(+)</th>
            <th className="w-[19mm] border border-black">DATA</th>
            <th className="w-[5mm] border border-black px-0 tracking-tighter">판정</th>
            <th className="w-[19mm] border border-black">DATA</th>
            <th className="w-[5mm] border border-black px-0 tracking-tighter">판정</th>
          </tr>
        </thead>
        <tbody>
          {report.dimensions.map((row, index) => (
            <tr key={index}>
              <td className="border border-black">{index + 1}</td>
              <td className="border border-black"><CellText value={row.name} /></td>
              <td className="border border-black"><CellText value={row.spec} /></td>
              <td className="border border-black"><CellText value={row.lower} /></td>
              <td className="border border-black"><CellText value={row.upper} /></td>
              <td className="border border-black"><CellText value={row.cycle} /></td>
              <td className="border border-black"><CellText value={row.lotNo} /></td>
              <td className="border border-black"><CellText value={row.qty} /></td>
              <td className="border border-black"><CellText value={row.our} /></td>
              <td className="border border-black"><MarkText value={row.ourJudge} /></td>
              <td className="border border-black"><CellText value={row.cust} /></td>
              <td className="border border-black"><MarkText value={row.custJudge} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-1 border border-black bg-slate-200 px-1 py-0.5 text-center font-bold text-black">
        III. PLATING THICKNESS(도금두께) (Sampling Plan : y)
      </div>
      <table className="w-full border-collapse text-center">
        <thead>
          <tr className="bg-slate-200">
            <th className="w-6 border border-black">NO</th>
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

      <div className="mt-1 border border-black bg-slate-200 px-1 py-0.5 text-center font-bold text-black">
        IV. FUNCTIONAL TEST (Sampling Plan : n=100mm/EA, 2EA/Shipping, c=0)
      </div>
      <table className="w-full shrink-0 table-fixed border-collapse text-center">
        <thead>
          <tr className="bg-slate-200">
            <th className="w-6 border border-black">NO</th>
            <th className="w-[34mm] border border-black">INSPECTION ITEMS</th>
            <th className="w-[36mm] border border-black">SPECIFICATION</th>
            <th className="w-[60mm] border border-black">TEST SAMPLE</th>
            <th className="w-12 border border-black">RESULT</th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-20 print:h-[28mm]">
            <td className="border border-black">1</td>
            <td className="border border-black font-semibold">ADHESION TEST<br />(밀착성 시험)</td>
            <td className="border border-black p-0">
              <div className="flex h-20 items-center justify-center px-1 print:h-[28mm]">
                <p className="w-full whitespace-pre-line text-center text-[8px] leading-tight print:text-[9px] print:leading-tight">{report.adhesionSpec}</p>
              </div>
            </td>
            <td className="border border-black" />
            <td className="border border-black"><MarkText value={report.adhesionResult} /></td>
          </tr>
        </tbody>
      </table>

      <div className="mt-1 grid shrink-0 grid-cols-[1.3fr_1fr_0.7fr] border border-black">
        <div className="flex h-[36mm] flex-col border-r border-black print:h-[42mm]">
          <div className="shrink-0 border-b border-black py-0.5 text-center text-[8px] font-semibold leading-none text-black print:text-[9px]">제품도면</div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-0.5 py-0.5">
            <ProductDrawing spec={report.product || report.spec} platingSpec={report.platingSpec} fullWidth={report.dimensions[0]?.spec ?? ''} gap={matchedPlating(links, report)?.gap ?? ''} plateWidth={matchedPlating(links, report)?.plateWidth ?? ''} />
          </div>
        </div>
        <table className="h-full border-collapse text-center">
          <tbody>
            <tr>
              <th rowSpan={2} className="w-5 border border-black [writing-mode:vertical-rl]">우리하이피</th>
              <th className="border border-black">작성</th>
              <th className="border border-black">승인</th>
            </tr>
            <tr className="h-10">
              {(['작성', '승인'] as const).map((label) => {
                const step = signStep(approval, label)
                const signed = step?.status === 'approved' && !!step.userId
                const name = label === '작성' ? (writerName || report.ourWriter) : '조승현'
                return (
                  <td key={label} className="border border-black">
                    {signed ? <img src={`/api/auth/signature?userId=${encodeURIComponent(step.userId)}`} alt={step.name} className="mx-auto h-8 object-contain" /> : (
                      <CellText value={name} className="text-[13px] font-extrabold print:text-[15px]" />
                    )}
                  </td>
                )
              })}
            </tr>
            <tr>
              <th rowSpan={2} className="border border-black [writing-mode:vertical-rl]">고객</th>
              <th className="border border-black">작성</th>
              <th className="border border-black">승인</th>
            </tr>
            <tr className="h-8">
              <td className="border border-black"><CellText value={report.customerWriter} /></td>
              <td className="border border-black"><CellText value={report.customerApprover} /></td>
            </tr>
          </tbody>
        </table>
        <div className="flex items-stretch border-l border-black">
          <span className="flex w-5 items-center justify-center border-r border-black font-semibold [writing-mode:vertical-rl]">종합판정</span>
          <div className="flex flex-1 items-center justify-center py-1">
            <JudgmentStamp judgment={report.judgment} date={report.issuedOn} />
          </div>
        </div>
      </div>
      <footer className="mt-1 flex shrink-0 items-center justify-between text-[8px] text-slate-600 print:mt-2 print:text-[11px]">
        <span>QEP-840-08</span>
        <span>우리하이피 주식회사</span>
        <span>A4(210*279)</span>
      </footer>
    </>
  )
}
