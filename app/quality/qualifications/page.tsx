import { ComingSoon } from '@/components/shared/coming-soon'

export default function Page() {
  return (
    <ComingSoon
      group="품질관리"
      title="자격관리"
      description="직원 자격과 교육 이수 현황을 관리할 화면입니다."
      plans={['자격 보유 현황', '유효 기간과 갱신 일정', '교육 이수 기록']}
    />
  )
}
