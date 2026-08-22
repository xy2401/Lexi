<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  clearAllLearningProgress,
  clearLearningProgress,
  getLearningProgressSummaries,
  type LearningProgressArea,
  type LearningProgressSummary,
} from '../lib/learning-progress'

const props = withDefaults(defineProps<{ refreshToken?: number }>(), { refreshToken: 0 })
const emit = defineEmits<{ cleared: [area: LearningProgressArea | 'all'] }>()
const summaries = ref<LearningProgressSummary[]>([])
const busy = ref<LearningProgressArea | 'all' | ''>('')
const message = ref('')
const error = ref('')

function formatUpdatedAt(timestamp: number): string {
  if (!timestamp) return '尚未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(timestamp)
}

async function reload(): Promise<void> {
  summaries.value = await getLearningProgressSummaries()
}

async function clearArea(item: LearningProgressSummary): Promise<void> {
  if (!item.hasData || !window.confirm(`清空“${item.title}”保存的进度？此操作不会删除数据缓存和标注偏好。`)) return
  busy.value = item.id
  error.value = ''
  try {
    await clearLearningProgress(item.id)
    await reload()
    message.value = `${item.title}进度已清空。`
    emit('cleared', item.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = ''
  }
}

async function clearAll(): Promise<void> {
  if (!summaries.value.some(item => item.hasData)) return
  if (!window.confirm('清空所有模块的学习进度？词典与图书缓存、阅读收藏、语音及标注偏好都会保留。')) return
  busy.value = 'all'
  error.value = ''
  try {
    await clearAllLearningProgress()
    await reload()
    message.value = '全部学习进度已清空。'
    emit('cleared', 'all')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = ''
  }
}

onMounted(() => void reload().catch(cause => {
  error.value = cause instanceof Error ? cause.message : String(cause)
}))
watch(() => props.refreshToken, () => void reload())
</script>

<template>
  <section class="settings-section progress-settings">
    <div class="progress-title-row">
      <div><h3>🧭 学习进度</h3><p class="settings-desc">查看并清空各模块的恢复位置和学习记录；不影响数据缓存与使用偏好。</p></div>
      <button class="clear-all" type="button" :disabled="busy !== '' || !summaries.some(item => item.hasData)" @click="clearAll">清空全部</button>
    </div>

    <div class="progress-list">
      <article v-for="item in summaries" :key="item.id" :class="['progress-row', { empty: !item.hasData }]">
        <div class="progress-copy">
          <div><strong>{{ item.title }}</strong><time>{{ formatUpdatedAt(item.updatedAt) }}</time></div>
          <span>{{ item.value }}</span>
          <small>{{ item.detail }}</small>
        </div>
        <button type="button" :disabled="busy !== '' || !item.hasData" @click="clearArea(item)">{{ busy === item.id ? '清空中…' : '清空' }}</button>
      </article>
    </div>
    <p v-if="message" class="progress-message">{{ message }}</p>
    <p v-if="error" class="progress-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.progress-settings { padding: 1.25rem; border: 1px solid #e5e9ed; border-radius: 8px; background: #fff; }
.progress-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: .8rem; }
.progress-title-row h3 { margin: 0; }
.settings-desc { margin: .45rem 0 0; color: #7d8b98; font-size: .68rem; line-height: 1.5; }
.clear-all, .progress-row > button { flex: 0 0 auto; padding: .3rem .52rem; border: 1px solid #e1b6b6; border-radius: 5px; background: #fff; color: #a14f4f; cursor: pointer; font-size: .64rem; }
.clear-all:disabled, .progress-row > button:disabled { border-color: #dfe4e8; color: #aab3ba; cursor: default; }
.progress-list { display: grid; gap: .38rem; margin-top: .75rem; }
.progress-row { display: flex; align-items: center; gap: .7rem; padding: .52rem .58rem; border: 1px solid #e2e8ed; border-radius: 7px; background: #fafcfd; }
.progress-row.empty { background: #fcfcfc; }
.progress-copy { min-width: 0; display: grid; gap: .08rem; flex: 1; }
.progress-copy > div { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
.progress-copy strong { color: #34495e; font-size: .75rem; }
.progress-copy time { color: #a0aab3; font-size: .58rem; white-space: nowrap; }
.progress-copy span { color: #52677a; font-size: .7rem; }
.progress-copy small { overflow: hidden; color: #8996a3; font-size: .61rem; text-overflow: ellipsis; white-space: nowrap; }
.progress-row.empty .progress-copy { opacity: .62; }
.progress-message, .progress-error { margin: .6rem 0 0; font-size: .65rem; }
.progress-message { color: #23865d; }.progress-error { color: #b64e4e; }

@media (max-width: 767.98px) {
  .progress-settings { padding: 1rem; border: 0; border-radius: 16px; box-shadow: 0 4px 16px rgb(15 23 42 / 5%); }
  .progress-title-row { align-items: stretch; flex-direction: column; }
  .clear-all, .progress-row > button { min-height: 42px; padding-inline: .7rem; border-radius: 10px; }
  .progress-row { align-items: stretch; flex-direction: column; padding: .7rem; border-radius: 12px; }
  .progress-copy > div { align-items: flex-start; }
  .progress-copy small { white-space: normal; line-height: 1.4; }
  .progress-row > button { width: 100%; }
}
</style>
