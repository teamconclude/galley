import { useEffect, useState } from 'react'
import type { PreviewState } from '../../../shared/types'
import Preview from './Preview'

// The whole window is the preview pane, bar included; the main window feeds it.
export default function DetachedPreview(): React.JSX.Element {
  const [state, setState] = useState<PreviewState | null>(null)
  useEffect(() => {
    void window.api.preview.state().then((s) => {
      if (s) setState(s)
    })
    return window.api.preview.onState(setState)
  }, [])
  return (
    <div className="detached">
      <Preview
        status={state?.status ?? { state: 'starting' }}
        url={state?.url ?? null}
        mode={state?.mode ?? 'html'}
        onMode={(mode) => window.api.preview.setMode(mode)}
        version={state?.version ?? 0}
        reloadKey={0}
        detached
        onDetach={() => {}}
        onAttach={() => window.api.preview.attach()}
        targets={window.api.preview.onTarget}
      />
    </div>
  )
}
