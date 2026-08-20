import { onBeforeUnmount, onMounted, ref } from 'vue'

export const MOBILE_QUERY = '(max-width: 767.98px)'

export function useMediaQuery(query: string) {
  const matches = ref(false)
  let mql: MediaQueryList | null = null

  const onChange = (event: MediaQueryListEvent) => {
    matches.value = event.matches
  }

  onMounted(() => {
    mql = window.matchMedia(query)
    matches.value = mql.matches
    mql.addEventListener('change', onChange)
  })

  onBeforeUnmount(() => mql?.removeEventListener('change', onChange))

  return matches
}

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY)
}
