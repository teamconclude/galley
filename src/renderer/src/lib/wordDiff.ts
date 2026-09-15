// Marks the words that differ between a removed line and the added line that replaced
// it, so a one-word edit does not paint the whole line.
export interface Segment {
  text: string
  changed: boolean
}

const tokens = (line: string): string[] => line.match(/\w+|\s+|[^\w\s]/g) ?? []

export function wordDiff(before: string, after: string): [Segment[], Segment[]] | null {
  const a = tokens(before)
  const b = tokens(after)
  if (a.length === 0 || b.length === 0 || a.length * b.length > 250_000) return null
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  // Lines that share less than half their words are just different lines.
  if (dp[0][0] * 2 < Math.max(a.length, b.length)) return null
  const left: Segment[] = []
  const right: Segment[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      left.push({ text: a[i++], changed: false })
      right.push({ text: b[j++], changed: false })
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      left.push({ text: a[i++], changed: true })
    } else {
      right.push({ text: b[j++], changed: true })
    }
  }
  while (i < a.length) left.push({ text: a[i++], changed: true })
  while (j < b.length) right.push({ text: b[j++], changed: true })
  return [merge(left), merge(right)]
}

function merge(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    const last = out[out.length - 1]
    if (last && last.changed === s.changed) last.text += s.text
    else out.push({ ...s })
  }
  return out
}
