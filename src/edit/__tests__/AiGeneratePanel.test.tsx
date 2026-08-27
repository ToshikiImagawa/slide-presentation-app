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
  getClaudeCliConfig: vi.fn(),
  setClaudeCliConfig: vi.fn().mockResolvedValue(undefined),
  clearClaudeCliConfig: vi.fn().mockResolvedValue(undefined),
  gcloudLogin: vi.fn().mockResolvedValue(undefined),
}))
// toGeneratedCandidate は invoke 非依存の純粋関数のため実装をそのまま使う（手動再実装によるドリフトを避ける）
vi.mock('../../aiGenerate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../aiGenerate')>()),
  setGenerationEnabled: h.setGenerationEnabled,
  getVertexConfig: h.getVertexConfig,
  getVertexStatus: h.getVertexStatus,
  checkExternalAvailable: h.checkExternalAvailable,
  generateSlides: h.generateSlides,
  cancelGenerate: h.cancelGenerate,
  setVertexConfig: h.setVertexConfig,
  clearVertexConfig: h.clearVertexConfig,
  getClaudeCliConfig: h.getClaudeCliConfig,
  setClaudeCliConfig: h.setClaudeCliConfig,
  clearClaudeCliConfig: h.clearClaudeCliConfig,
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
// THEME_COLOR_TOKENS/getContrastRatio 等は SlideEditor 経由の brand/compile（#168）が使うため実装を残す（importOriginal）。
// DOM を書き換える関数のみモックする
vi.mock('../../applyTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../applyTheme')>()
  return { ...actual, applyTheme: vi.fn().mockResolvedValue(undefined), applyThemeData: vi.fn(), resetThemeOverrides: vi.fn(), applyPresentationTheme: vi.fn().mockResolvedValue(true) }
})
vi.mock('../../localSlideLoader', () => ({ resolveLocalAssetPaths: (v: unknown) => v, getPackageAddonNames: () => Promise.resolve([]), getPackageIdentity: () => Promise.resolve(null) }))

// 見た目チェック（オフスクリーンDOM実測）は jsdom では意味のある結果が出ないため、
// checkAllSlidesVisually 自体はモックしてオーケストレーション（ボタン→check→repairFeedback→generateSlides→
// 再check→onApply）のみを検証する。deriveCheckableDeck/summarizeVisualCheckWarnings は実装をそのまま使う
// （純粋関数で、単体テストは checkAllSlidesVisually.test.tsx が別に持つ）
const v = vi.hoisted(() => ({ checkAllSlidesVisually: vi.fn() }))
vi.mock('../checkAllSlidesVisually', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../checkAllSlidesVisually')>()),
  checkAllSlidesVisually: v.checkAllSlidesVisually,
}))

import { AiGeneratePanel } from '../AiGeneratePanel'
import { SlideEditor } from '../SlideEditor'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'

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
function visualCheckButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '見た目をチェックして修正' }) as HTMLButtonElement
}

describe('AiGeneratePanel 事前ゲート・退避（Vertex・FR-007/FR-008）', () => {
  beforeEach(() => {
    h.setGenerationEnabled.mockClear()
    h.getVertexConfig.mockReset().mockResolvedValue(null)
    h.getVertexStatus.mockReset().mockResolvedValue({ configured: false })
    h.checkExternalAvailable.mockReset().mockResolvedValue(false)
    h.generateSlides.mockReset()
    h.getClaudeCliConfig.mockReset().mockResolvedValue(null)
    h.setClaudeCliConfig.mockReset().mockResolvedValue(undefined)
    h.clearClaudeCliConfig.mockReset().mockResolvedValue(undefined)
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

  it('defaultExpanded=true のとき初期状態から展開されている（#42 AIで新規作成）', async () => {
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} defaultExpanded />
      </Wrapper>,
    )
    await waitFor(() => expect(h.getVertexStatus).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'AI 生成' }).getAttribute('aria-expanded')).toBe('true')
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

  it('failed では失敗理由（errorMessage）をステータスに表示する（#151）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    h.generateSlides.mockResolvedValue({
      outcome: 'failed',
      slidesJson: null,
      validationErrors: [],
      attempts: 1,
      errorMessage: '外部生成エラー: claude が異常終了しました（exit 1）',
    })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.change(promptField(), { target: { value: 'p' } })
    await waitFor(() => expect(generateButton().disabled).toBe(false))
    fireEvent.click(generateButton())
    await waitFor(() => expect(screen.getByText(/外部生成エラー: claude が異常終了しました/)).toBeTruthy())
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

  it('外部方式で環境変数を追加して保存すると setClaudeCliConfig が呼ばれる（#152）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.click(screen.getByRole('button', { name: '外部（Claude Code CLI）' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))
    fireEvent.change(screen.getByLabelText('変数名'), { target: { value: 'CLAUDE_CONFIG_DIR' } })
    fireEvent.change(screen.getByLabelText('値'), { target: { value: '/Users/x/.claude-work' } })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    await waitFor(() =>
      expect(h.setClaudeCliConfig).toHaveBeenCalledWith({
        envVars: [{ key: 'CLAUDE_CONFIG_DIR', value: '/Users/x/.claude-work' }],
      }),
    )
  })

  it('未入力の変数名の行は保存時に破棄される（#152）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.click(screen.getByRole('button', { name: '外部（Claude Code CLI）' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    await waitFor(() => expect(h.setClaudeCliConfig).toHaveBeenCalledWith({ envVars: [] }))
  })

  it('既存の環境変数設定が読み込まれ、削除ボタンで行を除去できる（#152）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    h.getClaudeCliConfig.mockResolvedValue({ envVars: [{ key: 'CLAUDE_CONFIG_DIR', value: '/tmp/x' }] })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.click(screen.getByRole('button', { name: '外部（Claude Code CLI）' }))
    await waitFor(() => expect(screen.getByDisplayValue('CLAUDE_CONFIG_DIR')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '行を削除' }))
    expect(screen.queryByDisplayValue('CLAUDE_CONFIG_DIR')).toBeNull()
  })

  it('設定を削除すると clearClaudeCliConfig が呼ばれる（#152）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: true })
    h.getClaudeCliConfig.mockResolvedValue({ envVars: [{ key: 'CLAUDE_CONFIG_DIR', value: '/tmp/x' }] })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    fireEvent.click(screen.getByRole('button', { name: '外部（Claude Code CLI）' }))
    await waitFor(() => expect(screen.getByDisplayValue('CLAUDE_CONFIG_DIR')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '設定を削除' }))
    await waitFor(() => expect(h.clearClaudeCliConfig).toHaveBeenCalled())
  })
})

describe('SlideEditor への生成結果の全体置換注入（FR-004/DC-005）', () => {
  beforeEach(() => {
    h.setGenerationEnabled.mockClear()
    h.getVertexConfig.mockReset().mockResolvedValue(null)
    h.getVertexStatus.mockReset().mockResolvedValue({ configured: true })
    h.checkExternalAvailable.mockReset().mockResolvedValue(false)
    h.generateSlides.mockReset()
    h.getClaudeCliConfig.mockReset().mockResolvedValue(null)
    h.setClaudeCliConfig.mockReset().mockResolvedValue(undefined)
    h.clearClaudeCliConfig.mockReset().mockResolvedValue(undefined)
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

describe('全スライドVisualCheck→AI修正ボタン', () => {
  beforeEach(() => {
    h.setGenerationEnabled.mockClear()
    h.getVertexConfig.mockReset().mockResolvedValue(null)
    h.getVertexStatus.mockReset().mockResolvedValue({ configured: true })
    h.checkExternalAvailable.mockReset().mockResolvedValue(false)
    h.generateSlides.mockReset()
    h.getClaudeCliConfig.mockReset().mockResolvedValue(null)
    v.checkAllSlidesVisually.mockReset()
  })

  it('Vertex 未設定なら無効（既存の生成ボタンと同じ事前ゲート）', async () => {
    h.getVertexStatus.mockResolvedValue({ configured: false })
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(h.getVertexStatus).toHaveBeenCalled())
    expect(visualCheckButton().disabled).toBe(true)
  })

  it('currentText がJSON構文エラーの場合、generateSlidesを呼ばず「問題なし」とは異なるエラーを表示する', async () => {
    render(
      <Wrapper>
        <AiGeneratePanel currentText="{ invalid json" onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(visualCheckButton().disabled).toBe(false))
    fireEvent.click(visualCheckButton())

    await waitFor(() => expect(screen.getByText('JSON に構文エラーがあるため見た目チェックを実行できません')).toBeTruthy())
    expect(screen.queryByText('見た目の問題は見つかりませんでした')).toBeNull()
    expect(h.generateSlides).not.toHaveBeenCalled()
    expect(v.checkAllSlidesVisually).not.toHaveBeenCalled()
  })

  it('警告0件なら generateSlides を呼ばずに「問題なし」を表示する', async () => {
    v.checkAllSlidesVisually.mockResolvedValue([])
    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={() => {}} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(visualCheckButton().disabled).toBe(false))
    fireEvent.click(visualCheckButton())

    await waitFor(() => expect(screen.getByText('見た目の問題は見つかりませんでした')).toBeTruthy())
    expect(h.generateSlides).not.toHaveBeenCalled()
  })

  it('警告があれば repairFeedback 付きで generateSlides を呼び、再チェックで0件になれば onApply して完了を表示する', async () => {
    const fixed = JSON.stringify({ meta: { title: 'FIXED' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    v.checkAllSlidesVisually.mockResolvedValueOnce([{ index: 0, slideId: 's1', warnings: ['内部クリッピング: 見出しが隠れています'] }]).mockResolvedValueOnce([])
    h.generateSlides.mockResolvedValue({ outcome: 'succeeded', slidesJson: fixed, validationErrors: [], attempts: 1 })
    const onApply = vi.fn()

    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(visualCheckButton().disabled).toBe(false))
    fireEvent.click(visualCheckButton())

    await waitFor(() => expect(h.generateSlides).toHaveBeenCalled())
    const call = h.generateSlides.mock.calls[0][0]
    expect(call.baseSlides).toBe(VALID)
    expect(call.promptIntent).toBe('change-instruction')
    expect(call.repairFeedback).toContain('内部クリッピング: 見出しが隠れています')

    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ slidesJson: fixed, validationErrors: [] }))
    expect(screen.getByText('見た目の問題を修正しました。差分を確認して適用してください')).toBeTruthy()
    expect(v.checkAllSlidesVisually).toHaveBeenCalledTimes(2)
  })

  it('AI 修正後も警告が残る場合、残数を表示しつつ onApply する', async () => {
    const stillBad = JSON.stringify({ meta: { title: 'STILL' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    v.checkAllSlidesVisually
      .mockResolvedValueOnce([{ index: 0, slideId: 's1', warnings: ['はみ出し'] }])
      .mockResolvedValueOnce([{ index: 0, slideId: 's1', warnings: ['はみ出し'] }])
      .mockResolvedValueOnce([{ index: 0, slideId: 's1', warnings: ['はみ出し'] }])
    h.generateSlides.mockResolvedValue({ outcome: 'succeeded', slidesJson: stillBad, validationErrors: [], attempts: 1 })
    const onApply = vi.fn()

    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(visualCheckButton().disabled).toBe(false))
    fireEvent.click(visualCheckButton())

    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(screen.getByText('1 件の見た目の警告が残っています。差分を確認してください')).toBeTruthy()
    // MAX_VISUAL_FIX_ROUNDS=2 のため generateSlides は2回まで（無限リトライしない）
    expect(h.generateSlides).toHaveBeenCalledTimes(2)
  })

  it('generateSlides が failed なら onApply を呼ばずエラーを表示する（器を破壊しない・FR-008）', async () => {
    v.checkAllSlidesVisually.mockResolvedValue([{ index: 0, slideId: 's1', warnings: ['はみ出し'] }])
    h.generateSlides.mockResolvedValue({ outcome: 'failed', slidesJson: null, validationErrors: [], attempts: 1, errorMessage: '外部生成エラー' })
    const onApply = vi.fn()

    render(
      <Wrapper>
        <AiGeneratePanel currentText={VALID} onApply={onApply} />
      </Wrapper>,
    )
    expandPanel()
    await waitFor(() => expect(visualCheckButton().disabled).toBe(false))
    fireEvent.click(visualCheckButton())

    await waitFor(() => expect(screen.getByText(/生成に失敗しました/)).toBeTruthy())
    expect(onApply).not.toHaveBeenCalled()
  })
})
