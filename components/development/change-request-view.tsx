'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronLeft, Download, FilePlus2, ImagePlus, PenLine, Save, Search, Stamp, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { useSecretToggle } from '@/hooks/use-secret-toggle'
import { PAGE_SHELL, PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { getJsonAuthHeaders, getSession } from '@/lib/auth-client'
import { formatDotDate } from '@/lib/date-utils'
import {
  CONTENT_OPTIONS,
  HANDLING_OPTIONS,
  REASON_OPTIONS,
  SUBMISSIONS,
  TARGET_OPTIONS,
  emptyChangeRequest,
  type ChangeRequest,
  type StampKey,
  type SubmissionKey,
  type SubmissionValue,
} from '@/lib/change-request'
import { chosungSearch } from '@/lib/korean'
import { cn } from '@/lib/utils'

const API = '/api/development/change-requests'

function savedAt(value: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}.${m}.${d} ${h}:${min}`
}

type ApprovalStatus = 'writing' | 'waiting' | 'in_progress' | 'done'

function hasStampSign(row: ChangeRequest, key: StampKey) {
  return Boolean(row.signs?.[key]?.trim())
}

/** 입안·심의·결정·전결 칸의 서명 기준 (전결 모드는 입안 → 전결) */
function sideApprovalStage(row: ChangeRequest, side: 'our' | 'customer'): ApprovalStatus {
  const jeongyeol = side === 'our' ? row.ourJeongyeol : row.customerJeongyeol
  const draft = side === 'our' ? 'ourDraft' : 'customerDraft'
  const review = side === 'our' ? 'ourReview' : 'customerReview'
  const decision = side === 'our' ? 'ourDecision' : 'customerDecision'
  const final = side === 'our' ? 'ourFinal' : 'customerFinal'

  if (jeongyeol) {
    if (hasStampSign(row, final)) return 'done'
    if (hasStampSign(row, draft)) return 'waiting'
    return 'writing'
  }
  if (hasStampSign(row, decision)) return 'done'
  if (hasStampSign(row, review)) return 'in_progress'
  if (hasStampSign(row, draft)) return 'waiting'
  return 'writing'
}

const APPROVAL_RANK: Record<ApprovalStatus, number> = {
  writing: 0,
  waiting: 1,
  in_progress: 2,
  done: 3,
}

function approvalStatus(row: ChangeRequest): ApprovalStatus {
  const our = sideApprovalStage(row, 'our')
  const customer = sideApprovalStage(row, 'customer')
  return APPROVAL_RANK[our] >= APPROVAL_RANK[customer] ? our : customer
}

const APPROVAL_BADGE: Record<ApprovalStatus, { label: string; className: string }> = {
  writing: {
    label: '작성 중',
    className: 'bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-300 dark:ring-zinc-600/45',
  },
  waiting: {
    label: '결재 대기',
    className: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-600/45',
  },
  in_progress: {
    label: '결재 진행',
    className: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-500/35',
  },
  done: {
    label: '결재 완료',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200 dark:ring-emerald-500/35',
  },
}

function currentRow(form: ChangeRequest, beforeFiles: string[] | null, afterFiles: string[] | null): ChangeRequest {
  return { ...form, beforeFiles: beforeFiles ?? form.beforeFiles, afterFiles: afterFiles ?? form.afterFiles }
}

export function ChangeRequestView() {
  const { user } = useAuth()
  const canManage = user?.role === 'admin'
  const [form, setForm] = useState<ChangeRequest>(() => emptyChangeRequest())
  const [saved, setSaved] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fileKey, setFileKey] = useState(0)
  const [beforeFiles, setBeforeFiles] = useState<string[] | null>(null)
  const [afterFiles, setAfterFiles] = useState<string[] | null>(null)
  const [beforeBlobs, setBeforeBlobs] = useState<File[] | null>(null)
  const [afterBlobs, setAfterBlobs] = useState<File[] | null>(null)
  const [mode, setMode] = useState<'write' | 'history'>('history')
  const [query, setQuery] = useState('')
  const [listUnlocked] = useSecretToggle()

  useEffect(() => {
    fetch(API, { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => setSaved(Array.isArray(result.data) ? result.data : []))
      .catch(() => toast.error('변경요청을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const patch = (partial: Partial<ChangeRequest>) => {
    setForm((current) => ({ ...current, ...partial }))
  }

  const toggle = (key: 'reasons' | 'targets' | 'contents' | 'handling', value: string) => {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
    }))
  }

  const setSubmission = (key: SubmissionKey, value: SubmissionValue) => {
    setForm((current) => ({
      ...current,
      submissions: { ...current.submissions, [key]: current.submissions[key] === value ? '' : value },
    }))
  }

  const applyRow = (row: ChangeRequest) => {
    setForm({ ...emptyChangeRequest(), ...row, signs: { ...row.signs }, submissions: { ...emptyChangeRequest().submissions, ...row.submissions } })
    setBeforeFiles(null)
    setAfterFiles(null)
    setBeforeBlobs(null)
    setAfterBlobs(null)
    setFileKey((key) => key + 1)
  }

  const resetForm = () => {
    const filled = form.docNo || form.title || form.reason || form.before || form.after || form.reasons.length || form.contents.length
    if (filled && !window.confirm('작성 중인 내용을 지우고 새로 작성할까요?')) return false
    applyRow(emptyChangeRequest())
    return true
  }

  const goToList = () => {
    applyRow(emptyChangeRequest())
    setMode('history')
  }

  /** 목록에서 작성: 확인 없이 새 양식. 작성 화면에서 작성: 입력 중이면 확인 */
  const startNewWrite = () => {
    if (mode === 'history') {
      applyRow(emptyChangeRequest())
      setMode('write')
      return
    }
    if (!resetForm()) return
    setMode('write')
  }

  const save = async () => {
    if (!canManage) return
    const session = getSession()
    if (!session) return
    setSaving(true)
    const row = currentRow(form, beforeFiles, afterFiles)
    try {
      const files = await encodeAttachments(beforeBlobs, afterBlobs)
      const response = await fetch(API, {
        method: 'PUT',
        headers: getJsonAuthHeaders(session),
        body: JSON.stringify({ row, files, detail: `4M 변경요청 저장 · ${row.docNo || row.title || '제목 없음'}` }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.data) {
        toast.error(result?.error || '저장하지 못했습니다.')
        return
      }
      const next = result.data as ChangeRequest
      setSaved((current) => [next, ...current.filter((item) => item.id !== next.id)])
      applyRow(next)
      toast.success('저장했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const openHistory = (row: ChangeRequest) => {
    applyRow(row)
    setMode('write')
  }

  const remove = async (row: ChangeRequest) => {
    if (!canManage) return
    if (!window.confirm(`‘${row.docNo || row.title || '이 변경요청'}’을 삭제할까요?`)) return
    const session = getSession()
    if (!session) return
    const response = await fetch(API, {
      method: 'DELETE',
      headers: getJsonAuthHeaders(session),
      body: JSON.stringify({ id: row.id }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => null)
      toast.error(result?.error || '삭제하지 못했습니다.')
      return
    }
    setSaved((current) => current.filter((item) => item.id !== row.id))
    if (form.id === row.id) applyRow(emptyChangeRequest())
    toast.success('삭제했습니다.')
  }

  const exportExcel = async () => {
    const row = currentRow(form, beforeFiles, afterFiles)
    let files: Awaited<ReturnType<typeof encodeAttachments>>
    try {
      files = await encodeAttachments(beforeBlobs, afterBlobs)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '첨부파일을 읽지 못했습니다.')
      return
    }
    const response = await fetch(`${API}/excel`, {
      method: 'POST',
      headers: getJsonAuthHeaders(),
      body: JSON.stringify({ row, files }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => null)
      toast.error(result?.error || '엑셀을 만들지 못했습니다.')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const encodedName = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1]
    link.href = url
    link.download = encodedName ? decodeURIComponent(encodedName) : `4M_변경요청서_${new Date().toISOString().slice(0, 10)}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  const beforeNames = beforeFiles ?? form.beforeFiles
  const afterNames = afterFiles ?? form.afterFiles
  const canSignStamp = (key: StampKey) => {
    const ourLine: StampKey[] = ['ourDraft', 'ourReview', 'ourDecision']
    const customerLine: StampKey[] = ['customerDraft', 'customerReview', 'customerDecision']
    if (key === 'ourFinal') return form.ourJeongyeol
    if (key === 'customerFinal') return form.customerJeongyeol
    if (ourLine.includes(key)) {
      if (!form.ourJeongyeol) return true
      return key === 'ourDraft'
    }
    if (customerLine.includes(key)) {
      if (!form.customerJeongyeol) return true
      return key === 'customerDraft'
    }
    return false
  }

  const sign = (key: StampKey) => {
    if (!canSignStamp(key)) return
    const next = { ...form.signs }
    if (next[key]) {
      delete next[key]
      patch({ signs: next, [key]: '' })
      return
    }
    if (!user?.hasSignature || !user.id) {
      toast.error('오른쪽 위 내 정보에서 서명 그림을 먼저 올려 주세요.')
      return
    }
    const name = user.displayName?.trim() || ''
    patch({ signs: { ...next, [key]: user.id }, [key]: name })
  }

  const setJeongyeol = (side: 'our' | 'customer', enabled: boolean) => {
    const signs = { ...form.signs }
    const strip = side === 'our'
      ? (['ourReview', 'ourDecision', 'ourFinal'] as StampKey[])
      : (['customerReview', 'customerDecision', 'customerFinal'] as StampKey[])
    if (enabled) {
      for (const key of side === 'our' ? (['ourReview', 'ourDecision'] as StampKey[]) : (['customerReview', 'customerDecision'] as StampKey[])) {
        delete signs[key]
      }
    } else {
      for (const key of strip) delete signs[key]
    }
    patch(
      side === 'our'
        ? { ourJeongyeol: enabled, signs }
        : { customerJeongyeol: enabled, signs },
    )
  }
  const approvals = [
    form.ourDraft,
    form.ourReview,
    form.ourDecision,
    form.ourFinal,
    form.customerDraft,
    form.customerReview,
    form.customerDecision,
    form.customerFinal,
    ...Object.values(form.signs ?? {}),
  ]
  const progress = [
    { id: 'cr-approval', label: '결재', done: approvals.some(Boolean) },
    { id: 'cr-basic', label: '기본정보', done: Boolean(form.title) },
    { id: 'cr-reason', label: '변경사유', done: form.reasons.length > 0 || Boolean(form.reason) },
    { id: 'cr-target', label: '변경대상', done: form.targets.length > 0 },
    { id: 'cr-content', label: '변경내용', done: form.contents.length > 0 },
    { id: 'cr-submission', label: '제출물', done: SUBMISSIONS.some((item) => form.submissions[item]) },
    { id: 'cr-apply', label: '적용정보', done: Boolean(form.applyDate || form.applyTarget || form.owner || form.handling.length) },
    { id: 'cr-compare', label: '변경 전 · 후', done: Boolean(form.before && form.after) },
  ]
  const doneCount = progress.filter((item) => item.done).length
  const history = [...saved]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .filter((row) => !query.trim() || [row.docNo, row.title, row.customerName, row.company, row.reason, ...(row.reasons ?? [])].some((value) => chosungSearch(value || '', query.trim())))
  const visibleHistory = listUnlocked ? history : []

  return (
    <main className={PAGE_SHELL}>
      <PageHeader
        tone="green"
        icon={FilePlus2}
        eyebrow="QUALITY · 품질관리"
        title="변경점관리 (4M)"
        description="변경요청서를 작성·저장하고 변경점신고서 엑셀로 출력합니다."
        stat={mode === 'history'
          ? { label: '저장', value: listUnlocked ? String(saved.length) : '—', unit: '건' }
          : { label: '작성', value: `${doneCount}/${progress.length}`, sub: form.docNo || '관리번호 없음' }}
      />

      {mode === 'history' ? (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight">작성 목록</h2>
              <p className="mt-1 text-sm text-muted-foreground">최근 저장 순입니다. 행을 누르면 불러와 수정할 수 있습니다.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <label className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="관리번호, 제목, 고객사 검색" className="bg-background pl-9" />
              </label>
              <Button type="button" onClick={startNewWrite}>
                <PenLine />작성
              </Button>
            </div>
          </div>
          {loading && listUnlocked ? (
            <p className="px-5 py-16 text-center text-sm text-muted-foreground">불러오는 중…</p>
          ) : !listUnlocked || visibleHistory.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {listUnlocked
                  ? saved.length === 0
                    ? '작성한 변경요청이 없습니다.'
                    : '검색 결과가 없습니다.'
                  : '표시할 항목이 없습니다.'}
              </p>
              {(listUnlocked ? saved.length === 0 : true) && (
                <Button type="button" className="mt-4" onClick={startNewWrite}><PenLine />작성</Button>
              )}
            </div>
          ) : (
            <Table className="min-w-[920px] table-fixed">
              <colgroup>
                <col className="w-[100px]" />
                <col className="w-[120px]" />
                <col />
                <col className="w-[136px]" />
                <col className="w-[112px]" />
                <col className="w-[156px]" />
                <col className="w-[52px]" />
              </colgroup>
              <TableHeader className="[&_th]:!text-[13px] [&_th]:!font-semibold [&_th]:text-foreground/90">
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="h-11 px-3 text-center">결재</TableHead>
                  <TableHead className="h-11 px-4 text-center">관리번호</TableHead>
                  <TableHead className="h-11 px-4 text-center">제목</TableHead>
                  <TableHead className="h-11 px-4 text-center">고객사</TableHead>
                  <TableHead className="h-11 px-4 text-center">적용일</TableHead>
                  <TableHead className="h-11 px-4 text-center">저장</TableHead>
                  <TableHead className="h-11 px-2 text-center" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleHistory.map((row) => {
                  const selected = row.id === form.id
                  const approval = APPROVAL_BADGE[approvalStatus(row)]
                  return (
                    <TableRow
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openHistory(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openHistory(row)
                        }
                      }}
                      className={cn(
                        'cursor-pointer',
                        selected && 'bg-emerald-50/80 hover:bg-emerald-50/80 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/10',
                      )}
                    >
                      <TableCell className="px-3 py-3 text-center align-middle text-sm">
                        <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', approval.className)}>
                          {approval.label}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center align-middle text-sm whitespace-normal">
                        <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5">
                          <span className="font-medium tabular-nums text-foreground">{row.docNo || '번호 없음'}</span>
                          {selected && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200">
                              편집 중
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center align-middle text-sm whitespace-normal">
                        <span className="line-clamp-2 font-normal leading-snug text-foreground/90">{row.title || '제목 없음'}</span>
                      </TableCell>
                      <TableCell className="truncate px-4 py-3 text-center align-middle text-sm text-muted-foreground">{row.customerName || '—'}</TableCell>
                      <TableCell className="px-4 py-3 text-center text-sm tabular-nums text-muted-foreground">{formatDotDate(row.applyDate)}</TableCell>
                      <TableCell className="px-4 py-3 text-center text-sm tabular-nums text-muted-foreground">{savedAt(row.updatedAt)}</TableCell>
                      <TableCell className="px-2 py-3 text-center">
                        {canManage && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="변경요청 삭제"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation()
                              void remove(row)
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </section>
      ) : (
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b bg-muted/25 px-4 py-2.5 sm:px-6">
            <Button type="button" variant="outline" size="sm" onClick={goToList} className="h-8 gap-1 bg-background shadow-sm">
              <ChevronLeft className="size-4" />
              목록
            </Button>
          </div>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">변경요청서</h2>
              <p className="text-xs text-muted-foreground">Engineering Change Request</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <label className="flex min-w-[9.5rem] flex-1 items-center gap-2 whitespace-nowrap text-xs font-semibold text-muted-foreground sm:max-w-[11rem] sm:flex-none">
                관리번호
                <Input value={form.docNo} placeholder="관리번호" onChange={(event) => patch({ docNo: event.target.value })} />
              </label>
              <label className="flex min-w-[11rem] flex-1 items-center gap-2 whitespace-nowrap text-xs font-semibold text-muted-foreground sm:max-w-[14rem] sm:flex-none">
                고객사
                <Input value={form.customerName} placeholder="고객사명" onChange={(event) => patch({ customerName: event.target.value })} />
              </label>
            </div>
          </header>

          <Group id="cr-approval" title="결재">
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <StampBox
                title="우리하이피"
                jeongyeol={form.ourJeongyeol}
                onJeongyeolChange={(enabled) => setJeongyeol('our', enabled)}
                stampKeys={['ourDraft', 'ourReview', 'ourDecision', 'ourFinal']}
                values={[form.ourDraft, form.ourReview, form.ourDecision, form.ourFinal]}
                signs={form.signs}
                onChange={(index, value) =>
                  patch([{ ourDraft: value }, { ourReview: value }, { ourDecision: value }, { ourFinal: value }][index])
                }
                canSign={canSignStamp}
                onSign={sign}
              />
              <StampBox
                title={<input value={form.customerName} placeholder="고객사명" onChange={(event) => patch({ customerName: event.target.value })} className="w-full bg-transparent font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground" />}
                jeongyeol={form.customerJeongyeol}
                onJeongyeolChange={(enabled) => setJeongyeol('customer', enabled)}
                stampKeys={['customerDraft', 'customerReview', 'customerDecision', 'customerFinal']}
                values={[form.customerDraft, form.customerReview, form.customerDecision, form.customerFinal]}
                signs={form.signs}
                onChange={(index, value) =>
                  patch(
                    [{ customerDraft: value }, { customerReview: value }, { customerDecision: value }, { customerFinal: value }][index],
                  )
                }
                canSign={canSignStamp}
                onSign={sign}
              />
            </div>
          </Group>

          <Group id="cr-basic" title="기본정보">
            <Row label="제목"><Input value={form.title} placeholder="변경요청 제목" onChange={(event) => patch({ title: event.target.value })} /></Row>
            <Row label="협력사">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input aria-label="업체명" value={form.company} placeholder="업체명" onChange={(event) => patch({ company: event.target.value })} />
                <Input aria-label="품질 담당" value={form.qualityOwner} placeholder="품질 담당" onChange={(event) => patch({ qualityOwner: event.target.value })} />
                <Input aria-label="연락처" value={form.phone} placeholder="연락처" onChange={(event) => patch({ phone: event.target.value })} />
              </div>
            </Row>
          </Group>

          <Group id="cr-reason" title="변경사유">
            <Row label="구분"><Checks options={REASON_OPTIONS} value={form.reasons} onToggle={(value) => toggle('reasons', value)} /></Row>
            <Row label="사유"><Textarea value={form.reason} placeholder="변경 사유를 입력하세요." onChange={(event) => patch({ reason: event.target.value })} /></Row>
          </Group>

          <Group id="cr-target" title="변경대상">
            <Row label="대상"><Checks options={TARGET_OPTIONS} value={form.targets} onToggle={(value) => toggle('targets', value)} /></Row>
          </Group>

          <Group id="cr-content" title="변경내용">
            <Row label="금형 · 설비"><Checks options={CONTENT_OPTIONS.slice(0, 6)} value={form.contents} onToggle={(value) => toggle('contents', value)} /></Row>
            <Row label="공정 · 인력"><Checks options={CONTENT_OPTIONS.slice(6)} value={form.contents} onToggle={(value) => toggle('contents', value)} /></Row>
          </Group>

          <Group id="cr-submission" title="제출물">
            <div className="grid grid-cols-2 divide-x divide-y border-b sm:grid-cols-5 sm:divide-y-0">
              {SUBMISSIONS.map((item) => (
                <div key={item} className="flex flex-col items-center gap-2 px-3 py-4">
                  <span className="text-xs font-semibold">{item}</span>
                  <div className="inline-flex rounded-lg border p-0.5">
                    <Yn label="유" pressed={form.submissions[item] === '유'} onClick={() => setSubmission(item, '유')} />
                    <Yn label="무" pressed={form.submissions[item] === '무'} onClick={() => setSubmission(item, '무')} />
                  </div>
                </div>
              ))}
            </div>
          </Group>

          <Group id="cr-apply" title="적용정보">
            <div className="grid 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
              <Row label="적용제품"><Input value={form.product} onChange={(event) => patch({ product: event.target.value })} /></Row>
              <Row label="변경 적용일자"><Input type="date" className="max-w-52" value={form.applyDate} onChange={(event) => patch({ applyDate: event.target.value })} /></Row>
              <Row label="적용대상"><Input value={form.applyTarget} onChange={(event) => patch({ applyTarget: event.target.value })} /></Row>
              <Row label="변경구분 방법"><Input value={form.changeMethod} onChange={(event) => patch({ changeMethod: event.target.value })} /></Row>
              <Row label="담당자"><Input value={form.owner} onChange={(event) => patch({ owner: event.target.value })} /></Row>
              <Row label="변경 처리 방안"><Checks nowrap options={HANDLING_OPTIONS} value={form.handling} onToggle={(value) => toggle('handling', value)} /></Row>
            </div>
          </Group>

          <Group id="cr-compare" title="변경 전 · 변경 후" last>
            <div className="grid md:grid-cols-2 md:divide-x">
              <div className="p-5">
                <p className="mb-2 text-sm font-semibold text-muted-foreground">변경 전</p>
                <Textarea className="min-h-44" value={form.before} placeholder="변경 전 내용을 입력하세요." onChange={(event) => patch({ before: event.target.value })} />
                <FileNames inputKey={`before-${fileKey}`} names={beforeNames} onPick={(files) => { const photos = photoFiles(files); setBeforeBlobs(photos); setBeforeFiles(photos.map((file) => file.name)) }} />
              </div>
              <div className="bg-emerald-50/40 p-5 dark:bg-emerald-400/5">
                <p className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">변경 후</p>
                <Textarea className="min-h-44 bg-background" value={form.after} placeholder="변경 후 내용을 입력하세요." onChange={(event) => patch({ after: event.target.value })} />
                <FileNames inputKey={`after-${fileKey}`} names={afterNames} onPick={(files) => { const photos = photoFiles(files); setAfterBlobs(photos); setAfterFiles(photos.map((file) => file.name)) }} />
              </div>
            </div>
          </Group>
        </article>

        <aside className="no-print order-first space-y-4 lg:sticky lg:top-4 lg:order-none">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <Button type="button" className="h-10 w-full" onClick={save} disabled={!canManage || saving}><Save />{saving ? '저장 중…' : '저장'}</Button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={startNewWrite}><PenLine />작성</Button>
              <Button type="button" variant="outline" onClick={exportExcel}><Download />엑셀</Button>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">작성 현황</p>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">{doneCount} / {progress.length}</span>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / progress.length) * 100}%` }} />
            </div>
            <ul className="space-y-0.5">
              {progress.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className={cn('flex size-4 items-center justify-center rounded-full border text-[10px]', item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40')}>
                      {item.done && <Check className="size-3" />}
                    </span>
                    <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      )}
    </main>
  )
}

function Group({ id, title, last, children }: { id: string; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={cn('scroll-mt-4', !last && 'border-b')}>
      <h3
        className={cn(
          'border-b bg-muted/40 px-6 font-bold tracking-wide text-muted-foreground',
          title === '결재' ? 'py-3 text-base text-foreground/90' : 'py-2 text-xs',
        )}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid border-b last:border-b-0 sm:grid-cols-[128px_minmax(0,1fr)]">
      <div className="flex items-center whitespace-nowrap px-6 pt-3 text-xs font-semibold text-muted-foreground sm:py-3">{label}</div>
      <div className="px-6 py-3 sm:pl-0">{children}</div>
    </div>
  )
}

const STAMP_LABELS = ['입안', '심의', '결정', '전결'] as const

function JeongyeolToggle({ active, onChange }: { active: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label="전결 처리"
      title="전결 시 입안·전결 칸만 서명합니다"
      onClick={() => onChange(!active)}
      className={cn(
        'group relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide transition-all duration-200',
        active
          ? 'border-blue-500/40 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 text-white shadow-[0_4px_14px_-2px_rgba(37,99,235,0.55)] ring-2 ring-blue-400/35'
          : 'border-slate-200/90 bg-gradient-to-b from-white to-slate-50 text-slate-600 shadow-sm hover:border-blue-300 hover:from-blue-50 hover:to-white hover:text-blue-700 dark:border-border dark:from-muted/40 dark:to-muted/20 dark:text-slate-200 dark:hover:border-blue-500/40 dark:hover:from-blue-950/40',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.22)_50%,transparent_60%)] opacity-80"
        />
      )}
      <Stamp
        className={cn(
          'relative size-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110',
          active ? 'text-blue-100 drop-shadow-sm' : 'text-slate-400 group-hover:text-blue-500',
        )}
      />
      <span className="relative">전결</span>
      <span
        className={cn(
          'relative rounded-full px-1.5 py-px text-[9px] font-extrabold uppercase leading-none tracking-wider',
          active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500 dark:bg-muted dark:text-slate-400',
        )}
      >
        {active ? '적용' : 'OFF'}
      </span>
    </button>
  )
}

function StampSignCell({
  stamp,
  stampKey,
  signId,
  signable,
  highlight,
  onSign,
}: {
  stamp: string
  stampKey: StampKey
  signId?: string
  signable: boolean
  highlight?: boolean
  onSign: (key: StampKey) => void
}) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          'border-b py-1 text-center text-[11px] font-semibold',
          highlight
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 font-bold text-white'
            : 'text-muted-foreground',
        )}
      >
        {stamp}
      </span>
      <div className="p-1.5">
        {!signable ? (
          <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-transparent bg-muted/20 text-[11px] text-muted-foreground">
            서명 없음
          </div>
        ) : signId ? (
          <div className="group relative flex h-20 items-center justify-center rounded-md border border-emerald-300 bg-white dark:border-emerald-400/40">
            <img src={`/api/auth/signature?userId=${encodeURIComponent(signId)}`} alt={`${stamp} 서명`} className="max-h-16 max-w-[90%] object-contain" />
            <button
              type="button"
              onClick={() => onSign(stampKey)}
              aria-label={`${stamp} 서명 해제`}
              title="서명 해제"
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSign(stampKey)}
            className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground transition-colors hover:border-emerald-400 hover:bg-emerald-50/60 hover:text-emerald-700 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300"
          >
            <PenLine className="size-4" />
            <span className="text-xs font-medium">서명하기</span>
          </button>
        )}
      </div>
    </div>
  )
}

function StampBox({
  title,
  jeongyeol,
  onJeongyeolChange,
  stampKeys,
  values,
  signs,
  onChange,
  canSign,
  onSign,
}: {
  title: React.ReactNode
  jeongyeol: boolean
  onJeongyeolChange: (enabled: boolean) => void
  stampKeys: [StampKey, StampKey, StampKey, StampKey]
  values: string[]
  signs?: Partial<Record<StampKey, string>>
  onChange: (index: number, value: string) => void
  canSign: (key: StampKey) => boolean
  onSign: (key: StampKey) => void
}) {
  return (
    <div
      className={cn(
        'min-w-[17rem] overflow-hidden rounded-lg border transition-shadow duration-200',
        jeongyeol && 'border-blue-300/80 shadow-md shadow-blue-500/10 ring-1 ring-blue-400/20 dark:border-blue-500/35',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b px-3 py-2',
          jeongyeol ? 'bg-gradient-to-r from-blue-50/90 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/20' : 'bg-muted/40',
        )}
      >
        <div className="min-w-0 text-sm font-semibold">{title}</div>
        <JeongyeolToggle active={jeongyeol} onChange={onJeongyeolChange} />
      </div>
      <div className="grid grid-cols-4 divide-x">
        {STAMP_LABELS.map((stamp, index) => {
          const key = stampKeys[index]
          const isFinal = index === 3
          const finalActive = isFinal && jeongyeol
          return (
            <div
              key={stamp}
              className={cn(
                finalActive && 'bg-blue-50/60 ring-1 ring-inset ring-blue-200/80 dark:bg-blue-950/25 dark:ring-blue-500/25',
                jeongyeol && !isFinal && index > 0 && index < 3 && 'bg-muted/15 opacity-90',
              )}
            >
              <StampSignCell
                stamp={stamp}
                stampKey={key}
                signId={signs?.[key]}
                signable={canSign(key)}
                highlight={finalActive}
                onSign={onSign}
              />
              <input
                aria-label={stamp}
                value={values[index]}
                placeholder={isFinal ? '전결자' : '이름'}
                onChange={(event) => onChange(index, event.target.value)}
                className={cn(
                  'h-8 w-full border-t bg-transparent px-1 text-center text-sm outline-none placeholder:text-muted-foreground/60',
                  finalActive
                    ? 'border-blue-200/80 bg-blue-50/50 font-semibold text-blue-950 focus:bg-blue-100/80 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-100'
                    : 'focus:bg-emerald-50/60 dark:focus:bg-emerald-400/10',
                )}
              />
            </div>
          )
        })}
      </div>
      {jeongyeol && (
        <p className="border-t bg-blue-50/50 px-3 py-1.5 text-center text-[10px] font-medium text-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
          전결 · 입안과 전결 칸만 서명
        </p>
      )}
    </div>
  )
}

function Checks({ options, value, onToggle, nowrap = false }: { options: readonly string[]; value: string[]; onToggle: (value: string) => void; nowrap?: boolean }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', nowrap && 'sm:flex-nowrap')}>
      {options.map((option) => {
        const selected = value.includes(option)
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(option)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
              nowrap && 'shrink-0 whitespace-nowrap px-2',
              selected
                ? 'border-emerald-600 bg-emerald-600 font-medium text-white dark:border-emerald-500 dark:bg-emerald-500'
                : 'border-border bg-background hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-400/10',
            )}
          >
            {selected && <Check className="size-3.5" />}
            {option}
          </button>
        )
      })}
    </div>
  )
}

function Yn({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn('w-10 rounded-md py-1 text-sm', pressed ? 'bg-emerald-600 font-semibold text-white dark:bg-emerald-500' : 'text-muted-foreground hover:bg-muted')}
    >
      {label}
    </button>
  )
}

function readBase64(file: File) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
    }
    return btoa(binary)
  })
}

async function encodeAttachments(before: File[] | null, after: File[] | null) {
  const selected = [
    ...(before ?? []).slice(0, 20).map((file) => ({ side: 'before' as const, file })),
    ...(after ?? []).slice(0, 20).map((file) => ({ side: 'after' as const, file })),
  ]
  const tooBig = selected.find((item) => item.file.size > 8 * 1024 * 1024)
  if (tooBig) throw new Error(`${tooBig.file.name}은 8MB를 넘습니다.`)
  const notPhoto = selected.find((item) => !/\.(png|jpe?g|gif|webp)$/i.test(item.file.name))
  if (notPhoto) throw new Error('png, jpg 사진만 첨부할 수 있습니다.')
  return Promise.all(selected.map(async (item) => ({
    side: item.side,
    name: item.file.name.slice(0, 120),
    data: await readBase64(item.file),
  })))
}

function photoFiles(files: File[]) {
  const photos = files.filter((file) => /\.(png|jpe?g|gif|webp)$/i.test(file.name)).slice(0, 20)
  if (photos.length !== files.length) toast.error('png, jpg 사진만 첨부할 수 있습니다.')
  return photos
}

function FileNames({ inputKey, names, onPick }: { inputKey: string; names: string[]; onPick: (files: File[]) => void }) {
  return (
    <div className="mt-3 space-y-2">
      <label className="relative flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed bg-background px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-emerald-400 hover:bg-emerald-50/70 hover:text-emerald-700 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300">
        <ImagePlus className="size-4" />
        {names.length > 0 ? `첨부 다시 선택 (${names.length})` : '사진·파일 첨부'}
        <input
          key={inputKey}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => onPick([...(event.target.files ?? [])].slice(0, 20))}
        />
      </label>
      {names.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {names.map((name) => (
            <li key={name} className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs">{name}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">png, jpg 사진을 올리면 엑셀 변경 전·후 칸에 들어갑니다.</p>
      )}
    </div>
  )
}
