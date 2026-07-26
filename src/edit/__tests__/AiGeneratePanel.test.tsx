import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

// aiGenerate（invoke ラッパ＆オーケストレータ）をモックし、ゲート状態と生成結果を制御する
const h = vi.hoisted(() => ({
  setGenerationEnabled: vi.fn().mockResolvedValue(undefined),
  getVertexConfig: vi.fn(),
  getVertexStatus: vi.fn(),
  checkExternalAvailable: vi.fn().mockResolvedValue(false),
  generateSlides: vi.fn(),
  cancelGenerate: vi.fn().mockResolvedValue(undefined),
  setVertexConfig: vi.fn().mockResolvedValue(undefined),
  clearVertexConfig: vi.fn().mockResolvedValue(undefined),
  gcloudLogin: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../aiGenerate', () => ({
  setGenerationEnabled: h.setGenerationEnabled,
  getVertexConfig: h.getVertexConfig,
  getVertexStatus: h.getVertexStatus,
  checkExternalAvailable: h.checkExternalAvailable,
  generateSlides: h.generateSlides,
  cancelGenerate: h.cancelGenerate,
  setVertexConfig: h.setVertexConfig,
  clearVertexConfig: h.clearVertexConfig,
  gcloudLogin: h.gcloudLogin,
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
  listBuiltinDistAddons: () => Promise.resolve([]),
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
function promptField(): HTMLElement {
  return screen.getByLabelText('プロンプト')
}
function generateButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '生成' }) as HTMLButtonElement
}

describe('AiGeneratePanel 事前ゲート・退避（Vertex・FR-007/FR-008）', () => {
  beforeEach(() => {
    h.setGenerationEnabled.mockClear()
    h.getVertexConfig.mockReset().mockResolvedValue(null)
    h.getVertexStatus.mockReset().mockResolvedValue({ configured: false })
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

  it('トグルボタンの aria-expanded が展開状態と一致する（#34）', async () => {
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    // マウント時の Vertex 設定取得（無関係な effect）を先に解決させ、クリック時の act() 警告を避ける
    await waitFor(() => expect(h.getVertexStatus).toHaveBeenCalled())
    const toggleButton = screen.getByRole('button', { name: 'AI 生成' })
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggleButton)
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggleButton)
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')
  })

  it('内蔵で Vertex 未設定なら、プロンプトを入れても生成ボタンが無効（事前ゲート）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: false })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(h.getVertexStatus).toHaveBeenCalled())
    fireEvent.change(promptField(), { target: { value: 'AI の歴史' } })
    expect(generateButton().disabled).toBe(true)
  })

  it('Vertex 設定済み＆プロンプトありで生成でき、succeeded で onApply に候補を渡す', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    h.generateSlides.mockResolvedValue({ outcome: 'succeeded', slidesJson: VALID, validationErrors: [], attempts: 1 })
    const onApply = vi.fn()
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(promptField(), { target: { value: 'AI の歴史' } })
    await waitFor(() => expect(generateButton().disabled).toBe(false))
    fireEvent.click(generateButton())
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ slidesJson: VALID, validationErrors: [] }))
  })

  it('exhausted でも onApply に候補と残存 validationErrors を渡す（#47）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    const validationErrors = [{ path: 'slides[0].content.title', message: '必須項目です', expected: 'string', actual: 'undefined' }]
    h.generateSlides.mockResolvedValue({ outcome: 'exhausted', slidesJson: VALID, validationErrors, attempts: 3 })
    const onApply = vi.fn()
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(promptField(), { target: { value: 'AI の歴史' } })
    await waitFor(() => expect(generateButton().disabled).toBe(false))
    fireEvent.click(generateButton())
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ slidesJson: VALID, validationErrors }))
  })

  it('failed では onApply を呼ばない（器に触れず退避・FR-008）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    h.generateSlides.mockResolvedValue({ outcome: 'failed', slidesJson: null, validationErrors: [], attempts: 1 })
    const onApply = vi.fn()
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(promptField(), { target: { value: 'p' } })
    await waitFor(() => expect(generateButton().disabled).toBe(false))
    fireEvent.click(generateButton())
    await waitFor(() => expect(h.generateSlides).toHaveBeenCalled())
    expect(onApply).not.toHaveBeenCalled()
  })

  it('cancelled では onApply を呼ばない（退避・FR-008）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    h.generateSlides.mockResolvedValue({ outcome: 'cancelled', slidesJson: null, validationErrors: [], attempts: 0 })
    const onApply = vi.fn()
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(promptField(), { target: { value: 'p' } })
    await waitFor(() => expect(generateButton().disabled).toBe(false))
    fireEvent.click(generateButton())
    await waitFor(() => expect(h.generateSlides).toHaveBeenCalled())
    expect(onApply).not.toHaveBeenCalled()
  })

  it('設定を保存すると setVertexConfig が入力値で呼ばれ、生成が有効化される', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: false })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(screen.getByLabelText('GCP プロジェクト ID'), { target: { value: 'my-proj' } })
    fireEvent.change(screen.getByLabelText('リージョン'), { target: { value: 'us-east5' } })
    fireEvent.change(screen.getByLabelText('モデル ID'), { target: { value: 'claude-sonnet-4-5@20250929' } })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    await waitFor(() => expect(h.setVertexConfig).toHaveBeenCalledWith({ projectId: 'my-proj', region: 'us-east5', model: 'claude-sonnet-4-5@20250929' }))
    // 保存後は configured=true になりプロンプトありで生成有効
    fireEvent.change(promptField(), { target: { value: 'p' } })
    await waitFor(() => expect(generateButton().disabled).toBe(false))
  })

  it('外部方式で CLI 未検出なら生成ボタンが無効（外部の事前ゲート）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    h.checkExternalAvailable.mockResolvedValue(false)
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(promptField(), { target: { value: 'p' } })
    // 外部方式へ切替えたときに初めて CLI 可用性チェックが走る（builtin 時は spawn しない）
    fireEvent.click(screen.getByRole('button', { name: '外部（Claude Code CLI）' }))
    await waitFor(() => expect(h.checkExternalAvailable).toHaveBeenCalled())
    expect(generateButton().disabled).toBe(true)
  })
})

describe('SlideEditor への生成結果の全体置換注入（FR-004/DC-005）', () => {
  beforeEach(() => {
    h.setGenerationEnabled.mockClear()
    h.getVertexConfig.mockReset().mockResolvedValue(null)
    h.getVertexStatus.mockReset().mockResolvedValue({ configured: true })
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
    await waitFor(() => expect(generateButton().disabled).toBe(false))
    fireEvent.click(generateButton())

    // 差分確認ダイアログが開く → [適用する] で整形して全体置換され、meta.title がフォームへ反映される（①）
    await waitFor(() => expect(screen.getByRole('button', { name: '適用する' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '適用する' }))
    await waitFor(() => expect(screen.getByDisplayValue('GENERATED')).toBeTruthy())
  })

  it('生成成功でも差分確認で [キャンセル] なら器は変更されない（①・FR-008）', async () => {
    const generated = JSON.stringify({ meta: { title: 'GENERATED' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    h.generateSlides.mockResolvedValue({ outcome: 'succeeded', slidesJson: generated, validationErrors: [], attempts: 1 })

    render(
      <Wrapper>
        <SlideEditor source={{ rawText: VALID, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )

    expandPanel()
    fireEvent.change(screen.getByLabelText('プロンプト'), { target: { value: 'p' } })
    await waitFor(() => expect(generateButton().disabled).toBe(false))
    fireEvent.click(generateButton())

    // ダイアログの [キャンセル] で候補を破棄。器の title は元の 'T' のまま（GENERATED は反映されない）
    await waitFor(() => expect(screen.getByRole('button', { name: 'キャンセル' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    await waitFor(() => expect(screen.queryByDisplayValue('GENERATED')).toBeNull())
    expect(screen.getByDisplayValue('T')).toBeTruthy()
  })

  it('exhausted で残る validationErrors が差分確認ダイアログに表示される（#47）', async () => {
    const generated = JSON.stringify({ meta: { title: 'GENERATED' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    const validationErrors = [{ path: 'slides[0].content.title', message: '必須項目です', expected: 'string', actual: 'undefined' }]
    h.generateSlides.mockResolvedValue({ outcome: 'exhausted', slidesJson: generated, validationErrors, attempts: 3 })

    render(
      <Wrapper>
        <SlideEditor source={{ rawText: VALID, baseDir: '' }} onExit={() => {}} />
      </Wrapper>,
    )

    expandPanel()
    fireEvent.change(screen.getByLabelText('プロンプト'), { target: { value: 'AI の歴史' } })
    await waitFor(() => expect(generateButton().disabled).toBe(false))
    fireEvent.click(generateButton())

    await waitFor(() => expect(screen.getByRole('button', { name: '適用する' })).toBeTruthy())
    expect(screen.getByText('検証エラー (1)')).toBeTruthy()
    expect(screen.getByText(/slides\[0\]\.content\.title/)).toBeTruthy()
  })
})
