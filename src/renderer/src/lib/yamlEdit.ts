import { Document, YAMLSeq, isScalar, isSeq } from 'yaml'

export type Path = (string | number)[]

// Mutating an existing scalar keeps its block or plain style, so diffs stay small. Quotes
// are decided afresh: they may only have appeared because an earlier value needed them.
export function setValue(doc: Document, path: Path, value: unknown): void {
  const node = doc.getIn(path, true)
  if (isScalar(node) && (value === null || typeof value !== 'object')) {
    node.value = value
    if (node.type === 'QUOTE_DOUBLE' || node.type === 'QUOTE_SINGLE') node.type = undefined
    return
  }
  doc.setIn(path, value)
}

export function deleteAt(doc: Document, path: Path): void {
  doc.deleteIn(path)
}

export function insertAt(doc: Document, seqPath: Path, index: number, value: unknown): void {
  let seq = doc.getIn(seqPath, true)
  if (!isSeq(seq)) {
    doc.setIn(seqPath, [])
    seq = doc.getIn(seqPath, true) as YAMLSeq
  }
  ;(seq as YAMLSeq).items.splice(index, 0, doc.createNode(value))
}

export function moveItem(doc: Document, seqPath: Path, from: number, to: number): void {
  const seq = doc.getIn(seqPath, true)
  if (!isSeq(seq) || to < 0 || to >= seq.items.length) return
  const [item] = seq.items.splice(from, 1)
  seq.items.splice(to, 0, item)
}
