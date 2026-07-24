<script setup lang="ts">
/**
 * MorphNebula - 词族星云图
 * 以选中单词为核心，展示其词族衍生关系
 */
import { computed } from 'vue'
import { parseExchange, EXCHANGE_LABELS } from '../lib/morphology'
import type { WordEntry } from '../lib/db'

const props = defineProps<{
  entry: WordEntry | null
}>()

const emit = defineEmits<{
  'select-word': [word: string]
}>()

interface NebulaNode {
  label: string
  word: string
  angle: number
  distance: number
}

const nodes = computed<NebulaNode[]>(() => {
  if (!props.entry?.exchange) return []

  const forms = parseExchange(props.entry.exchange)
  const result: NebulaNode[] = []
  const entries = Object.entries(forms).filter(([k]) => k in EXCHANGE_LABELS && k !== '1')

  entries.forEach(([key, value], index) => {
    const angle = (index / entries.length) * Math.PI * 2 - Math.PI / 2
    result.push({
      label: EXCHANGE_LABELS[key] || key,
      word: value,
      angle,
      distance: 80 + (index % 2) * 30,
    })
  })

  return result
})

// 计算节点位置
function getNodeStyle(node: NebulaNode) {
  const x = Math.cos(node.angle) * node.distance
  const y = Math.sin(node.angle) * node.distance
  return {
    transform: `translate(${x}px, ${y}px)`,
  }
}
</script>

<template>
  <div class="morph-nebula" v-if="entry">
    <h4>词族星云</h4>
    <div class="nebula-canvas">
      <!-- 中心节点 -->
      <div class="center-node" @click="emit('select-word', entry.word)">
        {{ entry.word }}
      </div>

      <!-- 连接线 (CSS 伪元素简化) -->
      <div class="orbit-ring"></div>

      <!-- 衍生节点 -->
      <div
        v-for="node in nodes"
        :key="node.label + node.word"
        class="satellite-node"
        :style="getNodeStyle(node)"
        @click="emit('select-word', node.word)"
      >
        <span class="sat-label">{{ node.label }}</span>
        <span class="sat-word">{{ node.word }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.morph-nebula h4 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  color: #555;
}

.nebula-canvas {
  position: relative;
  width: 260px;
  height: 260px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.orbit-ring {
  position: absolute;
  width: 180px;
  height: 180px;
  border: 1px dashed #ddd;
  border-radius: 50%;
}

.center-node {
  position: absolute;
  padding: 0.5rem 1rem;
  background: #2c3e50;
  color: #fff;
  border-radius: 20px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  z-index: 2;
  transition: transform 0.15s;
}

.center-node:hover {
  transform: scale(1.1);
}

.satellite-node {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.3rem 0.6rem;
  background: #fff;
  border: 1px solid #3498db;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  z-index: 1;
}

.satellite-node:hover {
  background: #ebf5fb;
  transform: scale(1.05);
}

.sat-label {
  font-size: 0.6rem;
  color: #888;
}

.sat-word {
  font-size: 0.8rem;
  font-weight: 600;
  color: #2980b9;
}
</style>
