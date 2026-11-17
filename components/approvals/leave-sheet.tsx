'use client'

import type { ReactNode } from 'react'
import { LEAVE_TYPES, type LeaveType } from '@/lib/approval'
import { ProposalBodyEditor, ProposalBodyView } from '@/components/approvals/proposal-body-editor'
import { cn } from '@/lib/utils'

export const LEAVE_APPROVAL_LABELS = ['작성', '검토', '승인'] as const

export interface LeaveStamp {
  label: (typeof LEAVE_APPROVAL_LABELS)[number]
  name: string
  imageUrl?: string
}

function koreanParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return { year: '', month: '', day: '' }
  return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) }
}

export function LeaveSheet({
  draftedOn,
  onDraftedOn,
  department,
  onDepartment,
  jobTitle,
  onJobTitle,
  applicantName,
  onApplicantName,
  emergencyContact,
  onEmergencyContact,
  leaveType,
  onLeaveType,
  startDate,
  onStartDate,
  endDate,
  onEndDate,
  detail,
  onDetail,
  stamps,
  print = false,
}: {
  draftedOn: string
  onDraftedOn?: (value: string) => void
  department: string
  onDepartment?: (value: string) => void
  jobTitle: string
  onJobTitle?: (value: string) => void
  applicantName: string
  onApplicantName?: (value: string) => void
  emergencyContact: string
  onEmergencyContact?: (value: string) => void
  leaveType: LeaveType | ''
  onLeaveType?: (value: LeaveType) => void
  startDate: string
  onStartDate?: (value: string) => void
  endDate: string
  onEndDate?: (value: string) => void
  detail: string
  onDetail?: (value: string) => void
  stamps: LeaveStamp[]
  print?: boolean
}) {
  const editing = Boolean(onLeaveType)
  const applied = koreanParts(draftedOn)
  const start = koreanParts(startDate)
  const end = koreanParts(endDate)
  const approval = LEAVE_APPROVAL_LABELS.map((label) => stamps.find((item) => item.label === label))

  return (
    <div className={cn('w-full bg-white text-slate-950', !print && 'overflow-x-auto rounded-sm shadow-md dark:bg-card dark:text-slate-100')}>
      <div className={cn('border', line, !print && 'min-w-[40rem]')}>
        <div className={cn('grid grid-cols-[minmax(0,1fr)_15.5rem] border-b', line)}>
          <div className={cn('flex items-center justify-center border-r px-4 py-6 text-3xl font-bold tracking-[0.55em]', line)}>
            휴가신청서
          </div>
          <div className="grid grid-cols-[1.4rem_1fr_1fr_1fr] grid-rows-[auto_3.5rem_auto]">
            <div className={cn('row-span-3 flex items-center justify-center border-r text-xs font-semibold tracking-[0.3em] [writing-mode:vertical-rl]', line)}>결재</div>
            {LEAVE_APPROVAL_LABELS.map((label, index) => (
              <p key={`${label}-head`} className={cn('border-b py-1 text-center text-xs font-semibold', line, index < LEAVE_APPROVAL_LABELS.length - 1 && 'border-r')}>{label}</p>
            ))}
            {approval.map((stamp, index) => (
              <div key={`${LEAVE_APPROVAL_LABELS[index]}-sign`} className={cn('flex items-center justify-center border-b px-1', line, index < approval.length - 1 && 'border-r')}>
                {stamp?.imageUrl ? <img src={stamp.imageUrl} alt={`${stamp.name} 서명`} className="max-h-12 max-w-full object-contain" /> : null}
              </div>
            ))}
            {approval.map((stamp, index) => (
              <p key={`${LEAVE_APPROVAL_LABELS[index]}-name`} className={cn('truncate px-1 py-1 text-center text-[11px]', index < approval.length - 1 && cn('border-r', line))}>{stamp?.name || ' '}</p>
            ))}
          </div>
        </div>

        <div className={cn('grid grid-cols-[5.5rem_minmax(0,1.4fr)_5.5rem_minmax(0,1fr)] border-b', line)}>
          <Label>부 서</Label>
          <Value>
            {editing ? <input aria-label="부서" value={department} onChange={(event) => onDepartment?.(event.target.value)} maxLength={40} className={inputClass} /> : department}
          </Value>
          <Label>직 급</Label>
          <Value className="border-r-0">
            {editing ? <input aria-label="직급" value={jobTitle} onChange={(event) => onJobTitle?.(event.target.value)} maxLength={20} className={inputClass} /> : jobTitle}
          </Value>
          <Label>성 명</Label>
          <Value>
            {editing ? <input aria-label="성명" value={applicantName} onChange={(event) => onApplicantName?.(event.target.value)} maxLength={40} className={inputClass} /> : applicantName}
          </Value>
          <Label>비상연락망</Label>
          <Value className="border-r-0">
            {editing ? <input aria-label="비상연락망" value={emergencyContact} onChange={(event) => onEmergencyContact?.(event.target.value)} maxLength={40} className={inputClass} /> : emergencyContact}
          </Value>
          <Label>구 분</Label>
          <div className={cn('col-span-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-3 py-2 text-sm', line)}>
            {LEAVE_TYPES.map((item) => (
              <button
                key={item}
                type="button"
                disabled={!editing}
                onClick={() => onLeaveType?.(item)}
                className={cn('inline-flex items-center gap-1.5', editing && 'cursor-pointer')}
              >
                <span className={cn('inline-flex size-4 items-center justify-center border text-[11px] leading-none', line)}>{leaveType === item ? '✓' : ''}</span>
                {item}
              </button>
            ))}
          </div>
          <Label>휴가기간</Label>
          <div className={cn('col-span-3 flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm', line)}>
            {editing ? (
              <>
                <input type="date" aria-label="휴가 시작일" value={startDate} onChange={(event) => onStartDate?.(event.target.value)} className={inputClass} />
                <span>~</span>
                <input type="date" aria-label="휴가 종료일" value={endDate} onChange={(event) => onEndDate?.(event.target.value)} className={inputClass} />
              </>
            ) : (
              <span>{start.year}년 {start.month}월 {start.day}일 ~ {end.year}년 {end.month}월 {end.day}일</span>
            )}
          </div>
          <Label className="min-h-48 border-b-0">세부사항</Label>
          <div className="col-span-3 min-h-48 min-w-0">
            {editing && onDetail ? (
              <ProposalBodyEditor value={detail} onChange={onDetail} label="세부사항" />
            ) : (
              <ProposalBodyView value={detail} print={print} />
            )}
          </div>
        </div>

        <div className="px-6 py-8 text-center text-sm leading-8">
          <p>위와 같이 휴가를 신청하오니 허락하여 주시기 바랍니다.</p>
          <p className="mt-6">
            {editing ? (
              <input type="date" aria-label="신청일" value={draftedOn} onChange={(event) => onDraftedOn?.(event.target.value)} className="mx-auto h-7 bg-transparent text-center text-sm outline-none" />
            ) : (
              <span>{applied.year}년 {applied.month}월 {applied.day}일</span>
            )}
          </p>
          <p className="mt-4">신청자 : {applicantName || '　　　　'} (인)</p>
        </div>
      </div>
    </div>
  )
}

const line = 'border-slate-900 dark:border-slate-400'
const inputClass = 'h-7 min-w-0 bg-transparent text-sm outline-none'

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
