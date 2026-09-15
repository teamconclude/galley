// Splits a unified diff into its file header and hunks, each hunk starting at its @@ line.
export function splitDiff(text: string): { header: string; hunks: string[] } {
  const lines = text.replace(/\n$/, '').split('\n')
  const first = lines.findIndex((l) => l.startsWith('@@'))
  if (first < 0) return { header: text, hunks: [] }
  const header = lines.slice(0, first).join('\n') + '\n'
  const hunks: string[] = []
  for (const line of lines.slice(first)) {
    if (line.startsWith('@@')) hunks.push(line)
    else hunks[hunks.length - 1] += '\n' + line
  }
  return { header, hunks }
}
