'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Frame, ImagePlus, Printer, Stamp, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { QualificationLedgerRow } from '@/lib/qualification-ledger'
import { QUALIFICATION_ID_PHOTO_PLACEHOLDER_URL } from '@/lib/qualification-id-photo-placeholder'
import { cn } from '@/lib/utils'

type CertDraft = {
  name: string
  certNo: string
  department: string
  cardLabel: string
  issued: string
  expiry: string
  duty: string
  issueDate: string
  issuer: string
}

const DEFAULT_ISSUER = '대표이사 홍성호'
const EMPTY_DRAFT: CertDraft = {
  name: '',
  certNo: '',
  department: '',
  cardLabel: '',
  issued: '',
  expiry: '',
  duty: '',
  issueDate: '',
  issuer: '',
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function draftFromRow(row: QualificationLedgerRow): CertDraft {
  return {
    name: row.name,
    certNo: row.certNo || '',
    department: row.department,
    cardLabel: row.department,
    issued: row.joinDate || row.acquiredDate,
    expiry: row.expiryDate,
    duty: row.qualification,
    issueDate: todayIsoDate(),
    issuer: DEFAULT_ISSUER,
  }
}

function printable(row: QualificationLedgerRow) {
  return row.status !== 'cancelled' && (row.suitabilityOnFile || row.recognitionOnFile)
}

type CertPhoto = { data: string; mime: string; name: string; fileId?: string }

const FIELD_INPUT = 'h-9 bg-background'

const PRINT_OPTION_ITEMS = [
  { key: 'border' as const, label: '테두리', icon: Frame },
  { key: 'seal' as const, label: '직인', icon: Stamp },
  { key: 'photo' as const, label: '사진 카드', icon: ImagePlus },
]

export function RecognitionCertificateDraft() {
  const [rows, setRows] = useState<QualificationLedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, CertDraft>>({})
  const [photos, setPhotos] = useState<Record<string, CertPhoto>>({})
  const [options, setOptions] = useState({
    border: true,
    seal: true,
    photo: true,
  })
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    fetch('/api/quality/qualifications', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        const list = Array.isArray(result.data) ? (result.data as QualificationLedgerRow[]) : []
        setRows(list)
        setChecked({})
        setSelectedId('')
      })
      .catch(() => toast.error('자격인증 대장을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const row of rows) {
        const fileId = row.idPhotoFileId?.trim()
        if (!fileId) continue
        try {
          const response = await fetch(`/api/files/${fileId}`, { cache: 'no-store' })
          if (!response.ok || cancelled) continue
          const blob = await response.blob()
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
          if (!data || cancelled) continue
          setPhotos((prev) => {
            const existing = prev[row.id]
            if (existing && !existing.fileId) return prev
            return {
              ...prev,
              [row.id]: { data, mime: blob.type || 'image/jpeg', name: '증명사진', fileId },
            }
          })
        } catch {
          /* ignore */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rows])

  const selected = rows.find((row) => row.id === selectedId) ?? null
  const draft = selected ? drafts[selected.id] ?? draftFromRow(selected) : null
  const form = draft ?? EMPTY_DRAFT

  const readyCount = rows.filter(printable).length
  const reviewCount = rows.length - readyCount
  const issuedCount = rows.filter((row) => row.recognitionOnFile).length
  const checkedCount = rows.filter((row) => checked[row.id]).length

  const selectPerson = (row: QualificationLedgerRow) => {
    setSelectedId(row.id)
    setDrafts((prev) => (prev[row.id] ? prev : { ...prev, [row.id]: draftFromRow(row) }))
  }

  const patchDraft = (part: Partial<CertDraft>) => {
    if (!selected) return
    setDrafts((prev) => ({
      ...prev,
      [selected.id]: { ...(prev[selected.id] ?? draftFromRow(selected)), ...part },
    }))
  }

  const printTargets = rows.filter((row) => checked[row.id])
  const outputRows = printTargets.length > 0 ? printTargets : selected ? [selected] : []

  const printCertificates = async () => {
    if (!outputRows.length) {
      toast.error('출력할 인원을 선택하세요.')
      return
    }
    setPrinting(true)
    try {
      for (const row of outputRows) {
        const item = drafts[row.id] ?? draftFromRow(row)
        const photo = photos[row.id]
        const response = await fetch('/api/quality/recognition-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            people: [
              {
                name: item.name,
                certNo: item.certNo,
                department: item.department,
                duty: item.duty,
                joinDate: item.issued,
                renewalDate: item.expiry,
                issueDate: item.issueDate,
                photoFileId: options.photo && photo?.fileId ? photo.fileId : undefined,
                photoBase64: options.photo && photo && !photo.fileId ? photo.data : undefined,
                photoMime: photo?.mime,
                includePhoto: options.photo,
                includeSeal: options.seal,
              },
            ],
          }),
        })
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(result?.error || '자격인정서 출력에 실패했습니다.')
        }
        const blob = await response.blob()
        await openCertificatePrintDialog(blob)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '자격인정서 출력에 실패했습니다.')
    } finally {
      setPrinting(false)
    }
  }

  const stats = useMemo(
    () => [
      { label: '출력 가능 인정서', value: `${readyCount}건`, sub: '적격성 평가 후 출력 가능' },
      { label: '확인 필요', value: `${reviewCount}건`, sub: '평가·대장 확인 후 출력' },
      { label: '용지', value: 'A4 세로', sub: '210 × 297mm · 1인 1매' },
      { label: '발행 현황', value: `${issuedCount}/${rows.length || 0}명`, sub: '인정서 발행 완료' },
      { label: '발행 명의', value: '대표이사', sub: DEFAULT_ISSUER },
    ],
    [issuedCount, readyCount, reviewCount, rows.length],
  )

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((item) => (
          <article key={item.label} className="rounded-2xl border bg-card px-3 py-2.5 shadow-sm">
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{item.value}</p>
            <p className="truncate text-[11px] text-slate-500">{item.sub}</p>
          </article>
        ))}
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-[20rem_minmax(0,1fr)_minmax(22rem,30rem)]">
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">출력 대상</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">체크한 인원만 일괄 출력에 포함됩니다.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600 dark:bg-muted dark:text-slate-300">
              {rows.length}명
            </span>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
            {loading ? (
              <li className="px-3 py-10 text-center text-xs text-muted-foreground">불러오는 중…</li>
            ) : rows.length === 0 ? (
              <li className="px-3 py-10 text-center text-xs text-muted-foreground">자격인증대장에 등록된 인원이 없습니다.</li>
            ) : (
              rows.map((row) => {
                const ready = printable(row)
                const active = selectedId === row.id
                return (
                  <li key={row.id}>
                    <div
                      className={cn(
                        'group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
                        active
                          ? 'bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30'
                          : 'hover:bg-slate-50 dark:hover:bg-muted/40',
                      )}
                    >
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => selectPerson(row)}>
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                            ready
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-100',
                          )}
                        >
                          {row.name.trim().charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{row.name}</span>
                            <span
                              className={cn('size-1.5 shrink-0 rounded-full', ready ? 'bg-emerald-500' : 'bg-amber-400')}
                              title={ready ? '출력 가능' : '확인 필요'}
                            />
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {row.certNo || '번호 없음'} · {row.qualification}
                          </span>
                        </span>
                      </button>
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-emerald-700"
                        checked={Boolean(checked[row.id])}
                        onChange={(event) => setChecked((prev) => ({ ...prev, [row.id]: event.target.checked }))}
                        aria-label={`${row.name} 출력 포함`}
                      />
                    </div>
                  </li>
                )
              })
            )}
          </ul>
          <div className="flex items-center justify-between border-t px-4 py-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />출력 가능</span>
              <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" />확인 필요</span>
            </span>
            <span className="font-medium tabular-nums">체크 {checkedCount}명</span>
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-col rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold',
                selected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-slate-100 text-slate-400 dark:bg-muted',
              )}
            >
              {selected ? selected.name.trim().charAt(0) : '?'}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                {draft ? draft.name : '자격인정서'}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {draft ? `${draft.certNo || '번호 없음'} · ${draft.duty || '담당 업무 없음'}` : '왼쪽에서 출력 대상을 선택하세요.'}
              </p>
            </div>
            <Button
              type="button"
              size="default"
              className="h-9 shrink-0 gap-1.5 rounded-lg bg-emerald-700 px-4 text-white shadow-sm hover:bg-emerald-800"
              disabled={printing || outputRows.length === 0}
              onClick={() => void printCertificates()}
            >
              <Printer className="size-4" />
              {printing ? '출력 중…' : outputRows.length > 1 ? `출력 ${outputRows.length}명` : '출력'}
            </Button>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <FormGroup title="인적 사항">
              <Field label="성명">
                <Input className={FIELD_INPUT} disabled={!selected} value={form.name} onChange={(event) => patchDraft({ name: event.target.value })} />
              </Field>
              <Field label="자격인정번호">
                <Input className={FIELD_INPUT} disabled={!selected} value={form.certNo} onChange={(event) => patchDraft({ certNo: event.target.value })} />
              </Field>
              <Field label="부서">
                <Input className={FIELD_INPUT} disabled={!selected} value={form.department} onChange={(event) => patchDraft({ department: event.target.value })} />
              </Field>
              <Field label="카드 표시">
                <Input className={FIELD_INPUT} disabled={!selected} value={form.cardLabel} onChange={(event) => patchDraft({ cardLabel: event.target.value })} />
              </Field>
            </FormGroup>

            <FormGroup title="자격 정보">
              <Field label="입사 일자">
                <Input className={FIELD_INPUT} disabled={!selected} type="date" value={form.issued} onChange={(event) => patchDraft({ issued: event.target.value })} />
              </Field>
              <Field label="자격갱신일">
                <Input className={FIELD_INPUT} disabled={!selected} type="date" value={form.expiry} onChange={(event) => patchDraft({ expiry: event.target.value })} />
              </Field>
              <Field label="담당 업무">
                <Input className={FIELD_INPUT} disabled={!selected} value={form.duty} onChange={(event) => patchDraft({ duty: event.target.value })} />
              </Field>
              <Field label="발행일">
                <Input className={FIELD_INPUT} disabled={!selected} type="date" value={form.issueDate} onChange={(event) => patchDraft({ issueDate: event.target.value })} />
              </Field>
            </FormGroup>

            <div className="flex flex-col gap-3">
              <label
                className={cn(
                  'relative flex h-28 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 border-dashed px-3 text-center transition-colors',
                  selected
                    ? 'cursor-pointer border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-border'
                    : 'cursor-not-allowed border-slate-200 opacity-60 dark:border-border',
                )}
              >
                {selected ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photos[selected.id]?.data ?? QUALIFICATION_ID_PHOTO_PLACEHOLDER_URL}
                      alt=""
                      className={cn(
                        'aspect-[3/4] max-h-36 min-h-0 rounded-md shadow-sm',
                        photos[selected.id] ? 'object-cover' : 'object-contain bg-white',
                      )}
                    />
                    <span className="max-w-full truncate text-[11px] text-emerald-700">
                      {photos[selected.id] ? `${photos[selected.id].name} · 클릭해서 변경` : '사진 없음 · 클릭해서 등록'}
                    </span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="size-7 text-slate-300" aria-hidden />
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">증명사진 선택</span>
                    <span className="text-[11px] text-muted-foreground">인원 선택 후 사진 등록</span>
                  </>
                )}
                <input
                  key={selected?.id ?? 'none'}
                  type="file"
                  accept="image/*"
                  disabled={!selected}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file || !selected) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      const data = typeof reader.result === 'string' ? reader.result : ''
                      if (!data) return
                      setPhotos((prev) => ({
                        ...prev,
                        [selected.id]: { data, mime: file.type || 'image/jpeg', name: file.name, fileId: undefined },
                      }))
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </label>

              <div className="shrink-0 rounded-xl border bg-slate-50/60 p-3 dark:bg-muted/20">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-500">출력 옵션</h3>
                  <span className="text-[10px] text-muted-foreground">인쇄 시 반영</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PRINT_OPTION_ITEMS.map(({ key, label, icon: Icon }) => (
                    <PrintOptionToggle
                      key={key}
                      label={label}
                      icon={Icon}
                      checked={options[key]}
                      onChange={(checked) => setOptions((prev) => ({ ...prev, [key]: checked }))}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="relative min-h-[32rem] xl:min-h-0">
          <section className="flex h-full min-h-[32rem] flex-col rounded-2xl border bg-card p-3 shadow-sm xl:absolute xl:inset-0 xl:min-h-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">A4 미리보기</h2>
              <span className="text-[11px] text-muted-foreground">210 × 297mm</span>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-md bg-slate-100 p-3 [container-type:size] dark:bg-muted/40">
              {selected ? (
                <div className="mx-auto h-full" style={{ width: 'min(100cqw, calc(100cqh * 210 / 297))' }}>
                  <CertificateSheet
                    draft={draft}
                    photo={options.photo ? photos[selected.id] : undefined}
                    showPhoto={options.photo}
                    showBorder={options.border}
                    showSeal={options.seal}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function CertificateSheet({
  draft,
  photo,
  showPhoto,
  showBorder,
  showSeal,
}: {
  draft: CertDraft | null
  photo?: CertPhoto
  showPhoto: boolean
  showBorder: boolean
  showSeal: boolean
}) {
  const photoSrc = photo?.data ?? QUALIFICATION_ID_PHOTO_PLACEHOLDER_URL
  const photoIsPlaceholder = !photo
  const issuerName = issuerPersonName(draft?.issuer)
  return (
    <div
      className="relative w-full bg-white shadow-sm [container-type:inline-size]"
      style={{ height: 0, paddingBottom: '141.4286%' }}
    >
      <div className="absolute inset-0 overflow-hidden text-black">
        {showBorder ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/recognition-certificate-border.png" alt="" className="pointer-events-none absolute inset-0 h-full w-full" />
        ) : null}
        <p className="absolute inset-x-0 top-[9.6%] text-center text-[4.6cqw] font-black tracking-[0.42em] [text-indent:0.42em]">자격인정서</p>
        <div className="absolute top-[15.2%] left-1/2 h-[0.28cqw] w-[36%] -translate-x-1/2 bg-black" />
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt=""
            className={cn(
              'absolute top-[17.4%] left-1/2 aspect-[3/4] w-[30%] -translate-x-1/2',
              photoIsPlaceholder ? 'object-contain bg-white' : 'object-cover object-[center_18%]',
            )}
          />
        ) : null}
        <div className="absolute top-[53.6%] left-1/2 -translate-x-1/2 text-[2.35cqw] leading-[1.62] font-bold">
          <div className="grid grid-cols-[7.4em_5.6em]">
            <PreviewLine glyphs="성명" value={draft?.name} />
            <PreviewLine glyphs="소속" value={draft?.department} />
            <PreviewLine glyphs="입사일자" value={dotDate(draft?.issued ?? '')} />
            <PreviewLine glyphs="자격갱신일" value={dotDate(draft?.expiry ?? '')} />
            <PreviewLine glyphs="담당업무" value={draft?.duty} />
          </div>
        </div>
        <p className="absolute top-[69.4%] left-1/2 w-[76%] -translate-x-1/2 text-center text-[2.7cqw] leading-snug font-bold">
          상기자를 교육 수료 및 자격시험에 Pass 하였기에
          <br />
          위 자격을 인정함.
        </p>
        <p className="absolute inset-x-0 top-[77.4%] text-center text-[2.45cqw] font-bold">{koreanDate(draft?.issueDate ?? '')}</p>
        <div className="absolute inset-x-0 top-[80.8%] flex items-center justify-center gap-[0.7em] text-[3.4cqw] font-black">
          <span>대표이사</span>
          <span className="relative">
            {issuerName}
            {showSeal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/company-seal.png"
                alt=""
                className="pointer-events-none absolute top-1/2 left-full h-[2.4em] w-auto -translate-y-1/2 -ml-[0.35em]"
              />
            ) : null}
          </span>
        </div>
        <div className="absolute top-[87.6%] right-[12.5%] left-[12.5%] h-[0.18cqw] bg-black" />
        <div className="absolute top-[88.4%] right-[12.5%] left-[12.5%] flex items-center justify-between">
          <span className="text-[1.75cqw]">자격인정번호 {draft?.certNo ?? ''}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="WOORI" className="h-[5cqw] w-auto" />
        </div>
      </div>
    </div>
  )
}

function PreviewLine({ glyphs, value }: { glyphs: string; value?: string }) {
  const chars = [...glyphs]
  return (
    <>
      <span className="flex justify-between pr-[0.45em]">
        {chars.map((char, index) => (
          <span key={`${char}-${index}`}>{char}</span>
        ))}
      </span>
      <span className="whitespace-nowrap">: {value || ''}</span>
    </>
  )
}

function dotDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return iso.replace(/-/g, '.')
}

function koreanDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [year, month, day] = iso.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}

function issuerPersonName(issuer?: string) {
  const text = (issuer || DEFAULT_ISSUER).trim()
  if (text.startsWith('대표이사')) return text.slice('대표이사'.length).trim() || '홍성호'
  return text || '홍성호'
}

function openCertificatePrintDialog(blob: Blob) {
  return new Promise<void>((resolve) => {
    const url = URL.createObjectURL(blob)
    const frame = document.createElement('iframe')
    frame.title = '자격인정서 인쇄'
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none'
    document.body.appendChild(frame)
    let released = false
    let started = false
    const release = () => {
      if (released) return
      released = true
      window.removeEventListener('afterprint', release)
      resolve()
    }
    const cleanup = () => {
      if (!frame.isConnected) return
      frame.remove()
      URL.revokeObjectURL(url)
    }
    const startPrint = () => {
      if (started) return
      started = true
      const win = frame.contentWindow
      window.addEventListener('afterprint', release)
      win?.addEventListener('afterprint', () => {
        release()
        window.setTimeout(cleanup, 400)
      })
      try {
        win?.focus()
        win?.print()
      } catch {
        release()
        cleanup()
        return
      }
      // 인쇄 창을 닫으면 print()가 반환된다. iframe 쪽 afterprint는 안 올 때가 있다.
      release()
      window.setTimeout(cleanup, 60_000)
    }
    frame.onload = () => window.setTimeout(startPrint, 300)
    frame.src = url
    window.setTimeout(startPrint, 2000)
  })
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function FormGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-slate-50/60 p-3 dark:bg-muted/20">
      <h3 className="text-xs font-bold text-slate-500">{title}</h3>
      <div className="mt-2 grid gap-x-3 gap-y-2.5 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function PrintOptionToggle({
  label,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string
  icon: LucideIcon
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className={cn(
        'flex h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-center transition-all select-none',
        checked
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
          : 'border-slate-200 bg-background text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-border dark:bg-card dark:text-slate-300 dark:hover:bg-emerald-500/5',
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Icon className={cn('size-3.5', checked ? 'text-white/95' : 'text-slate-400')} aria-hidden />
      <span className="max-w-full truncate px-0.5 text-[10px] leading-tight font-semibold">{label}</span>
    </label>
  )
}
