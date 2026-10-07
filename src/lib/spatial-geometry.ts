export type Facing = 'up' | 'right' | 'down' | 'left'
export type SpatialMotion = 'straight' | 'left' | 'right' | 'clockwise' | 'counterclockwise'

const facings: Facing[] = ['up', 'right', 'down', 'left']

export function relativeDirections(facing: Facing) {
  const index = facings.indexOf(facing)
  return {
    front: facings[index],
    back: facings[(index + 2) % 4],
    left: facings[(index + 3) % 4],
    right: facings[(index + 1) % 4],
  }
}

export function motionPose(motion: SpatialMotion, progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  if (motion === 'clockwise' || motion === 'counterclockwise') {
    const angle = (motion === 'clockwise' ? 1 : -1) * t * Math.PI * 2
    return { x: 180 + 88 * Math.sin(angle), y: 170 - 88 * Math.cos(angle), angle: angle * 180 / Math.PI + (motion === 'clockwise' ? 90 : -90) }
  }
  if (motion === 'straight') return { x: 180, y: 260 - 180 * t, angle: 0 }
  const direction = motion === 'right' ? 1 : -1
  if (t <= .45) return { x: 180, y: 260 - 90 * t / .45, angle: 0 }
  if (t <= .55) return { x: 180, y: 170, angle: direction * 90 * (t - .45) / .1 }
  return { x: 180 + direction * 110 * (t - .55) / .45, y: 170, angle: direction * 90 }
}

let visualInstance = 0
export function nextSpatialVisualId() {
  return `spatial-visual-${++visualInstance}`
}
