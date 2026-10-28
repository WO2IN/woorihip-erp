import { ComingSoon } from '@/components/shared/coming-soon'

export default function Page() {
  return (
    <ComingSoon
      group="고객관리"
      title="QSA · QPA"
      description="고객사 품질시스템 심사(QSA)와 공정 품질 감사(QPA)를 한 곳에서 관리"
      plans={['고객사별 심사 일정과 결과 등록', '지적 사항 개선 조치와 완료 확인', '심사 자료(체크리스트·증빙) 보관']}
    />
  )
}
