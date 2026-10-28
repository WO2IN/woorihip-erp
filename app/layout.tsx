import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/app-shell'

export const metadata: Metadata = {
  title: 'WOORI-HIP',
  description: 'WOORI-HIP 통합 업무 관리 시스템',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0078D4',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-background antialiased font-sans">
        <AppShell>
          {children}
        </AppShell>

        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
