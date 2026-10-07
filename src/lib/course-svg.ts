import DOMPurify from 'dompurify'
import { COURSE_SVG_SIZES, type CourseSvgAsset } from './course-visual-presets.mjs'

export type { CourseSvgAsset }
export interface CourseSvgBinding {
  selector: string
  attributes?: Record<string, string | number>
  text?: string
}

const pending = new Map<CourseSvgAsset, Promise<string>>()

/** Only registered local assets can be loaded. Concurrent readers share a request. */
export function loadCourseSvg(asset: CourseSvgAsset): Promise<string> {
  if (!Object.prototype.hasOwnProperty.call(COURSE_SVG_SIZES, asset)) return Promise.reject(new Error('未知课程 SVG'))
  const existing = pending.get(asset)
  if (existing) return existing
  const request = (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}data/course-visuals/${asset}.svg`)
    if (!response.ok) throw new Error(`SVG HTTP ${response.status}`)
    const source = await response.text()
    const xml = new DOMParser().parseFromString(source, 'image/svg+xml')
    const root = xml.documentElement
    const [width, height] = COURSE_SVG_SIZES[asset]
    if (xml.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg'
      || root.getAttribute('viewBox') !== `0 0 ${width} ${height}`) throw new Error('课程 SVG 格式无效')
    return DOMPurify.sanitize(source, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_ATTR: ['role'],
      FORBID_TAGS: ['style', 'foreignObject', 'image', 'use', 'animate', 'animateMotion', 'animateTransform', 'set'],
      FORBID_ATTR: ['style', 'href', 'xlink:href'],
    })
  })().finally(() => pending.delete(asset))
  pending.set(asset, request)
  return request
}

/** Each inline instance needs its own marker IDs, including repeated diagrams. */
export function scopeCourseSvg(source: string, instanceId: string): string {
  const xml = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = xml.documentElement
  const ids = new Map<string, string>()
  for (const element of root.querySelectorAll('[id]')) {
    const id = element.getAttribute('id')!
    ids.set(id, `${instanceId}-${id}`)
    element.setAttribute('id', ids.get(id)!)
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const value = attribute.value.replace(/url\(#([\w-]+)\)/g, (_match, id: string) => `url(#${ids.get(id) || id})`)
      if (value !== attribute.value) element.setAttribute(attribute.name, value)
    }
  }
  return new XMLSerializer().serializeToString(root)
}
