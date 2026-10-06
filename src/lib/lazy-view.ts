import { defineAsyncComponent, defineComponent, h, type Component } from 'vue'

const LoadingView = defineComponent({
  setup: () => () => h('p', { class: 'async-view-status', role: 'status' }, '正在加载…'),
})
const FailedView = defineComponent({
  setup: () => () => h('div', { class: 'async-view-status', role: 'alert' }, [
    h('p', '加载失败，请重新加载后再试。'),
    h('button', { type: 'button', onClick: () => window.location.reload() }, '重新加载'),
  ]),
})

export function defineLazyView(loader: () => Promise<{ default: Component }>) {
  return defineAsyncComponent({
    loader: () => loader().then(module => module.default),
    loadingComponent: LoadingView,
    errorComponent: FailedView,
    delay: 150,
  })
}
