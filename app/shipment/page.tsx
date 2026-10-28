import { Suspense } from 'react'
import { ShipmentView } from '@/components/shipment/shipment-view'

export default function ShipmentPage() {
  return (
    <Suspense fallback={null}>
      <ShipmentView />
    </Suspense>
  )
}
