// Without a Developer ID, electron-builder leaves the arm64 bundle with Electron's own
// signature and a broken code seal, which Gatekeeper reports as damaged with no way to open
// it, and the x64 bundle with no signature at all. An ad-hoc signature over the finished
// bundle gives it a valid seal, so "Open Anyway" works.
const { spawnSync } = require('child_process')
const { join } = require('path')

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const info = spawnSync('codesign', ['-dv', app], { encoding: 'utf8' }).stderr
  if (!info.includes('TeamIdentifier=not set') && !info.includes('not signed at all')) return
  const result = spawnSync('codesign', ['--force', '--deep', '--sign', '-', app], {
    stdio: 'inherit'
  })
  if (result.status !== 0) throw new Error('ad-hoc signing failed')
  console.log('  • signed ad hoc   app=' + app)
}
