---
name: add-images
description: Put images the editor provides onto a page of the site, or swap one image for another. Use when the editor drops or names image files and asks to add, replace or move images on a page.
---

# Add or replace images

1. **Where the file goes.** Images belong in the site's images folder for the page's
   section (Galley's instructions name the folder), for example `static/images/blog/` for
   a blog post. Never put images next to the pages.
2. **Its name.** Lowercase, words joined by hyphens, no spaces, starting from the page's
   file name: `<page-name>-graph1.webp`, `<page-name>-screenshot.png`. Look at the names
   already in the folder and follow their pattern. Never overwrite an existing file; pick
   the next free name instead.
3. **Its format.** Keep the format it came in. Do not convert or resize unless asked.
4. **Copy it** with `cp` from where the editor dropped it (the inbox folder) into the
   images folder.
5. **Refer to it** from the page by its web address, the folder under the static folder:
   `/images/<section>/<file>`. Put it exactly where the editor said. When replacing, change
   only that one reference and keep the rest of the line, including its description.
6. **Description.** Every image needs a short description of what it shows, for readers
   who cannot see it. Keep an existing one; for a new image write one from what you see
   and mention it in your report so the editor can adjust it.
7. **Page settings.** A thumbnail or header picture is usually a page setting, not part of
   the text. Change the setting when that is what the editor means; ask if unsure.

Report which file went where and under which name.
