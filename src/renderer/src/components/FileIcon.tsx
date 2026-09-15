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

export default function FileIcon({ name }: { name: string }): React.JSX.Element {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  const [Glyph, color] = types[ext] ?? [File, '#6d8086']
  return <Glyph className="file-icon" size={16} strokeWidth={1.75} color={color} aria-hidden />
}
