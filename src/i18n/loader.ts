import type { LocaleResource, LocaleValidationResult } from './types'

const LOCALES_BASE_PATH = '/assets/locales'

/** 言語リソースJSONの構造を検証する（D-002準拠） */
export function validateLocaleResource(resource: LocaleResource): LocaleValidationResult {
  const errors: LocaleValidationResult['errors'] = []

  if (!resource.languageCode) {
    errors.push({ path: 'languageCode', message: 'languageCode is required', expected: 'non-empty string', actual: String(resource.languageCode) })
  }
  if (!resource.languageName) {
    errors.push({ path: 'languageName', message: 'languageName is required', expected: 'non-empty string', actual: String(resource.languageName) })
  }
  if (!resource.ui || typeof resource.ui !== 'object') {
    errors.push({ path: 'ui', message: 'ui is required and must be an object', expected: 'object', actual: typeof resource.ui })
  }

  return {
    valid: errors.length === 0,
    errors,
    resource,
  }
}

/** assets/locales/ 配下の言語リソースJSONを読み込み・検証する */
export async function loadLocales(): Promise<LocaleResource[]> {
  try {
    const manifestRes = await fetch(`${LOCALES_BASE_PATH}/manifest.json`)
    if (!manifestRes.ok) return []

    const manifest: { locales: string[] } = await manifestRes.json()
    const results: LocaleResource[] = []

    for (const filename of manifest.locales) {
      try {
        const res = await fetch(`${LOCALES_BASE_PATH}/${filename}`)
        if (!res.ok) continue

        const resource: LocaleResource = await res.json()
        const validation = validateLocaleResource(resource)

        if (!validation.valid) {
          console.warn(`[i18n] Locale resource "${filename}" has validation errors:`, validation.errors)
          continue
        }

        results.push(resource)
      } catch {
        console.warn(`[i18n] Failed to load locale resource: ${filename}`)
      }
    }

    return results
  } catch {
    return []
  }
}
