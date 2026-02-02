import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { I18nContextValue, LocaleResource } from './types'

const STORAGE_KEY = 'slide-app-locale'
const FALLBACK_LOCALE = 'en-US'

const I18nContext = createContext<I18nContextValue | null>(null)

/** ドット記法でネストされたオブジェクトからキーを解決する */
function resolveKey(ui: Record<string, string | Record<string, string>>, key: string): string | undefined {
  const parts = key.split('.')
  if (parts.length === 1) {
    const val = ui[parts[0]]
    return typeof val === 'string' ? val : undefined
  }
  if (parts.length === 2) {
    const section = ui[parts[0]]
    if (typeof section === 'object' && section !== null) {
      return section[parts[1]]
    }
  }
  return undefined
}

/** ブラウザ言語からサポート言語を検出する */
function detectBrowserLocale(locales: LocaleResource[]): string {
  const browserLang = navigator.language

  // 完全一致
  const exact = locales.find((l) => l.languageCode === browserLang)
  if (exact) return exact.languageCode

  // プレフィックス一致（例: "ja" → "ja-JP"）
  const prefix = browserLang.split('-')[0]
  const prefixMatch = locales.find((l) => l.languageCode.startsWith(prefix))
  if (prefixMatch) return prefixMatch.languageCode

  return FALLBACK_LOCALE
}

/** 初期言語を決定する */
function resolveInitialLocale(locales: LocaleResource[], defaultLocale?: string): string {
  // 1. defaultLocale 指定があればそれを使用
  if (defaultLocale && locales.some((l) => l.languageCode === defaultLocale)) {
    return defaultLocale
  }

  // 2. localStorage に保存済みの言語があればそれを使用
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && locales.some((l) => l.languageCode === stored)) {
    return stored
  }

  // 3. ブラウザ言語から検出
  return detectBrowserLocale(locales)
}

type I18nProviderProps = {
  locales: LocaleResource[]
  defaultLocale?: string
  children: ReactNode
}

export function I18nProvider({ locales, defaultLocale, children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState(() => resolveInitialLocale(locales, defaultLocale))

  const setLocale = useCallback(
    (code: string) => {
      if (locales.some((l) => l.languageCode === code)) {
        setLocaleState(code)
        localStorage.setItem(STORAGE_KEY, code)
      }
    },
    [locales],
  )

  const t = useCallback(
    (key: string, fallback?: string): string => {
      // 現在の言語リソースから解決
      const currentResource = locales.find((l) => l.languageCode === locale)
      if (currentResource) {
        const value = resolveKey(currentResource.ui, key)
        if (value !== undefined) return value
      }

      // フォールバック言語（en-US）から解決
      if (locale !== FALLBACK_LOCALE) {
        const fallbackResource = locales.find((l) => l.languageCode === FALLBACK_LOCALE)
        if (fallbackResource) {
          const value = resolveKey(fallbackResource.ui, key)
          if (value !== undefined) return value
        }
      }

      // フォールバック引数またはキー文字列を返す
      return fallback ?? key
    },
    [locales, locale],
  )

  const value = useMemo<I18nContextValue>(() => ({ locale, locales, setLocale, t }), [locale, locales, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

export function useTranslation(): { t: I18nContextValue['t'] } {
  const { t } = useI18n()
  return { t }
}
