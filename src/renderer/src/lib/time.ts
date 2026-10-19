// How long ago a moment was, in words; older than a week gives the date.
export function ago(time: number | null): string {
  if (!time) return 'not yet'
  const minutes = Math.round((Date.now() - time) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes === 1) return 'a minute ago'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours === 1) return 'an hour ago'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(time).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: new Date(time).getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  })
}
