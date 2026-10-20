import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSchemas } from '../lib/contexts'
import { imageFolder, imagePath, imageUrl, sectionImageFolder } from '../lib/site'

interface Props {
  value: string
  onPick: (path: string) => void
  onClose: () => void
}

const limit = 300
const allFolders = ''

// Pictures to choose from: the ones this branch brings first, as those are usually what
// the page is waiting for, then one folder at a time, starting at the page's section.
export default function ImagePicker({ value, onPick, onClose }: Props): React.JSX.Element {
  const { site, images, page, importImage } = useSchemas()
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const folders = useMemo(
    () => [...new Set(images.map((p) => p.slice(0, p.lastIndexOf('/'))))].sort(),
    [images]
  )
  const section = sectionImageFolder(site, page)
  const [folder, setFolder] = useState(() => {
    const own = imageFolder(site, value)
    if (value && folders.includes(own)) return own
    return folders.includes(section) ? section : allFolders
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let live = true
    void window.api.git
      .added(site.imagesDir)
      .then((paths) => live && setAdded(paths.map((p) => imageUrl(site, p))))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [site, images])

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (p: string): boolean => words.every((w) => p.toLowerCase().includes(w))
  const inFolder = (p: string): boolean =>
    folder === allFolders || p.slice(0, p.lastIndexOf('/')) === folder
  const known = new Set(images)
  const fresh = added.filter((p) => known.has(p) && matches(p))
  const matching = images.filter((p) => matches(p) && inFolder(p))
  const elsewhere = folder === allFolders ? 0 : images.filter((p) => matches(p)).length
  const shown = matching.slice(0, limit)

  const upload = async (): Promise<void> => {
    const path = await importImage(folder === allFolders ? section : folder)
    if (path) onPick(path)
  }

  const label = (f: string): string => f.slice(site.imagesUrl.length + 1) || 'Top level'
  const name = (p: string): string =>
    folder === allFolders || !inFolder(p)
      ? p.slice(site.imagesUrl.length + 1)
      : p.slice(p.lastIndexOf('/') + 1)
  const tile = (path: string): React.JSX.Element => (
    <button
      key={path}
      className={'image-tile' + (path === value ? ' selected' : '')}
      title={path}
      onClick={() => onPick(path)}
    >
      <img src={`galley://repo/${imagePath(site, path)}`} loading="lazy" alt="" />
      <span>{name(path)}</span>
    </button>
  )

  // Rendered at the top of the page, out of reach of the styles of the toolbar or form
  // field that opened it.
  return createPortal(
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
          <select
            value={folder}
            title="The folder to show"
            onChange={(e) => setFolder(e.target.value)}
          >
            <option value={allFolders}>All folders</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {label(f)}
              </option>
            ))}
          </select>
          <button
            onClick={() => void upload()}
            title={`Copies a picture from your computer into ${imagePath(site, folder || section)}`}
          >
            Upload…
          </button>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="image-scroll">
          {fresh.length > 0 && (
            <>
              <h4 className="image-group">New on this branch</h4>
              <div className="image-grid">{fresh.map(tile)}</div>
              <h4 className="image-group">
                {folder === allFolders ? 'All folders' : label(folder)}
              </h4>
            </>
          )}
          <div className="image-grid">{shown.map(tile)}</div>
        </div>
        <div className="modal-foot">
          <span>
            {matching.length > shown.length
              ? `Showing ${shown.length} of ${matching.length} images. Type to narrow down.`
              : `${matching.length} image${matching.length === 1 ? '' : 's'}`}
          </span>
          {elsewhere > matching.length && (
            <button className="link-button" onClick={() => setFolder(allFolders)}>
              {elsewhere - matching.length} more in other folders
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
