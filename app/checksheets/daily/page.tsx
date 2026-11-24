import { redirect } from 'next/navigation'

export default async function DailyCheckIndexPage({ searchParams }: { searchParams: Promise<{ floor?: string }> }) {
  const { floor } = await searchParams
  redirect(floor ? `/checksheets?floor=${encodeURIComponent(floor)}` : '/checksheets')
}
