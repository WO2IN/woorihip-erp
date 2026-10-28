'use client'

import { useState, useTransition } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CellSelect } from '@/components/shared/cell-select'
import { ItemDeleteButton } from '@/components/shared/item-delete-button'
import { createFiveSCheckItem, deleteFiveSCheckItem, updateFiveSCheckItem } from '@/app/actions/five-s'
import { FIVE_S_CATEGORIES } from '@/lib/constants/five-s-catalog'
import type { FiveSCheckItem } from '@/components/checksheets/five-s/five-s-grid'

const CYCLES = ['일', '주', '월'] as const
const selectClass = 'h-10 rounded-lg border border-input bg-background px-2 text-sm'

function CategorySection({
  targetId,
  category,
  items,
}: {
  targetId: number
  category: string
  items: FiveSCheckItem[]
}) {
  const [draft, setDraft] = useState({ content: '', cycle: '일' })
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    const content = draft.content.trim()
    if (!content) {
      toast.error('점검 내용을 입력해주세요.')
      return
    }
    startTransition(async () => {
      try {
        await createFiveSCheckItem(targetId, { category, content, cycle: draft.cycle })
        setDraft({ content: '', cycle: '일' })
        toast.success(`${category} 항목을 추가했습니다.`)
      } catch {
        toast.error('추가에 실패했습니다.')
      }
    })
  }

  function handleUpdate(item: FiveSCheckItem, field: 'content' | 'cycle', value: string) {
    if (item[field] === value) return
    startTransition(async () => {
      try {
        await updateFiveSCheckItem(item.id, targetId, { [field]: value })
      } catch {
        toast.error('수정에 실패했습니다.')
      }
    })
  }

  function handleDelete(item: FiveSCheckItem) {
    startTransition(async () => {
      try {
        await deleteFiveSCheckItem(item.id, targetId)
        toast.success('항목을 삭제했습니다.')
      } catch {
        toast.error('삭제에 실패했습니다.')
      }
    })
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {category}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{items.length}</span>
      </h3>

      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold tabular-nums">
            {index + 1}
          </span>
          <Input
            defaultValue={item.content}
            onBlur={(e) => handleUpdate(item, 'content', e.target.value.trim())}
            aria-label={`${category} ${index + 1}번 점검 내용`}
            className="h-10 min-w-0 flex-1"
          />
          <CellSelect
            value={item.cycle || '일'}
            options={CYCLES}
            onChange={(value) => handleUpdate(item, 'cycle', value)}
            aria-label="주기"
            className={`${selectClass} w-16`}
          />
          <ItemDeleteButton onConfirm={() => handleDelete(item)} disabled={pending} />
        </div>
      ))}

      <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PlusIcon className="size-4" aria-hidden="true" />
        </span>
        <Input
          value={draft.content}
          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd()
          }}
          placeholder={`새 ${category} 항목`}
          className="h-10 min-w-0 flex-1 bg-background"
        />
        <CellSelect
          value={draft.cycle}
          options={CYCLES}
          onChange={(value) => setDraft((d) => ({ ...d, cycle: value }))}
          aria-label="새 항목 주기"
          className={`${selectClass} w-16`}
        />
        <Button onClick={handleAdd} disabled={pending} className="h-10 px-4">
          추가
        </Button>
      </div>
    </section>
  )
}

export function FiveSItemManager({ targetId, items }: { targetId: number; items: FiveSCheckItem[] }) {
  return (
    <div className="flex flex-col gap-6">
      {FIVE_S_CATEGORIES.map((category) => (
        <CategorySection
          key={category}
          targetId={targetId}
          category={category}
          items={items.filter((item) => item.category === category).sort((a, b) => a.no - b.no)}
        />
      ))}
    </div>
  )
}
