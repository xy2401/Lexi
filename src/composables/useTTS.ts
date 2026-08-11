/**
 * useTTS - Web Speech API 语音合成
 * 支持系统人声选择、单词级高亮
 */
import { ref, onBeforeUnmount, watch } from 'vue'
import { getProgressSetting, setProgressSetting } from '../lib/progress-db'

const TTS_VOICE_SETTING = 'tts.selectedVoice'
const sharedVoices = ref<SpeechSynthesisVoice[]>([])
const sharedSelectedVoice = ref('')
let voicePreferenceHydrated = false
let initializedSynth: SpeechSynthesis | null = null
let voiceRetryTimer: ReturnType<typeof setInterval> | null = null
let voiceInitialization: Promise<void> | null = null

function syncAvailableVoices(): void {
  if (!initializedSynth) return
  const available = initializedSynth.getVoices()
  if (!available.length) return
  const englishVoices = available.filter(voice => voice.lang.toLowerCase().startsWith('en'))
  sharedVoices.value = englishVoices
  if (!englishVoices.length) return
  if (!englishVoices.some(voice => voice.name === sharedSelectedVoice.value)) {
    sharedSelectedVoice.value = englishVoices[0].name
  }
}

function registerSpeechSynthesis(): void {
  if (!('speechSynthesis' in window)) return
  const synth = window.speechSynthesis
  if (initializedSynth === synth) return
  initializedSynth = synth
  syncAvailableVoices()
  synth.addEventListener('voiceschanged', syncAvailableVoices)

  let retries = 0
  voiceRetryTimer = setInterval(() => {
    if (sharedVoices.value.length > 0 || retries > 10) {
      if (voiceRetryTimer) clearInterval(voiceRetryTimer)
      voiceRetryTimer = null
      return
    }
    syncAvailableVoices()
    retries++
  }, 200)
}

function initializeVoicePreference(): Promise<void> {
  if (voiceInitialization) return voiceInitialization
  registerSpeechSynthesis()
  voiceInitialization = (async () => {
    try {
      const savedVoice = await getProgressSetting(TTS_VOICE_SETTING, '')
      if (savedVoice) sharedSelectedVoice.value = savedVoice
    } catch (cause) {
      console.warn('[TTS] 读取朗读者设置失败', cause)
    }
    voicePreferenceHydrated = true
    syncAvailableVoices()
    if (sharedSelectedVoice.value) {
      try {
        await setProgressSetting(TTS_VOICE_SETTING, sharedSelectedVoice.value)
      } catch (cause) {
        console.warn('[TTS] 保存朗读者设置失败', cause)
      }
    }
  })()
  return voiceInitialization
}

watch(sharedSelectedVoice, voice => {
  if (!voicePreferenceHydrated || !voice) return
  void setProgressSetting(TTS_VOICE_SETTING, voice).catch(cause => {
    console.warn('[TTS] 保存朗读者设置失败', cause)
  })
})

export function useTTS() {
  const speaking = ref(false)
  const paused = ref(false)
  const currentWordIndex = ref(-1)
  let playbackGeneration = 0
  const ready = initializeVoicePreference()

  /**
   * 朗读文本
   * @param text 要朗读的文本
   * @param onBoundary 单词边界回调 (charIndex, charLength)
   * @param onEnd 朗读结束回调
   */
  function speak(
    text: string,
    onBoundary?: (charIndex: number, charLength: number) => void,
    onEnd?: () => void
  ) {
    if (!('speechSynthesis' in window)) {
      onEnd?.()
      return
    }

    stop()
    const generation = playbackGeneration

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'

    const voice = sharedVoices.value.find(v => v.name === sharedSelectedVoice.value)
    if (voice) utterance.voice = voice

    utterance.onstart = () => {
      if (generation === playbackGeneration) {
        speaking.value = true
        paused.value = false
      }
    }
    utterance.onend = () => {
      if (generation !== playbackGeneration) return
      speaking.value = false
      paused.value = false
      currentWordIndex.value = -1
      onEnd?.()
    }
    utterance.onerror = () => {
      if (generation !== playbackGeneration) return
      speaking.value = false
      paused.value = false
      onEnd?.()
    }

    utterance.onboundary = (event) => {
      if (event.name === 'sentence') return
      currentWordIndex.value = event.charIndex
      onBoundary?.(event.charIndex, event.charLength || 0)
    }

    speaking.value = true
    paused.value = false
    speechSynthesis.speak(utterance)
  }

  /** Cancel the current speech and read several parts without cutting each other off. */
  function speakSequence(texts: string[], onEnd?: () => void) {
    if (!('speechSynthesis' in window)) {
      onEnd?.()
      return
    }
    const queue = texts.map(text => text.trim()).filter(Boolean)
    if (!queue.length) {
      onEnd?.()
      return
    }

    stop()
    const generation = playbackGeneration
    const voice = sharedVoices.value.find(item => item.name === sharedSelectedVoice.value)

    function playAt(index: number) {
      if (generation !== playbackGeneration || index >= queue.length) {
        if (generation === playbackGeneration) {
          speaking.value = false
          paused.value = false
          onEnd?.()
        }
        return
      }

      const utterance = new SpeechSynthesisUtterance(queue[index])
      utterance.lang = 'en-US'
      if (voice) utterance.voice = voice
      utterance.onstart = () => {
        if (generation === playbackGeneration) {
          speaking.value = true
          paused.value = false
        }
      }
      utterance.onend = () => {
        if (generation !== playbackGeneration) return
        playAt(index + 1)
      }
      utterance.onerror = () => {
        if (generation === playbackGeneration) {
          speaking.value = false
          paused.value = false
          onEnd?.()
        }
      }
      speechSynthesis.speak(utterance)
    }

    playAt(0)
  }

  function stop() {
    playbackGeneration++
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }
    speaking.value = false
    paused.value = false
    currentWordIndex.value = -1
  }

  function pause() {
    if (!speaking.value || paused.value || !('speechSynthesis' in window)) return
    speechSynthesis.pause()
    paused.value = true
  }

  function resume() {
    if (!speaking.value || !paused.value || !('speechSynthesis' in window)) return
    speechSynthesis.resume()
    paused.value = false
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    speaking,
    paused,
    currentWordIndex,
    voices: sharedVoices,
    selectedVoice: sharedSelectedVoice,
    ready,
    speak,
    speakSequence,
    pause,
    resume,
    stop,
  }
}
