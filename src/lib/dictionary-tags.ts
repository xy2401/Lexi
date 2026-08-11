export const TAG_OPTIONS = [
  { id: 'zk', label: '中考 zk' },
  { id: 'gk', label: '高考 gk' },
  { id: 'cet4', label: '四级 CET-4' },
  { id: 'cet6', label: '六级 CET-6' },
  { id: 'ky', label: '考研 ky' },
  { id: 'ielts', label: '雅思 IELTS' },
  { id: 'toefl', label: '托福 TOEFL' },
  { id: 'gre', label: 'GRE' },
] as const

export type DictionaryTagId = typeof TAG_OPTIONS[number]['id']
export type TagFilterMode = 'neutral' | 'include' | 'exclude' | 'annotate'
export type TagStates = Record<DictionaryTagId, TagFilterMode>

const TAG_FILTER_MODES: readonly TagFilterMode[] = ['neutral', 'include', 'exclude', 'annotate']

const TAG_IDS = new Set<string>(TAG_OPTIONS.map(tag => tag.id))

export function isDictionaryTagId(value: unknown): value is DictionaryTagId {
  return typeof value === 'string' && TAG_IDS.has(value)
}

export function createNeutralTagStates(): TagStates {
  return Object.fromEntries(
    TAG_OPTIONS.map(tag => [tag.id, 'neutral']),
  ) as TagStates
}

export function normalizeTagStates(saved?: Partial<TagStates> | null): TagStates {
  const normalized = createNeutralTagStates()
  if (!saved) return normalized
  for (const tag of TAG_OPTIONS) {
    const mode = saved[tag.id]
    if (mode && TAG_FILTER_MODES.includes(mode)) normalized[tag.id] = mode
  }
  return normalized
}

export function nextTagFilterMode(current: TagFilterMode): TagFilterMode {
  if (current === 'neutral') return 'include'
  if (current === 'include') return 'exclude'
  if (current === 'exclude') return 'annotate'
  return 'neutral'
}

export function parseDictionaryTagIds(rawTags: string): Set<DictionaryTagId> {
  return new Set(
    (rawTags || '')
      .toLowerCase()
      .split(/[\s,]+/)
      .map(tag => tag.trim())
      .filter(isDictionaryTagId),
  )
}

export function lowestDictionaryTag(rawTags: string): DictionaryTagId | null {
  const wordTags = parseDictionaryTagIds(rawTags)
  return TAG_OPTIONS.find(tag => wordTags.has(tag.id))?.id || null
}
