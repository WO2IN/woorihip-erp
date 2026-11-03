/** 이 시간 이내 활동이 있으면 「접속 중」으로 표시 */
export const USER_ONLINE_THRESHOLD_MS = 3 * 60 * 1000

export function isUserOnline(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false
  const t = new Date(lastSeenAt).getTime()
  if (Number.isNaN(t)) return false
  return now - t < USER_ONLINE_THRESHOLD_MS
}

export function formatLastSeenLabel(lastSeenAt: string | null | undefined, now = Date.now()): string {
  if (!lastSeenAt) return '활동 기록 없음'
  if (isUserOnline(lastSeenAt, now)) return '접속 중'

  const diff = now - new Date(lastSeenAt).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  return new Date(lastSeenAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}
