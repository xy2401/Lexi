/**
 * 文本解析引擎 + 分词
 * 
 * 将输入文本（纯文本/Markdown/HTML）解析为带 <ruby> 标注的 HTML
 * 不破坏原始排版与复制粘贴特性
 */
import { marked } from 'marked'

export interface Token {
  text: string
  isWord: boolean
}

export interface ReaderTextAnnotation {
  text: string
  kind?: 'tag'
}

export type ReaderAnnotationValue = string | ReaderTextAnnotation | null

// 英文单词匹配正则（含连字符和撇号）
const WORD_REGEX = /[a-zA-Z][a-zA-Z'’-]*/g

/**
 * 将纯文本分词为 token 数组
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let lastIndex = 0

  for (const match of text.matchAll(WORD_REGEX)) {
    const idx = match.index!
    // 前面的非单词文本
    if (idx > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, idx), isWord: false })
    }
    tokens.push({ text: match[0], isWord: true })
    lastIndex = idx + match[0].length
  }

  // 尾部非单词文本
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), isWord: false })
  }

  return tokens
}

/**
 * 检测输入类型
 */
export function detectInputType(text: string): 'markdown' | 'html' | 'plain' {
  const trimmed = text.trim()
  if (trimmed.startsWith('<') && trimmed.includes('>')) return 'html'
  if (/^#{1,6}\s/m.test(trimmed) || /\*\*.*\*\*/.test(trimmed) || /^\s*[-*]\s/m.test(trimmed)) {
    return 'markdown'
  }
  return 'plain'
}

/**
 * 将 Markdown 转为 HTML
 */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string
}

/**
 * 对 HTML 字符串中的文本节点进行分词标注
 * 返回带 <ruby> 包裹的 HTML 字符串
 * 
 * @param html 原始 HTML
 * @param lookupFn 查词函数，返回简明释义（用于 <rt>），null 表示不标注
 */
export function annotateHtml(
  html: string,
  lookupFn: (word: string) => ReaderAnnotationValue
): string {
  // 使用 DOMParser 解析 HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 递归遍历文本节点
  processNode(doc.body, lookupFn)

  return doc.body.innerHTML
}

function processNode(node: Node, lookupFn: (word: string) => ReaderAnnotationValue): void {
  const children = Array.from(node.childNodes)

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || ''
      if (!text.trim()) continue

      const tokens = tokenize(text)
      // 如果没有单词 token，跳过
      if (!tokens.some(t => t.isWord)) continue

      const fragment = document.createDocumentFragment()

      for (const token of tokens) {
        if (!token.isWord) {
          fragment.appendChild(document.createTextNode(token.text))
        } else {
          const annotation = lookupFn(token.text)
          if (annotation) {
            // 创建 <ruby> 标签
            const ruby = document.createElement('ruby')
            ruby.textContent = token.text
            ruby.dataset.word = token.text.toLowerCase()
            const rt = document.createElement('rt')
            if (typeof annotation === 'string') {
              rt.textContent = annotation
            } else {
              if (annotation.kind === 'tag') {
                const tag = document.createElement('span')
                tag.className = 'reader-tag-chip'
                tag.textContent = annotation.text
                rt.appendChild(tag)
                ruby.dataset.annotationKind = annotation.kind
              } else {
                rt.textContent = annotation.text
              }
            }
            ruby.appendChild(rt)
            fragment.appendChild(ruby)
          } else {
            // 不需要标注的单词，用 span 包裹以支持点击
            const span = document.createElement('span')
            span.className = 'word-plain'
            span.textContent = token.text
            span.dataset.word = token.text.toLowerCase()
            fragment.appendChild(span)
          }
        }
      }

      node.replaceChild(fragment, child)
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      // 跳过 script/style/ruby 内部
      const tag = (child as Element).tagName.toLowerCase()
      if (tag === 'script' || tag === 'style' || tag === 'ruby' || tag === 'rt') continue
      processNode(child, lookupFn)
    }
  }
}
