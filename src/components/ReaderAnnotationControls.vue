<script setup lang="ts">
import { computed } from 'vue'
import {
  TAG_OPTIONS,
  createNeutralTagStates,
  nextTagFilterMode,
  type DictionaryTagId,
  type TagFilterMode,
  type TagStates,
} from '../lib/dictionary-tags'

const props = defineProps<{ states: TagStates }>()
const emit = defineEmits<{ 'update:states': [states: TagStates] }>()

const STATE_LABELS: Record<TagFilterMode, string> = {
  neutral: '默认',
  include: '释义',
  exclude: '排除',
  annotate: 'Tag',
}

const allNeutral = computed(() => TAG_OPTIONS.every(tag => props.states[tag.id] === 'neutral'))

function markerFor(state: TagFilterMode): string {
  if (state === 'include') return '✓'
  if (state === 'exclude') return '✕'
  if (state === 'annotate') return '◆'
  return '·'
}

function cycle(tag: DictionaryTagId): void {
  emit('update:states', {
    ...props.states,
    [tag]: nextTagFilterMode(props.states[tag]),
  })
}

function reset(): void {
  emit('update:states', createNeutralTagStates())
}
</script>

<template>
  <div class="reader-annotation-controls">
    <span class="control-label">阅读辅助</span>
    <div class="reader-tag-options" role="group" aria-label="阅读辅助四态标签">
      <button
        v-for="tag in TAG_OPTIONS"
        :key="tag.id"
        type="button"
        :class="['tag-btn', `is-${states[tag.id]}`]"
        :aria-label="`${tag.label}：${STATE_LABELS[states[tag.id]]}，点击切换状态`"
        :data-state="states[tag.id]"
        @click="cycle(tag.id)"
      >
        <span class="state-icon" aria-hidden="true">{{ markerFor(states[tag.id]) }}</span>
        <span>{{ tag.id }}</span>
      </button>
      <button
        :class="['reset-btn', { active: !allNeutral }]"
        type="button"
        title="恢复纯阅读"
        @click="reset"
      >↺ 重置</button>
    </div>
    <div class="legend-note" aria-hidden="true">
      <span class="include-text">✓ 释义</span>
      <span class="exclude-text">✕ 排除</span>
      <span class="annotate-text">◆ Tag</span>
      <span class="neutral-text">· 纯读</span>
    </div>
  </div>
</template>

<style scoped>
.reader-annotation-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.65rem;
  width: 100%;
  box-sizing: border-box;
  padding: 0.42rem 0.65rem;
  border: 1px solid #e1e7eb;
  border-radius: 8px;
  background: #fff;
}

.control-label {
  color: #607080;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.reader-tag-options {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.28rem;
  min-width: 0;
  flex: 1;
}

.tag-btn,
.reset-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.08rem;
  height: 1.65rem;
  padding: 0 0.42rem;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #f8fafc;
  color: #334155;
  font-size: 0.72rem;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
}

.tag-btn { width: 3.75rem; flex: 0 0 3.75rem; }
.tag-btn.is-include { border-color: #10b981; background: #10b981; color: #fff; }
.tag-btn.is-exclude { border-color: #ef4444; background: #ef4444; color: #fff; }
.tag-btn.is-annotate { border-color: #f59e0b; background: #f59e0b; color: #fff; }
.tag-btn.is-neutral:hover { border-color: #94a3b8; background: #f1f5f9; }

.state-icon {
  display: inline-grid;
  place-items: center;
  width: 0.8rem;
  flex: 0 0 0.8rem;
  line-height: 1;
}

.tag-btn.is-neutral .state-icon { color: #94a3b8; }

.reset-btn {
  min-width: 3.75rem;
  color: #64748b;
  background: #fff;
}

.reset-btn.active { border-color: #93c5fd; background: #eff6ff; color: #2563eb; }

.legend-note {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  margin-left: auto;
  font-size: 0.68rem;
  white-space: nowrap;
}

.include-text { color: #059669; font-weight: 650; }
.exclude-text { color: #dc2626; font-weight: 650; }
.annotate-text { color: #d97706; font-weight: 650; }
.neutral-text { color: #64748b; }

@media (max-width: 720px) {
  .reader-tag-options { order: 3; width: 100%; flex-basis: 100%; }
  .legend-note { margin-left: 0; }
}
</style>
