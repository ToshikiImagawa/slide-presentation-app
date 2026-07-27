import { describe, expect, it, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { SlideRenderer } from '../SlideRenderer'
import { registerDefaultComponents } from '../registerDefaults'
import type { SlideData } from '../../data'
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
]

function renderWithTheme(ui: React.ReactNode) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
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
})
