import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { ALLOWED_LAYOUTS, getSchemaConformanceErrors } from '../slideContentSchema'
import samplesManifest from '../../../samples/manifest.json'
import type { PresentationData } from '../types'

const projectRoot = resolve(import.meta.dirname, '../../..')

describe('ALLOWED_LAYOUTS', () => {
  it('SlideRendererが対応する5種のlayoutを含む', () => {
    expect(ALLOWED_LAYOUTS.sort()).toEqual(['bleed', 'center', 'content', 'custom', 'two-column'])
  })
})

describe('getSchemaConformanceErrors', () => {
  // manifest 駆動なので、ロケールを増やしたら自動で検証対象になる
  it.each(samplesManifest.packages)('配布サンプル（$locale）は0エラーである', ({ slides }) => {
    const data = JSON.parse(readFileSync(resolve(projectRoot, samplesManifest.source, slides), 'utf-8')) as PresentationData
    expect(getSchemaConformanceErrors(data)).toEqual([])
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

  it('tiles.icon はenum固定を撤廃しているため任意のアイコン名でもエラーにしない（アドオン/ブランド提供アイコンの参照を許容・#201）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', tiles: [{ icon: 'CustomBrandIcon', title: 't', description: 'd' }] } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('tileColumns が数値でない場合エラーにする', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', tileColumns: '3', tiles: [{ icon: 'Description', title: 't', description: 'd' }] } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.tileColumns')
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

  it('content.bodyが文字列でない場合エラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', body: 123 } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.body')
  })

  it('content.itemsのネストした項目の型不一致もエラーにする（#193 contentItemの再帰参照）', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', items: [{ text: 'ok', items: [{ text: 123 }] }] } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.items[0].items[0].text')
  })

  it('content.body/itemsは正常な指定であればエラーにしない', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', body: '本文', items: [{ text: '項目', emphasis: true, items: [{ text: '子項目' }] }] } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.imagesの正常な指定はエラーにしない（#198 画像スライド）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', images: [{ src: 'image/shot.png', alt: '説明', caption: 'キャプション' }] } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.images[].srcが文字列でない場合エラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', images: [{ src: 123 }] } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.images[0].src')
  })

  it('content.chartの正常な指定はエラーにしない（#204 チャート）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [
        { id: 's1', layout: 'content', content: { title: 'x', chart: { type: 'bar', unit: '%', categories: ['Q1'], series: [{ name: '今期', values: [42], color: 'series3' }], legend: true, valueLabels: false, min: 0, max: 100 } } },
        { id: 's2', layout: 'content', content: { title: 'x', chart: { type: 'kpi', label: 'MAU', value: 128400, delta: '+18.2%', trend: [1, 2, 3], color: 'series2' } } },
        { id: 's3', layout: 'content', content: { title: 'x', chart: { type: 'kpi', value: '1.2M' } } },
      ],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.chart.typeが5種以外だとエラーにする', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', chart: { type: 'radar' } } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.chart.type')
  })

  it('content.chart.series[].valuesが配列でない場合エラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', chart: { type: 'bar', series: [{ values: '42' }] } } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.chart.series[0].values')
  })

  it('content.tableの正常な指定はエラーにしない（#194 表）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [
        {
          id: 's1',
          layout: 'content',
          content: {
            title: 'x',
            table: {
              columns: [
                { label: '項目', align: 'left', width: 2 },
                { label: 'Pro', align: 'center' },
              ],
              rows: [['価格', '1,200円']],
            },
          },
        },
      ],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.table.columns[].alignがleft/center/right以外だとエラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', table: { columns: [{ label: '項目', align: 'justify' }] } } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.table.columns[0].align')
  })

  it('content.table.columnsが配列でない場合エラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', table: { columns: 'broken' } } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.table.columns')
  })

  it('未知フィールドはエラーにしない（拡張・アドオンを阻害しない）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'center', content: { title: 'x', customField: 'ok' } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })
})
