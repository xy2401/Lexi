export const COURSE_VISUAL_PRESETS: readonly [
  'spatial-viewpoint',
  'spatial-route',
  'spatial-turning',
  'spatial-distance',
  'spatial-screen',
  'spatial-dimensions',
  'spatial-shapes',
]

export type CourseSvgAsset =
  | 'spatial-viewpoint' | 'spatial-height' | 'spatial-route' | 'spatial-turning'
  | 'spatial-distance' | 'spatial-range' | 'spatial-screen'
  | 'spatial-plane-dimensions' | 'spatial-box-dimensions'
  | 'spatial-shapes' | 'spatial-orientation' | 'spatial-container'

export const COURSE_VISUAL_ASSETS: Readonly<Record<typeof COURSE_VISUAL_PRESETS[number], readonly CourseSvgAsset[]>>
export const COURSE_SVG_SIZES: Readonly<Record<CourseSvgAsset, readonly [number, number]>>
