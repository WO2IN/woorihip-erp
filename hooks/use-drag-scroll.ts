'use client'

import { useCallback, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

const DRAG_THRESHOLD = 5

/**
 * 마우스로 가로 스크롤 영역을 꾹 드래그해서 옆으로 넘길 수 있게 한다.
 * 터치는 브라우저 기본 스크롤을 그대로 쓴다.
 * 드래그한 직후의 클릭은 무시해서 카드가 실수로 열리지 않게 한다.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 })
  const [dragging, setDragging] = useState(false)

  const onPointerDown = useCallback((event: PointerEvent<T>) => {
    const el = ref.current
    if (!el || event.pointerType !== 'mouse' || event.button !== 0) return
    drag.current = { active: true, moved: false, startX: event.clientX, startLeft: el.scrollLeft }
  }, [])

  const onPointerMove = useCallback((event: PointerEvent<T>) => {
    const el = ref.current
    const state = drag.current
    if (!el || !state.active) return
    const dx = event.clientX - state.startX
    if (!state.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      state.moved = true
      setDragging(true)
    }
    el.scrollLeft = state.startLeft - dx
  }, [])

  const endDrag = useCallback(() => {
    drag.current.active = false
    setDragging(false)
  }, [])

  // 드래그로 움직인 뒤 떨어진 클릭은 카드/버튼으로 전달하지 않는다.
  const onClickCapture = useCallback((event: MouseEvent<T>) => {
    if (drag.current.moved) {
      event.preventDefault()
      event.stopPropagation()
      drag.current.moved = false
    }
  }, [])

  return {
    ref,
    dragging,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerLeave: endDrag,
      onPointerCancel: endDrag,
      onClickCapture,
    },
  }
}
