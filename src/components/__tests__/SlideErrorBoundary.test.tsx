import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { SlideRenderer } from '../SlideRenderer'
import { clearRegistry, registerComponent } from '../ComponentRegistry'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { SlideData } from '../../data'
import { theme } from '../../theme'

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    slideError: { message: 'このスライドを表示できませんでした' },
  },
}

function ThrowingComponent(): never {
  throw new Error('テスト用の描画例外')
}

const testSlides: SlideData[] = [
  { id: 'slide-1-ok', layout: 'center', content: { title: '正常なスライド1' } },
  {
    id: 'slide-2-throw',
    layout: 'content',
    content: { title: '例外を投げるスライド', component: { name: 'ThrowingComponent' } },
  },
  { id: 'slide-3-ok', layout: 'center', content: { title: '正常なスライド3' } },
]

function renderSlides(slides: SlideData[]) {
  return render(
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      <ThemeProvider theme={theme}>
        <SlideRenderer slides={slides} />
      </ThemeProvider>
    </I18nProvider>,
  )
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </I18nProvider>
  )
}

describe('SlideErrorBoundary', () => {
  beforeEach(() => {
    clearRegistry()
    registerComponent('ThrowingComponent', ThrowingComponent)
    // React はエラーバウンダリで捕捉された例外もコンソールに出力するため、テスト出力を汚さないよう抑制する
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('1枚が描画時に例外を投げても他のスライドとアプリ全体が描画され続ける', () => {
    renderSlides(testSlides)

    expect(screen.getByText('正常なスライド1')).toBeDefined()
    expect(screen.getByText('正常なスライド3')).toBeDefined()
    expect(screen.getByText('このスライドを表示できませんでした')).toBeDefined()
  })

  it('例外を投げないスライドのみのときはフォールバックが表示されない', () => {
    renderSlides([testSlides[0], testSlides[2]])

    expect(screen.getByText('正常なスライド1')).toBeDefined()
    expect(screen.getByText('正常なスライド3')).toBeDefined()
    expect(screen.queryByText('このスライドを表示できませんでした')).toBeNull()
  })

  // #276/#281 のような「配列を期待するフィールドに非配列が入っていて .map 等が同期的に例外を投げる」再現。
  // content.component 経由の例外（Reactが描画フェーズで呼ぶ）とは発生箇所が異なり、
  // renderSlide 自身（通常の関数呼び出し）の中で投げられる点を別テストで確認する
  it('renderSlide内の通常の関数呼び出し（非配列への.mapアクセス等）が投げる同期例外も捕捉する', () => {
    const slidesWithSyncThrow: SlideData[] = [
      { id: 'slide-1-ok', layout: 'center', content: { title: '正常なスライド1' } },
      { id: 'slide-2-sync-throw', layout: 'content', content: { title: '不正なタイルデータ', tiles: 'array-ではない文字列' } },
      { id: 'slide-3-ok', layout: 'center', content: { title: '正常なスライド3' } },
    ]

    renderSlides(slidesWithSyncThrow)

    expect(screen.getByText('正常なスライド1')).toBeDefined()
    expect(screen.getByText('正常なスライド3')).toBeDefined()
    expect(screen.getByText('このスライドを表示できませんでした')).toBeDefined()
  })

  // 発表者ビュー（PresenterViewWindow）・編集プレビュー（SlidePreview）は SlideRenderer.Slide を
  // key を付けずに再利用し、slide propだけを差し替える。一度例外が起きても、別の正常なスライドに
  // 切り替えたときにフォールバックが残り続けないことを確認する（#280）
  it('同一インスタンスを再利用したまま別スライドに切り替えると、フォールバックが解消される', () => {
    const throwing: SlideData = { id: 'slide-throw', layout: 'content', content: { title: '例外を投げるスライド', component: { name: 'ThrowingComponent' } } }
    const ok: SlideData = { id: 'slide-ok', layout: 'center', content: { title: '別の正常なスライド' } }

    const { rerender } = render(<SlideRenderer.Slide slide={throwing} index={0} total={1} sections={[]} />, { wrapper: Wrapper })
    expect(screen.getByText('このスライドを表示できませんでした')).toBeDefined()

    rerender(<SlideRenderer.Slide slide={ok} index={0} total={1} sections={[]} />)

    expect(screen.getByText('別の正常なスライド')).toBeDefined()
    expect(screen.queryByText('このスライドを表示できませんでした')).toBeNull()
  })
})
