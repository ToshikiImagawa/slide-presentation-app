import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { I18nProvider, useI18n, useTranslation } from '../i18nProvider'
import type { LocaleResource } from '../types'
import type { ReactNode } from 'react'

const enUS: LocaleResource = {
  languageCode: 'en-US',
  languageName: 'English',
  ui: {
    settings: { title: 'Settings', language: 'Language', close: 'Close' },
    audio: { play: 'Play audio' },
  },
}

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    settings: { title: '設定', language: '言語', close: '閉じる' },
    audio: { play: '音声を再生' },
  },
}

const locales = [enUS, jaJP]

function createWrapper(props?: { defaultLocale?: string }) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider locales={locales} defaultLocale={props?.defaultLocale}>
        {children}
      </I18nProvider>
    )
  }
}

describe('useTranslation', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('t() がドット記法でキーを解決する', () => {
    const { result } = renderHook(() => useTranslation(), { wrapper: createWrapper({ defaultLocale: 'en-US' }) })
    expect(result.current.t('settings.title')).toBe('Settings')
    expect(result.current.t('audio.play')).toBe('Play audio')
  })

  it('キーが存在しない場合、フォールバック引数を返す', () => {
    const { result } = renderHook(() => useTranslation(), { wrapper: createWrapper({ defaultLocale: 'en-US' }) })
    expect(result.current.t('nonexistent.key', 'Fallback')).toBe('Fallback')
  })

  it('キーが存在せずフォールバックもない場合、キー文字列を返す', () => {
    const { result } = renderHook(() => useTranslation(), { wrapper: createWrapper({ defaultLocale: 'en-US' }) })
    expect(result.current.t('nonexistent.key')).toBe('nonexistent.key')
  })
})

describe('useI18n', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('setLocale() で言語を切り替える', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper({ defaultLocale: 'en-US' }) })
    expect(result.current.locale).toBe('en-US')

    act(() => {
      result.current.setLocale('ja-JP')
    })

    expect(result.current.locale).toBe('ja-JP')
  })

  it('setLocale() で localStorage に保存する', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper({ defaultLocale: 'en-US' }) })

    act(() => {
      result.current.setLocale('ja-JP')
    })

    expect(localStorage.getItem('slide-app-locale')).toBe('ja-JP')
  })

  it('localStorage に保存済みの言語を復元する', () => {
    localStorage.setItem('slide-app-locale', 'ja-JP')
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper() })
    expect(result.current.locale).toBe('ja-JP')
  })

  it('言語切り替え後にt()が新しい言語のテキストを返す', () => {
    const { result: i18nResult } = renderHook(() => useI18n(), { wrapper: createWrapper({ defaultLocale: 'en-US' }) })
    renderHook(() => useTranslation(), { wrapper: createWrapper({ defaultLocale: 'en-US' }) })

    act(() => {
      i18nResult.current.setLocale('ja-JP')
    })
    expect(i18nResult.current.locale).toBe('ja-JP')
  })

  it('ブラウザ言語がサポート言語に一致する場合、その言語を使用する', () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'ja-JP' })
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper() })
    expect(result.current.locale).toBe('ja-JP')
  })

  it('ブラウザ言語がプレフィックスで一致する場合、その言語を使用する', () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'ja' })
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper() })
    expect(result.current.locale).toBe('ja-JP')
  })

  it('ブラウザ言語が非対応の場合、en-USをフォールバックとして使用する', () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'fr-FR' })
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper() })
    expect(result.current.locale).toBe('en-US')
  })

  it('locales一覧が提供される', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper({ defaultLocale: 'en-US' }) })
    expect(result.current.locales).toHaveLength(2)
  })
})
