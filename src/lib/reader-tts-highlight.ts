function isIgnoredTextNode(node: Node): boolean {
  return Boolean(node.parentElement?.closest('rt, .read-paragraph-btn'))
}

export function findReaderWordAtBoundary(
  container: Element,
  charIndex: number,
  charLength = 0,
): HTMLElement | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: node => isIgnoredTextNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  const boundaryStart = Math.max(0, charIndex)
  const boundaryEnd = boundaryStart + Math.max(1, charLength)
  let offset = 0
  let nearest: HTMLElement | null = null

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const length = node.textContent?.length || 0
    const start = offset
    const end = start + length
    const word = node.parentElement?.closest<HTMLElement>('ruby, .word-plain') || null

    if (word) {
      if (start < boundaryEnd && end > boundaryStart) return word
      if (!nearest && start >= boundaryStart && start - boundaryStart <= 2) nearest = word
    }
    offset = end
  }

  return nearest
}

export function highlightReaderWordAtBoundary(
  container: Element,
  charIndex: number,
  charLength = 0,
): HTMLElement | null {
  const word = findReaderWordAtBoundary(container, charIndex, charLength)
  word?.classList.add('tts-highlight')
  return word
}
