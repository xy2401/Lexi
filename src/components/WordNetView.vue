<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getDictionaryTagLabels, useDictStore } from '../stores/dict'
import {
  loadWordNetFrames,
  loadWordNetSynset,
  lookupWordNetLemma,
  type WordNetEntryBundle,
  type WordNetFrame,
  type WordNetSense,
  type WordNetSynsetGraph,
  type WordNetSynsetRelation,
} from '../lib/wordnet-service'

const props = withDefaults(defineProps<{
  initialWord?: string
  active?: boolean
}>(), {
  initialWord: 'bank',
  active: false,
})

const dictStore = useDictStore()
const query = ref('bank')
const searchedWord = ref('')
const entries = ref<WordNetEntryBundle[]>([])
const selectedSenseId = ref('')
const synset = ref<WordNetSynsetGraph | null>(null)
const frames = ref<WordNetFrame[]>([])
const loading = ref(false)
const synsetLoading = ref(false)
const error = ref('')

const allSenses = computed(() => entries.value.flatMap(entry => entry.senses))
const selectedSense = computed(() => allSenses.value.find(sense => sense.id === selectedSenseId.value) || null)
const visibleRelations = computed(() => synset.value?.relations.slice(0, 40) || [])
const hiddenRelationCount = computed(() => Math.max(0, (synset.value?.relations.length || 0) - 40))

const relationGroups = computed(() => {
  const groups = new Map<string, WordNetSynsetRelation[]>()
  for (const relation of synset.value?.relations || []) {
    const group = groups.get(relation.type) || []
    group.push(relation)
    groups.set(relation.type, group)
  }
  return [...groups.entries()]
})

const POS_LABELS: Record<string, string> = {
  n: '名词 noun',
  v: '动词 verb',
  a: '形容词 adjective',
  s: '卫星形容词 adjective satellite',
  r: '副词 adverb',
}

const RELATION_LABELS: Record<string, string> = {
  hypernym: '上位概念',
  hyponym: '下位概念',
  instance_hypernym: '实例的上位概念',
  instance_hyponym: '上位概念的实例',
  mero_part: '组成部分',
  holo_part: '所属整体',
  mero_member: '成员',
  holo_member: '所属集合',
  mero_substance: '构成物质',
  holo_substance: '物质所属整体',
  similar: '相似',
  also: '另见',
  attribute: '属性',
  entails: '蕴含',
  causes: '导致',
  domain_topic: '主题领域',
  domain_region: '地域领域',
  exemplifies: '用法示例',
  antonym: '反义',
  derivation: '派生',
  pertainym: '相关词',
  participle: '分词来源',
}

function posLabel(pos: string): string {
  return POS_LABELS[pos] || pos
}

function relationLabel(type: string): string {
  return RELATION_LABELS[type] || type.replace(/_/g, ' ')
}

function compactText(text: string, max = 42): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function graphPosition(index: number, total: number) {
  const firstRing = Math.min(total, 14)
  const ringIndex = index < firstRing ? index : index - firstRing
  const ringTotal = index < firstRing ? firstRing : Math.max(1, total - firstRing)
  const radius = index < firstRing ? 175 : 255
  const angle = ringIndex / ringTotal * Math.PI * 2 - Math.PI / 2
  return {
    x: 450 + Math.cos(angle) * radius,
    y: 290 + Math.sin(angle) * radius,
  }
}

function localMeta(word: string) {
  const entry = dictStore.lookup(word)
  if (!entry) return null
  const translation = entry.translation
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .split('\n')[0]
    ?.trim() || ''
  return {
    translation: compactText(translation, 24),
    tags: getDictionaryTagLabels(entry.tags).slice(0, 3),
  }
}

async function selectSense(sense: WordNetSense) {
  selectedSenseId.value = sense.id
  synsetLoading.value = true
  error.value = ''
  try {
    const result = await loadWordNetSynset(sense.synsetShard, sense.synsetId)
    if (selectedSenseId.value !== sense.id) return
    synset.value = result
    frames.value = await loadWordNetFrames(sense.subcategories)
  } catch (cause) {
    console.warn('[WordNet] synset 加载失败', cause)
    error.value = cause instanceof Error ? cause.message : '语义节点加载失败'
    synset.value = null
    frames.value = []
  } finally {
    synsetLoading.value = false
  }
}

async function search(raw = query.value) {
  const word = raw.trim()
  if (!word) return
  query.value = word
  searchedWord.value = word
  loading.value = true
  error.value = ''
  entries.value = []
  synset.value = null
  frames.value = []
  try {
    const result = await lookupWordNetLemma(word)
    entries.value = result
    const firstSense = result.flatMap(entry => entry.senses)[0]
    if (firstSense) await selectSense(firstSense)
  } catch (cause) {
    console.warn('[WordNet] lemma 查询失败', cause)
    error.value = cause instanceof Error ? cause.message : 'WordNet 查询失败'
  } finally {
    loading.value = false
  }
}

async function recenter(relation: WordNetSynsetRelation) {
  synsetLoading.value = true
  error.value = ''
  try {
    synset.value = await loadWordNetSynset(relation.targetShard, relation.targetSynsetId)
    selectedSenseId.value = ''
    frames.value = []
  } catch (cause) {
    console.warn('[WordNet] 关系节点加载失败', cause)
    error.value = cause instanceof Error ? cause.message : '关系节点加载失败'
  } finally {
    synsetLoading.value = false
  }
}

watch(() => [props.initialWord, props.active] as const, ([word, active]) => {
  if (!active || !word?.trim()) return
  if (word.trim().toLowerCase() === searchedWord.value.toLowerCase() && entries.value.length) return
  void search(word)
}, { immediate: true })
</script>

<template>
  <section class="wordnet-view">
    <header class="wordnet-hero">
      <div>
        <p class="eyebrow">OPEN ENGLISH WORDNET 2025</p>
        <h2>英语语义网络</h2>
        <p>从一个词义出发，探索它的上位、下位、组成、蕴含与派生关系。</p>
      </div>
      <form class="wordnet-search" @submit.prevent="search()">
        <label class="sr-only" for="wordnet-query">查询英文单词</label>
        <input id="wordnet-query" v-model="query" autocomplete="off" placeholder="输入英文单词，例如 bank" />
        <button type="submit" :disabled="loading">{{ loading ? '查询中…' : '探索' }}</button>
      </form>
    </header>

    <div v-if="error" class="wordnet-state error-state">
      <strong>WordNet 暂时不可用</strong>
      <span>{{ error }}</span>
    </div>
    <div v-else-if="loading && !entries.length" class="wordnet-state">正在读取语义分片…</div>
    <div v-else-if="searchedWord && !entries.length" class="wordnet-state">
      Open English WordNet 中没有找到 “{{ searchedWord }}”。
    </div>

    <div v-if="entries.length" class="semantic-layout">
      <aside class="sense-panel">
        <div class="sense-heading">
          <div>
            <span class="sense-kicker">LEMMA</span>
            <h3>{{ entries[0].lemma }}</h3>
          </div>
          <span>{{ allSenses.length }} 个词义</span>
        </div>

        <section v-for="entry in entries" :key="`${entry.lemma}-${entry.pos}`" class="pos-section">
          <h4>{{ posLabel(entry.pos) }}</h4>
          <button
            v-for="(sense, index) in entry.senses"
            :key="sense.id"
            :class="['sense-card', { active: sense.id === selectedSenseId }]"
            @click="selectSense(sense)"
          >
            <span class="sense-number">{{ index + 1 }}</span>
            <span class="sense-copy">
              <strong>{{ sense.synsetGloss || sense.synsetLabel }}</strong>
              <small v-if="sense.synsetLabel && sense.synsetLabel !== entry.lemma">
                同义词：{{ sense.synsetLabel }}
              </small>
              <small v-if="sense.adjectivePosition">位置：{{ sense.adjectivePosition }}</small>
              <span v-if="sense.relations.length" class="sense-relations">
                {{ sense.relations.slice(0, 3).map(item => relationLabel(item.type)).join(' · ') }}
              </span>
            </span>
          </button>
        </section>
      </aside>

      <main class="graph-panel">
        <div v-if="synsetLoading" class="graph-loading">正在读取语义节点…</div>
        <template v-else-if="synset">
          <header class="synset-header">
            <div>
              <div class="synset-meta">
                <span>{{ posLabel(synset.pos) }}</span>
                <span>{{ synset.semanticCategory }}</span>
                <span>{{ synset.id }}</span>
              </div>
              <h3>{{ synset.members.join(' · ') }}</h3>
              <p v-for="definition in synset.definitions" :key="definition">{{ definition }}</p>
              <blockquote v-for="example in synset.examples" :key="example">“{{ example }}”</blockquote>
            </div>
            <div v-if="localMeta(synset.members[0] || '')" class="local-meaning">
              <span>ECDICT 本地补充</span>
              <strong>{{ localMeta(synset.members[0] || '')?.translation }}</strong>
              <small>{{ localMeta(synset.members[0] || '')?.tags.join(' · ') }}</small>
            </div>
          </header>

          <div v-if="frames.length" class="frame-list">
            <span>动词句型</span>
            <code v-for="frame in frames" :key="frame.id">{{ frame.template }}</code>
          </div>

          <div v-if="synset.relations.length" class="graph-wrap">
            <svg viewBox="0 0 900 580" role="img" :aria-label="`${synset.members[0]} 的一跳语义关系图`">
              <g v-for="(relation, index) in visibleRelations" :key="`edge-${relation.type}-${relation.targetSynsetId}`">
                <line
                  x1="450" y1="290"
                  :x2="graphPosition(index, visibleRelations.length).x"
                  :y2="graphPosition(index, visibleRelations.length).y"
                  :class="`edge edge-${relation.type}`"
                />
                <text
                  :x="(450 + graphPosition(index, visibleRelations.length).x) / 2"
                  :y="(290 + graphPosition(index, visibleRelations.length).y) / 2 - 4"
                  class="edge-label"
                >{{ relationLabel(relation.type) }}</text>
              </g>

              <g class="center-graph-node" transform="translate(450 290)">
                <circle r="58" />
                <text text-anchor="middle" y="-4">{{ compactText(synset.members[0] || synset.id, 16) }}</text>
                <text text-anchor="middle" y="17" class="node-pos">{{ synset.pos }}</text>
              </g>

              <g
                v-for="(relation, index) in visibleRelations"
                :key="`${relation.type}-${relation.targetSynsetId}`"
                class="relation-node"
                :transform="`translate(${graphPosition(index, visibleRelations.length).x} ${graphPosition(index, visibleRelations.length).y})`"
                role="button"
                tabindex="0"
                @click="recenter(relation)"
                @keydown.enter="recenter(relation)"
              >
                <title>{{ relation.targetLabel }} — {{ relation.targetGloss }}</title>
                <circle r="43" />
                <text text-anchor="middle" y="-4">{{ compactText(relation.targetLabel, 13) }}</text>
                <text text-anchor="middle" y="14" class="node-pos">{{ relation.targetPos }}</text>
              </g>
            </svg>
            <p v-if="hiddenRelationCount" class="graph-limit">
              图中显示前 40 个节点，另有 {{ hiddenRelationCount }} 条关系可在下方查看。
            </p>
          </div>
          <div v-else class="wordnet-state compact-state">这个 synset 没有可展示的一跳关系。</div>

          <section v-if="relationGroups.length" class="relation-directory">
            <h4>完整关系列表 <span>{{ synset.relations.length }}</span></h4>
            <details v-for="[type, relations] in relationGroups" :key="type">
              <summary>{{ relationLabel(type) }} <span>{{ relations.length }}</span></summary>
              <button v-for="relation in relations" :key="relation.targetSynsetId" @click="recenter(relation)">
                <strong>{{ relation.targetLabel }}</strong>
                <span>{{ relation.targetGloss }}</span>
                <small>{{ relation.targetSynsetId }}{{ relation.inferred ? ' · 反向推导' : '' }}</small>
              </button>
            </details>
          </section>
        </template>
      </main>
    </div>

    <footer class="wordnet-credit">
      数据来自 <a href="https://en-word.net/" target="_blank" rel="noreferrer">Open English WordNet 2025</a>，
      按 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 使用。
    </footer>
  </section>
</template>

<style scoped>
.wordnet-view {
  --ink: #172a3a;
  --muted: #667884;
  --accent: #087e8b;
  --accent-soft: #dff3f2;
  --warm: #ffb703;
  color: var(--ink);
}

.wordnet-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  padding: 2rem;
  margin-bottom: 1.25rem;
  border: 1px solid #cde1df;
  border-radius: 18px;
  background: radial-gradient(circle at 90% 10%, #ccebe7 0, transparent 34%), linear-gradient(135deg, #f8fffe, #edf7f5);
}

.wordnet-hero h2 { margin: 0.1rem 0; font-size: clamp(1.7rem, 3vw, 2.6rem); }
.wordnet-hero p { margin: 0.25rem 0 0; color: var(--muted); }
.eyebrow, .sense-kicker { color: var(--accent) !important; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.16em; }

.wordnet-search { display: flex; min-width: min(100%, 390px); }
.wordnet-search input { min-width: 0; flex: 1; padding: 0.8rem 1rem; border: 1px solid #b6d1cf; border-radius: 10px 0 0 10px; font-size: 1rem; outline: none; }
.wordnet-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgb(8 126 139 / 12%); }
.wordnet-search button { border: 0; border-radius: 0 10px 10px 0; padding: 0 1.2rem; background: var(--accent); color: white; font-weight: 700; cursor: pointer; }
.wordnet-search button:disabled { opacity: 0.6; }

.semantic-layout { display: grid; grid-template-columns: minmax(280px, 350px) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
.sense-panel, .graph-panel { border: 1px solid #d9e3e5; border-radius: 16px; background: white; box-shadow: 0 8px 30px rgb(29 55 70 / 5%); }
.sense-panel { max-height: calc(100vh - 150px); overflow: auto; padding: 1rem; position: sticky; top: 1rem; }
.sense-heading { display: flex; justify-content: space-between; align-items: end; padding: 0.35rem 0.4rem 0.8rem; border-bottom: 1px solid #e8eeee; }
.sense-heading h3 { margin: 0; font-size: 1.65rem; }
.sense-heading > span { color: var(--muted); font-size: 0.82rem; }
.pos-section h4 { margin: 1rem 0 0.45rem; color: var(--muted); font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
.sense-card { width: 100%; display: flex; gap: 0.65rem; padding: 0.75rem; margin-bottom: 0.45rem; border: 1px solid transparent; border-radius: 11px; background: #f6f9f9; text-align: left; color: inherit; cursor: pointer; }
.sense-card:hover { border-color: #b9d9d6; }
.sense-card.active { border-color: var(--accent); background: var(--accent-soft); }
.sense-number { display: grid; place-items: center; flex: 0 0 25px; width: 25px; height: 25px; border-radius: 50%; background: white; color: var(--accent); font-size: 0.75rem; font-weight: 800; }
.sense-copy { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.sense-copy strong { font-size: 0.86rem; line-height: 1.4; }
.sense-copy small, .sense-relations { color: var(--muted); font-size: 0.72rem; }

.graph-panel { min-height: 540px; padding: 1.25rem; overflow: hidden; }
.synset-header { display: flex; justify-content: space-between; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #edf1f1; }
.synset-header h3 { margin: 0.35rem 0; font-size: 1.45rem; }
.synset-header p { margin: 0.25rem 0; color: #334955; }
.synset-header blockquote { margin: 0.5rem 0 0; padding-left: 0.8rem; border-left: 3px solid var(--warm); color: var(--muted); font-size: 0.88rem; }
.synset-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.synset-meta span { padding: 0.15rem 0.45rem; border-radius: 5px; background: #edf4f4; color: var(--muted); font-size: 0.7rem; }
.local-meaning { flex: 0 0 180px; align-self: start; display: flex; flex-direction: column; padding: 0.75rem; border-radius: 10px; background: #fff8df; }
.local-meaning span, .local-meaning small { color: #826b20; font-size: 0.7rem; }
.local-meaning strong { margin: 0.15rem 0; font-size: 0.88rem; }
.frame-list { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; margin-top: 0.85rem; }
.frame-list > span { color: var(--muted); font-size: 0.75rem; font-weight: 700; }
.frame-list code { padding: 0.25rem 0.5rem; border-radius: 5px; background: #f2f5f5; font-size: 0.75rem; }

.graph-wrap { margin: 0.5rem -0.7rem 0; overflow-x: auto; }
.graph-wrap svg { display: block; width: 100%; min-width: 690px; max-height: 620px; }
.edge { stroke: #b5c9ca; stroke-width: 1.2; }
.edge-hypernym, .edge-hyponym { stroke: #0a9396; stroke-width: 1.8; }
.edge-label { fill: #718286; font-size: 8px; text-anchor: middle; paint-order: stroke; stroke: white; stroke-width: 3px; }
.center-graph-node circle { fill: var(--accent); stroke: #05636c; stroke-width: 4; }
.center-graph-node text { fill: white; font-size: 12px; font-weight: 800; }
.node-pos { font-size: 9px !important; font-weight: 500 !important; opacity: 0.75; }
.relation-node { cursor: pointer; outline: none; }
.relation-node circle { fill: #fff; stroke: #8ab9b6; stroke-width: 2; transition: 0.15s ease; }
.relation-node text { fill: var(--ink); font-size: 9px; font-weight: 700; pointer-events: none; }
.relation-node:hover circle, .relation-node:focus circle { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 3; }
.graph-limit { margin: -0.4rem 0 0.5rem; color: var(--muted); text-align: center; font-size: 0.76rem; }

.relation-directory { border-top: 1px solid #edf1f1; padding-top: 1rem; }
.relation-directory h4 { display: flex; gap: 0.5rem; margin: 0 0 0.7rem; }
.relation-directory h4 span, .relation-directory summary span { color: var(--accent); }
.relation-directory details { border-bottom: 1px solid #edf1f1; }
.relation-directory summary { padding: 0.6rem 0.2rem; font-weight: 700; cursor: pointer; }
.relation-directory details button { width: 100%; display: grid; grid-template-columns: minmax(100px, 0.25fr) 1fr auto; gap: 0.8rem; align-items: baseline; padding: 0.65rem; border: 0; border-top: 1px dashed #edf1f1; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.relation-directory details button:hover { background: #f5faf9; }
.relation-directory details button span { color: var(--muted); font-size: 0.82rem; }
.relation-directory details button small { color: #90a0a5; }

.wordnet-state, .graph-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 180px; padding: 1.5rem; border: 1px dashed #c8d7d7; border-radius: 14px; color: var(--muted); text-align: center; }
.error-state { border-color: #efb7b7; background: #fff8f8; color: #9c3434; }
.compact-state { min-height: 100px; margin-top: 1rem; }
.wordnet-credit { margin-top: 1.25rem; color: var(--muted); text-align: center; font-size: 0.75rem; }
.wordnet-credit a { color: var(--accent); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 900px) {
  .wordnet-hero { align-items: stretch; flex-direction: column; }
  .wordnet-search { min-width: 0; width: 100%; }
  .semantic-layout { grid-template-columns: 1fr; }
  .sense-panel { position: static; max-height: 520px; }
}

@media (max-width: 600px) {
  .wordnet-hero { padding: 1.2rem; }
  .synset-header { flex-direction: column; }
  .local-meaning { flex-basis: auto; }
  .relation-directory details button { grid-template-columns: 1fr; gap: 0.15rem; }
}
</style>
