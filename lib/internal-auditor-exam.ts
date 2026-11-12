export type ExamQuestion = {
  prompt: string
  tag: string
  options: string[]
  answer: number
}

export type ExamPaper = {
  id: string
  step: string
  title: string
  standards: string
  questions: ExamQuestion[]
}

export const INTERNAL_AUDITOR_EXAM_COLLECTION = 'internalAuditorExams'

export const PAPERS: ExamPaper[] = [
  {
    id: 'basic',
    step: '1안',
    title: '기본 시험지',
    standards: 'ISO 9001 · IATF 16949 · Core Tools',
    questions: [
      {
        prompt: 'ISO 9001 품질경영시스템의 핵심 사이클로, 지속적 개선을 위해 계획-실행-검토-조치를 반복하는 개념은 무엇인가?',
        tag: 'ISO 9001',
        options: ['6 Sigma 사이클', 'PDCA 사이클', 'FMEA 사이클', 'APQP 사이클'],
        answer: 1,
      },
      {
        prompt: '자동차 산업 특화 품질경영시스템인 IATF 16949에 대한 설명으로 틀린 것은?',
        tag: 'IATF 16949',
        options: ['결함 예방 및 산포 감소를 목적으로 한다.', 'ISO 9001과 독립적으로 단독 인증이 가능하다.', '자동차 공급망 전체에 적용된다.', '지속적 개선을 강조한다.'],
        answer: 1,
      },
      {
        prompt: '자동차 산업의 5대 핵심 도구(Core Tools)가 아닌 것은 무엇인가?',
        tag: 'Core Tools',
        options: ['APQP (사전제품품질계획)', 'FMEA (고장모드 및 영향분석)', 'ERP (전사적 자원관리)', 'PPAP (생산부품 승인절차)'],
        answer: 2,
      },
      {
        prompt: '제품이나 공정에서 발생할 수 있는 잠재적 고장을 미리 예측하고, 그 영향을 분석하여 위험을 예방하는 핵심 도구는?',
        tag: 'Core Tools',
        options: ['FMEA', 'SPC', 'MSA', 'PPAP'],
        answer: 0,
      },
      {
        prompt: '통계적 기법을 이용하여 공정의 산포를 분석하고, 이상 원인이 발생했을 때 이를 감지하여 조치할 수 있도록 돕는 도구는?',
        tag: 'Core Tools',
        options: ['APQP', 'SPC', 'PPAP', 'FMEA'],
        answer: 1,
      },
      {
        prompt: 'IATF 16949에서 요구하는 3가지 내부심사의 종류에 해당하지 않는 것은?',
        tag: '내부심사',
        options: ['품질경영시스템 심사', '제조공정 심사', '제품 심사', '재무회계 심사'],
        answer: 3,
      },
      {
        prompt: '내부심사 시 부적합 사항이 발견되었을 때의 올바른 처리 절차로 가장 적절한 것은?',
        tag: '내부심사',
        options: [
          '부적합 발견 → 심사 즉시 종결 → 다음 심사 시 확인',
          '부적합 발견 → 원인 분석 → 시정조치 실시 → 유효성 검증 → 심사 종결',
          '부적합 발견 → 담당자 문책 → 고객사 통보',
          '부적합 발견 → 시정조치 없이 결과만 보고서에 기록',
        ],
        answer: 1,
      },
      {
        prompt: '측정 기기와 측정자 등 데이터를 수집하는 \'측정 시스템\' 자체가 신뢰할 수 있는지 타당성을 검증하는 도구는?',
        tag: 'Core Tools',
        options: ['MSA', 'SPC', 'APQP', 'PPAP'],
        answer: 0,
      },
      {
        prompt: '자동차 산업에서 도면 및 시방서에 지정된 모든 치수와 성능 요구사항이 일치하는지 정기적으로 확인하는 검증 방법은 무엇인가?',
        tag: '제품 적합성',
        options: ['통계적 공정관리(SPC)', '수입검사', '전 항목 검사 (Layout Inspection) 및 기능 시험', '공급업체 평가'],
        answer: 2,
      },
      {
        prompt: 'IATF 16949 요구사항 외에 완성차 업체 등 특정 고객이 자사의 특성에 맞춰 추가 요구하는 고유의 품질 기준을 뜻하는 용어는?',
        tag: '고객 요구사항',
        options: ['CSR (Customer Specific Requirements)', 'QMS (Quality Management System)', 'NCR (Non-Conformance Report)', 'CAP (Corrective Action Plan)'],
        answer: 0,
      },
    ],
  },
  {
    id: 'advanced',
    step: '2안',
    title: 'IATF 16949 조항형',
    standards: '7.2.3 · 9.2.2.1 ~ 9.2.2.4 · 7.1.5.1.1 · 8.5.1.1 · 8.3.3.3 · 4.4.1.2 · 10.2.3 (조항 이해도 평가)',
    questions: [
      {
        prompt: 'IATF 16949에서 내부심사원의 역량(자격) 요구사항을 규정한 조항은?',
        tag: '심사원 역량',
        options: ['7.2.3 내부심사원 역량', '8.5.1 생산 및 서비스 제공의 관리', '9.3.1 경영검토 일반', '10.2.3 문제해결'],
        answer: 0,
      },
      {
        prompt: '내부심사 프로그램(9.2.2.1)의 우선순위를 정할 때 고려해야 하는 사항이 아닌 것은?',
        tag: '9.2.2.1',
        options: ['리스크', '내·외부 성과 추세', '프로세스의 중요성', '심사원 개인의 선호'],
        answer: 3,
      },
      {
        prompt: '품질경영시스템 심사(9.2.2.2)에 대한 설명으로 옳은 것은?',
        tag: '9.2.2.2',
        options: ['고객 불만이 있을 때만 실시한다', '3년 주기 동안 모든 QMS 프로세스를 연간 계획에 따라 프로세스 접근법으로 심사한다', '인증기관 심사로 대체할 수 있다', '경영자 프로세스는 제외한다'],
        answer: 1,
      },
      {
        prompt: '제조공정 심사(9.2.2.3)에 대한 설명으로 옳은 것은?',
        tag: '9.2.2.3',
        options: ['신제품 공정만 심사한다', '5년 주기로 1회 실시한다', '3년 주기 동안 모든 제조공정을 심사하여, 교대근무가 있으면 교대별로 포함한다', '주간 근무만 심사한다'],
        answer: 2,
      },
      {
        prompt: '제품 심사(9.2.2.4)의 목적으로 가장 적절한 것은?',
        tag: '9.2.2.4',
        options: ['생산 및 인도의 적절한 단계에서 규정된 모든 요구사항에 대한 제품 적합성 검증', '설비 가동률 확인', '작업자 근태 확인', '원가 절감 효과 확인'],
        answer: 0,
      },
      {
        prompt: 'MSA(7.1.5.1.1)를 실시해야 하는 대상으로 옳은 것은?',
        tag: '7.1.5.1.1',
        options: ['회사가 보유한 모든 사무용 기기', '관리계획서에 명시된 검사·측정·시험 장비 시스템', '고객이 지정한 장비만', '신규 구입 장비만'],
        answer: 1,
      },
      {
        prompt: '관리계획서(8.5.1.1)에 대한 설명으로 옳은 것은?',
        tag: '8.5.1.1',
        options: ['양산 단계에만 작성한다', '고객이 요청할 때만 작성한다', '양산 전(Pre-launch)과 양산(Production) 단계의 관리계획서를 작성한다', '작업표준서로 대체할 수 있다'],
        answer: 2,
      },
      {
        prompt: '특별특성(8.3.3.3)에 대한 설명으로 옳은 것은?',
        tag: '8.3.3.3',
        options: ['고객이 지정한 특성만 해당한다', '조직이 리스크 분석으로 식별한 특성도 포함하여 도면·FMEA·관리계획서·작업표준서에 표시한다', '도면에만 표시하면 된다', '양산 후에 식별한다'],
        answer: 1,
      },
      {
        prompt: '제품 안전 관련 제품 및 제조공정의 관리를 위해 문서화된 프로세스를 요구하는 조항은?',
        tag: '제품 안전',
        options: ['4.4.1.2 제품 안전', '7.5.3 문서화된 정보의 관리', '8.4.2 외부 제공자 관리', '9.1.3 분석 및 평가'],
        answer: 0,
      },
      {
        prompt: '고객 불만 및 현장 고장 등에 대해 근본원인 분석·시정조치·유효성 검증을 포함한 문서화된 문제해결 프로세스를 요구하는 조항은?',
        tag: '문제해결',
        options: ['8.3.2 설계 및 개발 기획', '10.2.3 문제해결', '7.1.5 모니터링 및 측정 자원', '6.1.2.3 비상대책'],
        answer: 1,
      },
    ],
  },
]

export const SET_OPERATION = [
  '신규 자격 : 1안 (교육 직후 이해도 확인)',
  '연 1회 재평가 : 2안 (조항 적용 능력 확인)',
  '불합격 시 다른 세트로 재시험',
] as const

export const APPROVAL_STEPS = ['감독', '검토', '승인'] as const
export type ApprovalStep = (typeof APPROVAL_STEPS)[number]

export type InternalAuditorExamApproval = {
  step: ApprovalStep
  signedById: string
  signedByName: string
}

export type InternalAuditorExamRecord = {
  id: string
  /** 자격인증대장 행 id. 예전 기록은 없을 수 있다. */
  examineeId?: string
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
  approvals: InternalAuditorExamApproval[]
  savedById: string
  savedByName: string
  savedAt: string
}

export function scoreExamPapers(papers: ExamPaper[], paperId: string, answers: number[], passScore = 80) {
  const paper = papers.find((item) => item.id === paperId)
  if (!paper || answers.length !== paper.questions.length) return null
  const complete = answers.every((value, index) => {
    const optionCount = paper.questions[index]?.options.length ?? 0
    return Number.isInteger(value) && value >= 0 && value < optionCount
  })
  if (!complete) return null
  const correct = paper.questions.filter((question, index) => answers[index] === question.answer).length
  const score = Math.round((correct / paper.questions.length) * 100)
  return { paper, correct, total: paper.questions.length, score, passed: score >= passScore }
}

export function scoreExam(paperId: string, answers: number[]) {
  return scoreExamPapers(PAPERS, paperId, answers, 80)
}
