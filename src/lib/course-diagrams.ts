let loading: Promise<typeof import('mermaid')['default']> | undefined

/** Load and initialize the diagram engine only when a lesson contains a diagram. */
export function loadCourseDiagrams() {
  if (!loading) {
    loading = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose',
        fontFamily: 'inherit',
        timeline: { useMaxWidth: false },
      })
      return mermaid
    }).catch(error => {
      loading = undefined
      throw error
    })
  }
  return loading
}
