import { describe, expect, it, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { SlideRenderer } from '../SlideRenderer'
import { registerDefaultComponents } from '../registerDefaults'
import type { SlideData, ThemeData } from '../../data'
import { theme } from '../../theme'

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

  // #256: 本文領域の fill 変種（.content-area-fill）と「埋める要素」（.content-area-fill-item）の対応。
  // 分岐順と fill の判定は CONTENT_BRANCHES の1か所に集約したので、その表が DOM に現れるかを全分岐で検査する
  // （fill を付けて -item を付け忘れると .content-area の主軸配置が stretch に変わり、静かに崩れる）
  describe('本文領域の fill 変種（.content-area-fill）', () => {
    /** 各分岐の代表入力。fill: true の分岐は .content-area-fill-item を持つ要素を必ず描く */
    const fillCases: Array<{ name: string; content: SlideData['content']; fill: boolean }> = [
      { name: 'steps', content: { steps: [{ number: 1, title: 'ステップ', description: '説明' }] }, fill: false },
      { name: 'checklist', content: { checklist: [{ title: '項目' }] }, fill: false },
      { name: 'tiles', content: { tiles: [{ icon: 'Description', title: 'タイル', description: '説明' }] }, fill: false },
      { name: 'images', content: { images: [{ src: '/a.png' }] }, fill: true },
      { name: 'chart', content: { chart: { type: 'bar', categories: ['A'], series: [{ values: [1] }] } }, fill: true },
      { name: 'table', content: { table: { columns: [{ label: '項目' }], rows: [['値']] } }, fill: true },
      { name: 'compare', content: { compare: { left: { heading: '見出し' } } }, fill: false },
      { name: 'flow', content: { flow: [{ title: '工程1' }, { title: '工程2' }] }, fill: true },
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
