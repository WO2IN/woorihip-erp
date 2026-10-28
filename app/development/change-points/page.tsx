import { ComingSoon } from '@/components/shared/coming-soon'

export default function Page() {
  return (
    <ComingSoon
      group="개발관리"
      title="변경점관리 (4M) · 개발"
      description="개발 중 도면·도금 스펙 등이 바뀌면 PDF와 함께 변경 이력을 관리합니다."
      plans={['도면·도금 스펙 변경 PDF 등록', '변경 전후 버전 비교와 이력', '변경 사유와 승인 기록']}
    />
  )
}
