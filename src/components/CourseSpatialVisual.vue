<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CourseSvg from './CourseSvg.vue'
import { useMediaQuery } from '../composables/useMediaQuery'
import { motionPose, relativeDirections, type Facing, type SpatialMotion } from '../lib/spatial-geometry'
import type { CourseVisualPreset } from '../lib/course-visuals'
import type { CourseSvgBinding } from '../lib/course-svg'

const props = defineProps<{ preset: CourseVisualPreset }>()
const titles: Record<CourseVisualPreset, string> = {
  'spatial-viewpoint': '位置要先确定参照视角',
  'spatial-route': '把方向和地标连成一条路线',
  'spatial-turning': '看清移动和转向的过程',
  'spatial-distance': '距离与范围问的是不同问题',
  'spatial-screen': '屏幕里的上下、左右与四角',
  'spatial-dimensions': '沿着测量箭头读尺寸',
  'spatial-shapes': '形状、朝向和内外分别描述什么',
}
const interactive = computed(() => ['spatial-viewpoint', 'spatial-turning'].includes(props.preset))
const facing = ref<Facing>('up')
const viewpointReady = ref(false)
const turningReady = ref(false)
const directions: { value: Facing; label: string; angle: number }[] = [
  { value: 'up', label: '朝上 ↑', angle: 0 },
  { value: 'right', label: '朝右 →', angle: 90 },
  { value: 'down', label: '朝下 ↓', angle: 180 },
  { value: 'left', label: '朝左 ←', angle: 270 },
]
const sides = [
  { direction: 'up', x: 180, y: 55, labelX: 180, labelY: 18, landmark: 'A' },
  { direction: 'right', x: 300, y: 165, labelX: 300, labelY: 125, landmark: 'B' },
  { direction: 'down', x: 180, y: 275, labelX: 180, labelY: 309, landmark: 'C' },
  { direction: 'left', x: 60, y: 165, labelX: 60, labelY: 125, landmark: 'D' },
] as const
const relationLabels = { front: '前方', back: '后方', left: '左侧', right: '右侧' }
const screenLabels = { up: '画面上方', right: '画面右侧', down: '画面下方', left: '画面左侧' }
const relations = computed(() => relativeDirections(facing.value))
function relationAt(direction: Facing) {
  return (Object.keys(relations.value) as (keyof typeof relationLabels)[]).find(relation => relations.value[relation] === direction)!
}
const facingAngle = computed(() => directions.find(direction => direction.value === facing.value)!.angle)
const frontTarget = computed(() => sides.find(side => side.direction === relations.value.front)!)
const facingExplanation = computed(() => `人物朝${screenLabels[facing.value]}：前方在${screenLabels[relations.value.front]}，后方在${screenLabels[relations.value.back]}；人物的左侧在${screenLabels[relations.value.left]}，右侧在${screenLabels[relations.value.right]}。`)
const viewpointBindings = computed<CourseSvgBinding[]>(() => [
  { selector: '[data-part="front-arrow"]', attributes: { x2: 180 + (frontTarget.value.x - 180) * .65, y2: 165 + (frontTarget.value.y - 165) * .65 } },
  { selector: '.viewpoint-person', attributes: { transform: `translate(180 165) rotate(${facingAngle.value})` } },
  ...sides.flatMap(side => {
    const selector = `[data-screen-position="${side.direction}"]`
    const relation = relationAt(side.direction)
    return [
      { selector, attributes: { 'data-relation': relation } },
      { selector: `${selector} .label`, text: relation },
      { selector: `${selector} .sublabel`, text: relationLabels[relation] },
    ]
  }),
])

const motion = ref<SpatialMotion>('straight')
const motions: { value: SpatialMotion; label: string; english: string; explanation: string }[] = [
  { value: 'straight', label: '直行', english: 'go straight', explanation: '朝向不变，沿前方直线移动。' },
  { value: 'left', label: '左转', english: 'turn left', explanation: '先向前，再向人物自己的左侧转 90°。' },
  { value: 'right', label: '右转', english: 'turn right', explanation: '先向前，再向人物自己的右侧转 90°。' },
  { value: 'clockwise', label: '顺时针', english: 'clockwise', explanation: '从画面上方出发，依次经过右、下、左，回到起点。' },
  { value: 'counterclockwise', label: '逆时针', english: 'counterclockwise', explanation: '从画面上方出发，依次经过左、下、右，回到起点。' },
]
const selectedMotion = computed(() => motions.find(item => item.value === motion.value)!)
const circularMotion = computed(() => motion.value === 'clockwise' || motion.value === 'counterclockwise')
const paths: Record<SpatialMotion, string> = {
  straight: 'M180 260 V80',
  left: 'M180 260 V170 H70',
  right: 'M180 260 V170 H290',
  clockwise: 'M180 82 A88 88 0 1 1 180 258 A88 88 0 1 1 180 82',
  counterclockwise: 'M180 82 A88 88 0 1 0 180 258 A88 88 0 1 0 180 82',
}
const progress = ref(0)
const playing = ref(false)
const played = ref(false)
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const pose = computed(() => motionPose(motion.value, progress.value))
const start = computed(() => motionPose(motion.value, 0))
const end = computed(() => motionPose(motion.value, 1))
const motionBindings = computed<CourseSvgBinding[]>(() => [
  { selector: '[data-part="motion-path"]', attributes: { d: paths[motion.value] } },
  { selector: '[data-part="circular-landmark"]', attributes: { visibility: circularMotion.value ? 'visible' : 'hidden' } },
  { selector: '[data-part="motion-start"]', attributes: { cx: start.value.x, cy: start.value.y } },
  { selector: '[data-part="motion-end"]', attributes: { cx: end.value.x, cy: end.value.y, visibility: circularMotion.value ? 'hidden' : 'visible' } },
  { selector: '.motion-person', attributes: { 'data-progress': progress.value, transform: `translate(${pose.value.x} ${pose.value.y}) rotate(${pose.value.angle})` } },
])
let frame: number | undefined

function stopAnimation() {
  if (frame !== undefined) window.cancelAnimationFrame(frame)
  frame = undefined
  playing.value = false
}
function selectMotion(value: SpatialMotion) {
  stopAnimation()
  motion.value = value
  progress.value = 0
  played.value = false
}
function play() {
  stopAnimation()
  played.value = true
  progress.value = 0
  if (reducedMotion.value) {
    progress.value = 1
    return
  }
  playing.value = true
  let began: number | undefined
  const step = (timestamp: number) => {
    began ??= timestamp
    progress.value = Math.min(1, (timestamp - began) / 2000)
    if (progress.value < 1) frame = window.requestAnimationFrame(step)
    else { frame = undefined; playing.value = false }
  }
  frame = window.requestAnimationFrame(step)
}
watch(reducedMotion, reduced => {
  if (reduced && playing.value) { stopAnimation(); progress.value = 1 }
})
onBeforeUnmount(stopAnimation)
</script>

<template>
  <figure class="course-spatial-visual" :data-preset="preset">
    <figcaption><strong>{{ titles[preset] }}</strong><span class="visual-kind">{{ interactive ? '可操作图示' : '图解' }}</span></figcaption>

    <template v-if="preset === 'spatial-viewpoint'">
      <p class="visual-intro">地标 A–D 固定，只改变人物朝向。蓝色箭头表示人物的前方。</p>
      <div class="visual-controls" role="group" aria-label="人物朝向">
        <button v-for="direction in directions" :key="direction.value" type="button" :disabled="!viewpointReady" :aria-pressed="facing === direction.value" @click="facing = direction.value">{{ direction.label }}</button>
      </div>
      <div class="visual-panels">
        <div class="visual-panel">
          <p class="panel-title">俯视图 · 人物的前后左右</p>
          <CourseSvg asset="spatial-viewpoint" :bindings="viewpointBindings" :label="facingExplanation" @ready="viewpointReady = $event" />
          <p class="visual-note">画面上方是绘图方向，不表示真实高度。</p>
        </div>
        <div class="visual-panel">
          <p class="panel-title">侧视图 · 相对高度</p>
          <CourseSvg asset="spatial-height" />
          <p class="visual-note">以上下高度为参照，和人物面朝哪里分开看。</p>
        </div>
      </div>
      <p class="visual-explanation" aria-live="polite">{{ facingExplanation }}</p>
    </template>

    <template v-else-if="preset === 'spatial-route'">
      <CourseSvg asset="spatial-route" />
      <p class="visual-explanation">从起点朝画面上方前进，到路口再右转。图书馆帮助确认转弯位置；出口是终点。</p>
    </template>

    <template v-else-if="preset === 'spatial-turning'">
      <div class="visual-controls" role="group" aria-label="移动方式">
        <button v-for="item in motions" :key="item.value" type="button" :disabled="!turningReady" :aria-pressed="motion === item.value" @click="selectMotion(item.value)">{{ item.label }}</button>
      </div>
      <p class="motion-name">{{ selectedMotion.english }} <span>· {{ selectedMotion.label }}</span></p>
      <CourseSvg asset="spatial-turning" :bindings="motionBindings" :label="`${selectedMotion.english}：${selectedMotion.explanation}`" @ready="turningReady = $event" />
      <div class="play-row"><button type="button" class="play-button" :disabled="playing || !turningReady" @click="play">{{ playing ? '演示中…' : played ? '重播' : '播放演示' }}</button><span class="visual-note">{{ reducedMotion ? '已减少动态效果，直接显示终点' : '每次约 2 秒' }}</span></div>
      <p class="visual-explanation" aria-live="polite">{{ selectedMotion.explanation }}{{ circularMotion ? '起点与终点重合，箭头表示绕行方向。' : '' }}{{ playing ? ' 正在演示。' : played ? ' 演示完成。' : '' }}</p>
    </template>

    <template v-else-if="preset === 'spatial-distance'">
      <div class="visual-panels">
        <div class="visual-panel">
          <p class="panel-title">两点之间：直线与实际路线</p>
          <CourseSvg asset="spatial-distance" />
          <p class="visual-note">虚线：straight-line distance · 100 m<br>蓝色路线：walking distance · 140 m</p>
        </div>
        <div class="visual-panel">
          <p class="panel-title">从参照点划定范围</p>
          <CourseSvg asset="spatial-range" />
          <p class="visual-note">这里比较的是到中心点的距离；路线长度需要另外查看。</p>
        </div>
      </div>
    </template>

    <template v-else-if="preset === 'spatial-screen'">
      <CourseSvg asset="spatial-screen" />
      <p class="visual-explanation">蓝色标记在 upper-right corner。这里以屏幕为参照；人物转身不会改变屏幕的四角。</p>
    </template>

    <template v-else-if="preset === 'spatial-dimensions'">
      <div class="visual-panels">
        <div class="visual-panel">
          <p class="panel-title">平面：length 与 width</p>
          <CourseSvg asset="spatial-plane-dimensions" />
          <p class="visual-note">本图把较长的一边命名为 length；具体材料仍以自己的标注为准。</p>
        </div>
        <div class="visual-panel">
          <p class="panel-title">盒子：width、height 与 depth</p>
          <CourseSvg asset="spatial-box-dimensions" />
          <p class="visual-note">depth 从正面向后量；页面上的斜线表示盒子的纵深。</p>
        </div>
      </div>
    </template>

    <template v-else-if="preset === 'spatial-shapes'">
      <div class="visual-panels">
        <div class="visual-panel">
          <p class="panel-title">形状 · 什么样</p>
          <CourseSvg asset="spatial-shapes" />
        </div>
        <div class="visual-panel">
          <p class="panel-title">朝向 · 怎样摆</p>
          <CourseSvg asset="spatial-orientation" />
        </div>
        <div class="visual-panel">
          <p class="panel-title">位置 · 在哪里</p>
          <CourseSvg asset="spatial-container" />
        </div>
      </div>
      <p class="visual-explanation">矩形板转动后仍是 rectangular，但朝向可以从 horizontal 变为 vertical。判断 inside / outside 时先找容器边界。</p>
    </template>
  </figure>
</template>

<style scoped>
.course-spatial-visual {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 1.4rem 0;
  padding: 1.1rem;
  border: 1px solid #dce6ee;
  border-radius: 14px;
  background: #f8fbfd;
  color: #273b4d;
  font: inherit;
  container-type: inline-size;
}
figcaption { display: flex; align-items: baseline; justify-content: space-between; gap: .6rem; margin-bottom: .7rem; font-size: .95rem; line-height: 1.5; }
.visual-kind { flex: none; color: #648096; font-size: .7rem; }
.course-spatial-visual .visual-intro,
.course-spatial-visual .visual-note { margin: .5rem 0; color: #63788b; font-size: .8rem; line-height: 1.7; }
.course-spatial-visual .visual-explanation { margin: .9rem 0 0; color: #3c586d; font-size: .85rem; line-height: 1.8; }
.course-spatial-visual .panel-title { margin: 0 0 .4rem; color: #526c80; font-size: .8rem; font-weight: 600; line-height: 1.6; }
.visual-controls { display: flex; flex-wrap: wrap; gap: .45rem; margin: .8rem 0; }
.visual-controls button,
.play-button { min-height: 40px; padding: .4rem .75rem; border: 1px solid #cbdbe6; border-radius: 8px; background: #fff; color: #416078; font: inherit; font-size: .8rem; cursor: pointer; }
.visual-controls button[aria-pressed="true"] { border-color: #2585bd; background: #e6f3fb; color: #166491; font-weight: 600; }
button:hover { border-color: #2585bd; }
button:focus-visible { outline: 3px solid #8ac4e6; outline-offset: 2px; }
button:disabled { cursor: default; opacity: .6; }
.visual-panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: .8rem; }
.visual-panel { box-sizing: border-box; min-width: 0; padding: .65rem; border: 1px solid #e4ebf1; border-radius: 10px; background: #fff; }
.course-spatial-visual .motion-name { margin: .8rem 0 0; color: #166491; font-size: .9rem; font-weight: 600; text-align: center; }
.motion-name span { color: #63788b; font-weight: 400; }
.play-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: .75rem; margin-top: .5rem; }
.play-button { background: #2585bd; border-color: #2585bd; color: #fff; }
@container (max-width: 360px) {
  figcaption { align-items: flex-start; }
  .visual-controls button { flex: 1 0 auto; }
  .visual-panel { padding: .45rem; }
}
@media (max-width: 767.98px) {
  .course-spatial-visual { padding: .8rem; }
  .visual-controls button, .play-button { min-height: 44px; }
}
</style>
