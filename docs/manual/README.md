# Galley manual

Galley is the editor for the [conclude.io](https://conclude.io) website. You find and edit
pages, add pictures and new pages, see the result as you type, and send your work on its
way to the live site, all in one window. This manual walks through each of those.

![Galley with a blog post open: pages on the left, the page's settings and text in the middle, the preview on the right](images/overview.png)

- [How your work reaches the site](#how-your-work-reaches-the-site)
- [Getting started](#getting-started)
- [The window](#the-window)
- [Finding a page](#finding-a-page)
- [Editing a page](#editing-a-page)
- [Pictures](#pictures)
- [New pages](#new-pages)
- [The preview](#the-preview)
- [Saving your work](#saving-your-work)
- [Publishing](#publishing)
- [Sharing work for review](#sharing-work-for-review)
- [Claude](#claude)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [When something goes wrong](#when-something-goes-wrong)

## How your work reaches the site

The website lives on GitHub. Galley keeps a copy of it on your Mac, and you edit that copy.
Nothing you do in Galley changes the live site until it is published, so feel free to try
things out.

Your work moves through a few stages:

1. **Your branch.** You work on a branch of your own, a private line of work named after
   you, such as `anna/pricing-update`. Galley saves every edit on your Mac as you type.
2. **Commit.** When a piece of work is ready, you commit it: Galley records the changed
   files with a short note on what you did, and sends them to your branch on GitHub.
3. **Merge into develop.** `develop` is the branch the whole team shares, and the test
   site, conclude.dev, shows it. Merging adds your work to it.
4. **Publish.** From `develop`, the team's work moves on to `production`, the live site,
   conclude.io.

The **Changes** tab at the left shows where you stand and offers the next step each time.

## Getting started

### Installing

You need a Mac and access to the `teamconclude` organisation on GitHub.

1. Open **Terminal**: press ⌘ Space, type `Terminal`, press Return.
2. Paste this line and press Return:

   ```sh
   curl -fsSL https://github.com/teamconclude/galley/releases/latest/download/install.sh | sh
   ```

Galley lands in your Applications folder and opens. It updates itself from then on; when
an update is ready, a button at the top right offers to restart into it.

### The first start

On the first start Galley shows a list of what it sets up and works through it. Most of it
needs nothing from you. Two steps do:

- **Sign in to GitHub.** Galley shows a short code and opens github.com. Enter the code
  there and confirm. This lets Galley fetch the site and send your work.
- **The site.** Click to download the site into `~/Conclude/web`, or choose a copy you
  already have.

The Claude step installs Claude Code; it asks you to sign in the first time you open the
Claude pane. **Galley ▸ Setup…** shows the list again at any time.

## The window

- **Left: the sidebar**, with three tabs. **Files** lists the site's pages and files,
  **Changes** shows your work and the next step for it, and **Search** searches the whole
  site.
- **Middle: the open page.** Its settings at the top, its text below.
- **Right: the preview**, the page as it will look on the site.
- **Bottom: Claude**, when you open it.
- **Top right:** the share button, which copies a link to your work for a colleague, and
  buttons to show or hide the preview and Claude.

Drag the borders between the parts to make one larger. **View ▸ Larger text** (⌘+) makes
everything larger.

## Finding a page

### The list of files

The `content` folder holds the pages, one folder per part of the site: `blog`, `compare`,
`product` and so on. Each page shows its file name, with its title below it. Pages in a
folder are listed newest first. Pages that are not on the live site are marked:

- **Draft**: the page is switched off and stays off the site until Draft is switched off.
- **Scheduled**: its publish date is still to come; it appears on the site on that day.
- **Expired**: its expiry date has passed, so it has left the site.

Other files show their size and when they last changed. The `static` folder holds the
pictures and downloads, and `data` holds lists the site uses, such as the authors. The
eye button above the list shows every file of the site, and the rows button switches to
one line per file.

### Find Page

**File ▸ Find Page…** (⌘P), or the magnifying glass above the list, finds a page by what you
know of it: words from its title, its address on the site, an old address that forwards
to it, or its file name. Use the arrow keys and Return, or click. With nothing typed, it
lists the newest pages.

![Find Page listing the pages that match "slack zendesk"](images/find-page.png)

### Search

The **Search** tab finds text anywhere on the site and lists every place it occurs; click
one to open the page there. **Content only** limits the search to pages. The arrow beside
the search field opens **Replace**, which changes every match at once; check the list of
matches first.

## Editing a page

A page opens as a form of its settings, with its text below.

- **Settings** are things like the title, the date, the description that search engines
  show, and the picture used when the page is shared. Each has its own field.
- **Content blocks.** Marketing pages are built from blocks, such as a hero, a feature
  list or a call to action. Each block is a card: click it to open it, and use the
  buttons on it to move it up or down, duplicate it or remove it. **Add block…** adds a
  new one.
- **The text.** Blog posts and similar pages have their text below the settings. **Show
  body text** opens it on pages that have both blocks and text.

Everything saves as you type. ⌘Z undoes, ⌘S saves at once.

### Writing text

The toolbar above the text sets headings, bold, italic, underline and strikethrough. The
text is written in Markdown, a simple way of marking up text: `**bold**`, `## Heading`,
`- list item`. You can type it directly or use the toolbar; the toolbar shows which style
the cursor is in.

- **Links:** select the words and choose **Insert ▸ Link…**. Links to pages on the site
  are written as their address, such as `/product/support/`. A link to an address where
  the site has no page gets a red wavy underline, so you catch typos before they go live.
- **Insert** also offers the site's special elements, such as buttons or embedded videos.
- **YAML** at the top right shows the page's settings as text, for the rare case the form
  does not cover something.

### Pasting text

Text copied from Google Docs, Word or a web page keeps its headings, lists, bold and
italic, and its links. Pictures in it are saved into the site. **Edit ▸ Paste as plain
text** (⌘⇧V) pastes only the words.

## Pictures

There are several ways to add a picture:

- **Choose…** next to a picture setting, or **Insert ▸ Image…** in the text, opens the
  picture library. It shows the pictures added on your branch first, then one folder at a
  time, starting with the folder for the page's part of the site. Type to search, or pick
  another folder from the menu.
- **Upload…** copies a picture from your Mac into the site in one step.
- **Drop** a picture from the Finder onto a picture setting, the Image dialog, the picture
  library, or into the text where it should go.
- **Paste** a screenshot or a copied picture into the text.
- **File ▸ Add Images…** copies several pictures at once.

![The picture library, with the pictures new on this branch first](images/image-picker.png)

Galley puts pictures where the site expects them, in the images folder of the page's part
of the site, such as `static/images/blog`, and names them in lowercase without spaces.
When you add a picture to the text, write a short description of what it shows. Readers
who cannot see the picture hear it, and search engines read it.

## New pages

**File ▸ New Page…** (⌘N), or the page button above the list, creates a page in the folder
of the page you have open. Give it:

- a **title**, the headline readers see;
- an **address**, which follows the title until you change it. Keep it short, lowercase
  and joined with hyphens, and do not change it once the page is live, or links to it
  break;
- a **publish date**. A date in the future schedules the page for that day.

The new page starts as a **draft** and takes its settings from the newest page in the same
folder, so it fits in. Switch Draft off when it is ready.

![The new page dialog filled in from a Word document](images/new-page.png)

### From a document

**From a document…** in the same dialog, or **File ▸ New Page from Document…** (⌘⇧N),
makes the page from a Word document, a Markdown file or a saved web page. Its headline
becomes the title, the text comes over with its headings, lists, tables and links, and
its pictures go into the site. Notes above the headline, such as a proposed address, stay
out of the page; the dialog shows them, and picks up a proposed address.

## The preview

The preview shows the page as the site will show it, and follows along as you type and
move through the text. **Markdown** shows the plain-text version of the page that the site
offers to AI tools. **Separate window** moves the preview into its own window, for example
for a second screen. **Open in Browser** opens it in your web browser.

If the preview says the preview server stopped, click **Restart Hugo**.

## Saving your work

Open the **Changes** tab. At the top is your branch and what to do next; below, the files
you changed.

![The Changes tab with one changed page, ready to commit](images/changes.png)

### Your own branch

Always work on your own branch. If you are on `develop`, Galley says so: click
**New branch** and give it a short name. Your changes come along. If you committed on
`develop` by mistake, **Move to a new branch…** moves those commits to a branch of yours.
The ⋯ menu next to the branch name creates branches and switches between them.

### Committing

1. Click a file to see what changed: removed text in red, added text in green, pictures
   side by side.
2. Tick the files that belong together. Unticked files stay as they are, for a later
   commit.
3. Write a short note on what you did, such as "Update pricing for the Pro plan", and
   click **Commit**.

Galley sends the commit to your branch on GitHub straight away. To undo changes you do not
want, use the arrow next to a file, or **Discard all**. New files go to the Trash, so you
can still get them back.

### Files Galley warns about

A warning sign marks a new file that looks out of place, such as a document among the
pages, a picture outside the images folders, or a name with spaces or capitals. Such files
start unticked, and Galley asks before committing them. Move them or rename them in the
Files tab.

**Not part of the site** lists files in your copy of the site that the site does not use,
such as notes or source documents. They never go to GitHub. Show them in the Finder to
move them somewhere else, move them to the Trash, or add them to the site if they belong
there.

### Keeping up with the team

Galley checks GitHub every few minutes.

- **Pull** appears when someone else added to your branch. Your own commits go on top of
  theirs.
- **Update** appears when `develop` has moved on since you started your branch. It brings
  your branch up to date with the team's work. If a colleague added to your branch, pull
  first.

Both send the result to GitHub straight away, so a review link always shows your latest
work.

Every count, such as "3 changes on develop not in this branch", opens into the list of
commits behind it: who made them, when, and which files they touched.

### When changes conflict

Sometimes you and a colleague changed the same lines. Pull or Update then stops halfway,
and the Changes tab says which files are affected; they are marked **!**. The first of
them opens in the editor as plain text, settings and all, with both versions of each
conflicting passage: the one from develop (or GitHub) in blue, yours in green, between
marker lines. The preview pauses until the conflicts are settled.

You have three ways out:

- Settle each conflict in the editor: **Keep develop's version**, **Keep your version**,
  or **Keep both**, then edit the text until it reads right. Click the other files marked
  **!** in the Changes tab to open them. Then click **Continue**.
- **Ask Claude to resolve** hands the files to Claude, which combines both versions and
  tells you what it did. Check the result, then click **Continue**.
- **Cancel** puts your branch and your edits back as they were before.

If more of your commits touch the same lines, Galley stops again at the next one.

Edits you have not committed yet are set aside while your branch is brought up to date,
and put back at the end. If they clash with what came in, Galley stops in the same way,
with your edit in green. Once you continue they are back as uncommitted
edits; cancelling returns your branch and your edits to how they were before. Your branch
goes to GitHub only after everything is settled.

## Publishing

When your work is ready, **Merge into develop…** in the Changes tab adds it to `develop`,
and the test site, conclude.dev, shows it a few minutes later. The dialog lists what goes
along. Afterwards you carry on with your own branch.

The **Publishing** section at the bottom of the Changes tab puts `develop` live. Once the
team has checked the result on conclude.dev, **Publish…** updates the live site,
conclude.io, within a few minutes. It first shows whose work goes along, so check with
your colleagues before publishing their work.

## Sharing work for review

The share button at the top right copies a review link to your branch and the page you
have open. Paste it in Slack, or wherever a colleague will see it. If your branch, or your
latest commits, are not on GitHub yet, Galley sends them there first, so your colleague
sees what you see. Changes you have not committed are not included; commit them first.

![The share button's confirmation, with the copied link](images/share.png)

When a colleague clicks the link, Galley opens with a review dialog. It lists the
commits on the branch and who made them, and only then switches. Your own unfinished
changes are committed to your branch first, so nothing gets mixed up. A blue bar at the top
shows the branch you are reviewing; **Back to** your branch takes you back. You can edit
during a review: what you commit goes to the branch you are reviewing.

If clicking the link does nothing, copy it and use **File ▸ Open Review Link…**.

## Claude

The **Claude** button opens Claude, an AI assistant, at the bottom of the window. Ask it in
plain words:

- "Draft a blog post about connecting Jira and Microsoft Teams, in the style of our other
  posts."
- "Shorten the introduction of this page."
- "Which pages mention our free trial?"

Claude knows which page you have open, so "this page" works. It edits pages without asking
each time, and you see every change in the Changes tab, where you commit or discard it as
usual. Claude does not commit or publish.

Drop files onto the Claude pane to give them to Claude, such as a Word draft or a
screenshot. Word documents and web pages arrive as text with their links intact.

## Settings

**Galley ▸ Settings…** (⌘,):

- **Remove a merged branch from GitHub** (on): after you merge into develop, your branch
  disappears from GitHub to keep the list tidy. You keep working on it here, and your next
  commit brings it back.
- **Claude Code pane**: turns Claude off entirely.
- **Claude model**: Opus, the most careful, or Sonnet, which is quicker.

## Keyboard shortcuts

| Shortcut | Does                           |
| -------- | ------------------------------ |
| ⌘P       | Find a page                    |
| ⌘N       | New page                       |
| ⌘⇧N      | New page from a document       |
| ⌘S       | Save now                       |
| ⌘Z, ⌘⇧Z  | Undo, redo                     |
| ⌘F       | Find on the page               |
| ⌘R       | Find and replace on the page   |
| ⌘⇧F      | Search the site                |
| ⌘⇧R      | Search and replace in the site |
| ⌘⇧V      | Paste as plain text            |
| ⌘⇧P      | Show or hide the preview       |
| ⌥⌘P      | Preview in a separate window   |
| ⌥⌘R      | Reload the preview             |
| ⌘J       | Show or hide Claude            |
| ⌘+, ⌘-   | Larger or smaller text         |
| ⌘,       | Settings                       |

## When something goes wrong

**The preview is empty or says the server stopped.** Click **Restart Hugo** in the
preview. If it stops again, a page probably has an error in its settings; the message
names the file.

**"Could not reach GitHub."** Check your internet connection. Galley tries again by itself
every few minutes; the ⋯ menu in the Changes tab has **Check for updates now**.

**Galley says it is not signed in to GitHub.** Open **Galley ▸ Setup…** and sign in again.

**My change is not on conclude.dev.** Check the Changes tab: the change must be committed
and merged into develop. The site takes a few minutes to rebuild.

**A link has a red wavy underline.** No page or file lives at that address. Check for a
typo, or use Find Page to look up the right address.

**I want to start over with a page.** Use the arrow next to the file in the Changes tab
to discard your changes to it. Committed work can always be recovered; ask a developer.
