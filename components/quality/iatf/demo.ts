export const YEARLY_CARDS = [
  { label: '2026 지적사항', value: '6', unit: '건', sub: 'IATF 2차 사후관리심사 · 경부적합' },
  { label: '개선 진행', value: '2', unit: '건', sub: '시정조치 · 유효성 확인 중' },
  { label: '완료', value: '4', unit: '건', sub: '완료율 67%' },
  { label: '인증기관', value: 'NQA', unit: '', sub: 'IATF 0545442 · CB 19621-T' },
  { label: '다음 인증심사', value: '2027년', unit: '', sub: '재인증심사 · 일정 확인 필요' },
] as const

export const YEAR_BARS = [
  { year: '2024 예시', done: 5, open: 0 },
  { year: '2025 예시', done: 4, open: 0 },
  { year: '2026', done: 4, open: 2 },
] as const

export const AUDIT_ROWS = [
  { year: '2026', name: 'IATF 16949 2차 사후관리심사', date: '2026.07', found: 6, open: 2, done: 4, rate: 67 },
  { year: '2025', name: 'IATF 16949 1차 사후관리심사 예시', date: '2025', found: 4, open: 0, done: 4, rate: 100 },
  { year: '2024', name: 'IATF 16949 재인증심사 예시', date: '2024', found: 5, open: 0, done: 5, rate: 100 },
] as const

export const CLAUSE_CARDS = [
  { label: '7장 지원', value: '2건' },
  { label: '8장 운용', value: '2건' },
  { label: '9장 성과평가', value: '1건' },
  { label: '10장 개선', value: '1건' },
] as const

export const OPEN_FINDINGS = [
  { no: 'N-05', clause: '9.2.2.3', process: '제조공정 심사', doc: 'WR-MP-1001', summary: '공정심사 연간계획 수립 기준 부재', action: '실행 기록 확인 중' },
  { no: 'N-06', clause: '10.2.3', process: '문제해결', doc: 'WR-MP-0901', summary: '시정조치 유효성 검증 기준 부재', action: '유효성 확인 중' },
] as const

export const FINDINGS = [
  { no: 'N-01', clause: '7.1.5.1.1', doc: 'WR-SP-0702', summary: 'MSA 대상 계측기 선정·영향평가 기준 미흡', grade: '경부적합', status: '완료' as const, audit: 'IATF 16949 2차 사후관리심사', process: '측정시스템 분석', closed: '2026.09.23', action: '교정·중간점검·영향평가 기준(부표4) 신설' },
  { no: 'N-02', clause: '7.2.3', doc: 'WR-MP-1001', summary: '내부심사원 자격 부여·유지 기준 불명확', grade: '경부적합', status: '완료' as const, audit: 'IATF 16949 2차 사후관리심사', process: '내부심사', closed: '2026.08.12', action: '자격 부여·유지 기준 개정' },
  { no: 'N-03', clause: '8.5.1.1', doc: 'WR-COP-0401', summary: '초기유동 관리 기준 부재', grade: '경부적합', status: '완료' as const, audit: 'IATF 16949 2차 사후관리심사', process: '생산', closed: '2026.08.20', action: '초기유동 관리 기준 신설' },
  { no: 'N-04', clause: '8.7.1.4', doc: 'WR-SP-0801', summary: '재작업 이력·품질 기준 미흡', grade: '경부적합', status: '완료' as const, audit: 'IATF 16949 2차 사후관리심사', process: '부적합품 관리', closed: '2026.09.02', action: '재작업 이력 기준 개정' },
  { no: 'N-05', clause: '9.2.2.3', doc: 'WR-MP-1001', summary: '공정심사 연간계획 수립 기준 부재', grade: '경부적합', status: '개선' as const, audit: 'IATF 16949 2차 사후관리심사', process: '제조공정 심사', closed: '-', action: '실행 기록 확인 중' },
  { no: 'N-06', clause: '10.2.3', doc: 'WR-MP-0901', summary: '시정조치 유효성 검증 기준 부재', grade: '경부적합', status: '개선' as const, audit: 'IATF 16949 2차 사후관리심사', process: '문제해결', closed: '-', action: '유효성 확인 중' },
]

export const TIMELINE = [
  { year: '2024', title: 'IATF 재인증심사 예시', note: '완료', state: 'done' as const },
  { year: '2025', title: 'IATF 1차 사후관리심사 예시', note: '완료', state: 'done' as const },
  { year: '2026.07', title: 'IATF 2차 사후관리심사', note: '경부적합 6건 · 개선 2건 진행', state: 'current' as const },
  { year: '2027', title: 'IATF 재인증심사', note: '예정 · 일정 확인 필요', state: 'next' as const },
]

export const DOCUMENTS = [
  { no: 'WR-SP-0602', name: '제조설비관리', kind: '지원', rev: 'Rev.3', date: '2026.10.20', owner: '경영' },
  { no: 'WR-CP-0402', name: '4M 변경관리', kind: '지원', rev: 'Rev.4', date: '2026.09.23', owner: '고객지향' },
  { no: 'WR-SP-0701', name: '검사 및 시험', kind: '지원', rev: 'Rev.3', date: '2026.09.23', owner: '지원' },
  { no: 'WR-MP-0201', name: '교육훈련', kind: '경영', rev: 'Rev.5', date: '2026.09.23', owner: '경영' },
  { no: 'WR-MP-1001', name: '내부심사', kind: '경영', rev: 'Rev.4', date: '2026.09.23', owner: '경영' },
  { no: 'WR-COP-0302', name: '고객만족 및 불만처리', kind: '고객지향', rev: 'Rev.3', date: '2026.09.23', owner: '고객지향' },
  { no: 'WR-SP-0801', name: '부적합품 관리', kind: '지원', rev: 'Rev.3', date: '2026.09.23', owner: '지원' },
  { no: 'WR-MP-0103', name: '의사소통', kind: '경영', rev: 'Rev.1', date: '2023.09.01', owner: '경영' },
]

export const PROCESS_SHARE = [
  { label: '경영', count: 10, tone: 'bg-sky-500' },
  { label: '고객지향', count: 5, tone: 'bg-emerald-500' },
  { label: '지원', count: 14, tone: 'bg-slate-400' },
] as const

export const DOC_REVISIONS = [
  { rev: 'Rev.3', date: '2026.10.20', note: 'Rack 보존수명·도출심사·외주수리(폐기) 기준(부표3) 추가' },
  { rev: 'Rev.2', date: '2026.09.23', note: '동도금 보전주기 정정, 동급기준 Rack 관리(부표 2) 추가' },
]
