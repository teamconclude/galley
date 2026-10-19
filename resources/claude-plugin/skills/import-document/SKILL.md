---
name: import-document
description: Put the text of a document onto a page of the site exactly as written, with every link. Use when the editor gives a Word document, a Google Doc download, a Markdown or text file, or pasted text, and asks to create a page from it, fill a page with it, or update a page from it.
---

# Import a document

The document is the specification. The page must end up with the same words, in the same
order, under the same headings, with the same links. Nothing is added, shortened,
reworded or "improved", and no link is added, dropped or pointed elsewhere.

## 1. Get the document as Markdown

- Files dropped on the Claude pane are already converted by Galley: a `.docx` or `.html`
  arrives as a `.md` file with the same name in the inbox folder, and its pictures as
  `<name>-image-1.png` and so on beside it. Work from that `.md` file; it was converted by
  rule, so its text and links are exactly the document's.
- A `.md` or `.txt` file is used as it is.
- A Word file anywhere else (Downloads, the Desktop): ask the editor to drop it on the
  Claude pane instead of reading it yourself.
- A Google Doc: ask the editor to download it (File › Download › Microsoft Word or
  Markdown) and drop the file on the pane.
- A PDF loses its links. Say so and ask for the Word or Markdown version if links matter.

## 2. Separate notes from page text

Documents often start with notes for whoever publishes them: a proposed address, keywords,
a meta title or description, a request for a redirect. These are not page text.

- Use them for the page's settings only where the site's own skill or CLAUDE.md says how.
- Anything else, such as a redirect request or an instruction about another page, goes
  back to the editor as a question. Do not act on it.

The page's title usually comes from its settings, so the document's main heading becomes
the title setting rather than a heading in the text, unless the page's siblings do it
differently. Look at one sibling page before writing.

## 3. Write the page

- Copy the Markdown text into the page body. Keep the existing settings of the page
  unless the editor asked to change them.
- Links to the site's own pages: write them the way the sibling pages do. If siblings use
  `/product/connect/` rather than `https://<site>/product/connect/`, shorten the site's
  own full addresses in the same way, and nothing else about them.
- Pictures from the document: do not place them on your own. List them and ask the editor
  which ones belong where, then follow the add-images skill.

## 4. Check the links, mechanically

Compare the links of the document with those of the page, after shortening the site's
own addresses the same way in both:

```sh
links() { grep -oE '\]\([^) ]+' "$1" | cut -c3- | grep -viE '\.(png|jpe?g|gif|webp|svg|avif)$' |
  sed -E 's#^https?://(www\.)?SITE##' | sort -u; }
diff <(links DOCUMENT.md) <(links PAGE.md)
```

Replace SITE with the site's address (for example `conclude\.io`), DOCUMENT.md with the
converted document and PAGE.md with the page. Links in the document's notes (step 2) may
be missing from the page on purpose. Any other difference is a mistake to fix before you
report back.

## 5. Report

Tell the editor in a few lines: which page you wrote, how many links it has and that they
match the document, any notes you left for them to decide, and any link in the document
that looks wrong (for example one to a page that does not exist), without changing it.
