export interface CheckStamp {
  checkedBy: string | null
  checkedById: string | null
  checkedAt: string | null
}

export function checkStamp(actor: { id: string; displayName: string }, value: string | null): CheckStamp {
  if (!value) return { checkedBy: null, checkedById: null, checkedAt: null }
  return {
    checkedBy: actor.displayName,
    checkedById: actor.id,
    checkedAt: new Date().toISOString(),
  }
}

export function formatCheckStamp(name?: string | null, at?: string | null) {
  if (!name) return ''
  if (!at) return name
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return name
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${name} · ${month}/${day} ${hour}:${minute}`
}
