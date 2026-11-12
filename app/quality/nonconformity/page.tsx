import { Suspense } from 'react'
import { NonconformityView } from '@/components/quality/nonconformity-view'

export default function NonconformityPage() {
  return (
    <Suspense fallback={null}>
      <NonconformityView />
    </Suspense>
  )
}
