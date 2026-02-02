/** 言語リソースの構造 */
export interface LocaleResource {
  languageCode: string
  languageName: string
  ui: Record<string, string | Record<string, string>>
}

/** i18nコンテキストの公開インターフェース */
export interface I18nContextValue {
  locale: string
  locales: LocaleResource[]
  setLocale: (code: string) => void
  t: (key: string, fallback?: string) => string
}

/** バリデーション結果 */
export interface LocaleValidationResult {
  valid: boolean
  errors: Array<{
    path: string
    message: string
    expected: string
    actual: string
  }>
  resource: LocaleResource
}
