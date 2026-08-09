import { strFromU8, unzip } from 'fflate'
import { readerDb } from './reader-db'
import { htmlToPlainText, sanitizeReaderHtml } from './reader-sanitize'
import type { BookPackage, CachedChapter, LibraryBook, ReaderAsset, TocItem } from './reader-types'

type ArchiveFiles = Record<string, Uint8Array>

function elementsByLocalName(root: ParentNode, name: string): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(element => element.localName === name)
}

function textByLocalName(root: ParentNode, name: string): string {
  return elementsByLocalName(root, name)[0]?.textContent?.trim() || ''
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index + 1)
}

function normalizeArchivePath(baseFile: string, relative: string): string {
  const clean = relative.split('#')[0].replace(/^\/+/, '')
  const url = new URL(clean, `https://book.invalid/${baseFile}`)
  const path = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (url.origin !== 'https://book.invalid' || path.startsWith('../')) throw new Error(`EPUB 资源路径越界：${relative}`)
  return path
}

function decode(files: ArchiveFiles, path: string, label: string): string {
  const bytes = files[path]
  if (!bytes) throw new Error(`${label}缺失：${path}`)
  return strFromU8(bytes)
}

function parseXml(text: string, type: DOMParserSupportedType, label: string): Document {
  const doc = new DOMParser().parseFromString(text, type)
  if (doc.querySelector('parsererror')) throw new Error(`${label}解析失败`)
  return doc
}

async function unzipFile(file: File): Promise<ArchiveFiles> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, output) => error ? reject(error) : resolve(output))
  })
}

async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  return ({
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  } as Record<string, string>)[ext || ''] || 'application/octet-stream'
}

function rewriteLocalAssets(html: string, chapterPath: string, knownAssets: Set<string>): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rewrite = (element: Element, attribute: string) => {
    const value = element.getAttribute(attribute)
    if (!value || /^(data:|blob:|https?:)/i.test(value)) return
    const path = normalizeArchivePath(chapterPath, value)
    if (!knownAssets.has(path)) {
      element.removeAttribute(attribute)
      return
    }
    element.setAttribute('data-reader-asset', path)
    element.setAttribute('data-reader-asset-attr', attribute)
    element.removeAttribute(attribute)
  }
  doc.body.querySelectorAll('img').forEach(element => rewrite(element, 'src'))
  doc.body.querySelectorAll('image').forEach(element => rewrite(element, element.hasAttribute('href') ? 'href' : 'xlink:href'))
  return doc.body.innerHTML
}

function parseNav(files: ArchiveFiles, navPath: string): TocItem[] {
  const doc = parseXml(decode(files, navPath, 'EPUB nav'), 'application/xhtml+xml', 'EPUB nav')
  const seen = new Set<string>()
  const toc: TocItem[] = []
  doc.querySelectorAll('nav a, ol a').forEach(anchor => {
    const rawHref = anchor.getAttribute('href') || ''
    const title = anchor.textContent?.replace(/\s+/g, ' ').trim() || ''
    if (!rawHref || !title) return
    const href = normalizeArchivePath(navPath, rawHref)
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
  return toc
}

function parseNcx(files: ArchiveFiles, ncxPath: string): TocItem[] {
  const doc = parseXml(decode(files, ncxPath, 'EPUB NCX'), 'application/xml', 'EPUB NCX')
  return elementsByLocalName(doc, 'navPoint').flatMap(point => {
    const source = elementsByLocalName(point, 'content')[0]?.getAttribute('src') || ''
    const title = elementsByLocalName(point, 'navLabel')[0]?.textContent?.replace(/\s+/g, ' ').trim() || ''
    if (!source || !title) return []
    let level = 0
    let parent = point.parentElement
    while (parent) {
      if (parent.localName === 'navPoint') level++
      parent = parent.parentElement
    }
    return [{ title, href: normalizeArchivePath(ncxPath, source), level }]
  })
}

async function assertStorageCapacity(file: File): Promise<void> {
  if (!navigator.storage?.estimate) return
  const estimate = await navigator.storage.estimate()
  const remaining = (estimate.quota || 0) - (estimate.usage || 0)
  if (remaining > 0 && remaining < file.size * 3) throw new Error('浏览器剩余存储空间不足，无法安全导入此书')
}

async function persistImportedBook(
  book: LibraryBook,
  bookPackage: BookPackage,
  chapters: CachedChapter[],
  assets: ReaderAsset[],
): Promise<LibraryBook> {
  await readerDb.transaction('rw', readerDb.books, readerDb.packages, readerDb.chapters, readerDb.assets, async () => {
    await readerDb.books.put(book)
    await readerDb.packages.put(bookPackage)
    if (chapters.length) await readerDb.chapters.bulkPut(chapters)
    if (assets.length) await readerDb.assets.bulkPut(assets)
  })
  return book
}

async function importHtml(file: File, hash: string): Promise<LibraryBook> {
  const text = await file.text()
  const parsed = new DOMParser().parseFromString(text, 'text/html')
  const title = parsed.title.trim() || file.name.replace(/\.[^.]+$/, '')
  const author = parsed.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() || '未知作者'
  const safeHtml = sanitizeReaderHtml(parsed.body.innerHTML)
  const bookKey = `local:${hash}`
  const href = 'document.html'
  const now = Date.now()
  const book: LibraryBook = {
    key: bookKey,
    canonicalId: bookKey,
    sourceId: 'local',
    origin: 'local',
    title,
    author,
    subjects: ['local'],
    importedAt: now,
  }
  const chapter: CachedChapter = {
    bookKey, href, title, html: safeHtml, plainText: htmlToPlainText(safeHtml),
    bytes: new TextEncoder().encode(safeHtml).byteLength, cachedAt: now,
  }
  const bookPackage: BookPackage = {
    bookKey, title, author, description: '', language: parsed.documentElement.lang || 'en',
    publishedAt: '', subjects: ['local'], toc: [{ title, href, level: 0 }], cachedAt: now,
  }
  return persistImportedBook(book, bookPackage, [chapter], [])
}

async function importEpub(file: File, hash: string): Promise<LibraryBook> {
  const files = await unzipFile(file)
  if (files['META-INF/encryption.xml']) throw new Error('暂不支持加密或混淆资源的 EPUB')
  const containerDoc = parseXml(decode(files, 'META-INF/container.xml', 'EPUB container'), 'application/xml', 'EPUB container')
  const opfPath = elementsByLocalName(containerDoc, 'rootfile')[0]?.getAttribute('full-path') || ''
  if (!opfPath) throw new Error('EPUB container 未声明 OPF 路径')
  const opfDoc = parseXml(decode(files, opfPath, 'EPUB OPF'), 'application/xml', 'EPUB OPF')
  const opfDir = dirname(opfPath)

  const manifest = new Map<string, { path: string; mediaType: string; properties: string }>()
  for (const item of elementsByLocalName(opfDoc, 'item')) {
    const id = item.getAttribute('id') || ''
    const href = item.getAttribute('href') || ''
    if (!id || !href) continue
    manifest.set(id, {
      path: normalizeArchivePath(opfPath, href),
      mediaType: item.getAttribute('media-type') || '',
      properties: item.getAttribute('properties') || '',
    })
  }

  const spine = elementsByLocalName(opfDoc, 'itemref')
    .map(item => manifest.get(item.getAttribute('idref') || ''))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (!spine.length) throw new Error('EPUB spine 为空')

  const navItem = Array.from(manifest.values()).find(item => item.properties.split(/\s+/).includes('nav'))
  const spineNode = elementsByLocalName(opfDoc, 'spine')[0]
  const ncxItem = manifest.get(spineNode?.getAttribute('toc') || '')
    || Array.from(manifest.values()).find(item => item.mediaType === 'application/x-dtbncx+xml')
  let toc = navItem ? parseNav(files, navItem.path) : ncxItem ? parseNcx(files, ncxItem.path) : []
  if (!toc.length) {
    toc = spine.map((item, index) => ({ title: `章节 ${index + 1}`, href: item.path, level: 0 }))
  }

  const imageItems = Array.from(manifest.values()).filter(item => item.mediaType.startsWith('image/') && files[item.path])
  const knownAssets = new Set(imageItems.map(item => item.path))
  const bookKey = `local:${hash}`
  const now = Date.now()
  const chapters: CachedChapter[] = []
  for (const item of spine) {
    if (!files[item.path] || !/xhtml|html/i.test(item.mediaType)) continue
    const chapterDoc = parseXml(decode(files, item.path, 'EPUB 章节'), 'application/xhtml+xml', 'EPUB 章节')
    const body = chapterDoc.querySelector('body') || chapterDoc.documentElement
    const safe = sanitizeReaderHtml(body.innerHTML)
    const html = rewriteLocalAssets(safe, item.path, knownAssets)
    const tocTitle = toc.find(entry => entry.href === item.path)?.title || `章节 ${chapters.length + 1}`
    chapters.push({
      bookKey, href: item.path, title: tocTitle, html, plainText: htmlToPlainText(html),
      bytes: new TextEncoder().encode(html).byteLength, cachedAt: now,
    })
  }
  if (!chapters.length) throw new Error('EPUB 中没有可读取的正文')
  const chapterPaths = new Set(chapters.map(chapter => chapter.href))
  toc = toc.filter(item => chapterPaths.has(item.href))
  if (!toc.length) toc = chapters.map(chapter => ({ title: chapter.title, href: chapter.href, level: 0 }))

  const coverId = elementsByLocalName(opfDoc, 'meta').find(meta => meta.getAttribute('name') === 'cover')?.getAttribute('content') || ''
  const coverItem = Array.from(manifest.values()).find(item => item.properties.split(/\s+/).includes('cover-image'))
    || manifest.get(coverId)
  const title = textByLocalName(opfDoc, 'title') || file.name.replace(/\.epub$/i, '')
  const author = textByLocalName(opfDoc, 'creator') || '未知作者'
  const description = textByLocalName(opfDoc, 'description')
  const subjects = elementsByLocalName(opfDoc, 'subject').map(node => node.textContent?.trim() || '').filter(Boolean)
  const assets: ReaderAsset[] = imageItems.map(item => {
    const bytes = new Uint8Array(files[item.path])
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: item.mediaType || mimeFromPath(item.path) })
    return { bookKey, path: item.path, blob, mimeType: blob.type, bytes: blob.size, cachedAt: now }
  })
  const book: LibraryBook = {
    key: bookKey, canonicalId: bookKey, sourceId: 'local', origin: 'local', title, author,
    subjects: subjects.length ? subjects : ['local'], coverPath: coverItem?.path, importedAt: now,
  }
  const bookPackage: BookPackage = {
    bookKey, title, author, description: htmlToPlainText(sanitizeReaderHtml(description)),
    language: textByLocalName(opfDoc, 'language') || 'en',
    publishedAt: textByLocalName(opfDoc, 'date').split('T')[0] || '',
    subjects: book.subjects, toc, coverPath: coverItem?.path, cachedAt: now,
  }
  void opfDir
  return persistImportedBook(book, bookPackage, chapters, assets)
}

export async function importLocalBook(file: File): Promise<LibraryBook> {
  await assertStorageCapacity(file)
  const hash = await hashFile(file)
  const existing = await readerDb.books.get(`local:${hash}`)
  if (existing) return existing
  if (/\.epub$/i.test(file.name) || file.type === 'application/epub+zip') return importEpub(file, hash)
  if (/\.html?$/i.test(file.name) || file.type === 'text/html') return importHtml(file, hash)
  throw new Error('只支持 .epub、.html 和 .htm 文件')
}

export async function removeLocalBook(bookKey: string): Promise<void> {
  const book = await readerDb.books.get(bookKey)
  if (!book || book.origin !== 'local') return
  await readerDb.transaction('rw', readerDb.books, readerDb.packages, readerDb.chapters, readerDb.assets, readerDb.progress, async () => {
    await readerDb.books.delete(bookKey)
    await readerDb.packages.delete(bookKey)
    await readerDb.chapters.where('bookKey').equals(bookKey).delete()
    await readerDb.assets.where('bookKey').equals(bookKey).delete()
    await readerDb.progress.delete(bookKey)
  })
}
