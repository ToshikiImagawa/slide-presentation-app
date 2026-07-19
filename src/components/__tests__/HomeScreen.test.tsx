import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HomeScreen } from '../HomeScreen'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { RecentSlidePackageEntry } from '../../localSlideLoader'
import type { ReactNode } from 'react'

const enUS: LocaleResource = {
  languageCode: 'en-US',
  languageName: 'English',
  ui: {
    home: {
      goHome: 'Home',
      recentTitle: 'Recently Opened',
      recentEmpty: "You haven't opened any slides yet",
      sampleTitle: 'Sample Slides',
      sampleButton: 'Open Sample',
      browseTitle: 'Open a File',
      browseButton: 'Choose File',
    },
  },
}

const locales = [enUS]

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={locales} defaultLocale="en-US">
      {children}
    </I18nProvider>
  )
}

const recentPackages: RecentSlidePackageEntry[] = [
  { path: '/Users/test/deck-a/slides.json', title: 'Deck A', openedAt: 2 },
  { path: '/Users/test/deck-b/slides.json', title: 'Deck B', openedAt: 1 },
]

describe('HomeScreen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('最近開いたスライドが無い場合、空状態メッセージが表示される', () => {
    render(
      <Wrapper>
        <HomeScreen recentPackages={[]} onOpenRecent={() => {}} onOpenSample={() => {}} onBrowse={() => {}} />
      </Wrapper>,
    )
    expect(screen.getByText("You haven't opened any slides yet")).toBeDefined()
  })

  it('最近開いたスライドが一覧表示される', () => {
    render(
      <Wrapper>
        <HomeScreen recentPackages={recentPackages} onOpenRecent={() => {}} onOpenSample={() => {}} onBrowse={() => {}} />
      </Wrapper>,
    )
    expect(screen.getByText('Deck A')).toBeDefined()
    expect(screen.getByText('Deck B')).toBeDefined()
  })

  it('最近開いたスライドをクリックすると onOpenRecent が該当 path で呼ばれる', () => {
    const onOpenRecent = vi.fn()
    render(
      <Wrapper>
        <HomeScreen recentPackages={recentPackages} onOpenRecent={onOpenRecent} onOpenSample={() => {}} onBrowse={() => {}} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Deck A'))
    expect(onOpenRecent).toHaveBeenCalledWith('/Users/test/deck-a/slides.json')
  })

  it('サンプルボタンをクリックすると onOpenSample が呼ばれる', () => {
    const onOpenSample = vi.fn()
    render(
      <Wrapper>
        <HomeScreen recentPackages={[]} onOpenRecent={() => {}} onOpenSample={onOpenSample} onBrowse={() => {}} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Open Sample'))
    expect(onOpenSample).toHaveBeenCalledTimes(1)
  })

  it('ファイルを開くボタンをクリックすると onBrowse が呼ばれる', () => {
    const onBrowse = vi.fn()
    render(
      <Wrapper>
        <HomeScreen recentPackages={[]} onOpenRecent={() => {}} onOpenSample={() => {}} onBrowse={onBrowse} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Choose File'))
    expect(onBrowse).toHaveBeenCalledTimes(1)
  })
})
