import { useState } from 'react'
import type { ImageReplacement, ImageSize, PageInfo } from '../../../shared/types'
import { Dialog } from './Dialogs'

interface Props {
  // The image being replaced, as a path in the checkout.
  path: string
  plan: ImageReplacement
  pages: Map<string, PageInfo>
  onSubmit: (name: string) => void
  onCancel: () => void
}

const sizeText = (size: ImageSize | null): string =>
  size ? `${Math.round(size.width)} × ${Math.round(size.height)}` : 'size unknown'

// Proportions within a percent of each other look the same on a page.
const sameShape = (a: ImageSize, b: ImageSize): boolean =>
  Math.abs(a.width * b.height - b.width * a.height) <= 0.01 * a.width * b.height

const listed = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

// Shows both pictures and where the image is used, and offers a name for the new one:
// a new name for a published image, since browsers and caches keep the old picture under
// the old address.
export default function ReplaceImageDialog(props: Props): React.JSX.Element {
  const { path, plan, pages, onSubmit, onCancel } = props
  const dir = path.slice(0, path.lastIndexOf('/'))
  const current = path.slice(path.lastIndexOf('/') + 1)
  const ext = plan.name.slice(plan.name.lastIndexOf('.'))
  const [stem, setStem] = useState(plan.name.slice(0, -ext.length))
  const name = stem.trim() + ext
  const same = name === current
  const validStem = /^[a-z0-9][a-z0-9._-]*$/.test(stem.trim())
  const taken = !same && plan.taken.includes(name)
  const { size, oldSize } = plan
  const resized =
    size && oldSize && !(size.width === oldSize.width && size.height === oldSize.height)
  const reshaped = size && oldSize && !sameShape(size, oldSize)
  const sized = plan.uses.reduce((n, use) => n + use.sized, 0)
  const title = (rel: string): string => pages.get(rel)?.title || rel

  return (
    <Dialog
      title={`Replace ${current}`}
      submitLabel={same && plan.published ? 'Replace under the same name' : 'Replace'}
      canSubmit={validStem && !taken}
      onSubmit={() => onSubmit(name)}
      onCancel={onCancel}
    >
      <div className="replace-images">
        <figure>
          <img src={`galley://repo/${path}`} alt="" />
          <figcaption>Now · {sizeText(oldSize)}</figcaption>
        </figure>
        <figure>
          <img src={plan.preview} alt="" />
          <figcaption>New · {sizeText(size)}</figcaption>
        </figure>
      </div>
      {reshaped ? (
        <p className="dialog-warning">
          The new picture has other proportions than the old one, so it will not fill the same space
          on the page.
          {sized > 0 &&
            ` ${sized === 1 ? 'One use gives' : `${sized} uses give`} a width and height; the height changes to fit the new picture.`}
        </p>
      ) : (
        resized && (
          <p className="dialog-note">
            The new picture is {size.width > oldSize.width ? 'larger' : 'smaller'} than the old one,
            with the same proportions.
          </p>
        )
      )}
      <div className="dialog-field">
        <span>Used on</span>
        {plan.uses.length === 0 ? (
          <p className="dialog-note">No page uses this image.</p>
        ) : (
          <ul className="replace-uses">
            {plan.uses.map((use) => (
              <li key={use.path} title={use.path}>
                {title(use.path)}
                {use.count > 1 && <span> · {use.count} times</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="dialog-field">
        <span>Name of the new picture</span>
        <span className="dialog-address">
          <input
            autoFocus
            value={stem}
            spellCheck={false}
            onChange={(e) => setStem(e.target.value.toLowerCase())}
          />
          <span>{ext}</span>
        </span>
        {!validStem ? (
          <small className="error">Lowercase letters, digits and hyphens.</small>
        ) : taken ? (
          <small className="error">{name} already exists in this folder.</small>
        ) : (
          <small>In {dir}, beside the old picture.</small>
        )}
      </label>
      {same && plan.published ? (
        <div className="dialog-warning loud">
          <strong>Readers will go on seeing the old picture.</strong> This image is published, and
          browsers and caches keep a picture for weeks without asking for it again. Under the same
          name, many readers see the old one long after the change, some pages even old and new side
          by side. Keep the name only if other sites or emails link to this picture and must show
          the new one.
        </div>
      ) : same ? (
        <p className="dialog-note">
          The image is not published yet, so it can keep its name.
          {plan.uses.length > 0 && ' The pages that use it show the new picture.'}
        </p>
      ) : (
        <p className="dialog-note">
          {plan.uses.length > 0 && `The pages that use it are changed to show ${name}. `}
          {plan.keptFor.length === 0
            ? `${current} goes to the Trash.`
            : `${current} stays, since ${plan.keptFor.length === 1 ? 'the branch' : 'the branches'} ${listed(plan.keptFor)} on GitHub ${plan.keptFor.length === 1 ? 'uses' : 'use'} it.`}
        </p>
      )}
    </Dialog>
  )
}
