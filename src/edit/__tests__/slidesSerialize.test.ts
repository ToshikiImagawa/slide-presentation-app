import { describe, it, expect } from 'vitest'
import { parseSlides, serializeSlides } from '../slidesSerialize'
import type { PresentationData } from '../../data/types'

// 自由記述の全類型（未知キー・HTML・空白・customCSS・props・fragment）を含むデータ
const rich = {
  meta: { title: 'デモ', description: 'x', themeColors: 'theme/colors.json' },
  theme: {
    colors: { primary: '#111', accent: '#222', custom99: '#333' },
    customCSS: '.reveal h1 {\n  color: red;\n}',
  },
  slides: [
    {
      id: 's1',
      layout: 'two-column',
      content: {
        title: 'T',
        subtitle: '<strong>強調</strong> と <br/> 改行',
        // 型定義のない未知キー（レンダラのキャストが唯一の暗黙スキーマ）
        left: { heading: 'L', paragraphs: ['a\nb', '  インデント'] },
        right: { component: { name: 'Foo', props: { data: [1, 2, 3], nested: { k: 'v' } } } },
        items: [
          { text: '項目1', fragment: true, fragmentIndex: 2 },
          { text: '項目2\n続き', emphasis: true },
        ],
        steps: [{ label: 'S1' }],
        tiles: [{ icon: 'Foo', text: 'x' }],
        codeBlock: { language: 'ts', code: 'const a = 1\n  const b = 2' },
      },
    },
  ],
}

describe('slidesSerialize', () => {
  it('未知キー・HTML・空白・customCSS・props・fragment を無損失で往復する', () => {
    const text = serializeSlides(rich as unknown as PresentationData)
    const { data, errors } = parseSlides(text)

    expect(errors).toEqual([])
    // 往復後も元データと構造的に完全一致
    expect(data).toEqual(rich)

    // 個別の自由記述が保持されていること
    const content = data.slides[0].content as Record<string, unknown>
    expect(content.left).toEqual({ heading: 'L', paragraphs: ['a\nb', '  インデント'] })
    expect(content.codeBlock).toEqual({ language: 'ts', code: 'const a = 1\n  const b = 2' })
    expect(content.steps).toEqual([{ label: 'S1' }])
    expect(content.tiles).toEqual([{ icon: 'Foo', text: 'x' }])
    expect(data.theme?.customCSS).toBe('.reveal h1 {\n  color: red;\n}')
    // 文字列内 HTML の保持
    expect(content.subtitle).toBe('<strong>強調</strong> と <br/> 改行')
    // fragment 制御の保持
    const items = content.items as Array<{ text: string; fragment?: boolean; fragmentIndex?: number; emphasis?: boolean }>
    expect(items[0]).toEqual({ text: '項目1', fragment: true, fragmentIndex: 2 })
    expect(items[1]).toEqual({ text: '項目2\n続き', emphasis: true })
    // 任意 component props（ネスト・配列）の保持
    const right = content.right as { component: { props: Record<string, unknown> } }
    expect(right.component.props).toEqual({ data: [1, 2, 3], nested: { k: 'v' } })
  })

  it('スペース2インデント・キー順保持で冪等にシリアライズする', () => {
    const text = serializeSlides(rich as unknown as PresentationData)

    // 2スペースインデント
    expect(text).toContain('\n  "meta"')
    // キー順保持（meta が slides より先＝入力順のまま）
    expect(text.indexOf('"meta"')).toBeLessThan(text.indexOf('"slides"'))

    // 冪等性: 再パース → 再シリアライズで不変（編集していないフィールドが差分化しない）
    const { data } = parseSlides(text)
    expect(serializeSlides(data)).toBe(text)
  })

  it('JSON 構文エラーは例外を投げず構造化エラーとして返す', () => {
    const { data, errors } = parseSlides('{ "meta": { "title": "x" }, ')

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].path).toBe('')
    expect(errors[0].message).toContain('JSON 構文エラー')
    // data は例外を投げず空の器を返す
    expect(data.slides).toEqual([])
  })

  it('スキーマ検証エラー（破損データ）は errors で通知し例外を投げない', () => {
    // id 欠落
    const { errors } = parseSlides(JSON.stringify({ meta: { title: 't' }, slides: [{ layout: 'center', content: {} }] }))

    expect(errors.some((e) => e.path.includes('id'))).toBe(true)
  })

  it('スキーマ検証エラー時も data は入力そのものを返す（default へフォールバックしない・FR-005）', () => {
    // id 欠落だが構文的には妥当なデータ。default で握りつぶさず、入力をそのまま返すこと
    const input = { meta: { title: 't' }, slides: [{ layout: 'center', content: {} }] }
    const { data, errors } = parseSlides(JSON.stringify(input))

    expect(errors.length).toBeGreaterThan(0)
    expect(data).toEqual(input)
  })
})
