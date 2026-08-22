<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min: number
  max: number
  side?: 'left' | 'right'
  label: string
  defaultValue?: number
}>(), {
  side: 'left',
  defaultValue: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'change-end': []
}>()

const dragging = ref(false)
let startX = 0
let startValue = 0

function clamp(value: number): number {
  return Math.round(Math.min(props.max, Math.max(props.min, value)))
}

function updateFromClientX(clientX: number) {
  const direction = props.side === 'left' ? 1 : -1
  emit('update:modelValue', clamp(startValue + (clientX - startX) * direction))
}

function stopDragging() {
  if (!dragging.value) return
  dragging.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopDragging)
  window.removeEventListener('pointercancel', stopDragging)
  document.body.classList.remove('resizing-pane')
  emit('change-end')
}

function handlePointerMove(event: PointerEvent) {
  updateFromClientX(event.clientX)
}

function startDragging(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  startX = event.clientX
  startValue = props.modelValue
  dragging.value = true
  document.body.classList.add('resizing-pane')
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopDragging)
  window.addEventListener('pointercancel', stopDragging)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const physicalDelta = event.key === 'ArrowRight' ? 16 : -16
  const direction = props.side === 'left' ? 1 : -1
  emit('update:modelValue', clamp(props.modelValue + physicalDelta * direction))
  emit('change-end')
}

function resetWidth() {
  if (props.defaultValue === undefined) return
  emit('update:modelValue', clamp(props.defaultValue))
  emit('change-end')
}

onBeforeUnmount(stopDragging)
</script>

<template>
  <button
    type="button"
    :class="['pane-resizer', { dragging }]"
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="modelValue"
    :title="`${label}；双击恢复默认宽度`"
    @pointerdown="startDragging"
    @keydown="handleKeydown"
    @dblclick="resetWidth"
  ><span aria-hidden="true"></span></button>
</template>

<style scoped>
.pane-resizer {
  position: relative;
  z-index: 8;
  width: 12px;
  min-width: 12px;
  margin: 0 -2px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.pane-resizer span {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 5px;
  width: 2px;
  border-radius: 999px;
  background: transparent;
  transition: background .15s, box-shadow .15s;
}

.pane-resizer:hover span,
.pane-resizer:focus-visible span,
.pane-resizer.dragging span {
  background: #3498db;
  box-shadow: 0 0 0 3px rgb(52 152 219 / 12%);
}

@media (max-width: 1023.98px) {
  .pane-resizer { display: none; }
}

:global(body.resizing-pane) {
  cursor: col-resize;
  user-select: none;
}
</style>
