import { setCurrentAddonOwner } from './addon-bridge'

/** アドオン manifest の形式（組み込み・パッケージ同梱で共通） */
export type AddonManifest = {
  addons: Array<{ name: string; bundle: string }>
}

/**
 * 注入済みの script 要素を src ごとに保持する。
 * 同一 src を再ロードする際は旧要素を除去してから再注入することで、
 * DOM への重複蓄積を防ぎつつ（冪等）、owner 切替後の再登録を可能にする。
 */
const injectedScripts = new Map<string, HTMLScriptElement>()

/** 単一のアドオンバンドルを script タグで注入し、onload まで待つ。同一 src の旧要素は事前に除去する */
function loadAddonScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const previous = injectedScripts.get(src)
    if (previous) previous.remove()

    const script = document.createElement('script')
    script.src = src
    script.dataset.addonSrc = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load addon: ${src}`))
    injectedScripts.set(src, script)
    document.head.appendChild(script)
  })
}

/**
 * 指定 owner のスコープで一連のアドオンバンドルをロードする。
 * ロード中は addon-bridge の currentOwner を owner に設定し、
 * バンドルが呼び出す __ADDON_REGISTER__ の登録がその owner に紐づくようにする。
 */
export async function loadAddonScripts(scripts: string[], owner: string): Promise<void> {
  if (scripts.length === 0) return
  setCurrentAddonOwner(owner)
  try {
    await Promise.all(scripts.map(loadAddonScript))
  } finally {
    setCurrentAddonOwner(undefined)
  }
}

/**
 * ビルド時同梱の組み込みアドオン（/addons/manifest.json）をロードする。
 * 組み込みアドオンはアプリのライフタイム全体で有効なため owner を持たない。
 * manifest が存在しない・ロード失敗時はフォールバック（アドオンなし）。
 */
export async function loadBuiltinAddons(): Promise<void> {
  try {
    const res = await fetch('/addons/manifest.json')
    if (!res.ok) return
    const manifest: AddonManifest = await res.json()
    setCurrentAddonOwner(undefined)
    await Promise.all(manifest.addons.map((addon) => loadAddonScript(addon.bundle)))
  } catch {
    // manifest が存在しない、またはロード失敗時はフォールバック（アドオンなし）
  }
}
