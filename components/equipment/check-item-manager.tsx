'use client'

import { useState, useTransition } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CellSelect } from '@/components/shared/cell-select'
import { ItemDeleteButton } from '@/components/shared/item-delete-button'
import { createDailyCheckItem, deleteDailyCheckItem, updateDailyCheckItem } from '@/app/actions/equipment'
import { CHECK_METHODS, ITEM_CYCLES } from '@/lib/constants/check-catalog'

export interface CheckItem {
  id: number
  itemNo: number
  content: string
  method: string | null
  cycle: string | null
}

const selectClass = 'h-10 rounded-lg border border-input bg-background px-2 text-sm'

export function CheckItemManager({ equipmentId, items }: { equipmentId: number; items: CheckItem[] }) {
  const [draft, setDraft] = useState({ content: '', method: '육안', cycle: '일' })
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    const content = draft.content.trim()
    if (!content) {
      toast.error('점검 내용을 입력해주세요.')
      return
    }
    startTransition(async () => {
      try {
        const nextNo = items.length > 0 ? Math.max(...items.map((i) => i.itemNo)) + 1 : 1
        await createDailyCheckItem(equipmentId, { itemNo: nextNo, ...draft, content })
        setDraft({ content: '', method: '육안', cycle: '일' })
        toast.success('점검 항목을 추가했습니다.')
      } catch {
        toast.error('추가에 실패했습니다.')
      }
    })
  }

  function handleUpdate(item: CheckItem, field: 'content' | 'method' | 'cycle', value: string) {
    if ((item[field] ?? '') === value) return
    startTransition(async () => {
      try {
        await updateDailyCheckItem(item.id, equipmentId, { [field]: value })
      } catch {
        toast.error('수정에 실패했습니다.')
      }
    })
  }

  function handleDelete(item: CheckItem) {
    startTransition(async () => {
      try {
        await deleteDailyCheckItem(item.id, equipmentId)
        toast.success(`${item.itemNo}번 항목을 삭제했습니다.`)
      } catch {
        toast.error('삭제에 실패했습니다.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          등록된 점검 항목이 없습니다. 아래에서 추가하세요.
        </p>
      )}

      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 sm:flex-nowrap">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold tabular-nums">
            {item.itemNo}
          </span>
          <Input
            defaultValue={item.content}
            onBlur={(e) => handleUpdate(item, 'content', e.target.value.trim())}
            aria-label={`${item.itemNo}번 점검 내용`}
            className="h-10 min-w-0 flex-1 basis-full sm:basis-auto"
          />
          <CellSelect
            value={item.method || '육안'}
            options={CHECK_METHODS}
            onChange={(value) => handleUpdate(item, 'method', value)}
            aria-label="점검방법"
            className={`${selectClass} w-28`}
          />
          <CellSelect
            value={item.cycle || '일'}
            options={ITEM_CYCLES}
            onChange={(value) => handleUpdate(item, 'cycle', value)}
            aria-label="주기"
            className={`${selectClass} w-20`}
          />
          <ItemDeleteButton onConfirm={() => handleDelete(item)} disabled={pending} />
        </div>
      ))}

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-2 sm:flex-nowrap">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PlusIcon className="size-4" aria-hidden="true" />
        </span>
        <Input
          value={draft.content}
          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd()
          }}
          placeholder="새 점검 항목 내용"
          className="h-10 min-w-0 flex-1 basis-full bg-background sm:basis-auto"
        />
        <CellSelect
          value={draft.method}
          options={CHECK_METHODS}
          onChange={(value) => setDraft((d) => ({ ...d, method: value }))}
          aria-label="새 항목 점검방법"
          className={`${selectClass} w-28`}
        />
        <CellSelect
          value={draft.cycle}
          options={ITEM_CYCLES}
          onChange={(value) => setDraft((d) => ({ ...d, cycle: value }))}
          aria-label="새 항목 주기"
          className={`${selectClass} w-20`}
        />
        <Button onClick={handleAdd} disabled={pending} className="h-10 px-4">
          추가
        </Button>
      </div>
    </div>
  )
}
