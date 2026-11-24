import { ExplorerView } from '@/components/explorer/explorer-view'

interface ExplorerPageProps {
  searchParams: Promise<{ company?: string; docType?: string }>
}

export default async function ExplorerPage({ searchParams }: ExplorerPageProps) {
  const params = await searchParams

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ExplorerView
        initialCompany={params.company}
        initialDocType={params.docType}
      />
    </div>
  )
}