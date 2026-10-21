# The Galley site contract

Galley edits any Hugo site. A site that also follows the conventions below gets the block
editor, a preview that scrolls to the block being edited, pickers filled from its data
files and its own shortcodes in the Insert menu. There is no Galley configuration file:
everything is read from the Hugo config or found in the checkout.

## What every Hugo site gets

A folder is a site when it has a Hugo config: `hugo.*` or `config.*`, in YAML, TOML or
JSON, at the root or under `config/_default/`. Such a site opens with the file tree, the
Markdown editor, a settings form built from each page's frontmatter, the live preview,
search and the git flow.

Frontmatter is edited as a form when it is YAML between `---` fences. TOML (`+++`) and
JSON frontmatter open as text, with the page's badge, and are saved as they are.

## Read from the Hugo config

| Galley needs     | Taken from                                                                                                                    | Default         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Site name        | `title`                                                                                                                       | the folder name |
| Pages            | `contentDir`                                                                                                                  | `content`       |
| Images           | `<staticDir>/images`, referred to from pages as `/images/…`                                                                   | `static/images` |
| Components       | the `source` of the `module.mounts` entry whose `target` is `layouts/partials/components`                                     | `components/`   |
| Markdown preview | an output format with media type `text/markdown` that some page kind lists in `outputs`; Galley fetches `<baseName>.md`       | off             |
| Text previews    | a `text/plain` output format the home page outputs, named like a file in `data/`; editing that file previews the format's URL | none            |

The Markdown preview mode shows the page as the site renders it for language models, for
example `index.html.md` next to `index.html`. A text preview works the same way for a data
file: with an `llms` format of media type `text/plain` in the home page's outputs,
editing `data/llms.yaml` previews `/llms.txt`.

## Found in the checkout

- **Pickers.** A frontmatter key gets a dropdown when `data/<key>.yaml` (or `.json`,
  `.toml`) holds a list of maps that each have a `name`. With `data/authors.yaml` listing
  authors by name, a page's `authors` field offers those names.
- **Snippets.** The Insert menu offers every `layouts/shortcodes/<name>.html`, with one
  empty argument per `.Get` in the template and a closing tag when it uses `.Inner`, plus
  Hugo's embedded youtube, vimeo, x, figure and details. A site shortcode of the same name
  replaces the embedded one, as it does in Hugo.
- **New pages** go into the folder of the open page, else the content folder, and start
  from the newest page beside them.
- **Links that open in a new tab** carry the title `NewTab`, as in
  `[Pricing](/pricing/ "NewTab")`. Galley writes and reads that title; the site's
  `layouts/_default/_markup/render-link.html` hook is what adds `target="_blank"`.
- **Branches.** Work starts from `develop` when origin has one, else from the branch
  origin's HEAD points at. The shared branches are whichever of `develop`, `staging` and
  `production` exist, in that order; publishing to the last one opens a pull request. A
  protected base branch takes pull requests too. A checkout without an `origin` remote,
  such as a new site, works against its local `main`: merging moves `main` forward on
  this Mac, and nothing is pushed until a remote is added.

## Components

Pages built from blocks keep them in a `blocks` list in their frontmatter. Each block
names its component in `component`:

```yaml
blocks:
  - component: banner
    title: Write it once
    background: blue
  - component: faq
    entries:
      - question: Is there a free plan?
        answer: Yes, for up to three people.
```

Each component has a folder in the components folder, holding:

- `<name>.yml`, the schema, which drives the editor and nothing else;
- `<name>.html`, the Hugo partial that renders it, reading the block's keys directly;
- optionally its styles, `<name>.scss` or `<name>.css` as the site builds them, and
  `<name>.md` for its Markdown rendition.

### The schema

```yaml
label: Banner
description: Full-width hero at the top of a page
standalone: true # may appear directly in a page's block list (the default)
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

| Type       | Edited as                                                  |
| ---------- | ---------------------------------------------------------- |
| `text`     | a single line                                              |
| `textarea` | several lines of plain text                                |
| `markdown` | several lines with the Markdown toolbar                    |
| `url`      | a single line                                              |
| `image`    | the image picker                                           |
| `boolean`  | a checkbox                                                 |
| `number`   | a number field                                             |
| `select`   | a dropdown of `options`                                    |
| `list`     | a list of strings, or of objects when it has `fields`      |
| `object`   | its `fields`, nested                                       |
| `block`    | one nested block of `component`                            |
| `blocks`   | a list of blocks, any standalone component or `components` |

Every field takes `label`, `placeholder`, `help` and `default`; the label defaults to the
key, spelled out. Keys a page sets that the schema does not declare still show, typed from
their value, so a schema can start small. Galley picks up a new or changed schema as soon
as the file is saved.

A component with `standalone: false` is only offered where a `blocks` or `block` field
names it, such as a button inside a button row.

### Preview markers

The partial that renders a page's blocks emits a comment before each top-level block:

```go-html-template
{{ range .Params.blocks }}
  {{ "<!--galley-block-->" | safeHTML }}
  {{ partial (printf "components/%s/%s.html" .component .component) . }}
{{ end }}
```

Hugo's templates strip plain HTML comments, hence `safeHTML`. Galley counts the markers to
find the element after the one for the block being edited and scrolls the preview to it.
Without markers the preview stays where it is.

For text, Galley finds the paragraph being edited by its words inside `<main>` (or the
body when there is none) and keeps it below a fixed `header`, `.navbar` or `nav`. A
`<main>` element around the page content is all the contract asks of the layout.

## Plain mode

A site with no component schemas is edited in plain mode. Nothing on its pages is a block:
lists of objects, a `blocks` list included, edit as cards whose fields are typed from the
first entry, **Add item** adds an entry with the same keys left empty, and every key is a
field, `component` too. Adding a schema to the components folder switches the site to the
block editor.

## Bookshop

Until the conclude.io site has moved off Bookshop, Galley also reads Bookshop's
`<name>.bookshop.yml` from `component-library/components/`, with the page keys
`content_blocks` and `_bookshop_name` and its `<!--bookshop-live …-->` comments as preview
markers. This support goes away once that move is done; new sites should follow the
contract above.
