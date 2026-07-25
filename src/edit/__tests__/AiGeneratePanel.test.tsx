import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

// aiGenerate（invoke ラッパ＆オーケストレータ）をモックし、ゲート状態と生成結果を制御する
const h = vi.hoisted(() => ({
  setGenerationEnabled: vi.fn().mockResolvedValue(undefined),
  getApiKeyStatus: vi.fn(),
  checkExternalAvailable: vi.fn().mockResolvedValue(false),
  generateSlides: vi.fn(),
  cancelGenerate: vi.fn().mockResolvedValue(undefined),
  setApiKey: vi.fn().mockResolvedValue(undefined),
  deleteApiKey: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../aiGenerate', () => ({
  setGenerationEnabled: h.setGenerationEnabled,
  getApiKeyStatus: h.getApiKeyStatus,
  checkExternalAvailable: h.checkExternalAvailable,
  generateSlides: h.generateSlides,
  cancelGenerate: h.cancelGenerate,
  setApiKey: h.setApiKey,
  deleteApiKey: h.deleteApiKey,
}))

// SlideEditor 注入テスト用に Tauri 依存モジュールをモック
vi.mock('../../editModeSave', () => ({
  saveSlidesJson: vi.fn(),
  exportSlidePackage: vi.fn(),
  chooseSlidesSavePath: vi.fn(),
  chooseExportDir: vi.fn(),
  enterEditMode: vi.fn(),
  exitEditMode: vi.fn(),
  listBuiltinAddons: () => Promise.resolve([]),
  addBuiltinAddon: vi.fn(),
  removeBuiltinAddon: vi.fn(),
}))
vi.mock('../../applyTheme', () => ({ applyTheme: vi.fn().mockResolvedValue(undefined), applyThemeData: vi.fn(), resetThemeOverrides: vi.fn() }))
vi.mock('../../localSlideLoader', () => ({ resolveLocalAssetPaths: (v: unknown) => v, getPackageAddonNames: () => Promise.resolve([]) }))

import { AiGeneratePanel } from '../AiGeneratePanel'
import { SlideEditor } from '../SlideEditor'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'

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

const VALID = JSON.stringify({ meta: { title: 'T' }, slides: [{ id: 's1', layout: 'center', content: {} }] })

function expandPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'AI 生成' }))
}

describe('AiGeneratePanel 事前ゲート・退避（FR-007/FR-008）', () => {
  beforeEach(() => {
    h.setGenerationEnabled.mockClear()
    h.getApiKeyStatus.mockReset().mockResolvedValue({ configured: false })
    h.checkExternalAvailable.mockReset().mockResolvedValue(false)
    h.generateSlides.mockReset()
  })

  it('マウントで生成を有効化する（capability ゲート・DC-003）', async () => {
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(h.setGenerationEnabled).toHaveBeenCalledWith(true))
  })

  it('内蔵でキー未登録なら、プロンプトを入れても生成ボタンが無効（事前ゲート）', async () => {
    h.getApiKeyStatus.mockResolvedValue({ configured: false })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(h.getApiKeyStatus).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'AI の歴史' } })
    expect((screen.getByRole('button', { name: '生成' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('キー登録済み＆プロンプトありで生成でき、succeeded で onApply に候補を渡す', async () => {
    h.getApiKeyStatus.mockResolvedValue({ configured: true })
    h.generateSlides.mockResolvedValue({ outcome: 'succeeded', slidesJson: VALID, validationErrors: [], attempts: 1 })
    const onApply = vi.fn()
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'AI の歴史' } })
    await waitFor(() => expect((screen.getByRole('button', { name: '生成' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '生成' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(VALID))
  })

  it('failed では onApply を呼ばない（器に触れず退避・FR-008）', async () => {
    h.getApiKeyStatus.mockResolvedValue({ configured: true })
    h.generateSlides.mockResolvedValue({ outcome: 'failed', slidesJson: null, validationErrors: [], attempts: 1 })
    const onApply = vi.fn()
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'p' } })
    await waitFor(() => expect((screen.getByRole('button', { name: '生成' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '生成' }))
    await waitFor(() => expect(h.generateSlides).toHaveBeenCalled())
    expect(onApply).not.toHaveBeenCalled()
  })

  it('cancelled では onApply を呼ばない（退避・FR-008）', async () => {
    h.getApiKeyStatus.mockResolvedValue({ configured: true })
    h.generateSlides.mockResolvedValue({ outcome: 'cancelled', slidesJson: null, validationErrors: [], attempts: 0 })
    const onApply = vi.fn()
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'p' } })
    await waitFor(() => expect((screen.getByRole('button', { name: '生成' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '生成' }))
    await waitFor(() => expect(h.generateSlides).toHaveBeenCalled())
    expect(onApply).not.toHaveBeenCalled()
  })

  it('外部方式で CLI 未検出なら生成ボタンが無効（外部の事前ゲート）', async () => {
    h.getApiKeyStatus.mockResolvedValue({ configured: true })
    h.checkExternalAvailable.mockResolvedValue(false)
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(h.checkExternalAvailable).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'p' } })
    fireEvent.click(screen.getByRole('button', { name: '外部（Claude Code CLI）' }))
    expect((screen.getByRole('button', { name: '生成' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SlideEditor への生成結果の全体置換注入（FR-004/DC-005）', () => {
  beforeEach(() => {
    h.setGenerationEnabled.mockClear()
    h.getApiKeyStatus.mockReset().mockResolvedValue({ configured: true })
    h.checkExternalAvailable.mockReset().mockResolvedValue(false)
    h.generateSlides.mockReset()
  })

  it('生成成功で器の単一真実源 text が置換され、フォームに反映される', async () => {
    const generated = JSON.stringify({ meta: { title: 'GENERATED' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    h.generateSlides.mockResolvedValue({ outcome: 'succeeded', slidesJson: generated, validationErrors: [], attempts: 1 })

    render(
      <Wrapper>
        <SlideEditor source={{ rawText: VALID, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )

    expandPanel()
    fireEvent.change(screen.getByLabelText('プロンプト'), { target: { value: 'AI の歴史' } })
    // 生成ボタンを押下（キー登録済み＆プロンプトありで有効）
    await waitFor(() => expect((screen.getByRole('button', { name: '生成' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '生成' }))

    // 全体置換で meta.title がフォームへ反映される
    await waitFor(() => expect(screen.getByDisplayValue('GENERATED')).toBeTruthy())
  })
})
