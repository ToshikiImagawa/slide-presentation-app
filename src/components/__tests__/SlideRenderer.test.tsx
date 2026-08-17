import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'

// #203: TextDiagram は mermaid を動的import（別チャンク）で読み込む（pdfExport.ts の html2canvas/jspdf と同じ手法）。
// vi.mock は dynamic import も差し替えるため、mermaid本体を読み込まずに描画経路を検証できる
const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({ svg: '<svg data-mock-diagram="true"></svg>' })),
}))
vi.mock('mermaid', () => ({ default: mermaidMock }))

import { CENTER_VARIANT_NAMES, SlideRenderer } from '../SlideRenderer'
import schemaJson from '../../../schema/slide-content-schema.json'
import { registerDefaultComponents } from '../registerDefaults'
import { getSchemaConformanceErrors } from '../../data/slideContentSchema'
import type { SlideData, ThemeData } from '../../data'
import { theme } from '../../theme'
import { expectRuntimeMatchesSchemaEnum } from '../../schemaEnumTestUtils'

// レイアウト網羅用のテストデータ。テンプレートガイドのサンプルは .spkg として外部配布するため、
// テストは自前の入力を持つ（サンプルの内容変更でテストが壊れないようにする）
const testSlides: SlideData[] = [
  {
    id: 'test-title',
    layout: 'center',
    content: { title: 'タイトルスライド', subtitle: 'サブタイトル' },
  },
  {
    id: 'test-two-column',
    layout: 'two-column',
    content: {
      title: '2カラムスライド',
      left: { heading: '左カラム', paragraphs: ['左の本文'] },
      right: { heading: '右カラム', paragraphs: ['右の本文'] },
    },
  },
  {
    id: 'test-steps',
    layout: 'content',
    content: {
      title: 'ステップスライド',
      steps: [
        { number: 1, title: '最初のステップ', description: '説明1' },
        { number: 2, title: '次のステップ', description: '説明2' },
      ],
    },
  },
  {
    id: 'test-tiles',
    layout: 'content',
    content: {
      title: 'タイルスライド',
      tiles: [
        { icon: 'Description', title: '1つ目のタイル', description: 'タイルの説明1' },
        { icon: 'Description', title: '2つ目のタイル', description: 'タイルの説明2' },
      ],
    },
  },
  {
    id: 'test-section',
    layout: 'center',
    content: { variant: 'section', title: 'セクションスライド' },
  },
  {
    id: 'test-bleed',
    layout: 'bleed',
    content: {
      title: 'ビールドスライド',
      commands: [{ text: 'npm install', color: 'green' }],
      component: { name: 'TerminalAnimation' },
    },
  },
  {
    id: 'test-custom',
    layout: 'custom',
    content: {
      component: { name: 'TerminalAnimation' },
    },
  },
]

function renderWithTheme(ui: React.ReactNode) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

/** 要素配下の DOM 構造をタグ名とclassのみで文字列化する。テキスト内容の変更に影響されない
 * 属性スナップショットとして使う。maxDepth で SlideFrame が生成する構造（section > 3層 >
 * 各レイアウトの最初のラッパー）までに絞り、MUI/子コンポーネント内部の実装詳細を含めない */
function domSkeleton(el: Element, maxDepth: number, depth = 0): string {
  const cls = el.getAttribute('class')
  const label = cls ? `${el.tagName.toLowerCase()}.${cls.split(' ').join('.')}` : el.tagName.toLowerCase()
  if (depth >= maxDepth) return `${'  '.repeat(depth)}${label}\n`
  const children = Array.from(el.children)
    .map((child) => domSkeleton(child, maxDepth, depth + 1))
    .join('')
  return `${'  '.repeat(depth)}${label}\n${children}`
}

describe('SlideRenderer', () => {
  beforeEach(() => {
    registerDefaultComponents()
    mermaidMock.render.mockReset().mockImplementation(async () => ({ svg: '<svg data-mock-diagram="true"></svg>' }))
  })

  it('テストデータで全スライドがレンダリングされる', () => {
    const { container } = renderWithTheme(<SlideRenderer slides={testSlides} />)
    const sections = container.querySelectorAll('section.slide-container')
    expect(sections.length).toBe(testSlides.length)
  })

  it('各スライドに正しいidが設定される', () => {
    const { container } = renderWithTheme(<SlideRenderer slides={testSlides} />)
    for (const slide of testSlides) {
      const section = container.querySelector(`#${slide.id}`)
      expect(section).not.toBeNull()
    }
  })

  it('centerスライドにh1要素が含まれる', () => {
    const titleSlide = testSlides[0]
    const { container } = renderWithTheme(<SlideRenderer slides={[titleSlide]} />)
    const h1 = container.querySelector('h1')
    expect(h1).not.toBeNull()
    expect(h1?.textContent).toContain(titleSlide.content.title)
  })

  it('two-columnスライドにh2タイトルが含まれる', () => {
    const contentSlide = testSlides.find((s) => s.layout === 'two-column')!
    const { container } = renderWithTheme(<SlideRenderer slides={[contentSlide]} />)
    const h2 = container.querySelector('h2.slide-title')
    expect(h2).not.toBeNull()
    expect(h2?.textContent).toBe(contentSlide.content.title)
  })

  it('contentスライド(steps)にステップが含まれる', () => {
    const workflowSlide = testSlides.find((s) => s.layout === 'content' && (s.content as Record<string, unknown>).steps)!
    const { container } = renderWithTheme(<SlideRenderer slides={[workflowSlide]} />)
    const steps = (workflowSlide.content as Record<string, unknown>).steps as Array<{ title: string }>
    for (const step of steps) {
      expect(container.textContent).toContain(step.title)
    }
  })

  it('contentスライド(tiles)にタイル情報が含まれる', () => {
    const featuresSlide = testSlides.find((s) => s.layout === 'content' && (s.content as Record<string, unknown>).tiles)!
    const { container } = renderWithTheme(<SlideRenderer slides={[featuresSlide]} />)
    const tiles = (featuresSlide.content as Record<string, unknown>).tiles as Array<{ title: string }>
    for (const tile of tiles) {
      expect(container.textContent).toContain(tile.title)
    }
  })

  // MUIのsx propはインラインstyleではなくemotionが注入する<style>タグのCSSクラスとして反映されるため、
  // 生成されたスタイル全文（document.styleSheets）に対象の宣言が含まれるかで検証する
  function injectedStylesText(): string {
    return Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('\n')
  }

  it('tileColumns未指定時、FeatureTileGridのグリッド列数がタイル数と同数になる（既定挙動が変わらない）', () => {
    renderWithTheme(
      <SlideRenderer
        slides={[
          {
            id: 'test-tiles-default-columns',
            layout: 'content',
            content: {
              tiles: [
                { icon: 'Description', title: 'A', description: 'a' },
                { icon: 'Description', title: 'B', description: 'b' },
                { icon: 'Description', title: 'C', description: 'c' },
              ],
            },
          },
        ]}
      />,
    )
    expect(injectedStylesText()).toContain('grid-template-columns: repeat(3, 1fr)')
  })

  it('tileColumns指定時、FeatureTileGridのグリッド列数がその値になる（6枚以上の折返し）', () => {
    const { container } = renderWithTheme(
      <SlideRenderer
        slides={[
          {
            id: 'test-tiles-columns',
            layout: 'content',
            content: {
              tileColumns: 3,
              tiles: Array.from({ length: 6 }, (_, i) => ({ icon: 'Description', title: `タイル${i}`, description: `説明${i}` })),
            },
          },
        ]}
      />,
    )
    expect(injectedStylesText()).toContain('grid-template-columns: repeat(3, 1fr)')
    expect(container.textContent).toContain('タイル5')
  })

  it('tiles[].accentColorで指定した系列色がアイコンAvatarに反映される', () => {
    renderWithTheme(
      <SlideRenderer
        slides={[
          {
            id: 'test-tiles-accent',
            layout: 'content',
            content: {
              tiles: [{ icon: 'Description', title: 'A', description: 'a', accentColor: 'series2' }],
            },
          },
        ]}
      />,
    )
    expect(injectedStylesText()).toContain('color: var(--theme-series-2)')
  })

  it('未登録のicon名を指定した場合、フォールバックコンポーネントが描画される', () => {
    const tilesSlide: SlideData = {
      id: 'test-tiles-unknown-icon',
      layout: 'content',
      content: {
        tiles: [{ icon: 'NoSuchIcon', title: 'A', description: 'a' }],
      },
    }
    const { container } = renderWithTheme(<SlideRenderer slides={[tilesSlide]} />)
    expect(container.textContent).toContain('Component not found')
  })

  it('centerスライド(variant: section)にタイトルが含まれる', () => {
    const summarySlide = testSlides.find((s) => s.layout === 'center' && (s.content as Record<string, unknown>).variant === 'section')!
    const { container } = renderWithTheme(<SlideRenderer slides={[summarySlide]} />)
    expect(container.textContent).toContain(summarySlide.content.title)
  })

  it('metaが指定されたスライドにdata-transition属性が設定される', () => {
    const slideWithMeta = {
      id: 'test-meta',
      layout: 'center' as const,
      content: { title: 'Test' },
      meta: { transition: 'fade' },
    }
    const { container } = renderWithTheme(<SlideRenderer slides={[slideWithMeta]} />)
    const section = container.querySelector('#test-meta')
    expect(section?.getAttribute('data-transition')).toBe('fade')
  })

  it('空のスライド配列で何もレンダリングされない', () => {
    const { container } = renderWithTheme(<SlideRenderer slides={[]} />)
    const sections = container.querySelectorAll('section')
    expect(sections.length).toBe(0)
  })

  // #163: SlideFrame への section 生成統合。全レイアウトが共通の section > .master-layer-back/.master-body/
  // .master-layer-front 構造を持つことを、リファクタ前後のDOM構造スナップショットで固定する
  // （スナップショットが一致すれば3層の存在・順序・class名も自動的に保証される）
  describe('SlideFrame統合後のDOM構造（属性スナップショット）', () => {
    it.each(testSlides.map((slide) => [slide.id, slide] as const))('%s の section 配下がスナップショットと一致する', (_id, slide) => {
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      const section = container.querySelector('section.slide-container')!
      expect(domSkeleton(section, 2)).toMatchSnapshot()
    })
  })

  describe('ロゴ（meta.logo → .slide-logo-inline）', () => {
    const logo = { src: '/logo.png', width: 100, height: 32 }

    it('logo指定時、section内側の.master-layer-frontに.slide-logo-inlineが描画される', () => {
      const { container } = renderWithTheme(<SlideRenderer slides={[testSlides[0]]} logo={logo} />)
      const section = container.querySelector('section.slide-container')!
      const logoEl = section.querySelector('.master-layer-front > .slide-logo-inline')
      expect(logoEl).not.toBeNull()
    })

    it('logo未指定時は.slide-logo-inlineが描画されない', () => {
      const { container } = renderWithTheme(<SlideRenderer slides={[testSlides[0]]} />)
      expect(container.querySelector('.slide-logo-inline')).toBeNull()
    })

    it('全レイアウトでロゴがsection内側に描画される（PDF書き出し・発表者ビュー・編集プレビューに写る前提）', () => {
      const { container } = renderWithTheme(<SlideRenderer slides={testSlides} logo={logo} />)
      const sections = container.querySelectorAll('section.slide-container')
      sections.forEach((section) => {
        expect(section.querySelector('.slide-logo-inline')).not.toBeNull()
      })
    })
  })

  // #193: contentレイアウトのプレーン本文対応（body/items）
  describe('contentスライド(body/items)', () => {
    it('bodyのみを指定すると本文テキストが描画される', () => {
      const slide: SlideData = { id: 'test-body', layout: 'content', content: { title: 'タイトル', body: '本文テキスト' } }
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      expect(container.textContent).toContain('本文テキスト')
    })

    it('itemsのみを指定すると箇条書きが描画される', () => {
      const slide: SlideData = {
        id: 'test-items',
        layout: 'content',
        content: { title: 'タイトル', items: [{ text: '項目1' }, { text: '項目2' }] },
      }
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      const listItems = container.querySelectorAll('li')
      expect(listItems.length).toBe(2)
      expect(container.textContent).toContain('項目1')
      expect(container.textContent).toContain('項目2')
    })

    it('bodyとitemsを両方指定すると両方描画される', () => {
      const slide: SlideData = {
        id: 'test-body-items',
        layout: 'content',
        content: { title: 'タイトル', body: '本文テキスト', items: [{ text: '項目1' }] },
      }
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      expect(container.textContent).toContain('本文テキスト')
      expect(container.textContent).toContain('項目1')
    })

    it('ネストしたitemsが子要素として描画される', () => {
      const slide: SlideData = {
        id: 'test-items-nested',
        layout: 'content',
        content: {
          title: 'タイトル',
          items: [{ text: '親項目', items: [{ text: '子項目1' }, { text: '子項目2' }] }],
        },
      }
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      const listItems = container.querySelectorAll('li')
      expect(listItems.length).toBe(3)
      expect(container.textContent).toContain('子項目1')
      expect(container.textContent).toContain('子項目2')
    })

    it('emphasisを指定した項目はstrongタグで描画される', () => {
      const slide: SlideData = {
        id: 'test-items-emphasis',
        layout: 'content',
        content: { title: 'タイトル', items: [{ text: '強調項目', emphasis: true }] },
      }
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      const strong = container.querySelector('li strong')
      expect(strong?.textContent).toBe('強調項目')
    })

    it('fragment/fragmentIndexを指定した項目にfragmentクラスとdata-fragment-index属性が付く', () => {
      const slide: SlideData = {
        id: 'test-items-fragment',
        layout: 'content',
        content: { title: 'タイトル', items: [{ text: '段階表示項目', fragment: true, fragmentIndex: 2 }] },
      }
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      const li = container.querySelector('li')
      expect(li?.classList.contains('fragment')).toBe(true)
      expect(li?.getAttribute('data-fragment-index')).toBe('2')
    })

    it('stepsが指定されている場合はbodyがあっても既存のTimeline描画が優先される（既存挙動の維持）', () => {
      const slide: SlideData = {
        id: 'test-steps-priority',
        layout: 'content',
        content: {
          title: 'タイトル',
          steps: [{ number: 1, title: 'ステップ1', description: '説明' }],
          body: '無視されるはずの本文',
        },
      }
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      expect(container.textContent).toContain('ステップ1')
      expect(container.textContent).not.toContain('無視されるはずの本文')
    })

    it('body/itemsのいずれも無指定の場合は何も描画されない', () => {
      const slide: SlideData = { id: 'test-empty-content', layout: 'content', content: { title: 'タイトル' } }
      const { container } = renderWithTheme(<SlideRenderer slides={[slide]} />)
      const section = container.querySelector('section.slide-container')!
      expect(section.querySelector('ul')).toBeNull()
    })
  })

  // #198: 画像スライド（content.images → ImageFigureGrid）
  describe('contentスライド(images)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-images', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('画像が枚数分figureとして描画される', () => {
      const { container } = renderContent({ images: [{ src: '/a.png' }, { src: '/b.png' }] })
      expect(container.querySelectorAll('figure').length).toBe(2)
      expect(container.querySelectorAll('figure img').length).toBe(2)
    })

    it('captionがfigcaptionとして描画される（HTMLタグも展開される）', () => {
      const { container } = renderContent({ images: [{ src: '/a.png', caption: '説明<br/>2行目' }] })
      const figcaption = container.querySelector('figcaption')
      expect(figcaption?.textContent).toBe('説明2行目')
      expect(figcaption?.querySelector('br')).not.toBeNull()
    })

    it('caption未指定の画像にはfigcaptionが描画されない', () => {
      const { container } = renderContent({ images: [{ src: '/a.png' }] })
      expect(container.querySelector('figcaption')).toBeNull()
    })

    it('altが指定した代替テキストになり、未指定なら空文字になる', () => {
      const { container } = renderContent({ images: [{ src: '/a.png', alt: '図の説明' }, { src: '/b.png' }] })
      const imgs = container.querySelectorAll('img')
      expect(imgs[0].getAttribute('alt')).toBe('図の説明')
      expect(imgs[1].getAttribute('alt')).toBe('')
    })

    // 縦横比を保った自動フィット（受け入れ基準: 縦長・横長・正方形がいずれもセーフエリア内に収まる）は、
    // 固定寸法を持たず max-* だけで親要素に収めることで成り立つ（寸法が付くと縦横比が崩れる）
    it('画像に固定寸法を付けず、縦横比を保って親要素に収める指定になる', () => {
      const { container } = renderContent({ images: [{ src: '/a.png' }] })
      const img = container.querySelector('img')!
      expect(img.style.maxWidth).toBe('100%')
      expect(img.style.maxHeight).toBe('100%')
      expect(img.style.width).toBe('')
      expect(img.style.height).toBe('')
    })

    it('グリッドの列数は画像枚数と同数になり、3枚を超えると3列で折返す', () => {
      const { container: one } = renderContent({ images: [{ src: '/a.png' }] })
      expect((one.querySelector('figure')!.parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))')

      const { container: four } = renderContent({ images: [{ src: '/a.png' }, { src: '/b.png' }, { src: '/c.png' }, { src: '/d.png' }] })
      expect((four.querySelector('figure')!.parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
    })

    it('tilesが指定されている場合はtiles描画が優先される（既存の優先順位の維持）', () => {
      const { container } = renderContent({
        tiles: [{ icon: 'Description', title: 'タイル', description: '説明' }],
        images: [{ src: '/a.png' }],
      })
      expect(container.textContent).toContain('タイル')
      expect(container.querySelector('figure')).toBeNull()
    })

    it('images指定時はbody/itemsを描画しない（画像スライドはbody/itemsより優先される）', () => {
      const { container } = renderContent({ images: [{ src: '/a.png' }], body: '描画されない本文' })
      expect(container.querySelector('figure')).not.toBeNull()
      expect(container.textContent).not.toContain('描画されない本文')
    })

    // #225: 高さの確定は「グリッド側の私的な flex:1」ではなく .content-area の fill 変種（global.css）が担う。
    // 実際の高さ解決（ラッパーが挟まった場合も含む）は e2e/content-area-fill.spec.ts が実測で担保する
    it('本文領域を埋める宣言（fill 変種）が外側の.content-areaと画像グリッドの両方に付く', () => {
      const { container } = renderContent({ images: [{ src: '/a.png' }] })
      expect(container.querySelector('.content-area')!.classList.contains('content-area-fill')).toBe(true)
      expect(container.querySelector('figure')!.parentElement!.classList.contains('content-area-fill-item')).toBe(true)
    })

    it('images以外の子（tiles）では fill 変種にならない', () => {
      const { container } = renderContent({ tiles: [{ icon: 'Description', title: 'タイル', description: '説明' }] })
      expect(container.querySelector('.content-area')!.classList.contains('content-area-fill')).toBe(false)
    })

    it('imageColumns指定時、グリッドの列数が画像枚数に関わらずその値になる（#326）', () => {
      const { container } = renderContent({ images: [{ src: '/a.png' }, { src: '/b.png' }], imageColumns: 5 })
      expect((container.querySelector('figure')!.parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))')
    })

    it('imageColumnsが範囲外（0・7）のとき1〜6に丸める（#326）', () => {
      const { container: zero } = renderContent({ images: [{ src: '/a.png' }, { src: '/b.png' }], imageColumns: 0 })
      expect((zero.querySelector('figure')!.parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))')

      const { container: seven } = renderContent({ images: [{ src: '/a.png' }, { src: '/b.png' }], imageColumns: 7 })
      expect((seven.querySelector('figure')!.parentElement as HTMLElement).style.gridTemplateColumns).toBe('repeat(6, minmax(0, 1fr))')
    })
  })

  // #326: 分類ごとに見出しを付けるグループ形（要素にimagesキーを持つ配列）
  describe('contentスライド(images グループ形)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-image-groups', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    const groups = [
      { label: 'グループA', images: [{ src: '/a.png' }, { src: '/b.png' }] },
      { label: 'グループB', images: [{ src: '/c.png' }] },
    ]

    it('グループごとに見出しが描画され、画像も枚数分描画される', () => {
      const { container } = renderContent({ images: groups })
      const headingTexts = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
      expect(headingTexts).toEqual(expect.arrayContaining(['グループA', 'グループB']))
      expect(container.querySelectorAll('figure').length).toBe(3)
    })

    it('見出しはUnderlinedHeadingを流用しており、新しい見出し部品を作っていない（h2+区切り線の組で描画される）', () => {
      const { container } = renderContent({ images: [{ label: 'グループA', images: [{ src: '/a.png' }] }] })
      const heading = Array.from(container.querySelectorAll('h2')).find((h) => h.textContent === 'グループA')!
      const divider = heading.parentElement!.querySelector('hr')
      expect(divider).not.toBeNull()
    })

    it('imageColumns未指定時、各グループの列数はそのグループの画像枚数と既定上限(3)から決まる（現行と同じ規則）', () => {
      const { container } = renderContent({ images: groups })
      const grids = container.querySelectorAll('.content-area-fill-item')
      expect(grids.length).toBe(2)
      expect((grids[0] as HTMLElement).style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
      expect((grids[1] as HTMLElement).style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))')
    })

    it('imageColumns指定時、グループ形でも全グループ共通の列数になる', () => {
      const { container } = renderContent({ images: groups, imageColumns: 5 })
      const grids = container.querySelectorAll('.content-area-fill-item')
      grids.forEach((grid) => expect((grid as HTMLElement).style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))'))
    })

    it('グループ内画像のcaption/altもフラット配列と同じ規則で描画される', () => {
      const { container } = renderContent({ images: [{ label: 'グループA', images: [{ src: '/a.png', alt: '図の説明', caption: '説明<br/>2行目' }] }] })
      const img = container.querySelector('img')!
      expect(img.getAttribute('alt')).toBe('図の説明')
      const figcaption = container.querySelector('figcaption')
      expect(figcaption?.querySelector('br')).not.toBeNull()
    })

    it('本文領域を埋める宣言（fill変種）がグループ形でも外側の.content-areaと各グループのグリッドに付く（#259の契約）', () => {
      const { container } = renderContent({ images: groups })
      expect(container.querySelector('.content-area')!.classList.contains('content-area-fill')).toBe(true)
      const figureParents = new Set(Array.from(container.querySelectorAll('figure')).map((f) => f.parentElement))
      figureParents.forEach((grid) => expect(grid!.classList.contains('content-area-fill-item')).toBe(true))
    })
  })

  // #324: プロフィール（自己紹介）スライド（content.profile → Profile）。1人ぶんに限定した種別
  describe('contentスライド(profile)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-profile', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    const fullProfile = {
      image: '/avatar.png',
      name: '今川 敏樹',
      nameSub: 'Toshiki Imagawa',
      role: 'ソフトウェアエンジニア',
      org: '開発部 プラットフォームチーム',
      body: '登壇資料の作成ツールを作っています。\n発表は年に数回。',
      links: [
        { icon: 'Description', label: 'example@example.com' },
        { icon: 'Search', label: '@example' },
      ],
    }

    it('写真・氏名・併記・肩書き・所属・本文・連絡先がすべて描画される', () => {
      const { container, getByTestId } = renderContent({ profile: fullProfile })
      expect(getByTestId('profile')).not.toBeNull()
      expect(container.querySelectorAll('img').length).toBe(1)
      expect(container.textContent).toContain('今川 敏樹')
      expect(container.textContent).toContain('Toshiki Imagawa')
      expect(container.textContent).toContain('ソフトウェアエンジニア')
      expect(container.textContent).toContain('開発部 プラットフォームチーム')
      expect(container.textContent).toContain('登壇資料の作成ツールを作っています。')
      expect(container.querySelectorAll('li').length).toBe(2)
      expect(container.textContent).toContain('example@example.com')
    })

    it('本文の改行（\\n）は他の種別と同じく br に展開される', () => {
      const { getByTestId } = renderContent({ profile: fullProfile })
      expect(getByTestId('profile').querySelector('br')).not.toBeNull()
    })

    // 写真は ImageFigureGrid（#198）と同じ FallbackImage 経路に載せる（Reveal.js の遅延読み込みでは
    // data-src で出て、読み込み状態が data-state に公開される）。読み込み失敗時の破線プレースホルダも
    // この経路が担うので、経路に乗っていることをテストで固定する
    it('写真は FallbackImage 経路で描画される（遅延読み込みの data-src と読み込み状態の data-state を持つ）', () => {
      const { container } = renderContent({ profile: fullProfile })
      const img = container.querySelector('img')!
      expect(img.getAttribute('data-src')).toBe('/avatar.png')
      expect(img.getAttribute('data-state')).toBe('loading')
      expect(img.getAttribute('alt')).toBe('今川 敏樹')
    })

    it('写真が無い場合は写真の区画を描かず、テキストだけで崩れない（埋める要素は残る）', () => {
      const { image: _image, ...withoutImage } = fullProfile
      const { container, getByTestId } = renderContent({ profile: withoutImage })
      expect(container.querySelector('img')).toBeNull()
      expect(container.textContent).toContain('今川 敏樹')
      // fill ホストと埋める要素の対応は写真の有無で変わらない（高さ 0 の埋める要素を作らない）
      expect(container.querySelector('.content-area')!.classList.contains('content-area-fill')).toBe(true)
      expect(getByTestId('profile').classList.contains('content-area-fill-item')).toBe(true)
    })

    it('氏名だけでも描画できる（併記・肩書き・所属・本文・連絡先は省略可）', () => {
      const { container } = renderContent({ profile: { name: '氏名だけ' } })
      expect(container.textContent).toContain('氏名だけ')
      expect(container.querySelector('ul')).toBeNull()
      expect(container.querySelector('img')).toBeNull()
    })

    it('links が空配列の場合は連絡先のリストを描画しない', () => {
      const { container } = renderContent({ profile: { name: '氏名', links: [] } })
      expect(container.querySelector('ul')).toBeNull()
    })

    it('links[].icon は tiles[].icon と同じ ComponentRegistry 経路で解決される（未登録名はフォールバック表示になる）', () => {
      const { container } = renderContent({ profile: { name: '氏名', links: [{ icon: 'NotRegisteredIcon', label: 'ラベル' }] } })
      expect(container.querySelector('li')).not.toBeNull()
      expect(container.textContent).toContain('ラベル')
    })

    it('profile指定時はimagesを描画しない（profileはimagesより優先される）', () => {
      const { container, getByTestId } = renderContent({ profile: fullProfile, images: [{ src: '/a.png' }] })
      expect(getByTestId('profile')).not.toBeNull()
      expect(container.querySelector('figure')).toBeNull()
    })

    it('tilesが指定されている場合はtiles描画が優先される（既存の優先順位の維持）', () => {
      const { container, queryByTestId } = renderContent({ tiles: [{ icon: 'Description', title: 'タイル', description: '説明' }], profile: fullProfile })
      expect(container.textContent).toContain('タイル')
      expect(queryByTestId('profile')).toBeNull()
    })

    it('profile指定時はbody/itemsを描画しない（プロフィールはbody/itemsより優先される）', () => {
      const { container, getByTestId } = renderContent({ profile: fullProfile, body: '描画されない本文' })
      expect(getByTestId('profile')).not.toBeNull()
      expect(container.textContent).not.toContain('描画されない本文')
    })

    // アイコン名の制約は schema 側（links[].icon の stringConstraint: iconName）が持つので、描画分岐と
    // 同じ場所で AI 生成の入力契約との対応を固定する（tiles[].icon の同等テストは
    // src/data/__tests__/slideContentSchema.test.ts にある）
    describe('AI生成の入力契約（schema）', () => {
      function conformanceErrors(profile: Record<string, unknown>) {
        return getSchemaConformanceErrors({ meta: { title: 't' }, slides: [{ id: 's1', layout: 'content', content: { title: 'x', profile } }] })
      }

      it('登録済みのアイコン名はエラーにしない', () => {
        expect(conformanceErrors(fullProfile)).toEqual([])
      })

      it('未登録のアイコン名をエラーにする（tiles[].iconと同じ扱い）', () => {
        const errors = conformanceErrors({ name: '氏名', links: [{ icon: 'NotRegisteredIcon', label: 'ラベル' }] })
        expect(errors).toHaveLength(1)
        expect(errors[0].path).toBe('slides[0].content.profile.links[0].icon')
      })

      it('既知フィールドの型不一致をエラーにする（links が配列でない）', () => {
        const errors = conformanceErrors({ name: '氏名', links: '文字列は不正' })
        expect(errors).toHaveLength(1)
        expect(errors[0].path).toBe('slides[0].content.profile.links')
      })
    })
  })

  // #203: インラインSVG（content.svg → InlineSvg）
  describe('contentスライド(svg)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-svg', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('有効なSVGマークアップがインライン展開される', () => {
      const { container } = renderContent({ svg: { markup: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>' } })
      expect(container.querySelector('[data-testid="inline-svg"] svg')).not.toBeNull()
    })

    it('colorトークンをラッパーのCSS colorに解決する（currentColor追従・省略時はprimary）', () => {
      const { container } = renderContent({ svg: { markup: '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="currentColor" /></svg>' } })
      const svgArea = container.querySelector('[data-testid="inline-svg"]')!.firstElementChild as HTMLElement
      expect(svgArea.style.color).toBe('var(--theme-primary)')
    })

    it('script要素を除去してから挿入する（安全性・#203）', () => {
      const { container } = renderContent({ svg: { markup: '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" /></svg>' } })
      expect(container.querySelector('[data-testid="inline-svg"] script')).toBeNull()
    })

    it('解析不能なマークアップは例外を投げず描画をスキップする（利用者への警告はgetThemeWarningsが担う）', () => {
      const { queryByTestId } = renderContent({ svg: { markup: '<not-svg>' } })
      expect(queryByTestId('inline-svg')).toBeNull()
    })

    it('captionが指定されていれば描画される', () => {
      const { container } = renderContent({ svg: { markup: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>', caption: 'キャプション' } })
      expect(container.textContent).toContain('キャプション')
    })
  })

  // #203: テキスト図法（content.textDiagram → TextDiagram）。mermaidは動的importなので描画は非同期
  describe('contentスライド(textDiagram)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-text-diagram', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('mermaid.renderの結果（SVG）が描画される', async () => {
      const { container } = renderContent({ textDiagram: { source: 'flowchart LR\n  A --> B' } })
      await waitFor(() => expect(container.querySelector('[data-testid="text-diagram"] svg')).not.toBeNull())
      expect(mermaidMock.render).toHaveBeenCalledWith(expect.stringContaining('text-diagram-'), 'flowchart LR\n  A --> B')
    })

    it('構文が不正（mermaid.renderがreject）な場合は例外を投げずプレースホルダになる', async () => {
      mermaidMock.render.mockRejectedValueOnce(new Error('parse error'))
      const { container } = renderContent({ textDiagram: { source: 'not a valid diagram' } })
      await waitFor(() => expect(container.querySelector('[data-testid="text-diagram"] > div')?.getAttribute('data-state')).toBe('error'))
      expect(container.querySelector('[data-testid="text-diagram"] svg')).toBeNull()
    })

    it('captionが指定されていれば描画される', async () => {
      const { container } = renderContent({ textDiagram: { source: 'flowchart LR\n  A --> B', caption: 'キャプション' } })
      await waitFor(() => expect(container.querySelector('[data-testid="text-diagram"] svg')).not.toBeNull())
      expect(container.textContent).toContain('キャプション')
    })
  })

  // #204: チャート（content.chart → Chart）
  describe('contentスライド(chart)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-chart', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('chartが指定された種別で描画される', () => {
      const { getByTestId } = renderContent({ chart: { type: 'line', categories: ['Q1', 'Q2'], series: [{ values: [1, 2] }] } })
      expect(getByTestId('chart').dataset.chartType).toBe('line')
    })

    it('chartがオブジェクトでない場合は描画せずbody/itemsへ落ちる', () => {
      const { queryByTestId, container } = renderContent({ chart: 'broken', body: '本文' })
      expect(queryByTestId('chart')).toBeNull()
      expect(container.textContent).toContain('本文')
    })

    it('imagesが指定されている場合はimages描画が優先される（既存の優先順位の維持）', () => {
      const { container, queryByTestId } = renderContent({ images: [{ src: '/a.png' }], chart: { type: 'bar', categories: ['A'], series: [{ values: [1] }] } })
      expect(container.querySelector('figure')).not.toBeNull()
      expect(queryByTestId('chart')).toBeNull()
    })

    it('chart指定時はcomponent/body/itemsを描画しない', () => {
      const { getByTestId, container } = renderContent({ chart: { type: 'bar', categories: ['A'], series: [{ values: [1] }] }, body: '描画されない本文' })
      expect(getByTestId('chart')).not.toBeNull()
      expect(container.textContent).not.toContain('描画されない本文')
    })
  })

  // #194: 表（content.table → Table）
  describe('contentスライド(table)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-table', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('tableが指定された内容で描画される', () => {
      const { getByTestId } = renderContent({ table: { columns: [{ label: '項目' }], rows: [['値']] } })
      const table = getByTestId('table')
      expect(table.textContent).toContain('項目')
      expect(table.textContent).toContain('値')
    })

    it('tableがオブジェクトでない場合は描画せずbody/itemsへ落ちる', () => {
      const { queryByTestId, container } = renderContent({ table: 'broken', body: '本文' })
      expect(queryByTestId('table')).toBeNull()
      expect(container.textContent).toContain('本文')
    })

    it('chartが指定されている場合はchart描画が優先される（既存の優先順位の維持）', () => {
      const { queryByTestId } = renderContent({
        chart: { type: 'bar', categories: ['A'], series: [{ values: [1] }] },
        table: { columns: [{ label: '項目' }], rows: [['値']] },
      })
      expect(queryByTestId('chart')).not.toBeNull()
      expect(queryByTestId('table')).toBeNull()
    })

    it('table指定時はcomponent/body/itemsを描画しない', () => {
      const { getByTestId, container } = renderContent({ table: { columns: [{ label: '項目' }], rows: [['値']] }, body: '描画されない本文' })
      expect(getByTestId('table')).not.toBeNull()
      expect(container.textContent).not.toContain('描画されない本文')
    })
  })

  // #199: チェックリスト（content.checklist → Checklist）
  describe('contentスライド(checklist)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-checklist', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    const sample = [
      { title: '済の項目', description: '説明1', checked: true },
      { title: '未の項目', description: '説明2' },
    ]

    it('checklistの項目と説明が描画される', () => {
      const { getByTestId } = renderContent({ checklist: sample })
      const list = getByTestId('checklist')
      expect(list.textContent).toContain('済の項目')
      expect(list.textContent).toContain('説明1')
      expect(list.textContent).toContain('未の項目')
    })

    it('完了は✓・未完了は空の記号になり、記号の色はテーマトークンを参照する（色値をハードコードしない）', () => {
      const { getByTestId } = renderContent({ checklist: sample })
      const badges = [...getByTestId('checklist').querySelectorAll('li > span')]
      expect(badges.map((badge) => badge.textContent)).toEqual(['✓', ''])
      expect(badges[0].getAttribute('style')).toContain('var(--theme-success)')
      expect(badges[1].getAttribute('style')).toContain('var(--theme-neutral)')
    })

    it('項目数に応じて密度が上がる（行間・文字サイズの縮小段階）', () => {
      // 同一テスト内で複数回 render するため、document 全体ではなく各 container を見る
      const densityOf = (count: number) => renderContent({ checklist: Array.from({ length: count }, () => ({ title: '項目' })) }).container.querySelector<HTMLElement>('[data-testid="checklist"]')!.dataset.density
      expect(densityOf(4)).toBe('normal')
      expect(densityOf(5)).toBe('dense')
      expect(densityOf(7)).toBe('compact')
    })

    it('stepsが指定されている場合はsteps描画が優先される（既存の優先順位の維持）', () => {
      const { queryByTestId, container } = renderContent({ steps: [{ number: 1, title: 'ステップ', description: '説明' }], checklist: sample })
      expect(queryByTestId('checklist')).toBeNull()
      expect(container.textContent).toContain('ステップ')
    })

    it('checklist指定時はtiles/body/itemsを描画しない', () => {
      const { getByTestId, container } = renderContent({ checklist: sample, tiles: [{ icon: 'Description', title: 'タイル', description: '説明' }], body: '描画されない本文' })
      expect(getByTestId('checklist')).not.toBeNull()
      expect(container.textContent).not.toContain('タイル')
      expect(container.textContent).not.toContain('描画されない本文')
    })
  })

  // #195: 目次（content.toc → Toc）。章（meta.section）からの自動導出と手書き項目リストの両方に対応する
  describe('contentスライド(toc)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-toc', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('items指定時（手書きモード）は章番号・タイトル・ページ番号がそのまま描画される', () => {
      const { getByTestId } = renderContent({
        toc: {
          items: [
            { number: '01', title: '導入', page: 3 },
            { title: '設計', page: 12 },
          ],
        },
      })
      const toc = getByTestId('toc')
      expect(toc.textContent).toContain('01')
      expect(toc.textContent).toContain('導入')
      expect(toc.textContent).toContain('3')
      expect(toc.textContent).toContain('設計')
      expect(toc.textContent).toContain('12')
    })

    it('tocがオブジェクトでない場合は描画せずbody/itemsへ落ちる', () => {
      const { queryByTestId, container } = renderContent({ toc: 'broken', body: '本文' })
      expect(queryByTestId('toc')).toBeNull()
      expect(container.textContent).toContain('本文')
    })

    it('checklistが指定されている場合はchecklist描画が優先される（既存の優先順位の維持）', () => {
      const { queryByTestId } = renderContent({ checklist: [{ title: '項目' }], toc: { items: [{ title: '章1', page: 1 }] } })
      expect(queryByTestId('checklist')).not.toBeNull()
      expect(queryByTestId('toc')).toBeNull()
    })

    it('toc指定時はtiles/body/itemsを描画しない', () => {
      const { getByTestId, container } = renderContent({ toc: { items: [{ title: '章1', page: 1 }] }, tiles: [{ icon: 'Description', title: 'タイル', description: '説明' }], body: '描画されない本文' })
      expect(getByTestId('toc')).not.toBeNull()
      expect(container.textContent).not.toContain('タイル')
      expect(container.textContent).not.toContain('描画されない本文')
    })

    // #191: 章（buildSections）からの自動導出。開始ページはstartIndex(0始まり)+1(Revealの1始まり表示と一致)
    describe('itemsを省略した自動導出モード（sections から章番号・開始ページを導出）', () => {
      function tocDeck(tocContent: SlideData['content']): SlideData[] {
        return [
          { id: 's0', layout: 'center', content: { title: '表紙' } },
          { id: 's-toc', layout: 'content', content: { title: '目次', ...tocContent } },
          { id: 's1', layout: 'content', content: { title: 'slide' }, meta: { section: '導入' } },
          { id: 's2', layout: 'content', content: { title: 'slide' }, meta: { section: '導入' } },
          { id: 's3', layout: 'content', content: { title: 'slide' }, meta: { section: '設計' } },
        ]
      }

      it('章番号・章タイトル・開始ページ番号（1始まり）を自動導出する', () => {
        const { getByTestId } = renderWithTheme(<SlideRenderer slides={tocDeck({ toc: {} })} />)
        const toc = getByTestId('toc')
        expect(toc.textContent).toContain('導入')
        expect(toc.textContent).toContain('設計')
        // 導入の開始ページ = startIndex(2) + 1 = 3、設計の開始ページ = startIndex(4) + 1 = 5
        const pages = [...toc.querySelectorAll('li')].map((li) => li.textContent)
        expect(pages[0]).toContain('3')
        expect(pages[1]).toContain('5')
      })

      it('numberFormat省略時は章番号がゼロ詰めなしで展開される', () => {
        const { getByTestId } = renderWithTheme(<SlideRenderer slides={tocDeck({ toc: {} })} />)
        expect(getByTestId('toc').textContent).toContain('1')
      })

      it('numberFormatの{sectionNumber:0N}記法でゼロ詰めできる（renderMasterTextの再利用）', () => {
        const { getByTestId } = renderWithTheme(<SlideRenderer slides={tocDeck({ toc: { numberFormat: '第{sectionNumber:02}章' } })} />)
        expect(getByTestId('toc').textContent).toContain('第01章')
        expect(getByTestId('toc').textContent).toContain('第02章')
      })

      it('章を追加・削除・並べ替えしても目次が自動追従する（受け入れ基準）', () => {
        // 同一テスト内で複数回 render するため、document 全体ではなく各 container を見る
        const deck = tocDeck({ toc: {} })
        const before = renderWithTheme(<SlideRenderer slides={deck} />).container.querySelector('[data-testid="toc"]')!
        expect(before.querySelectorAll('li')).toHaveLength(2)

        const withExtraSection: SlideData[] = [...deck, { id: 's4', layout: 'content', content: { title: 'slide' }, meta: { section: '運用' } }]
        const after = renderWithTheme(<SlideRenderer slides={withExtraSection} />).container.querySelector('[data-testid="toc"]')!
        const rows = after.querySelectorAll('li')
        expect(rows).toHaveLength(3)
        expect(rows[2].textContent).toContain('運用')
      })

      it('章の概念を使わないデッキ（meta.section無指定）では自動導出の目次は空になる（手書きitemsで対応する後方互換）', () => {
        const { getByTestId } = renderWithTheme(
          <SlideRenderer
            slides={[
              { id: 's-toc', layout: 'content', content: { title: '目次', toc: {} } },
              { id: 's1', layout: 'content', content: { title: 'slide' } },
            ]}
          />,
        )
        expect(getByTestId('toc').querySelectorAll('li')).toHaveLength(0)
      })
    })

    it('columns指定時は指定列数のグリッドになる', () => {
      const { getByTestId } = renderContent({ toc: { items: [{ title: '章1', page: 1 }], columns: 2 } })
      expect((getByTestId('toc') as HTMLElement).style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
    })

    it('columns省略時は1列になる', () => {
      const { getByTestId } = renderContent({ toc: { items: [{ title: '章1', page: 1 }] } })
      expect((getByTestId('toc') as HTMLElement).style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))')
    })
  })

  // #199: 番号付きリストの多列配置（content.stepColumns → Timeline の columns）
  describe('contentスライド(steps + stepColumns)', () => {
    const steps = Array.from({ length: 7 }, (_, i) => ({ number: i + 1, title: `手順${i + 1}`, description: `説明${i + 1}` }))

    function renderSteps(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-steps', layout: 'content', content: { title: 'タイトル', steps, ...content } }]} />)
    }

    /** 同一テスト内で複数回 render するため、document 全体ではなく各 container を見る */
    function multiColumnOf(content: SlideData['content']): HTMLElement | null {
      return renderSteps(content).container.querySelector<HTMLElement>('[data-testid="timeline-multi-column"]')
    }

    it('stepColumns省略時は多列にならず、現行どおり全項目を描画する（既存デッキの描画を変えない）', () => {
      const { queryByTestId, container } = renderSteps({})
      expect(queryByTestId('timeline-multi-column')).toBeNull()
      expect(container.querySelectorAll('.MuiAvatar-root').length).toBe(steps.length)
      expect(container.textContent).toContain('手順7')
    })

    it('stepColumns指定時は指定列数のグリッドになり、全項目を描画する', () => {
      const grid = multiColumnOf({ stepColumns: 2 })!
      expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
      expect(grid.querySelectorAll('.MuiAvatar-root').length).toBe(steps.length)
    })

    it('列数は1〜3に丸める（範囲外の指定でも1項目あたりの幅を保つ）', () => {
      expect(multiColumnOf({ stepColumns: 5 })!.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
      expect(multiColumnOf({ stepColumns: 0 })!.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))')
    })

    it('行数（項目数÷列数）に応じて密度が上がる', () => {
      // 7項目: 3列→3行=dense / 2列→4行=compact、4項目: 2列→2行=normal
      expect(multiColumnOf({ stepColumns: 3 })!.dataset.density).toBe('dense')
      expect(multiColumnOf({ stepColumns: 2 })!.dataset.density).toBe('compact')
      expect(multiColumnOf({ stepColumns: 2, steps: steps.slice(0, 4) })!.dataset.density).toBe('normal')
    })
  })

  // #200: 比較（content.compare → Compare）
  describe('contentスライド(compare)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-compare', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('compareが指定された内容で描画される', () => {
      const { getByTestId } = renderContent({ compare: { left: { heading: '採用する', items: [{ text: '項目A', status: 'pass' }] }, right: { heading: '採用しない' } } })
      expect(getByTestId('compare').textContent).toContain('採用する')
      expect(getByTestId('compare').textContent).toContain('項目A')
    })

    it('compareがオブジェクトでない場合は描画せずbody/itemsへ落ちる', () => {
      const { queryByTestId, container } = renderContent({ compare: 'broken', body: '本文' })
      expect(queryByTestId('compare')).toBeNull()
      expect(container.textContent).toContain('本文')
    })

    it('tableが指定されている場合はtable描画が優先される（既存の優先順位の維持）', () => {
      const { queryByTestId } = renderContent({
        table: { columns: [{ label: '項目' }], rows: [['値']] },
        compare: { left: { heading: '見出し' } },
      })
      expect(queryByTestId('table')).not.toBeNull()
      expect(queryByTestId('compare')).toBeNull()
    })

    it('compare指定時はflow/component/body/itemsを描画しない', () => {
      const { getByTestId, container } = renderContent({ compare: { left: { heading: '見出し' } }, flow: [{ title: '工程1' }], body: '描画されない本文' })
      expect(getByTestId('compare')).not.toBeNull()
      expect(container.textContent).not.toContain('工程1')
      expect(container.textContent).not.toContain('描画されない本文')
    })
  })

  // #200: 横フロー（content.flow → Flow）
  describe('contentスライド(flow)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-flow', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('flowが指定された工程数だけカードを描画する', () => {
      const { getByText } = renderContent({ flow: [{ title: '工程1' }, { title: '工程2' }, { title: '工程3' }] })
      expect(getByText('工程1')).not.toBeNull()
      expect(getByText('工程3')).not.toBeNull()
    })

    it('flowが空配列の場合は何も描画しない（tiles/steps等の他の配列フィールドと同様、bodyへは落ちない）', () => {
      const { container } = renderContent({ flow: [], body: '本文' })
      expect(container.textContent).not.toContain('本文')
    })

    it('compareが指定されている場合はcompare描画が優先される（既存の優先順位の維持）', () => {
      const { getByTestId, container } = renderContent({ compare: { left: { heading: '見出し' } }, flow: [{ title: '工程1' }] })
      expect(getByTestId('compare')).not.toBeNull()
      expect(container.textContent).not.toContain('工程1')
    })
  })

  // #205: 構成図（content.hierarchyDiagram/serverDiagram/orgChart/classDiagram → structureDiagram/）
  describe('contentスライド(構成図)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-structure-diagram', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('hierarchyDiagramの層タイトルを描画する', () => {
      const { getByText } = renderContent({ hierarchyDiagram: { layers: [{ title: 'プレゼンテーション層' }, { title: 'データ層' }] } })
      expect(getByText('プレゼンテーション層')).not.toBeNull()
      expect(getByText('データ層')).not.toBeNull()
    })

    it('serverDiagramのゾーン・ノードラベルを描画する', () => {
      const { getByText } = renderContent({ serverDiagram: { zones: [{ title: 'パブリック', nodes: [{ id: 'lb', label: 'LB' }] }] } })
      expect(getByText('パブリック')).not.toBeNull()
      expect(getByText('LB')).not.toBeNull()
    })

    it('orgChartのノードラベルを描画する', () => {
      const { getByText } = renderContent({
        orgChart: {
          nodes: [
            { id: 'ceo', label: 'CEO' },
            { id: 'cto', label: 'CTO', parent: 'ceo' },
          ],
        },
      })
      expect(getByText('CEO')).not.toBeNull()
      expect(getByText('CTO')).not.toBeNull()
    })

    it('classDiagramのクラス名を描画する', () => {
      const { getByText } = renderContent({ classDiagram: { classes: [{ id: 'user', label: 'User' }] } })
      expect(getByText('User')).not.toBeNull()
    })

    it('複数の構成図フィールドが同時にあってもhierarchyDiagramが優先される（既存の優先順位パターンと同じ先勝ち）', () => {
      const { getByText, queryByText } = renderContent({ hierarchyDiagram: { layers: [{ title: '層' }] }, orgChart: { nodes: [{ id: 'a', label: 'ノード' }] } })
      expect(getByText('層')).not.toBeNull()
      expect(queryByText('ノード')).toBeNull()
    })
  })

  // #269: UMLシーケンス図。ライフライン列・メッセージ行の配置詳細はSequenceDiagram.test.tsxで検証済みなので、
  // ここでは SlideRenderer からの配線（フィールド→コンポーネント）と分岐優先順位のみを確認する
  describe('contentスライド(UMLシーケンス図)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-sequence-diagram', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('sequenceDiagramのライフラインラベルを描画する', () => {
      const { getByText } = renderContent({ sequenceDiagram: { lifelines: [{ id: 'user', label: 'User' }] } })
      expect(getByText('User')).not.toBeNull()
    })

    it('classDiagramとsequenceDiagramが同時にあってもclassDiagramが優先される（既存の優先順位パターンと同じ先勝ち）', () => {
      const { getByText, queryByText } = renderContent({ classDiagram: { classes: [{ id: 'a', label: 'クラス' }] }, sequenceDiagram: { lifelines: [{ id: 'b', label: 'ライフライン' }] } })
      expect(getByText('クラス')).not.toBeNull()
      expect(queryByText('ライフライン')).toBeNull()
    })
  })

  // #206: プロセス図（フローチャート・スイムレーン・ガント）。配置・分岐合流等の詳細は各コンポーネントの単体テストで検証済みなので、
  // ここでは SlideRenderer からの配線（フィールド→コンポーネント）と分岐優先順位のみを確認する
  describe('contentスライド(プロセス図)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-process-diagram', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('flowchartのノードラベルを描画する', () => {
      const { getByText } = renderContent({ flowchart: { nodes: [{ id: 'start', label: '開始', shape: 'start' }] } })
      expect(getByText('開始')).not.toBeNull()
    })

    it('swimlaneのレーン内ノードラベルを描画する', () => {
      const { getByText } = renderContent({ swimlane: { lanes: [{ title: '担当A', nodes: [{ id: 'a', label: '工程1' }] }] } })
      expect(getByText('工程1')).not.toBeNull()
    })

    it('ganttの工程ラベルを描画する', () => {
      const { getByText } = renderContent({ gantt: { tasks: [{ label: '設計', startCol: 0 }] } })
      expect(getByText('設計')).not.toBeNull()
    })

    it('classDiagramとflowchartが同時にあってもclassDiagramが優先される（既存の優先順位パターンと同じ先勝ち）', () => {
      const { getByText, queryByText } = renderContent({ classDiagram: { classes: [{ id: 'a', label: 'クラス' }] }, flowchart: { nodes: [{ id: 'b', label: 'ノード' }] } })
      expect(getByText('クラス')).not.toBeNull()
      expect(queryByText('ノード')).toBeNull()
    })
  })

  // #207: 分析図（2×2マトリクス・ファネル・SWOT・ヒートマップ）
  describe('contentスライド(分析図)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-analysis-diagram', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('twoByTwoの象限タイトルと項目ラベルを描画する', () => {
      const { getByText } = renderContent({
        twoByTwo: {
          quadrants: [{ title: '第1象限' }, { title: '第2象限' }, { title: '第3象限' }, { title: '第4象限' }],
          items: [{ label: '項目A', x: 0.3, y: 0.3 }],
        },
      })
      expect(getByText('第1象限')).not.toBeNull()
      expect(getByText('項目A')).not.toBeNull()
    })

    it('funnelの段ラベルと数値を描画する', () => {
      const { container } = renderContent({
        funnel: {
          stages: [
            { label: 'アクセス', value: 1000 },
            { label: '登録', value: 300 },
          ],
          unit: '件',
        },
      })
      expect(container.textContent).toContain('アクセス')
      expect(container.textContent).toContain('1,000件')
    })

    it('swotのペイン表題と項目を描画する', () => {
      const { container } = renderContent({ swot: { strengths: { items: ['ブランド認知'] }, weaknesses: { items: ['技術負債'] } } })
      expect(container.textContent).toContain('Strengths')
      expect(container.textContent).toContain('ブランド認知')
      expect(container.textContent).toContain('Weaknesses')
      expect(container.textContent).toContain('技術負債')
    })

    it('heatmapの行・列ラベルとセル値を描画する', () => {
      const { getByText, container } = renderContent({
        heatmap: {
          rows: ['行A'],
          cols: ['列1', '列2'],
          values: [[10, 20]],
        },
      })
      expect(getByText('行A')).not.toBeNull()
      expect(getByText('列1')).not.toBeNull()
      expect(container.textContent).toContain('10')
      expect(container.textContent).toContain('20')
    })

    it('複数の分析図フィールドが同時にあっても twoByTwo が優先される（先勝ちの優先順位）', () => {
      const { container } = renderContent({
        twoByTwo: { quadrants: [{ title: 'Q1' }, { title: 'Q2' }, { title: 'Q3' }, { title: 'Q4' }] },
        funnel: { stages: [{ label: 'アクセス', value: 100 }] },
      })
      expect(container.textContent).toContain('Q1')
      expect(container.textContent).not.toContain('アクセス')
    })
  })

  // #206: 日付付きマイルストーンタイムライン。既存steps（連番）の描画は変えない（受け入れ基準）ため、
  // stepsとの併存時の優先順位も検証する
  describe('contentスライド(dateTimeline)', () => {
    function renderContent(content: SlideData['content']) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-date-timeline', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
    }

    it('日付をバッジに、タイトル・説明を本文として描画する', () => {
      const { getByText } = renderContent({ dateTimeline: [{ date: '2026/01', title: 'マイルストーン1', description: '説明1' }] })
      expect(getByText('2026/01')).not.toBeNull()
      expect(getByText('マイルストーン1')).not.toBeNull()
      expect(getByText('説明1')).not.toBeNull()
    })

    it('stepsが指定されている場合はstepsが優先される（既存stepsの描画を変えない）', () => {
      const { getByText, queryByText, container } = renderContent({ steps: [{ number: 1, title: 'ステップ1', description: '説明' }], dateTimeline: [{ date: '2026/01', title: 'マイルストーン1' }] })
      expect(getByText('1')).not.toBeNull()
      expect(queryByText('マイルストーン1')).toBeNull()
      expect(container.textContent).toContain('ステップ1')
    })
  })

  // #256: 本文領域の fill 変種（.content-area-fill）と「埋める要素」（.content-area-fill-item）の対応。
  // 分岐順と fill の判定は CONTENT_BRANCHES の1か所に集約したので、その表が DOM に現れるかを全分岐で検査する
  // （fill を付けて -item を付け忘れると .content-area の主軸配置が stretch に変わり、静かに崩れる）
  describe('本文領域の fill 変種（.content-area-fill）', () => {
    /** 各分岐の代表入力。fill: true の分岐は .content-area-fill-item を持つ要素を必ず描く */
    const fillCases: Array<{ name: string; content: SlideData['content']; fill: boolean }> = [
      { name: 'steps', content: { steps: [{ number: 1, title: 'ステップ', description: '説明' }] }, fill: false },
      { name: 'dateTimeline', content: { dateTimeline: [{ date: '2026/01', title: 'マイルストーン' }] }, fill: false },
      { name: 'checklist', content: { checklist: [{ title: '項目' }] }, fill: false },
      { name: 'toc', content: { toc: { items: [{ title: '章1', page: 1 }] } }, fill: false },
      { name: 'tiles', content: { tiles: [{ icon: 'Description', title: 'タイル', description: '説明' }] }, fill: false },
      { name: 'profile', content: { profile: { name: '氏名', image: '/avatar.png' } }, fill: true },
      { name: 'images', content: { images: [{ src: '/a.png' }] }, fill: true },
      { name: 'svg', content: { svg: { markup: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>' } }, fill: true },
      { name: 'textDiagram', content: { textDiagram: { source: 'flowchart LR\n  A --> B' } }, fill: true },
      { name: 'chart', content: { chart: { type: 'bar', categories: ['A'], series: [{ values: [1] }] } }, fill: true },
      { name: 'table', content: { table: { columns: [{ label: '項目' }], rows: [['値']] } }, fill: true },
      { name: 'compare', content: { compare: { left: { heading: '見出し' } } }, fill: true },
      { name: 'flow', content: { flow: [{ title: '工程1' }, { title: '工程2' }] }, fill: true },
      { name: 'hierarchyDiagram', content: { hierarchyDiagram: { layers: [{ title: '層1' }] } }, fill: true },
      { name: 'serverDiagram', content: { serverDiagram: { zones: [{ title: 'ゾーン', nodes: [{ id: 'n', label: 'ノード' }] }] } }, fill: true },
      { name: 'orgChart', content: { orgChart: { nodes: [{ id: 'a', label: 'ノード' }] } }, fill: true },
      { name: 'classDiagram', content: { classDiagram: { classes: [{ id: 'a', label: 'クラス' }] } }, fill: true },
      { name: 'sequenceDiagram', content: { sequenceDiagram: { lifelines: [{ id: 'a', label: 'ライフライン' }] } }, fill: true },
      { name: 'flowchart', content: { flowchart: { nodes: [{ id: 'a', label: 'ノード' }] } }, fill: true },
      { name: 'swimlane', content: { swimlane: { lanes: [{ title: 'レーン', nodes: [{ id: 'a', label: 'ノード' }] }] } }, fill: true },
      { name: 'gantt', content: { gantt: { tasks: [{ label: '工程', startCol: 0 }] } }, fill: true },
      { name: 'twoByTwo', content: { twoByTwo: { quadrants: [{ title: 'q1' }, { title: 'q2' }, { title: 'q3' }, { title: 'q4' }] } }, fill: true },
      { name: 'funnel', content: { funnel: { stages: [{ label: '段', value: 100 }] } }, fill: true },
      { name: 'swot', content: { swot: { strengths: { items: ['s'] } } }, fill: true },
      { name: 'heatmap', content: { heatmap: { rows: ['R'], cols: ['C'], values: [[1]] } }, fill: true },
      { name: 'component:Diagram（登録側が fillsContentArea を宣言）', content: { component: { name: 'Diagram', props: { nodes: [{ id: 'a', rect: { x: 0, y: 0, w: 0.3, h: 0.3 }, title: 'カード' }] } } }, fill: true },
      { name: 'component:TerminalAnimation（既定は埋めない）', content: { component: { name: 'TerminalAnimation' } }, fill: false },
      { name: 'body/items', content: { body: '本文' }, fill: false },
    ]

    it.each(fillCases)('$name の分岐で、fill 変種と「埋める要素」の有無が一致する', ({ content, fill }) => {
      const { container } = renderWithTheme(<SlideRenderer slides={[{ id: 'test-fill', layout: 'content', content: { title: 'タイトル', ...content } }]} />)
      expect(container.querySelector('.content-area')!.classList.contains('content-area-fill')).toBe(fill)
      expect(container.querySelector('.content-area-fill-item') !== null).toBe(fill)
    })
  })

  // #197: 引用・大メッセージ・締め（1枚1メッセージ）。center の variant として MessageLayout を共有し、
  // タイトルバー（.slide-title）を持たない。余白は SlideFrame の .master-body が持つため、
  // 本編・発表者ビュー・編集プレビュー・PDF書き出しの4経路で同じ見た目になる
  describe('centerスライドの1枚1メッセージ variant（引用・大メッセージ・締め）', () => {
    function renderCenter(content: SlideData['content'], theme?: ThemeData) {
      return renderWithTheme(<SlideRenderer slides={[{ id: 'test-message', layout: 'center', content }]} theme={theme} />)
    }

    const messageVariants = ['quote', 'message', 'message-inverse', 'closing'] as const

    it.each(messageVariants)('variant: %s はタイトルバーを持たず、.master-body 直下の .message-layout に中身を置く', (variant) => {
      const { container } = renderCenter({ variant, title: '使われないタイトル', quote: '引用文', message: '主張' })
      expect(container.querySelector('.slide-title')).toBeNull()
      const messageLayout = container.querySelector('.message-layout')
      expect(messageLayout).not.toBeNull()
      expect(messageLayout!.parentElement!.classList.contains('master-body')).toBe(true)
    })

    it('引用（quote）は引用文と出典を描画する', () => {
      const { container, getByTestId } = renderCenter({ variant: 'quote', quote: '設計は削ることで決まる', citation: '架空の設計者' })
      expect(getByTestId('quote')).not.toBeNull()
      expect(container.querySelector('blockquote')!.textContent).toBe('設計は削ることで決まる')
      expect(container.querySelector('cite')!.textContent).toBe('架空の設計者')
    })

    it('引用（quote）は出典を省略できる', () => {
      const { container } = renderCenter({ variant: 'quote', quote: '出典のない引用' })
      expect(container.querySelector('blockquote')!.textContent).toBe('出典のない引用')
      expect(container.querySelector('cite')).toBeNull()
    })

    it('大メッセージ（message）は主張と補足を描画する', () => {
      const { container, getByTestId } = renderCenter({ variant: 'message', message: '1枚に1メッセージ', body: '詰め込まない' })
      expect(getByTestId('big-message')).not.toBeNull()
      expect(container.textContent).toContain('1枚に1メッセージ')
      expect(container.textContent).toContain('詰め込まない')
    })

    it('全面塗り（message-inverse）は淡色地（message）と同じ中身を描き、塗りはマスターに委ねる', () => {
      const content: SlideData['content'] = { message: '全面塗りの主張' }
      const pale = renderCenter({ ...content, variant: 'message' }).container.querySelector('.message-layout')!.innerHTML
      const inverse = renderCenter({ ...content, variant: 'message-inverse' }).container.querySelector('.message-layout')!.innerHTML
      expect(inverse).toBe(pale)
    })

    // 全面塗り（message-inverse）・締め（closing）は塗りをマスターに委ねるので、variant が
    // masterMap["center/<variant>"] の解決に届いていることが成立条件になる
    it.each(messageVariants)('variant: %s は masterMap["center/<variant>"] からマスターを解決する', (variant) => {
      const theme: ThemeData = {
        masters: { inverse: { background: { type: 'fill', color: '#1f2430' }, decorations: [] } },
        masterMap: Object.fromEntries(messageVariants.map((v) => [`center/${v}`, 'inverse'])),
        tokens: { inverse: { 'theme-text-body': '#ffffff' } },
      }
      const { container } = renderCenter({ variant, message: '全面塗りの主張', quote: '引用文' }, theme)
      expect(container.querySelector('section.slide-container')!.getAttribute('data-master')).toBe('inverse')
    })

    it('締め（closing）は結びの一言に QR コードとリポジトリを添える', () => {
      const { container, getByTestId } = renderCenter({ variant: 'closing', message: 'ありがとうございました', qrCode: 'https://example.com/', githubRepo: 'owner/repo' })
      expect(getByTestId('big-message')).not.toBeNull()
      expect(container.textContent).toContain('ありがとうございました')
      expect(container.textContent).toContain('owner/repo')
      expect(container.querySelector('img[alt="QR code"], canvas, svg')).not.toBeNull()
    })

    it('改行（\\n）は既存の種別と同じく br に展開する', () => {
      const { container } = renderCenter({ variant: 'message', message: '1行目\n2行目' })
      expect(container.querySelector('br')).not.toBeNull()
    })

    it('未知の variant は表紙（title/subtitle）にフォールバックする', () => {
      const { container } = renderCenter({ variant: 'unknown-variant', title: '表紙タイトル' })
      expect(container.querySelector('h1')!.textContent).toContain('表紙タイトル')
      expect(container.querySelector('.message-layout')).toBeNull()
    })

    // 描画できる variant（CENTER_VARIANTS）と、AI生成プロンプト・厳格チェックが参照するスキーマの enum は
    // 別ファイルにあるため、片方だけに足すと「描けるのに生成が弾かれる（またはその逆）」が静かに起きる
    it('描画できる variant の一覧がスキーマの enum と一致する', () => {
      const schemaEnum = (schemaJson as { layouts: { center: { contentFields: { variant: { enum: string[] } } } } }).layouts.center.contentFields.variant.enum
      expectRuntimeMatchesSchemaEnum(CENTER_VARIANT_NAMES, schemaEnum)
    })
  })

  // #259: two-column のカラムに置いた「埋めるコンポーネント」の高さ解決。
  // 埋める要素（.content-area-fill-item）は fill ホスト（.content-area-fill）の中に置かれて初めて
  // 残り高さを受け取るため、カラム自身がホストを名乗る必要がある（ホストを .content-area 側に付けると
  // :has() 規則が2カラムのグリッドを flex 列へ上書きして崩れる。理由は global.css に記載）。
  // 高さ 0 は見た目上静かに消えるだけなので、対応をこのテストで固定する
  describe('two-column のカラムの fill ホスト（.content-area-fill）', () => {
    function renderTwoColumn(content: SlideData['content']) {
      const { container } = renderWithTheme(<SlideRenderer slides={[{ id: 'test-two-column-fill', layout: 'two-column', content: { title: 'タイトル', ...content } }]} />)
      // .content-area 直下がグリッドのルート、その子2つが左右のカラム
      const columns = Array.from(container.querySelector('.content-area')!.firstElementChild!.children)
      return { container, columns }
    }

    it('埋めるコンポーネント（Diagram）を置いたカラムだけが fill ホストを名乗り、本文領域には付かない', () => {
      const { container, columns } = renderTwoColumn({
        left: { component: { name: 'Diagram', props: { nodes: [{ id: 'a', rect: { x: 0, y: 0, w: 0.3, h: 0.3 }, title: 'カード' }] } } },
        right: { heading: '右カラム', paragraphs: ['右の本文'] },
      })
      expect(columns[0].classList.contains('content-area-fill')).toBe(true)
      expect(columns[1].classList.contains('content-area-fill')).toBe(false)
      // 埋める要素はホストを名乗ったカラムの中にある（ホスト外だと flex:1 が効かず高さ 0 になる）
      expect(columns[0].querySelector('.content-area-fill-item')).not.toBeNull()
      // 本文領域側に付けると :has() 規則が2カラムのグリッドを flex 列へ上書きして崩れる
      expect(container.querySelector('.content-area')!.classList.contains('content-area-fill')).toBe(false)
    })

    it('埋めないコンポーネント（TerminalAnimation）や通常のカラム内容では fill ホストを名乗らない', () => {
      const { columns } = renderTwoColumn({
        left: { component: { name: 'TerminalAnimation' } },
        right: { items: [{ text: '項目' }] },
      })
      expect(columns.some((column) => column.classList.contains('content-area-fill'))).toBe(false)
    })
  })

  // #274: content.* 短縮記法専用だった11種（Table/Compare/Flow/Checklist/HierarchyDiagram/ServerDiagram/
  // OrgChart/ClassDiagram/Flowchart/Swimlane/Gantt）を ComponentRegistry に登録し、component 参照
  // （two-column の各カラム・bleed・custom 等）からも同じ props 形で描画できるようにした。
  // props は短縮記法の入力（content.table 等）と同じ形をそのまま渡し、フォールバック落ちしないことを確認する
  describe('component 参照からの描画（短縮記法専用コンポーネントの register 化・#274）', () => {
    const componentCases: Array<{ name: string; props: Record<string, unknown>; expectedText: string }> = [
      { name: 'Table', props: { columns: [{ label: '項目' }], rows: [['値']] }, expectedText: '値' },
      { name: 'Compare', props: { left: { heading: '見出し' } }, expectedText: '見出し' },
      { name: 'Flow', props: { steps: [{ title: '工程1' }, { title: '工程2' }] }, expectedText: '工程1' },
      { name: 'Checklist', props: { items: [{ title: '項目' }] }, expectedText: '項目' },
      { name: 'HierarchyDiagram', props: { layers: [{ title: '層1' }] }, expectedText: '層1' },
      { name: 'ServerDiagram', props: { zones: [{ title: 'ゾーン', nodes: [{ id: 'n', label: 'ノード' }] }] }, expectedText: 'ゾーン' },
      { name: 'OrgChart', props: { nodes: [{ id: 'a', label: 'ノード' }] }, expectedText: 'ノード' },
      { name: 'ClassDiagram', props: { classes: [{ id: 'a', label: 'クラス' }] }, expectedText: 'クラス' },
      { name: 'Flowchart', props: { nodes: [{ id: 'a', label: 'ノード' }] }, expectedText: 'ノード' },
      { name: 'Swimlane', props: { lanes: [{ title: 'レーン', nodes: [{ id: 'a', label: 'ノード' }] }] }, expectedText: 'レーン' },
      { name: 'Gantt', props: { tasks: [{ label: '工程', startCol: 0 }] }, expectedText: '工程' },
    ]

    it.each(componentCases)('$name は component 参照（custom レイアウト）から描画できる', ({ name, props, expectedText }) => {
      const { container } = renderWithTheme(<SlideRenderer slides={[{ id: 'test-component-custom', layout: 'custom', content: { component: { name, props } } }]} />)
      expect(container.textContent).toContain(expectedText)
      expect(container.textContent).not.toContain('Component not found')
    })

    it('Table は two-column の左カラムに component 参照で置ける（右は通常のカラム内容）', () => {
      const { container } = renderWithTheme(
        <SlideRenderer
          slides={[
            {
              id: 'test-component-two-column',
              layout: 'two-column',
              content: {
                title: 'タイトル',
                left: { component: { name: 'Table', props: { columns: [{ label: '項目' }], rows: [['値']] } } },
                right: { heading: '右カラム', paragraphs: ['右の本文'] },
              },
            },
          ]}
        />,
      )
      expect(container.textContent).toContain('値')
      expect(container.textContent).toContain('右カラム')
    })

    it('Compare は bleed レイアウトの component 参照から置ける', () => {
      const { container } = renderWithTheme(
        <SlideRenderer
          slides={[
            {
              id: 'test-component-bleed',
              layout: 'bleed',
              content: { title: 'タイトル', commands: [], component: { name: 'Compare', props: { left: { heading: '見出し' } } } },
            },
          ]}
        />,
      )
      expect(container.textContent).toContain('見出し')
    })
  })

  // #164: masters/masterMap/tokens と SlideMasterLayer。theme 未指定時は既存と完全同一のDOMになることも併せて確認する
  describe('masters（SlideMasterLayer 装飾描画）', () => {
    const masterTheme: ThemeData = {
      masters: {
        standard: {
          decorations: [
            { type: 'band', anchor: 'top-center' },
            { type: 'text', anchor: 'bottom-right', content: '{index} / {total}', layer: 'front', only: 'not-first' },
          ],
        },
      },
      masterMap: { content: 'standard' },
    }

    it('theme未指定時はdata-master属性が付かず装飾も描画されない（現行と完全同一のDOM）', () => {
      const contentSlide = testSlides.find((s) => s.layout === 'content')!
      const { container } = renderWithTheme(<SlideRenderer slides={[contentSlide]} />)
      const section = container.querySelector('section.slide-container')!
      expect(section.getAttribute('data-master')).toBeNull()
      expect(section.querySelector('.master-layer-back')?.children.length).toBe(0)
    })

    it('masterMapに対応するlayoutのスライドにdata-master属性が付き、backレイヤーの装飾が描画される', () => {
      const contentSlide = testSlides.find((s) => s.layout === 'content')!
      const { container } = renderWithTheme(<SlideRenderer slides={[contentSlide]} theme={masterTheme} />)
      const section = container.querySelector('section.slide-container')!
      expect(section.getAttribute('data-master')).toBe('standard')
      expect(section.querySelector('.master-layer-back')?.children.length).toBe(1)
    })

    it('masterMapに対応しないlayoutのスライドは装飾が描画されない', () => {
      const titleSlide = testSlides.find((s) => s.layout === 'center' && !(s.content as Record<string, unknown>).variant)!
      const { container } = renderWithTheme(<SlideRenderer slides={[titleSlide]} theme={masterTheme} />)
      const section = container.querySelector('section.slide-container')!
      expect(section.getAttribute('data-master')).toBeNull()
    })

    it('only: not-first の装飾は最初のスライドに描画されず、2枚目以降に描画される（{index}/{total}のページ番号展開含む）', () => {
      const contentSlides = testSlides.filter((s) => s.layout === 'content')
      const { container } = renderWithTheme(<SlideRenderer slides={contentSlides} theme={masterTheme} />)
      const sections = container.querySelectorAll('section.slide-container')
      expect(sections[0].querySelector('.master-layer-front')?.textContent).toBe('')
      expect(sections[1].querySelector('.master-layer-front')?.textContent).toBe(`2 / ${contentSlides.length}`)
    })

    it('band装飾はcenter系anchor（top-center）でも9方向センタリングtransformの影響を受けず画面外にずれない', () => {
      const contentSlide = testSlides.find((s) => s.layout === 'content')!
      const { container } = renderWithTheme(<SlideRenderer slides={[contentSlide]} theme={masterTheme} />)
      const band = container.querySelector('.master-layer-back > div') as HTMLElement
      // band(horizontal)は left:0/right:0 で全幅に広がるため、横方向のセンタリングtransform(-50%)が
      // 残っていると自身の幅の半分だけ左にずれて画面外に出てしまう
      expect(band.style.left).toBe('0px')
      expect(band.style.transform).not.toContain('-50%')
    })

    // #185: masterMap の粒度拡張（slide.meta.master 直接指定・masterMap の layout/variant 分岐）
    describe('masterMap の粒度拡張（#185）', () => {
      it('slide.meta.master が masterMap より優先して解決される', () => {
        const contentSlide = testSlides.find((s) => s.layout === 'content')!
        const slideWithMeta: SlideData = { ...contentSlide, meta: { master: 'direct' } }
        const theme: ThemeData = {
          masters: { standard: { decorations: [] }, direct: { decorations: [{ type: 'rule', anchor: 'bottom-center' }] } },
          masterMap: { content: 'standard' },
        }
        const { container } = renderWithTheme(<SlideRenderer slides={[slideWithMeta]} theme={theme} />)
        const section = container.querySelector('section.slide-container')!
        expect(section.getAttribute('data-master')).toBe('direct')
      })

      it('同一 layout の2枚のスライドに別々の masterKey を割り当てて描画できる（受け入れ基準）', () => {
        const contentSlides = testSlides.filter((s) => s.layout === 'content')
        const slideA: SlideData = { ...contentSlides[0], meta: { master: 'a' } }
        const slideB: SlideData = { ...contentSlides[1], meta: { master: 'b' } }
        const theme: ThemeData = {
          masters: { a: { decorations: [{ type: 'rule', anchor: 'bottom-center' }] }, b: { decorations: [{ type: 'band', anchor: 'top-center' }] } },
        }
        const { container } = renderWithTheme(<SlideRenderer slides={[slideA, slideB]} theme={theme} />)
        const sections = container.querySelectorAll('section.slide-container')
        expect(sections[0].getAttribute('data-master')).toBe('a')
        expect(sections[1].getAttribute('data-master')).toBe('b')
      })

      it('content.variant に対応する masterMap["layout/variant"] を優先し、無ければ masterMap["layout"] にフォールバックする', () => {
        const sectionSlide = testSlides.find((s) => (s.content as Record<string, unknown>).variant === 'section')!
        const theme: ThemeData = {
          masters: { forSection: { decorations: [{ type: 'rule', anchor: 'bottom-center' }] }, forCenter: { decorations: [{ type: 'band', anchor: 'top-center' }] } },
          masterMap: { 'center/section': 'forSection', center: 'forCenter' },
        }
        const { container } = renderWithTheme(<SlideRenderer slides={[sectionSlide]} theme={theme} />)
        const section = container.querySelector('section.slide-container')!
        expect(section.getAttribute('data-master')).toBe('forSection')
      })

      it('masterMap のみを使う既存デッキの描画は変わらない（後方互換）', () => {
        const contentSlide = testSlides.find((s) => s.layout === 'content')!
        const { container } = renderWithTheme(<SlideRenderer slides={[contentSlide]} theme={masterTheme} />)
        const section = container.querySelector('section.slide-container')!
        expect(section.getAttribute('data-master')).toBe('standard')
      })
    })

    // #189: マスター背景意匠（背景を持つマスターだけが .master-layer-back の最背面に背景要素を敷く）
    describe('マスター背景（#189）', () => {
      it('background を持たないテーマでは背景要素を描かない（現行と完全同一のDOM）', () => {
        const contentSlide = testSlides.find((s) => s.layout === 'content')!
        const { container } = renderWithTheme(<SlideRenderer slides={[contentSlide]} theme={masterTheme} />)
        expect(container.querySelector('.master-background')).toBeNull()
      })

      it('マスターごとに別の背景（無地 / 格子 / 全面塗り）を割り当てられる（受け入れ基準）', () => {
        const slides: SlideData[] = ['plain', 'grid', 'fill'].map((master, i) => ({ id: `s${i}`, layout: 'content', content: { title: `slide ${i}` }, meta: { master } }))
        const theme: ThemeData = {
          masters: {
            plain: { background: { type: 'plain' } },
            grid: { background: { type: 'grid', size: 24 } },
            fill: { background: { type: 'fill', color: 'rgb(1, 2, 3)' } },
          },
        }
        const { container } = renderWithTheme(<SlideRenderer slides={slides} theme={theme} />)
        const backgroundOf = (index: number) => container.querySelectorAll('section.slide-container')[index].querySelector('.master-layer-back > .master-background') as HTMLElement
        expect(backgroundOf(0).className).toBe('master-background')
        expect(backgroundOf(1).className).toBe('master-background master-background-grid')
        expect(backgroundOf(2).style.backgroundColor).toBe('rgb(1, 2, 3)')
      })

      it('透かし（低不透明度・回転させたテキスト装飾）をマスター装飾として置ける（受け入れ基準）', () => {
        const contentSlide = testSlides.find((s) => s.layout === 'content')!
        const theme: ThemeData = {
          masters: { standard: { decorations: [{ type: 'text', anchor: 'middle-center', content: 'CONFIDENTIAL', opacity: 0.08, rotate: -30 }] } },
          masterMap: { content: 'standard' },
        }
        const { container } = renderWithTheme(<SlideRenderer slides={[contentSlide]} theme={theme} />)
        const watermark = container.querySelector('.master-layer-back > div') as HTMLElement
        expect(watermark.textContent).toBe('CONFIDENTIAL')
        expect(watermark.style.opacity).toBe('0.08')
        expect(watermark.style.transform).toContain('rotate(-30deg)')
      })
    })

    // #191: 章（meta.section）を装飾テキストへ差し込む
    describe('章の概念（#191）', () => {
      const sectionTheme: ThemeData = {
        masters: {
          standard: {
            decorations: [
              { type: 'text', anchor: 'bottom-left', content: '第 {sectionNumber:02} 章 {sectionTitle}（{sectionIndex}/{sectionTotal}）', layer: 'front' },
              { type: 'rule', anchor: 'bottom-center', only: 'section-first' },
            ],
          },
        },
        masterMap: { content: 'standard' },
      }

      /** meta.section だけを与えた content スライドを並べる */
      function sectionDeck(...sections: (string | undefined)[]): SlideData[] {
        return sections.map((section, i) => ({ id: `s${i}`, layout: 'content', content: { title: `slide ${i}` }, meta: section ? { section } : undefined }))
      }

      const footerOf = (container: HTMLElement, index: number) => container.querySelectorAll('section.slide-container')[index].querySelector('.master-layer-front')?.textContent

      it('章番号（ゼロ詰め）・章タイトル・章内連番をデッキ全体の並びから解決して差し込む', () => {
        const { container } = renderWithTheme(<SlideRenderer slides={sectionDeck(undefined, '導入', '導入', '設計')} theme={sectionTheme} />)
        expect(footerOf(container, 1)).toBe('第 01 章 導入（1/2）')
        expect(footerOf(container, 2)).toBe('第 01 章 導入（2/2）')
        expect(footerOf(container, 3)).toBe('第 02 章 設計（1/1）')
      })

      it('章に属さないスライドでは章の変数が空文字になる', () => {
        const { container } = renderWithTheme(<SlideRenderer slides={sectionDeck(undefined, '導入')} theme={sectionTheme} />)
        expect(footerOf(container, 0)).toBe('第  章 （/）')
      })

      it('only: section-first の装飾が各章の先頭スライドにだけ描画される', () => {
        const { container } = renderWithTheme(<SlideRenderer slides={sectionDeck(undefined, '導入', '導入', '設計')} theme={sectionTheme} />)
        const backChildren = [...container.querySelectorAll('section.slide-container')].map((s) => s.querySelector('.master-layer-back')?.children.length)
        expect(backChildren).toEqual([0, 1, 0, 1])
      })

      it('章定義のないデッキの描画は変わらない（受け入れ基準・後方互換）', () => {
        const contentSlides = testSlides.filter((s) => s.layout === 'content')
        const { container } = renderWithTheme(<SlideRenderer slides={contentSlides} theme={masterTheme} />)
        expect(footerOf(container, 0)).toBe('')
        expect(footerOf(container, 1)).toBe(`2 / ${contentSlides.length}`)
      })
    })
  })
})
