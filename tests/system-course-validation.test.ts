import { describe, expect, it } from 'vitest'
import { validateSystemCourseSemanticTags, validateSystemCourseVisualAssets, validateSystemCourseVisuals } from '../scripts/system-course-tools.mjs'
import { COURSE_VISUAL_PRESETS } from '../src/lib/course-visual-presets.mjs'

describe('system course author tag validation', () => {
  it('accepts complete notation, phoneme, morpheme and word tags', () => {
    const markdown = '<lexi-notation>`08/09/2026`</lexi-notation>、<lexi-phoneme>`/ə/`</lexi-phoneme>\n<lexi-morpheme kind="prefix">`un-`</lexi-morpheme>、<lexi-word form="irregular">`went`</lexi-word>'
    expect(validateSystemCourseSemanticTags(markdown)).toEqual([])
  })

  it.each([
    '<lexi-notation>`08/09/2026</lexi-notation>',
    '<lexi-notation>08/09/2026`</lexi-notation>',
    '<lexi-notation>`08/09/2026`',
    '`08/09/2026`</lexi-notation>',
    '<lexi-notation>`08/09/2026`</lexi-word>',
    '<lexi-notation>`one` `two`</lexi-notation>',
    '<lexi-notation>`one <lexi-word>two</lexi-word>`</lexi-notation>',
    '<lexi-unknown>`one`</lexi-unknown>',
  ])('reports malformed author syntax with its source line: %s', markdown => {
    expect(validateSystemCourseSemanticTags('# Title\n\n' + markdown)).toEqual([
      '第 3 行：语义标签必须配对，并包裹一个反引号完整闭合的行内代码片段',
    ])
  })

  it('ignores literal examples in fenced blocks while still checking the following prose', () => {
    const markdown = '````markdown\n<lexi-notation>`broken</lexi-notation>\n```\n<lexi-unknown>\n````\n~~~text\n</lexi-word>\n~~~\n<lexi-notation>`broken</lexi-notation>'
    expect(validateSystemCourseSemanticTags(markdown)).toEqual([
      '第 9 行：语义标签必须配对，并包裹一个反引号完整闭合的行内代码片段',
    ])
  })
})

describe('course visual reference validation', () => {
  it('registers only existing standalone SVG files with matching dimensions', () => {
    expect(validateSystemCourseVisualAssets()).toEqual([])
  })
  it('accepts all registered presets and whitespace around the name', () => {
    for (const preset of COURSE_VISUAL_PRESETS) expect(validateSystemCourseVisuals('```course-visual\n ' + preset + ' \n```')).toEqual([])
    expect(validateSystemCourseVisuals('~~~course-visual\nspatial-route\n~~~')).toEqual([])
  })
  it('rejects unknown, empty, multiple and unclosed references', () => {
    for (const source of ['unknown', '', 'spatial-route\nspatial-screen']) expect(validateSystemCourseVisuals('```course-visual\n' + source + '\n```')).toContain('course-visual 图示预设未知或包含多余内容')
    expect(validateSystemCourseVisuals('```course-visual\nspatial-route')).toContain('course-visual 图示代码块未闭合')
  })
  it('does not treat literal examples inside another fence as visual references', () => {
    expect(validateSystemCourseVisuals('````markdown\n```course-visual\nunknown\n```\n````')).toEqual([])
  })
})
