import { headers } from 'next/headers'
import { HomeBoard } from '@/components/dashboard/home-board'
import { getDashboardStats } from '@/lib/dashboard-stats'
import { getUserFromHeaders } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [data, user] = await Promise.all([getDashboardStats(), headers().then(getUserFromHeaders)])

  return (
    <HomeBoard data={data} userName={user?.displayName} />
  )
}
