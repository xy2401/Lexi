<script setup lang="ts">
/**
 * TagSwitcher - 难度过滤器面板
 * 提供多档位切换，控制 <rt> 注音的显示密度
 */
import { DIFFICULTY_LEVELS, type DifficultyId } from '../stores/dict'

const model = defineModel<DifficultyId>({ required: true })
</script>

<template>
  <div class="tag-switcher">
    <label class="label">标签过滤（仅标注该级别及以上词汇）</label>
    <div class="levels">
      <button
        v-for="level in DIFFICULTY_LEVELS"
        :key="level.id"
        :class="['level-btn', { active: model === level.id }]"
        @click="model = level.id"
      >
        {{ level.label }}
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

.label {
  display: block;
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
  color: #555;
}

.levels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.level-btn {
  padding: 0.25rem 0.6rem;
  border: 1px solid #ddd;
  border-radius: 14px;
  background: #fafafa;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s;
}

.level-btn:hover {
  border-color: #3498db;
  color: #3498db;
}

.level-btn.active {
  background: #3498db;
  border-color: #3498db;
  color: #fff;
}
</style>
