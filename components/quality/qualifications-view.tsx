'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlarmClock,
  Award,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileOutput,
  Filter,
  ImagePlus,
  List,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { QUALIFICATION_ID_PHOTO_PLACEHOLDER_URL } from '@/lib/qualification-id-photo-placeholder'
import { useAuth } from '@/components/auth/auth-context'
import { PAGE_SHELL_RELATIVE, PageHeader } from '@/components/shared/page-header'
import { RecognitionCertificateDraft } from '@/components/quality/recognition-certificate-draft'
import { SuitabilitySheet } from '@/components/quality/suitability-sheet'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import {
  allocateNextQualificationCertNo,
  createQualificationLedgerRowDraft,
  deriveQualificationStatus,
  displayIsoDate,
  filterQualificationLedger,
  ledgerRenewalYears,
  mergeQualificationLedgerDepartments,
  qualificationLedgerBadgeClass,
  renewalCellText,
  QUALIFICATION_LEDGER_NAMES,
  sortQualificationLedger,
  summarizeQualificationLedger,
  updateQualificationLedgerRow,
  type QualificationLedgerRow,
} from '@/lib/qualification-ledger'
import { JOB_TITLES_MENU } from '@/lib/user-job-titles'
import { cn } from '@/lib/utils'

const LEDGER_ALL = 'all'

type LedgerFilters = {
  year: string
  qualification: string
  department: string
  rank: string
  status: string
  name: string
}

const LEDGER_STATUS_OPTIONS = [
  { value: LEDGER_ALL, label: '전체' },
  { value: 'valid', label: '정상' },
  { value: 'expiring', label: '갱신예정' },
  { value: 'expired', label: '만료' },
  { value: 'cancelled', label: '취소' },
] as const

function daysUntilIso(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${iso}T00:00:00`)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function renewalScheduleLabel(iso: string) {
  const d = daysUntilIso(iso)
  if (d == null) return '일정 미정'
  if (d < 0) return `만료 ${Math.abs(d)}일 경과`
  if (d === 0) return '오늘 만료'
  if (d === 1) return '만료 1일 전'
  return `만료 ${d}일 전`
}

function withSelectedFilterOption(options: string[], selected: string) {
  if (selected === LEDGER_ALL || !selected.trim()) return options
  return options.includes(selected) ? options : [selected, ...options]
}

function defaultLedgerFilters(): LedgerFilters {
  return {
    year: LEDGER_ALL,
    qualification: LEDGER_ALL,
    department: LEDGER_ALL,
    rank: LEDGER_ALL,
    status: LEDGER_ALL,
    name: '',
  }
}

function ledgerYearOptions() {
  const y = new Date().getFullYear()
  return [y, y - 1, y - 2, y - 3]
}

function countLedgerActiveFilters(filters: LedgerFilters) {
  let n = 0
  if (filters.year !== LEDGER_ALL) n += 1
  if (filters.qualification !== LEDGER_ALL) n += 1
  if (filters.department !== LEDGER_ALL) n += 1
  if (filters.rank !== LEDGER_ALL) n += 1
  if (filters.status !== LEDGER_ALL) n += 1
  if (filters.name.trim()) n += 1
  return n
}

const TAB_KEYS = [
  'ledger',
  'suitability',
  'recognition',
  'internal-audit',
  'inspector',
  'renewal',
  'print',
] as const

type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABELS: Record<TabKey, string> = {
  ledger: '자격인증대장',
  suitability: '적격성평가서',
  recognition: '자격인정서',
  'internal-audit': '내부심사원 평가',
  inspector: '검사원 평가',
  renewal: '갱신·취소관리',
  print: '출력',
}

const TAB_HINTS: Record<TabKey, string> = {
  ledger: '직원·공정별 자격·인증 보유 현황을 한눈에 조회·등록합니다.',
  suitability: '적격성 평가서 작성·승인 이력을 관리합니다.',
  recognition: '자격 인정서 발급·보관 및 유효기간을 관리합니다.',
  'internal-audit': '내부심사원 자격 평가·교육 이수 기록을 관리합니다.',
  inspector: '검사원 자격·실기 평가 결과를 관리합니다.',
  renewal: '갱신·취소·만료 예정 알림과 처리 이력을 관리합니다.',
  print: '대장·평가서·인정서 등 양식을 선택해 일괄 출력합니다.',
}

function isTabKey(value: string | null): value is TabKey {
  return value != null && (TAB_KEYS as readonly string[]).includes(value)
}

export function QualificationsView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [tab, setTabState] = useState<TabKey>(isTabKey(tabParam) ? tabParam : 'ledger')

  useEffect(() => {
    if (isTabKey(tabParam)) setTabState(tabParam)
  }, [tabParam])

  const setTab = (key: TabKey) => {
    setTabState(key)
    router.replace(`/quality/qualifications?tab=${key}`, { scroll: false })
  }

  const activeHint = TAB_HINTS[tab]

  const tabButtons = useMemo(
    () => TAB_KEYS.map((key) => ({ key, label: TAB_LABELS[key] })),
    [],
  )

  return (
    <main className={PAGE_SHELL_RELATIVE}>
      <PageHeader
        tone="green"
        icon={Award}
        eyebrow="QUALITY · 품질관리"
        title="자격인증 관리"
        description="자격·인증 대장, 적격성·심사원·검사원 평가, 갱신·취소 및 양식 출력을 한곳에서 관리합니다."
      />

      <nav
        className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px"
        aria-label="자격인증 관리 메뉴"
      >
        {tabButtons.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
              tab === key
                ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'ledger' ? (
        <QualificationLedgerTab />
      ) : tab === 'suitability' ? (
        <SuitabilitySheet />
      ) : tab === 'recognition' ? (
        <RecognitionCertificateDraft />
      ) : (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{TAB_LABELS[tab]}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{activeHint}</p>
            </div>
            {tab === 'print' && (
              <Button type="button" variant="secondary" size="sm" disabled className="shrink-0">
                <Printer className="mr-1.5 h-4 w-4" />
                출력 미리보기
              </Button>
            )}
          </header>
          <QualificationTabBody tab={tab} />
        </section>
      )}
    </main>
  )
}

function QualificationTabBody({ tab }: { tab: TabKey }) {
  if (tab === 'print') {
    return (
      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/15 px-6 py-12 text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <FileOutput className="size-6 opacity-70" />
        </span>
        <p className="text-sm font-medium text-foreground/85">출력할 양식과 대상을 선택하는 화면입니다.</p>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          자격인증대장, 적격성평가서, 자격인정서, 평가 기록 등을 탭별로 PDF·인쇄할 수 있도록 준비 중입니다.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 bg-muted/15 px-6 py-14 text-center">
      <p className="text-sm font-medium text-foreground/85">{TAB_LABELS[tab]} — 등록된 데이터가 없습니다.</p>
      <p className="mt-2 max-w-sm text-xs text-muted-foreground">
        목록·등록·수정 기능은 이 탭에 순차적으로 연결됩니다.
      </p>
    </div>
  )
}

const LEDGER_TABLE_BORDER = 'border-slate-200 dark:border-slate-600'
const LEDGER_TH = cn(
  'border border-slate-200 px-2 py-2 text-center align-middle text-xs font-semibold leading-snug text-slate-600 dark:border-slate-600',
  'bg-slate-100 dark:bg-muted/80 dark:text-slate-300',
)
const LEDGER_TD = cn('px-2 py-2.5 text-center align-middle text-sm text-slate-700 dark:text-slate-200')
const LEDGER_TD_NUM = cn(LEDGER_TD, 'tabular-nums')
const LEDGER_TABLE_CLASS = cn(
  'w-full min-w-[68rem] table-fixed border-collapse text-sm',
  'overflow-hidden rounded-xl border',
  LEDGER_TABLE_BORDER,
)
const LEDGER_ROW_WHITE = 'bg-white dark:bg-card'
const LEDGER_ROW_GRAY = 'bg-slate-50 dark:bg-muted/35'
const LEDGER_TH_PLANNED = cn(
  LEDGER_TH,
  'bg-blue-100 font-bold text-blue-800 dark:bg-blue-950/70 dark:text-blue-100',
)
const LEDGER_TD_PLANNED = cn(LEDGER_TD, 'font-medium text-blue-900 dark:text-blue-100')

type StatTileTone = 'rose' | 'green' | 'blue' | 'violet' | 'amber' | 'sky'

const STAT_TILE_ICON: Record<StatTileTone, string> = {
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
}

const STAT_TILE_VALUE: Record<StatTileTone, string> = {
  rose: 'text-rose-600 dark:text-rose-400',
  green: 'text-emerald-600 dark:text-emerald-400',
  blue: 'text-blue-600 dark:text-blue-400',
  violet: 'text-violet-600 dark:text-violet-400',
  amber: 'text-amber-600 dark:text-amber-400',
  sky: 'text-sky-600 dark:text-sky-400',
}

type LedgerRegisterForm = {
  qualification: string
  name: string
  department: string
  rank: string
  joinDate: string
  acquiredDate: string
  expiryDate: string
  idPhotoFileId: string
  /** 저장 시 MinIO 업로드용 data URL */
  idPhotoPending: string
  /** 미리보기 src (pending data URL 또는 /api/files/…) */
  idPhotoPreview: string
}

type QualificationLedgerSaveRow = QualificationLedgerRow & { idPhotoPending?: string }

type LedgerEditForm = LedgerRegisterForm & {
  certNo: string
  cancelDate: string
  cancelReason: string
}

function emptyLedgerRegisterForm(): LedgerRegisterForm {
  return {
    qualification: '',
    name: '',
    department: '',
    rank: '',
    joinDate: '',
    acquiredDate: '',
    expiryDate: '',
    idPhotoFileId: '',
    idPhotoPending: '',
    idPhotoPreview: '',
  }
}

async function compressIdPhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  const max = 480
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('사진을 처리하지 못했습니다.')
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.86)
}

/** Select는 value가 undefined면 비제어로 간주 — 등록 폼은 항상 이 값으로 제어 */
const LEDGER_REGISTER_SELECT_EMPTY = '__ledger_register_empty__'

function ledgerEditFormFromRow(row: QualificationLedgerRow): LedgerEditForm {
  return {
    certNo: row.certNo,
    qualification: row.qualification,
    name: row.name,
    department: row.department,
    rank: row.rank,
    joinDate: row.joinDate,
    acquiredDate: row.acquiredDate,
    expiryDate: row.expiryDate,
    cancelDate: row.cancelDate,
    cancelReason: row.cancelReason,
    idPhotoFileId: row.idPhotoFileId,
    idPhotoPending: '',
    idPhotoPreview: row.idPhotoFileId ? `/api/files/${row.idPhotoFileId}` : '',
  }
}

function QualificationLedgerRowFormFields({
  form,
  onPatch,
  ledgerDepartmentOptions,
  showCancelFields,
}: {
  form: LedgerRegisterForm | LedgerEditForm
  onPatch: (part: Partial<LedgerRegisterForm & LedgerEditForm>) => void
  ledgerDepartmentOptions: string[]
  showCancelFields?: boolean
}) {
  const cancelForm = showCancelFields ? (form as LedgerEditForm) : null
  const hasCustomIdPhoto = Boolean(form.idPhotoFileId || form.idPhotoPending)
  const idPhotoDisplaySrc = form.idPhotoPreview || QUALIFICATION_ID_PHOTO_PLACEHOLDER_URL

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-border dark:bg-card">
      <div className="h-1 bg-emerald-600" />
      <div className="flex items-start gap-6 px-5 pt-5 pb-4">
        <div className="flex w-28 shrink-0 flex-col items-center gap-1.5">
          <label className="group relative block w-full cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={idPhotoDisplaySrc}
              alt=""
              className={cn(
                'aspect-[3/4] w-full rounded-lg shadow-sm ring-1 ring-slate-200',
                hasCustomIdPhoto ? 'object-cover' : 'object-contain bg-white',
              )}
            />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                void compressIdPhoto(file)
                  .then((data) => onPatch({ idPhotoPending: data, idPhotoPreview: data }))
                  .catch(() => toast.error('증명사진을 읽지 못했습니다.'))
              }}
            />
          </label>
          {hasCustomIdPhoto ? (
            <button
              type="button"
              className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
              onClick={() => onPatch({ idPhotoFileId: '', idPhotoPending: '', idPhotoPreview: '' })}
            >
              사진 삭제
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">클릭해서 등록</span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ResumeField label="성명">
              <Input
                value={form.name}
                onChange={(event) => onPatch({ name: event.target.value })}
                className="h-10 bg-white text-base font-semibold"
                placeholder="홍길동"
              />
            </ResumeField>
            <ResumeField label="자격명">
              <Select
                value={form.qualification || LEDGER_REGISTER_SELECT_EMPTY}
                onValueChange={(value) =>
                  onPatch({
                    qualification: !value || value === LEDGER_REGISTER_SELECT_EMPTY ? '' : value,
                  })
                }
              >
                <SelectTrigger aria-label="자격명" className="h-10 w-full bg-white">
                  {form.qualification || '자격 선택'}
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={LEDGER_REGISTER_SELECT_EMPTY}>자격 선택</SelectItem>
                    {QUALIFICATION_LEDGER_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </ResumeField>
          </div>
          <div className={cn('grid gap-3', cancelForm ? 'grid-cols-3' : 'grid-cols-2')}>
            <ResumeField label="소속">
              <Select
                value={form.department || LEDGER_REGISTER_SELECT_EMPTY}
                onValueChange={(value) =>
                  onPatch({
                    department: !value || value === LEDGER_REGISTER_SELECT_EMPTY ? '' : value,
                  })
                }
              >
                <SelectTrigger aria-label="소속" className="h-10 w-full bg-white">
                  {form.department || '부서 선택'}
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={LEDGER_REGISTER_SELECT_EMPTY}>부서 선택</SelectItem>
                    {ledgerDepartmentOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </ResumeField>
            <ResumeField label="직위">
              <Select
                value={form.rank || LEDGER_REGISTER_SELECT_EMPTY}
                onValueChange={(value) =>
                  onPatch({
                    rank: !value || value === LEDGER_REGISTER_SELECT_EMPTY ? '' : value,
                  })
                }
              >
                <SelectTrigger aria-label="직위" className="h-10 w-full bg-white">
                  {form.rank || '직위 선택'}
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={LEDGER_REGISTER_SELECT_EMPTY}>직위 선택</SelectItem>
                    {JOB_TITLES_MENU.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </ResumeField>
            {cancelForm ? (
              <ResumeField label="인증번호">
                <Input
                  value={cancelForm.certNo}
                  onChange={(event) => onPatch({ certNo: event.target.value })}
                  className="h-10 bg-white font-medium tabular-nums"
                  placeholder="QA-00"
                  aria-label="인증번호"
                />
              </ResumeField>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-border dark:bg-muted/20">
        <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">재직 · 자격 일자</p>
        <div className="grid grid-cols-3 gap-3">
          <ResumeField label="입사일">
            <Input
              type="date"
              value={form.joinDate}
              onChange={(event) => onPatch({ joinDate: event.target.value })}
              className="h-10 bg-white tabular-nums"
            />
          </ResumeField>
          <ResumeField label="취득일">
            <Input
              type="date"
              value={form.acquiredDate}
              onChange={(event) => onPatch({ acquiredDate: event.target.value })}
              className="h-10 bg-white tabular-nums"
            />
          </ResumeField>
          <ResumeField label="만료일">
            <Input
              type="date"
              value={form.expiryDate}
              onChange={(event) => onPatch({ expiryDate: event.target.value })}
              className="h-10 bg-white tabular-nums"
            />
          </ResumeField>
        </div>
      </div>

      {cancelForm ? (
        <div className="border-t border-slate-100 px-5 py-4 dark:border-border">
          <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">인증 취소</p>
          <div className="grid grid-cols-[12rem_minmax(0,1fr)] gap-3">
            <ResumeField label="취소일자">
              <Input
                type="date"
                value={cancelForm.cancelDate}
                onChange={(event) => onPatch({ cancelDate: event.target.value })}
                className="h-10 bg-white tabular-nums"
              />
            </ResumeField>
            <ResumeField label="취소 사유">
              <Input
                value={cancelForm.cancelReason}
                onChange={(event) => onPatch({ cancelReason: event.target.value })}
                className="h-10 bg-white"
                placeholder="사유 입력"
              />
            </ResumeField>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ResumeField({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-[11px] font-medium text-slate-500">{label}</Label>
      {children}
    </div>
  )
}

function QualificationLedgerTab() {
  const { user } = useAuth()
  const canManage = user?.role === 'admin'
  const [filters, setFilters] = useState<LedgerFilters>(() => defaultLedgerFilters())
  const [rows, setRows] = useState<QualificationLedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerForm, setRegisterForm] = useState<LedgerRegisterForm>(() => emptyLedgerRegisterForm())
  const [editOpen, setEditOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<QualificationLedgerRow | null>(null)
  const [editForm, setEditForm] = useState<LedgerEditForm>(() => ({
    ...emptyLedgerRegisterForm(),
    certNo: '',
    cancelDate: '',
    cancelReason: '',
  }))
  const [organizationDepartments, setOrganizationDepartments] = useState<string[]>(() =>
    mergeQualificationLedgerDepartments([]),
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeCount = useMemo(() => countLedgerActiveFilters(filters), [filters])
  const years = useMemo(() => ledgerYearOptions(), [])

  const ledgerDepartmentOptions = useMemo(
    () => mergeQualificationLedgerDepartments(organizationDepartments),
    [organizationDepartments],
  )
  const departmentOptions = useMemo(
    () => withSelectedFilterOption(ledgerDepartmentOptions, filters.department),
    [ledgerDepartmentOptions, filters.department],
  )
  const jobTitleOptions = useMemo(
    () => withSelectedFilterOption([...JOB_TITLES_MENU], filters.rank),
    [filters.rank],
  )
  useEffect(() => {
    if (
      filters.qualification !== LEDGER_ALL &&
      !(QUALIFICATION_LEDGER_NAMES as readonly string[]).includes(filters.qualification)
    ) {
      setFilters((prev) => ({ ...prev, qualification: LEDGER_ALL }))
    }
  }, [filters.qualification])

  useEffect(() => {
    fetch('/api/organization', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        const list = Array.isArray(result.data?.departments) ? result.data.departments : []
        const names = list
          .map((department: { name?: string }) => (typeof department.name === 'string' ? department.name.trim() : ''))
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b, 'ko'))
        setOrganizationDepartments(mergeQualificationLedgerDepartments(names))
      })
      .catch(() => setOrganizationDepartments(mergeQualificationLedgerDepartments([])))
  }, [])

  useEffect(() => {
    fetch('/api/quality/qualifications', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (Array.isArray(result.data)) setRows(result.data)
        else setRows([])
      })
      .catch(() => toast.error('자격인증 대장을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => filterQualificationLedger(rows, { ...filters, qualification: filters.qualification, department: filters.department, rank: filters.rank, status: filters.status }),
    [rows, filters],
  )

  const summary = useMemo(() => summarizeQualificationLedger(filtered, filters.year), [filtered, filters.year])

  const patchFilters = (part: Partial<LedgerFilters>) => setFilters((prev) => ({ ...prev, ...part }))
  const reset = () => setFilters(defaultLedgerFilters())

  const persistRows = async (nextRows: QualificationLedgerSaveRow[], detail: string) => {
    if (!user) {
      toast.error('로그인이 필요합니다.')
      return false
    }
    if (!canManage) {
      toast.error('관리자만 등록·수정할 수 있습니다.')
      return false
    }
    setSaving(true)
    try {
      const response = await fetch('/api/quality/qualifications', {
        method: 'PUT',
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ rows: nextRows, detail }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '저장하지 못했습니다.')
      const saved = Array.isArray(result.data) ? result.data : nextRows
      setRows(saved)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const submitRegister = async () => {
    const name = registerForm.name.trim()
    if (!name) {
      toast.error('성명을 입력해 주세요.')
      return
    }
    if (!registerForm.qualification) {
      toast.error('자격명을 선택해 주세요.')
      return
    }
    const draft = createQualificationLedgerRowDraft({
      qualification: registerForm.qualification,
      name,
      department: registerForm.department,
      rank: registerForm.rank,
      joinDate: registerForm.joinDate,
      acquiredDate: registerForm.acquiredDate,
      expiryDate: registerForm.expiryDate,
      certNo: allocateNextQualificationCertNo(rows),
    })
    if (!draft) {
      toast.error('입력값을 확인해 주세요.')
      return
    }
    const rowForSave: QualificationLedgerSaveRow = {
      ...draft,
      ...(registerForm.idPhotoPending ? { idPhotoPending: registerForm.idPhotoPending } : {}),
    }
    const nextRows = [...rows, rowForSave].sort(sortQualificationLedger)
    const ok = await persistRows(nextRows, `자격인증 등록: ${name} · ${registerForm.qualification}`)
    if (!ok) return
    setRegisterForm(emptyLedgerRegisterForm())
    setRegisterOpen(false)
    toast.success('자격인증 대장에 등록했습니다.')
  }

  const openEdit = (row: QualificationLedgerRow) => {
    setEditingRow(row)
    setEditForm(ledgerEditFormFromRow(row))
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!editingRow) return
    const name = editForm.name.trim()
    if (!name) {
      toast.error('성명을 입력해 주세요.')
      return
    }
    if (!editForm.qualification) {
      toast.error('자격명을 선택해 주세요.')
      return
    }
    const updated = updateQualificationLedgerRow(editingRow, {
      qualification: editForm.qualification,
      name,
      department: editForm.department,
      rank: editForm.rank,
      joinDate: editForm.joinDate,
      acquiredDate: editForm.acquiredDate,
      expiryDate: editForm.expiryDate,
      cancelDate: editForm.cancelDate,
      cancelReason: editForm.cancelReason,
      certNo: editForm.certNo.trim(),
      idPhotoFileId: editForm.idPhotoPending ? editingRow.idPhotoFileId : editForm.idPhotoFileId,
    })
    if (!updated) {
      toast.error('입력값을 확인해 주세요.')
      return
    }
    const rowForSave: QualificationLedgerSaveRow = {
      ...updated,
      ...(editForm.idPhotoPending ? { idPhotoPending: editForm.idPhotoPending } : {}),
    }
    const nextRows = rows.map((row) => (row.id === editingRow.id ? rowForSave : row)).sort(sortQualificationLedger)
    const ok = await persistRows(nextRows, `자격인증 수정: ${name} · ${editForm.qualification}`)
    if (!ok) return
    setEditOpen(false)
    setEditingRow(null)
    setEditForm({ ...emptyLedgerRegisterForm(), certNo: '', cancelDate: '', cancelReason: '' })
    toast.success('자격인증 정보를 수정했습니다.')
  }

  const registerDialog = canManage ? (
    <Dialog
      open={registerOpen}
      onOpenChange={(open) => {
        setRegisterOpen(open)
        if (!open) setRegisterForm(emptyLedgerRegisterForm())
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            className="h-9 shrink-0 rounded-lg bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700"
          />
        }
      >
        <Plus className="size-4" />
        자격 등록
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>자격인증 등록</DialogTitle>
        </DialogHeader>
        <QualificationLedgerRowFormFields
          form={registerForm}
          onPatch={(part) => setRegisterForm((prev) => ({ ...prev, ...part }))}
          ledgerDepartmentOptions={ledgerDepartmentOptions}
        />
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="h-9 min-w-20" onClick={() => setRegisterOpen(false)} disabled={saving}>
            취소
          </Button>
          <Button type="button" className="h-9 min-w-20 bg-emerald-600 text-white hover:bg-emerald-700" onClick={submitRegister} disabled={saving}>
            {saving ? '저장 중…' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null

  const editDialog = canManage ? (
    <Dialog
      open={editOpen}
      onOpenChange={(open) => {
        setEditOpen(open)
        if (!open) {
          setEditingRow(null)
          setEditForm({ ...emptyLedgerRegisterForm(), certNo: '', cancelDate: '', cancelReason: '' })
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>자격인증 수정</DialogTitle>
        </DialogHeader>
        <QualificationLedgerRowFormFields
          form={editForm}
          showCancelFields
          onPatch={(part) => setEditForm((prev) => ({ ...prev, ...part }))}
          ledgerDepartmentOptions={withSelectedFilterOption(ledgerDepartmentOptions, editForm.department)}
        />
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="h-9 min-w-20" onClick={() => setEditOpen(false)} disabled={saving}>
            취소
          </Button>
          <Button type="button" className="h-9 min-w-20 bg-emerald-600 text-white hover:bg-emerald-700" onClick={submitEdit} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null

  return (
    <div className="flex flex-col gap-4">
      {editDialog}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5" aria-label="조회 조건">
        <header className={cn('flex flex-wrap items-center justify-between gap-3', filtersOpen && 'mb-4')}>
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            <Filter className="size-4 text-emerald-600" />
            조회 조건
            <ChevronDown className={cn('size-4 text-slate-400 transition-transform', filtersOpen && 'rotate-180')} />
          </button>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {activeCount}
              </span>
            )}
            {filtersOpen && (
              <Button type="button" variant="outline" className="h-9 rounded-full border-slate-200 bg-white px-4" onClick={reset}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                초기화
              </Button>
            )}
          </div>
        </header>

        {filtersOpen && (
        <div className="flex flex-nowrap items-stretch gap-3 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
          <LedgerInsetField label="기준년도" className="min-w-[6.75rem]">
            <Select value={filters.year} onValueChange={(value) => patchFilters({ year: value ?? LEDGER_ALL })}>
              <SelectTrigger aria-label="기준년도" className="h-7 w-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0">
                {filters.year === LEDGER_ALL ? '전체' : `${filters.year}년`}
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={LEDGER_ALL}>전체</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}년</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LedgerInsetField>

          <LedgerInsetField label="자격명" className="min-w-[8rem]">
            <Select
              value={filters.qualification}
              onValueChange={(value) => patchFilters({ qualification: value ?? LEDGER_ALL })}
            >
              <SelectTrigger aria-label="자격명" className="h-7 w-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0">
                {filters.qualification === LEDGER_ALL ? '전체' : filters.qualification}
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={LEDGER_ALL}>전체</SelectItem>
                  {QUALIFICATION_LEDGER_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LedgerInsetField>

          <LedgerInsetField label="소속" className="min-w-[7rem]">
            <Select value={filters.department} onValueChange={(value) => patchFilters({ department: value ?? LEDGER_ALL })}>
              <SelectTrigger aria-label="소속" className="h-7 w-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0">
                {filters.department === LEDGER_ALL ? '전체' : filters.department}
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={LEDGER_ALL}>전체</SelectItem>
                  {departmentOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LedgerInsetField>

          <LedgerInsetField label="직위" className="min-w-[6.5rem]">
            <Select value={filters.rank} onValueChange={(value) => patchFilters({ rank: value ?? LEDGER_ALL })}>
              <SelectTrigger aria-label="직위" className="h-7 w-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0">
                {filters.rank === LEDGER_ALL ? '전체' : filters.rank}
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={LEDGER_ALL}>전체</SelectItem>
                  {jobTitleOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LedgerInsetField>

          <LedgerInsetField label="상태" className="min-w-[6.5rem]">
            <Select value={filters.status} onValueChange={(value) => patchFilters({ status: value ?? LEDGER_ALL })}>
              <SelectTrigger aria-label="상태" className="h-7 w-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0">
                {LEDGER_STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? '전체'}
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {LEDGER_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LedgerInsetField>

          <LedgerInsetField label="성명 검색" className="min-w-[10rem] flex-[1.3]">
            <div className="relative">
              <Input
                value={filters.name}
                onChange={(e) => patchFilters({ name: e.target.value })}
                placeholder="이름을 입력하세요"
                className="h-7 border-0 bg-transparent px-0 pr-6 shadow-none focus-visible:ring-0"
                aria-label="성명"
              />
              <Search className="pointer-events-none absolute right-0 top-1 size-4 text-slate-400" />
            </div>
          </LedgerInsetField>
        </div>
        )}
      </section>

      <QualificationLedgerSummary summary={summary} />

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,18rem)]">
        <QualificationLedgerList
          loading={loading}
          rows={filtered}
          totalUnfiltered={rows.length}
          baseYear={filters.year}
          onShowAll={reset}
          registerAction={registerDialog}
          canManage={canManage}
          onEditRow={openEdit}
        />
        <QualificationLedgerSidebar rows={filtered} />
      </div>
    </div>
  )
}

function LedgerInsetField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 pb-1.5 pt-1.5 dark:border-border dark:bg-background', className)}>
      <p className="text-[10px] leading-none text-slate-400">{label}</p>
      {children}
    </div>
  )
}

function QualificationLedgerSummary({
  summary,
}: {
  summary: ReturnType<typeof summarizeQualificationLedger>
}) {
  const processed = summary.renewalDone
  const within3m = summary.renewalDue

  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      <LedgerKpiCard
        tone="green"
        icon={Award}
        label="등록 자격"
        value={summary.total}
        unit="건"
        delta={processed > 0 ? `+${processed} 처리 중` : '+0 전월과 동일'}
        deltaTone={processed > 0 ? 'up' : 'flat'}
      />
      <LedgerKpiCard
        tone="blue"
        icon={ClipboardCheck}
        label="내부품질감사"
        value={summary.internalAudit}
        unit="건"
        delta="+0 전월과 동일"
        deltaTone="flat"
      />
      <LedgerKpiCard
        tone="amber"
        icon={Calendar}
        label="갱신 대상"
        value={summary.renewalDue}
        unit="건"
        delta={within3m > 0 ? `+${within3m} 3개월 이내` : '+0 3개월 이내'}
        deltaTone={within3m > 0 ? 'up' : 'flat'}
      />
      <LedgerKpiCard
        tone="violet"
        icon={Shield}
        label="적격성평가"
        value={summary.suitability}
        unit="건"
        delta={summary.suitability > 0 ? `+${Math.min(summary.suitability, summary.recognitionValid || summary.suitability)} 진행 중` : '+0 진행 중'}
        deltaTone={summary.suitability > 0 ? 'up' : 'flat'}
      />
    </div>
  )
}

function LedgerKpiCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  deltaTone,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: number
  unit: string
  delta: string
  deltaTone: 'up' | 'flat'
  tone: StatTileTone
}) {
  return (
    <article className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-3.5 shadow-sm dark:border-border dark:bg-card">
      <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', STAT_TILE_ICON[tone])}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[22px] font-extrabold leading-none tabular-nums text-slate-900 dark:text-white">
          {value.toLocaleString('ko-KR')}
          <span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span>
        </p>
        <p className="mt-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</p>
        <p
          className={cn(
            'mt-1 text-[11px] font-semibold',
            deltaTone === 'flat' ? 'text-emerald-600' : STAT_TILE_VALUE[tone],
          )}
        >
          ▲ {delta}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden />
    </article>
  )
}

function ledgerRenewalYearAnchor(baseYear: string) {
  if (baseYear !== LEDGER_ALL && /^\d{4}$/.test(baseYear)) return baseYear
  return String(new Date().getFullYear())
}

function QualificationLedgerList({
  loading,
  rows,
  totalUnfiltered,
  baseYear,
  onShowAll,
  registerAction,
  canManage,
  onEditRow,
}: {
  loading: boolean
  rows: QualificationLedgerRow[]
  totalUnfiltered: number
  baseYear: string
  onShowAll: () => void
  registerAction?: ReactNode
  canManage?: boolean
  onEditRow?: (row: QualificationLedgerRow) => void
}) {
  const renewalYears = useMemo(() => ledgerRenewalYears(ledgerRenewalYearAnchor(baseYear)), [baseYear])
  const [renewalPastA, renewalPastB, renewalPlannedYear] = renewalYears
  const renewalPlannedLabel = `${renewalPlannedYear} 예정`

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-border dark:bg-card" aria-label="자격인증 등록 목록">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 dark:border-border">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <List className="size-4 text-emerald-600" />
            자격인증 등록 목록
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            <span>총 {rows.length.toLocaleString('ko-KR')}건</span>
            <span aria-hidden className="text-slate-200">·</span>
            <span>{baseYear === LEDGER_ALL ? '전체' : `${baseYear}년 기준`}</span>
            <span aria-hidden className="text-slate-200">·</span>
            <button type="button" className="font-semibold text-slate-500 hover:text-emerald-700" onClick={onShowAll}>
              전체보기
            </button>
          </p>
        </div>
        {registerAction}
      </header>

      {loading ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center text-sm text-muted-foreground">
          {totalUnfiltered > 0 ? (
            <>
              <span>선택한 연도·필터 조건에 맞는 자격이 없습니다.</span>
              <button type="button" className="font-semibold text-emerald-700 hover:underline" onClick={onShowAll}>
                전체보기
              </button>
            </>
          ) : (
            '등록된 자격이 없습니다.'
          )}
        </p>
      ) : (
        <div className="overflow-x-auto px-3 pb-3">
          <table className={LEDGER_TABLE_CLASS}>
            <colgroup>
              <col className="w-[2.75rem]" />
              <col className="w-[6.25rem]" />
              <col className="w-[10rem]" />
              <col className="w-[5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[5.25rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[5rem]" />
              <col className="w-[4.75rem]" />
              <col />
              {canManage ? <col className="w-[2.75rem]" /> : null}
            </colgroup>
            <thead className="border-b border-slate-200 dark:border-slate-600">
              <tr>
                <th rowSpan={2} className={LEDGER_TH}>
                  No
                </th>
                <th rowSpan={2} className={LEDGER_TH}>
                  인증번호
                </th>
                <th rowSpan={2} className={LEDGER_TH}>
                  자격명
                </th>
                <th colSpan={3} className={LEDGER_TH}>
                  인증취득자
                </th>
                <th rowSpan={2} className={LEDGER_TH}>
                  입사일자
                </th>
                <th colSpan={3} className={cn(LEDGER_TH, 'bg-blue-50/80 dark:bg-blue-950/30')}>
                  갱신일
                </th>
                <th colSpan={2} className={LEDGER_TH}>
                  인증취소
                </th>
                {canManage ? (
                  <th rowSpan={2} className={cn(LEDGER_TH, 'px-1')}>
                    <span className="sr-only">수정</span>
                  </th>
                ) : null}
              </tr>
              <tr>
                <th className={LEDGER_TH}>성명</th>
                <th className={LEDGER_TH}>소속</th>
                <th className={LEDGER_TH}>직위</th>
                <th className={LEDGER_TH}>{renewalPastA}</th>
                <th className={LEDGER_TH}>{renewalPastB}</th>
                <th className={cn(LEDGER_TH_PLANNED, 'whitespace-nowrap')}>{renewalPlannedLabel}</th>
                <th className={LEDGER_TH}>취소일자</th>
                <th className={LEDGER_TH}>사유</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const cancelDate = displayIsoDate(row.cancelDate)
                const cancelReason = row.cancelReason.trim()
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      index % 2 === 0 ? LEDGER_ROW_WHITE : LEDGER_ROW_GRAY,
                      'hover:bg-slate-100/90 dark:hover:bg-muted/50',
                    )}
                  >
                    <td className={cn(LEDGER_TD_NUM, 'text-slate-400')}>{index + 1}</td>
                    <td className={cn(LEDGER_TD_NUM, 'whitespace-nowrap text-xs font-medium tracking-tight text-slate-700 dark:text-slate-200')}>
                      {row.certNo || '—'}
                    </td>
                    <td className={cn(LEDGER_TD, 'whitespace-normal break-keep leading-snug')}>
                      <span
                        className={cn(
                          'inline-block max-w-full rounded-full px-2.5 py-1 text-xs font-semibold leading-snug break-keep',
                          qualificationLedgerBadgeClass(row.qualification),
                        )}
                      >
                        {row.qualification}
                      </span>
                    </td>
                    <td className={cn(LEDGER_TD, 'font-semibold')}>{row.name}</td>
                    <td className={LEDGER_TD}>{row.department || '—'}</td>
                    <td className={LEDGER_TD}>{row.rank || '—'}</td>
                    <td className={cn(LEDGER_TD_NUM, 'text-xs')}>{displayIsoDate(row.joinDate)}</td>
                    <td className={cn(LEDGER_TD_NUM, 'text-xs')}>
                      {renewalCellText(row, renewalPastA, false)}
                    </td>
                    <td className={cn(LEDGER_TD_NUM, 'text-xs')}>
                      {renewalCellText(row, renewalPastB, false)}
                    </td>
                    <td className={cn(LEDGER_TD_PLANNED, LEDGER_TD_NUM, 'text-xs')}>
                      {renewalCellText(row, renewalPlannedYear, true)}
                    </td>
                    <td
                      className={cn(
                        LEDGER_TD_NUM,
                        'text-xs',
                        cancelDate !== '—' && 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {cancelDate}
                    </td>
                    <td className={cn(LEDGER_TD, 'whitespace-normal break-keep text-xs leading-snug')} title={cancelReason || undefined}>
                      {cancelReason || '—'}
                    </td>
                    {canManage ? (
                      <td className={cn(LEDGER_TD, 'px-1')}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-8 text-slate-500 hover:text-emerald-700"
                          aria-label={`${row.name} 수정`}
                          onClick={() => onEditRow?.(row)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const SCHEDULE_DOT: Record<string, string> = {
  expired: 'bg-rose-500',
  expiring: 'bg-amber-500',
  valid: 'bg-emerald-500',
  cancelled: 'bg-slate-300',
}

function QualificationLedgerSidebar({ rows }: { rows: QualificationLedgerRow[] }) {
  const schedule = useMemo(() => {
    return rows
      .map((row) => {
        const status = deriveQualificationStatus(row)
        const due = row.plannedRenewalDate || row.expiryDate || ''
        return { row, status, due, sortKey: daysUntilIso(due) ?? 99999 }
      })
      .filter(({ status }) => status === 'expired' || status === 'expiring')
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(0, 3)
  }, [rows])

  const breakdown = useMemo(() => {
    const counts = new Map<string, number>()
    let valid = 0
    let expiring = 0
    let expired = 0
    let cancelled = 0
    let suitability = 0
    for (const row of rows) {
      counts.set(row.qualification, (counts.get(row.qualification) ?? 0) + 1)
      const status = deriveQualificationStatus(row)
      if (status === 'valid') valid += 1
      else if (status === 'expiring') expiring += 1
      else if (status === 'expired') expired += 1
      else cancelled += 1
      if (row.suitabilityOnFile) suitability += 1
    }
    const byQual = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    return { byQual, max: Math.max(1, ...byQual.map(([, count]) => count)), valid, expiring, expired, cancelled, suitability }
  }, [rows])

  return (
    <aside className="flex h-full flex-col gap-4">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card" aria-label="갱신 예정 현황">
        <header className="mb-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <Calendar className="size-4 text-emerald-600" />
            갱신 예정 현황
          </h3>
        </header>
        {schedule.length === 0 ? (
          <p className="text-sm text-slate-400">갱신·만료 예정 건이 없습니다.</p>
        ) : (
          <ul className="relative z-10 space-y-4 pr-10">
            {schedule.map(({ row, status, due }) => (
              <li key={row.id} className="flex gap-2.5">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', SCHEDULE_DOT[status])} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{renewalScheduleLabel(due)}</p>
                  <p className="text-[11px] tabular-nums text-slate-400">{due ? due.slice(0, 10).replaceAll('-', '.') : '—'}</p>
                  <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">
                    {row.name} {row.qualification}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-rose-500">1건</span>
              </li>
            ))}
          </ul>
        )}
        <span className="pointer-events-none absolute -bottom-3 -right-1 flex size-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-200 dark:bg-emerald-950/40">
          <AlarmClock className="size-14" strokeWidth={1.25} />
        </span>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card" aria-label="자격 구성">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
            <Users className="size-4 text-emerald-600" />
            자격 구성
          </h3>
          <span className="text-xs font-semibold tabular-nums text-slate-400">{rows.length}명</span>
        </header>
        <dl className="mb-4 grid grid-cols-4 gap-1.5 text-center">
          {[
            ['유효', breakdown.valid, 'text-emerald-700'],
            ['예정', breakdown.expiring, 'text-amber-700'],
            ['만료', breakdown.expired, 'text-rose-600'],
            ['취소', breakdown.cancelled, 'text-slate-500'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-1 py-2 dark:bg-muted/40">
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className={cn('text-lg font-extrabold tabular-nums leading-tight', tone)}>{value}</dd>
            </div>
          ))}
        </dl>
        {breakdown.byQual.length === 0 ? (
          <p className="text-sm text-slate-400">표시할 자격이 없습니다.</p>
        ) : (
          <ul className="flex flex-1 flex-col justify-evenly gap-3">
            {breakdown.byQual.map(([name, count]) => (
              <li key={name}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className={cn('truncate rounded-full px-2.5 py-1 text-xs font-bold', qualificationLedgerBadgeClass(name))}>
                    {name}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(8, Math.round((count / breakdown.max) * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate-400">적격성평가서 작성 {breakdown.suitability}명</p>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card" aria-label="운영기준">
        <header className="mb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <BookOpen className="size-4 text-emerald-600" />
            운영기준
          </h3>
        </header>
        <ul className="space-y-2.5 text-[13px] leading-snug text-slate-500">
          {[
            '자격 적격평가서 작성 후 자격인정서 발행',
            '내부심사원·심사원 평가는 연 1회 이상 실시',
            '감사원 점검 시 「만료예정」 상태 자동 알림',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span aria-hidden className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="min-w-0 flex-1">{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}

