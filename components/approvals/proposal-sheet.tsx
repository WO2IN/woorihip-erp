'use client'

import type { ReactNode } from 'react'

import type { ProposalFormType } from '@/lib/approval'
import { ProposalBodyEditor, ProposalBodyView } from '@/components/approvals/proposal-body-editor'
import { cn } from '@/lib/utils'

export interface ProposalStamp {
  label: '작성' | '검토' | '승인'
  name: string
  title: string
  imageUrl?: string
  hint?: string
}

const RETENTION_PERIODS = ['1개월', '3개월', '6개월', '1년', '2년', '3년', '5년', '10년', '30년', '영구'] as const

const line = 'border-slate-900 dark:border-slate-400'

export function shownProposalDocNo(formType: string, docNo: string) {
  if (!docNo) return formType
  return docNo.startsWith(formType) ? docNo : `${formType}${docNo}`
}

export function storedProposalDocNo(formType: string, visible: string) {
  const text = visible.trim()
  if (text.startsWith(formType)) return text.slice(formType.length).trim()
  return text
}

export function ProposalSheet({
  formType,
  docNo,
  onDocNo,
  draftedOn,
  onDraftedOn,
  retention,
  onRetention,
  department,
  onDepartment,
  drafterName,
  onDrafterName,
  title,
  onTitle,
  body,
  onBody,
  destination,
  onDestination,
  stamps,
  print = false,
}: {
  formType: ProposalFormType
  docNo: string
  onDocNo?: (value: string) => void
  draftedOn: string
  onDraftedOn?: (value: string) => void
  retention: string
  onRetention?: (value: string) => void
  department: string
  onDepartment?: (value: string) => void
  drafterName: string
  onDrafterName?: (value: string) => void
  agreement: string
  onAgreement?: (value: string) => void
  opinion: string
  onOpinion?: (value: string) => void
  receiver: string
  onReceiver?: (value: string) => void
  reference: string
  onReference?: (value: string) => void
  title: string
  onTitle?: (value: string) => void
  body: string
  onBody?: (value: string) => void
  destination: string
  onDestination?: (value: string) => void
  stamps: ProposalStamp[]
  print?: boolean
}) {
  const editing = Boolean(onTitle)
  const shownDate = draftedOn ? draftedOn.replaceAll('-', '.') : ''

  return (
    <div className={cn('w-full bg-white text-slate-950', print ? 'flex h-full min-h-full flex-col text-black' : 'overflow-x-auto rounded-sm shadow-md dark:bg-card dark:text-slate-100')}>
      <div className={cn('border', line, print ? 'flex min-h-0 flex-1 flex-col' : 'min-w-[40rem]')}>
        <div className={cn('grid shrink-0 grid-cols-[minmax(0,1fr)_15.5rem] border-b', line)}>
          <div className={cn('flex items-center justify-center border-r px-4 py-6 text-3xl font-bold tracking-[0.55em]', line)}>
            기안품의서
          </div>
          <div className="grid grid-cols-[1.4rem_1fr_1fr_1fr] grid-rows-[auto_3.5rem_auto]">
            <div className={cn('row-span-3 flex items-center justify-center border-r text-xs font-semibold tracking-[0.3em] [writing-mode:vertical-rl]', line)}>결재</div>
            {stamps.map((stamp, index) => (
              <p key={`${stamp.label}-head`} className={cn('border-b py-1 text-center text-xs font-semibold', line, index < stamps.length - 1 && 'border-r')}>{stamp.label}</p>
            ))}
            {stamps.map((stamp, index) => (
              <div key={`${stamp.label}-sign`} className={cn('flex items-center justify-center border-b px-1', line, index < stamps.length - 1 && 'border-r')}>
                {stamp.imageUrl ? (
                  <img src={stamp.imageUrl} alt={`${stamp.name} 서명`} className="max-h-12 max-w-full object-contain" />
                ) : null}
              </div>
            ))}
            {stamps.map((stamp, index) => (
              <p key={`${stamp.label}-name`} className={cn('truncate px-1 py-1 text-center text-[11px]', index < stamps.length - 1 && cn('border-r', line))}>{stamp.name || ' '}</p>
            ))}
          </div>
        </div>

        <div className={cn('grid shrink-0 grid-cols-[5.5rem_minmax(0,1.2fr)_5.5rem_minmax(0,1fr)_5.5rem_minmax(0,0.7fr)] border-b', line)}>
          <Label>문서번호</Label>
          <Value>
            <PlainText
              ariaLabel="문서번호"
              value={shownProposalDocNo(formType, docNo)}
              onChange={editing ? onDocNo : undefined}
              maxLength={40}
            />
          </Value>
          <Label>작성일자</Label>
          <Value>
            {editing && onDraftedOn ? (
              <PlainDate value={draftedOn} onChange={onDraftedOn} />
            ) : shownDate}
          </Value>
          <Label>보존년한</Label>
          <Value className="border-r-0">
            {editing && onRetention ? (
              <PlainRetention value={retention} onChange={onRetention} />
            ) : retention}
          </Value>

          <Label className="border-b-0">작성부서</Label>
          <Value className="border-b-0">
            <PlainText
              ariaLabel="작성부서"
              value={department}
              onChange={editing ? onDepartment : undefined}
              maxLength={40}
              placeholder={editing ? '작성부서' : ''}
            />
          </Value>
          <Label className="border-b-0">작성자</Label>
          <Value className="col-span-3 border-r-0 border-b-0">
            <PlainText
              ariaLabel="작성자"
              value={drafterName}
              onChange={editing ? onDrafterName : undefined}
              maxLength={40}
            />
          </Value>
        </div>

        <div className={cn('grid shrink-0 grid-cols-[5.5rem_minmax(0,1fr)] border-b', line)}>
          <Label className="border-b-0">제 목</Label>
          <Value className="border-r-0 border-b-0">
            {editing ? (
              <input aria-label="제목" value={title} onChange={(event) => onTitle?.(event.target.value)} maxLength={80} className="h-7 w-full bg-transparent text-sm font-medium outline-none" />
            ) : <span className="font-medium">{title}</span>}
          </Value>
        </div>

        <div className={cn('grid grid-cols-[5.5rem_minmax(0,1fr)] border-b', line, print && 'min-h-0 flex-1')}>
          <Label className="border-b-0">세부사항</Label>
          <div className={cn('min-w-0', print && 'min-h-0')}>
            {editing ? (
              <ProposalBodyEditor value={body} onChange={(value) => onBody?.(value)} label="세부사항" />
            ) : (
              <ProposalBodyView value={body} print={print} />
            )}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-[5.5rem_minmax(0,1fr)]">
          <Label className="border-b-0">수신처</Label>
          <Value className="border-r-0 border-b-0">
            {editing ? (
              <input aria-label="수신처" value={destination} onChange={(event) => onDestination?.(event.target.value)} maxLength={80} className="h-7 w-full bg-transparent text-sm outline-none" />
            ) : destination}
          </Value>
        </div>
      </div>
    </div>
  )
}

function Label({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center border-r border-b bg-slate-50 px-1 py-2 text-center text-xs font-semibold tracking-[0.15em] dark:bg-white/5', line, className)}>
      {children}
    </div>
  )
}

function Value({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-10 items-center border-r border-b px-2 py-1 text-sm', line, className)}>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function PlainText({
  value,
  onChange,
  maxLength,
  ariaLabel,
  placeholder,
}: {
  value: string
  onChange?: (value: string) => void
  maxLength: number
  ariaLabel: string
  placeholder?: string
}) {
  if (!onChange) return <span>{value}</span>
  return (
    <input
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
    />
  )
}

function PlainDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const shown = value ? value.replaceAll('-', '.') : ''
  return (
    <label className="relative block h-7 cursor-pointer">
      <span className="block text-sm leading-7">{shown}</span>
      <input
        type="date"
        aria-label="작성일자"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

function PlainRetention({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block h-7 cursor-pointer">
      <span className="block text-sm leading-7">{value}</span>
      <select
        aria-label="보존년한"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {!(RETENTION_PERIODS as readonly string[]).includes(value) && value ? <option value={value}>{value}</option> : null}
        {RETENTION_PERIODS.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}
