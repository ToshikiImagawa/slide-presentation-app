import { describe, expect, it } from 'vitest'
import { ALLOWED_LAYOUTS, getSchemaConformanceErrors } from '../slideContentSchema'
import defaultSlidesJa from '../default-slides-ja.json'
import defaultSlidesEn from '../default-slides-en.json'
import type { PresentationData } from '../types'

describe('ALLOWED_LAYOUTS', () => {
  it('SlideRendererが対応する5種のlayoutを含む', () => {
    expect(ALLOWED_LAYOUTS.sort()).toEqual(['bleed', 'center', 'content', 'custom', 'two-column'])
  })
})

describe('getSchemaConformanceErrors', () => {
  it('デフォルトスライド（ja/en）は0エラーである', () => {
    expect(getSchemaConformanceErrors(defaultSlidesJa as PresentationData)).toEqual([])
    expect(getSchemaConformanceErrors(defaultSlidesEn as PresentationData)).toEqual([])
  })

  it('未知のlayoutをエラーにする', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'unknown-layout', content: { title: 'x' } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].layout')
  })

  it('既知フィールドの型不一致をエラーにする（steps が配列でない）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', steps: '文字列は不正' } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.steps')
  })

  it('tiles.icon が既知アイコン以外だとエラーにする', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', tiles: [{ icon: 'NotAnIcon', title: 't', description: 'd' }] } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.tiles[0].icon')
  })

  it('center.variant が section 以外だとエラーにする', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'center', content: { title: 'x', variant: 'invalid' } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.variant')
  })

  it('未知フィールドはエラーにしない（拡張・アドオンを阻害しない）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'center', content: { title: 'x', customField: 'ok' } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })
})
