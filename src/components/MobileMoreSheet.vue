<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useModalInteraction } from '../composables/useModalInteraction'
import type { AppTabId } from '../lib/progress-db'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  open: boolean
  mobile: boolean
  activeId: AppTabId
  items: ReadonlyArray<{ id: AppTabId; icon: string; label: string }>
  returnFocus?: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
  select: [id: AppTabId]
}>()

const dialogRef = ref<HTMLElement | null>(null)
const modalActive = computed(() => props.open && props.mobile)

useModalInteraction({
  active: modalActive,
  container: dialogRef,
  returnFocus: toRef(props, 'returnFocus'),
  onRequestClose: () => emit('close'),
})

watch(() => props.mobile, mobile => {
  if (!mobile && props.open) emit('close')
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="more-sheet-mask" @click.self="emit('close')">
        <div
          id="mobile-more-sheet"
          ref="dialogRef"
          class="more-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="更多模块"
          tabindex="-1"
        >
          <div class="more-sheet-handle" aria-hidden="true"></div>
          <button
            v-for="tab in items"
            :key="tab.id"
            type="button"
            :class="['more-sheet-item', { active: activeId === tab.id }]"
            @click="emit('select', tab.id)"
          >
            <span class="more-sheet-icon" aria-hidden="true">{{ tab.icon }}</span>
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.more-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 950;
  display: flex;
  align-items: flex-end;
  background: rgba(15, 23, 42, 0.45);
}

.more-sheet {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  width: 100%;
  padding: 0.6rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
  border-radius: 16px 16px 0 0;
  background: #fff;
  outline: none;
}

.more-sheet-handle {
  grid-column: 1 / -1;
  width: 36px;
  height: 4px;
  margin: 0 auto 0.35rem;
  border-radius: 2px;
  background: #d5dbe1;
}

.more-sheet-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  min-height: 64px;
  padding: 0.6rem 0.25rem;
  border: 1px solid #eef1f4;
  border-radius: 10px;
  background: #fafbfc;
  color: #334155;
  font-size: 0.8rem;
  cursor: pointer;
}

.more-sheet-item.active {
  border-color: #3498db;
  background: #ebf5fc;
  color: #2476b7;
}

.more-sheet-icon {
  font-size: 1.3rem;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.22s ease;
}

.sheet-enter-active .more-sheet,
.sheet-leave-active .more-sheet {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0.24, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .more-sheet,
.sheet-leave-to .more-sheet {
  transform: translateY(100%);
}
</style>
