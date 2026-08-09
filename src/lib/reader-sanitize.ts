import DOMPurify from 'dompurify'

const BLOCKED_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea',
  'select', 'option', 'meta', 'link', 'base', 'style', 'template',
]

const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'poster']
const ALLOWED_URI = /^(?:(?:https?|mailto|blob):|data:image\/|[^a-z]|[a-z+.-]+(?:[^a-z+.:\-]|$))/i

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true
  return /^(https?:|data:image\/|blob:|mailto:)/i.test(trimmed)
}

export function sanitizeReaderHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: BLOCKED_TAGS,
    FORBID_ATTR: ['style', 'srcdoc'],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: ALLOWED_URI,
  })

  const doc = new DOMParser().parseFromString(clean, 'text/html')
  doc.body.querySelectorAll('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name)
    }
    for (const name of URL_ATTRIBUTES) {
      const value = element.getAttribute(name)
      if (value && !isSafeUrl(value)) element.removeAttribute(name)
    }
  })
  return doc.body.innerHTML
}

export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

export function extractSafeDescription(value: string): string {
  return htmlToPlainText(sanitizeReaderHtml(value))
}
