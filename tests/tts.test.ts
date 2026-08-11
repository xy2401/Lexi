import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTTS } from '../src/composables/useTTS'
import { getProgressSetting, progressDb, setProgressSetting } from '../src/lib/progress-db'

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
  it('shares, restores and persists the selected voice across instances', async () => {
    await progressDb.settings.delete('tts.selectedVoice')
    await setProgressSetting('tts.selectedVoice', 'Second English')
    const current = { utterance: null as MockUtterance | null }
    const testVoices = [
      { name: 'Test English', lang: 'en-US' } as SpeechSynthesisVoice,
      { name: 'Second English', lang: 'en-GB' } as SpeechSynthesisVoice,
    ]
    const synth = {
      getVoices: () => testVoices,
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
    const secondInstance = useTTS()
    await tts.ready
    expect(tts.selectedVoice.value).toBe('Second English')
    expect(secondInstance.selectedVoice).toBe(tts.selectedVoice)

    secondInstance.selectedVoice.value = 'Test English'
    await vi.waitFor(async () => {
      expect(await getProgressSetting('tts.selectedVoice', '')).toBe('Test English')
    })

    tts.speak('A paragraph to read.')
    expect(current.utterance?.voice?.name).toBe('Test English')
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
