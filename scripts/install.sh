#!/bin/sh
# Installs or updates Galley on this Mac from the latest GitHub release.
# Usage:  curl -fsSL https://github.com/teamconclude/galley/releases/latest/download/install.sh | sh
# A download made by curl carries no quarantine flag, so macOS opens the app without the
# "Apple could not verify" dialog that a browser download would trigger.
set -e
repo="https://github.com/teamconclude/galley"
dest="${GALLEY_INSTALL_DIR:-/Applications}"

if [ "$(uname -m)" != "arm64" ]; then
  echo "Galley needs a Mac with Apple silicon." >&2
  exit 1
fi
version=$(curl -fsSL "$repo/releases/latest/download/latest-mac.yml" | sed -n 's/^version: *//p')
[ -n "$version" ] || { echo "Could not find the latest Galley release." >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "Downloading Galley $version..."
curl -fL --progress-bar -o "$tmp/galley.zip" "$repo/releases/download/v$version/Galley-$version-arm64.zip"
ditto -x -k "$tmp/galley.zip" "$tmp"
[ -d "$tmp/Galley.app" ] || { echo "The download did not contain Galley.app." >&2; exit 1; }
if [ ! -w "$dest" ]; then
  dest="$HOME/Applications"
  mkdir -p "$dest"
fi
osascript -e 'tell application "Galley" to quit' >/dev/null 2>&1 || true
rm -rf "$dest/Galley.app"
mv "$tmp/Galley.app" "$dest/Galley.app"
echo "Installed $dest/Galley.app"
open -a "$dest/Galley.app"
