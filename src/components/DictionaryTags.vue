<script setup lang="ts">
import { computed } from 'vue'
import { getDictionaryTagLabels } from '../stores/dict'

const props = defineProps<{
  tags: string
}>()

const labels = computed(() => getDictionaryTagLabels(props.tags))
</script>

<template>
  <div class="dictionary-tags" v-if="labels.length">
    <span class="dictionary-tag" v-for="label in labels" :key="label">
      {{ label }}
    </span>
  </div>
</template>

<style scoped>
.dictionary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.dictionary-tag {
  padding: 0.15rem 0.42rem;
  border: 1px solid #f5df9b;
  border-radius: 4px;
  background: #fef9e7;
  color: #b9770e;
  font-size: 0.75rem;
  line-height: 1.35;
  white-space: nowrap;
}
</style>
