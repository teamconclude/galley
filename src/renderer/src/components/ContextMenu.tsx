import { useEffect } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  // A second, muted line, e.g. what a block is for.
  description?: string
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const described = items.some((item) => item.description)
  const rowHeight = described ? 46 : 28
  const height = Math.min(items.length * rowHeight + 12, window.innerHeight * 0.7)
  const left = Math.min(x, window.innerWidth - (described ? 320 : 200))
  const top = Math.min(y, window.innerHeight - height - 12)
  return (
    <div
      className={described ? 'context-menu described' : 'context-menu'}
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className={item.danger ? 'danger' : ''}
          onClick={() => {
            onClose()
            item.onClick()
          }}
        >
          {item.label}
          {item.description && <small>{item.description}</small>}
        </button>
      ))}
    </div>
  )
}
