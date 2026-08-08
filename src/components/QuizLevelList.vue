<script setup lang="ts">
import type { QuizDefinition } from '../lib/course-markdown'

const props = defineProps<{
  quizzes: QuizDefinition[]
  completedIds: string[]
  loadingId?: string
  unitId: number
  unitName: string
}>()

const emit = defineEmits<{
  select: [quiz: QuizDefinition]
}>()

const icons: Record<QuizDefinition['type'], string> = {
  'pronunciation-match': '🔊',
  'pronunciation-spell': '⌨️',
  'translation-choice': '译',
  'sentence-builder': '🧩',
  listening: '🎧',
  matching: '⚡',
  cloze: '✍️',
}
</script>

<template>
  <div class="quiz-level-list">
    <div class="level-summary">
      <strong>Unit {{ String(unitId).padStart(3, '0') }} · {{ unitName }}</strong>
      <span>{{ completedIds.length }} / {{ quizzes.length }} 已完成</span>
    </div>
    <button
      v-for="(quiz, index) in quizzes"
      :key="quiz.id"
      class="level-card"
      :class="{ completed: completedIds.includes(quiz.id) }"
      :disabled="loadingId === quiz.id"
      @click="emit('select', quiz)"
    >
      <span class="level-index">{{ index + 1 }}</span>
      <span class="level-icon">{{ icons[quiz.type] }}</span>
      <span class="level-copy">
        <strong>{{ quiz.title }}</strong>
        <small>{{ quiz.description }}</small>
      </span>
      <span class="level-count">{{ loadingId === quiz.id ? '加载中…' : `${quiz.itemCount} 题` }}</span>
      <span class="level-state">{{ completedIds.includes(quiz.id) ? '✓' : '›' }}</span>
    </button>
  </div>
</template>

<style scoped>
.quiz-level-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.level-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #2c3e50;
  font-size: 0.85rem;
  padding: 0 0.2rem 0.25rem;
}

.level-summary span {
  color: #888;
  font-size: 0.72rem;
}

.level-card {
  width: 100%;
  display: grid;
  grid-template-columns: 24px 36px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 0.55rem;
  padding: 0.65rem 0.7rem;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  background: #fff;
  color: #2c3e50;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}

.level-card:hover:not(:disabled) {
  border-color: #58cc02;
  background: #f8fff3;
  transform: translateY(-1px);
}

.level-card.completed {
  border-color: #b8e986;
  background: #f6fef0;
}

.level-card:disabled {
  opacity: 0.65;
  cursor: wait;
}

.level-index,
.level-count {
  color: #999;
  font-size: 0.7rem;
  white-space: nowrap;
}

.level-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #eefbd8;
  color: #3d8c00;
  font-weight: 700;
}

.level-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.level-copy strong {
  font-size: 0.86rem;
}

.level-copy small {
  color: #888;
  font-size: 0.7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-state {
  color: #58cc02;
  font-size: 1rem;
  font-weight: 700;
}

@media (max-width: 560px) {
  .level-card {
    grid-template-columns: 30px minmax(0, 1fr) auto;
  }

  .level-index,
  .level-count {
    display: none;
  }
}
</style>
