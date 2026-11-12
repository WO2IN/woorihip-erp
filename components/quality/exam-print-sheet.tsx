import { PAPERS, type ExamPaper } from '@/lib/internal-auditor-exam'
import { INSPECTOR_PAPERS, INSPECTOR_PASS_SCORE } from '@/lib/inspector-exam'
import { cn } from '@/lib/utils'

const MARKS = ['①', '②', '③', '④']

export type ExamPrintInput = {
  kind: 'auditor' | 'inspector'
  examinee: string
  examDate: string
  supervisor: string
  paperId: string
  paperStep: string
  paperTitle: string
  answers: number[]
  correct: number
  total: number
  score: number
  passed: boolean
  approvals: { step: string; signedById: string; signedByName: string }[]
}

function paperOf(kind: ExamPrintInput['kind'], paperId: string): ExamPaper | undefined {
  return (kind === 'auditor' ? PAPERS : INSPECTOR_PAPERS).find((item) => item.id === paperId)
}

function dotDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replaceAll('-', '.') : iso || '—'
}

export function ExamPrintSheet({ exam }: { exam: ExamPrintInput }) {
  const paper = paperOf(exam.kind, exam.paperId)
  const passScore = exam.kind === 'auditor' ? 80 : INSPECTOR_PASS_SCORE
  const title = exam.kind === 'auditor' ? '내부심사원 시험' : '검사원 시험'
  const questions = paper?.questions ?? []
  const answers = exam.answers ?? []
  const approvals = ['감독', '검토', '승인'].map((step) => (exam.approvals ?? []).find((item) => item.step === step))

  return (
    <article className="exam-print-sheet bg-white text-black">
      <header className="exam-print-head">
        <div>
          <p className="text-[9pt] tracking-[0.28em] text-neutral-500">WOORI-HIP · 품질관리</p>
          <h2 className="mt-0.5 text-[16pt] font-black tracking-[0.18em]">{title}</h2>
          <p className="text-[10pt] font-bold">{exam.paperStep || paper?.step} · {exam.paperTitle || paper?.title}</p>
          <p className="text-[8pt] text-neutral-600">{paper?.standards}</p>
        </div>
        <table className="exam-print-approval">
          <colgroup>
            <col className="exam-print-approval-label" />
            <col />
            <col />
            <col />
          </colgroup>
          <tbody>
            <tr>
              <th rowSpan={3}>결재</th>
              {['감독', '검토', '승인'].map((step) => (
                <th key={step}>{step}</th>
              ))}
            </tr>
            <tr>
              {approvals.map((item, index) => (
                <td key={item?.step ?? index} className="exam-print-sign">
                  {item?.signedById ? (
                    <img src={`/api/auth/signature?userId=${encodeURIComponent(item.signedById)}`} alt="" />
                  ) : null}
                </td>
              ))}
            </tr>
            <tr>
              {approvals.map((item, index) => (
                <td key={`${item?.step ?? index}-name`} className="exam-print-approval-name">{item?.signedByName || ' '}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </header>
      <dl className="exam-print-meta">
        {(
          [
            ['성명', exam.examinee || '—'],
            ['시험일', dotDate(exam.examDate)],
            ['감독자', exam.supervisor || '—'],
            ['득점', `${exam.score} / 100`],
            ['판정', exam.passed ? '합격' : '불합격'],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={cn(label === '판정' && (exam.passed ? 'text-emerald-700' : 'text-rose-700'))}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="exam-print-note">
        합격 기준 {passScore}점 · 정답 {exam.correct}/{exam.total || questions.length || '—'}
      </p>
      <div className="exam-print-questions">
        {[0, 1].map((column) => {
          const start = column === 0 ? 0 : Math.ceil(questions.length / 2)
          const end = column === 0 ? Math.ceil(questions.length / 2) : questions.length
          return (
            <ol key={column}>
              {questions.slice(start, end).map((question, offset) => {
                const index = start + offset
                const picked = answers[index]
                return (
                  <li key={question.prompt}>
                    <p>
                      <b>{index + 1}.</b>{' '}
                      {question.prompt}
                    </p>
                    <ul>
                      {question.options.map((option, optionIndex) => {
                        const mark = MARKS[optionIndex] ?? String(optionIndex + 1)
                        const isPicked = picked === optionIndex
                        const isKey = optionIndex === question.answer
                        return (
                          <li key={option} className={cn(isKey && 'is-answer')}>
                            <span className="exam-print-mark">
                              {mark}
                              {isPicked ? (
                                <svg className="exam-print-check" viewBox="0 0 24 24" aria-hidden>
                                  <path d="M4 12.6 L9.2 18 L20 6" />
                                </svg>
                              ) : null}
                            </span>
                            {option}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ol>
          )
        })}
      </div>
    </article>
  )
}

export function waitForExamImages(root: HTMLElement) {
  const images = [...root.querySelectorAll('img')]
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          window.setTimeout(done, 2500)
        }),
    ),
  )
}
