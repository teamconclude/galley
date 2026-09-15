// node-pty ships its spawn-helper for every architecture without the execute bit; npm's
// post-install only fixes the one for the machine it runs on, so the other build's terminal
// fails with "posix_spawnp failed". Mark all of them executable before the bundle is sealed.
const { chmodSync, existsSync, readdirSync } = require('fs')
const { join } = require('path')

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return
  const app = `${context.packager.appInfo.productFilename}.app`
  const prebuilds = join(
    context.appOutDir,
    app,
    'Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds'
  )
  if (!existsSync(prebuilds)) return
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
  }
}
