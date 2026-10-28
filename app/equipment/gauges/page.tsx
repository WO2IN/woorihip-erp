import { ComingSoon } from '@/components/shared/coming-soon'

export default function Page() {
  return (
    <ComingSoon
      group="설비관리"
      title="계측기 이력관리"
      description="계측기 교정 주기와 이력을 관리"
      plans={['계측기 목록과 교정 주기 등록', '교정 예정일 알림', '교정 성적서 첨부와 이력 조회']}
    />
  )
}
