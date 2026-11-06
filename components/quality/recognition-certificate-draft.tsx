'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getAuthHeaders } from '@/lib/auth-client'
import type { QualificationLedgerRow } from '@/lib/qualification-ledger'
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

type CertPhoto = { data: string; mime: string }

export function RecognitionCertificateDraft() {
  const { user } = useAuth()
  const [rows, setRows] = useState<QualificationLedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, CertDraft>>({})
  const [photos, setPhotos] = useState<Record<string, CertPhoto>>({})
  const [options, setOptions] = useState({
    border: true,
    seal: true,
    photo: true,
    logo: true,
  })

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

  const selected = rows.find((row) => row.id === selectedId) ?? null
  const draft = selected ? drafts[selected.id] ?? draftFromRow(selected) : null

  const readyCount = rows.filter(printable).length
  const reviewCount = rows.length - readyCount
  const issuedCount = rows.filter((row) => row.recognitionOnFile).length
  const checkedCount = rows.filter((row) => checked[row.id]).length

  const selectPerson = (row: QualificationLedgerRow) => {
    setSelectedId(row.id)
    setDrafts((prev) => (prev[row.id] ? prev : { ...prev, [row.id]: draftFromRow(row) }))
  }

  const personPayload = (id: string) => {
    const row = rows.find((item) => item.id === id)
    const current = row ? drafts[id] ?? draftFromRow(row) : null
    if (!current) return null
    const photo = photos[id]
    return {
      name: current.name,
      department: current.department,
      duty: current.duty,
      joinDate: current.issued,
      issueDate: current.issueDate,
      issuer: current.issuer,
      includePhoto: options.photo && Boolean(photo),
      photoBase64: photo?.data,
      photoMime: photo?.mime,
    }
  }

  const printPdfBlob = (blob: Blob) =>
    new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.className = 'pointer-events-none fixed size-0 border-0 opacity-0'
      const cleanup = () => {
        URL.revokeObjectURL(url)
        iframe.remove()
      }
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          window.setTimeout(() => {
            cleanup()
            resolve()
          }, 1500)
        } catch (error) {
          cleanup()
          reject(error instanceof Error ? error : new Error('인쇄 대화상자를 열지 못했습니다.'))
        }
      }
      iframe.onerror = () => {
        cleanup()
        reject(new Error('인쇄 미리보기를 열지 못했습니다.'))
      }
      iframe.src = url
      document.body.appendChild(iframe)
    })

  const fetchCertificatePdf = async (ids: string[]) => {
    const people = ids.map(personPayload).filter((item): item is NonNullable<typeof item> => Boolean(item?.name?.trim()))
    if (!people.length) {
      toast.error('출력할 인원을 선택하세요.')
      return null
    }
    const response = await fetch('/api/quality/recognition-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(user),
      },
      body: JSON.stringify({ people: [people[0]] }),
    })
    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(json?.error || 'PDF를 만들지 못했습니다.')
    }
    return response.blob()
  }

  const printCertificates = async (ids: string[]) => {
    const uniqueIds = [...new Set(ids)]
    if (!uniqueIds.length) {
      toast.error('출력할 인원을 선택하세요.')
      return
    }
    setPrinting(true)
    try {
      for (let index = 0; index < uniqueIds.length; index += 1) {
        const id = uniqueIds[index]
        const row = rows.find((item) => item.id === id)
        if (uniqueIds.length > 1 && row) {
          toast.message(`${index + 1}/${uniqueIds.length} · ${row.name} 인쇄`)
        }
        const blob = await fetchCertificatePdf([id])
        if (!blob) return
        await printPdfBlob(blob)
        if (index < uniqueIds.length - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 400))
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '출력에 실패했습니다.')
    } finally {
      setPrinting(false)
    }
  }

  const patchDraft = (part: Partial<CertDraft>) => {
    if (!selected) return
    setDrafts((prev) => ({
      ...prev,
      [selected.id]: { ...(prev[selected.id] ?? draftFromRow(selected)), ...part },
    }))
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

      <div className="grid items-start gap-3 xl:grid-cols-[17rem_minmax(0,1fr)_18.5rem]">
        <section className="rounded-2xl border bg-card p-3 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">01 출력 대상</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">체크한 인원만 일괄 출력에 포함됩니다.</p>
          <ul className="mt-3 max-h-[36rem] space-y-1.5 overflow-y-auto pr-0.5">
            {loading ? (
              <li className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                불러오는 중…
              </li>
            ) : rows.length === 0 ? (
              <li className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                자격인증대장에 등록된 인원이 없습니다.
              </li>
            ) : (
              rows.map((row) => {
                const ready = printable(row)
                return (
                  <li key={row.id}>
                    <div
                      className={cn(
                        'flex items-start gap-2 rounded-xl border px-2.5 py-2',
                        selectedId === row.id
                          ? 'border-sky-300 bg-sky-50/90 dark:border-sky-500/45 dark:bg-sky-950/35'
                          : 'border-slate-200 bg-white dark:border-border dark:bg-card',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-3.5 shrink-0 accent-sky-600"
                        checked={Boolean(checked[row.id])}
                        onChange={(event) =>
                          setChecked((prev) => ({ ...prev, [row.id]: event.target.checked }))
                        }
                        aria-label={`${row.name} 출력 포함`}
                      />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => selectPerson(row)}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                            {row.name}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                              ready
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
                                : 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100',
                            )}
                          >
                            {ready ? '출력 가능' : '확인 필요'}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {row.certNo || '번호 없음'} · {row.qualification}
                        </span>
                      </button>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {draft ? `자격인정서 ${draft.name} · ${draft.certNo || '번호 없음'}` : '자격인정서'}
            </h2>
            {selected ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-bold',
                  printable(selected)
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900',
                )}
              >
                {printable(selected) ? '출력 가능' : '확인 필요'}
              </span>
            ) : null}
          </div>

          {!draft ? (
            <p className="py-16 text-center text-sm text-muted-foreground">왼쪽에서 출력 대상을 선택하세요.</p>
          ) : (
            <div className="mt-4 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">02 인정서 기재 내용</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  양식 셀 — C8 사진, F26 성명, F27 소속, F28 입사일자, F29 담당업무, C37 발행일(예: 2026년 11월 5일)
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="성명">
                    <Input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
                  </Field>
                  <Field label="자격인정번호">
                    <Input value={draft.certNo} onChange={(event) => patchDraft({ certNo: event.target.value })} />
                  </Field>
                  <Field label="부서">
                    <Input value={draft.department} onChange={(event) => patchDraft({ department: event.target.value })} />
                  </Field>
                  <Field label="카드 표시 (부서/사원)">
                    <Input value={draft.cardLabel} onChange={(event) => patchDraft({ cardLabel: event.target.value })} />
                  </Field>
                  <Field label="입사 일자">
                    <Input type="date" value={draft.issued} onChange={(event) => patchDraft({ issued: event.target.value })} />
                  </Field>
                  <Field label="만료 일자">
                    <Input type="date" value={draft.expiry} onChange={(event) => patchDraft({ expiry: event.target.value })} />
                  </Field>
                  <Field label="담당 업무 (자격명)">
                    <Input value={draft.duty} onChange={(event) => patchDraft({ duty: event.target.value })} />
                  </Field>
                  <Field label="발행일">
                    <Input type="date" value={draft.issueDate} onChange={(event) => patchDraft({ issueDate: event.target.value })} />
                  </Field>
                  <Field label="발행 명의" className="sm:col-span-2">
                    <Input value={draft.issuer} onChange={(event) => patchDraft({ issuer: event.target.value })} />
                  </Field>
                  <Field label="사진" className="sm:col-span-2">
                    <Input
                      key={selected.id}
                      type="file"
                      accept="image/*"
                      className="cursor-pointer text-xs file:mr-2 file:text-xs"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          const data = typeof reader.result === 'string' ? reader.result : ''
                          if (!data) return
                          setPhotos((prev) => ({ ...prev, [selected.id]: { data, mime: file.type || 'image/jpeg' } }))
                        }
                        reader.readAsDataURL(file)
                      }}
                    />
                    {photos[selected.id] ? (
                      <p className="text-[11px] text-emerald-700">사진이 선택되었습니다. 양식 C8(증명사진) 칸에 들어갑니다.</p>
                    ) : null}
                  </Field>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">03 출력 옵션</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {(
                    [
                      ['border', '테두리'],
                      ['seal', '직인'],
                      ['photo', '사진 카드'],
                      ['logo', '로고'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-emerald-700"
                        checked={options[key]}
                        onChange={(event) => setOptions((prev) => ({ ...prev, [key]: event.target.checked }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  체크 {checkedCount}명 · <span className="font-medium">자격인정서.xlsx</span> 양식을 채운 뒤 PDF로 인쇄합니다.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">A4 미리보기</h2>
            <span className="text-[11px] text-muted-foreground">210 × 297mm</span>
          </div>
          <div className="mt-3 aspect-[210/297] w-full rounded-md border border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-muted/30">
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <p className="text-sm font-bold text-slate-500">인쇄 미리보기</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                출력 시 엑셀 양식에
                <br />
                기재 후 PDF로 인쇄합니다.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="mt-3 h-10 w-full text-sm font-semibold bg-slate-600 text-white shadow-sm hover:bg-slate-700 dark:bg-slate-500 dark:hover:bg-slate-400"
            disabled={!selected || printing}
            onClick={() => void printCertificates(selected ? [selected.id] : [])}
          >
            {printing ? '준비 중…' : '출력'}
          </Button>
        </section>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            setDrafts((prev) => ({ ...prev, [selected.id]: draftFromRow(selected) }))
            setPhotos((prev) => {
              const next = { ...prev }
              delete next[selected.id]
              return next
            })
            toast.message('기재 내용을 대장 값으로 되돌렸습니다.')
          }}
        >
          기재 내용 초기화
        </Button>
        <Button
          type="button"
          className="h-10 bg-emerald-700 text-white hover:bg-emerald-800"
          disabled={checkedCount === 0 || printing}
          onClick={() => void printCertificates(rows.filter((row) => checked[row.id]).map((row) => row.id))}
        >
          {printing ? '준비 중…' : '체크 대상 일괄 출력'}
        </Button>
      </div>
    </div>
  )
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
    <div className={cn('block space-y-1', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
