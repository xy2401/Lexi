import { describe, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({ initialize: vi.fn(), imported: vi.fn(), render: vi.fn() }))
vi.mock('mermaid', () => {
  engine.imported()
  return { default: { initialize: engine.initialize, render: engine.render } }
})

describe('deferred course diagrams', () => {
  it('waits for a diagram request, then shares one engine initialization across requests', async () => {
    const { loadCourseDiagrams } = await import('../src/lib/course-diagrams')
    expect(engine.imported).not.toHaveBeenCalled()
    expect(engine.initialize).not.toHaveBeenCalled()
    const [first, second] = await Promise.all([loadCourseDiagrams(), loadCourseDiagrams()])
    expect(first).toBe(second)
    expect(engine.imported).toHaveBeenCalledOnce()
    expect(engine.initialize).toHaveBeenCalledOnce()
    await loadCourseDiagrams()
    expect(engine.initialize).toHaveBeenCalledOnce()
  })
})
