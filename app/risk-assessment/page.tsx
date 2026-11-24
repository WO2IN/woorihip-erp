import { Suspense } from 'react'
import { RiskView } from '@/components/risk/risk-view'

export default function RiskAssessmentPage() {
  return (
    <Suspense fallback={null}>
      <RiskView />
    </Suspense>
  )
}
