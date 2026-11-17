import type { ProposalFormType } from '@/lib/approval'
import { ProposalSheet, type ProposalStamp } from '@/components/approvals/proposal-sheet'

export function ProposalPrintPage({
  formType,
  docNo,
  draftedOn,
  retention,
  department,
  drafterName,
  title,
  body,
  destination,
  stamps,
}: {
  formType: ProposalFormType
  docNo: string
  draftedOn: string
  retention: string
  department: string
  drafterName: string
  agreement: string
  opinion: string
  receiver: string
  reference: string
  title: string
  body: string
  destination: string
  stamps: ProposalStamp[]
}) {
  return (
    <article className="proposal-print-page proposal-print-sheet">
      <ProposalSheet
        print
        formType={formType}
        docNo={docNo}
        draftedOn={draftedOn}
        retention={retention}
        department={department}
        drafterName={drafterName}
        agreement=""
        opinion=""
        receiver=""
        reference=""
        title={title}
        body={body}
        destination={destination}
        stamps={stamps}
      />
    </article>
  )
}
