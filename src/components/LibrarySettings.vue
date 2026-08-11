<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { clearRemoteBookCache, getActiveLibrarySource, listLibrarySources, removeLibrarySource, saveLibrarySource, setActiveLibrarySource, validateLibrarySource } from '../lib/library-service'
import { getReaderStorageStats } from '../lib/reader-db'
import type { LibrarySource, LibraryValidationResult, ReaderStorageStats } from '../lib/reader-types'

const sources = ref<LibrarySource[]>([])
const stats = ref<ReaderStorageStats | null>(null)
const editingId = ref('')
const activeSourceId = ref('')
const name = ref('')
const baseUrl = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function reload(): Promise<void> {
  const [nextSources, nextStats, activeSource] = await Promise.all([listLibrarySources(), getReaderStorageStats(), getActiveLibrarySource()])
  sources.value = nextSources
  stats.value = nextStats
  activeSourceId.value = activeSource?.id || ''
}

function startAdd(): void {
  editingId.value = ''
  name.value = ''
  baseUrl.value = ''
  message.value = ''
  error.value = ''
}

function startEdit(source: LibrarySource): void {
  editingId.value = source.id
  name.value = source.name
  baseUrl.value = source.baseUrl
  message.value = ''
  error.value = ''
}

async function validateCurrent(id = editingId.value || 'validation'): Promise<LibraryValidationResult> {
  if (!baseUrl.value.trim()) throw new Error('请输入书库地址')
  return validateLibrarySource({ id, baseUrl: baseUrl.value })
}

async function testConnection(): Promise<void> {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const result = await validateCurrent()
    message.value = `连接正常：Libr v${result.schemaVersion} · ${result.subjects} 类 / ${result.books.toLocaleString()} 本，样例《${result.sampleTitle}》`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function save(): Promise<void> {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const id = editingId.value || crypto.randomUUID()
    const result = await validateCurrent(id)
    await saveLibrarySource({ id, name: name.value, baseUrl: baseUrl.value, enabled: true })
    await setActiveLibrarySource(id)
    message.value = `已保存：${result.books.toLocaleString()} 本图书`
    editingId.value = id
    await reload()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function toggleSource(source: LibrarySource): Promise<void> {
  await saveLibrarySource({ id: source.id, name: source.name, baseUrl: source.baseUrl, enabled: !source.enabled })
  await reload()
}

async function activateSource(source: LibrarySource): Promise<void> {
  if (!source.enabled) return
  await setActiveLibrarySource(source.id)
  activeSourceId.value = source.id
  message.value = `当前书库已切换为：${source.name}`
}

async function remove(source: LibrarySource): Promise<void> {
  if (!window.confirm(`删除图书馆来源“${source.name}”？已缓存的远程章节也会删除。`)) return
  await removeLibrarySource(source.id)
  if (editingId.value === source.id) startAdd()
  await reload()
}

async function clearCache(): Promise<void> {
  if (!window.confirm('清除所有远程图书的目录、章节和图片缓存？收藏和阅读进度会保留。')) return
  busy.value = true
  try {
    await clearRemoteBookCache()
    message.value = '远程图书缓存已清除，收藏、进度和本地书籍已保留。'
    await reload()
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void reload().catch(cause => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
})
</script>

<template>
  <section class="settings-section library-settings">
    <div class="section-title-row"><h3>📖 图书馆来源</h3><button type="button" @click="startAdd">＋ 新增</button></div>
    <p class="settings-desc">配置符合 Standard Ebooks 解包目录协议的远程书库；生产地址必须使用 HTTPS 并开放 CORS。</p>

    <div class="source-list">
      <div v-for="source in sources" :key="source.id" :class="['source-row', { disabled: !source.enabled }]">
        <button class="source-main" type="button" @click="startEdit(source)"><strong>{{ source.name }}</strong><span>{{ source.baseUrl }}</span></button>
        <button type="button" :disabled="!source.enabled || activeSourceId === source.id" @click="activateSource(source)">{{ activeSourceId === source.id ? '当前' : '切换' }}</button>
        <button type="button" @click="toggleSource(source)">{{ source.enabled ? '停用' : '启用' }}</button>
        <button class="danger" type="button" @click="remove(source)">删除</button>
      </div>
    </div>

    <div class="source-form">
      <label>名称<input v-model="name" type="text" placeholder="例如：家庭书库"></label>
      <label>根地址<input v-model="baseUrl" type="url" placeholder="https://libr.2401.xyz"></label>
      <div class="form-actions"><button type="button" :disabled="busy" @click="testConnection">测试连接</button><button class="primary" type="button" :disabled="busy" @click="save">保存来源</button></div>
      <p v-if="message" class="form-message">{{ message }}</p>
      <p v-if="error" class="form-error">{{ error }}</p>
    </div>

    <div v-if="stats" class="reader-storage-stats">
      <div><strong>{{ stats.sources }}</strong><span>远程来源</span></div>
      <div><strong>{{ stats.remoteBooks.toLocaleString() }}</strong><span>远程目录</span></div>
      <div><strong>{{ stats.localBooks }}</strong><span>本地图书</span></div>
      <div><strong>{{ stats.cachedChapters }}</strong><span>缓存章节</span></div>
      <div><strong>{{ formatBytes(stats.cachedBytes) }}</strong><span>书籍资源</span></div>
    </div>
    <button class="clear-cache" type="button" :disabled="busy" @click="clearCache">清除远程图书缓存</button>
  </section>
</template>

<style scoped>
.library-settings { padding: 1.25rem; border: 1px solid #e5e9ed; border-radius: 8px; background: #fff; }
.settings-desc { margin: .45rem 0 0; color: #7d8b98; font-size: .68rem; line-height: 1.5; }
.section-title-row { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }.section-title-row h3 { margin: 0; }.section-title-row > button { padding: .22rem .45rem; border: 1px solid #d9e1e8; border-radius: 5px; background: #fff; color: #3479a8; cursor: pointer; font-size: .68rem; }
.source-list { display: grid; gap: .35rem; margin: .65rem 0; }.source-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto auto; align-items: center; gap: .35rem; padding: .42rem; border: 1px solid #e3e8ec; border-radius: 6px; background: #fafbfc; }.source-row.disabled { opacity: .58; }.source-main { min-width: 0; display: grid; gap: .08rem; border: 0; background: transparent; cursor: pointer; text-align: left; }.source-main strong { color: #34495e; font-size: .74rem; }.source-main span { overflow: hidden; color: #8996a3; font-size: .62rem; text-overflow: ellipsis; white-space: nowrap; }.source-row > button:not(.source-main) { padding: .2rem .35rem; border: 1px solid #dce3e8; border-radius: 4px; background: #fff; color: #617181; cursor: pointer; font-size: .62rem; }.source-row > button:not(.source-main):disabled { color: #2f8a64; cursor: default; }.source-row > button.danger { color: #a74e4e; }
.source-form { display: grid; gap: .45rem; padding: .65rem; border-radius: 7px; background: #f6f8fa; }.source-form label { display: grid; grid-template-columns: 4rem minmax(0,1fr); align-items: center; gap: .45rem; color: #667685; font-size: .68rem; }.source-form input { min-width: 0; padding: .38rem .45rem; border: 1px solid #d8e0e7; border-radius: 5px; background: #fff; font-size: .7rem; }.form-actions { display: flex; justify-content: flex-end; gap: .4rem; }.form-actions button, .clear-cache { padding: .32rem .55rem; border: 1px solid #d5dde4; border-radius: 5px; background: #fff; color: #536475; cursor: pointer; font-size: .66rem; }.form-actions button.primary { border-color: #3498db; background: #3498db; color: #fff; }.form-message, .form-error { margin: 0; font-size: .65rem; line-height: 1.45; }.form-message { color: #23865d; }.form-error { color: #b64e4e; }
.reader-storage-stats { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: .35rem; margin-top: .65rem; }.reader-storage-stats div { min-width: 0; display: grid; gap: .08rem; padding: .42rem .25rem; border: 1px solid #e5e9ed; border-radius: 5px; text-align: center; }.reader-storage-stats strong { overflow: hidden; color: #33485b; font-size: .7rem; text-overflow: ellipsis; }.reader-storage-stats span { color: #8a97a4; font-size: .57rem; }.clear-cache { margin-top: .55rem; color: #a14f4f; }
@media (max-width: 600px) { .reader-storage-stats { grid-template-columns: repeat(3,minmax(0,1fr)); } }
</style>
