import { redirect } from 'next/navigation'

export default function ProcessNcRedirectPage() {
  redirect('/quality/nonconformity?tab=process')
}
