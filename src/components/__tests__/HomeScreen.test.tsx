import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
      removeRecentAria: 'Remove {title}',
      sampleButton: 'Open Sample',
      browseButton: 'Choose File',
      createWithAiButton: 'Create with AI',
      urlButton: 'Open from URL',
      urlPlaceholder: 'https://example.com/deck.spkg',
      urlInputLabel: 'Slide package URL',
      urlSubmit: 'Open',
      urlOpening: 'Opening…',
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
        <HomeScreen recentPackages={[]} onOpenRecent={async () => {}} onRemoveRecent={() => {}} onOpenSample={async () => {}} onBrowse={async () => {}} onCreateWithAi={() => {}} onOpenUrl={async () => {}} />
      </Wrapper>,
    )
    expect(screen.getByText("You haven't opened any slides yet")).toBeDefined()
  })

  it('最近開いたスライドが一覧表示される', () => {
    render(
      <Wrapper>
        <HomeScreen recentPackages={recentPackages} onOpenRecent={async () => {}} onRemoveRecent={() => {}} onOpenSample={async () => {}} onBrowse={async () => {}} onCreateWithAi={() => {}} onOpenUrl={async () => {}} />
      </Wrapper>,
    )
    expect(screen.getByText('Deck A')).toBeDefined()
    expect(screen.getByText('Deck B')).toBeDefined()
  })

  it('最近開いたスライドをクリックすると onOpenRecent が該当 path で呼ばれる', async () => {
    const onOpenRecent = vi.fn()
    render(
      <Wrapper>
        <HomeScreen recentPackages={recentPackages} onOpenRecent={onOpenRecent} onRemoveRecent={() => {}} onOpenSample={async () => {}} onBrowse={async () => {}} onCreateWithAi={() => {}} onOpenUrl={async () => {}} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Deck A'))
    await waitFor(() => expect(onOpenRecent).toHaveBeenCalledWith('/Users/test/deck-a/slides.json'))
  })

  it('削除ボタンをクリックすると onRemoveRecent が該当 path で呼ばれ、onOpenRecent は呼ばれない', () => {
    const onOpenRecent = vi.fn()
    const onRemoveRecent = vi.fn()
    render(
      <Wrapper>
        <HomeScreen recentPackages={recentPackages} onOpenRecent={onOpenRecent} onRemoveRecent={onRemoveRecent} onOpenSample={async () => {}} onBrowse={async () => {}} onCreateWithAi={() => {}} onOpenUrl={async () => {}} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove Deck A' }))
    expect(onRemoveRecent).toHaveBeenCalledWith('/Users/test/deck-a/slides.json')
    expect(onOpenRecent).not.toHaveBeenCalled()
  })

  it('サンプルボタンをクリックすると onOpenSample が呼ばれる', async () => {
    const onOpenSample = vi.fn()
    render(
      <Wrapper>
        <HomeScreen recentPackages={[]} onOpenRecent={async () => {}} onRemoveRecent={() => {}} onOpenSample={onOpenSample} onBrowse={async () => {}} onCreateWithAi={() => {}} onOpenUrl={async () => {}} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Open Sample'))
    await waitFor(() => expect(onOpenSample).toHaveBeenCalledTimes(1))
  })

  it('ファイルを開くボタンをクリックすると onBrowse が呼ばれる', async () => {
    const onBrowse = vi.fn()
    render(
      <Wrapper>
        <HomeScreen recentPackages={[]} onOpenRecent={async () => {}} onRemoveRecent={() => {}} onOpenSample={async () => {}} onBrowse={onBrowse} onCreateWithAi={() => {}} onOpenUrl={async () => {}} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Choose File'))
    await waitFor(() => expect(onBrowse).toHaveBeenCalledTimes(1))
  })

  it('AIで新規作成ボタンをクリックすると onCreateWithAi が呼ばれる', () => {
    const onCreateWithAi = vi.fn()
    render(
      <Wrapper>
        <HomeScreen recentPackages={[]} onOpenRecent={async () => {}} onRemoveRecent={() => {}} onOpenSample={async () => {}} onBrowse={async () => {}} onCreateWithAi={onCreateWithAi} onOpenUrl={async () => {}} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Create with AI'))
    expect(onCreateWithAi).toHaveBeenCalledTimes(1)
  })

  it('URLから開くボタンをクリックすると入力欄が表示され、URLを入力して送信すると onOpenUrl が呼ばれる', async () => {
    const onOpenUrl = vi.fn().mockResolvedValue(undefined)
    render(
      <Wrapper>
        <HomeScreen recentPackages={[]} onOpenRecent={async () => {}} onRemoveRecent={() => {}} onOpenSample={async () => {}} onBrowse={async () => {}} onCreateWithAi={() => {}} onOpenUrl={onOpenUrl} />
      </Wrapper>,
    )
    expect(screen.queryByTestId('home-url-input')).toBeNull()

    fireEvent.click(screen.getByText('Open from URL'))
    const input = screen.getByTestId('home-url-input')
    fireEvent.change(input, { target: { value: 'https://example.com/deck.spkg' } })
    fireEvent.click(screen.getByTestId('home-url-submit'))

    await waitFor(() => expect(onOpenUrl).toHaveBeenCalledWith('https://example.com/deck.spkg'))
  })

  it('URL入力欄が空の場合、開くボタンは無効化される', () => {
    render(
      <Wrapper>
        <HomeScreen recentPackages={[]} onOpenRecent={async () => {}} onRemoveRecent={() => {}} onOpenSample={async () => {}} onBrowse={async () => {}} onCreateWithAi={() => {}} onOpenUrl={async () => {}} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByText('Open from URL'))
    expect((screen.getByTestId('home-url-submit') as HTMLButtonElement).disabled).toBe(true)
  })

  it('ファイルを開く処理中は読み込み中の表示になり、他の操作ボタンが無効化される', async () => {
    let resolveBrowse: () => void = () => {}
    const onBrowse = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBrowse = resolve
        }),
    )
    render(
      <Wrapper>
        <HomeScreen recentPackages={recentPackages} onOpenRecent={async () => {}} onRemoveRecent={() => {}} onOpenSample={async () => {}} onBrowse={onBrowse} onCreateWithAi={() => {}} onOpenUrl={async () => {}} />
      </Wrapper>,
    )

    fireEvent.click(screen.getByTestId('home-browse'))
    await waitFor(() => expect(screen.getByRole('status')).toBeDefined())
    expect((screen.getByTestId('home-browse') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('home-sample') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('home-create-ai') as HTMLButtonElement).disabled).toBe(true)

    resolveBrowse()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect((screen.getByTestId('home-browse') as HTMLButtonElement).disabled).toBe(false)
  })
})
