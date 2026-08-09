import { afterEach, describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { normalizeSubjectCatalog } from '../src/lib/library-service'
import { sanitizeReaderHtml } from '../src/lib/reader-sanitize'
import { importLocalBook } from '../src/lib/epub-import'
import { readerDb } from '../src/lib/reader-db'

afterEach(async () => {
  await Promise.all(readerDb.tables.map(table => table.clear()))
})

describe('Standard Ebooks catalog normalization', () => {
  it('merges duplicate books and preserves every subject', () => {
    const row = { rank: 3, title: 'Treasure Island', author: 'Robert Louis Stevenson', repo_name: 'robert-louis-stevenson_treasure-island' }
    const result = normalizeSubjectCatalog('test-source', {
      adventure: [row],
      fiction: [{ ...row, rank: 9 }],
    })
    expect(result.rawRows).toBe(2)
    expect(result.subjects).toBe(2)
    expect(result.books).toHaveLength(1)
    expect(result.books[0].subjects).toEqual(['adventure', 'fiction'])
    expect(result.books[0].assetSubject).toBe('adventure')
    expect(result.books[0].canonicalId).toBe('standardebooks:robert-louis-stevenson_treasure-island')
  })

  it('rejects unsafe repository path segments', () => {
    expect(() => normalizeSubjectCatalog('test-source', {
      fiction: [{ title: 'Bad', author: 'Unknown', repo_name: '../outside' }],
    })).toThrow(/不安全/)
  })

  it('keeps catalog rows whose author is intentionally anonymous', () => {
    const result = normalizeSubjectCatalog('test-source', {
      fiction: [{ title: 'Anonymous Work', author: '', repo_name: 'anonymous_work' }],
    })
    expect(result.books[0].author).toBe('Anonymous')
  })
})

describe('reader HTML sanitization', () => {
  it('removes executable markup and dangerous URLs', () => {
    const clean = sanitizeReaderHtml('<p onclick="alert(1)">Safe <a href="javascript:alert(1)">link</a></p><script>alert(1)</script><iframe src="https://bad.example"></iframe>')
    expect(clean).toContain('Safe')
    expect(clean).not.toMatch(/onclick|javascript:|script|iframe/i)
  })

  it('keeps app-created blob URLs and safe internal chapter links', () => {
    const clean = sanitizeReaderHtml('<img src="blob:http://localhost/asset"><a href="chapter-2.xhtml#note-1">Next</a>')
    expect(clean).toContain('blob:http://localhost/asset')
    expect(clean).toContain('chapter-2.xhtml#note-1')
  })
})

describe('reader IndexedDB schema', () => {
  it('stores boolean source state without indexing the boolean value', async () => {
    await readerDb.sources.put({ id: 'source', name: 'Source', baseUrl: 'https://books.example', adapter: 'standard-ebooks-unpacked-v1', enabled: true, createdAt: 1, updatedAt: 1 })
    expect((await readerDb.sources.orderBy('createdAt').first())?.enabled).toBe(true)
  })
})

describe('local book import', () => {
  it('imports and sanitizes a single HTML document', async () => {
    const file = new File(['<!doctype html><html lang="en"><head><title>Test Book</title><meta name="author" content="Test Author"></head><body><h1>Hello</h1><script>bad()</script></body></html>'], 'test.html', { type: 'text/html' })
    const book = await importLocalBook(file)
    const bookPackage = await readerDb.packages.get(book.key)
    const chapter = await readerDb.chapters.get([book.key, 'document.html'])
    expect(book.title).toBe('Test Book')
    expect(book.author).toBe('Test Author')
    expect(bookPackage?.toc).toHaveLength(1)
    expect(chapter?.html).toContain('Hello')
    expect(chapter?.html).not.toContain('script')
  })

  it('reuses the SHA-256 identity when the same HTML is imported twice', async () => {
    const file = new File(['<html><head><title>Same Book</title></head><body>Same text</body></html>'], 'same.html', { type: 'text/html' })
    const first = await importLocalBook(file)
    const second = await importLocalBook(file)
    expect(second.key).toBe(first.key)
    expect(await readerDb.books.where('origin').equals('local').count()).toBe(1)
  })

  it('imports an EPUB 3 nav, spine, chapter and cover atomically', async () => {
    const archive = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
      'OEBPS/content.opf': strToU8('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Fixture EPUB</dc:title><dc:creator>Fixture Author</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="images/cover.svg" media-type="image/svg+xml" properties="cover-image"/></manifest><spine><itemref idref="chapter"/></spine></package>'),
      'OEBPS/nav.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol><li><a href="text/chapter.xhtml">Chapter One</a></li></ol></nav></body></html>'),
      'OEBPS/text/chapter.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter One</h1><p>Hello reader.</p><img src="../images/cover.svg"/></body></html>'),
      'OEBPS/images/cover.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'),
    })
    const file = new File([archive.buffer as ArrayBuffer], 'fixture.epub', { type: 'application/epub+zip' })
    const book = await importLocalBook(file)
    const bookPackage = await readerDb.packages.get(book.key)
    const chapter = await readerDb.chapters.get([book.key, 'OEBPS/text/chapter.xhtml'])
    const cover = await readerDb.assets.get([book.key, 'OEBPS/images/cover.svg'])
    expect(book.title).toBe('Fixture EPUB')
    expect(bookPackage?.toc[0]).toMatchObject({ title: 'Chapter One', href: 'OEBPS/text/chapter.xhtml' })
    expect(chapter?.html).toContain('data-reader-asset="OEBPS/images/cover.svg"')
    expect(cover?.mimeType).toBe('image/svg+xml')
  })

  it('imports an EPUB 2 NCX table of contents', async () => {
    const archive = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>'),
      'OPS/content.opf': strToU8('<package version="2.0"><metadata><title>EPUB Two</title><creator>Author Two</creator></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="one"/></spine></package>'),
      'OPS/toc.ncx': strToU8('<ncx><navMap><navPoint><navLabel><text>First Chapter</text></navLabel><content src="text/one.xhtml"/></navPoint></navMap></ncx>'),
      'OPS/text/one.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>EPUB two works.</p></body></html>'),
    })
    const book = await importLocalBook(new File([archive.buffer as ArrayBuffer], 'two.epub', { type: 'application/epub+zip' }))
    expect((await readerDb.packages.get(book.key))?.toc[0]).toMatchObject({ title: 'First Chapter', href: 'OPS/text/one.xhtml' })
  })

  it('leaves no records after a damaged EPUB fails', async () => {
    await expect(importLocalBook(new File(['not a zip'], 'broken.epub', { type: 'application/epub+zip' }))).rejects.toBeTruthy()
    expect(await readerDb.books.count()).toBe(0)
    expect(await readerDb.chapters.count()).toBe(0)
  })

  it('rejects encrypted EPUB files before persisting anything', async () => {
    const archive = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/encryption.xml': strToU8('<encryption/>'),
    })
    await expect(importLocalBook(new File([archive.buffer as ArrayBuffer], 'encrypted.epub', { type: 'application/epub+zip' }))).rejects.toThrow(/加密/)
    expect(await readerDb.books.count()).toBe(0)
  })
})
