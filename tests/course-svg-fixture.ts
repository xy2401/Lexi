import fs from 'node:fs'
import path from 'node:path'
import { COURSE_SVG_SIZES, type CourseSvgAsset } from '../src/lib/course-visual-presets.mjs'

export function courseSvgFixture(asset: CourseSvgAsset): string {
  return fs.readFileSync(path.resolve('public/data/course-visuals', `${asset}.svg`), 'utf8')
}

export function courseSvgResponse(input: string): Response | undefined {
  const asset = input.match(/\/data\/course-visuals\/([a-z-]+)\.svg$/)?.[1]
  if (!asset) return undefined
  return Object.prototype.hasOwnProperty.call(COURSE_SVG_SIZES, asset)
    ? new Response(courseSvgFixture(asset as CourseSvgAsset), { headers: { 'Content-Type': 'image/svg+xml' } })
    : new Response('', { status: 404 })
}
