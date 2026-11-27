'use client'

import { useState } from 'react'

/** 서명 이미지를 보여 준다. 서명을 불러오지 못하면 칸을 비워 두고, 누구 서명인지는 아래 이름 칸에 적는다. */
export function SignatureOrName({ src, name, className }: { src: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} onError={() => setFailed(true)} className={className ?? 'mx-auto h-10 w-auto max-w-[90%] object-contain'} />
}
