import { describe, it, expect, vi, beforeEach } from 'vitest'

// @tauri-apps/api/core の invoke をモックし、Rust の generate_slides / cancel_generation を差し替える。
// parseSlides / getValidationErrors は実物を用い、検証の単一真実源（JS）を実挙動で通す。
const h = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }))

import {
  generateSlides,
  cancelGenerate,
  setVertexConfig,
  clearVertexConfig,
  getVertexConfig,
  getVertexStatus,
  setClaudeCliConfig,
  clearClaudeCliConfig,
  getClaudeCliConfig,
  gcloudLogin,
  setGenerationEnabled,
  checkExternalAvailable,
  toGeneratedCandidate,
  buildThemeConstraintsPrompt,
  MAX_GENERATE_ATTEMPTS,
} from '../aiGenerate'
import type { GenerateProgress, GenerateResult } from '../aiGenerate'

// getValidationErrors を満たす妥当な slides.json
const VALID = JSON.stringify({ meta: { title: 'T' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
// meta.title 空・slides 空でスキーマ検証に失敗する候補
const INVALID = JSON.stringify({ meta: { title: '' }, slides: [] })
// slides が1件だけ妥当性を欠く（INVALID より検証エラーが少ない＝より良い候補）
const LESS_INVALID = JSON.stringify({ meta: { title: 'T' }, slides: [{ id: '', layout: 'center', content: {} }] })
// 構造は不正（INVALID同様）だが theme.colors に不明なキーを含む（getThemeWarnings 対象）
const INVALID_WITH_BAD_THEME = JSON.stringify({ meta: { title: '' }, slides: [], theme: { colors: { primar: '#112233' } } })
// トークン上限による途中切断を模した未終端 JSON（JSON.parse が構文エラー 1 件のみを返す）
const TRUNCATED_JSON = '{"meta":{"title":"T'

const REQ = { prompt: 'AI の歴史', kind: 'builtin-vertex' as const }

describe('aiGenerate オーケストレータ（generateSlides）', () => {
  beforeEach(() => {
    h.invoke.mockReset()
  })

  it('妥当な候補を返すと succeeded で全体を返す（1 試行）', async () => {
    h.invoke.mockResolvedValue({ text: VALID, truncated: false })
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('succeeded')
    expect(result.slidesJson).toBe(VALID)
    expect(result.validationErrors).toEqual([])
    expect(result.attempts).toBe(1)
    // generate_slides に request が渡る（themeConstraints は試行の前に一度だけ組み立てられ、各試行の request に付与される・#211）
    expect(h.invoke).toHaveBeenCalledWith('generate_slides', { request: { ...REQ, repairFeedback: undefined, themeConstraints: buildThemeConstraintsPrompt() } })
  })

  it('検証エラーが続くと上限 N まで試行し exhausted で最良候補を退避する', async () => {
    // 1回目 INVALID(2件) → 2回目 LESS_INVALID(1件) → 3回目 INVALID(2件)。最良は LESS_INVALID
    h.invoke.mockResolvedValueOnce({ text: INVALID, truncated: false }).mockResolvedValueOnce({ text: LESS_INVALID, truncated: false }).mockResolvedValueOnce({ text: INVALID, truncated: false })
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('exhausted')
    expect(result.attempts).toBe(MAX_GENERATE_ATTEMPTS)
    expect(result.slidesJson).toBe(LESS_INVALID)
    expect(result.validationErrors.length).toBeGreaterThan(0)
    expect(h.invoke).toHaveBeenCalledTimes(MAX_GENERATE_ATTEMPTS)
  })

  it('再試行では検証エラー要約を repairFeedback に載せて再投入する（FR-005）', async () => {
    h.invoke.mockResolvedValueOnce({ text: INVALID, truncated: false }).mockResolvedValueOnce({ text: VALID, truncated: false })
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('succeeded')
    expect(result.attempts).toBe(2)
    // 2回目の呼び出しは repairFeedback（非空）付き
    const secondCall = h.invoke.mock.calls[1]
    expect(secondCall[0]).toBe('generate_slides')
    expect(typeof secondCall[1].request.repairFeedback).toBe('string')
    expect(secondCall[1].request.repairFeedback.length).toBeGreaterThan(0)
  })

  it('theme の警告（getThemeWarnings）も repairFeedback に載せて再投入する（#162）', async () => {
    h.invoke.mockResolvedValueOnce({ text: INVALID_WITH_BAD_THEME, truncated: false }).mockResolvedValueOnce({ text: VALID, truncated: false })
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('succeeded')

    const secondCall = h.invoke.mock.calls[1]
    const repairFeedback: string = secondCall[1].request.repairFeedback
    expect(repairFeedback).toContain('theme.colors.primar')
  })

  it('候補が truncated（トークン上限で途中切断）なら repairFeedback に簡潔化の指示を追記する（#310）', async () => {
    h.invoke.mockResolvedValueOnce({ text: TRUNCATED_JSON, truncated: true }).mockResolvedValueOnce({ text: VALID, truncated: false })
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('succeeded')

    const secondCall = h.invoke.mock.calls[1]
    const repairFeedback: string = secondCall[1].request.repairFeedback
    expect(repairFeedback).toContain('トークン上限')
    expect(repairFeedback).toContain('簡潔')
  })

  it('候補が truncated でなければ簡潔化の指示を追記しない（回帰防止）', async () => {
    h.invoke.mockResolvedValueOnce({ text: INVALID, truncated: false }).mockResolvedValueOnce({ text: VALID, truncated: false })
    await generateSlides(REQ)

    const secondCall = h.invoke.mock.calls[1]
    const repairFeedback: string = secondCall[1].request.repairFeedback
    expect(repairFeedback).not.toContain('トークン上限')
  })

  it('exhausted 時、truncated な候補は検証エラーが同数でも非 truncated 候補より best として優先されない', async () => {
    // 1回目 truncated（JSON構文エラー1件のみ・見かけ上は最良） → 2回目 非truncated だが検証エラー1件（LESS_INVALID）
    // → 3回目も truncated。エラー件数は同数（1件）だが、truncated へのペナルティにより
    // 「構文的に妥当な」2回目の候補が best になるべき
    h.invoke.mockResolvedValueOnce({ text: TRUNCATED_JSON, truncated: true }).mockResolvedValueOnce({ text: LESS_INVALID, truncated: false }).mockResolvedValueOnce({ text: TRUNCATED_JSON, truncated: true })
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('exhausted')
    expect(result.slidesJson).toBe(LESS_INVALID)
  })

  it('invoke が reject すると failed で候補を返さない（手動編集へ退避・FR-008）', async () => {
    h.invoke.mockRejectedValue(new Error('生成が有効化されていません'))
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('failed')
    expect(result.slidesJson).toBeNull()
    expect(result.validationErrors).toEqual([])
  })

  it('invoke が reject すると失敗理由を errorMessage に伝播する（#151）', async () => {
    h.invoke.mockRejectedValue(new Error('外部生成エラー: claude が異常終了しました'))
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('failed')
    expect(result.errorMessage).toBe('外部生成エラー: claude が異常終了しました')
  })

  it('reject 値が Error でなければ String化した値を errorMessage にする', async () => {
    h.invoke.mockRejectedValue('プレーン文字列エラー')
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('failed')
    expect(result.errorMessage).toBe('プレーン文字列エラー')
  })

  it('in-flight 完了後に中断されていれば cancelled で候補を適用しない（レビュー修正・FR-008）', async () => {
    // generate_slides が候補を返す直前に中断要求が入ったケースを模す
    h.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'generate_slides') {
        await cancelGenerate() // cancelRequested=true（cancel_generation も同じモックへ）
        return { text: VALID, truncated: false } // 候補は返るが、解決後の再検査で適用されないはず
      }
      return undefined
    })
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('cancelled')
    expect(result.slidesJson).toBeNull()
    expect(result.validationErrors).toEqual([])
  })

  it('invoke が中断で reject した場合は cancelled に分類する', async () => {
    h.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'generate_slides') {
        await cancelGenerate()
        throw new Error('aborted')
      }
      return undefined
    })
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('cancelled')
    expect(result.slidesJson).toBeNull()
  })

  it('onProgress に generating→validating（→repairing）のフェーズを通知する', async () => {
    h.invoke.mockResolvedValueOnce({ text: INVALID, truncated: false }).mockResolvedValueOnce({ text: VALID, truncated: false })
    const phases: GenerateProgress['phase'][] = []
    await generateSlides(REQ, (p) => phases.push(p.phase))
    expect(phases[0]).toBe('generating')
    expect(phases).toContain('validating')
    expect(phases).toContain('repairing')
  })
})

describe('toGeneratedCandidate（GenerateResult → 適用可能候補の抽出・#47）', () => {
  it('succeeded/exhausted かつ slidesJson 非 null なら候補を返す', () => {
    const succeeded: GenerateResult = { outcome: 'succeeded', slidesJson: VALID, validationErrors: [], attempts: 1, errorMessage: null }
    expect(toGeneratedCandidate(succeeded)).toEqual({ slidesJson: VALID, validationErrors: [] })

    const errors = [{ path: 'slides[0]', message: 'x', expected: 'y', actual: 'z' }]
    const exhausted: GenerateResult = { outcome: 'exhausted', slidesJson: LESS_INVALID, validationErrors: errors, attempts: 3, errorMessage: null }
    expect(toGeneratedCandidate(exhausted)).toEqual({ slidesJson: LESS_INVALID, validationErrors: errors })
  })

  it('cancelled/failed または slidesJson が null なら null を返す', () => {
    expect(toGeneratedCandidate({ outcome: 'cancelled', slidesJson: null, validationErrors: [], attempts: 0, errorMessage: null })).toBeNull()
    expect(toGeneratedCandidate({ outcome: 'failed', slidesJson: null, validationErrors: [], attempts: 1, errorMessage: '外部生成エラー: x' })).toBeNull()
    // outcome は succeeded だが slidesJson が null（本来生じない組み合わせだが契約上のガードを確認）
    expect(toGeneratedCandidate({ outcome: 'succeeded', slidesJson: null, validationErrors: [], attempts: 1, errorMessage: null })).toBeNull()
  })
})

describe('aiGenerate invoke ラッパ', () => {
  beforeEach(() => {
    h.invoke.mockReset()
    h.invoke.mockResolvedValue(undefined)
  })

  it('設定・認証・可用性のラッパが対応コマンドを呼ぶ（Vertex）', async () => {
    await setGenerationEnabled(true)
    expect(h.invoke).toHaveBeenCalledWith('set_generation_enabled', { enabled: true })

    const config = { projectId: 'proj', region: 'us-east5', model: 'claude-sonnet-4-5@20250929' }
    await setVertexConfig(config)
    expect(h.invoke).toHaveBeenCalledWith('set_vertex_config', { config })

    await clearVertexConfig()
    expect(h.invoke).toHaveBeenCalledWith('clear_vertex_config')

    h.invoke.mockResolvedValueOnce(config)
    await expect(getVertexConfig()).resolves.toEqual(config)
    expect(h.invoke).toHaveBeenCalledWith('get_vertex_config')

    h.invoke.mockResolvedValueOnce({ configured: true })
    await expect(getVertexStatus()).resolves.toEqual({ configured: true })
    expect(h.invoke).toHaveBeenCalledWith('get_vertex_status')

    await gcloudLogin()
    expect(h.invoke).toHaveBeenCalledWith('gcloud_login')

    h.invoke.mockResolvedValueOnce(true)
    await expect(checkExternalAvailable()).resolves.toBe(true)
    expect(h.invoke).toHaveBeenCalledWith('check_claude_cli')
  })

  it('外部 CLI の環境変数設定ラッパが対応コマンドを呼ぶ（#152）', async () => {
    const config = { envVars: [{ key: 'CLAUDE_CONFIG_DIR', value: '/tmp/claude-work' }] }
    await setClaudeCliConfig(config)
    expect(h.invoke).toHaveBeenCalledWith('set_claude_cli_config', { config })

    await clearClaudeCliConfig()
    expect(h.invoke).toHaveBeenCalledWith('clear_claude_cli_config')

    h.invoke.mockResolvedValueOnce(config)
    await expect(getClaudeCliConfig()).resolves.toEqual(config)
    expect(h.invoke).toHaveBeenCalledWith('get_claude_cli_config')
  })
})

describe('buildThemeConstraintsPrompt（テーマ由来の意匠制約テキスト・#211）', () => {
  it('色トークン名一覧（THEME_COLOR_TOKENS）を含む', () => {
    const prompt = buildThemeConstraintsPrompt()
    expect(prompt).toContain('primary')
    expect(prompt).toContain('series6')
  })

  it('ComponentRegistryの登録名から component.name / tiles[].icon で使用可な名前を分離して含む', async () => {
    const { registerComponent, clearRegistry } = await import('../components/ComponentRegistry')
    clearRegistry()
    registerComponent('TerminalAnimation', () => null)
    registerComponent('Icon:Description', () => null)
    const prompt = buildThemeConstraintsPrompt()
    expect(prompt).toContain('登録済みコンポーネント名（component.name で使用可）: TerminalAnimation')
    expect(prompt).toContain("登録済みアイコン名（tiles[].icon で使用可。'Icon:'接頭辞は付けない）: Description")
  })
})
