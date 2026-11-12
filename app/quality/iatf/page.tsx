import { Suspense } from 'react'
import { IatfView } from '@/components/quality/iatf-view'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <IatfView />
    </Suspense>
  )
}
