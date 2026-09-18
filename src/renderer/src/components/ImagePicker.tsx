import { useEffect, useState } from 'react'
import { useSchemas } from '../lib/contexts'
import { imageFolder, imagePath } from '../lib/site'

interface Props {
  value: string
  onPick: (path: string) => void
  onClose: () => void
}

const limit = 300

export default function ImagePicker({ value, onPick, onClose }: Props): React.JSX.Element {
  const { site, images, importImage } = useSchemas()
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matching = images.filter((p) => words.every((w) => p.toLowerCase().includes(w)))
  const shown = matching.slice(0, limit)
  const folder = imageFolder(site, value)

  const add = async (): Promise<void> => {
    const path = await importImage(folder)
    if (path) onPick(path)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="pane-bar">
          <input
            autoFocus
            type="search"
            placeholder="Search images…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={() => void add()}
            title={`Copies the file into ${imagePath(site, folder)}`}
          >
            Add from disk…
          </button>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="image-grid">
          {shown.map((path) => (
            <button
              key={path}
              className={'image-tile' + (path === value ? ' selected' : '')}
              title={path}
              onClick={() => onPick(path)}
            >
              <img src={`galley://repo/${imagePath(site, path)}`} loading="lazy" alt="" />
              <span>{path.slice(site.imagesUrl.length + 1)}</span>
            </button>
          ))}
        </div>
        <div className="modal-foot">
          {matching.length > shown.length
            ? `Showing ${shown.length} of ${matching.length} images. Type to narrow down.`
            : `${matching.length} image${matching.length === 1 ? '' : 's'}`}
        </div>
      </div>
    </div>
  )
}
