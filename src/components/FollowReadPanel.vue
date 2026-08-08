<script setup lang="ts">
/** 可复用的人声跟读录音面板；不采集或比较系统TTS。 */
import { ref, watch } from 'vue'
import { useRecorder } from '../composables/useRecorder'
import VoiceSpectrogram from './VoiceSpectrogram.vue'

const props = withDefaults(defineProps<{
  targetText: string
  active: boolean
  compact?: boolean
  disabled?: boolean
  systemLabel?: string
  systemDisabled?: boolean
}>(), {
  compact: false,
  disabled: false,
  systemLabel: '🔊 系统朗读',
  systemDisabled: false,
})

const emit = defineEmits<{
  'system-read': []
  'recording-start': []
  'recording-change': [recording: boolean]
}>()

const expanded = ref(false)
const {
  recording,
  audioBlob,
  error,
  silenceCountdown,
  startRecording,
  stopRecording,
  resetRecording,
} = useRecorder()

async function handleFollowClick(): Promise<void> {
  if (props.disabled) return
  if (recording.value) {
    stopRecording()
    return
  }
  expanded.value = true
  emit('recording-start')
  await startRecording()
}

function closeAndReset(): void {
  resetRecording()
  expanded.value = false
}

watch(recording, value => emit('recording-change', value))

watch(() => props.active, active => {
  if (!active) closeAndReset()
})

watch(() => props.disabled, disabled => {
  if (disabled) closeAndReset()
})

watch(() => props.targetText, (next, previous) => {
  if (next !== previous) closeAndReset()
})
</script>

<template>
  <div :class="['follow-read', { compact, expanded }]">
    <div class="follow-actions">
      <button
        class="system-read-btn"
        type="button"
        :disabled="systemDisabled || recording"
        @click="emit('system-read')"
      >
        {{ systemLabel }}
      </button>
      <button
        :class="['follow-toggle', { recording }]"
        type="button"
        :disabled="disabled"
        :aria-expanded="expanded"
        @click="handleFollowClick"
      >
        {{ recording ? '⏹ 停止跟读' : audioBlob ? '🎙️ 重新跟读' : '🎙️ 跟读' }}
      </button>
    </div>

    <div class="follow-body" v-if="expanded">
      <p class="recording-hint countdown" v-if="silenceCountdown !== null">
        检测到静音，{{ silenceCountdown }} 秒后自动停止
      </p>
      <p class="recording-hint" v-else-if="recording">正在录音，请开始朗读…</p>

      <p class="error-msg" v-if="error">{{ error }}</p>

      <div class="recording-result" v-if="audioBlob">
        <VoiceSpectrogram :audio="audioBlob" :compact="compact" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.follow-read {
  min-width: 0;
  padding: 0.75rem;
  border: 1px solid #e1e9e5;
  border-radius: 8px;
  background: #fbfdfc;
}

.follow-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.follow-toggle,
.system-read-btn {
  padding: 0.32rem 0.75rem;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
}

.follow-toggle {
  border: 1px solid #27ae60;
  color: #238b57;
}

.system-read-btn {
  border: 1px solid #3498db;
  color: #2878b5;
}

.follow-toggle:hover:not(:disabled) {
  background: #eaf8f0;
}

.system-read-btn:hover:not(:disabled) {
  background: #eef6fc;
}

.follow-toggle:disabled,
.system-read-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.follow-toggle.recording {
  border-color: #e74c3c;
  background: #e74c3c;
  color: #fff;
}

.follow-body {
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px solid #dceee3;
}

.recording-hint,
.error-msg {
  margin: 0;
  font-size: 0.78rem;
}

.recording-hint {
  color: #c0392b;
}

.recording-hint.countdown {
  font-weight: 600;
}

.error-msg {
  margin-top: 0.55rem;
  color: #e74c3c;
}

.recording-result {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.compact .follow-body {
  padding-top: 0.6rem;
}

@media (max-width: 720px) {
  .follow-read {
    padding: 0.65rem;
  }
}
</style>
