type SemanticTagBuilder = (content: string, attributes: string) => string

const WORD_FORMS = ['changed', 'irregular'] as const
const MORPHEME_KINDS = ['prefix', 'root', 'suffix'] as const
const MORPHEME_FORMS = ['variant', 'irregular'] as const

function getAllowedAttribute(
  attributes: string,
  name: string,
  allowed: readonly string[],
): string | undefined {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  const value = match?.[1]?.toLowerCase()
  return value && allowed.includes(value) ? value : undefined
}

function replaceSemanticTag(html: string, tagName: string, build: SemanticTagBuilder): string {
  const pattern = new RegExp(
    `<${tagName}\\b([^>]*)>\\s*<code>([\\s\\S]*?)<\\/code>\\s*<\\/${tagName}>`,
    'gi',
  )
  return html.replace(pattern, (_match, attributes: string, content: string) => build(content, attributes))
}

function interactiveCode(content: string, type: 'word' | 'sentence', form?: string): string {
  const action = type === 'word' ? 'lookup' : 'speak'
  const classes = ['course-token', `token-${type}`]
  if (form) classes.push(`form-${form}`)
  return `<code class="${classes.join(' ')}" data-course-action="${action}" tabindex="0">${content}</code>`
}

function staticCode(content: string, type: 'morpheme' | 'phoneme' | 'notation', modifiers: string[] = []): string {
  return `<code class="course-token token-${type}${modifiers.length ? ` ${modifiers.join(' ')}` : ''}">${content}</code>`
}

/**
 * A slash, arrow, bar, or plus sign between lexical items denotes a relation
 * or a list, not a pronounceable sentence. Keep the punctuation as ordinary
 * text and turn every English word into its own dictionary action.
 */
function splitCompositeLexicalCode(content: string): string {
  return content.replace(/[A-Za-z][A-Za-z'’-]*|\d+(?:[,.]\d+)*/g, token => (
    /^[A-Za-z]/.test(token) ? interactiveCode(token, 'word') : staticCode(token, 'notation')
  ))
}

function splitCompositeNumberCode(content: string): string {
  return content.replace(/\d+(?:[,.]\d+)*/g, number => staticCode(number, 'notation'))
}

function transformAuthorTags(html: string): string {
  let transformed = html

  transformed = replaceSemanticTag(transformed, 'lexi-sentence', content => interactiveCode(content, 'sentence'))
  transformed = replaceSemanticTag(transformed, 'lexi-word', (content, attributes) => {
    const form = getAllowedAttribute(attributes, 'form', WORD_FORMS)
    return interactiveCode(content, 'word', form)
  })
  transformed = replaceSemanticTag(transformed, 'lexi-morpheme', (content, attributes) => {
    const kind = getAllowedAttribute(attributes, 'kind', MORPHEME_KINDS)
    const form = getAllowedAttribute(attributes, 'form', MORPHEME_FORMS)
    const modifiers = [kind && `morpheme-${kind}`, form && `form-${form}`].filter(Boolean) as string[]
    return staticCode(content, 'morpheme', modifiers)
  })
  transformed = replaceSemanticTag(transformed, 'lexi-phoneme', content => staticCode(content, 'phoneme'))
  transformed = replaceSemanticTag(transformed, 'lexi-notation', content => staticCode(content, 'notation'))

  // Transitional author syntax used by the original course files.
  transformed = replaceSemanticTag(transformed, 'lexi-irregular', content => interactiveCode(content, 'word', 'irregular'))
  transformed = replaceSemanticTag(transformed, 'lexi-variant', content => interactiveCode(content, 'word', 'changed'))

  return transformed
}

function classifyPlainInlineCode(html: string): string {
  return html.replace(/<code>([\s\S]*?)<\/code>/gi, (_match, content: string) => {
    const plain = content.replace(/<[^>]+>/g, '').trim()
    if (/^\/.+\/$/.test(plain) || /^\[.+\]$/.test(plain)) return staticCode(content, 'phoneme')

    const hasLetters = /[A-Za-z]/.test(plain)
    const hasDigits = /\d/.test(plain)
    if (!hasLetters && !hasDigits) return staticCode(content, 'notation')
    if (hasLetters && /\s(?:\/|→|\||\+)\s/.test(plain)) return splitCompositeLexicalCode(content)
    if (!hasLetters && hasDigits && /\s\|\s/.test(plain)) return splitCompositeNumberCode(content)
    if (/\s/.test(plain)) return interactiveCode(content, 'sentence')
    if (!hasLetters && hasDigits) {
      return `<code class="course-token token-word token-number" data-course-action="speak" tabindex="0">${content}</code>`
    }
    return interactiveCode(content, 'word')
  })
}

/**
 * Converts author-facing semantic tags into the standard code elements used by
 * the course reader, then annotates ordinary inline Markdown code. Run after
 * Marked and before DOMPurify.
 */
export function transformCourseSemanticTags(html: string): string {
  return classifyPlainInlineCode(transformAuthorTags(html))
}
