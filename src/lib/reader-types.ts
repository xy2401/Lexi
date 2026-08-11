import {
  createNeutralTagStates,
  isDictionaryTagId,
  normalizeTagStates,
  type DictionaryTagId,
  type TagStates,
} from './dictionary-tags'

export type LibraryAdapter = 'standard-ebooks-unpacked-v1' | 'standard-ebooks-library-v2'
export type BookOrigin = 'remote' | 'local'

export interface LibrarySource {
  id: string
  name: string
  baseUrl: string
  adapter: LibraryAdapter
  enabled: boolean
  createdAt: number
  updatedAt: number
  catalogHash?: string
  catalogUpdatedAt?: number
}

export interface LibraryBook {
  key: string
  canonicalId: string
  sourceId: string
  origin: BookOrigin
  repoName?: string
  title: string
  author: string
  subjects: string[]
  assetPath?: string
  rank?: number
  webUrl?: string
  sourceHref?: string
  coverPath?: string
  importedAt?: number
}

export interface TocItem {
  title: string
  href: string
  level: number
}

export interface BookPackage {
  bookKey: string
  title: string
  author: string
  description: string
  language: string
  publishedAt: string
  subjects: string[]
  toc: TocItem[]
  tocSourceCount?: number
  coverPath?: string
  cachedAt: number
}

export interface CachedChapter {
  bookKey: string
  href: string
  title: string
  html: string
  plainText: string
  bytes: number
  cachedAt: number
}

export interface ReaderAsset {
  bookKey: string
  path: string
  blob: Blob
  mimeType: string
  bytes: number
  cachedAt: number
}

export interface ReadingProgress {
  bookKey: string
  canonicalId: string
  chapterHref: string
  scrollPercent: number
  overallPercent: number
  timeSpentSeconds: number
  favorite: boolean
  lastReadAt: number
}

export interface ReaderSetting<T = unknown> {
  key: string
  value: T
}

export interface ReaderPreferences {
  theme: 'paper' | 'light' | 'dark'
  font: 'serif' | 'sans'
  fontSize: number
  lineHeight: number
  contentWidth: number
  annotationTagStates: TagStates
  annotateBasicFunctionWords: boolean
}

export interface ResolvedChapter extends CachedChapter {
  objectUrls: string[]
  fromCache: boolean
}

export interface LibraryValidationResult {
  schemaVersion: number
  books: number
  subjects: number
  sampleTitle: string
}

export interface ReaderStorageStats {
  sources: number
  remoteBooks: number
  localBooks: number
  cachedChapters: number
  cachedAssets: number
  cachedBytes: number
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  theme: 'paper',
  font: 'serif',
  fontSize: 18,
  lineHeight: 1.8,
  contentWidth: 720,
  annotationTagStates: createNeutralTagStates(),
  annotateBasicFunctionWords: false,
}

export function mergeReaderPreferences(
  saved?: (Partial<ReaderPreferences> & {
    annotationsEnabled?: boolean
    annotationMode?: 'none' | 'tag' | 'meaning'
    annotationTags?: DictionaryTagId[]
  }) | null,
): ReaderPreferences {
  const raw = saved || {}
  let annotationTagStates = normalizeTagStates(raw.annotationTagStates)
  const legacyTags = Array.isArray(raw.annotationTags)
    ? [...new Set(raw.annotationTags.filter(isDictionaryTagId))]
    : []
  if (!raw.annotationTagStates && legacyTags.length && (raw.annotationMode === 'tag' || raw.annotationMode === 'meaning')) {
    annotationTagStates = createNeutralTagStates()
    const migratedState = raw.annotationMode === 'tag' ? 'annotate' : 'include'
    for (const tag of legacyTags) annotationTagStates[tag] = migratedState
  }

  return {
    theme: ['paper', 'light', 'dark'].includes(raw.theme || '') ? raw.theme as ReaderPreferences['theme'] : DEFAULT_READER_PREFERENCES.theme,
    font: ['serif', 'sans'].includes(raw.font || '') ? raw.font as ReaderPreferences['font'] : DEFAULT_READER_PREFERENCES.font,
    fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : DEFAULT_READER_PREFERENCES.fontSize,
    lineHeight: typeof raw.lineHeight === 'number' ? raw.lineHeight : DEFAULT_READER_PREFERENCES.lineHeight,
    contentWidth: typeof raw.contentWidth === 'number' ? raw.contentWidth : DEFAULT_READER_PREFERENCES.contentWidth,
    annotationTagStates,
    annotateBasicFunctionWords: raw.annotateBasicFunctionWords === true,
  }
}
