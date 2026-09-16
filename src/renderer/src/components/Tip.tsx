import { useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  text: string
  children: React.ReactElement<{
    onMouseEnter?: () => void
    onMouseLeave?: () => void
    onMouseDown?: (e: React.MouseEvent<HTMLElement>) => void
  }>
}

// A tooltip drawn above the element in a layer of its own, so the fixed-height rows and
// scrolling lists it lives in cannot clip it. Native title tooltips are unreliable here.
export default function Tip({ text, children }: Props): React.JSX.Element {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const child = children
  return (
    <>
      <child.type
        {...child.props}
        onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: r.left + r.width / 2, y: r.top })
          child.props.onMouseEnter?.()
        }}
        onMouseLeave={() => {
          setAt(null)
          child.props.onMouseLeave?.()
        }}
        onMouseDown={(e: React.MouseEvent<HTMLElement>) => {
          setAt(null)
          child.props.onMouseDown?.(e)
        }}
      />
      {at &&
        createPortal(
          <div className="tip" style={{ left: at.x, top: at.y }}>
            {text}
          </div>,
          document.body
        )}
    </>
  )
}
