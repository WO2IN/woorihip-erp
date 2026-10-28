"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Crown, FolderTree, GripVertical, Layers, Network, Pencil, Plus, Trash2, UserRound, Users } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { BAND_BUTTON, BAND_BUTTON_PRIMARY, PageHeader } from "@/components/shared/page-header"
import { buildAuthHeaders } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type Person = { label: string; kind: "person" | "group" | "floor" }
type Department = { name: string; color: "blue" | "orange"; people: Person[] }
type Executive = { people: Person[] }

const DEFAULT_EXECUTIVES: Person[] = [
  { label: "회장 배준기", kind: "person" },
  { label: "대표이사 홍성호", kind: "person" },
  { label: "상무이사 임종배", kind: "person" },
]

export default function OrganizationPage() {
  const { user } = useAuth()
  const [executive, setExecutive] = useState<Executive>({ people: [] })
  const [departments, setDepartments] = useState<Department[]>([])
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newMember, setNewMember] = useState<Record<number, string>>({})
  const [newGroup, setNewGroup] = useState<Record<number, string>>({})
  const [newExecutive, setNewExecutive] = useState("")
  const [draggedItem, setDraggedItem] = useState<{ departmentIndex: number; personIndex: number } | null>(null)

  useEffect(() => {
    fetch('/api/organization', { cache: 'no-store' })
      .then(response => response.json())
      .then(result => {
        const people = result.data?.executive?.people
        setExecutive({
          people: Array.isArray(people) && people.length === 3
            ? people
            : DEFAULT_EXECUTIVES,
        })
        setDepartments(Array.isArray(result.data?.departments) ? result.data.departments : [])
      })
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false))
  }, [])

  const saveOrganization = async () => {
    if (!user) {
      window.alert('로그인 정보를 확인한 뒤 다시 시도해주세요.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(user) },
        body: JSON.stringify({ executive, departments }),
      })
      if (!response.ok) throw new Error('저장하지 못했습니다.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '조직도 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const canEditOrganization = user?.role === "admin"

  const toggleEditMode = async () => {
    if (!canEditOrganization) return
    if (editMode) await saveOrganization()
    setEditMode(value => !value)
  }

  const memberCount = (department: Department) => department.people.filter(person => person.kind === "person").length
  const updateExecutiveLabel = (personIndex: number, label: string) => {
    setExecutive(current => ({
      ...current,
      people: current.people.map((person, index) => index === personIndex ? { ...person, label } : person),
    }))
  }

  const addExecutive = () => {
    const label = newExecutive.trim()
    if (!label) return
    setExecutive(current => ({ ...current, people: [...current.people, { label, kind: "person" }] }))
    setNewExecutive("")
  }

  const removeExecutive = (personIndex: number) => {
    setExecutive(current => ({ ...current, people: current.people.filter((_, index) => index !== personIndex) }))
  }

  const total = useMemo(() => executive.people.filter(person => person.kind === "person").length + departments.reduce((sum, department) => sum + memberCount(department), 0), [executive, departments])

  const updateDepartmentName = (departmentIndex: number, name: string) => {
    setDepartments(current => current.map((department, index) => index === departmentIndex ? { ...department, name } : department))
  }

  const addDepartment = () => {
    setDepartments(current => [...current, { name: '새 팀', color: current.length % 2 ? 'orange' : 'blue', people: [] }])
  }

  const removeDepartment = (departmentIndex: number) => {
    const name = departments[departmentIndex]?.name || '이 팀'
    if (!window.confirm(`‘${name}’을(를) 조직도에서 빼시겠습니까?`)) return
    setDepartments(current => current.filter((_, index) => index !== departmentIndex))
  }

  const addItem = (departmentIndex: number, kind: Person["kind"]) => {
    const values = kind === "person" ? newMember : newGroup
    const label = values[departmentIndex]?.trim()
    if (!label) return
    setDepartments(current => current.map((department, index) => index !== departmentIndex ? department : { ...department, people: [...department.people, { label, kind }] }))
    if (kind === "person") setNewMember(current => ({ ...current, [departmentIndex]: "" }))
    else setNewGroup(current => ({ ...current, [departmentIndex]: "" }))
  }

  const updateItemLabel = (departmentIndex: number, personIndex: number, label: string) => {
    setDepartments(current => current.map((department, index) => index !== departmentIndex ? department : {
      ...department,
      people: department.people.map((person, itemIndex) => itemIndex === personIndex ? { ...person, label } : person),
    }))
  }

  const removeItem = (departmentIndex: number, personIndex: number) => {
    setDepartments(current => current.map((department, index) => index !== departmentIndex ? department : { ...department, people: department.people.filter((_, itemIndex) => itemIndex !== personIndex) }))
  }

  const moveItem = (targetDepartmentIndex: number, targetPersonIndex: number) => {
    if (!draggedItem) return
    setDepartments(current => {
      const next = current.map(department => ({ ...department, people: [...department.people] }))
      const [item] = next[draggedItem.departmentIndex].people.splice(draggedItem.personIndex, 1)
      next[targetDepartmentIndex].people.splice(targetPersonIndex, 0, item)
      return next
    })
    setDraggedItem(null)
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        tone="slate"
        icon={Network}
        eyebrow="ORGANIZATION · 조직/사용자"
        title="조직 현황"
        description="WOORI-HIP의 부서별 구성과 담당자를 확인하세요."
        stat={{ label: '총원', value: total, unit: '명', sub: `임원 ${executive.people.length}명 · 부서 ${departments.length}개` }}
        actions={canEditOrganization && <button onClick={toggleEditMode} disabled={loading || saving} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:cursor-not-allowed ${editMode ? BAND_BUTTON_PRIMARY : BAND_BUTTON}`}>{editMode ? <Check className="size-4" /> : <Pencil className="size-3.5" />}{loading ? "불러오는 중" : saving ? "저장 중" : editMode ? "편집 완료" : "조직도 수정"}</button>}
      />

      {!loading && departments.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${departments.length}, minmax(0, 1fr))` }}>
          {departments.map((department, index) => {
            const tone = deptTone(index)
            const count = memberCount(department)
            return (
              <div key={index} className="rounded-xl border bg-card px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone.soft)}>
                    <Users className={cn("size-5", tone.text)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-muted-foreground">{department.name}</p>
                    <p className="text-2xl font-extrabold leading-tight tabular-nums">{count}<span className="ml-0.5 text-sm font-semibold text-muted-foreground">명</span></p>
                  </div>
                  <span className={cn("text-sm font-bold tabular-nums", tone.text)}>{total ? Math.round((count / total) * 100) : 0}%</span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editMode && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-[oklch(0.52_0.19_258/0.4)] bg-[oklch(0.52_0.19_258/0.06)] px-4 py-2.5 text-sm text-[oklch(0.45_0.17_258)] dark:text-[oklch(0.75_0.14_258)]">
          <GripVertical className="size-4" /> 팀 이름과 구성원을 바로 수정하고, +로 팀을 추가할 수 있습니다. 끝나면 &lsquo;편집 완료&rsquo;를 눌러 저장하세요.
        </p>
      )}

      <section className="overflow-x-auto rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mx-auto min-w-[960px] max-w-[1240px]">
          <div className="relative mx-auto w-fit">
            <div className="rounded-2xl border bg-[linear-gradient(180deg,oklch(0.97_0.01_262),transparent)] px-6 pb-5 pt-4 shadow-sm dark:bg-[linear-gradient(180deg,oklch(0.30_0.04_262),transparent)]">
              <p className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.2em] text-muted-foreground">
                <Crown className="size-3.5 text-[oklch(0.70_0.16_70)]" /> EXECUTIVE
              </p>
              {editMode ? (
                <div className="w-72 space-y-2">
                  {executive.people.map((person, personIndex) => (
                    <div key={personIndex} className="flex items-center gap-1.5">
                      <input aria-label={`${person.label} 이름`} value={person.label} onChange={event => updateExecutiveLabel(personIndex, event.target.value)} className={INPUT} />
                      <button aria-label={`${person.label} 삭제`} onClick={() => removeExecutive(personIndex)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <input aria-label="임원 이름 추가" value={newExecutive} onChange={event => setNewExecutive(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) addExecutive() }} placeholder="예: 전무이사 홍길동" className={INPUT} />
                    <button aria-label="임원 추가" onClick={addExecutive} className="shrink-0 rounded-md bg-[oklch(0.42_0.07_262)] px-2 text-white hover:opacity-90"><Plus className="size-3.5" /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-end justify-center gap-6">
                  {centerLead(executive.people).map((person, personIndex) => {
                    const { title, name } = splitLabel(person.label)
                    const lead = title === "회장"
                    return (
                      <div key={personIndex} className="flex w-28 flex-col items-center text-center">
                        <span className={cn(
                          "flex items-center justify-center rounded-full font-bold text-white shadow-md",
                          lead ? "size-16 bg-[linear-gradient(135deg,oklch(0.42_0.07_262),oklch(0.29_0.05_265))] text-xl ring-4 ring-[oklch(0.80_0.12_80/0.5)]" : "size-12 bg-[linear-gradient(135deg,oklch(0.55_0.08_262),oklch(0.42_0.07_262))] text-base",
                        )}>
                          <UserRound className={lead ? "size-7" : "size-5"} />
                        </span>
                        <p className={cn("mt-2 font-bold", lead ? "text-base" : "text-sm")}>{name}</p>
                        {title && <p className="text-xs text-muted-foreground">{title}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto h-8 w-px bg-border" />
          <div className="relative grid gap-5" style={{ gridTemplateColumns: `repeat(${Math.max(departments.length + (editMode ? 1 : 0), 1)}, minmax(0, 1fr))` }}>
            {departments.length > 1 && (
              <span
                className="absolute top-0 h-px bg-border"
                style={{ left: `${50 / (departments.length + (editMode ? 1 : 0))}%`, right: `${50 / (departments.length + (editMode ? 1 : 0))}%` }}
              />
            )}
            {!loading && departments.map((department, departmentIndex) => {
              const tone = deptTone(departmentIndex)
              return (
                <div key={departmentIndex} className="flex flex-col">
                  <span className="mx-auto h-6 w-px bg-border" />
                  <div
                    className="flex flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => draggedItem && moveItem(departmentIndex, department.people.length)}
                  >
                    <div className={cn("relative overflow-hidden px-4 py-3.5 text-white", tone.band)}>
                      <span className="pointer-events-none absolute -right-6 -top-8 size-20 rounded-full bg-white/10" />
                      {editMode ? (
                        <div className="relative flex items-center gap-1.5">
                          <input aria-label={`${department.name} 부서명`} value={department.name} onChange={event => updateDepartmentName(departmentIndex, event.target.value)} className="min-w-0 flex-1 rounded-md border border-white/40 bg-white/15 px-2 py-1 text-center font-bold text-white outline-none placeholder:text-white/60 focus:ring-2 focus:ring-white/50" />
                          <button type="button" aria-label={`${department.name} 삭제`} onClick={() => removeDepartment(departmentIndex)} className="shrink-0 rounded-md p-1 text-white/80 hover:bg-white/20 hover:text-white">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative flex items-center justify-between gap-2">
                          <p className="truncate text-base font-extrabold">{department.name}</p>
                          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">{memberCount(department)}명</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-1 p-3">
                      {department.people.map((person, personIndex) => {
                        const dragProps = {
                          draggable: editMode,
                          onDragStart: () => setDraggedItem({ departmentIndex, personIndex }),
                          onDragOver: (event: React.DragEvent) => event.preventDefault(),
                          onDrop: (event: React.DragEvent) => { event.stopPropagation(); moveItem(departmentIndex, personIndex) },
                        }
                        const editInput = editMode && (
                          <input aria-label={`${person.label} 이름`} value={person.label} onChange={event => updateItemLabel(departmentIndex, personIndex, event.target.value)} onMouseDown={event => event.stopPropagation()} className="min-w-0 flex-1 rounded bg-transparent px-1 font-medium outline-none focus:bg-background focus:ring-1 focus:ring-ring" />
                        )
                        const removeButton = editMode && (
                          <button aria-label={`${person.label} 삭제`} onClick={() => removeItem(departmentIndex, personIndex)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                        )

                        if (person.kind !== "person") {
                          const floor = person.kind === "floor" || /^\d+층$/.test(person.label.trim())
                          return (
                            <div key={personIndex} {...dragProps} className={cn("mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold first:mt-1", floor ? "bg-[oklch(0.70_0.16_58/0.16)] text-[oklch(0.48_0.14_50)] dark:text-[oklch(0.82_0.13_60)]" : cn(tone.soft, tone.text), editMode && "cursor-grab active:cursor-grabbing")}>
                              {editMode && <GripVertical className="size-4 shrink-0 opacity-60" />}
                              {floor ? <Layers className="size-4 shrink-0" /> : <FolderTree className="size-4 shrink-0" />}
                              {editInput || <span className="min-w-0 flex-1">{person.label}</span>}
                              {removeButton}
                            </div>
                          )
                        }

                        const { title, name } = splitLabel(person.label)
                        return (
                          <div key={personIndex} {...dragProps} className={cn("group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60", editMode && "cursor-grab active:cursor-grabbing")}>
                            {editMode && <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />}
                            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", tone.soft, tone.text)}><UserRound className="size-4" /></span>
                            {editInput || (
                              <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                                <span className="truncate font-semibold">{name}</span>
                                {title && <span className="shrink-0 text-xs text-muted-foreground">{title}</span>}
                              </span>
                            )}
                            {removeButton}
                          </div>
                        )
                      })}
                      {department.people.length === 0 && !editMode && (
                        <p className="py-6 text-center text-xs text-muted-foreground">구성원 없음</p>
                      )}
                    </div>

                    {editMode && (
                      <div className="space-y-2 border-t bg-muted/30 p-3">
                        <div className="flex gap-1.5">
                          <input value={newMember[departmentIndex] ?? ""} onChange={event => setNewMember(current => ({ ...current, [departmentIndex]: event.target.value }))} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) addItem(departmentIndex, "person") }} placeholder="구성원 (예: 대리 홍길동)" className={INPUT} />
                          <button aria-label="구성원 추가" onClick={() => addItem(departmentIndex, "person")} className={cn("shrink-0 rounded-md px-2 text-white", tone.bar)}><Plus className="size-4" /></button>
                        </div>
                        <div className="flex gap-1.5">
                          <input value={newGroup[departmentIndex] ?? ""} onChange={event => setNewGroup(current => ({ ...current, [departmentIndex]: event.target.value }))} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) addItem(departmentIndex, "group") }} placeholder="팀/조직 이름" className={INPUT} />
                          <button aria-label="팀/조직 추가" onClick={() => addItem(departmentIndex, "group")} className="shrink-0 rounded-md border bg-background px-2 text-muted-foreground hover:text-foreground"><FolderTree className="size-4" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {editMode && (
              <div className="flex flex-col">
                <span className="mx-auto h-6 w-px bg-border" />
                <button
                  type="button"
                  onClick={addDepartment}
                  className="flex min-h-48 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 text-sm font-semibold text-muted-foreground hover:border-[oklch(0.52_0.19_258/0.5)] hover:bg-[oklch(0.52_0.19_258/0.06)] hover:text-foreground"
                >
                  <span className="flex size-10 items-center justify-center rounded-full border border-dashed">
                    <Plus className="size-5" />
                  </span>
                  팀 추가
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

const INPUT = "min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/40"

const DEPT_TONES = [
  { band: "bg-[linear-gradient(135deg,oklch(0.52_0.19_258),oklch(0.40_0.16_265))]", bar: "bg-[oklch(0.52_0.19_258)]", soft: "bg-[oklch(0.52_0.19_258/0.10)] dark:bg-[oklch(0.62_0.18_258/0.18)]", text: "text-[oklch(0.48_0.18_258)] dark:text-[oklch(0.75_0.15_258)]" },
  { band: "bg-[linear-gradient(135deg,oklch(0.74_0.16_62),oklch(0.62_0.17_45))]", bar: "bg-[oklch(0.68_0.16_55)]", soft: "bg-[oklch(0.70_0.16_58/0.14)] dark:bg-[oklch(0.74_0.16_58/0.18)]", text: "text-[oklch(0.52_0.15_50)] dark:text-[oklch(0.80_0.14_60)]" },
  { band: "bg-[linear-gradient(135deg,oklch(0.60_0.14_165),oklch(0.46_0.12_172))]", bar: "bg-[oklch(0.58_0.14_165)]", soft: "bg-[oklch(0.58_0.15_162/0.12)] dark:bg-[oklch(0.62_0.15_162/0.18)]", text: "text-[oklch(0.45_0.13_165)] dark:text-[oklch(0.75_0.13_165)]" },
  { band: "bg-[linear-gradient(135deg,oklch(0.56_0.18_288),oklch(0.43_0.17_295))]", bar: "bg-[oklch(0.55_0.18_288)]", soft: "bg-[oklch(0.55_0.18_288/0.12)] dark:bg-[oklch(0.62_0.18_288/0.18)]", text: "text-[oklch(0.48_0.18_288)] dark:text-[oklch(0.76_0.14_288)]" },
  { band: "bg-[linear-gradient(135deg,oklch(0.64_0.21_25),oklch(0.52_0.20_18))]", bar: "bg-[oklch(0.60_0.21_25)]", soft: "bg-[oklch(0.60_0.21_25/0.10)] dark:bg-[oklch(0.62_0.21_25/0.18)]", text: "text-[oklch(0.52_0.20_25)] dark:text-[oklch(0.75_0.16_25)]" },
]

function deptTone(index: number) {
  return DEPT_TONES[index % DEPT_TONES.length]
}

const TITLES = ["회장", "부회장", "대표이사", "대표", "사장", "부사장", "전무이사", "전무", "상무이사", "상무", "이사", "실장", "본부장", "공장장", "팀장", "부장", "차장", "과장", "계장", "대리", "주임", "사원", "반장", "조장"]

function centerLead(people: Person[]) {
  const index = people.findIndex((person) => splitLabel(person.label).title === "회장")
  if (index < 0) return people
  const rest = people.filter((_, item) => item !== index)
  const middle = Math.ceil(rest.length / 2)
  return [...rest.slice(0, middle), people[index], ...rest.slice(middle)]
}

function splitLabel(label: string) {
  const [first, ...rest] = label.trim().split(/\s+/)
  if (rest.length && TITLES.includes(first)) return { title: first, name: rest.join(" ") }
  return { title: "", name: label.trim() }
}
