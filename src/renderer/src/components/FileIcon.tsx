import {
  Braces,
  CodeXml,
  File,
  FileCode2,
  FileText,
  FileType,
  Image,
  ListTree,
  SquareTerminal,
  type LucideIcon
} from 'lucide-react'

// One lucide icon and one colour per file type, in the spirit of VS Code's file icons.
const types: Record<string, [LucideIcon, string]> = {
  md: [FileText, '#519aba'],
  markdown: [FileText, '#519aba'],
  txt: [FileText, '#6d8086'],
  yml: [ListTree, '#a074c4'],
  yaml: [ListTree, '#a074c4'],
  toml: [ListTree, '#8dc149'],
  json: [Braces, '#cbcb41'],
  scss: [Braces, '#f55385'],
  sass: [Braces, '#f55385'],
  css: [Braces, '#519aba'],
  html: [CodeXml, '#e37933'],
  xml: [CodeXml, '#e37933'],
  js: [FileCode2, '#cbcb41'],
  mjs: [FileCode2, '#cbcb41'],
  cjs: [FileCode2, '#cbcb41'],
  ts: [FileCode2, '#519aba'],
  tsx: [FileCode2, '#519aba'],
  go: [FileCode2, '#519aba'],
  sh: [SquareTerminal, '#4d5a5e'],
  svg: [Image, '#e37933'],
  png: [Image, '#a074c4'],
  jpg: [Image, '#a074c4'],
  jpeg: [Image, '#a074c4'],
  gif: [Image, '#a074c4'],
  webp: [Image, '#a074c4'],
  avif: [Image, '#a074c4'],
  ico: [Image, '#a074c4'],
  pdf: [FileType, '#cc3e44']
}

// Larger icons, e.g. for tree rows with a page title below the name, get a finer stroke.
export default function FileIcon(props: { name: string; size?: number }): React.JSX.Element {
  const { name, size = 16 } = props
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  const [Glyph, color] = types[ext] ?? [File, '#6d8086']
  const stroke = size > 20 ? 1.25 : 1.75
  return <Glyph className="file-icon" size={size} strokeWidth={stroke} color={color} aria-hidden />
}
