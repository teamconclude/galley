import type { DropSpot, PreviewTarget } from './types'

// JavaScript for the preview page that scrolls to a target and outlines it for a moment.
export function previewScript(target: PreviewTarget): string {
  return target.kind === 'block'
    ? showBlockScript(target.index)
    : showTextScript(target.snippet, target.heading)
}

// Scrolls only as far as needed to show the element in full, below the fixed header and
// with a small margin; one taller than the viewport is aligned at the top.
const reveal = `function reveal(n) {
  var header = document.querySelector('header, .navbar, nav')
  var offset = header && getComputedStyle(header).position !== 'static' ? header.offsetHeight : 0
  var margin = 16
  var r = n.getBoundingClientRect()
  var visibleTop = offset + margin
  var visibleBottom = window.innerHeight - margin
  var delta = 0
  if (r.top < visibleTop || r.height > visibleBottom - visibleTop) delta = r.top - visibleTop
  else if (r.bottom > visibleBottom) delta = r.bottom - visibleBottom
  if (delta !== 0) window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'smooth' })
  n.style.transition = 'outline-color 0.8s'
  n.style.outline = '2px solid rgba(62, 184, 163, 0.9)'
  n.style.outlineOffset = '-2px'
  setTimeout(function () { n.style.outlineColor = 'transparent' }, 2500)
  setTimeout(function () { n.style.outline = ''; n.style.outlineOffset = ''; n.style.transition = '' }, 3400)
  return true
}`

// The first text element of the page whose text starts with the snippet, or failing
// that contains its first half. A heading line only matches headings, not a table of
// contents that repeats them.
function showTextScript(snippet: string, heading: boolean): string {
  return `(function (snippet, heading) {
  ${reveal}
  var norm = function (s) { return s.replace(/\\s+/g, ' ').trim() }
  var root = document.querySelector('main') || document.body
  var els = root.querySelectorAll(heading ? 'h1,h2,h3,h4,h5,h6' : 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,figcaption,dt,dd')
  var half = snippet.slice(0, Math.max(20, Math.floor(snippet.length / 2)))
  var loose = null
  for (var i = 0; i < els.length; i++) {
    var t = norm(els[i].textContent || '')
    if (!t) continue
    if (t.indexOf(snippet) === 0) return reveal(els[i])
    if (!loose && t.indexOf(half) >= 0) loose = els[i]
  }
  return loose ? reveal(loose) : false
})(${JSON.stringify(snippet)}, ${heading})`
}

// A site marks each top-level block with a <!--galley-block--> comment before it; the
// block is the next element. Bookshop instead wraps every component in
// <!--bookshop-live name(…)--> … <!--bookshop-live end--> comments, and the blocks are the
// components directly inside the page component.
function showBlockScript(index: number): string {
  return `(function (wanted) {
  ${reveal}
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT)
  var page = null, marks = []
  for (var c = walker.nextNode(); c; c = walker.nextNode()) {
    var text = c.nodeValue.trim()
    if (text === 'galley-block') marks.push(c)
    else if (!page && /^bookshop-live name\\(page\\)/.test(text)) page = c
  }
  if (marks.length > wanted) {
    for (var m = marks[wanted].nextSibling; m; m = m.nextSibling) if (m.nodeType === 1) return reveal(m)
    return false
  }
  if (!page) return false
  for (var e = page.nextSibling; e; e = e.nextSibling) if (e.nodeType === 1) { page = e; break }
  if (page.nodeType !== 1) return false
  var depth = 0, seen = -1, inside = false
  for (var n = page.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 8) {
      var v = n.nodeValue.trim()
      if (/^bookshop-live name\\(/.test(v)) { if (depth === 0) { seen++; inside = seen === wanted } depth++ }
      else if (/^bookshop-live end/.test(v)) depth--
    } else if (inside && n.nodeType === 1) {
      return reveal(n)
    }
  }
  return false
})(${index})`
}

// What lies at a point of the page, as a DropSpot. Near the top or bottom edge the page
// scrolls a little first, so a drag can reach any part of it. A picture counts with the
// <picture> or <figure> around it; text counts as the block that holds it, a whole quote
// or table at once; a point between blocks takes the nearest one above or below.
export function dropSpotScript(x: number, y: number): string {
  return `(function (x, y) {
  if (y < 40) window.scrollBy(0, -20)
  else if (y > window.innerHeight - 40) window.scrollBy(0, 20)
  var norm = function (s) { return s.replace(/\\s+/g, ' ').trim() }
  var box = function (n) { var r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, width: r.width } }
  var path = function (img) { try { return new URL(img.getAttribute('src') || '', location.href).pathname } catch (e) { return '' } }
  var root = document.querySelector('main') || document.body
  var el = document.elementFromPoint(x, y)
  if (!el || !root.contains(el)) return { kind: 'outside' }
  var holder = el.closest('picture, figure')
  var img = el.closest('img') || (holder && holder.querySelector('img'))
  if (img && root.contains(img)) {
    var src = path(img)
    var same = Array.prototype.filter.call(root.querySelectorAll('img'), function (i) { return path(i) === src })
    return { kind: 'image', src: src, nth: same.indexOf(img), rect: box(img) }
  }
  var blocks = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,table,dt,dd,figcaption'
  var block = el.closest(blocks)
  if (!block || !root.contains(block)) {
    var best = null, gap = Infinity
    root.querySelectorAll(blocks).forEach(function (b) {
      var r = b.getBoundingClientRect()
      if (r.height === 0 || x < r.left || x > r.right) return
      var d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
      if (d < gap) { gap = d; best = b }
    })
    block = gap < 80 ? best : null
  }
  if (!block) return { kind: 'outside' }
  var outer = block.closest('blockquote, table')
  if (outer && root.contains(outer)) block = outer
  var r = block.getBoundingClientRect()
  return {
    kind: 'text',
    text: norm(block.textContent || '').slice(0, 200),
    heading: /^H[1-6]$/.test(block.tagName),
    after: y > r.top + r.height / 2,
    rect: box(block)
  }
})(${x}, ${y})`
}

// Shows where a dragged picture would go: a line above or below a block, or an outline
// around a picture it would swap. Without a spot, the mark goes away.
export function dropMarkScript(spot: DropSpot | null): string {
  const mark =
    spot?.kind === 'text'
      ? {
          top: (spot.after ? spot.rect.bottom + 4 : spot.rect.top - 7) + 'px',
          left: spot.rect.left + 'px',
          width: spot.rect.width + 'px',
          height: '3px',
          border: 'none',
          background: 'rgba(62, 184, 163, 0.95)'
        }
      : spot?.kind === 'image'
        ? {
            top: spot.rect.top - 3 + 'px',
            left: spot.rect.left - 3 + 'px',
            width: spot.rect.width + 'px',
            height: spot.rect.bottom - spot.rect.top + 'px',
            border: '3px solid rgba(62, 184, 163, 0.95)',
            background: 'rgba(62, 184, 163, 0.15)'
          }
        : null
  return `(function (mark) {
  var el = document.getElementById('galley-drop-mark')
  if (!mark) { if (el) el.remove(); return true }
  if (!el) {
    el = document.createElement('div')
    el.id = 'galley-drop-mark'
    el.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border-radius:2px;box-sizing:content-box'
    document.body.appendChild(el)
  }
  for (var k in mark) el.style[k] = mark[k]
  return true
})(${JSON.stringify(mark)})`
}
