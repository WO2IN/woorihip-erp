'use client'

import { useEffect, useRef, useState } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SiblingItem = {
  id: string
  done: boolean
  /** 목록 제목 (보통 LOT 번호). 비어 있으면 'n번 ○○ · LOT 미입력' 으로 보인다. */
  title: string
  /** 제목 아래 이름표 칩. 값이 빈 칩은 빠진다. */
  chips: [label: string, value: string][]
}

/**
 * 같은 입고에서 나온 서류(이력카드·출하성적서) 목록.
 * 눌러서 고르고, 사이드바처럼 오른쪽 손잡이를 끌어 순서를 바꾸고, 한 장만 남지 않았으면 지울 수 있다.
 */
export function DocSiblingList({
  noun,
  barcode,
  items,
  activeId,
  canWrite,
  onSelect,
  onDelete,
  onReorder,
}: {
  /** '이력카드', '출하성적서' 처럼 서류 이름 */
  noun: string
  barcode?: string
  items: SiblingItem[]
  activeId: string
  canWrite: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (order: string[]) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragY, setDragY] = useState<number | null>(null)
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const dragRef = useRef<{ id: string; order: string[]; tops: number[]; height: number; grab: number } | null>(null)
  const shown = dragOrder
    ? dragOrder.map((id) => items.find((item) => item.id === id)).filter((item): item is SiblingItem => !!item)
    : items
  const many = items.length > 1

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0) return
    event.preventDefault()
    const order = items.map((item) => item.id)
    const rects = order.map((key) => rowRefs.current.get(key)?.getBoundingClientRect())
    if (rects.some((rect) => !rect)) return
    const tops = rects.map((rect) => rect!.top)
    const self = rects[order.indexOf(id)]!
    dragRef.current = { id, order, tops, height: self.height, grab: event.clientY - self.top }
    setDragY(event.clientY)
    setDragId(id)
    setDragOrder(order)
  }

  useEffect(() => {
    if (!dragId) return
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const y = Math.min(drag.tops[drag.tops.length - 1] + drag.grab, Math.max(drag.tops[0] + drag.grab, event.clientY))
      setDragY(y)
      const center = y - drag.grab + drag.height / 2
      const index = drag.tops.filter((top, i) => i > 0 && top + drag.height / 2 <= center).length
      const others = drag.order.filter((key) => key !== drag.id)
      const next = [...others.slice(0, index), drag.id, ...others.slice(index)]
      if (next.some((key, i) => key !== drag.order[i])) {
        drag.order = next
        setDragOrder(next)
      }
    }
    const finish = (event: PointerEvent) => {
      if (event.type === 'pointerup') move(event)
      const drag = dragRef.current
      dragRef.current = null
      setDragId(null)
      setDragY(null)
      setDragOrder(null)
      if (event.type !== 'pointerup' || !drag) return
      if (drag.order.every((key, i) => key === items[i]?.id)) return
      onReorder(drag.order)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  })

  const dragOffset = (id: string) => {
    const drag = dragRef.current
    if (!drag || drag.id !== id || dragY === null) return 0
    return dragY - drag.grab - drag.tops[drag.order.indexOf(id)]
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold text-muted-foreground">
        {noun} {items.length}장{barcode && <span className="ml-1 font-mono">· {barcode}</span>}
      </p>
      {shown.map((item, index) => {
        const active = item.id === activeId
        const dragging = dragId === item.id
        // 같은 입고 서류가 한 장만 남으면 지울 수 없다. 완료한 서류는 완료 취소 후 지운다.
        const removable = canWrite && many && !item.done
        const title = item.title.trim()
        const chips = item.chips.filter(([, value]) => value.trim())
        return (
          <div
            key={item.id}
            ref={(node) => { if (node) rowRefs.current.set(item.id, node); else rowRefs.current.delete(item.id) }}
            style={dragging ? { transform: `translateY(${dragOffset(item.id)}px)` } : undefined}
            className={cn(
              'relative flex items-start gap-1.5 rounded-xl border px-3 py-2.5 transition-colors',
              active ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40' : 'bg-white hover:bg-accent/60 dark:bg-card',
              dragging && 'z-20 scale-[1.02] cursor-grabbing shadow-xl transition-none',
            )}
          >
            <button type="button" onClick={() => onSelect(item.id)} aria-current={active} className="min-w-0 flex-1 text-left">
              <span className="flex items-center justify-between gap-2">
                {title ? (
                  <span className="min-w-0 truncate font-mono text-sm font-bold tracking-wide" title={title}>{title}</span>
                ) : (
                  <span className="min-w-0 truncate text-sm font-bold">
                    {index + 1}번 {noun} <span className="text-xs font-medium text-muted-foreground">· LOT 미입력</span>
                  </span>
                )}
                <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', item.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300')}>
                  {item.done ? '완료' : '작성중'}
                </span>
              </span>
              {chips.length > 0 && (
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {chips.map(([label, value]) => (
                    <span key={label} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] leading-4">
                      <span className="shrink-0 text-muted-foreground">{label}</span>
                      <span className="truncate font-mono font-semibold text-foreground" title={value}>{value}</span>
                    </span>
                  ))}
                </span>
              )}
            </button>
            {removable && (
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                title={`이 ${noun} 삭제`}
                aria-label={`${title || `${index + 1}번 ${noun}`} 삭제`}
                className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {canWrite && many && (
              <button
                type="button"
                onPointerDown={(event) => startDrag(event, item.id)}
                title="끌어서 순서 바꾸기"
                aria-label="끌어서 순서 바꾸기"
                className={cn('-my-2.5 -mr-3 flex shrink-0 touch-none items-center self-stretch rounded-r-xl border-l border-dashed border-slate-200 px-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500 dark:border-white/10 dark:hover:bg-white/10', dragging ? 'cursor-grabbing' : 'cursor-grab')}
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
