import { ComingSoon } from '@/components/shared/coming-soon'

export default function Page() {
  return (
    <ComingSoon
      group="설비관리"
      title="소모품 (설비재고)"
      description="설비 소모품의 재고와 교체 이력을 관리"
      plans={['소모품 입고·사용 기록', '안전재고 미만 알림', '설비별 교체 주기 관리']}
    />
  )
}
