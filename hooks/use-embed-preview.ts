'use client'

import { useEffect, useLayoutEffect } from 'react'

export const EMBED_READY_MESSAGE = 'woorihip-embed-ready'

/**
 * 주소에 `?embed=1` 이 붙으면 서류 한 장만 보이는 미리보기 화면으로 바꾼다 (제품 이력 창의 iframe 용).
 * 메뉴·머리글·목록·버튼은 globals.css 의 `html.embed-preview` 규칙으로 숨긴다.
 * shown 이 true 가 되면(서류가 화면에 뜨면) 부모 창에 알려 로딩 표시를 끄게 한다.
 */
export function useEmbedPreview(searchParams: { get(name: string): string | null }, shown: boolean) {
  const embed = searchParams.get('embed') === '1'

  useLayoutEffect(() => {
    if (!embed) return
    document.documentElement.classList.add('embed-preview')
    return () => document.documentElement.classList.remove('embed-preview')
  }, [embed])

  useEffect(() => {
    if (!embed || !shown || window.parent === window) return
    window.parent.postMessage({ type: EMBED_READY_MESSAGE }, window.location.origin)
  }, [embed, shown])

  return embed
}
