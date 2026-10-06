import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App, type Component } from 'vue'
import { defineLazyView } from '../src/lib/lazy-view'

let app: App | undefined
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

describe('deferred view loading', () => {
  it('passes the latest activity flag when a module finishes loading after navigation', async () => {
    let resolve!: (module: { default: Component }) => void
    const view = defineLazyView(() => new Promise(done => { resolve = done }))
    const active = ref(true)
    const host = document.createElement('div')
    document.body.append(host)
    app = createApp(defineComponent({ setup: () => () => h(view, { active: active.value }) }))
    app.mount(host)
    active.value = false
    await nextTick()
    resolve({ default: defineComponent({ props: ['active'], setup: props => () => h('p', props.active ? 'active' : 'inactive') }) })
    await vi.waitFor(() => expect(host.textContent).toBe('inactive'))
  })

  it('shows a recovery action instead of a blank view when a module fails to load', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const view = defineLazyView(async () => { throw new Error('chunk unavailable') })
    app = createApp(view)
    const onError = vi.fn()
    app.config.errorHandler = onError
    app.mount(host)
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).not.toBeNull())
    expect(host.querySelector('button')?.textContent).toBe('重新加载')
    expect(onError).toHaveBeenCalledOnce()
  })
})
