export type ListeningWordStatus = 'idle' | 'correct' | 'wrong'

export interface ListeningWordSegment {
  kind: 'word'
  wordIndex: number
  answer: string
  value: string
  status: ListeningWordStatus
}

export interface ListeningSeparatorSegment {
  kind: 'separator'
  text: string
}

export type ListeningSegment = ListeningWordSegment | ListeningSeparatorSegment

const LISTENING_WORD = /[A-Za-z][A-Za-z'-]*/g

export function createListeningSegments(sentence: string): ListeningSegment[] {
  const segments: ListeningSegment[] = []
  let lastIndex = 0
  let wordIndex = 0

  for (const match of sentence.matchAll(LISTENING_WORD)) {
    const index = match.index || 0
    if (index > lastIndex) {
      segments.push({ kind: 'separator', text: sentence.slice(lastIndex, index) })
    }
    segments.push({
      kind: 'word',
      wordIndex,
      answer: match[0],
      value: '',
      status: 'idle',
    })
    wordIndex++
    lastIndex = index + match[0].length
  }

  if (lastIndex < sentence.length) {
    segments.push({ kind: 'separator', text: sentence.slice(lastIndex) })
  }
  return segments
}
