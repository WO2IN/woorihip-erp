import { cookies } from 'next/headers'
import { HomeBoard } from '@/components/dashboard/home-board'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { getDashboardStats } from '@/lib/dashboard-stats'
import { applyTaskChecks, readMyTaskChecks } from '@/lib/my-tasks'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
  const data = await getDashboardStats()
  // 층 담당 사용자에게는 본인 층의 업무를 보여준다. 관리자와 층 미지정 계정은 기존 업무대기를 쓴다.
  const myTasks = user && user.role !== 'admin' && user.floor
    ? applyTaskChecks(data.floorTasks[String(user.floor)] ?? [], await readMyTaskChecks(user.id, data.today.date))
    : null
  return <HomeBoard data={data} myTasks={myTasks} />
}
