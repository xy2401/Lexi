<script setup lang="ts">
/**
 * SpectrogramCompare - 声谱对比（基于 wavesurfer.js FFT 频谱）
 * 双通道：标准发音 vs 用户录音
 * 自动裁剪开头静音 + 时间轴对齐
 */
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import WaveSurfer from 'wavesurfer.js'
import Spectrogram from 'wavesurfer.js/dist/plugins/spectrogram.esm.js'
import Timeline from 'wavesurfer.js/dist/plugins/timeline.esm.js'

const props = defineProps<{
  referenceAudio?: Blob | null  // TTS 标准发音
  userAudio?: Blob | null       // 用户录音
}>()

const refContainer = ref<HTMLElement | null>(null)
const userContainer = ref<HTMLElement | null>(null)
const refReady = ref(false)
const userReady = ref(false)
const refDuration = ref(0)
const userDuration = ref(0)

let refWs: WaveSurfer | null = null
let userWs: WaveSurfer | null = null
let refUrl: string | null = null
let userUrl: string | null = null
let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

/**
 * 裁剪开头静音：找到第一个超过阈值的采样位置，从那里开始
 */
async function trimLeadingSilence(blob: Blob): Promise<Blob> {
  const ctx = getCtx()
  const arrayBuf = await blob.arrayBuffer()
  const audioBuf = await ctx.decodeAudioData(arrayBuf)
  const data = audioBuf.getChannelData(0)
  const sampleRate = audioBuf.sampleRate

  // 以 10ms 为帧扫描，找到第一个 RMS > 阈值的帧
  const frameSize = Math.floor(sampleRate * 0.01) // 10ms
  const threshold = 0.01 // 静音阈值
  let startSample = 0

  for (let i = 0; i < data.length - frameSize; i += frameSize) {
    let sum = 0
    for (let j = 0; j < frameSize; j++) {
      sum += data[i + j] * data[i + j]
    }
    const rms = Math.sqrt(sum / frameSize)
    if (rms > threshold) {
      // 往前留 50ms 缓冲
      startSample = Math.max(0, i - Math.floor(sampleRate * 0.05))
      break
    }
  }

  if (startSample === 0) return blob // 无需裁剪

  // 创建裁剪后的 AudioBuffer
  const newLength = data.length - startSample
  const trimmedBuf = ctx.createBuffer(1, newLength, sampleRate)
  const trimmedData = trimmedBuf.getChannelData(0)
  trimmedData.set(data.subarray(startSample))

  // 编码为 WAV Blob
  return encodeWav(trimmedData, sampleRate)
}

/**
 * PCM → WAV 编码
 */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function createInstance(container: HTMLElement, color: string): WaveSurfer {
  return WaveSurfer.create({
    container,
    height: 40,
    waveColor: color === 'blue' ? '#4a90d9' : '#d94a4a',
    progressColor: color === 'blue' ? '#2c6fad' : '#ad2c2c',
    cursorColor: '#999',
    barWidth: 2,
    barGap: 1,
    plugins: [
      Spectrogram.create({
        labels: true,
        height: 120,
        scale: 'mel',
        colorMap: 'roseus',
      }),
      Timeline.create({
        height: 16,
        timeInterval: 0.5,
        primaryLabelInterval: 1,
        style: {
          fontSize: '10px',
          color: '#999',
        },
      }),
    ],
  })
}

async function loadTrimmed(ws: WaveSurfer, blob: Blob, oldUrl: string | null): Promise<string | null> {
  if (oldUrl) URL.revokeObjectURL(oldUrl)
  const trimmed = await trimLeadingSilence(blob)
  const url = URL.createObjectURL(trimmed)
  ws.load(url)
  return url
}

// 监听标准发音
watch(() => props.referenceAudio, async (blob) => {
  if (!blob) return
  await nextTick()
  if (!refWs && refContainer.value) {
    refWs = createInstance(refContainer.value, 'blue')
    refWs.on('ready', () => {
      refReady.value = true
      refDuration.value = refWs?.getDuration() || 0
    })
  }
  if (refWs) {
    refUrl = await loadTrimmed(refWs, blob, refUrl)
  }
}, { immediate: true })

// 监听用户录音
watch(() => props.userAudio, async (blob) => {
  if (!blob) return
  await nextTick()
  if (!userWs && userContainer.value) {
    userWs = createInstance(userContainer.value, 'red')
    userWs.on('ready', () => {
      userReady.value = true
      userDuration.value = userWs?.getDuration() || 0
    })
  }
  if (userWs) {
    userUrl = await loadTrimmed(userWs, blob, userUrl)
  }
}, { immediate: true })

function playRef() { refWs?.playPause() }
function playUser() { userWs?.playPause() }

function formatTime(sec: number): string {
  return sec > 0 ? sec.toFixed(2) + 's' : '-'
}

onBeforeUnmount(() => {
  refWs?.destroy()
  userWs?.destroy()
  if (refUrl) URL.revokeObjectURL(refUrl)
  if (userUrl) URL.revokeObjectURL(userUrl)
  if (audioCtx) audioCtx.close()
})
</script>

<template>
  <div class="spectrogram-compare">
    <h4>声谱对比（FFT 频谱 · 自动对齐）</h4>
    <div class="canvas-group">
      <div class="channel">
        <div class="channel-header">
          <label>标准发音</label>
          <span v-if="refReady" class="duration">{{ formatTime(refDuration) }}</span>
          <button v-if="refReady" class="play-btn" @click="playRef">▶ 播放</button>
        </div>
        <div ref="refContainer" class="ws-container"></div>
        <p v-if="!referenceAudio" class="placeholder">点击「播放标准发音」生成声谱</p>
      </div>
      <div class="channel">
        <div class="channel-header">
          <label>我的录音</label>
          <span v-if="userReady" class="duration">{{ formatTime(userDuration) }}</span>
          <button v-if="userReady" class="play-btn" @click="playUser">▶ 播放</button>
        </div>
        <div ref="userContainer" class="ws-container"></div>
        <p v-if="!userAudio" class="placeholder">录音后自动显示声谱</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spectrogram-compare h4 {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: #555;
}

.canvas-group {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.channel {
  position: relative;
}

.channel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.channel-header label {
  font-size: 0.75rem;
  color: #888;
}

.duration {
  font-size: 0.7rem;
  color: #4a90d9;
  font-weight: 600;
  background: #f0f6ff;
  padding: 1px 6px;
  border-radius: 3px;
}

.play-btn {
  font-size: 0.7rem;
  padding: 2px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f8f8f8;
  cursor: pointer;
}

.play-btn:hover {
  background: #eee;
}

.ws-container {
  border: 1px solid #eee;
  border-radius: 6px;
  overflow: hidden;
  background: #fafafa;
  min-height: 60px;
}

.placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.75rem;
  color: #bbb;
  pointer-events: none;
}
</style>
