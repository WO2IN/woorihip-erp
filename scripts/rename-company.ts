/**
 * 업체명 일괄 변경 (예: (주)디율 → 디율)
 * npx tsx --env-file=.env.local scripts/rename-company.ts "(주)디율" "디율"
 */
import { query } from '@/lib/db'
import { readMetadata, updateMetadata, readConfig, writeConfig } from '@/lib/storage'
import { buildCertificateObjectKey } from '@/lib/stored-files'
import { yearFromIssueDate } from '@/lib/lot'

const from = process.argv[2]
const to = process.argv[3]
if (!from || !to) {
  console.error('Usage: rename-company.ts <from> <to>')
  process.exit(1)
}

async function main() {
  let metaUpdated = 0
  for (const doc of await readMetadata()) {
    if (doc.company !== from) continue
    const updates: Record<string, string> = { company: to }
    if (doc.storagePath?.startsWith(`${from}/`)) {
      const fileName = doc.storagePath.split('/').pop()!
      const year = yearFromIssueDate(doc.issueDate) || doc.year || '0000'
      updates.storagePath = buildCertificateObjectKey(to, year, fileName)
    }
    await updateMetadata(doc.id, updates)
    metaUpdated += 1
  }

  const companies = await readConfig('companies')
  const next = [...new Set(companies.map((c) => (c === from ? to : c)).filter(Boolean))]
  if (!next.includes(to)) next.push(to)
  await writeConfig('companies', next.sort((a, b) => a.localeCompare(b, 'ko')))

  const sf = await query(
    `UPDATE stored_files
     SET company = $2,
         legacy_key = REPLACE(legacy_key, $1, $2),
         object_key = REPLACE(object_key, $1, $2)
     WHERE company = $1 OR legacy_key LIKE $3 OR object_key LIKE $3
     RETURNING id`,
    [from, to, `%${from}%`],
  )

  console.log(JSON.stringify({ from, to, metaUpdated, storedFiles: sf.length, companies: next.filter((c) => c.includes('디율')) }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
