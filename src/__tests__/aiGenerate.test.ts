import { describe, it, expect, vi, beforeEach } from 'vitest'

// @tauri-apps/api/core の invoke をモックし、Rust の generate_slides / cancel_generation を差し替える。
// parseSlides / getValidationErrors は実物を用い、検証の単一真実源（JS）を実挙動で通す。
const h = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }))

import { generateSlides, cancelGenerate, setApiKey, deleteApiKey, getApiKeyStatus, setGenerationEnabled, checkExternalAvailable, MAX_GENERATE_ATTEMPTS } from '../aiGenerate'
import type { GenerateProgress } from '../aiGenerate'

// getValidationErrors を満たす妥当な slides.json
const VALID = JSON.stringify({ meta: { title: 'T' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
// meta.title 空・slides 空でスキーマ検証に失敗する候補
const INVALID = JSON.stringify({ meta: { title: '' }, slides: [] })
// slides が1件だけ妥当性を欠く（INVALID より検証エラーが少ない＝より良い候補）
const LESS_INVALID = JSON.stringify({ meta: { title: 'T' }, slides: [{ id: '', layout: 'center', content: {} }] })

const REQ = { prompt: 'AI の歴史', kind: 'builtin-anthropic' as const }

describe('aiGenerate オーケストレータ（generateSlides）', () => {
  beforeEach(() => {
    h.invoke.mockReset()
  })

  it('妥当な候補を返すと succeeded で全体を返す（1 試行）', async () => {
    h.invoke.mockResolvedValue(VALID)
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('succeeded')
    expect(result.slidesJson).toBe(VALID)
    expect(result.validationErrors).toEqual([])
    expect(result.attempts).toBe(1)
    // generate_slides に request が渡る
    expect(h.invoke).toHaveBeenCalledWith('generate_slides', { request: { ...REQ, repairFeedback: undefined } })
  })

  it('検証エラーが続くと上限 N まで試行し exhausted で最良候補を退避する', async () => {
    // 1回目 INVALID(2件) → 2回目 LESS_INVALID(1件) → 3回目 INVALID(2件)。最良は LESS_INVALID
    h.invoke.mockResolvedValueOnce(INVALID).mockResolvedValueOnce(LESS_INVALID).mockResolvedValueOnce(INVALID)
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('exhausted')
    expect(result.attempts).toBe(MAX_GENERATE_ATTEMPTS)
    expect(result.slidesJson).toBe(LESS_INVALID)
    expect(result.validationErrors.length).toBeGreaterThan(0)
    expect(h.invoke).toHaveBeenCalledTimes(MAX_GENERATE_ATTEMPTS)
  })

  it('再試行では検証エラー要約を repairFeedback に載せて再投入する（FR-005）', async () => {
    h.invoke.mockResolvedValueOnce(INVALID).mockResolvedValueOnce(VALID)
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('succeeded')
    expect(result.attempts).toBe(2)
    // 2回目の呼び出しは repairFeedback（非空）付き
    const secondCall = h.invoke.mock.calls[1]
    expect(secondCall[0]).toBe('generate_slides')
    expect(typeof secondCall[1].request.repairFeedback).toBe('string')
    expect(secondCall[1].request.repairFeedback.length).toBeGreaterThan(0)
  })

  it('invoke が reject すると failed で候補を返さない（手動編集へ退避・FR-008）', async () => {
    h.invoke.mockRejectedValue(new Error('生成が有効化されていません'))
    const result = await generateSlides(REQ)
    expect(result.outcome).toBe('failed')
    expect(result.slidesJson).toBeNull()
    expect(result.validationErrors).toEqual([])
  })

  it('in-flight 完了後に中断されていれば cancelled で候補を適用しない（レビュー修正・FR-008）', async () => {
    // generate_slides が候補を返す直前に中断要求が入ったケースを模す
    h.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'generate_slides') {
        await cancelGenerate() // cancelRequested=true（cancel_generation も同じモックへ）
        return VALID // 候補は返るが、解決後の再検査で適用されないはず
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
    h.invoke.mockResolvedValueOnce(INVALID).mockResolvedValueOnce(VALID)
    const phases: GenerateProgress['phase'][] = []
    await generateSlides(REQ, (p) => phases.push(p.phase))
    expect(phases[0]).toBe('generating')
    expect(phases).toContain('validating')
    expect(phases).toContain('repairing')
  })
})

describe('aiGenerate invoke ラッパ', () => {
  beforeEach(() => {
    h.invoke.mockReset()
    h.invoke.mockResolvedValue(undefined)
  })

  it('setGenerationEnabled / setApiKey / deleteApiKey / getApiKeyStatus / checkExternalAvailable が対応コマンドを呼ぶ', async () => {
    await setGenerationEnabled(true)
    expect(h.invoke).toHaveBeenCalledWith('set_generation_enabled', { enabled: true })

    await setApiKey('sk-ant-xxx')
    expect(h.invoke).toHaveBeenCalledWith('set_api_key', { key: 'sk-ant-xxx' })

    await deleteApiKey()
    expect(h.invoke).toHaveBeenCalledWith('delete_api_key')

    h.invoke.mockResolvedValueOnce({ configured: true, lastUpdated: '2026-07-25T00:00:00Z' })
    await expect(getApiKeyStatus()).resolves.toEqual({ configured: true, lastUpdated: '2026-07-25T00:00:00Z' })
    expect(h.invoke).toHaveBeenCalledWith('has_api_key')

    h.invoke.mockResolvedValueOnce(true)
    await expect(checkExternalAvailable()).resolves.toBe(true)
    expect(h.invoke).toHaveBeenCalledWith('check_claude_cli')
  })
})
