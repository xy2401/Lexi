import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let bodyScrollLockCount = 0
let bodyOverflowBeforeLock = ''
const activeModalLayers: symbol[] = []

function lockBodyScroll(): () => void {
  if (bodyScrollLockCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  bodyScrollLockCount++

  let released = false
  return () => {
    if (released) return
    released = true
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)
    if (bodyScrollLockCount === 0) {
      document.body.style.overflow = bodyOverflowBeforeLock
      bodyOverflowBeforeLock = ''
    }
  }
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element => !element.hidden
      && element.getAttribute('aria-hidden') !== 'true'
      && !element.closest('[inert]'))
}

function focusElement(element: HTMLElement | null | undefined): void {
  if (!element?.isConnected) return
  element.focus({ preventScroll: true })
}

export interface ModalInteractionOptions {
  active: Ref<boolean>
  container: Ref<HTMLElement | null>
  returnFocus?: Ref<HTMLElement | null | undefined>
  onRequestClose: () => void
}

/** Shared keyboard, focus, and scroll lifecycle for modal UI layers. */
export function useModalInteraction(options: ModalInteractionOptions): void {
  const layerId = Symbol('modal-layer')
  let engaged = false
  let releaseScrollLock: (() => void) | null = null
  let focusReturnTarget: HTMLElement | null = null
  let focusGeneration = 0

  function isTopLayer(): boolean {
    return activeModalLayers[activeModalLayers.length - 1] === layerId
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!engaged || !isTopLayer()) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      options.onRequestClose()
      return
    }
    if (event.key !== 'Tab') return

    const container = options.container.value
    if (!container) return
    const focusable = focusableElements(container)
    if (!focusable.length) {
      event.preventDefault()
      focusElement(container)
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const current = document.activeElement
    if (!container.contains(current)) {
      event.preventDefault()
      focusElement(event.shiftKey ? last : first)
    } else if (event.shiftKey && current === first) {
      event.preventDefault()
      focusElement(last)
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      focusElement(first)
    }
  }

  function engage(): void {
    if (engaged) return
    engaged = true
    focusGeneration++
    focusReturnTarget = options.returnFocus?.value
      || (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    releaseScrollLock = lockBodyScroll()
    activeModalLayers.push(layerId)
    document.addEventListener('keydown', handleKeydown, true)

    const generation = focusGeneration
    void nextTick(() => {
      if (!engaged || generation !== focusGeneration) return
      const container = options.container.value
      if (!container) return
      focusElement(container.querySelector<HTMLElement>('[autofocus]')
        || focusableElements(container)[0]
        || container)
    })
  }

  function disengage(restoreFocus = true): void {
    if (!engaged) return
    engaged = false
    focusGeneration++
    document.removeEventListener('keydown', handleKeydown, true)
    const layerIndex = activeModalLayers.lastIndexOf(layerId)
    if (layerIndex >= 0) activeModalLayers.splice(layerIndex, 1)
    releaseScrollLock?.()
    releaseScrollLock = null

    const target = focusReturnTarget
    focusReturnTarget = null
    if (restoreFocus) void nextTick(() => focusElement(target))
  }

  const stopWatching = watch(options.active, active => {
    if (active) engage()
    else disengage()
  }, { immediate: true, flush: 'post' })

  onBeforeUnmount(() => {
    stopWatching()
    disengage()
  })
}
