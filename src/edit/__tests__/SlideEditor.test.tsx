import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
vi.mock('../../applyTheme', () => ({ applyTheme: vi.fn().mockResolvedValue(undefined), applyThemeData: vi.fn(), resetThemeOverrides: vi.fn() }))
vi.mock('../../localSlideLoader', () => ({ resolveLocalAssetPaths: (v: unknown) => v, getPackageAddonNames: h.getPackageAddonNames }))

import { SlideEditor } from '../SlideEditor'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'

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

/** 「.tgz 書き出し」を押し、exportSlidePackage に渡された includedAddons を取り出す */
async function exportAndGetIncludedAddons(): Promise<string[]> {
  fireEvent.click(screen.getByRole('button', { name: '.tgz 書き出し' }))
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
