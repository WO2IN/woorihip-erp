import { headers } from 'next/headers'
import {
  CustomerPanel,
  DashboardHeader,
  ProcessPanel,
  QualityPanel,
  RecentActivityCard,
  ShipmentPanel,
  TodayBar,
} from '@/components/dashboard/overview'
import { getDashboardStats } from '@/lib/dashboard-stats'
import { getUserFromHeaders } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [data, user] = await Promise.all([getDashboardStats(), headers().then(getUserFromHeaders)])
  const isAdmin = user?.role === 'admin'

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <DashboardHeader date={data.today.date} />
      <TodayBar data={data} />

      <div className="grid gap-5 lg:grid-cols-2">
        <ShipmentPanel data={data} />
        <CustomerPanel data={data} />
        <QualityPanel data={data} />
        <ProcessPanel data={data} />
        {isAdmin && (
          <div className="xl:col-span-2">
            <RecentActivityCard data={data} />
          </div>
        )}
      </div>
    </div>
  )
}
