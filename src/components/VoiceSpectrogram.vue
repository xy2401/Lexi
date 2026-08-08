<script setup lang="ts">
/** 人声录音的波形、FFT 频谱和时间轴。 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import WaveSurfer from 'wavesurfer.js'
import Spectrogram from 'wavesurfer.js/dist/plugins/spectrogram.esm.js'
import Timeline from 'wavesurfer.js/dist/plugins/timeline.esm.js'

const props = defineProps<{
  audio?: Blob | null
  compact?: boolean
}>()

const container = ref<HTMLElement | null>(null)
const ready = ref(false)
const duration = ref(0)
const playing = ref(false)

let wavesurfer: WaveSurfer | null = null
let audioUrl: string | null = null
let audioContext: AudioContext | null = null
let loadSequence = 0

function getAudioContext(): AudioContext {
  if (!audioContext) audioContext = new AudioContext()
  return audioContext
}

async function trimLeadingSilence(blob: Blob): Promise<Blob> {
  const context = getAudioContext()
  const audioBuffer = await context.decodeAudioData(await blob.arrayBuffer())
  const samples = audioBuffer.getChannelData(0)
  const frameSize = Math.floor(audioBuffer.sampleRate * 0.01)
  let startSample = 0

  for (let i = 0; i < samples.length - frameSize; i += frameSize) {
    let sum = 0
    for (let j = 0; j < frameSize; j++) sum += samples[i + j] * samples[i + j]
    if (Math.sqrt(sum / frameSize) > 0.01) {
      startSample = Math.max(0, i - Math.floor(audioBuffer.sampleRate * 0.05))
      break
    }
  }

  if (startSample === 0) return blob
  return encodeWav(samples.subarray(startSample), audioBuffer.sampleRate)
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let i = 0, offset = 44; i < samples.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

function destroyWave(): void {
  wavesurfer?.destroy()
  wavesurfer = null
  if (audioUrl) URL.revokeObjectURL(audioUrl)
  audioUrl = null
  ready.value = false
  duration.value = 0
  playing.value = false
}

function createWave(containerElement: HTMLElement): WaveSurfer {
  const instance = WaveSurfer.create({
    container: containerElement,
    height: props.compact ? 36 : 48,
    waveColor: '#4a90d9',
    progressColor: '#256fa9',
    cursorColor: '#777',
    barWidth: 2,
    barGap: 1,
    plugins: [
      Spectrogram.create({
        labels: true,
        height: props.compact ? 100 : 150,
        scale: 'mel',
        colorMap: 'roseus',
      }),
      Timeline.create({
        height: props.compact ? 16 : 18,
        timeInterval: 0.5,
        primaryLabelInterval: 1,
        style: { fontSize: '10px', color: '#888' },
      }),
    ],
  })
  instance.on('ready', () => {
    ready.value = true
    duration.value = instance.getDuration()
  })
  instance.on('play', () => { playing.value = true })
  instance.on('pause', () => { playing.value = false })
  instance.on('finish', () => { playing.value = false })
  return instance
}

watch(() => props.audio, async blob => {
  const requestId = ++loadSequence
  destroyWave()
  if (!blob) return

  await nextTick()
  if (requestId !== loadSequence || !container.value) return
  wavesurfer = createWave(container.value)

  let displayBlob = blob
  try {
    displayBlob = await trimLeadingSilence(blob)
  } catch {
    // 某些移动端不能用 AudioContext 解码 MediaRecorder 格式，保留原录音展示。
  }
  if (requestId !== loadSequence || !wavesurfer) return
  audioUrl = URL.createObjectURL(displayBlob)
  await wavesurfer.load(audioUrl)
}, { immediate: true })

function playPause(): void {
  wavesurfer?.playPause()
}

onBeforeUnmount(() => {
  loadSequence++
  destroyWave()
  if (audioContext) void audioContext.close()
})
</script>

<template>
  <div :class="['voice-spectrogram', { compact }]">
    <div class="spectrum-header">
      <h4>我的录音频谱</h4>
      <span class="duration" v-if="ready">{{ duration.toFixed(2) }}s</span>
      <button class="play-btn" v-if="ready" @click="playPause">
        {{ playing ? '⏸ 暂停' : '▶ 播放' }}
      </button>
    </div>
    <div ref="container" class="ws-container"></div>
    <p class="placeholder" v-if="!audio">完成录音后自动显示波形和频谱</p>
  </div>
</template>

<style scoped>
.voice-spectrogram {
  position: relative;
}

.spectrum-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.spectrum-header h4 {
  margin: 0;
  color: #555;
  font-size: 0.9rem;
}

.duration {
  padding: 1px 6px;
  border-radius: 3px;
  background: #f0f6ff;
  color: #3279b5;
  font-size: 0.7rem;
  font-weight: 600;
}

.play-btn {
  padding: 2px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f8f8f8;
  cursor: pointer;
  font-size: 0.7rem;
}

.ws-container {
  min-height: 220px;
  overflow: hidden;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
}

.compact .ws-container {
  min-height: 160px;
}

.placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: 0;
  transform: translate(-50%, -50%);
  color: #aaa;
  font-size: 0.78rem;
  text-align: center;
  pointer-events: none;
}
</style>
