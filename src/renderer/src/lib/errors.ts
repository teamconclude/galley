const describe = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error)

// Sends an error to Galley's log, each message once, so one failing over and over does
// not fill it.
const reported = new Set<string>()
export function reportError(error: unknown, more = ''): void {
  const text = describe(error) + more
  if (reported.has(text) || reported.size > 50) return
  reported.add(text)
  window.api.log.error(text)
}
