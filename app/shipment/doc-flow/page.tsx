import { Suspense } from 'react'
import { DocFlowBoard } from '@/components/shipment/doc-flow-board'

export default function DocFlowPage() {
  return (
    <Suspense fallback={null}>
      <DocFlowBoard />
    </Suspense>
  )
}
