import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

// Tauri 依存（invoke/dialog）を持つモジュールをモックして jsdom で描画可能にする
const h = vi.hoisted(() => ({
  saveSlidesJson: vi.fn(),
  exportSlidePackage: vi.fn(),
  chooseSlidesSavePath: vi.fn(),
  chooseExportDir: vi.fn(),
}))
vi.mock('../../editModeSave', () => ({
  saveSlidesJson: h.saveSlidesJson,
  exportSlidePackage: h.exportSlidePackage,
  chooseSlidesSavePath: h.chooseSlidesSavePath,
  chooseExportDir: h.chooseExportDir,
  enterEditMode: vi.fn(),
  exitEditMode: vi.fn(),
  listBuiltinAddons: () => Promise.resolve([]),
  addBuiltinAddon: vi.fn(),
  removeBuiltinAddon: vi.fn(),
}))
vi.mock('../../applyTheme', () => ({ applyTheme: vi.fn().mockResolvedValue(undefined), applyThemeData: vi.fn(), resetThemeOverrides: vi.fn() }))
vi.mock('../../localSlideLoader', () => ({ resolveLocalAssetPaths: (v: unknown) => v, getPackageAddonNames: () => Promise.resolve([]) }))

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

describe('SlideEditor 保存前バリデーション（FR-005）', () => {
  beforeEach(() => {
    h.saveSlidesJson.mockReset()
    h.exportSlidePackage.mockReset()
    h.chooseSlidesSavePath.mockReset().mockResolvedValue('/tmp/slides.json')
    h.chooseExportDir.mockReset()
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
