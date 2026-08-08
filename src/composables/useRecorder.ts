/**
 * useRecorder - MediaRecorder 本地录音
 */
import { ref, onBeforeUnmount } from 'vue'

export function useRecorder() {
  const recording = ref(false)
  const audioBlob = ref<Blob | null>(null)
  const error = ref<string | null>(null)
  const silenceCountdown = ref<number | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null
  let sessionId = 0
  let silenceContext: AudioContext | null = null
  let silenceSource: MediaStreamAudioSourceNode | null = null
  let silenceAnalyser: AnalyserNode | null = null
  let silenceTimer: number | null = null

  const SILENCE_THRESHOLD = 0.015
  const SILENCE_WAIT_MS = 2000
  const SILENCE_COUNTDOWN_SECONDS = 3

  function cleanupStream() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      stream = null
    }
  }

  function stopSilenceMonitor() {
    if (silenceTimer !== null) window.clearInterval(silenceTimer)
    silenceTimer = null
    silenceSource?.disconnect()
    silenceAnalyser?.disconnect()
    silenceSource = null
    silenceAnalyser = null
    const context = silenceContext
    silenceContext = null
    if (context) void context.close()
    silenceCountdown.value = null
  }

  async function startSilenceMonitor(inputStream: MediaStream, currentSession: number) {
    try {
      const context = new AudioContext()
      const source = context.createMediaStreamSource(inputStream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      if (context.state === 'suspended') await context.resume()

      if (currentSession !== sessionId) {
        source.disconnect()
        analyser.disconnect()
        void context.close()
        return
      }

      silenceContext = context
      silenceSource = source
      silenceAnalyser = analyser
      const samples = new Float32Array(analyser.fftSize)
      let silentSince: number | null = performance.now()

      silenceTimer = window.setInterval(() => {
        if (currentSession !== sessionId || !recording.value) return
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        const rms = Math.sqrt(sum / samples.length)
        const now = performance.now()

        if (rms >= SILENCE_THRESHOLD) {
          silentSince = null
          silenceCountdown.value = null
          return
        }

        if (silentSince === null) silentSince = now
        const silentDuration = now - silentSince
        if (silentDuration < SILENCE_WAIT_MS) return

        const countdownElapsed = silentDuration - SILENCE_WAIT_MS
        const remaining = SILENCE_COUNTDOWN_SECONDS - Math.floor(countdownElapsed / 1000)
        if (remaining <= 0) {
          stopRecording()
        } else {
          silenceCountdown.value = remaining
        }
      }, 100)
    } catch {
      // 静音检测不可用时不影响基础录音功能。
      stopSilenceMonitor()
    }
  }

  /** 停止并丢弃当前录音，释放设备和所有临时资源。 */
  function resetRecording() {
    sessionId++
    stopSilenceMonitor()
    const recorder = mediaRecorder
    mediaRecorder = null
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    cleanupStream()
    chunks = []
    recording.value = false
    audioBlob.value = null
    error.value = null
  }

  async function startRecording() {
    resetRecording()
    const currentSession = sessionId

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('当前浏览器不支持录音')
      }

      const acquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      if (currentSession !== sessionId) {
        acquiredStream.getTracks().forEach(track => track.stop())
        return
      }

      stream = acquiredStream
      const recorder = new MediaRecorder(acquiredStream)
      mediaRecorder = recorder
      chunks = []

      recorder.ondataavailable = event => {
        if (currentSession === sessionId && event.data.size > 0) chunks.push(event.data)
      }

      recorder.onstop = () => {
        if (currentSession !== sessionId) return
        stopSilenceMonitor()
        const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm'
        audioBlob.value = new Blob(chunks, { type: mimeType })
        recording.value = false
        if (mediaRecorder === recorder) mediaRecorder = null
        cleanupStream()
      }

      recorder.start()
      recording.value = true
      void startSilenceMonitor(acquiredStream, currentSession)
    } catch (e: any) {
      if (currentSession !== sessionId) return
      error.value = e.message || '无法访问麦克风'
      recording.value = false
      mediaRecorder = null
      stopSilenceMonitor()
      cleanupStream()
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      stopSilenceMonitor()
      mediaRecorder.stop()
    }
  }

  onBeforeUnmount(() => {
    resetRecording()
  })

  return {
    recording,
    audioBlob,
    error,
    silenceCountdown,
    startRecording,
    stopRecording,
    resetRecording,
  }
}
