'use client'

import { useEffect } from 'react'

export const DATA_CHANGED_EVENT = 'woorihip:data-changed'

export type DataChangeScope = 'documents' | 'config' | 'all'

export function notifyDataChanged(scope: DataChangeScope = 'all') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { scope } }))
}

export function useDataChanged(
  callback: (scope: DataChangeScope) => void,
  deps: unknown[] = []
) {
  useEffect(() => {
    const handler = (event: Event) => {
      const scope =
        (event as CustomEvent<{ scope: DataChangeScope }>).detail?.scope ?? 'all'
      callback(scope)
    }
    window.addEventListener(DATA_CHANGED_EVENT, handler)
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
