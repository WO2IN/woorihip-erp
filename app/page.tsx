import { HomeBoard } from '@/components/dashboard/home-board'
import { getDashboardStats } from '@/lib/dashboard-stats'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const data = await getDashboardStats()
  return <HomeBoard data={data} />
}
