import { Suspense } from 'react'
import { ApprovalsView } from '@/components/approvals/approvals-view'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ApprovalsView />
    </Suspense>
  )
}
