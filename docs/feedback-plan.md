# Acting on the first week of feedback

The first week of editing conclude.io in Galley produced a feedback document with eleven
items. This plan records what each item turned out to be, checked against the code and
the web repository, and the work that follows from it.

## Status

Phases 1 to 6 are done on develop, unreleased (2026-10-20). The site names in the Publishing
section need a `baseURL` in `config/staging/` and `config/production/` of the web
repository, which today passes it on the command line only. The web side of phase 2 is
on its branch `lars/claude-content-editing`; the forwarding page of phase 6 on
`lars/galley-review-links`. Phase 7 waits for a need. Phases 8 and 9 come from two later
items (2026-10-21); both are done on develop, unreleased.

## What the feedback showed

Two causes sit behind most of the git complaints:

- Galley offered Pull and Update on the shared branches. Update rebases the local copy of
  staging or production onto develop and Pull creates merge commits, so the local shared
  branches collected commits that Galley then refused to push. That is where "6 commits
  to push" with a Push button that did nothing came from.
- The editor kept source material (`blogs new/`, `blog optimizations/`, `screenshots/`)
  inside the checkout so Claude could read it. Untracked files follow every branch switch,
  so the same 26 changes appeared on every branch and looked like unpublished work.

Item by item:

1. Images.
   - New images are hard to find: a real gap. A drop opens the folder but selects nothing.
     New files do show in the Changes tab until they are committed, but there they were
     buried under the source folders, and an image there shows as "Binary file".
   - The picker shows thumbnails and names, but the names are cut off in 140px tiles and
     only the first 300 of 822 images show, with no folder filter.
   - No upload button: real. "Add from disk…" is three dialogs deep. Dropping into the
     body text or onto an image field already works, which nothing tells the user.
   - Dropping a file on the Claude pane does nothing: a bug. The window cancels every
     drop and the terminal has no handler.
2. Four publishing stages: decided. `staging` goes once CloudCannon is retired; develop
   then deploys to conclude.dev and production to conclude.io. Galley builds the chain from
   the branches that exist on GitHub, so it follows without a change beyond wording.
3. Shareable previews: the web repo already has `make netlify`, which deploys a branch to
   `<branch>--conclude.netlify.app`. Inside the team, a Galley deep link does the job
   without hosting (phase 6).
4. Commits from others give no detail: real. The counts cannot be expanded and the
   publish confirmation gives only a number.
5. Push versus Publish: a disabled primary button looks enabled (only dialogs and the
   commit box style `:disabled`); local commits on a shared branch have no way out, since
   New branch on a clean checkout starts from the base; a merge leaves the editor on
   develop, a shared branch; nothing explains that Push uploads a branch and Publish puts
   staging live.
6. Blog list by file name, no search: the Search tab finds titles but lists lines, not
   pages. The five `.webp` files in `content/blog/` are CloudCannon uploads from 2025 that
   no page references; the pages use the copies in `static/images/blog/`. A drop on the
   tree lands in the folder under the cursor, not in the images folder as the README says.
7. Claude in Chrome, Google Drive: the need is getting a Google Doc in with its links. Rich
   paste covers it (phase 3).
8. Adding a blog post: the New page dialog does not say that the file name becomes the
   address, or what the date is. Pasting gives plain text only.
9. Claude invents links: Claude was used to transcribe a document, which is a
   deterministic job. The model had been switched to Haiku as the editor's default. Every
   edit needed an approval because the pane starts Claude in the default permission mode.
10. Production refused a push, then took it: Claude ran git itself, following the release
    flow in the web CLAUDE.md. Galley's Publish… opens and merges the pull request in one
    step.
11. Page URLs are not searchable: real. `hugo list all` gives title, permalink, date and
    draft, but Galley keeps only path and URL.
12. Developer docs sidebar differs between conclude.dev and conclude.io: not a bug. The
    extra entries are `draft: true` pages, and staging builds with `-D -F`.
13. Dragging an image from the tree onto the preview, where it should appear: not
    possible. Tree rows cannot be dragged, and the preview is a webview in its own
    process, so the window sees no drag events over it. Nothing maps a place in the page
    back to the text either: the preview only follows the editor, by block index or by a
    line's words. Dropping a file from Finder into the body text works.
14. Replacing an image in an article: real. Image fields have Upload…, but an image in a
    page body can only be changed by editing its address, and the tree's menu has no
    Replace…. Rename… and Move to Trash do not look at where an image is used, so either
    breaks the pages that show it without a word. Replacing a file under the same name
    would not reach readers: conclude.io serves images with `max-age` of 31 days and
    `immutable` (`pkg/httpapi/http.go` in the Conclude repository), so browsers and
    shared caches keep the old picture for up to a month without asking. Body images
    come both as `![…](…)` and as `<img>` with the width and height CloudCannon wrote.

Outside Galley: delete the five stray images in `content/blog/`, move the source folders
out of the checkout, set Claude's model back, and use Publish… rather than asking Claude.

## Work items

### Phase 1: a Changes panel that can be trusted (done)

1. Shared branches are read-only. They get neither Update nor a merging Pull. A clean
   shared branch that is behind GitHub fast-forwards by itself after a fetch or a switch;
   Pull on one is fast-forward only. Local commits on a shared branch get "Move N commits
   to a new branch", which branches at HEAD and resets the shared branch to GitHub's.
2. Disabled primary buttons look disabled.
3. After a merge the editor stays on their branch, brought level with the base, instead of
   landing on develop. The preference only decides whether the copy on GitHub is removed.
4. Publishing rows name the site each shared branch builds, from the `baseURL` of the
   Hugo environment of the same name (`config/staging/` gives conclude.dev). Push and
   Publish get a line of explanation.
5. Every count expands into its commits: author, date, message and files. The merge and
   publish confirmations list the commits and name the people whose work goes along.
6. Untracked files outside the folders git already tracks are listed apart as "Not part
   of the site", one row per top-level entry. They are not counted, committed, discarded,
   or in the way of a merge. Each offers Show in Finder, Move to Trash, and Add to the
   site, which warns first and then registers the files with `git add --intent-to-add`
   so they show as new files like any other change.
7. Images in the Changes tab show as pictures.
8. New files in obviously wrong places get a warning in plain words and start left out of
   the commit; committing them anyway asks first. Wrong places are: outside the site's
   folders, a document anywhere but the static folder, a page in the static folder, an
   image among the pages outside a page bundle, a temporary file from Finder or Office,
   and a name with capitals or spaces where it becomes an address. An image dropped on
   the tree among the pages goes to its section's images folder; other doubtful drops
   ask first.

Verify: on a scratch clone, a staging branch with local commits offers Move and nothing
else; after a merge the branch is level with develop and still checked out; a folder of
documents at the root shows under "Not part of the site", and adding it warns first and
leaves its files unticked; expanding
"N commits to push" lists them.

### Phase 2: Claude in Galley (done)

What concerns the site (how a blog post is built, where images go, how internal links are
written) belongs in the web repository, where developers see it too. What concerns the
editor's role belongs to Galley and applies only inside it, for any site.

1. Done. Galley starts Claude with `--append-system-prompt` (working for a content editor;
   Galley does branches, commits and publishing; do exactly what is asked and add no
   links; the site's folders), `--permission-mode acceptEdits`, `--settings` with
   permissions (allow reading the inbox, `hugo list`, read-only git, `sips`, fetching the
   site's own hosts from its Hugo environments; deny git commands that change anything,
   `gh` and `curl`), and `--model` from a new preference, Opus by default. Claude's
   environment no longer carries Galley's GitHub token: permission rules on Bash are not
   a boundary, so it has no credential to push with.
2. Done. Files dropped on the pane are copied to an inbox under Galley's user data, added
   with `--add-dir`, and pasted at the prompt. `.docx` and `.html` arrive as Markdown,
   converted by rule with mammoth and turndown; pictures are extracted beside it. This
   is the converter phase 3 needs for rich paste. A `UserPromptSubmit` hook tells Claude
   which page is open.
3. Done. A plugin in `resources/claude-plugin/` with `import-document` (work from the
   converted file, separate notes from text, check the links mechanically against the
   document) and `add-images`.
4. On the web branch `lars/claude-content-editing`, not merged: a "Claude in Galley's
   pane" section in CLAUDE.md and a `blog-post` skill (settings, categories, authors,
   images, links, shortcodes, and how the content team's document header maps onto
   them). The release flow text changes when staging goes.

Checked: on a real document from the content team, all 16 link addresses and every
visible link survive conversion; the ten link runs that disappear are Google Docs links
on a single space. In the pane, Claude named the open page from the hook, `git push` was
refused, and both skills are listed.

### Phase 3: content in without Claude (done)

Done on develop, unreleased (2026-10-19).

1. Pasting into a Markdown editor converts HTML with the converter phase 2 introduced, now
   in `src/shared/markdown.ts` for both processes. It handles Google Docs (bold and italic
   as inline styles, the document-wide `<b>` wrapper, google.com/url redirects, list items
   wrapped in paragraphs) and Word. Text that reads as Markdown, or HTML that only styles
   it, pastes as it is. Paste as plain text (⌘⇧V) replaces Paste and Match Style. A whole
   page pasted into an empty body merges its settings. Pasted pictures, as data or by
   address, are saved into the section's images folder under the page's name.
2. New page from a document: mammoth for Word, the same converter for HTML, Markdown as
   it is. The headline becomes the title, notes above it are shown and kept out of the
   page, an address on a line of its own in the notes becomes the page's address, and
   the pictures are copied to the images folder as `<page>-1.png` and so on.
3. The New page dialog shows the address under the section instead of a file name, says
   what the title is for, and has a publish date.
4. Links to the site's own addresses, relative or on one of its hosts, that match no page,
   alias or static file are underlined. The targets come from `hugo list all`, the
   `aliases` in front matter and the static folder, cached until pages move.

Word documents (checked on the Teams test guide): tables become Markdown tables with the
first row as header, since Word marks every row or none as a header (mammoth reads
`tblHeader w:val="0"` as a header); cells holding lists, pictures or tables stay HTML on
one line. Word's Title style, or a short bold first paragraph, is the headline, and the
text's headings move down a level when it uses top-level ones. Numbered steps split by a
screenshot keep counting, typed "•" bullets become a list, and the text above the
headline can be put on the page from the dialog.

### Phase 4: images (done)

1. Upload… next to Choose… in the image dialog and on image fields: one step into the
   section's image folder.
2. The picker starts with the images new on this branch (untracked or added since the
   base), filters by folder starting at the page's section, and shows names on two lines.
3. Done in phase 1: images dropped on the tree among the pages go to the images folder
   and the new file opens.
4. Done in phase 3: pasting a picture into the body.

Uploads go beside the picture a field already shows, else to the section's folder
(`/images/pages` for pages outside a section). The image dialog also takes a dropped
picture. "New on this branch" lists files under the images folder that are untracked,
staged as added, or added by commits since the merge base with the base branch.

### Phase 5: finding pages (done)

1. A page finder (⌘P) over titles, URLs, aliases and file names, from all the columns of
   `hugo list all`.
2. Content folders can show titles instead of file names, sort by date, and mark drafts and
   scheduled pages.

`hugo list all` gives the title, dates, draft flag and address of every page, drafts and
future pages included, in about 0.2 s for the site; Galley lists it again a second after
any change under `content/`. Aliases come from the pages' settings. The finder ranks
title matches first, then address, alias and file name, newest first; without a query it
lists the newest pages. Titles are the default in the tree, folders keep their names, and
a page bundle's folder takes its page's title. Badges reuse the settings pane's.

### Phase 6: deep links (done)

`galley://open?repo=teamconclude/Conclude-web&branch=buket/pylon&page=content/compare/pylon.md`
opens a colleague's branch for review. `page` is optional; `url=/compare/pylon/` resolves
through the page list instead.

1. Register the scheme in `electron-builder.yml` and handle `open-url`, also before the
   window exists. The internal `galley://repo/` stays separate.
2. An https page that forwards to the link, with an install link as fallback, because
   GitHub and Slack do not make custom schemes clickable.
3. Opening matches the repository to a known checkout (or offers to clone), shows the
   branch, its authors and commits, and only then fetches and switches. Uncommitted work
   inside the site is committed to the editor's branch first, on request; there is no
   stash. A bar shows "Reviewing <branch> · Back to <own branch>".
4. Copy review link in the branch menu and after a push; pull requests Galley opens carry
   the link; branches in the expanded commit lists get Open in Galley.
5. The branch name is checked with `git check-ref-format` and the page must lie inside the
   checkout. Nothing in the link runs.

As built: the forwarding page is `static/galley/open/` in the web repo (kept out of
robots.txt), so links read `https://conclude.io/galley/open/?branch=…&page=…`. Galley
checks the repository against the checkout it has open; without one, the link waits until
the welcome screen has opened or cloned the site. A shared branch with uncommitted changes
cannot be left for a review; the dialog asks for New branch first. The review and the
branch to go back to are kept in the settings, so the bar survives a restart. Not built:
Open in Galley on branches in the commit lists, which list commits already merged, whose
branches are mostly gone. Links reach whichever Galley registered last, so a development
build takes them over until the installed app starts again.

A second window on a worktree would keep the editor's own work untouched, at the cost of
one repository, git and Hugo server per window. Only if switching proves annoying.

### Phase 7: Netlify previews, if people outside the team review

A GitHub Action runs `scripts/deploy-netlify` on every push to a personal branch with a
`NETLIFY_AUTH_TOKEN` secret, and Galley copies the link. Alias deploys cost no credits;
viewing costs 20 credits per GB and 2 per 10,000 requests, so a few hundred page views a
month fit the free 300 credits, which are a hard limit (prices as of October 2026).

### Phase 8: replacing images (done)

1. Replace… in the tree's menu on an image picks a new file and lists where the image is
   used, by page title: the image's address anywhere in the site outside build output,
   and for an image in a page bundle its bare name in that bundle's pages.
2. A replaced image gets a new name, by default `<name>-v2.<ext of the new file>`, then
   `-v3`, so no reader sees the old picture under a cached address. The editor may type
   another. Keeping the old name is allowed, since a picture other sites or emails link
   to has to keep its address, but the dialog warns loudly that readers may see the old
   picture for a month. Every use is rewritten to the new address.
3. An image that is on no shared branch on GitHub has never been published, so its name
   is offered unchanged and the preview reloads ignoring its cache.
4. The dialog shows both pictures with their sizes and warns when the sizes differ, more
   strongly when the proportions do. An `<img>` with a width and height keeps its width
   and takes the height from the new picture's proportions. Better still, the site
   writes sizes when it builds; that belongs in the web repository.
5. The old file is removed, unless a branch on GitHub other than the editor's changes a
   page that uses it; then it stays and the dialog says so.
6. Rename… on an image rewrites its uses the same way, and Move to Trash names the pages
   that show it before asking.

Everything lands in the working tree as ordinary changes (a new file, edited pages, a
deleted file), committed together like any other edit. Addresses a template builds from
parts cannot be found; the dialog lists only what it found.

Verify: replacing a published blog image used by two pages writes `-v2`, rewrites both
pages and an `<img>`'s height, and removes the old file; replacing an image uploaded on
this branch keeps its name and the preview shows the new picture.

As built: an address counts as a use when nothing that could continue a longer name
stands on either side, so `/fr/images/x.png` and `x.png.bak` do not; it may carry one of
the site's hosts (from its Hugo environments), a leading `static/`, or no leading slash,
as templates write it. Tags that give a size are `<img>` and shortcodes with `width` and
`height`. Sizes are read from the file's header (PNG, JPEG, GIF, WebP, AVIF, SVG). An
image counts as published when it is on `develop`, `staging`, `production`, `main` or
`master` on GitHub, or locally without GitHub. Branches that keep the old file are those
whose diff from the base adds or removes its address (`git diff -S`). The old file goes
to the Trash. The preview server now runs with `--noHTTPCache`: without it, Hugo sends
only Last-Modified, from which the preview kept a replaced picture for days. Renaming a
folder of images does not rewrite their uses.

Checked on a scratch clone of the web repository: a quickstart screenshot used on three
pages, replaced by a picture of other proportions, became `-v2.png` with all three
`<img>` heights recomputed and the old file gone; an image a fake colleague's branch
starts using stayed; the unpublished `-v2.png` was offered under its own name without a
warning; typing the old name of a published image showed the loud warning; Rename… and
Move to Trash behaved as above, and the preview showed the new picture.

### Phase 9: dropping images on the preview (done)

1. Image rows in the tree can be dragged. While a drag from the tree is on, a
   transparent layer over the preview takes the drag events, since the webview would
   swallow them, and asks the page with `elementFromPoint` what lies under the pointer.
2. Over the page body, the page draws a line above or below the nearest block
   (paragraph, heading, list item, table, quote, picture), in the colour the preview
   uses to show the cursor's place. Outside `main`, and over text that comes from no
   line of the body (a shortcode's output, a generated list), nothing is drawn and the
   pane bar says why.
3. The drop finds the block's line in the body by its words, the reverse of how the
   preview follows the cursor, and inserts `![Description](…)` as a paragraph before or
   after the block, with "Description" selected. In a list item it is indented into the
   item, so numbered steps keep counting.
4. A drop onto a picture swaps it on this page: the matching `![…](…)` or `<img>` in the
   body, or the image field in the settings that holds its address. On block pages that
   is the only drop there is.
5. The detached preview takes drops the same way and sends them to the main window.
   Files dragged from Finder need a preload in the webview, since such a drag can enter
   the preview without crossing the window first; only if asked for.

Start with a spike: the layer over the webview, `elementFromPoint` through
`executeJavaScript` on every animation frame, and the line drawn in the page.

Verify: on a quickstart page, dropping an image below a numbered step inserts it inside
the step and the numbering continues; dropping onto a screenshot swaps its address; on a
product page, dropping onto a block's picture sets that block's image field.

As built: the spike held; a drag from the tree reaches the layer over the webview, and a
round trip to the page for each pointer position, one at a time, keeps up. A hint at the
bottom of the preview says what a drop would do, or why it cannot: a picture outside the
static folder, a point outside `main`, text that is in no line of the body, a picture in
neither the body nor the settings. Near the top or bottom edge the page scrolls. A drop
above a list item that is not the first goes at the end of the item before it, so the
list stays one. An `<img>` with a width and height that is swapped takes the new
picture's proportions. Inserting and swapping in the body go through the editor and can
be undone; a swap in the settings rewrites them. Not built: drops on the detached
preview, which would need the drag announced to the other window, and drops from the
Finder, which need a preload in the webview.

Checked in the app with a real drag (CDP intercepting the tree row's drag and delivering
it over the preview): on the Jira quickstart, a drop on a screenshot swapped it and its
height, and a drop below a paragraph put the picture there with "Description" selected
and the editor scrolled to it; in the email-connect guide, a drop at item 3 of a tight
numbered list went into item 2 and the page still shows one list of four; on the AI
integrations product page a drop on a block's picture set its `image`; a drop on the
header was refused.

## Order and effort

| Phase | Work                                                        | Estimate   |
| ----- | ----------------------------------------------------------- | ---------- |
| 1     | Read-only shared branches, commit lists, files outside site | 2–3 days   |
| 2     | Claude launch settings, inbox, web repo skills              | 1–2 days   |
| 3     | Rich paste, document import, New page dialog, link check    | 2–3 days   |
| 4     | Upload, picker, tree drops, image paste                     | 1–2 days   |
| 5     | Page finder and titles in the tree                          | 1–2 days   |
| 6     | Deep links                                                  | 2 days     |
| 7     | Netlify previews                                            | half a day |
| 8     | Replace images under a new name, uses rewritten             | 1 day      |
| 9     | Drop images on the preview                                  | 2 days     |

## Decisions taken

- `staging` is removed from the web repository once CloudCannon is retired; conclude.dev
  then shows develop (2026-10-19).
- Deep links before Netlify previews: reviewing happens inside the team.
- Site knowledge for Claude lives in the web repository, the editor's role and
  permissions in Galley's launch settings.
- Shared branches are never worked on in Galley; it moves stray commits off them rather
  than pushing them.
- Untracked files are resolved, not hidden: added to the site or moved away. A checkout
  holds no untracked files beyond build output, which the site's .gitignore covers.
- Editors are not expected to know git or Hugo: anything that looks misplaced is
  explained in plain words before it is committed.
- A published image is replaced under a new name by default, since caches keep images
  for a month, and its uses follow. The same name stays possible, with a loud warning
  (2026-10-21).
