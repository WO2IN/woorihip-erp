'use client'

import { Suspense } from 'react'
import { Upload } from 'lucide-react'
import { UploadForm } from '@/components/upload/upload-form'
import { useAuth } from '@/components/auth/auth-context'

export default function UploadPage() {
  const { user, loading } = useAuth()

  if (loading) {
    return null
  }

  if (user?.role === 'viewer') {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
            <Upload className="w-7 h-7 text-red-500" />
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            권한이 없습니다.
          </h1>

          <p className="mt-2 text-muted-foreground">
            문서 등록은 편집자 및 관리자만 사용할 수 있습니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <div className="mb-4 shrink-0">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 dark:bg-green-950/30">
            <Upload className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">문서 등록</h1>
            <p className="text-sm text-muted-foreground">성적서(PDF)를 등록합니다. 도면·기타는 준비 중입니다.</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
          <UploadForm />
        </Suspense>
      </div>
    </div>
  )
}