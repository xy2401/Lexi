/**
 * useTTS - Web Speech API 语音合成
 * 支持系统人声选择、单词级高亮
 */
import { ref, onBeforeUnmount } from 'vue'

export function useTTS() {
  const speaking = ref(false)
  const currentWordIndex = ref(-1)
  const voices = ref<SpeechSynthesisVoice[]>([])
  const selectedVoice = ref<string>('')

  // 加载可用语音
  function loadVoices() {
    if (!('speechSynthesis' in window)) return
    const v = speechSynthesis.getVoices()
    if (v.length === 0) return
    // 优先英文语音
    const en = v.filter(voice => voice.lang.startsWith('en'))
    if (en.length > 0) {
      voices.value = en
      if (!selectedVoice.value) {
        selectedVoice.value = en[0].name
      }
    }
  }

  // Chrome/Edge 首次 getVoices() 返回空数组，需要多策略兜底
  if ('speechSynthesis' in window) {
    loadVoices()
    // 用 addEventListener 避免多组件覆盖
    speechSynthesis.addEventListener('voiceschanged', loadVoices)
    // 轮询兜底：某些 Chrome 版本不触发 voiceschanged
    let retries = 0
    const timer = setInterval(() => {
      if (voices.value.length > 0 || retries > 10) {
        clearInterval(timer)
        return
      }
      loadVoices()
      retries++
    }, 200)
  }

  /**
   * 朗读文本
   * @param text 要朗读的文本
   * @param onBoundary 单词边界回调 (charIndex, charLength)
   */
  function speak(text: string, onBoundary?: (charIndex: number, charLength: number) => void) {
    if (!('speechSynthesis' in window)) return

    stop()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'

    const voice = voices.value.find(v => v.name === selectedVoice.value)
    if (voice) utterance.voice = voice

    utterance.onstart = () => { speaking.value = true }
    utterance.onend = () => {
      speaking.value = false
      currentWordIndex.value = -1
    }
    utterance.onerror = () => { speaking.value = false }

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        currentWordIndex.value = event.charIndex
        onBoundary?.(event.charIndex, event.charLength || 0)
      }
    }

    speechSynthesis.speak(utterance)
  }

  function stop() {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }
    speaking.value = false
    currentWordIndex.value = -1
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    speaking,
    currentWordIndex,
    voices,
    selectedVoice,
    speak,
    stop,
  }
}
