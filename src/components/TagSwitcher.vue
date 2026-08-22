<script setup lang="ts">
/** TagSwitcher - 四态标签筛选器，状态切换保持按钮尺寸不变。 */
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
  annotate: '标注',
}

function markerFor(state: TagFilterMode): string {
  if (state === 'include') return '✓'
  if (state === 'exclude') return '✕'
  if (state === 'annotate') return '◆'
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
      <span class="annotate-text">◆ 标注</span>
      <span class="neutral-text">· 默认</span>
    </div>
  </div>
</template>

<style scoped>
.tag-switcher-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem 0.7rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  margin-bottom: 0.75rem;
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
  gap: 0.3rem;
  flex: 1;
}

.tag-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.08rem;
  height: 1.7rem;
  padding: 0 0.42rem;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: #f8fafc;
  color: #334155;
  font-size: 0.76rem;
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

.tag-btn.is-annotate {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #fff;
}

.state-icon {
  display: inline-grid;
  place-items: center;
  width: 0.8rem;
  flex: 0 0 0.8rem;
  font-weight: 700;
  font-size: 0.78rem;
  line-height: 1;
}

.tag-btn.is-neutral .state-icon {
  color: #94a3b8;
}

.tag-btn.is-include .state-icon,
.tag-btn.is-exclude .state-icon,
.tag-btn.is-annotate .state-icon {
  color: #fff;
}

/* 快速重置按键 */
.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.12rem;
  height: 1.7rem;
  padding: 0 0.45rem;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: #fff;
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: 0.1rem;
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
  gap: 0.45rem;
  font-size: 0.7rem;
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

.annotate-text {
  color: #d97706;
  font-weight: 600;
}

.neutral-text {
  color: #64748b;
  font-weight: 500;
}

@media (max-width: 767.98px) {
  .tag-switcher-bar {
    position: sticky;
    top: var(--mobile-appbar-h);
    z-index: 30;
    display: block;
    margin: -.75rem -.75rem .75rem;
    width: calc(100% + 1.5rem);
    padding: .55rem .75rem;
    border: 0;
    border-bottom: 1px solid #e2e8f0;
    border-radius: 0;
    background: rgba(255, 255, 255, .97);
    box-shadow: none;
    backdrop-filter: blur(12px);
  }

  .filter-label,
  .legend-note {
    display: none;
  }

  .tag-buttons-group {
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: .45rem;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .tag-buttons-group::-webkit-scrollbar { display: none; }

  .tag-btn,
  .reset-btn {
    min-height: 38px;
    height: 38px;
    flex: none;
    padding-inline: .7rem;
    border-radius: 999px;
  }
}
</style>
