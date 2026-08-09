import { queryWordNetShard } from './wordnet-http-vfs'

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

interface EntryRow {
  lemma: string
  pos: string
  pronunciations_json: string
  forms_json: string
}

interface SenseRow {
  sense_id: string
  lemma: string
  pos: string
  sense_order: number
  synset_id: string
  synset_shard: string
  synset_label: string
  synset_gloss: string
  adj_position: string
  subcat_json: string
  sent_json: string
}

interface SenseRelationRow {
  source_sense_id: string
  relation_type: string
  target_sense_id: string
  target_shard: string
  target_lemma: string
  target_pos: string
  inferred: number
}

interface SynsetRow {
  synset_id: string
  pos: string
  semantic_category: string
  definitions_json: string
  examples_json: string
  members_json: string
  ili: string
  wikidata: string
  source_json: string
}

interface SynsetRelationRow {
  relation_type: string
  target_synset_id: string
  target_shard: string
  target_pos: string
  target_label: string
  target_gloss: string
  inferred: number
}

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : parsed == null ? [] : [parsed as T]
  } catch {
    return []
  }
}

export function getWordNetEntryShard(lemma: string): string {
  const first = lemma.trim().toLowerCase()[0] || ''
  return /^[a-z]$/.test(first) ? `entries-${first}.db` : 'entries-0.db'
}

export async function lookupWordNetLemma(rawLemma: string): Promise<WordNetEntryBundle[]> {
  const lemma = rawLemma.trim()
  if (!lemma) return []
  const shard = getWordNetEntryShard(lemma)
  const entries = await queryWordNetShard<EntryRow>(shard, `
    SELECT lemma, pos, pronunciations_json, forms_json
    FROM {db}.wordnet_entries
    WHERE lemma = ? COLLATE NOCASE
    ORDER BY pos
  `, [lemma])
  if (!entries.length) return []

  const senses = await queryWordNetShard<SenseRow>(shard, `
    SELECT sense_id, lemma, pos, sense_order, synset_id, synset_shard,
           synset_label, synset_gloss, adj_position, subcat_json, sent_json
    FROM {db}.wordnet_senses
    WHERE lemma = ? COLLATE NOCASE
    ORDER BY pos, sense_order
  `, [lemma])

  const ids = senses.map(sense => sense.sense_id)
  const relationRows = ids.length
    ? await queryWordNetShard<SenseRelationRow>(shard, `
        SELECT source_sense_id, relation_type, target_sense_id, target_shard,
               target_lemma, target_pos, inferred
        FROM {db}.wordnet_sense_relations
        WHERE source_sense_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY source_sense_id, relation_type, target_lemma
      `, ids)
    : []
  const relationsBySense = new Map<string, WordNetSenseRelation[]>()
  for (const row of relationRows) {
    const relations = relationsBySense.get(row.source_sense_id) || []
    relations.push({
      type: row.relation_type,
      targetSenseId: row.target_sense_id,
      targetShard: row.target_shard,
      targetLemma: row.target_lemma,
      targetPos: row.target_pos,
      inferred: Boolean(row.inferred),
    })
    relationsBySense.set(row.source_sense_id, relations)
  }

  return entries.map(entry => ({
    lemma: entry.lemma,
    pos: entry.pos,
    pronunciations: parseArray(entry.pronunciations_json),
    forms: parseArray(entry.forms_json),
    senses: senses
      .filter(sense => sense.lemma === entry.lemma && sense.pos === entry.pos)
      .map(sense => ({
        id: sense.sense_id,
        lemma: sense.lemma,
        pos: sense.pos,
        order: sense.sense_order,
        synsetId: sense.synset_id,
        synsetShard: sense.synset_shard,
        synsetLabel: sense.synset_label,
        synsetGloss: sense.synset_gloss,
        adjectivePosition: sense.adj_position,
        subcategories: parseArray<string>(sense.subcat_json),
        sentences: parseArray<string>(sense.sent_json),
        relations: relationsBySense.get(sense.sense_id) || [],
      })),
  }))
}

export async function loadWordNetSynset(
  shard: string,
  synsetId: string,
): Promise<WordNetSynsetGraph | null> {
  const rows = await queryWordNetShard<SynsetRow>(shard, `
    SELECT synset_id, pos, semantic_category, definitions_json, examples_json,
           members_json, ili, wikidata, source_json
    FROM {db}.wordnet_synsets
    WHERE synset_id = ?
  `, [synsetId])
  if (!rows.length) return null
  const relations = await queryWordNetShard<SynsetRelationRow>(shard, `
    SELECT relation_type, target_synset_id, target_shard, target_pos,
           target_label, target_gloss, inferred
    FROM {db}.wordnet_synset_relations
    WHERE source_synset_id = ?
    ORDER BY relation_type, target_label
  `, [synsetId])
  const row = rows[0]
  return {
    id: row.synset_id,
    shard,
    pos: row.pos,
    semanticCategory: row.semantic_category,
    definitions: parseArray<string>(row.definitions_json),
    examples: parseArray<string>(row.examples_json),
    members: parseArray<string>(row.members_json),
    ili: row.ili,
    wikidata: row.wikidata,
    sources: parseArray(row.source_json),
    relations: relations.map(relation => ({
      type: relation.relation_type,
      targetSynsetId: relation.target_synset_id,
      targetShard: relation.target_shard,
      targetPos: relation.target_pos,
      targetLabel: relation.target_label,
      targetGloss: relation.target_gloss,
      inferred: Boolean(relation.inferred),
    })),
  }
}

const frameCache = new Map<string, WordNetFrame>()

export async function loadWordNetFrames(frameIds: string[]): Promise<WordNetFrame[]> {
  const ids = [...new Set(frameIds.filter(Boolean))]
  const missing = ids.filter(id => !frameCache.has(id))
  if (missing.length) {
    const rows = await queryWordNetShard<{ frame_id: string; template: string }>('frames.db', `
      SELECT frame_id, template FROM {db}.wordnet_frames
      WHERE frame_id IN (${missing.map(() => '?').join(', ')})
    `, missing)
    for (const row of rows) frameCache.set(row.frame_id, { id: row.frame_id, template: row.template })
  }
  return ids.flatMap(id => frameCache.has(id) ? [frameCache.get(id)!] : [])
}
