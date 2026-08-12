import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { ALLOWED_LAYOUTS, getSchemaConformanceErrors } from '../slideContentSchema'
import { registerComponent } from '../../components/ComponentRegistry'
import { registerDefaultComponents } from '../../components/registerDefaults'
import samplesManifest from '../../../samples/manifest.json'
import schemaJson from '../../../schema/slide-content-schema.json'
import { MASTER_ANCHORS, MASTER_BACKGROUND_FITS, MASTER_BACKGROUND_TYPES, MASTER_DECORATION_LAYER, MASTER_DECORATION_ONLY, MASTER_DECORATION_TYPES } from '../../masters'
import type { PresentationData } from '../types'

const projectRoot = resolve(import.meta.dirname, '../../..')

// componentName/iconName の検証（#211）は ComponentRegistry の登録状態に依存するため、
// 配布サンプル・既存テストが参照する既定コンポーネント/アイコンを事前に登録しておく
beforeAll(() => {
  registerDefaultComponents()
})

describe('ALLOWED_LAYOUTS', () => {
  it('SlideRendererが対応する5種のlayoutを含む', () => {
    expect(ALLOWED_LAYOUTS.sort()).toEqual(['bleed', 'center', 'content', 'custom', 'two-column'])
  })
})

describe('マスター語彙 enum のスキーマ間ドリフト検知（#238）', () => {
  // masters.ts の実行時定数と schema/slide-content-schema.json の同名 enum は手作業で同期しているため、
  // 語彙を1つ追加してどちらか一方を更新し忘れると、このテストが落ちて修正漏れを検知する
  const masterFields = schemaJson.theme.masters.itemFields
  const decorationFields = masterFields.decorations.itemFields
  const backgroundFields = masterFields.background.fields

  it.each([
    ['decorations[].type', MASTER_DECORATION_TYPES, decorationFields.type.enum],
    ['decorations[].anchor', MASTER_ANCHORS, decorationFields.anchor.enum],
    ['decorations[].only', MASTER_DECORATION_ONLY, decorationFields.only.enum],
    ['decorations[].layer', MASTER_DECORATION_LAYER, decorationFields.layer.enum],
    ['background.type', MASTER_BACKGROUND_TYPES, backgroundFields.type.enum],
    ['background.fit', MASTER_BACKGROUND_FITS, backgroundFields.fit.enum],
  ])('%s: masters.ts の実行時定数と schema の enum が一致する', (_label, runtimeValues, schemaEnum) => {
    expect([...runtimeValues].sort()).toEqual([...schemaEnum].sort())
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

  it('tiles.iconはComponentRegistryに登録済みなら任意のアイコン名でもエラーにしない（アドオン/ブランド提供アイコンの参照を許容・#201/#211）', () => {
    registerComponent('Icon:CustomBrandIcon', () => null, 'test-brand-theme')
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', tiles: [{ icon: 'CustomBrandIcon', title: 't', description: 'd' }] } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('tiles.iconがComponentRegistryに未登録の場合はエラーにする（テーマ由来の制約違反・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', tiles: [{ icon: 'NotRegisteredIcon', title: 't', description: 'd' }] } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.tiles[0].icon')
  })

  it('tiles.accentColorがTHEME_COLOR_TOKENSにない値の場合はエラーにする（テーマ由来の制約違反・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', tiles: [{ icon: 'Description', title: 't', description: 'd', accentColor: 'purple' }] } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.tiles[0].accentColor')
  })

  it('tilesが推奨上限（8件）を超える場合はエラーにする（情報密度・#211）', () => {
    const tiles = Array.from({ length: 9 }, (_, i) => ({ icon: 'Description', title: `t${i}`, description: 'd' }))
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', tiles } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.tiles')
  })

  it('componentReference.nameがComponentRegistryに未登録の場合はエラーにする（テーマ由来の制約違反・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'custom', content: { component: { name: 'NotRegisteredComponent' } } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.component.name')
  })

  it('componentReference.nameがComponentRegistryに登録済みならエラーにしない', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'custom', content: { component: { name: 'TerminalAnimation' } } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('chart.series[].colorがTHEME_COLOR_TOKENSにない値の場合はエラーにする（テーマ由来の制約違反・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', chart: { type: 'bar', categories: ['Q1'], series: [{ name: '今期', values: [1], color: 'not-a-token' }] } } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.chart.series[0].color')
  })

  it('chart.categoriesが推奨上限（8件）を超える場合はエラーにする（情報密度・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', chart: { type: 'bar', categories: Array.from({ length: 9 }, (_, i) => `C${i}`) } } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.chart.categories')
  })

  it('table.rowsが推奨上限（10行）を超える場合はエラーにする（情報密度・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', table: { columns: [{ label: 'a' }], rows: Array.from({ length: 11 }, (_, i) => [`r${i}`]) } } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.table.rows')
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

  it('content.compareの正常な指定はエラーにしない（#200 比較）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [
        {
          id: 's1',
          layout: 'content',
          content: {
            title: 'x',
            compare: {
              left: { heading: '採用する', items: [{ text: '項目A', status: 'pass' }] },
              right: { heading: '採用しない', items: [{ text: '項目B', status: 'fail' }] },
            },
          },
        },
      ],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.compare.left.items[].statusがpass/fail/warn/neutral以外だとエラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', compare: { left: { items: [{ text: 'a', status: 'ok' }] } } } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.compare.left.items[0].status')
  })

  it('content.compare.left.itemsが推奨上限（8件）を超える場合はエラーにする（情報密度・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', compare: { left: { items: Array.from({ length: 9 }, (_, i) => ({ text: `${i}` })) } } } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.compare.left.items')
  })

  it('content.flowの正常な指定はエラーにしない（#200 横フロー）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [
        {
          id: 's1',
          layout: 'content',
          content: { title: 'x', flow: [{ title: '要件定義' }, { title: '実装', description: '本体の実装' }, { title: 'リリース' }] },
        },
      ],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.flowが推奨上限（5件）を超える場合はエラーにする（情報密度・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', flow: Array.from({ length: 6 }, (_, i) => ({ title: `工程${i}` })) } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.flow')
  })

  it('content.dateTimelineの正常な指定はエラーにしない（#206 日付タイムライン）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', dateTimeline: [{ date: '2026/01', title: 'マイルストーン1', description: '説明' }] } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.flowchartの正常な指定はエラーにしない（#206 フローチャート）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [
        {
          id: 's1',
          layout: 'content',
          content: {
            title: 'x',
            flowchart: {
              nodes: [
                { id: 'start', label: '開始', shape: 'start' },
                { id: 'check', label: '判定', shape: 'decision' },
                { id: 'end', label: '終了', shape: 'end' },
              ],
              edges: [
                { from: 'start', to: 'check' },
                { from: 'check', to: 'end' },
              ],
            },
          },
        },
      ],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('structureNode.shapeがstart/process/decision/end以外だとエラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', flowchart: { nodes: [{ id: 'a', shape: 'terminator' }] } } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.flowchart.nodes[0].shape')
  })

  it('content.swimlaneの正常な指定はエラーにしない（#206 スイムレーン）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [
        {
          id: 's1',
          layout: 'content',
          content: {
            title: 'x',
            swimlane: {
              phases: ['設計', '実装'],
              lanes: [{ title: 'PM', nodes: [{ id: 'a', label: '要件定義', col: 0 }] }],
              connections: [{ from: 'a', to: 'a' }],
            },
          },
        },
      ],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.ganttの正常な指定はエラーにしない（#206 ガント）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [
        {
          id: 's1',
          layout: 'content',
          content: { title: 'x', gantt: { axis: ['1月', '2月'], tasks: [{ label: '設計', startCol: 0, span: 1, color: 'series1' }] } },
        },
      ],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.gantt.tasks[].colorがTHEME_COLOR_TOKENSにない値の場合はエラーにする（テーマ由来の制約違反・#211）', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', gantt: { tasks: [{ label: '設計', startCol: 0, color: 'not-a-token' }] } } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.gantt.tasks[0].color')
  })

  it('content.tocの正常な指定はエラーにしない（#195 目次）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [
        { id: 's1', layout: 'content', content: { title: 'x', toc: {} } },
        { id: 's2', layout: 'content', content: { title: 'x', toc: { numberFormat: '{sectionNumber:02}', columns: 2 } } },
        { id: 's3', layout: 'content', content: { title: 'x', toc: { items: [{ number: '01', title: '導入', page: 3 }] } } },
      ],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })

  it('content.toc.itemsが配列でない場合エラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', toc: { items: 'broken' } } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.toc.items')
  })

  it('content.toc.itemsが推奨上限（12件）を超える場合はエラーにする（情報密度・#211）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', toc: { items: Array.from({ length: 13 }, (_, i) => ({ title: `章${i}`, page: i + 1 })) } } }],
    }
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.toc.items')
  })

  it('content.toc.columnsが数値でない場合エラーにする', () => {
    const data = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'content', content: { title: 'x', toc: { columns: '2' } } }],
    } as unknown as PresentationData
    const errors = getSchemaConformanceErrors(data)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe('slides[0].content.toc.columns')
  })

  it('未知フィールドはエラーにしない（拡張・アドオンを阻害しない）', () => {
    const data: PresentationData = {
      meta: { title: 't' },
      slides: [{ id: 's1', layout: 'center', content: { title: 'x', customField: 'ok' } }],
    }
    expect(getSchemaConformanceErrors(data)).toEqual([])
  })
})
