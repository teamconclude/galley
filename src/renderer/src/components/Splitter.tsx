interface Props {
  direction: 'horizontal' | 'vertical'
  onDrag: (delta: number) => void
  hidden?: boolean
}

export default function Splitter({ direction, onDrag, hidden }: Props): React.JSX.Element {
  const start = (e: React.MouseEvent): void => {
    e.preventDefault()
    const axis = (ev: { clientX: number; clientY: number }): number =>
      direction === 'horizontal' ? ev.clientX : ev.clientY
    let last = axis(e)
    const move = (ev: MouseEvent): void => {
      onDrag(axis(ev) - last)
      last = axis(ev)
    }
    const stop = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
      document.body.classList.remove('dragging', `dragging-${direction}`)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
    document.body.classList.add('dragging', `dragging-${direction}`)
  }
  return <div className={`splitter ${direction}`} hidden={hidden} onMouseDown={start} />
}
