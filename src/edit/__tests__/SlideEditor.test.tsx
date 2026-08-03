import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

// Tauri 依存（invoke/dialog）を持つモジュールをモックして jsdom で描画可能にする
const h = vi.hoisted(() => ({
  saveSlidesJson: vi.fn(),
  exportSlidePackage: vi.fn(),
  chooseSlidesSavePath: vi.fn(),
  chooseExportDir: vi.fn(),
  listBuiltinAddons: vi.fn(),
  listBuiltinDistAddons: vi.fn(),
  getPackageAddonNames: vi.fn(),
  removeBuiltinAddon: vi.fn(),
  buildBuiltinAddons: vi.fn(),
  pickBrandTemplate: vi.fn(),
  loadBrandOverrides: vi.fn(),
  saveBrandOverrides: vi.fn(),
  resolveBrandTheme: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../editModeSave', () => ({
  saveSlidesJson: h.saveSlidesJson,
  exportSlidePackage: h.exportSlidePackage,
  chooseSlidesSavePath: h.chooseSlidesSavePath,
  chooseExportDir: h.chooseExportDir,
  enterEditMode: vi.fn(),
  exitEditMode: vi.fn(),
  listBuiltinAddons: h.listBuiltinAddons,
  listBuiltinDistAddons: h.listBuiltinDistAddons,
  addBuiltinAddon: vi.fn(),
  removeBuiltinAddon: h.removeBuiltinAddon,
  buildBuiltinAddons: h.buildBuiltinAddons,
}))
// getContrastRatio/normalizeHex は BrandConfirmDialog 経由の compile（#168）が使うため実装を残す（importOriginal）。
// DOM を書き換える関数のみモックする
vi.mock('../../applyTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../applyTheme')>()
  return { ...actual, applyTheme: vi.fn().mockResolvedValue(undefined), applyThemeData: vi.fn(), resetThemeOverrides: vi.fn(), applyPresentationTheme: vi.fn().mockResolvedValue(true) }
})
vi.mock('../../localSlideLoader', () => ({ resolveLocalAssetPaths: (v: unknown) => v, getPackageAddonNames: h.getPackageAddonNames, resolveBrandTheme: h.resolveBrandTheme }))
vi.mock('../../brand/io', () => ({ pickBrandTemplate: h.pickBrandTemplate, loadBrandOverrides: h.loadBrandOverrides, saveBrandOverrides: h.saveBrandOverrides }))

import { SlideEditor } from '../SlideEditor'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { BrandProfile } from '../../brand/types'

// jsdom には ResizeObserver が無いので stub（SlidePreview が使用）
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub

const locales: LocaleResource[] = [{ languageCode: 'ja-JP', languageName: '日本語', ui: {} }]
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={locales} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

const validJson = JSON.stringify({ meta: { title: 'T' }, slides: [{ id: 's1', layout: 'center', content: { title: 'T' } }] }, null, 2)
// id 欠落のスキーマ破損データ
const brokenJson = JSON.stringify({ meta: { title: 'T' }, slides: [{ layout: 'center', content: {} }] }, null, 2)

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
}

function exportButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '.spkg 書き出し' }) as HTMLButtonElement
}

/** assets/locales/ja-JP.json の edit.packageNameHint（自動生成値の確認を促すヒント） */
const PACKAGE_NAME_HINT = 'スライドタイトルから自動生成された値です。書き出し前に確認・修正してください'

/** 「.spkg 書き出し」を押し、exportSlidePackage に渡された includedAddons を取り出す */
async function exportAndGetIncludedAddons(): Promise<string[]> {
  fireEvent.click(exportButton())
  await waitFor(() => expect(h.exportSlidePackage).toHaveBeenCalled())
  const opts = h.exportSlidePackage.mock.calls[0][1] as { includedAddons: string[] }
  return opts.includedAddons
}

describe('SlideEditor 保存前バリデーション（FR-005）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset()
    h.listBuiltinAddons.mockReset().mockResolvedValue([])
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
  })

  it('妥当な JSON では保存が有効で、saveSlidesJson が編集テキストで呼ばれる', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )

    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())

    await waitFor(() => expect(h.saveSlidesJson).toHaveBeenCalledWith('/tmp/slides.json', validJson))
  })

  it('スキーマ破損（id 欠落）では保存が無効になる', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: brokenJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => expect(saveButton().disabled).toBe(true))
  })

  it('source.aiPanelExpanded=true のとき AI 生成パネルが展開済みで表示される（#42 AIで新規作成）', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '', aiPanelExpanded: true }} onExit={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'AI 生成' }).getAttribute('aria-expanded')).toBe('true'))
  })

  it('破損データで保存を試みても保存されない（default へフォールバックして上書きしない）', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: brokenJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => expect(saveButton().disabled).toBe(true))
    fireEvent.click(saveButton())

    expect(h.saveSlidesJson).not.toHaveBeenCalled()
  })
})

describe('SlideEditor 同梱アドオン選択（②・層A∪層B・0件表示）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset()
    h.listBuiltinAddons.mockReset().mockResolvedValue([])
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
  })

  it('同梱可能なアドオンが無いとき、UI を消さず「同梱できるアドオンがありません」を明示する', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
  })

  it('層B（パッケージ）と層A（組み込み）を和集合で候補表示し、層Bは既定選択・層Aは既定未選択', async () => {
    h.getPackageAddonNames.mockResolvedValue(['pkg-a'])
    h.listBuiltinDistAddons.mockResolvedValue(['builtin-b'])
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '/pkg' }} onExit={() => {}} />
      </Wrapper>,
    )
    // 両方が候補チェックボックスとして現れる
    const pkg = (await screen.findByLabelText('pkg-a')) as HTMLInputElement
    const builtin = screen.getByLabelText('builtin-b') as HTMLInputElement
    // 層B は既定で選択、層A（組み込み）はオプトインで既定未選択
    expect(pkg.checked).toBe(true)
    expect(builtin.checked).toBe(false)
    // 「同梱できるアドオンがありません」は出ない
    expect(screen.queryByText('同梱できるアドオンがありません')).toBeNull()
  })

  it('層Bの×ボタンでチェックを外し、パッケージから除外できる（層Aと統一した削除導線・#36）', async () => {
    h.getPackageAddonNames.mockResolvedValue(['pkg-a'])
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '/pkg' }} onExit={() => {}} />
      </Wrapper>,
    )
    const pkg = (await screen.findByLabelText('pkg-a')) as HTMLInputElement
    expect(pkg.checked).toBe(true)
    const x = screen.getByRole('button', { name: 'pkg-a をパッケージから除外' }) as HTMLButtonElement
    fireEvent.click(x)
    expect(pkg.checked).toBe(false)
    // 除外済みの×は再度押しても効果がないよう無効化される
    expect(x.disabled).toBe(true)
  })

  it('#35 再現調査: 層Bの×でチェックを外して書き出すと、includedAddons から除外される', async () => {
    h.getPackageAddonNames.mockResolvedValue(['pkg-a', 'pkg-b'])
    h.chooseExportDir.mockResolvedValue('/out')
    h.exportSlidePackage.mockResolvedValue('/out/slides.tgz')
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '/pkg' }} onExit={() => {}} />
      </Wrapper>,
    )
    await screen.findByLabelText('pkg-a')
    const x = screen.getByRole('button', { name: 'pkg-a をパッケージから除外' })
    fireEvent.click(x)
    const includedAddons = await exportAndGetIncludedAddons()
    expect(includedAddons).not.toContain('pkg-a')
    expect(includedAddons).toContain('pkg-b')
  })

  it('層Aのチェックを入れて書き出すと、選択集合に組み込みアドオンが含まれて export される', async () => {
    h.getPackageAddonNames.mockResolvedValue(['pkg-a'])
    h.listBuiltinDistAddons.mockResolvedValue(['builtin-b'])
    h.chooseExportDir.mockResolvedValue('/out')
    h.exportSlidePackage.mockResolvedValue('/out/slides.tgz')
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '/pkg' }} onExit={() => {}} />
      </Wrapper>,
    )
    const builtin = (await screen.findByLabelText('builtin-b')) as HTMLInputElement
    fireEvent.click(builtin) // 層A をオプトインで選択
    const includedAddons = await exportAndGetIncludedAddons()
    expect(includedAddons).toEqual(expect.arrayContaining(['pkg-a', 'builtin-b']))
  })
})

describe('SlideEditor 組み込みアドオン削除の確認（× 誤クリックでの完全削除を防ぐ）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset()
    h.listBuiltinAddons.mockReset().mockResolvedValue(['ai-sdd-visuals']) // dev パネルに 1 件表示
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
    h.removeBuiltinAddon.mockReset().mockResolvedValue(undefined)
    h.buildBuiltinAddons.mockReset().mockResolvedValue(undefined)
  })

  it('× で即削除せず確認ダイアログを開き、[削除する] で removeBuiltinAddon を呼ぶ', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    const x = await screen.findByRole('button', { name: 'ai-sdd-visuals を削除' })
    fireEvent.click(x)
    // 即削除されない（確認を挟む）
    expect(h.removeBuiltinAddon).not.toHaveBeenCalled()
    // 確認ダイアログの [削除する] で初めて削除される
    fireEvent.click(await screen.findByRole('button', { name: '削除する' }))
    await waitFor(() => expect(h.removeBuiltinAddon).toHaveBeenCalledWith('ai-sdd-visuals'))
  })

  it('確認ダイアログで [キャンセル] なら削除しない', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'ai-sdd-visuals を削除' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    expect(h.removeBuiltinAddon).not.toHaveBeenCalled()
  })
})

describe('SlideEditor 未保存変更の終了確認（編集モード終了時のデータ損失防止・#44）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset()
    h.listBuiltinAddons.mockReset().mockResolvedValue([])
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
  })

  it('変更がなければ確認なしで即 onExit が呼ばれる', async () => {
    const onExit = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={onExit} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '編集を終了' }))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('未保存の変更を破棄しますか？')).toBeNull()
  })

  it('未保存の変更があると確認ダイアログを開き、onExit は呼ばれない', async () => {
    const onExit = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={onExit} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    await userEvent.type(screen.getByLabelText('slides.json'), ' ')
    fireEvent.click(screen.getByRole('button', { name: '編集を終了' }))
    expect(await screen.findByText('未保存の変更を破棄しますか？')).toBeTruthy()
    expect(onExit).not.toHaveBeenCalled()
  })

  it('確認ダイアログで [破棄して終了] を選ぶと onExit が呼ばれる', async () => {
    const onExit = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={onExit} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    await userEvent.type(screen.getByLabelText('slides.json'), ' ')
    fireEvent.click(screen.getByRole('button', { name: '編集を終了' }))
    fireEvent.click(await screen.findByRole('button', { name: '破棄して終了' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('確認ダイアログで [キャンセル] を選ぶと編集画面に留まり onExit は呼ばれない', async () => {
    const onExit = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={onExit} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    await userEvent.type(screen.getByLabelText('slides.json'), ' ')
    fireEvent.click(screen.getByRole('button', { name: '編集を終了' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    expect(onExit).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('未保存の変更を破棄しますか？')).toBeNull())
  })
})

describe('SlideEditor 外部からのオープン要求（OS のファイル関連付け・#105）', () => {
  const REQUESTED_PATH = '/Users/me/Documents/other.spkg'
  const OPEN_CONFIRM_TITLE = '未保存の変更を破棄して開きますか？'

  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset()
    h.listBuiltinAddons.mockReset().mockResolvedValue([])
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
  })

  /** 未保存の変更を作ってから外部のオープン要求が届いた状態まで進める（＝確認ダイアログ表示済み） */
  async function renderWithPendingOpen(handlers: { onExit?: () => void; onResolveOpen?: (confirmed: boolean) => void } = {}) {
    const editor = (openRequestPath: string | null) => (
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={handlers.onExit ?? (() => {})} openRequestPath={openRequestPath} onResolveOpen={handlers.onResolveOpen ?? (() => {})} />
      </Wrapper>
    )
    const { rerender } = render(editor(null))
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    await userEvent.type(screen.getByLabelText('slides.json'), ' ')
    // 編集中に外部からオープン要求が届く
    rerender(editor(REQUESTED_PATH))
    await screen.findByText(OPEN_CONFIRM_TITLE)
  }

  it('未保存の変更がなければ確認なしで即 onResolveOpen(true) が呼ばれる', async () => {
    const onResolveOpen = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} openRequestPath={REQUESTED_PATH} onResolveOpen={onResolveOpen} />
      </Wrapper>,
    )
    await waitFor(() => expect(onResolveOpen).toHaveBeenCalledWith(true))
    expect(screen.queryByText(OPEN_CONFIRM_TITLE)).toBeNull()
  })

  it('未保存の変更があると確認ダイアログを開き、まだ onResolveOpen は呼ばれない', async () => {
    const onResolveOpen = vi.fn()
    await renderWithPendingOpen({ onResolveOpen })
    expect(onResolveOpen).not.toHaveBeenCalled()
  })

  it('確認ダイアログで [破棄して開く] を選ぶと onResolveOpen(true) が呼ばれる', async () => {
    const onResolveOpen = vi.fn()
    await renderWithPendingOpen({ onResolveOpen })
    fireEvent.click(screen.getByRole('button', { name: '破棄して開く' }))
    expect(onResolveOpen).toHaveBeenCalledWith(true)
  })

  it('確認ダイアログで [キャンセル] を選ぶと編集画面に留まり onResolveOpen(false) が呼ばれる', async () => {
    const onResolveOpen = vi.fn()
    await renderWithPendingOpen({ onResolveOpen })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onResolveOpen).toHaveBeenCalledWith(false)
    await waitFor(() => expect(screen.queryByText(OPEN_CONFIRM_TITLE)).toBeNull())
  })

  it('オープン確認ダイアログ表示中の Esc は編集終了を発火させない（二重発火ガード）', async () => {
    const onExit = vi.fn()
    await renderWithPendingOpen({ onExit })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).not.toHaveBeenCalled()
    expect(screen.queryByText('未保存の変更を破棄しますか？')).toBeNull()
  })
})

describe('SlideEditor 組み込みアドオンのアプリ内ビルド（ターミナル不要）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset()
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
    h.removeBuiltinAddon.mockReset().mockResolvedValue(undefined)
    h.buildBuiltinAddons.mockReset().mockResolvedValue(undefined)
  })

  it('「ビルド」で buildBuiltinAddons を呼び、同梱候補（dist）を更新して即反映する', async () => {
    h.listBuiltinAddons.mockReset().mockResolvedValue(['newaddon']) // src にあり dev パネルに表示
    // 初回（マウント時）は未ビルドで候補なし → ビルド後は newaddon が候補に出る
    h.listBuiltinDistAddons.mockReset().mockResolvedValueOnce([]).mockResolvedValue(['newaddon'])
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    // 初期は同梱候補なし
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    // ビルド実行
    fireEvent.click(await screen.findByRole('button', { name: 'ビルド' }))
    await waitFor(() => expect(h.buildBuiltinAddons).toHaveBeenCalled())
    // ビルド後、同梱候補に newaddon が現れる
    await waitFor(() => expect(screen.getByLabelText('newaddon')).toBeTruthy())
  })
})

describe('SlideEditor パッケージ名・バージョンの入力検証（#88）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset().mockResolvedValue('/out')
    h.exportSlidePackage.mockResolvedValue('/out/slides.spkg')
    h.listBuiltinAddons.mockReset().mockResolvedValue([])
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
  })

  it('自動生成された初期値は検証を通過し、書き出しボタンが有効', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(exportButton().disabled).toBe(false))
  })

  it('未編集の間はパッケージ名フィールドに確認を促すヒントが表示される', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    expect(await screen.findByTitle(PACKAGE_NAME_HINT)).toBeTruthy()
  })

  it('パッケージ名に不正な文字（大文字・空白）を入力すると検証エラーが表示され、書き出せない', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.change(screen.getByLabelText('パッケージ名'), { target: { value: 'My Slides' } })
    expect(await screen.findByTitle('パッケージ名は小文字英数字・ハイフン・アンダースコアのみ使用でき、先頭は英数字にしてください')).toBeTruthy()
    expect(exportButton().disabled).toBe(true)
    fireEvent.click(exportButton())
    expect(h.exportSlidePackage).not.toHaveBeenCalled()
  })

  it('パッケージ名を空にすると必須エラーが表示され、書き出せない', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.change(screen.getByLabelText('パッケージ名'), { target: { value: '' } })
    expect(await screen.findByTitle('パッケージ名を入力してください')).toBeTruthy()
    expect(exportButton().disabled).toBe(true)
  })

  it('バージョンが semver 形式でないと検証エラーが表示され、書き出せない', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.change(screen.getByLabelText('バージョン'), { target: { value: 'v1.0' } })
    expect(await screen.findByText('バージョンは major.minor.patch 形式（例: 1.0.0）で入力してください')).toBeTruthy()
    expect(exportButton().disabled).toBe(true)
  })

  it('有効な値に修正すると書き出しが有効になり、入力値がそのまま exportSlidePackage に渡る', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.change(screen.getByLabelText('パッケージ名'), { target: { value: 'my-deck' } })
    fireEvent.change(screen.getByLabelText('バージョン'), { target: { value: '2.1.0' } })
    // 手動編集後はヒントが消える
    expect(screen.queryByTitle(PACKAGE_NAME_HINT)).toBeNull()

    fireEvent.click(exportButton())
    await waitFor(() => expect(h.exportSlidePackage).toHaveBeenCalled())
    const opts = h.exportSlidePackage.mock.calls[0][1] as { name: string; version: string }
    expect(opts.name).toBe('my-deck')
    expect(opts.version).toBe('2.1.0')
  })
})

describe('SlideEditor パッケージ名・バージョンの package.json 復元（#88 の続き）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset().mockResolvedValue('/out/slides.spkg')
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset().mockResolvedValue('/out')
    h.listBuiltinAddons.mockReset().mockResolvedValue([])
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
  })

  it('package.json 由来の name/version が初期値になり、自動生成ヒントを出さない', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '/pkg', packageName: 'restored-deck', packageVersion: '3.2.1' }} onExit={() => {}} />
      </Wrapper>,
    )

    expect((screen.getByLabelText('パッケージ名') as HTMLInputElement).value).toBe('restored-deck')
    expect((screen.getByLabelText('バージョン') as HTMLInputElement).value).toBe('3.2.1')
    // package.json 由来の値は自動生成ではないのでヒントは出さない
    expect(screen.queryByTitle(PACKAGE_NAME_HINT)).toBeNull()

    fireEvent.click(exportButton())
    await waitFor(() => expect(h.exportSlidePackage).toHaveBeenCalled())
    const opts = h.exportSlidePackage.mock.calls[0][1] as { name: string; version: string }
    expect(opts.name).toBe('restored-deck')
    expect(opts.version).toBe('3.2.1')
  })

  it('package.json が無い（name/version が null）なら meta.title からの自動生成にフォールバックし、ヒントを表示する', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '/pkg', packageName: null, packageVersion: null }} onExit={() => {}} />
      </Wrapper>,
    )

    expect(await screen.findByTitle(PACKAGE_NAME_HINT)).toBeTruthy()
    expect((screen.getByLabelText('パッケージ名') as HTMLInputElement).value).toBe('t')
    expect((screen.getByLabelText('バージョン') as HTMLInputElement).value).toBe('1.0.0')
  })

  it('パッケージ名の中間・末尾のアンダースコアは有効な値として扱われる', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '/pkg', packageName: 'sdd-workflow_af_ja_dena', packageVersion: '1.0.0' }} onExit={() => {}} />
      </Wrapper>,
    )

    expect((screen.getByLabelText('パッケージ名') as HTMLInputElement).value).toBe('sdd-workflow_af_ja_dena')
    await waitFor(() => expect(exportButton().disabled).toBe(false))
  })

  it('検証に通らない name（CLI 書き出しのドット等）もそのまま初期値になり、検証エラーで修正を促す', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '/pkg', packageName: 'sdd-workflow.af.ja.dena', packageVersion: '1.0.0' }} onExit={() => {}} />
      </Wrapper>,
    )

    expect((screen.getByLabelText('パッケージ名') as HTMLInputElement).value).toBe('sdd-workflow.af.ja.dena')
    expect(screen.getByTitle('パッケージ名は小文字英数字・ハイフン・アンダースコアのみ使用でき、先頭は英数字にしてください')).toBeTruthy()
    expect(exportButton().disabled).toBe(true)
  })
})

describe('SlideEditor キーボードショートカット（#91: Cmd/Ctrl+S 保存・Esc 終了）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset()
    h.listBuiltinAddons.mockReset().mockResolvedValue([])
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
  })

  it('Ctrl+S で保存される（フォーカスがどこにあっても発火する）', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await waitFor(() => expect(h.saveSlidesJson).toHaveBeenCalledWith('/tmp/slides.json', validJson))
  })

  it('JSON textarea にフォーカスがあっても Cmd+S で保存される', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    const editor = screen.getByLabelText('slides.json')
    editor.focus()
    fireEvent.keyDown(editor, { key: 's', metaKey: true })
    await waitFor(() => expect(h.saveSlidesJson).toHaveBeenCalledWith('/tmp/slides.json', validJson))
  })

  it('未保存の変更がなければ Esc で即 onExit が呼ばれる', async () => {
    const onExit = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={onExit} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('未保存の変更があれば Esc で確認ダイアログが開き、onExit は呼ばれない', async () => {
    const onExit = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={onExit} />
      </Wrapper>,
    )
    await userEvent.type(screen.getByLabelText('slides.json'), ' ')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(await screen.findByText('未保存の変更を破棄しますか？')).toBeTruthy()
    expect(onExit).not.toHaveBeenCalled()
  })

  it('テキスト入力中の Esc は無視され、編集終了は発火しない', async () => {
    const onExit = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={onExit} />
      </Wrapper>,
    )
    const editor = screen.getByLabelText('slides.json')
    editor.focus()
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(onExit).not.toHaveBeenCalled()
    expect(screen.queryByText('未保存の変更を破棄しますか？')).toBeNull()
  })

  it('rootDialogOpen 中の Esc は編集終了を発火させない（Root のダイアログのみ閉じる想定・#126 二重発火ガード）', async () => {
    const onExit = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={onExit} rootDialogOpen />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('同梱できるアドオンがありません')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).not.toHaveBeenCalled()
  })
})

describe('SlideEditor 設定ボタン（#126: 編集画面から設定ダイアログを開く）', () => {
  beforeEach(() => {
    h.listBuiltinAddons.mockReset().mockResolvedValue([])
    h.listBuiltinDistAddons.mockReset().mockResolvedValue([])
    h.getPackageAddonNames.mockReset().mockResolvedValue([])
  })

  it('ツールバーに設定ボタンが表示され、クリックで onOpenSettings が呼ばれる', async () => {
    const onOpenSettings = vi.fn()
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} onOpenSettings={onOpenSettings} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByTestId('settings-open'))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('onOpenSettings 未指定でもクリックが落ちない', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    expect(() => fireEvent.click(screen.getByTestId('settings-open'))).not.toThrow()
  })
})

describe('SlideEditor ブランドテーマの取り込み（#168）', () => {
  const brandProfile: BrandProfile = {
    name: 'Corporate',
    themePart: 'ppt/theme/theme1.xml',
    slideMasterPart: 'ppt/slideMasters/slideMaster1.xml',
    templateHash: 'a'.repeat(64),
    slideSize: { widthEmu: 12_192_000, heightEmu: 6_858_000 },
    thumbnail: null,
    logoCandidates: [],
    bandCandidates: [],
    mappedColors: { bg1: '#ffffff', tx1: '#000000', bg2: null, tx2: null, accent1: '#1f4e79', accent2: null, accent3: null, accent4: null, accent5: null, accent6: null, hlink: null, folHlink: null },
    fonts: { major: { latin: 'Trebuchet MS', ea: null, cs: null, jpan: null }, minor: { latin: null, ea: null, cs: null, jpan: null } },
  }

  function importButton(): HTMLButtonElement {
    return screen.getByRole('button', { name: 'ブランドテーマを取り込む' }) as HTMLButtonElement
  }

  beforeEach(() => {
    h.pickBrandTemplate.mockReset()
    h.loadBrandOverrides.mockReset().mockResolvedValue({})
    h.saveBrandOverrides.mockReset().mockResolvedValue(undefined)
  })

  it('選択をキャンセルすると確認ダイアログを開かない', async () => {
    h.pickBrandTemplate.mockResolvedValue(null)
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.click(importButton())
    await waitFor(() => expect(h.pickBrandTemplate).toHaveBeenCalledTimes(1))
    expect(h.loadBrandOverrides).not.toHaveBeenCalled()
    expect(screen.queryByText('ブランドテーマの取り込み確認')).toBeNull()
  })

  it('テンプレートを抽出すると保存済み上書きを読み込んで確認ダイアログを開く', async () => {
    h.pickBrandTemplate.mockResolvedValue(brandProfile)
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.click(importButton())
    await waitFor(() => expect(screen.getByText('ブランドテーマの取り込み確認')).toBeTruthy())
    expect(h.loadBrandOverrides).toHaveBeenCalledWith(brandProfile.templateHash)
  })

  it('[取り込む] で上書きを保存し、器へ masters/masterMap/tokens を合成して反映する', async () => {
    h.pickBrandTemplate.mockResolvedValue(brandProfile)
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.click(importButton())
    await waitFor(() => expect(screen.getByText('ブランドテーマの取り込み確認')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    await waitFor(() => expect(h.saveBrandOverrides).toHaveBeenCalledWith(brandProfile.templateHash, expect.anything()))
    await waitFor(() => expect(screen.getByText('ブランドテーマを取り込みました')).toBeTruthy())
    // ダイアログは閉じている
    expect(screen.queryByText('ブランドテーマの取り込み確認')).toBeNull()
    // masters に brand キーが合成され、center レイアウトに割り当てられている（SlideMetaForm のマスター選択セレクトの表示値で確認）
    expect(screen.getByRole('combobox', { name: 'マスター: center' }).textContent).toBe('brand')
  })

  it('[キャンセル] では上書きを保存せずダイアログを閉じる', async () => {
    h.pickBrandTemplate.mockResolvedValue(brandProfile)
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    fireEvent.click(importButton())
    await waitFor(() => expect(screen.getByText('ブランドテーマの取り込み確認')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    await waitFor(() => expect(screen.queryByText('ブランドテーマの取り込み確認')).toBeNull())
    expect(h.saveBrandOverrides).not.toHaveBeenCalled()
  })
})

describe('SlideEditor themeColors 委譲（#172）', () => {
  const themeColorsJson = JSON.stringify({ meta: { title: 'T', themeColors: '/theme/theme-colors.json' }, slides: [{ id: 's1', layout: 'center', content: { title: 'T' } }] }, null, 2)
  const themeColorsWithBrandJson = JSON.stringify({ meta: { title: 'T', themeColors: '/theme/theme-colors.json', brandTheme: '/theme/brand.json' }, slides: [{ id: 's1', layout: 'center', content: { title: 'T' } }] }, null, 2)

  beforeEach(() => {
    h.resolveBrandTheme.mockReset().mockResolvedValue(undefined)
    h.saveSlidesJson.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ primary: '#112233', accent: '#445566' }) }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('meta.themeColors が無ければレポートを表示しない', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: validJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    expect(screen.queryByText(/このデッキが自前指定していて組織テーマが効かない項目/)).toBeNull()
  })

  it('meta.themeColors のキー数をレポートし、brand 未解決の間は委譲ボタンを無効化する', async () => {
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: themeColorsJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText(/2件/)).toBeTruthy())
    expect((screen.getByRole('button', { name: 'themeColors を委譲する' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('brand 解決済みなら [themeColors を委譲する] で brand と異なるキーだけ theme.colors へ残し、meta.themeColors を撤去する', async () => {
    h.resolveBrandTheme.mockResolvedValue({ colors: { primary: '#112233' } })
    render(
      <Wrapper>
        <SlideEditor source={{ rawText: themeColorsWithBrandJson, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText(/2件/)).toBeTruthy())
    const button = await waitFor(() => {
      const el = screen.getByRole('button', { name: 'themeColors を委譲する' }) as HTMLButtonElement
      expect(el.disabled).toBe(false)
      return el
    })
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText('themeColors を組織テーマへ委譲しました')).toBeTruthy())

    fireEvent.click(saveButton())
    await waitFor(() => expect(h.saveSlidesJson).toHaveBeenCalled())
    const savedText = h.saveSlidesJson.mock.calls[0][1] as string
    const savedData = JSON.parse(savedText)
    expect(savedData.meta.themeColors).toBeUndefined()
    expect(savedData.theme.colors).toEqual({ accent: '#445566' })
  })
})
