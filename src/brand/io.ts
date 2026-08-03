import { invoke } from '@tauri-apps/api/core'
import { message, open } from '@tauri-apps/plugin-dialog'
import type { BrandOverrides, BrandProfile } from './types'

/**
 * ファイル選択ダイアログで OOXML テンプレート（.pptx/.potx/.thmx）を選び、Rust 側（#167）で
 * ブランド情報を抽出する。キャンセル・抽出失敗はいずれも `null`（失敗時はエラーダイアログを表示する）。
 */
export async function pickBrandTemplate(): Promise<BrandProfile | null> {
  const selected = await open({
    title: 'ブランドテンプレートを選択',
    filters: [{ name: 'PowerPoint テーマ (.pptx/.potx/.thmx)', extensions: ['pptx', 'potx', 'thmx'] }],
    multiple: false,
    directory: false,
  })
  if (!selected || Array.isArray(selected)) return null

  try {
    return await invoke<BrandProfile>('extract_brand_profile', { templatePath: selected })
  } catch (error) {
    await message(error instanceof Error ? error.message : String(error), { title: 'テンプレートを読み込めませんでした', kind: 'error' })
    return null
  }
}

/** テンプレートハッシュに対応する保存済みの上書きを取得する（同一テンプレートの再取り込みで人手修正を復元する）。未保存・取得失敗は空オブジェクト */
export async function loadBrandOverrides(templateHash: string): Promise<BrandOverrides> {
  try {
    const value = await invoke<BrandOverrides | null>('load_brand_overrides', { templateHash })
    return value ?? {}
  } catch (error) {
    console.error('[brand] 保存済みの上書きを取得できませんでした', error)
    return {}
  }
}

/** テンプレートハッシュをキーに上書きを保存する。保存失敗は取り込み自体を止めないため握り潰す（次回再取り込み時に空へ戻るだけ） */
export async function saveBrandOverrides(templateHash: string, overrides: BrandOverrides): Promise<void> {
  try {
    await invoke('save_brand_overrides', { templateHash, overrides })
  } catch (error) {
    console.error('[brand] 上書きの保存に失敗しました', error)
  }
}
