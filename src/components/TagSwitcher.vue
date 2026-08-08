<script setup lang="ts">
/**
 * TagSwitcher - 阅读器与词典共用的三态标签筛选器
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
  include: '选择',
  exclude: '排除',
}

function markerFor(state: TagFilterMode): string {
  // neutral 也保留相同字符宽度，只通过 visibility 隐藏。
  return state === 'exclude' ? '−' : '+'
}

function buttonLabel(tag: DictionaryTagId, label: string): string {
  const state = dictStore.tagStates[tag]
  return `${label}：${STATE_LABELS[state]}，点击切换下一状态`
}
</script>

<template>
  <div class="tag-switcher">
    <div class="filter-heading">
      <span class="label">标签筛选</span>
      <button
        :class="['reset-btn', { active: dictStore.allTagsNeutral }]"
        type="button"
        @click="dictStore.resetTagFilters"
      >
        全部
      </button>
    </div>
    <div class="state-legend" aria-hidden="true">
      <span class="include-text">+ 选择</span>
      <span class="exclude-text">− 排除</span>
      <span>无符号 默认</span>
    </div>
    <div class="levels">
      <button
        v-for="tag in TAG_OPTIONS"
        :key="tag.id"
        :class="['level-btn', `is-${dictStore.tagStates[tag.id]}`]"
        :aria-label="buttonLabel(tag.id, tag.label)"
        :data-state="dictStore.tagStates[tag.id]"
        type="button"
        @click="dictStore.cycleTagState(tag.id)"
      >
        <span>{{ tag.label }}</span>
        <span
          :class="['state-marker', { hidden: dictStore.tagStates[tag.id] === 'neutral' }]"
          aria-hidden="true"
        >{{ markerFor(dictStore.tagStates[tag.id]) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-switcher {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 0.75rem;
}

.filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.label {
  font-weight: 600;
  font-size: 0.85rem;
  color: #555;
}

.reset-btn {
  padding: 0.18rem 0.55rem;
  border: 1px solid #cfd6dc;
  border-radius: 12px;
  background: #fff;
  color: #687078;
  font-size: 0.75rem;
  cursor: pointer;
}

.reset-btn.active {
  border-color: #3498db;
  background: #ebf5fb;
  color: #2471a3;
}

.state-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.65rem;
  margin: 0.35rem 0 0.55rem;
  color: #8a939b;
  font-size: 0.68rem;
}

.include-text {
  color: #238b57;
}

.exclude-text {
  color: #c0392b;
}

.levels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.level-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid #ddd;
  border-radius: 14px;
  background: #fafafa;
  color: #555;
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s;
}

.state-marker {
  display: inline-block;
  width: 0.75em;
  flex: 0 0 0.75em;
  text-align: center;
}

.state-marker.hidden {
  visibility: hidden;
}

.level-btn.is-neutral:hover {
  border-color: #9aa4ad;
  background: #f3f5f6;
}

.level-btn.is-include {
  background: #27ae60;
  border-color: #27ae60;
  color: #fff;
}

.level-btn.is-exclude {
  background: #e74c3c;
  border-color: #e74c3c;
  color: #fff;
}
</style>
