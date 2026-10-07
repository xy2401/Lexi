export const COURSE_VISUAL_PRESETS = Object.freeze([
  'spatial-viewpoint',
  'spatial-route',
  'spatial-turning',
  'spatial-distance',
  'spatial-screen',
  'spatial-dimensions',
  'spatial-shapes',
])

// Standalone SVGs are served on demand rather than bundled into the component.
export const COURSE_VISUAL_ASSETS = Object.freeze({
  'spatial-viewpoint': ['spatial-viewpoint', 'spatial-height'],
  'spatial-route': ['spatial-route'],
  'spatial-turning': ['spatial-turning'],
  'spatial-distance': ['spatial-distance', 'spatial-range'],
  'spatial-screen': ['spatial-screen'],
  'spatial-dimensions': ['spatial-plane-dimensions', 'spatial-box-dimensions'],
  'spatial-shapes': ['spatial-shapes', 'spatial-orientation', 'spatial-container'],
})

export const COURSE_SVG_SIZES = Object.freeze({
  'spatial-viewpoint': [360, 340],
  'spatial-height': [360, 250],
  'spatial-route': [360, 320],
  'spatial-turning': [360, 325],
  'spatial-distance': [360, 285],
  'spatial-range': [360, 285],
  'spatial-screen': [360, 310],
  'spatial-plane-dimensions': [360, 270],
  'spatial-box-dimensions': [360, 310],
  'spatial-shapes': [360, 165],
  'spatial-orientation': [360, 165],
  'spatial-container': [360, 165],
})
