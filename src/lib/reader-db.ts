import Dexie, { type Table } from 'dexie'
import type {
  BookPackage,
  CachedChapter,
  LibraryBook,
  LibrarySource,
  ReaderAsset,
  ReaderSetting,
  ReaderStorageStats,
  ReadingProgress,
} from './reader-types'

class ReaderDB extends Dexie {
  sources!: Table<LibrarySource, string>
  books!: Table<LibraryBook, string>
  packages!: Table<BookPackage, string>
  chapters!: Table<CachedChapter, [string, string]>
  assets!: Table<ReaderAsset, [string, string]>
  progress!: Table<ReadingProgress, string>
  settings!: Table<ReaderSetting, string>

  constructor() {
    super('lexi-reader')
    this.version(1).stores({
      sources: 'id, enabled, updatedAt',
      books: 'key, sourceId, canonicalId, origin, title, author',
      packages: 'bookKey, cachedAt',
      chapters: '[bookKey+href], bookKey, cachedAt',
      assets: '[bookKey+path], bookKey, cachedAt',
      progress: 'bookKey, canonicalId, favorite, lastReadAt',
      settings: 'key',
    })
    // IndexedDB keys cannot be booleans. v1 declared boolean indexes for
    // `enabled` and `favorite`, which made otherwise valid records fail to
    // persist in real browsers. Neither field is queried as an index.
    this.version(2).stores({
      sources: 'id, updatedAt',
      books: 'key, sourceId, canonicalId, origin, title, author',
      packages: 'bookKey, cachedAt',
      chapters: '[bookKey+href], bookKey, cachedAt',
      assets: '[bookKey+path], bookKey, cachedAt',
      progress: 'bookKey, canonicalId, lastReadAt',
      settings: 'key',
    })
    this.version(3).stores({
      sources: 'id, createdAt, updatedAt',
      books: 'key, sourceId, canonicalId, origin, title, author',
      packages: 'bookKey, cachedAt',
      chapters: '[bookKey+href], bookKey, cachedAt',
      assets: '[bookKey+path], bookKey, cachedAt',
      progress: 'bookKey, canonicalId, lastReadAt',
      settings: 'key',
    })
  }
}

export const readerDb = new ReaderDB()

export async function getReaderSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await readerDb.settings.get(key)
  return record ? record.value as T : fallback
}

export async function setReaderSetting<T>(key: string, value: T): Promise<void> {
  await readerDb.settings.put({ key, value })
}

export async function getReaderStorageStats(): Promise<ReaderStorageStats> {
  const [sources, remoteBooks, localBooks, cachedChapters, assets] = await Promise.all([
    readerDb.sources.count(),
    readerDb.books.where('origin').equals('remote').count(),
    readerDb.books.where('origin').equals('local').count(),
    readerDb.chapters.count(),
    readerDb.assets.toArray(),
  ])
  return {
    sources,
    remoteBooks,
    localBooks,
    cachedChapters,
    cachedAssets: assets.length,
    cachedBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  }
}
