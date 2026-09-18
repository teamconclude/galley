# Making Galley usable for other Hugo sites

Galley was built around the conclude.io site and the way that repository is laid out. This
plan lists where that shows in the code, defines the contract a site has to meet instead,
and describes a template site so a new project can start with Galley on day one.

The starting point is the web repository's `lars/editor-environment` branch, which replaces
Bookshop and CloudCannon with a plain schema file per component and a Hugo partial per
block. Galley already reads that format (`fromSchema` in `src/main/repo.ts`), so the block
editor no longer depends on Bookshop. What remains is everything else that names our site.

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

- Components live in `components/<name>/<name>.yml`; the list key is
  `blocks` and the type key `component` (`content_blocks` and `_bookshop_name` for Bookshop).
- Preview scrolling to a block counts Bookshop's `<!--bookshop-live name(…)-->` comments
  (`src/shared/previewScript.ts`). The editor-environment branch emits none, so on that
  branch block follow does nothing. This is the one regression to fix first.
- Text follow looks for `<main>` and a fixed `header`, `.navbar` or `nav`.

Environment:

- Setup installs Claude Code and the pane launches it; both are unconditional.
- macOS only, ad-hoc signed. Anyone who did not build Galley themselves is stopped by
  Gatekeeper until the app is signed with a Developer ID and notarised.

## The site contract

This is what Galley will document (as `docs/site-contract.md`) and what the template site
implements. A site opts in with one file; everything in it is optional.

### `galley.yaml` at the repository root

```yaml
name: Conclude website # shown in the title bar and the Welcome screen
content: content # Hugo contentDir, read from the Hugo config when absent
images:
  dir: static/images # where the picker looks and drops copy to
  url: /images # how pages refer to files in that folder
components:
  dir: components
  listKey: blocks # the frontmatter list holding a page's blocks
  typeKey: component # the key naming a block's component
lists: # frontmatter key → data file with a list of maps with `name`
  authors: data/authors.yaml
  categories: data/categories.yaml
snippets: # the Insert menu; label → text
  Screenshot: '{{< screenshot "/images/…" "Description" >}}'
  YouTube: '{{< youtube VIDEO_ID >}}'
textPreviews: # editing this file previews that URL as text
  data/llms.yaml: /llms.txt
markdownTwin: index.html.md # appended to a page URL for the Markdown preview mode
links:
  newTabTitle: NewTab # link title the site's render hook turns into target=_blank
git:
  base: develop # where personal branches start
  chain: [develop, staging, production]
  pullRequestInto: [production] # hops that go through a pull request, the rest are merges
claude: true # show the Claude pane and install Claude Code in setup
```

Defaults are today's values, so the conclude.io checkout needs no `galley.yaml`. With no
component folder Galley runs in plain mode: no block cards, no Add block menu, the
settings form still renders from the frontmatter.

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

### Phase 1: the manifest and its defaults

1. Add `SiteConfig` to `src/shared/types.ts` with the shape above, fully populated with
   defaults in `src/main/site.ts` (rename of `shared/site.ts`, which loses the clone URL).
   `Repo` loads `galley.yaml`, merges it over the defaults, and sends it with the
   component library; `SchemaContext` exposes it to the renderer.
2. Replace each literal with the config value: content and images dirs and URL prefix
   (`repo.ts`, `Fields.tsx`, `ImagePicker.tsx`, `schema.ts`, `App.tsx`, `search.ts`),
   component dir and keys (`repo.ts`, `schema.ts`, `Blocks.tsx`, `PreviewFollow.tsx`),
   data lists (`DataLists` becomes `Record<string, string[]>` keyed by frontmatter key),
   snippets (`Toolbar.tsx`), text previews and the markdown twin (`App.tsx`,
   `Preview.tsx`), the new-tab title (`inline.ts`).
3. Git flow from config: `sharedChain`, base branch, protected set (chain plus main and
   master), and which hops open pull requests. The Publish and Merge wording follows
   `pullRequestInto` instead of the name `production`.
4. Reload the config when `galley.yaml` changes, like components and data today.

Verify: the existing playwright scripts pass against the conclude.io scratch clone with no
manifest; a second scratch site with a manifest moving images to `assets/img` and the
chain to `[main]` shows the picker, drops and a single "Merge into main" step.

### Phase 2: the rest of Hugo

1. Site detection: any of `hugo.{yaml,yml,toml,json}`, `config.{yaml,yml,toml,json}` at
   the root, or the same names under `config/_default/`. Read `contentDir` and
   `staticDir` from it when the manifest does not set them; `@iarna/toml` or `smol-toml`
   for TOML.
2. Frontmatter: recognise `+++` TOML and `{` JSON fences. Form editing stays YAML only;
   TOML and JSON pages show the badge and open in the raw editor, with a note. The YAML
   library is already there; converting formats on save is not worth the surprise.
3. New page templating and body image folders derive from `content` and `images` in the
   config rather than from `content/` and `static/images`.

Verify: a stock `hugo new site` with `hugo.toml` and a theme opens, previews, and the
settings form appears for its YAML pages; a TOML-frontmatter page opens raw with a badge.

### Phase 3: the component contract

1. Write `docs/site-contract.md` from the section above; link it from the README and from
   the web repo's CLAUDE.md, replacing the Galley section there with a pointer.
2. Preview markers: `showBlockScript` counts `<!--galley-block-->` comments and falls back
   to the Bookshop comments. On the web repo's editor-environment branch,
   `layouts/partials/content-blocks.html` emits the marker.
3. Plain mode: with no component folder, `Blocks.tsx` renders the block list as an
   objects list, the Add block menu is hidden, and nothing asks for a schema.
4. Once the web repo has dropped Bookshop: delete `fromBookshop`, the `_bookshop_name`
   key, the Bookshop marker fallback and the `.bookshop.yml` mention in the README.

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
- `galley.yaml` with the defaults spelled out, so a new owner sees what can change.
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
   the template tag, removes its history, writes the name into `hugo.yaml` and
   `galley.yaml`, and commits "Start from the Galley template" on `main`. Pushing is left
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
2. Claude pane and setup step follow `claude` in the manifest with a preference to turn it
   off regardless.
3. Signing and notarisation with a Developer ID in the release workflow, replacing
   `scripts/adhoc-sign.cjs`. Without it nobody outside the team can start the app.
4. `install.sh` and the updater are already generic; the README's install section only
   needs the "conclude.io" wording changed.

## Order and effort

| Phase | Work                                                             | Estimate                       |
| ----- | ---------------------------------------------------------------- | ------------------------------ |
| 3.2   | Preview marker on both sides, before the web branch merges       | half a day                     |
| 1     | Manifest and defaults                                            | 2–3 days                       |
| 2     | Hugo detection, TOML and JSON frontmatter, config-driven folders | 1–2 days                       |
| 3     | Contract doc, plain mode, Bookshop removal later                 | 1–2 days                       |
| 4     | Template repository and New site flow                            | 3–4 days                       |
| 5     | Wording, optional Claude, signing                                | 1 day plus the Apple paperwork |

Phases 1 to 3 make Galley work on any site that follows the contract. Phase 4 is what
lets someone start a project with it. Phase 5 is what lets them install it.

## Decisions taken

- Marker syntax: the `<!--galley-block-->` comment. It keeps the DOM and the CSS
  untouched.
- Branches: the template ships a single `main` branch with pull requests into it. The
  conclude.io three-branch flow stays a manifest setting for now, and the staging hop is to
  be cut from the site as well, so the default chain shrinks to two branches once the web
  repo has dropped `staging`.
- New site is local first: clone the template, commit, open. Creating the repository on
  GitHub from Galley comes later, if at all.
- `NewTab` stays the default link title for new-tab links and the template adopts it; a
  site can override it in the manifest.
