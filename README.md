# Galley

A macOS desktop editor for the conclude.io website. It opens a local checkout of the site
and gives non-developers a file browser, a markdown editor with a form for the page
settings, a live Hugo preview and a Claude pane, in one window.

## Development

```sh
npm install
npm run dev        # start the app with live reload
npm run typecheck
npm run build:mac  # build the .dmg into dist/
```

The app needs the site checkout to have Hugo available, either as `bin/hugo` inside the
checkout (installed by the site's `scripts/setup`) or on the login shell's PATH. The Claude
pane runs the `claude` command from the login shell's PATH.

## Releases

A release is a tag. Tag the commit and push the tag:

```sh
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions builds the app with that version and publishes a GitHub release `v0.2.0`
with the DMG, the zip and the update manifest. The version in package.json stays `0.0.0`;
the workflow sets it from the tag.

Without a Developer ID certificate the build is signed ad hoc: the first install needs
"Open Anyway" in System Settings › Privacy & Security once. Galley then updates itself from
the releases page: it downloads the zip, verifies the checksum from the manifest, and swaps
the bundle on restart. Adding the `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` secrets turns on signing and notarisation.

`GALLEY_UPDATE_FEED=<url>` points the updater at another folder holding `latest-mac.yml` and
the zip, for testing.
