// JavaScript for the preview page: scrolls to the top-level content block with the given
// index. Bookshop wraps every component in <!--bookshop-live name(…)--> … <!--bookshop-live
// end--> comments; the blocks are the components directly inside the page component.
export function showBlockScript(index: number): string {
  return `(function (wanted) {
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
      var header = document.querySelector('header, .navbar, nav')
      var offset = header && getComputedStyle(header).position !== 'static' ? header.offsetHeight : 0
      var top = n.getBoundingClientRect().top + window.scrollY - offset - 12
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      n.style.transition = 'outline-color 0.6s'
      n.style.outline = '2px solid rgba(62, 184, 163, 0.9)'
      n.style.outlineOffset = '-2px'
      setTimeout(function () { n.style.outlineColor = 'transparent' }, 900)
      setTimeout(function () { n.style.outline = ''; n.style.outlineOffset = ''; n.style.transition = '' }, 1600)
      return true
    }
  }
  return false
})(${index})`
}
