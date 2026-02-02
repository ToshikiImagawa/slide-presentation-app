import { describe, expect, it, vi } from 'vitest'
import { getValidationErrors, loadPresentationData, validatePresentationData } from '../loader'
import type { PresentationData } from '../types'

const validData: PresentationData = {
  meta: { title: 'Test Presentation' },
  slides: [
    {
      id: 'slide1',
      layout: 'title',
      content: { title: 'Hello' },
    },
  ],
}

const defaultData: PresentationData = {
  meta: { title: 'Default' },
  slides: [
    {
      id: 'default1',
      layout: 'title',
      content: { title: 'Default Title' },
    },
  ],
}

describe('validatePresentationData', () => {
  it('有効なデータに対してtrueを返す', () => {
    expect(validatePresentationData(validData)).toBe(true)
  })

  it('nullに対してfalseを返す', () => {
    expect(validatePresentationData(null)).toBe(false)
  })

  it('undefinedに対してfalseを返す', () => {
    expect(validatePresentationData(undefined)).toBe(false)
  })

  it('文字列に対してfalseを返す', () => {
    expect(validatePresentationData('not an object')).toBe(false)
  })

  it('metaがないデータに対してfalseを返す', () => {
    expect(validatePresentationData({ slides: [] })).toBe(false)
  })

  it('meta.titleがないデータに対してfalseを返す', () => {
    expect(validatePresentationData({ meta: {}, slides: [{ id: 'a', layout: 'b', content: {} }] })).toBe(false)
  })

  it('slidesが配列でないデータに対してfalseを返す', () => {
    expect(validatePresentationData({ meta: { title: 'Test' }, slides: 'not array' })).toBe(false)
  })

  it('空のslides配列に対してfalseを返す', () => {
    expect(validatePresentationData({ meta: { title: 'Test' }, slides: [] })).toBe(false)
  })

  it('スライドにidがない場合falseを返す', () => {
    expect(validatePresentationData({ meta: { title: 'Test' }, slides: [{ layout: 'a', content: {} }] })).toBe(false)
  })

  it('スライドにlayoutがない場合falseを返す', () => {
    expect(validatePresentationData({ meta: { title: 'Test' }, slides: [{ id: 'a', content: {} }] })).toBe(false)
  })

  it('スライドにcontentがない場合falseを返す', () => {
    expect(validatePresentationData({ meta: { title: 'Test' }, slides: [{ id: 'a', layout: 'b' }] })).toBe(false)
  })
})

describe('getValidationErrors', () => {
  it('有効なデータに対して空配列を返す', () => {
    expect(getValidationErrors(validData)).toEqual([])
  })

  it('エラーにパス情報を含む', () => {
    const errors = getValidationErrors({ meta: { title: '' }, slides: [{ id: '', layout: 'b', content: {} }] })
    const idError = errors.find((e) => e.path === 'slides[0].id')
    expect(idError).toBeDefined()
    expect(idError?.message).toContain('空でない文字列')
  })

  it('複数のエラーを検出する', () => {
    const errors = getValidationErrors({})
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })

  it('meta.titleが空文字の場合エラーを返す', () => {
    const errors = getValidationErrors({
      meta: { title: '' },
      slides: [{ id: 'a', layout: 'b', content: {} }],
    })
    expect(errors.some((e) => e.path === 'meta.title')).toBe(true)
  })

  it('notes.voiceがstringの場合エラーを返さない', () => {
    const errors = getValidationErrors({
      meta: { title: 'Test' },
      slides: [{ id: 'a', layout: 'b', content: {}, meta: { notes: { speakerNotes: 'ノート', voice: '/audio/test.mp3' } } }],
    })
    expect(errors.some((e) => e.path.includes('voice'))).toBe(false)
  })

  it('notes.voiceがundefinedの場合エラーを返さない', () => {
    const errors = getValidationErrors({
      meta: { title: 'Test' },
      slides: [{ id: 'a', layout: 'b', content: {}, meta: { notes: { speakerNotes: 'ノート' } } }],
    })
    expect(errors.some((e) => e.path.includes('voice'))).toBe(false)
  })

  it('notes.voiceがstring以外の場合エラーを返す', () => {
    const errors = getValidationErrors({
      meta: { title: 'Test' },
      slides: [{ id: 'a', layout: 'b', content: {}, meta: { notes: { voice: 123 } } }],
    })
    expect(errors.some((e) => e.path === 'slides[0].meta.notes.voice')).toBe(true)
  })
})

describe('loadPresentationData', () => {
  it('有効なデータをそのまま返す', () => {
    const result = loadPresentationData(validData, defaultData)
    expect(result).toBe(validData)
  })

  it('undefinedの場合デフォルトデータを返す', () => {
    const result = loadPresentationData(undefined, defaultData)
    expect(result).toBe(defaultData)
  })

  it('不正なデータの場合デフォルトデータにフォールバックする', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const invalidData = { meta: { title: '' }, slides: [] } as unknown as PresentationData
    const result = loadPresentationData(invalidData, defaultData)

    expect(result).toBe(defaultData)
    expect(consoleSpy).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('フォールバック'))

    consoleSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
