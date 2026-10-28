import { ComingSoon } from '@/components/shared/coming-soon'

export default function Page() {
  return (
    <ComingSoon
      group="품질관리"
      title="변경점관리 (4M) · 양산"
      description="양산 중 발생한 사람·설비·자재·방법(4M) 변경점을 관리합니다."
      plans={['양산 중 4M 변경 신고와 승인', '변경 전후 품질 확인 기록', '고객 통보 대상 변경 이력']}
    />
  )
}
