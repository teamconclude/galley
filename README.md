# Galley

Galley is a Mac app for editing the [conclude.io](https://conclude.io) website. It works on a
normal checkout of the site and puts everything in one window: the pages, a form for each
page's settings and content blocks, a markdown editor for prose, a live preview, Claude, and
the git steps needed to get a change reviewed.

![Galley editing the home page next to the live preview](docs/screenshot.png)

## Installation

You need a Mac with Apple silicon and access to the `teamconclude` organisation on GitHub.

1. Download the `.dmg` from the [latest release](https://github.com/teamconclude/galley/releases/latest),
   open it, and drag Galley to Applications.
2. The first start is blocked, because the app is not yet signed with an Apple developer
   certificate. Close the warning, open System Settings › Privacy & Security, scroll down and
   click **Open Anyway**. This is needed once.
3. If Galley was started from another folder it offers to move itself to Applications.
   Accept, otherwise it cannot update itself later.
4. Galley uses three tools from your Mac and helps to set them up when they are missing:
   - **git**, which macOS offers to install on first use.
   - **Hugo**, the site generator. Galley uses an installed one, from Homebrew for example,
     and otherwise offers to download the latest release, which it refreshes weekly.
   - **Claude Code**, for the Claude pane. Install it from
     [claude.ai/code](https://claude.ai/code) and sign in once.

Galley checks for new releases when it starts and offers them in the title bar. **Update**
downloads the release, **Restart to update** installs it.

## Using Galley

**Getting the site.** On first start, choose the folder where the site is checked out, or
pick **Clone** to get a fresh copy from GitHub. Galley remembers the checkout.

**Pages.** The left side lists the files of the site. The `content` folder holds the pages,
one markdown file each, grouped by section. The `+` button and the right-click menu create,
rename, duplicate and delete files. A new page copies the settings of the newest page in
the same folder, so it fits its section. Dropping images onto the tree or into a text puts
them under `static/images`.

**Editing.** A page opens as a form of its settings. Marketing pages are built from content
blocks, shown as cards that can be opened, reordered, duplicated and removed, with a menu to
add new ones. Text fields with formatting get a markdown editor and the toolbar at the top.
Images are chosen from the site's images or dropped in. **YAML** at the top right shows the
raw settings for the rare case the form does not cover something. Below the settings, **Show
body text** opens the page's prose. Everything is saved as you type.

**Preview.** The right side shows the page as it will look, updated after every change.
**Separate window** moves it out of the main window, for example to a second screen.

**Claude.** The Claude button opens Claude Code in the checkout. Ask it to draft a blog
post, rewrite a section, or find where something is on the site.

**Publishing.** The **Changes** tab lists what you changed and shows a diff for each file.
Work happens on a branch: the branch menu creates one, named after you. Write a short
message and **Commit** the selected files, then **Push**. When the branch is pushed,
**Open pull request** takes you to GitHub where the change is reviewed and merged to
`staging` and later `production`. Galley checks GitHub every few minutes and offers
**Pull** when a colleague added to your branch and **Update** when `staging` moved on.

## Development

Galley is an Electron app written in TypeScript with React, built with electron-vite. The
main process talks to git and Hugo and serves the checkout to the renderer, where CodeMirror
provides the editors and xterm.js the Claude pane.

```sh
npm install
npm run dev          # start with live reload
npm run typecheck
npm run lint
npm run build:unpack # packaged app in dist/mac-arm64, for trying the packaged behaviour
npm run build:mac    # .dmg and .zip in dist/
```

The page forms are generated from the component definitions in the site checkout,
`component-library/components/<name>/<name>.yml`, or `<name>.bookshop.yml` while the site
still uses Bookshop. Nothing in Galley needs to change when a component is added.

### Releasing

A release is a tag. Tag the commit and push the tag:

```sh
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions builds the app with that version and publishes a release `v0.2.0` with the
DMG, the zip and `latest-mac.yml`, which installed copies read to find updates. The version
in package.json stays `0.0.0`; the workflow sets it from the tag.

Without an Apple developer certificate the build is signed ad hoc, which is why the first
install needs Open Anyway. Adding the `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` secrets to the repository turns on signing
and notarisation without further changes.

`GALLEY_UPDATE_FEED=<url>` points the updater at another folder holding `latest-mac.yml` and
the zip, to test updates against a local build.

## License

BSD 3-Clause, see [LICENSE](LICENSE).
