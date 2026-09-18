# Making Galley usable for other Hugo sites

Galley was built around the conclude.io site and the way that repository is laid out. This
plan lists where that shows in the code, defines the contract a site has to meet instead,
and describes a template site so a new project can start with Galley on day one.

The starting point is the web repository's `lars/galley` branch, which replaces Bookshop
and CloudCannon with a schema file per component under `components/` and a Hugo partial
per block. Galley 0.4.1 reads that format, so the block editor no longer depends on
Bookshop. What remains is everything else that names our site.

## Status

Done, in Galley 0.4.1 and on the web branch `lars/galley` (2026-09-18):

- The component contract below: `components/<name>/<name>.yml` with `fields`, the
  `blocks` and `component` page keys, the `<!--galley-block-->` preview marker. Galley
  reads Bookshop sites into the same model, so develop keeps working until the branch
  merges.
- The web branch itself: Bookshop, CloudCannon and the vendored module removed, plain
  file names, 37 schemas with hand-written labels, placeholders and help.

Done on Galley develop after 0.4.1, unreleased: phase 1. Galley reads the Hugo config in
any of its forms and derives the site name, folders, components mount, markdown rendition
and text previews from it, pickers from every data list, snippets from the shortcodes,
and the Claude pane is a preference. A stock `hugo new site` opens and previews.

Phase 2 is done too: TOML and JSON frontmatter open as text with the badge.

Next, in order: the rest of phase 3, the template site; merging `lars/galley`
into develop can happen any time after 0.4.1 is installed and CloudCannon is no longer
needed.

## Goals and non-goals

- A Hugo site that follows a small, documented contract gets the full Galley experience:
  block editor, preview that follows the cursor, image picker, search, git flow.
- Any other Hugo site gets the rest: file tree, markdown editor, settings form from the
  frontmatter, preview, search, git. Nothing crashes or silently does nothing.
- The conclude.io checkout keeps working with no changes to it; every new setting has the
  current behaviour as its default.
- Out of scope: Windows and Linux builds, CMS features beyond what Galley has today, and
  deploy pipelines. A site's publishing is its own business.

## Where the site is baked in today

Plainly ours:

- `src/shared/site.ts`: clone URL and default checkout folder. `Welcome.tsx`, the open
  dialog in `src/main/index.ts` and `README.md` talk about the conclude.io website.
- `src/main/git.ts`: the shared chain `develop → staging → production`, the protected
  set, `develop` as the base of personal branches, and "the last hop is a pull request".
  `ChangesPanel.tsx` and `App.tsx` key the Publish wording off the literal `production`.
- `Toolbar.tsx`: the shortcode snippets screenshot, youtube, quote, tooltip.
- Data lists: `authors`, `categories`, `customercategories`, named in `repo.ts`,
  `lib/schema.ts`, `lib/contexts.ts` and the `DataLists` type.
- `App.tsx`: `data/llms.yaml` previews as `/llms.txt`; `Preview.tsx`: the markdown twin is
  `index.html.md`.
- `lib/inline.ts`: `"NewTab"` as the link title that opens a new tab.

Hugo assumed narrower than Hugo is:

- A site is a folder with `config/_default/hugo.yaml` (`Repo.isSite`). Hugo also takes
  `hugo.toml`, `config.toml`, `hugo.yaml` at the root, and `config/_default/*.toml`.
- Frontmatter is YAML between `---` fences only (`lib/frontmatter.ts`). TOML `+++` and
  JSON frontmatter get no form and no badge.
- Fixed folders: `content/`, `static/images` with the `/images/` URL prefix (six places),
  `data/`, `bin/hugo`. Hugo lets `contentDir` and `staticDir` move, and many sites keep
  images under `assets/` for image processing.
- Search's "content only" is the literal `content` folder; body images land in
  `static/images/<section>`; a new page is templated from the newest sibling.

The block model:

- Components live in `components/<name>/<name>.yml`, with `component-library/components`
  as the Bookshop fallback; the list key is `blocks` and the type key `component`
  (`content_blocks` and `_bookshop_name` for Bookshop), chosen by the schema format found.
- Preview scrolling to a block counts `<!--galley-block-->` comments and falls back to
  Bookshop's `<!--bookshop-live name(…)-->` (`src/shared/previewScript.ts`).
- Text follow looks for `<main>` and a fixed `header`, `.navbar` or `nav`.

Environment:

- Setup installs Claude Code and the pane launches it; both are unconditional.
- macOS only, ad-hoc signed. Anyone who did not build Galley themselves is stopped by
  Gatekeeper until the app is signed with a Developer ID and notarised.

## The site contract

This is what Galley will document (as `docs/site-contract.md`) and what the template site
implements. A site opts in by following it; there is no configuration file.

### No configuration file

Everything Galley needs is in the Hugo config or follows from the repository, so a site
declares nothing. Values with a source in the Hugo config, read from `hugo.{yaml,toml,json}`
or `config.*`, at the root or under `config/_default/`:

- The site name: `title`.
- Folders: `contentDir` and `staticDir`, default `content` and `static`; images live in
  `<staticDir>/images` and pages refer to them by the path under static.
- The components folder: the source of the mount whose target is
  `layouts/partials/components`, else `components/`, else Bookshop's
  `component-library/components/`.
- The Markdown preview mode: on when an output format has media type `text/markdown` and
  a page kind lists it in `outputs`; the file to fetch is its `baseName` plus `.md`.
- Text previews: a plain-text format that the home page outputs, whose name matches a
  file in `data/`, previews that data file as the format's URL (`llms` and
  `data/llms.yaml` today).

Values that follow from the repository by convention:

- Pickers: a frontmatter key with a same-named `data/<key>.yaml` holding a list of maps
  with a `name` field.
- Page keys: `blocks` and `component`, or the Bookshop pair when the schemas are Bookshop
  files.
- Snippets: the site's `layouts/shortcodes/*.html`, paired when the template uses
  `.Inner`, with one empty argument per `.Get`, plus Hugo's embedded youtube, vimeo, x,
  figure and details. A site shortcode of the same name wins, as in Hugo.
- Git flow: the base branch from `origin/HEAD`, the chain from which of develop, staging,
  production and main exist, a pull request on the last hop. Today's heuristic.
- Links that open in a new tab carry the title `NewTab`; the template ships the render
  hook. Not configurable for now.
- A new page goes into the open page's folder, else the content root.

Whether the Claude pane shows is the user's choice, so it moves into Galley's preferences.
Should a site ever need to override one of these, an optional `galley.yaml` can be added
later; its absence stays the normal case, and the template ships without one.

### Component schema

One folder per component under `components.dir`, holding `<name>.yml`, the Hugo partial
`<name>.html` and optionally `<name>.scss` and an llms emitter `<name>.md`. The schema
only drives the editor; templates read the page data directly.

```yaml
label: Banner
description: Full-width hero at the top of a page
standalone: true # may appear directly in the page's block list (default)
fields: # one entry per key the template reads, in form order
  title:
    label: Heading # type text when omitted
    placeholder: The page's main message
  text:
    type: markdown
  image:
    type: image
    help: Shown beside the text
  background:
    type: select
    options: [white, blue, light]
    default: white # a new block starts with this; else empty
    required: true # no empty choice
  buttonRow:
    type: block # one nested block
    component: button-row
  content:
    type: blocks # a list of blocks; `components: [button]` restricts it
  entries:
    type: list # a list of objects when it has fields, else of strings
    fields:
      question: {}
      answer: { type: markdown }
```

Field types: text, textarea, markdown, url, image, boolean, number, select, list, object,
block, blocks. Keys a page sets that the schema does not declare still show, typed from
their value. Galley reads Bookshop's `<name>.bookshop.yml` into the same model, with
labels derived from the keys, until the web repo has dropped it.

### Preview markers

The partial that renders the block list emits one comment before each top-level block:

```html
{{ range .blocks }}<!--galley-block-->{{ partial "component" . }}{{ end }}
```

Galley counts these to find the block being edited. The Bookshop comment stays accepted
until the web repo drops Bookshop. Body paragraphs are found by text inside `<main>` (or
the body) below a fixed header; the contract asks for a `<main>` element, nothing more.

## Work items

### Phase 1: read the Hugo config and the repository

1. A Hugo config reader in `src/main/hugoConfig.ts`: find the file in its five names and
   two places, parse YAML, TOML (`smol-toml`) and JSON into one object, and read `title`,
   `contentDir`, `staticDir`, `module.mounts`, `outputFormats`, `outputs` and
   `markup.goldmark.renderer.unsafe`. `Repo.isSite` accepts any of the files.
2. A `SiteInfo` in `src/shared/types.ts` with the derived values, computed once per
   checkout, recomputed when the config or `layouts/shortcodes/` changes, and sent to the
   renderer with the component library.
3. Replace each literal with the derived value: content and images folders and URL prefix
   (`repo.ts`, `Fields.tsx`, `ImagePicker.tsx`, `schema.ts`, `App.tsx`, `search.ts`), the
   components folder (`repo.ts`), pickers from `data/` (`schema.ts`, `DataLists` becomes a
   map keyed by frontmatter key), snippets (`Toolbar.tsx`), the markdown twin and text
   previews (`App.tsx`, `Preview.tsx`), the new-page folder (`App.tsx`).
4. Git flow: keep the heuristic, add `main` to the known names so a single-branch site
   gets "Merge into main" and a pull request only when the branch is protected on GitHub.
5. Claude pane: a preference in the settings dialog, default on; the setup step follows it.

Verify: the playwright scripts pass against the conclude.io scratch clone; a stock
`hugo new site` with `hugo.toml`, no components and no markdown output opens with the
tree, the settings form, the preview and no Markdown mode; a scratch site with
`staticDir: assets/public` shows the picker in the right place.

### Phase 2: frontmatter formats

1. Recognise `+++` TOML and `{` JSON fences. Form editing stays YAML only; TOML and JSON
   pages show the badge and open in the raw editor, with a note. Converting formats on
   save is not worth the surprise.

Verify: a TOML-frontmatter page opens raw with the badge; a YAML page is unchanged.

### Phase 3: the component contract

1. Write `docs/site-contract.md` from the section above; link it from the README and from
   the web repo's CLAUDE.md, replacing the Galley section there with a pointer.
2. Done in 0.4.1: `showBlockScript` counts `<!--galley-block-->` comments and falls back
   to the Bookshop comments; `layouts/partials/content-blocks.html` on `lars/galley` emits
   the marker through `safeHTML` (Go templates strip plain comments).
3. Plain mode: with no component folder, `Blocks.tsx` renders the block list as an
   objects list, the Add block menu is hidden, and nothing asks for a schema.
4. Once `lars/galley` has merged: delete `fromBookshop`, the `_bookshop_name` and
   `content_blocks` keys, the `component-library` fallback, the Bookshop marker fallback
   and the `.bookshop.yml` mention in the README.

Verify: on a checkout of the editor-environment branch, clicking a block card scrolls the
preview to it; on a plain Hugo site the block list still edits as YAML objects.

### Phase 4: the template site

A GitHub template repository, `teamconclude/galley-template`, rather than files bundled
in the app: a new site needs its own git history anyway, the template can improve without
a Galley release, and Galley stays small. Galley pins the tag it clones.

Contents:

- `hugo.yaml` with `unsafe: true` for Goldmark, the `markdown` output format for the
  twin, `enableGitInfo`, and `module.mounts` making `components`
  available as partials. No vendored modules, no Go needed.
- Layouts: `baseof.html` with `<header>` and `<main>`, a home and a single page layout,
  `partials/content-blocks.html` with the marker, `partials/component.html`, a
  `render-link.html` hook honouring the new-tab title, and `home.llms.txt` as a starter.
- Six components covering every field type: hero (text, image, nested button row),
  section (markdown), image-with-text, faq (list of objects), button (select, checkbox),
  markdown. Each with `.yml`, `.html` and `.scss`.
- Content: a block-built home page, an `about` page, a `blog` section with one post and
  `data/authors.yaml`, so new-page templating and the author dropdown work from the start.
- `static/images/` with two placeholder images, a minimal `assets/scss/style.scss`, a
  `README.md` explaining how to add a component, and a `.github/workflows/build.yml` that
  only runs `hugo` so the site is checked on push.

In Galley:

1. Welcome gets **New site…** next to Open and Clone: a name and a folder. Galley clones
   the template tag, removes its history, writes the name into `hugo.yaml`, and commits "Start from the Galley template" on `main`. Pushing is left
   to the Changes tab once the user has created a remote; creating the GitHub repository
   from Galley (`POST /user/repos`) is a later addition, not part of the first version.
2. **Clone the site…** accepts any repository URL; the conclude.io URL becomes the
   placeholder, then disappears once the README stops naming it.
3. Settings remember a list of sites instead of one `repoPath`; the Welcome screen lists
   them and the File menu gets Open recent.

Verify: New site ends with Galley open on the new folder, the preview running, a block
added and scrolled to, and a commit on a personal branch that offers "Merge into main".

### Phase 5: branding and environment

1. Neutral wording everywhere the site is named: Welcome, open dialog, error boxes, the
   README's introduction and "Using Galley", the web repo's CLAUDE.md pointer. The
   conclude.io site becomes one example, and the appId stays as it is.
2. Done in phase 1: the Claude pane and setup step follow a preference.
3. Signing and notarisation with a Developer ID in the release workflow, replacing
   `scripts/adhoc-sign.cjs`. Without it nobody outside the team can start the app.
4. `install.sh` and the updater are already generic; the README's install section only
   needs the "conclude.io" wording changed.

## Order and effort

| Phase | Work                                                                               | Estimate                       |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------ |
| 3.2   | Preview marker on both sides (done, 0.4.1)                                         | half a day                     |
| 1     | Derive folders, keys, pickers, snippets and previews from the Hugo config and repo | 2–3 days                       |
| 2     | TOML and JSON frontmatter                                                          | half a day                     |
| 3     | Contract doc, plain mode, Bookshop removal later                                   | 1–2 days                       |
| 4     | Template repository and New site flow                                              | 3–4 days                       |
| 5     | Wording, optional Claude, signing                                                  | 1 day plus the Apple paperwork |

Phases 1 to 3 make Galley work on any site that follows the contract, with no configuration file. Phase 4 is what
lets someone start a project with it. Phase 5 is what lets them install it.

## Decisions taken

- Marker syntax: the `<!--galley-block-->` comment. It keeps the DOM and the CSS
  untouched.
- Branches: the template ships a single `main` branch with pull requests into it. The
  conclude.io three-branch flow comes from the branches that exist, and the staging hop is to
  be cut from the site as well, so the default chain shrinks to two branches once the web
  repo has dropped `staging`.
- New site is local first: clone the template, commit, open. Creating the repository on
  GitHub from Galley comes later, if at all.
- `NewTab` is the link title for new-tab links and the template ships the render hook.
  Not configurable.
- No `galley.yaml`: everything derives from the Hugo config and repository conventions.
  An optional override file can come later if a site needs one (2026-09-18).
