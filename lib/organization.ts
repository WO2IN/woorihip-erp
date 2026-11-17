const TITLES = ['회장', '부회장', '대표이사', '대표', '사장', '부사장', '전무이사', '전무', '상무이사', '상무', '이사', '실장', '본부장', '공장장', '팀장', '부장', '차장', '과장', '계장', '대리', '주임', '사원', '반장', '조장']

function personName(label: string) {
  const parts = label.trim().split(/\s+/)
  if (parts.length > 1 && TITLES.includes(parts[0])) return parts.slice(1).join(' ')
  return label.trim()
}

interface OrgSeat {
  label: string
  name: string
  department: string
  group: string
}

function seatsFrom(organization: unknown): OrgSeat[] {
  if (!organization || typeof organization !== 'object') return []
  const departments = Array.isArray((organization as { departments?: unknown }).departments)
    ? (organization as { departments: unknown[] }).departments
    : []
  const seats: OrgSeat[] = []
  for (const department of departments) {
    if (!department || typeof department !== 'object') continue
    const dept = typeof (department as { name?: unknown }).name === 'string' ? (department as { name: string }).name.trim() : ''
    const people = (department as { people?: unknown }).people
    if (!dept || !Array.isArray(people)) continue
    let group = ''
    for (const person of people) {
      if (!person || typeof person !== 'object' || typeof (person as { label?: unknown }).label !== 'string') continue
      const label = (person as { label: string }).label.trim()
      if ((person as { kind?: unknown }).kind !== 'person') {
        group = label
        continue
      }
      if (!label) continue
      seats.push({ label, name: personName(label), department: dept, group })
    }
  }
  return seats
}

function seatFor(organization: unknown, displayName: string) {
  const name = displayName.trim()
  if (!name) return null
  return seatsFrom(organization).find((seat) => samePerson(seat.label, name)) ?? null
}

function samePerson(label: string, displayName: string) {
  const name = displayName.trim()
  return label.trim() === name || personName(label) === name
}

/** 조직도에서 같은 부서·같은 팀 칸에 있는 사람인지. 팀 칸이 없으면 그 부서 전체를 한 팀으로 본다. */
export function sharesTeam(organization: unknown, a: string, b: string) {
  const left = seatFor(organization, a)
  const right = seatFor(organization, b)
  if (!left || !right) return false
  return left.department === right.department && left.group === right.group
}

/** 조직도에서 이 사람의 소속. 팀 칸이 있으면 "생산부 · 생산 1팀"처럼 붙인다. */
export function departmentForPerson(organization: unknown, displayName: string) {
  const name = displayName.trim()
  if (!name || !organization || typeof organization !== 'object') return ''
  const seat = seatFor(organization, name)
  if (seat) {
    if (!seat.group || seat.group === seat.department) return seat.department
    const combined = `${seat.department} · ${seat.group}`
    return combined.length <= 40 ? combined : seat.department
  }
  const record = organization as { executive?: { people?: unknown } }
  const executives = Array.isArray(record.executive?.people) ? record.executive.people : []
  for (const person of executives) {
    if (!person || typeof person !== 'object' || typeof (person as { label?: unknown }).label !== 'string') continue
    if (samePerson((person as { label: string }).label, name)) return '임원'
  }
  return ''
}
