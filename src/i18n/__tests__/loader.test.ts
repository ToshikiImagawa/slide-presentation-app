import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadLocales, validateLocaleResource } from '../loader'
import type { LocaleResource } from '../types'

describe('validateLocaleResource', () => {
  const validResource: LocaleResource = {
    languageCode: 'en-US',
    languageName: 'English',
    ui: {
      settings: { title: 'Settings', language: 'Language', close: 'Close' },
    },
  }

  it('正常なリソースでvalidがtrueを返す', () => {
    const result = validateLocaleResource(validResource)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('languageCodeが欠落している場合、エラーを報告する', () => {
    const invalid = { ...validResource, languageCode: '' }
    const result = validateLocaleResource(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'languageCode')).toBe(true)
  })

  it('languageNameが欠落している場合、エラーを報告する', () => {
    const invalid = { ...validResource, languageName: '' }
    const result = validateLocaleResource(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'languageName')).toBe(true)
  })

  it('uiフィールドが欠落している場合、エラーを報告する', () => {
    const invalid = { languageCode: 'en-US', languageName: 'English' } as unknown as LocaleResource
    const result = validateLocaleResource(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'ui')).toBe(true)
  })
})

describe('loadLocales', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('言語リソースを読み込んでLocaleResource[]を返す', async () => {
    const enUS: LocaleResource = {
      languageCode: 'en-US',
      languageName: 'English',
      ui: { settings: { title: 'Settings', language: 'Language', close: 'Close' } },
    }
    const jaJP: LocaleResource = {
      languageCode: 'ja-JP',
      languageName: '日本語',
      ui: { settings: { title: '設定', language: '言語', close: '閉じる' } },
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('manifest.json')) {
        return Promise.resolve(new Response(JSON.stringify({ locales: ['en-US.json', 'ja-JP.json'] })))
      }
      if (url.includes('en-US.json')) {
        return Promise.resolve(new Response(JSON.stringify(enUS)))
      }
      if (url.includes('ja-JP.json')) {
        return Promise.resolve(new Response(JSON.stringify(jaJP)))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })

    const locales = await loadLocales()
    expect(locales).toHaveLength(2)
    expect(locales.find((l) => l.languageCode === 'en-US')).toBeDefined()
    expect(locales.find((l) => l.languageCode === 'ja-JP')).toBeDefined()
  })

  it('マニフェスト取得失敗時は空配列を返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }))
    const locales = await loadLocales()
    expect(locales).toEqual([])
  })

  it('不正なJSONリソースをスキップし、警告をコンソール出力する', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalidResource = { languageCode: '', languageName: '', ui: {} }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('manifest.json')) {
        return Promise.resolve(new Response(JSON.stringify({ locales: ['bad.json'] })))
      }
      if (url.includes('bad.json')) {
        return Promise.resolve(new Response(JSON.stringify(invalidResource)))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })

    const locales = await loadLocales()
    expect(locales).toEqual([])
    expect(consoleSpy).toHaveBeenCalled()
  })
})
