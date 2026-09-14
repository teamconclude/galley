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
