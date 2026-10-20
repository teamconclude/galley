import { Children, isValidElement, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import manual from '../../../../docs/manual/README.md?raw'

// The manual's screenshots, bundled, by the path the manual gives them, e.g. images/x.png.
const images: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../../docs/manual/images/*.png', {
      eager: true,
      query: '?url',
      import: 'default'
    }) as Record<string, string>
  ).map(([path, url]) => [path.slice(path.indexOf('images/')), url])
)

const textOf = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? textOf(child.props.children)
          : ''
    )
    .join('')

// The anchor GitHub gives a heading, so the manual's links work here and there alike.
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')

function Heading({ level, children }: { level: 1 | 2 | 3; children?: ReactNode }): ReactNode {
  const Tag = `h${level}` as const
  return <Tag id={slug(textOf(children))}>{children}</Tag>
}

// Galley's manual, docs/manual/README.md, in a window of its own: the same text GitHub
// shows, bundled with the app so it matches the version at hand and works offline.
export default function Manual(): React.JSX.Element {
  return (
    <div className="text-preview manual">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <Heading level={1}>{children}</Heading>,
          h2: ({ children }) => <Heading level={2}>{children}</Heading>,
          h3: ({ children }) => <Heading level={3}>{children}</Heading>,
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (!href) return
                if (href.startsWith('#')) {
                  document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' })
                } else window.api.openExternal(href)
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={(typeof src === 'string' && images[src]) || undefined} alt={alt} />
          )
        }}
      >
        {manual}
      </Markdown>
    </div>
  )
}
