<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDictStore } from '../stores/dict'
import { useIsMobile } from '../composables/useMediaQuery'
import DictionaryTags from './DictionaryTags.vue'
import {
  loadWordNetFrames,
  loadWordNetSynset,
  lookupWordNetLemma,
  suggestWordNetLemmas,
  type WordNetEntryBundle,
  type WordNetFrame,
  type WordNetSense,
  type WordNetSynsetGraph,
  type WordNetSynsetRelation,
} from '../lib/wordnet-service'
import { getProgressSetting, setProgressSetting } from '../lib/progress-db'

interface SavedWordNetState {
  word: string
  kind: 'sense' | 'synset'
  senseId?: string
  synsetId: string
  shard: string
}

const props = withDefaults(defineProps<{
  initialWord?: string
  active?: boolean
}>(), {
  initialWord: 'bank',
  active: false,
})
const emit = defineEmits<{ 'immersive-change': [active: boolean] }>()

const dictStore = useDictStore()
const isMobile = useIsMobile()
const mobileScreen = ref<'senses' | 'graph'>('senses')
const WORDNET_HISTORY_KEY = 'lexiWordNetLayer'
const query = ref('bank')
const searchedWord = ref('')
const entries = ref<WordNetEntryBundle[]>([])
const selectedSenseId = ref('')
const synset = ref<WordNetSynsetGraph | null>(null)
const frames = ref<WordNetFrame[]>([])
const loading = ref(false)
const synsetLoading = ref(false)
const error = ref('')
const suggestions = ref<string[]>([])
const suggestionsOpen = ref(false)
const activeSuggestion = ref(-1)
let suggestionTimer: ReturnType<typeof setTimeout> | undefined
let suggestionRequest = 0

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
    tags: entry.tags,
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
    await setProgressSetting<SavedWordNetState>('wordnet.lastState', {
      word: searchedWord.value,
      kind: 'sense',
      senseId: sense.id,
      synsetId: sense.synsetId,
      shard: sense.synsetShard,
    })
  } catch (cause) {
    console.warn('[WordNet] synset 加载失败', cause)
    error.value = cause instanceof Error ? cause.message : '语义节点加载失败'
    synset.value = null
    frames.value = []
  } finally {
    synsetLoading.value = false
  }
}

async function openSense(sense: WordNetSense) {
  if (isMobile.value) {
    mobileScreen.value = 'graph'
    emit('immersive-change', true)
    if (window.history.state?.[WORDNET_HISTORY_KEY] !== 'graph') {
      window.history.pushState({ ...(window.history.state || {}), [WORDNET_HISTORY_KEY]: 'graph' }, '')
    }
  }
  await selectSense(sense)
}

function leaveGraph(clearHistory = false) {
  mobileScreen.value = 'senses'
  emit('immersive-change', false)
  if (clearHistory && window.history.state?.[WORDNET_HISTORY_KEY] === 'graph') {
    const state: Record<string, unknown> = { ...(window.history.state || {}) }
    delete state[WORDNET_HISTORY_KEY]
    window.history.replaceState(state, '')
  }
}

function closeGraph() {
  if (window.history.state?.[WORDNET_HISTORY_KEY] === 'graph') window.history.back()
  else leaveGraph(true)
}

function handleWordNetPopState() {
  if (isMobile.value && mobileScreen.value === 'graph') leaveGraph(false)
}

async function search(raw = query.value) {
  const word = raw.trim()
  if (!word) return
  query.value = word
  suggestionsOpen.value = false
  searchedWord.value = word
  void setProgressSetting('wordnet.lastWord', word)
  loading.value = true
  error.value = ''
  entries.value = []
  synset.value = null
  frames.value = []
  try {
    const result = await lookupWordNetLemma(word)
    entries.value = result
    const senses = result.flatMap(entry => entry.senses)
    const saved = await getProgressSetting<SavedWordNetState | null>('wordnet.lastState', null)
    const restoringSameWord = saved?.word.toLowerCase() === word.toLowerCase()
    if (restoringSameWord && saved.kind === 'synset') {
      synset.value = await loadWordNetSynset(saved.shard, saved.synsetId)
      selectedSenseId.value = ''
    } else {
      const preferredSense = restoringSameWord
        ? senses.find(sense => sense.id === saved?.senseId) || senses[0]
        : senses[0]
      if (preferredSense) await selectSense(preferredSense)
    }
  } catch (cause) {
    console.warn('[WordNet] lemma 查询失败', cause)
    error.value = cause instanceof Error ? cause.message : 'WordNet 查询失败'
  } finally {
    loading.value = false
  }
}

function requestSuggestions() {
  if (suggestionTimer) clearTimeout(suggestionTimer)
  const prefix = query.value.trim()
  if (!prefix) {
    suggestions.value = []
    suggestionsOpen.value = false
    return
  }
  const request = ++suggestionRequest
  suggestionTimer = setTimeout(async () => {
    try {
      const result = await suggestWordNetLemmas(prefix)
      if (request !== suggestionRequest || query.value.trim() !== prefix) return
      suggestions.value = result
      activeSuggestion.value = -1
      suggestionsOpen.value = result.length > 0
    } catch (cause) {
      console.warn('[WordNet] 自动补全加载失败', cause)
      suggestions.value = []
      suggestionsOpen.value = false
    }
  }, 160)
}

function chooseSuggestion(lemma: string) {
  query.value = lemma
  suggestionsOpen.value = false
  void search(lemma)
}

function moveSuggestion(offset: number) {
  if (!suggestionsOpen.value || !suggestions.value.length) {
    requestSuggestions()
    return
  }
  const count = suggestions.value.length
  activeSuggestion.value = (activeSuggestion.value + offset + count) % count
}

function submitSearch() {
  const selected = suggestions.value[activeSuggestion.value]
  void search(selected || query.value)
}

function closeSuggestionsLater() {
  setTimeout(() => { suggestionsOpen.value = false }, 120)
}

async function recenter(relation: WordNetSynsetRelation) {
  synsetLoading.value = true
  error.value = ''
  try {
    synset.value = await loadWordNetSynset(relation.targetShard, relation.targetSynsetId)
    selectedSenseId.value = ''
    frames.value = []
    await setProgressSetting<SavedWordNetState>('wordnet.lastState', {
      word: searchedWord.value,
      kind: 'synset',
      synsetId: relation.targetSynsetId,
      shard: relation.targetShard,
    })
  } catch (cause) {
    console.warn('[WordNet] 关系节点加载失败', cause)
    error.value = cause instanceof Error ? cause.message : '关系节点加载失败'
  } finally {
    synsetLoading.value = false
  }
}

watch(() => [props.initialWord, props.active] as const, ([word, active]) => {
  if (!active) {
    emit('immersive-change', false)
    return
  }
  if (isMobile.value) leaveGraph(true)
  if (!word?.trim()) return
  if (word.trim().toLowerCase() === searchedWord.value.toLowerCase() && entries.value.length) return
  void search(word)
}, { immediate: true })

onMounted(() => window.addEventListener('popstate', handleWordNetPopState))
onBeforeUnmount(() => {
  window.removeEventListener('popstate', handleWordNetPopState)
  emit('immersive-change', false)
})
</script>

<template>
  <section :class="['wordnet-view', { 'is-mobile-graph': isMobile && mobileScreen === 'graph' }]">
    <div class="semantic-layout">
      <aside v-show="!isMobile || mobileScreen === 'senses'" class="sense-panel">
        <div class="sense-heading">
          <form class="sense-search" role="search" @submit.prevent="submitSearch">
            <label class="sense-kicker" for="wordnet-query">LEMMA</label>
            <h3>
              <input
                id="wordnet-query"
                v-model="query"
                role="combobox"
                autocomplete="off"
                aria-autocomplete="list"
                :aria-expanded="suggestionsOpen"
                aria-controls="wordnet-suggestions"
                placeholder="输入英文单词"
                @input="requestSuggestions"
                @focus="requestSuggestions"
                @blur="closeSuggestionsLater"
                @keydown.down.prevent="moveSuggestion(1)"
                @keydown.up.prevent="moveSuggestion(-1)"
                @keydown.enter.prevent="submitSearch"
                @keydown.esc="suggestionsOpen = false"
              />
              <button type="submit" :disabled="loading" aria-label="查询 WordNet">
                {{ loading ? '…' : '⌕' }}
              </button>
            </h3>
            <ul v-if="suggestionsOpen" id="wordnet-suggestions" class="wordnet-suggestions" role="listbox">
              <li v-for="(lemma, index) in suggestions" :key="lemma" role="option" :aria-selected="index === activeSuggestion">
                <button
                  type="button"
                  :class="{ active: index === activeSuggestion }"
                  @mousedown.prevent="chooseSuggestion(lemma)"
                >{{ lemma }}</button>
              </li>
            </ul>
          </form>
          <span v-if="entries.length">{{ allSenses.length }} 个词义</span>
        </div>

        <div v-if="loading && !entries.length" class="sense-state">正在读取语义分片…</div>
        <div v-else-if="searchedWord && !entries.length && !error" class="sense-state">
          没有找到 “{{ searchedWord }}”
        </div>
        <details v-for="entry in entries" :key="`${entry.lemma}-${entry.pos}`" class="pos-section" open>
          <summary>
            <h4>
              <span>{{ posLabel(entry.pos) }}</span>
              <small>{{ entry.senses.length }} 个词义</small>
            </h4>
          </summary>
          <div class="sense-list">
            <button
              v-for="(sense, index) in entry.senses"
              :key="sense.id"
              :class="['sense-card', { active: sense.id === selectedSenseId }]"
              @click="openSense(sense)"
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
          </div>
        </details>
      </aside>

      <main v-show="!isMobile || mobileScreen === 'graph'" class="graph-panel">
        <header class="mobile-graph-bar">
          <button type="button" aria-label="返回词义列表" @click="closeGraph">‹</button>
          <div>
            <small>WORDNET</small>
            <strong>{{ searchedWord || query }}</strong>
          </div>
          <span aria-hidden="true">◉</span>
        </header>
        <div v-if="error" class="wordnet-state error-state">
          <strong>WordNet 暂时不可用</strong>
          <span>{{ error }}</span>
        </div>
        <div v-else-if="loading && !entries.length" class="graph-loading">正在读取词义…</div>
        <div v-else-if="synsetLoading" class="graph-loading">正在读取语义节点…</div>
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
              <DictionaryTags
                v-if="localMeta(synset.members[0] || '')?.tags"
                class="local-tags"
                :tags="localMeta(synset.members[0] || '')?.tags || ''"
              />
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
        <div v-else class="wordnet-state compact-state">在左侧输入单词，从一个词义开始探索。</div>
      </main>
    </div>

    <footer v-show="!isMobile || mobileScreen === 'senses'" class="wordnet-credit">
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

.sense-kicker { color: var(--accent) !important; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.16em; }

.semantic-layout { display: grid; grid-template-columns: minmax(280px, 350px) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
.sense-panel, .graph-panel { border: 1px solid #d9e3e5; border-radius: 16px; background: white; box-shadow: 0 8px 30px rgb(29 55 70 / 5%); }
.sense-panel { max-height: calc(100vh - 150px); overflow: auto; padding: 1rem; position: sticky; top: 1rem; }
.sense-heading { display: flex; justify-content: space-between; align-items: end; gap: 0.7rem; padding: 0.25rem 0.4rem 0.8rem; border-bottom: 1px solid #e8eeee; }
.sense-heading > span { flex: 0 0 auto; padding-bottom: 0.3rem; color: var(--muted); font-size: 0.78rem; }
.sense-search { position: relative; flex: 1; min-width: 0; }
.sense-search h3 { display: flex; margin: 0.15rem 0 0; border-bottom: 2px solid #b9d9d6; }
.sense-search h3:focus-within { border-color: var(--accent); }
.sense-search input { min-width: 0; width: 100%; padding: 0.15rem 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; font-size: 1.55rem; font-weight: 700; }
.sense-search button[type='submit'] { flex: 0 0 30px; border: 0; background: transparent; color: var(--accent); font-size: 1.35rem; cursor: pointer; }
.sense-search button:disabled { opacity: 0.45; }
.wordnet-suggestions { position: absolute; z-index: 20; top: calc(100% + 0.45rem); left: 0; width: min(260px, calc(100vw - 4rem)); max-height: 280px; overflow: auto; margin: 0; padding: 0.3rem; border: 1px solid #cbdcdb; border-radius: 10px; background: white; box-shadow: 0 12px 28px rgb(20 55 66 / 16%); list-style: none; }
.wordnet-suggestions li { margin: 0; }
.wordnet-suggestions button { width: 100%; padding: 0.48rem 0.6rem; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font-size: 0.9rem; text-align: left; cursor: pointer; }
.wordnet-suggestions button:hover, .wordnet-suggestions button.active { background: var(--accent-soft); color: #05636c; }
.sense-state { padding: 1rem 0.4rem; color: var(--muted); font-size: 0.82rem; }
.pos-section { margin-top: 0.7rem; }
.pos-section summary { position: relative; padding-right: 1.1rem; border-radius: 6px; cursor: pointer; list-style: none; }
.pos-section summary::-webkit-details-marker { display: none; }
.pos-section summary::after { content: '›'; position: absolute; top: 50%; right: 0.2rem; color: #91a1a6; font-size: 1.05rem; transform: translateY(-50%) rotate(90deg); transition: transform 0.15s ease; }
.pos-section:not([open]) summary::after { transform: translateY(-50%) rotate(0deg); }
.pos-section summary:hover { background: #f5f9f9; }
.pos-section h4 { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0; padding: 0.35rem 0.3rem; color: var(--muted); font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
.pos-section h4 small { color: #91a1a6; font-size: 0.68rem; font-weight: 500; letter-spacing: 0; text-transform: none; }
.sense-list { padding-top: 0.25rem; }
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
.local-meaning { flex: 0 0 180px; align-self: start; display: flex; flex-direction: column; padding: 0.7rem; border: 1px solid #e1e8e8; border-radius: 9px; background: #fff; }
.local-meaning > span { color: var(--muted); font-size: 0.7rem; }
.local-meaning strong { margin: 0.15rem 0; font-size: 0.88rem; }
.local-tags { margin-top: 0.25rem; }
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
.mobile-graph-bar { display: none; }

@media (max-width: 900px) {
  .semantic-layout { grid-template-columns: 1fr; }
  .sense-panel { position: static; max-height: 520px; }
}

@media (max-width: 767.98px) {
  .wordnet-view { min-height: calc(100dvh - var(--mobile-appbar-h) - var(--tabbar-h) - 1.5rem); }
  .semantic-layout { display: block; }
  .sense-panel { max-height: none; overflow: visible; padding: .8rem; border: 0; border-radius: 18px; }
  .sense-heading { position: sticky; top: var(--mobile-appbar-h); z-index: 15; margin: -.8rem -.8rem .7rem; padding: .8rem; background: rgba(255, 255, 255, .97); backdrop-filter: blur(14px); }
  .sense-search input { min-height: 44px; font-size: 1.35rem; }
  .sense-search button[type='submit'] { flex-basis: 44px; min-height: 44px; }
  .wordnet-suggestions { width: calc(100vw - 3rem); }
  .wordnet-suggestions button { min-height: 44px; }
  .pos-section h4 { min-height: 40px; }
  .sense-card { min-height: 70px; padding: .85rem; border-radius: 14px; }

  .wordnet-view.is-mobile-graph {
    position: fixed;
    inset: 0;
    z-index: 850;
    min-height: 100dvh;
    overflow: hidden;
    background: #f6f8fb;
  }

  .is-mobile-graph .semantic-layout { height: 100dvh; }
  .graph-panel { height: 100dvh; min-height: 0; overflow-y: auto; padding: 0 .8rem calc(1rem + env(safe-area-inset-bottom, 0px)); border: 0; border-radius: 0; }
  .mobile-graph-bar {
    position: sticky;
    top: 0;
    z-index: 20;
    min-height: calc(58px + env(safe-area-inset-top, 0px));
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: .5rem;
    margin: 0 -.8rem .8rem;
    padding: env(safe-area-inset-top, 0px) .65rem 0;
    border-bottom: 1px solid #d9e3e5;
    background: rgba(255, 255, 255, .97);
    backdrop-filter: blur(14px);
  }
  .mobile-graph-bar button { width: 44px; height: 44px; border: 0; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 1.75rem; }
  .mobile-graph-bar div { min-width: 0; display: grid; text-align: center; }
  .mobile-graph-bar small { color: var(--accent); font-size: .6rem; font-weight: 800; letter-spacing: .1em; }
  .mobile-graph-bar strong { overflow: hidden; font-size: .92rem; text-overflow: ellipsis; white-space: nowrap; }
  .mobile-graph-bar > span { display: grid; place-items: center; color: var(--accent); }
  .synset-header { flex-direction: column; }
  .synset-header h3 { font-size: 1.25rem; }
  .local-meaning { flex-basis: auto; }
  .graph-wrap { margin-inline: -.8rem; padding-inline: .8rem; }
  .relation-directory details button { grid-template-columns: 1fr; gap: 0.15rem; }
  .relation-directory summary,
  .relation-directory details button { min-height: 48px; }
}
</style>
