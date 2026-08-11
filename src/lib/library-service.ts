import { readerDb, getReaderSetting, setReaderSetting } from './reader-db'
import { extractSafeDescription, htmlToPlainText, sanitizeReaderHtml } from './reader-sanitize'
import type {
  BookPackage,
  CachedChapter,
  LibraryBook,
  LibrarySource,
  LibraryValidationResult,
  ReaderAsset,
  ReadingProgress,
  ResolvedChapter,
  TocItem,
} from './reader-types'

type LibrCatalogSubject = {
  slug?: string
}

type LibrCatalogBookSubject = {
  slug?: string
  rank?: number
}

type LibrCatalogBook = {
  title?: string
  author?: string
  href?: string
  web_url?: string
  repo_name?: string
  asset_path?: string
  subjects?: LibrCatalogBookSubject[]
}

type LibrCatalog = {
  schema_version?: number
  subjects?: LibrCatalogSubject[]
  books?: LibrCatalogBook[]
}

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i
const DEFAULT_LOCAL_SOURCE_ID = 'standard-ebooks-local'
const DEFAULT_REMOTE_SOURCE_ID = 'standard-ebooks-libr'
const DEFAULT_LOCAL_LIBRARY_URL = 'http://localhost:8000'
const DEFAULT_REMOTE_LIBRARY_URL = 'https://libr.2401.xyz'
const CURRENT_LIBRARY_ADAPTER = 'standard-ebooks-library-v2' as const
const LIBR_SCHEMA_VERSION = 2

function byLocalName(root: ParentNode, name: string): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(element => element.localName === name)
}

function firstText(root: ParentNode, name: string): string {
  return byLocalName(root, name)[0]?.textContent?.trim() || ''
}

export function normalizeLibraryBaseUrl(value: string): string {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('书库地址只支持 HTTP/HTTPS')
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/+$/, '')
}

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`${label} 包含不安全字符：${value}`)
}

function normalizeAssetPath(repoName: string, value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '')
  const segments = normalized.split('/')
  if (!segments.length || segments.some(segment => !SAFE_SEGMENT.test(segment))) {
    throw new Error(`asset_path 包含不安全路径：${value}`)
  }
  if (segments[0] !== 'library' || segments[1] !== repoName) {
    throw new Error(`asset_path 必须位于 library/${repoName} 内`)
  }
  return segments.join('/')
}

export function normalizeLibraryCatalog(sourceId: string, raw: unknown): {
  books: LibraryBook[]
  subjects: number
  schemaVersion: number
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('目录根节点必须是对象')
  const catalog = raw as LibrCatalog
  if (catalog.schema_version !== LIBR_SCHEMA_VERSION) {
    throw new Error(`不支持的 Libr 目录版本：${String(catalog.schema_version ?? '缺失')}`)
  }
  if (!Array.isArray(catalog.subjects)) throw new Error('目录 subjects 必须是数组')
  if (!Array.isArray(catalog.books)) throw new Error('目录 books 必须是数组')

  const subjectSlugs = new Set<string>()
  catalog.subjects.forEach((subject, index) => {
    const slug = String(subject?.slug || '').trim()
    if (!slug) throw new Error(`subjects 第 ${index + 1} 条缺少 slug`)
    assertSafeSegment(slug, '分类')
    if (subjectSlugs.has(slug)) throw new Error(`分类重复：${slug}`)
    subjectSlugs.add(slug)
  })

  const seenRepos = new Set<string>()
  const books = catalog.books.map((row, index): LibraryBook => {
    const repoName = String(row?.repo_name || '').trim()
    const title = String(row?.title || '').trim()
    const author = String(row?.author || '').trim() || 'Anonymous'
    if (!repoName || !title) throw new Error(`books 第 ${index + 1} 条缺少 repo_name/title`)
    assertSafeSegment(repoName, 'repo_name')
    if (seenRepos.has(repoName)) throw new Error(`repo_name 重复：${repoName}`)
    seenRepos.add(repoName)
    const assetPath = normalizeAssetPath(repoName, String(row?.asset_path || ''))
    if (!Array.isArray(row.subjects)) throw new Error(`《${title}》的 subjects 必须是数组`)
    const ranks: number[] = []
    const subjects = Array.from(new Set(row.subjects.map((subject, subjectIndex) => {
      const slug = String(subject?.slug || '').trim()
      if (!slug) throw new Error(`《${title}》的 subjects 第 ${subjectIndex + 1} 条缺少 slug`)
      assertSafeSegment(slug, '分类')
      if (!subjectSlugs.has(slug)) throw new Error(`《${title}》引用未知分类：${slug}`)
      if (typeof subject.rank === 'number' && Number.isFinite(subject.rank)) ranks.push(subject.rank)
      return slug
    })))
    return {
      key: `${sourceId}:${repoName}`,
      canonicalId: `standardebooks:${repoName}`,
      sourceId,
      origin: 'remote',
      repoName,
      title,
      author,
      subjects,
      assetPath,
      rank: ranks.length ? Math.min(...ranks) : undefined,
      webUrl: row.web_url ? String(row.web_url) : undefined,
      sourceHref: row.href ? String(row.href) : undefined,
    }
  })

  return { books, subjects: subjectSlugs.size, schemaVersion: catalog.schema_version }
}

async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function fetchText(url: string, label: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new Error(`${label}无法访问，可能是网络或 CORS 配置错误：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) throw new Error(`${label}返回 HTTP ${response.status}`)
  return response.text()
}

export async function ensureDefaultLibrarySource(): Promise<LibrarySource | null> {
  const sources = await readerDb.sources.toArray()
  for (const source of sources) {
    if (source.adapter === CURRENT_LIBRARY_ADAPTER) continue
    await clearSourceRemoteCache(source.id)
    await readerDb.sources.update(source.id, {
      adapter: CURRENT_LIBRARY_ADAPTER,
      catalogHash: undefined,
      catalogUpdatedAt: undefined,
      updatedAt: Date.now(),
    })
    source.adapter = CURRENT_LIBRARY_ADAPTER
    source.catalogHash = undefined
    source.catalogUpdatedAt = undefined
  }

  const remoteUrl = normalizeLibraryBaseUrl(import.meta.env.VITE_DEFAULT_LIBRARY_URL || DEFAULT_REMOTE_LIBRARY_URL)
  const defaults = [
    ...(import.meta.env.DEV ? [{ id: DEFAULT_LOCAL_SOURCE_ID, name: 'Standard Ebooks 本地书库', baseUrl: DEFAULT_LOCAL_LIBRARY_URL }] : []),
    { id: DEFAULT_REMOTE_SOURCE_ID, name: 'Libr Standard Ebooks 书库', baseUrl: remoteUrl },
  ]
  for (const desired of defaults) {
    if (sources.some(source => normalizeLibraryBaseUrl(source.baseUrl) === desired.baseUrl)) continue
    const now = Date.now()
    const source: LibrarySource = {
      ...desired,
      adapter: CURRENT_LIBRARY_ADAPTER,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }
    await readerDb.sources.put(source)
    sources.push(source)
  }

  const activeId = await getReaderSetting('activeLibrarySourceId', '')
  const active = sources.find(source => source.id === activeId && source.enabled)
    || sources.find(source => source.enabled)
    || sources[0]
    || null
  if (active && active.id !== activeId) await setReaderSetting('activeLibrarySourceId', active.id)
  return active
}

export async function listLibrarySources(): Promise<LibrarySource[]> {
  await ensureDefaultLibrarySource()
  return readerDb.sources.orderBy('createdAt').toArray()
}

export async function getActiveLibrarySource(): Promise<LibrarySource | null> {
  const sources = await listLibrarySources()
  if (!sources.length) return null
  const activeId = await getReaderSetting('activeLibrarySourceId', '')
  return sources.find(source => source.id === activeId && source.enabled)
    || sources.find(source => source.enabled)
    || null
}

export async function setActiveLibrarySource(sourceId: string): Promise<void> {
  const source = await readerDb.sources.get(sourceId)
  if (!source) throw new Error('图书馆来源不存在')
  if (!source.enabled) throw new Error('已停用的图书馆来源不能设为当前来源')
  await setReaderSetting('activeLibrarySourceId', sourceId)
}

export async function saveLibrarySource(input: Pick<LibrarySource, 'id' | 'name' | 'baseUrl' | 'enabled'>): Promise<LibrarySource> {
  const baseUrl = normalizeLibraryBaseUrl(input.baseUrl)
  const existing = await readerDb.sources.get(input.id)
  if (existing && (existing.baseUrl !== baseUrl || existing.adapter !== CURRENT_LIBRARY_ADAPTER)) {
    await clearSourceRemoteCache(existing.id)
  }
  const now = Date.now()
  const source: LibrarySource = {
    id: input.id || crypto.randomUUID(),
    name: input.name.trim() || '未命名书库',
    baseUrl,
    enabled: input.enabled,
    adapter: CURRENT_LIBRARY_ADAPTER,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  await readerDb.sources.put(source)
  return source
}

export async function removeLibrarySource(sourceId: string): Promise<void> {
  await clearSourceRemoteCache(sourceId)
  await readerDb.sources.delete(sourceId)
  const activeId = await getReaderSetting('activeLibrarySourceId', '')
  if (activeId === sourceId) {
    const replacement = (await readerDb.sources.toArray()).find(source => source.enabled)
    await setReaderSetting('activeLibrarySourceId', replacement?.id || '')
  }
}

export async function validateLibrarySource(source: Pick<LibrarySource, 'id' | 'baseUrl'>): Promise<LibraryValidationResult> {
  const baseUrl = normalizeLibraryBaseUrl(source.baseUrl)
  const catalogText = await fetchText(`${baseUrl}/subject_top.json`, '书目')
  let raw: unknown
  try {
    raw = JSON.parse(catalogText)
  } catch {
    throw new Error('subject_top.json 不是有效 JSON')
  }
  const normalized = normalizeLibraryCatalog(source.id || 'validation', raw)
  const sample = normalized.books[0]
  if (!sample) throw new Error('书目中没有图书')
  const root = epubRoot({ baseUrl }, sample)
  await Promise.all([
    fetchText(resolveInsideRoot(root, 'content.opf'), '样例 OPF'),
    fetchText(resolveInsideRoot(root, 'toc.xhtml'), '样例目录'),
  ])
  return {
    schemaVersion: normalized.schemaVersion,
    books: normalized.books.length,
    subjects: normalized.subjects,
    sampleTitle: sample.title,
  }
}

export async function refreshLibraryCatalog(sourceId: string): Promise<LibraryBook[]> {
  const source = await readerDb.sources.get(sourceId)
  if (!source) throw new Error('图书馆来源不存在')
  const text = await fetchText(`${source.baseUrl}/subject_top.json`, '书目')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('subject_top.json 不是有效 JSON')
  }
  const normalized = normalizeLibraryCatalog(source.id, raw)
  const hash = await sha256Text(text)
  if (source.catalogHash === hash) {
    const cached = await readerDb.books.where('sourceId').equals(source.id).toArray()
    if (cached.length) {
      await readerDb.sources.update(source.id, { catalogUpdatedAt: Date.now(), updatedAt: Date.now() })
      return cached
    }
  }
  await readerDb.transaction('rw', readerDb.books, readerDb.sources, async () => {
    await readerDb.books.where('sourceId').equals(source.id).delete()
    await readerDb.books.bulkPut(normalized.books)
    await readerDb.sources.update(source.id, { catalogHash: hash, catalogUpdatedAt: Date.now(), updatedAt: Date.now() })
  })
  return normalized.books
}

export async function loadLibraryCatalog(sourceId: string, forceRefresh = false): Promise<LibraryBook[]> {
  if (!forceRefresh) {
    const cached = await readerDb.books.where('sourceId').equals(sourceId).toArray()
    if (cached.length) return cached
  }
  return refreshLibraryCatalog(sourceId)
}

function epubRoot(source: Pick<LibrarySource, 'baseUrl'>, book: LibraryBook): string {
  assertSafeSegment(book.repoName || '', 'repo_name')
  if (!book.assetPath) throw new Error(`《${book.title}》缺少 asset_path，请刷新书目`)
  const assetPath = normalizeAssetPath(book.repoName!, book.assetPath)
  return `${source.baseUrl}/${assetPath.split('/').map(encodeURIComponent).join('/')}/`
}

function resolveInsideRoot(root: string, relative: string): string {
  const clean = relative.split('#')[0].replace(/^epub\//, '')
  const resolved = new URL(clean, root)
  if (!resolved.href.startsWith(root)) throw new Error(`资源路径越界：${relative}`)
  return resolved.href
}

async function fetchBookText(book: LibraryBook, relative: string, label: string): Promise<{ text: string; root: string }> {
  const source = await readerDb.sources.get(book.sourceId)
  if (!source) throw new Error('图书馆来源不存在')
  const root = epubRoot(source, book)
  const text = await fetchText(resolveInsideRoot(root, relative), label)
  return { text, root }
}

function parseToc(text: string): { toc: TocItem[]; sourceCount: number } {
  const doc = new DOMParser().parseFromString(text, 'application/xhtml+xml')
  if (doc.querySelector('parsererror')) throw new Error('TOC XHTML 解析失败')
  const seen = new Set<string>()
  const toc: TocItem[] = []
  let sourceCount = 0
  doc.querySelectorAll('nav a, ol a').forEach(anchor => {
    const href = anchor.getAttribute('href')?.trim() || ''
    const title = anchor.textContent?.replace(/\s+/g, ' ').trim() || ''
    if (!href || !title || href.startsWith('#')) return
    sourceCount++
    if (seen.has(href)) return
    seen.add(href)
    let level = 0
    let parent = anchor.parentElement
    while (parent) {
      if (parent.localName === 'ol') level++
      parent = parent.parentElement
    }
    toc.push({ title, href, level: Math.max(0, level - 1) })
  })
  return { toc, sourceCount }
}

function parseOpf(text: string, book: LibraryBook, toc: TocItem[]): BookPackage {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('OPF XML 解析失败')
  const descriptionNode = byLocalName(doc, 'description')[0]
  const subjects = Array.from(new Set([...book.subjects, ...byLocalName(doc, 'subject').map(node => node.textContent?.trim() || '').filter(Boolean)]))
  return {
    bookKey: book.key,
    title: firstText(doc, 'title') || book.title,
    author: firstText(doc, 'creator') || book.author,
    description: extractSafeDescription(descriptionNode?.textContent || ''),
    language: firstText(doc, 'language') || 'en',
    publishedAt: firstText(doc, 'date').split('T')[0] || '',
    subjects,
    toc,
    coverPath: book.coverPath || 'images/cover.svg',
    cachedAt: Date.now(),
  }
}

export async function loadBookPackage(bookKey: string, forceRefresh = false): Promise<BookPackage> {
  if (!forceRefresh) {
    const cached = await readerDb.packages.get(bookKey)
    if (cached && (cached.tocSourceCount != null || bookKey.startsWith('local:'))) return cached
  }
  const book = await readerDb.books.get(bookKey)
  if (!book) throw new Error('图书不存在')
  if (book.origin === 'local') {
    const localPackage = await readerDb.packages.get(bookKey)
    if (!localPackage) throw new Error('本地图书目录缺失')
    return localPackage
  }
  const [opfResult, tocResult] = await Promise.all([
    fetchBookText(book, 'content.opf', '图书元数据'),
    fetchBookText(book, 'toc.xhtml', '图书目录'),
  ])
  const { toc, sourceCount } = parseToc(tocResult.text)
  if (!toc.length) toc.push({ title: '开始阅读', href: 'text/chapter-1.xhtml', level: 0 })
  const bookPackage = parseOpf(opfResult.text, book, toc)
  bookPackage.tocSourceCount = sourceCount || toc.length
  await readerDb.packages.put(bookPackage)
  return bookPackage
}

function rewriteRemoteAssets(html: string, epubBase: string, chapterUrl: string): { html: string; urls: string[] } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const urls = new Set<string>()
  const rewrite = (element: Element, attribute: string) => {
    const value = element.getAttribute(attribute)
    if (!value || /^(data:|blob:|https?:)/i.test(value)) return
    const url = new URL(value, chapterUrl).href
    if (!url.startsWith(epubBase)) throw new Error(`章节资源路径越界：${value}`)
    urls.add(url)
    element.setAttribute('data-reader-asset', url)
    element.setAttribute('data-reader-asset-attr', attribute)
    element.removeAttribute(attribute)
  }
  doc.body.querySelectorAll('img').forEach(element => rewrite(element, 'src'))
  doc.body.querySelectorAll('image').forEach(element => rewrite(element, element.hasAttribute('href') ? 'href' : 'xlink:href'))
  return { html: doc.body.innerHTML, urls: Array.from(urls) }
}

async function fetchAssets(bookKey: string, urls: string[]): Promise<ReaderAsset[]> {
  return Promise.all(urls.map(async url => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`章节图片返回 HTTP ${response.status}：${url}`)
    const blob = await response.blob()
    return {
      bookKey,
      path: url,
      blob,
      mimeType: blob.type || response.headers.get('Content-Type') || 'application/octet-stream',
      bytes: blob.size,
      cachedAt: Date.now(),
    }
  }))
}

async function materializeChapter(chapter: CachedChapter, fromCache: boolean): Promise<ResolvedChapter> {
  const doc = new DOMParser().parseFromString(chapter.html, 'text/html')
  const elements = Array.from(doc.body.querySelectorAll('[data-reader-asset]'))
  const paths = Array.from(new Set(elements.map(element => element.getAttribute('data-reader-asset')!).filter(Boolean)))
  const assets = await readerDb.assets.bulkGet(paths.map(path => [chapter.bookKey, path] as [string, string]))
  const assetMap = new Map(assets.filter(Boolean).map(asset => [asset!.path, asset!]))
  const objectUrls: string[] = []
  elements.forEach(element => {
    const path = element.getAttribute('data-reader-asset') || ''
    const attribute = element.getAttribute('data-reader-asset-attr') || 'src'
    const asset = assetMap.get(path)
    if (!asset) return
    const objectUrl = URL.createObjectURL(asset.blob)
    objectUrls.push(objectUrl)
    element.setAttribute(attribute, objectUrl)
    element.removeAttribute('data-reader-asset')
    element.removeAttribute('data-reader-asset-attr')
  })
  return { ...chapter, html: doc.body.innerHTML, objectUrls, fromCache }
}

export async function loadBookChapter(bookKey: string, href: string, title = ''): Promise<ResolvedChapter> {
  const cached = await readerDb.chapters.get([bookKey, href])
  if (cached) return materializeChapter(cached, true)
  const book = await readerDb.books.get(bookKey)
  if (!book) throw new Error('图书不存在')
  if (book.origin === 'local') throw new Error('本地图书章节缺失')

  const result = await fetchBookText(book, href, '章节')
  const parsed = new DOMParser().parseFromString(result.text, 'application/xhtml+xml')
  if (parsed.querySelector('parsererror')) throw new Error('章节 XHTML 解析失败')
  const body = parsed.querySelector('body') || parsed.documentElement
  const safeHtml = sanitizeReaderHtml(body.innerHTML)
  const rewritten = rewriteRemoteAssets(safeHtml, result.root, resolveInsideRoot(result.root, href))
  const assets = await fetchAssets(bookKey, rewritten.urls)
  const chapter: CachedChapter = {
    bookKey,
    href,
    title: title || href,
    html: rewritten.html,
    plainText: htmlToPlainText(rewritten.html),
    bytes: new TextEncoder().encode(rewritten.html).byteLength,
    cachedAt: Date.now(),
  }
  await readerDb.transaction('rw', readerDb.chapters, readerDb.assets, async () => {
    if (assets.length) await readerDb.assets.bulkPut(assets)
    await readerDb.chapters.put(chapter)
  })
  return materializeChapter(chapter, false)
}

export function remoteCoverUrl(source: Pick<LibrarySource, 'baseUrl'>, book: LibraryBook): string {
  return resolveInsideRoot(epubRoot(source, book), book.coverPath || 'images/cover.svg')
}

export async function resolveRemoteCover(book: LibraryBook): Promise<{ url: string; revoke: () => void } | null> {
  if (book.origin !== 'remote') return null
  const source = await readerDb.sources.get(book.sourceId)
  if (!source) return null
  const coverUrl = remoteCoverUrl(source, book)
  let asset = await readerDb.assets.get([book.key, coverUrl])
  if (!asset) {
    try {
      const [downloaded] = await fetchAssets(book.key, [coverUrl])
      await readerDb.assets.put(downloaded)
      asset = downloaded
    } catch {
      return null
    }
  }
  const url = URL.createObjectURL(asset.blob)
  return { url, revoke: () => URL.revokeObjectURL(url) }
}

export async function resolveLocalCover(book: LibraryBook): Promise<{ url: string; revoke: () => void } | null> {
  if (book.origin !== 'local' || !book.coverPath) return null
  const asset = await readerDb.assets.get([book.key, book.coverPath])
  if (!asset) return null
  const url = URL.createObjectURL(asset.blob)
  return { url, revoke: () => URL.revokeObjectURL(url) }
}

export async function getProgressForBook(book: LibraryBook): Promise<ReadingProgress> {
  const exact = await readerDb.progress.get(book.key)
  if (exact) return exact
  const canonical = await readerDb.progress.where('canonicalId').equals(book.canonicalId).reverse().sortBy('lastReadAt')
  const previous = canonical[0]
  return {
    bookKey: book.key,
    canonicalId: book.canonicalId,
    chapterHref: previous?.chapterHref || '',
    scrollPercent: previous?.scrollPercent || 0,
    overallPercent: previous?.overallPercent || 0,
    timeSpentSeconds: previous?.timeSpentSeconds || 0,
    favorite: previous?.favorite || false,
    lastReadAt: previous?.lastReadAt || 0,
  }
}

export async function saveReadingProgress(progress: ReadingProgress): Promise<void> {
  await readerDb.progress.put(progress)
}

export async function listReadingProgress(): Promise<ReadingProgress[]> {
  return readerDb.progress.toArray()
}

export async function clearRemoteBookCache(bookKey?: string): Promise<void> {
  if (bookKey) {
    const book = await readerDb.books.get(bookKey)
    if (book?.origin !== 'remote') return
    await readerDb.transaction('rw', readerDb.packages, readerDb.chapters, readerDb.assets, async () => {
      await readerDb.packages.delete(bookKey)
      await readerDb.chapters.where('bookKey').equals(bookKey).delete()
      await readerDb.assets.where('bookKey').equals(bookKey).delete()
    })
    return
  }
  const remoteKeys = new Set((await readerDb.books.where('origin').equals('remote').primaryKeys()).map(String))
  await readerDb.transaction('rw', readerDb.packages, readerDb.chapters, readerDb.assets, async () => {
    await readerDb.packages.bulkDelete(Array.from(remoteKeys))
    for (const key of remoteKeys) {
      await readerDb.chapters.where('bookKey').equals(key).delete()
      await readerDb.assets.where('bookKey').equals(key).delete()
    }
  })
}

async function clearSourceRemoteCache(sourceId: string): Promise<void> {
  const books = await readerDb.books.where('sourceId').equals(sourceId).toArray()
  const keys = books.filter(book => book.origin === 'remote').map(book => book.key)
  await readerDb.transaction('rw', readerDb.books, readerDb.packages, readerDb.chapters, readerDb.assets, async () => {
    for (const key of keys) {
      await readerDb.packages.delete(key)
      await readerDb.chapters.where('bookKey').equals(key).delete()
      await readerDb.assets.where('bookKey').equals(key).delete()
    }
    await readerDb.books.where('sourceId').equals(sourceId).delete()
  })
}
