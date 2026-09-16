import type { PreviewTarget } from './types'

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

// Bookshop wraps every component in <!--bookshop-live name(…)--> … <!--bookshop-live end-->
// comments; the blocks are the components directly inside the page component.
function showBlockScript(index: number): string {
  return `(function (wanted) {
  ${reveal}
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT)
  var page = null
  for (var c = walker.nextNode(); c; c = walker.nextNode()) {
    if (/^\\s*bookshop-live name\\(page\\)/.test(c.nodeValue)) {
      for (var e = c.nextSibling; e; e = e.nextSibling) if (e.nodeType === 1) { page = e; break }
      break
    }
  }
  if (!page) return false
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
