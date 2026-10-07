<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { COURSE_SVG_SIZES } from '../lib/course-visual-presets.mjs'
import { loadCourseSvg, scopeCourseSvg, type CourseSvgAsset, type CourseSvgBinding } from '../lib/course-svg'
import { nextSpatialVisualId } from '../lib/spatial-geometry'

const props = defineProps<{ asset: CourseSvgAsset; bindings?: CourseSvgBinding[]; label?: string }>()
const emit = defineEmits<{ ready: [loaded: boolean] }>()
const instanceId = nextSpatialVisualId()
const container = ref<HTMLElement | null>(null)
const markup = ref('')
const failed = ref(false)
let sequence = 0

function applyBindings() {
  const svg = container.value?.querySelector('svg')
  if (!svg) return
  if (props.label) svg.setAttribute('aria-label', props.label)
  for (const binding of props.bindings || []) {
    for (const element of svg.querySelectorAll(binding.selector)) {
      for (const [name, value] of Object.entries(binding.attributes || {})) element.setAttribute(name, String(value))
      if (binding.text !== undefined) element.textContent = binding.text
    }
  }
}

async function load() {
  const request = ++sequence
  markup.value = ''
  failed.value = false
  emit('ready', false)
  try {
    const source = await loadCourseSvg(props.asset)
    if (request !== sequence) return
    markup.value = scopeCourseSvg(source, instanceId)
    await nextTick()
    if (request !== sequence) return
    applyBindings()
    emit('ready', true)
  } catch {
    if (request === sequence) failed.value = true
  }
}

watch(() => props.asset, load, { immediate: true })
watch([() => props.bindings, () => props.label], applyBindings, { flush: 'post' })
onBeforeUnmount(() => { sequence++ })
</script>

<template>
  <div class="course-svg" :data-svg-asset="asset" :style="{ aspectRatio: COURSE_SVG_SIZES[asset].join(' / ') }">
    <div v-if="markup" ref="container" class="svg-content" v-html="markup"></div>
    <div v-else class="svg-placeholder" role="status">
      <template v-if="failed"><span>图示暂时无法显示，请参考相邻文字说明。</span><button type="button" @click="load">重试图示</button></template>
      <span v-else>正在加载图示…</span>
    </div>
  </div>
</template>

<style scoped>
.course-svg { position: relative; width: 100%; max-width: 360px; margin: 0 auto; }
.svg-content, .svg-placeholder { position: absolute; inset: 0; }
.svg-content :deep(svg) { display: block; width: 100%; height: 100%; overflow: visible; }
.svg-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .6rem; padding: .5rem; color: #63788b; font-size: .8rem; text-align: center; }
.svg-placeholder button { min-height: 44px; padding: .4rem .75rem; border: 1px solid #cbdbe6; border-radius: 8px; background: #fff; color: #416078; font: inherit; cursor: pointer; }
.svg-placeholder button:focus-visible { outline: 3px solid #8ac4e6; outline-offset: 2px; }
</style>
