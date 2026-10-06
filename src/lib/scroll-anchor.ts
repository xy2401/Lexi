/** Align a list anchor within its scroll pane, or within the mobile document. */
export function scrollToListAnchor(target: HTMLElement): void {
  const behavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto' : 'smooth'
  let parent = target.parentElement
  while (parent && parent !== document.body && parent !== document.documentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) {
      const top = target.getBoundingClientRect().top - parent.getBoundingClientRect().top
        + parent.scrollTop - parent.clientTop - 12
      parent.scrollTo({ top: Math.max(0, top), behavior })
      return
    }
    parent = parent.parentElement
  }

  const header = document.querySelector<HTMLElement>('.mobile-app-bar')?.getBoundingClientRect()
  const headerOffset = header && header.top <= 0 ? Math.max(0, header.bottom) : 0
  const top = target.getBoundingClientRect().top + window.scrollY - headerOffset - 12
  window.scrollTo({ top: Math.max(0, top), behavior })
}
