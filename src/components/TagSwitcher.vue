<script setup lang="ts">
/**
 * TagSwitcher - 标签筛选器组件 (原生字符 + 1.2rem 充裕定宽 0 抖动版)
 */
import {
  TAG_OPTIONS,
  useDictStore,
  type DictionaryTagId,
  type TagFilterMode,
} from '../stores/dict'

const dictStore = useDictStore()

const STATE_LABELS: Record<TagFilterMode, string> = {
  neutral: '默认',
  include: '仅看',
  exclude: '排除',
}

function markerFor(state: TagFilterMode): string {
  if (state === 'include') return '✓'
  if (state === 'exclude') return '✕'
  return '·'
}

function buttonLabel(tag: DictionaryTagId, label: string): string {
  const state = dictStore.tagStates[tag]
  return `${label}：${STATE_LABELS[state]}，点击切换状态`
}
</script>

<template>
  <div class="tag-switcher-bar">
    <span class="filter-label">标签筛选:</span>

    <!-- 标签按钮流 -->
    <div class="tag-buttons-group">
      <button
        v-for="tag in TAG_OPTIONS"
        :key="tag.id"
        :class="['tag-btn', `is-${dictStore.tagStates[tag.id]}`]"
        :aria-label="buttonLabel(tag.id, tag.label)"
        :data-state="dictStore.tagStates[tag.id]"
        type="button"
        @click="dictStore.cycleTagState(tag.id)"
      >
        <!-- 给足 1.2rem 定宽，居中容纳字符，绝对不会挤压标签文本 -->
        <span class="state-icon" aria-hidden="true">
          {{ markerFor(dictStore.tagStates[tag.id]) }}
        </span>

        <span class="tag-text">{{ tag.label }}</span>
      </button>

      <!-- 快速重置选项 -->
      <button
        :class="['reset-btn', { active: !dictStore.allTagsNeutral }]"
        type="button"
        title="快速重置所有标签为默认状态"
        @click="dictStore.resetTagFilters"
      >
        ↺ 重置
      </button>
    </div>

    <!-- 图例说明注释 -->
    <div class="legend-note" aria-hidden="true">
      <span class="note-label">注释:</span>
      <span class="include-text">✓ 仅看</span>
      <span class="exclude-text">✕ 排除</span>
      <span class="neutral-text">· 默认</span>
    </div>
  </div>
</template>

<style scoped>
.tag-switcher-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem 1rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  width: 100%;
  box-sizing: border-box;
}

.filter-label {
  font-weight: 600;
  font-size: 0.85rem;
  color: #334155;
  white-space: nowrap;
}

.tag-buttons-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  flex: 1;
}

.tag-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.25rem 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: #f8fafc;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.tag-btn:hover.is-neutral {
  border-color: #94a3b8;
  background: #f1f5f9;
}

.tag-btn.is-include {
  background: #10b981;
  border-color: #10b981;
  color: #fff;
}

.tag-btn.is-exclude {
  background: #ef4444;
  border-color: #ef4444;
  color: #fff;
}

/* 充裕 1.2rem 显式定宽，居中呈现原生字符 · ✓ ✕，容器自身绝不发生尺寸改变 */
.state-icon {
  display: inline-block;
  width: 1.2rem;
  flex: 0 0 1.2rem;
  text-align: center;
  font-weight: 700;
  font-size: 0.85rem;
  line-height: 1;
}

.tag-btn.is-neutral .state-icon {
  color: #94a3b8;
  font-size: 0.95rem;
}

.tag-btn.is-include .state-icon,
.tag-btn.is-exclude .state-icon {
  color: #fff;
}

/* 快速重置按键 */
.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.22rem 0.6rem;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: #fff;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: 0.25rem;
}

.reset-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
  border-color: #94a3b8;
}

.reset-btn.active {
  background: #eff6ff;
  color: #2563eb;
  border-color: #93c5fd;
  font-weight: 600;
}

.legend-note {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 0.75rem;
  color: #64748b;
  margin-left: auto;
  white-space: nowrap;
}

.note-label {
  color: #94a3b8;
  font-weight: 500;
}

.include-text {
  color: #059669;
  font-weight: 600;
}

.exclude-text {
  color: #dc2626;
  font-weight: 600;
}

.neutral-text {
  color: #64748b;
  font-weight: 500;
}
</style>
