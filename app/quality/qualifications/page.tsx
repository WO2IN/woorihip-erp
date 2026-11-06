import { Suspense } from 'react'
import { QualificationsView } from '@/components/quality/qualifications-view'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QualificationsView />
    </Suspense>
  )
}
