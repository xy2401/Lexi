import { describe, expect, it } from 'vitest'
import { findReaderWordAtBoundary, highlightReaderWordAtBoundary } from '../src/lib/reader-tts-highlight'

function fixture(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = '<p><button class="read-paragraph-btn">⏸</button><ruby data-word="hello">Hello<rt>你好</rt></ruby> <span class="word-plain" data-word="world">world</span>.</p>'
  return container
}

describe('reader TTS word highlighting', () => {
  it('ignores the paragraph control and ruby translation in TTS offsets', () => {
    const container = fixture()
    expect(findReaderWordAtBoundary(container, 0, 5)?.dataset.word).toBe('hello')
    expect(findReaderWordAtBoundary(container, 6, 5)?.dataset.word).toBe('world')
  })

  it('adds the active highlight to the matched word only', () => {
    const container = fixture()
    const highlighted = highlightReaderWordAtBoundary(container, 6, 5)
    expect(highlighted?.dataset.word).toBe('world')
    expect(container.querySelector('[data-word="hello"]')?.classList.contains('tts-highlight')).toBe(false)
    expect(container.querySelector('[data-word="world"]')?.classList.contains('tts-highlight')).toBe(true)
  })

  it('tolerates a boundary reported immediately before the word', () => {
    const container = fixture()
    expect(findReaderWordAtBoundary(container, 5, 1)?.dataset.word).toBe('world')
  })
})
