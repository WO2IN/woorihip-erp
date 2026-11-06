'use client'

import { useEffect, useRef, useState } from 'react'

export const SECRET_TOGGLE_CODE = 'woorihip'

const IGNORED_TARGETS = 'input, textarea, select, [contenteditable="true"]'
const RESET_MS = 1500

/** 입력창 밖에서 `code`를 타이핑하면 on/off가 토글된다. */
export function useSecretToggle(code: string = SECRET_TOGGLE_CODE) {
  const [open, setOpen] = useState(false)
  const buffer = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches(IGNORED_TARGETS)) return
      buffer.current = `${buffer.current}${event.key.toLowerCase()}`.slice(-code.length)
      if (buffer.current === code) {
        setOpen((value) => !value)
        buffer.current = ''
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        buffer.current = ''
      }, RESET_MS)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [code])

  return [open, setOpen] as const
}
