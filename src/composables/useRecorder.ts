/**
 * useRecorder - MediaRecorder 本地录音
 */
import { ref, onBeforeUnmount } from 'vue'

export function useRecorder() {
  const recording = ref(false)
  const audioBlob = ref<Blob | null>(null)
  const audioUrl = ref<string | null>(null)
  const error = ref<string | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null

  async function startRecording() {
    error.value = null
    audioBlob.value = null
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value)
      audioUrl.value = null
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(stream)
      chunks = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      mediaRecorder.onstop = () => {
        audioBlob.value = new Blob(chunks, { type: 'audio/webm' })
        audioUrl.value = URL.createObjectURL(audioBlob.value)
        recording.value = false
        cleanup()
      }

      mediaRecorder.start()
      recording.value = true
    } catch (e: any) {
      error.value = e.message || '无法访问麦克风'
      recording.value = false
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
  }

  function cleanup() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      stream = null
    }
    mediaRecorder = null
  }

  onBeforeUnmount(() => {
    stopRecording()
    cleanup()
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value)
    }
  })

  return {
    recording,
    audioBlob,
    audioUrl,
    error,
    startRecording,
    stopRecording,
  }
}
