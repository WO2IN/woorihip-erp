import { ComingSoon } from '@/components/shared/coming-soon'

export default function Page() {
  return (
    <ComingSoon
      group="품질관리"
      title="IATF 16949"
      description="IATF 16949 인증 요구사항 대응 현황을 관리"
      plans={['요구 조항별 대응 문서 연결', '내부 심사 계획과 결과 기록', '인증 갱신 일정 알림']}
    />
  )
}
