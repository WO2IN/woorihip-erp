import { redirect } from 'next/navigation'

export default async function EquipmentRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ floor?: string }>
}) {
  const { floor } = await searchParams
  redirect(floor ? `/checksheets?floor=${floor}` : '/checksheets')
}
