import { progressDb } from './progress-db'
import {
  practiceFingerprint, practiceItemId,
  type PracticeDocument, type PracticeItemState, type PracticeSession, type PracticeAnswer,
} from './course-practice'

const DAY = 86_400_000
const INTERVALS = [1, 3, 7, 14]
export function nextPracticeState(previous: PracticeItemState | undefined, versionId: string, unitId: number, document: PracticeDocument, exerciseId: string, result: PracticeAnswer): PracticeItemState {
  const exercise = document.exercises.find(item => item.id === exerciseId)!
  const fingerprint = practiceFingerprint(exercise)
  const old = previous?.fingerprint === fingerprint ? previous : undefined
  const independent = result.outcome === 'independent'
  // Same-day correction is useful practice, but is not evidence of delayed recall.
  const level = independent && old && result.answeredAt - old.updatedAt >= DAY ? Math.min(old.reviewLevel + 1, INTERVALS.length - 1) : independent ? old?.reviewLevel || 0 : 0
  return {
    id: practiceItemId(versionId, unitId, exerciseId), versionId, unitId, exerciseId, fingerprint, goalId: exercise.goalId,
    attempts: (old?.attempts || 0) + 1,
    independentCount: (old?.independentCount || 0) + Number(independent),
    lastOutcome: result.outcome,
    updatedAt: result.answeredAt,
    dueAt: independent ? result.answeredAt + INTERVALS[level] * DAY : result.answeredAt,
    reviewLevel: level,
  }
}
export async function getPracticeRecords(versionId: string, unitId: number) {
  const [items, sessions] = await Promise.all([
    progressDb.practiceItems.where('[versionId+unitId]').equals([versionId, unitId]).toArray(),
    progressDb.practiceSessions.where('[versionId+unitId]').equals([versionId, unitId]).toArray(),
  ])
  return { items, sessions: sessions.sort((a, b) => b.updatedAt - a.updatedAt) }
}
export async function savePracticeSession(session: PracticeSession, document: PracticeDocument): Promise<void> {
  // Vue's proxies cannot be stored by IndexedDB's structured clone.
  const snapshot: PracticeSession = JSON.parse(JSON.stringify(session))
  await progressDb.transaction('rw', progressDb.practiceItems, progressDb.practiceSessions, async () => {
    const stored = await progressDb.practiceSessions.get(snapshot.id)
    if (stored && stored.updatedAt > snapshot.updatedAt) return
    for (const result of snapshot.answers.slice(stored?.answers.length || 0)) {
      for (const id of new Set([result.exerciseId, ...(result.reviewFor ? [result.reviewFor] : [])])) {
        const old = await progressDb.practiceItems.get(practiceItemId(snapshot.versionId, snapshot.unitId, id))
        await progressDb.practiceItems.put(nextPracticeState(old, snapshot.versionId, snapshot.unitId, document, id, result))
      }
    }
    await progressDb.practiceSessions.put(snapshot)
  })
}
