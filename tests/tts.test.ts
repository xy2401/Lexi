import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTTS } from '../src/composables/useTTS'

class MockUtterance {
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  onboundary: ((event: { name: string; charIndex: number; charLength: number }) => void) | null = null

  constructor(public text: string) {}
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'speechSynthesis')
  Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance')
})

describe('TTS playback controls', () => {
  it('pauses and resumes the current utterance without cancelling it', () => {
    const current = { utterance: null as MockUtterance | null }
    const synth = {
      getVoices: () => [{ name: 'Test English', lang: 'en-US' } as SpeechSynthesisVoice],
      addEventListener: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn((utterance: MockUtterance) => {
        current.utterance = utterance
        utterance.onstart?.()
      }),
    }
    Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: synth })
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: MockUtterance })

    const tts = useTTS()
    tts.speak('A paragraph to read.')
    expect(tts.speaking.value).toBe(true)
    expect(tts.paused.value).toBe(false)

    tts.pause()
    expect(synth.pause).toHaveBeenCalledOnce()
    expect(synth.cancel).toHaveBeenCalledOnce()
    expect(tts.speaking.value).toBe(true)
    expect(tts.paused.value).toBe(true)

    tts.resume()
    expect(synth.resume).toHaveBeenCalledOnce()
    expect(synth.cancel).toHaveBeenCalledOnce()
    expect(tts.paused.value).toBe(false)

    current.utterance?.onend?.()
    expect(tts.speaking.value).toBe(false)
    expect(tts.paused.value).toBe(false)
  })
})
