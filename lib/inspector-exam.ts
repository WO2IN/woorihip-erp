import { scoreExamPapers, type ExamPaper, type InternalAuditorExamRecord } from '@/lib/internal-auditor-exam'

export const INSPECTOR_EXAM_COLLECTION = 'inspectorExams'
export const INSPECTOR_PASS_SCORE = 60

export const INSPECTOR_PAPERS: ExamPaper[] = [
  {
    id: 'basic',
    step: '1안',
    title: '기본 시험지',
    standards: '수입 · 공정 · 출하검사 (임시 문항)',
    questions: [
      {
        prompt: '수입검사의 주된 목적은 무엇인가?',
        tag: '수입검사',
        options: ['입고 자재가 규격에 맞는지 확인한다', '생산 실적을 집계한다', '급여를 계산한다', '출장 일정을 잡는다'],
        answer: 0,
      },
      {
        prompt: '공정검사에서 먼저 확인할 기준으로 알맞은 것은?',
        tag: '공정검사',
        options: ['관리계획과 작업표준', '사무실 온도', '휴게실 정수기', '명함 서식'],
        answer: 0,
      },
      {
        prompt: '부적합품을 다루는 방법으로 알맞은 것은?',
        tag: '부적합',
        options: ['격리하고 식별표를 붙인다', '정상품과 섞어 둔다', '기록을 지운다', '라벨을 떼고 출하한다'],
        answer: 0,
      },
      {
        prompt: '샘플링 검사에서 로트의 합부를 가르는 기준은?',
        tag: '샘플링',
        options: ['검사 기준서의 합부 판정', '검사자 컨디션', '납기만 본다', '포장 색상'],
        answer: 0,
      },
      {
        prompt: '측정값이 규격 한계에 있을 때 알맞은 처리는?',
        tag: '판정',
        options: ['기준서에 따라 합부를 판정한다', '항상 합격으로 본다', '항상 불합격으로 본다', '다음 날로 미룬다'],
        answer: 0,
      },
      {
        prompt: '수입검사에서 성적서가 없을 때 알맞은 처리는?',
        tag: '수입검사',
        options: ['일단 생산에 투입한다', '기준서에 따라 입고를 보류한다', '수량만 확인하고 합격 처리한다', '성적서 칸을 빈칸으로 둔다'],
        answer: 1,
      },
      {
        prompt: '공정검사 주기를 정하는 기준으로 알맞은 것은?',
        tag: '공정검사',
        options: ['검사자 교대 시간', '관리계획에 적힌 주기', '당일 생산 목표량', '포장 작업 속도'],
        answer: 1,
      },
      {
        prompt: '식별이 없는 자재를 발견했을 때 알맞은 것은?',
        tag: '식별',
        options: ['비슷한 자재와 합친다', '미식별품으로 격리하고 확인한다', '라벨 없이 선입선출한다', '사용 후 기록한다'],
        answer: 1,
      },
      {
        prompt: '검사 기준이 개정되면 먼저 할 일은?',
        tag: '기준서',
        options: ['예전 기준서로 계속 검사한다', '개정 기준을 확인하고 유효본을 쓴다', '개정 공지만 읽어 둔다', '기준서 번호만 메모한다'],
        answer: 1,
      },
      {
        prompt: '샘플 채취 후 남은 로트의 상태로 알맞은 것은?',
        tag: '샘플링',
        options: ['채취 표시 없이 그대로 둔다', '채취·식별 상태를 알 수 있게 둔다', '합격 로트와 바로 섞는다', '검사 전 로트로 되돌리지 않는다'],
        answer: 1,
      },
    ],
  },
  {
    id: 'practical',
    step: '2안',
    title: '실기 확인',
    standards: '출하 · 계측 · 기록 (임시 문항)',
    questions: [
      {
        prompt: '출하검사에서 확인할 항목으로 알맞은 것은?',
        tag: '출하검사',
        options: ['제품 규격, 수량, 식별', '구내식당 메뉴', '주차 위치', '회의실 예약'],
        answer: 0,
      },
      {
        prompt: '계측기를 쓰기 전에 확인할 것은?',
        tag: '계측기',
        options: ['교정 유효기간', '기기 색상', '보관 선반 높이', '제조사 로고 크기'],
        answer: 0,
      },
      {
        prompt: '고객 불만 시료를 받으면 어떻게 하는가?',
        tag: '고객불만',
        options: ['식별한 뒤 원인 분석 절차로 넘긴다', '바로 폐기하고 끝낸다', '기록 없이 다시 출하한다', '담당자에게 말로만 전달한다'],
        answer: 0,
      },
      {
        prompt: '한도견본의 용도로 알맞은 것은?',
        tag: '한도견본',
        options: ['목시 판정의 합부 기준', '사무실 장식', '교육 기념품', '폐기 대상'],
        answer: 0,
      },
      {
        prompt: '검사 기록에 남겨야 하는 것은?',
        tag: '기록',
        options: ['로트, 결과, 검사자, 일자', '검사자 취미', '날씨만', '서명 없는 수량만'],
        answer: 0,
      },
      {
        prompt: '도금두께를 측정하기 전에 알맞은 것은?',
        tag: '도금두께',
        options: ['표준시편으로 영점을 확인한다', '가장 두꺼운 부위를 눈으로 고른다', '어제 측정값을 그대로 쓴다', '측정 없이 한도견본만 본다'],
        answer: 0,
      },
      {
        prompt: '외관 판정에서 한도견본과 다른 결함이 보이면?',
        tag: '외관',
        options: ['비슷하면 합격으로 둔다', '기준서와 한도견본으로 다시 판정한다', '고객 출하 후 확인한다', '결함 부위만 가리고 보낸다'],
        answer: 1,
      },
      {
        prompt: '부적합품 표찰에 적어야 하는 것은?',
        tag: '표찰',
        options: ['품명, 로트, 부적합 내용, 일자', '검사자 사번만', '다음 공정 이름만', '빈 표찰'],
        answer: 0,
      },
      {
        prompt: '교정 기한이 지난 계측기로 검사하면?',
        tag: '계측기',
        options: ['결과가 맞으면 유효하다', '그 검사 결과는 유효하지 않다', '감독자 확인 없이 기록한다', '다음 교정일만 고친다'],
        answer: 1,
      },
      {
        prompt: '출하 전 식별 라벨이 빠졌을 때 알맞은 것은?',
        tag: '출하검사',
        options: ['수량만 맞으면 출하한다', '식별을 확인한 뒤에 출하한다', '라벨은 고객이 붙인다', '사진만 남기고 보낸다'],
        answer: 1,
      },
    ],
  },
]

export const INSPECTOR_SET_OPERATION = [
  '신규 자격 : 1안 (교육 직후 이해도 확인)',
  '연 1회 재평가 : 2안 (검사 적용 능력 확인)',
  '불합격 시 다른 세트로 재시험',
] as const

export type InspectorExamRecord = InternalAuditorExamRecord

export function scoreInspectorExam(paperId: string, answers: number[]) {
  return scoreExamPapers(INSPECTOR_PAPERS, paperId, answers, INSPECTOR_PASS_SCORE)
}
