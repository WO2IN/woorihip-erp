/**
 * metadata.year 를 발행일 기준으로 맞춥니다.
 * npx tsx --env-file=.env.local scripts/sync-document-years-from-issue-date.ts
 */
import { yearFromIssueDate } from '@/lib/lot'
import { readMetadata, updateMetadata } from '@/lib/storage'

async function main() {
  const docs = await readMetadata()
  let updated = 0
  for (const doc of docs) {
    const y = yearFromIssueDate(doc.issueDate)
    if (!y || doc.year === y) continue
    await updateMetadata(doc.id, { year: y })
    updated += 1
    console.log(`fixed id=${doc.id} year ${doc.year} -> ${y} issueDate=${doc.issueDate}`)
  }
  console.log(JSON.stringify({ updated, total: docs.length }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
