export interface WordNetSenseRelation {
  type: string
  targetSenseId: string
  targetShard: string
  targetLemma: string
  targetPos: string
  inferred: boolean
}

export interface WordNetSense {
  id: string
  lemma: string
  pos: string
  order: number
  synsetId: string
  synsetShard: string
  synsetLabel: string
  synsetGloss: string
  adjectivePosition: string
  subcategories: string[]
  sentences: string[]
  relations: WordNetSenseRelation[]
}

export interface WordNetEntryBundle {
  lemma: string
  pos: string
  pronunciations: unknown[]
  forms: unknown[]
  senses: WordNetSense[]
}

export interface WordNetSynsetRelation {
  type: string
  targetSynsetId: string
  targetShard: string
  targetPos: string
  targetLabel: string
  targetGloss: string
  inferred: boolean
}

export interface WordNetSynsetGraph {
  id: string
  shard: string
  pos: string
  semanticCategory: string
  definitions: string[]
  examples: string[]
  members: string[]
  ili: string
  wikidata: string
  sources: unknown[]
  relations: WordNetSynsetRelation[]
}

export interface WordNetFrame {
  id: string
  template: string
}

export interface WordNetLemmaIndexEntry {
  key: string
  lemma: string
  entryShard: string
}

export interface CachedWordNetLemma {
  key: string
  shard: string
  entries: WordNetEntryBundle[]
}

export interface CachedWordNetSynset extends WordNetSynsetGraph {}
