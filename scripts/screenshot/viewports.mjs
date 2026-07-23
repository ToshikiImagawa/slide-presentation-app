/**
 * 撮影キーごとの viewport / 出力設定（slide-presentation-app 用）。
 *
 * - width/height は論理px。deviceScaleFactor=2 で出力は 2 倍の実ピクセルになる。
 * - chrome=true の画面は撮影後に macOS ウィンドウ枠（高さ 28 論理px）を上部へ合成する。
 *   そのため非 fullPage の場合、コンテンツの撮影高さは (height - 28) とし、
 *   枠込みで最終的に height（×2 で出力解像度）に揃える。
 */
export const DEVICE_SCALE_FACTOR = 2
export const CHROME_BAR_LOGICAL_HEIGHT = 28

/** メインウィンドウ共通（16:9 相当のデッキ表示に合わせた論理サイズ） */
const MAIN = { width: 1280, height: 720, fullPage: false, chrome: true }

/** 発表者ビューのウィンドウ相当（usePresenterView の既定 1000x700 に合わせる） */
const PRESENTER = { width: 1000, height: 700, fullPage: false, chrome: true }

export const VIEWPORTS = {
  home: { ...MAIN },
  presentation: { ...MAIN },
  settings: { ...MAIN },
  toolbar: { ...MAIN },
  'presenter-view': { ...PRESENTER },

  // レイアウト・ギャラリー / ロゴ
  'layout-section': { ...MAIN },
  'layout-content-steps': { ...MAIN },
  'layout-content-tiles': { ...MAIN },
  'layout-two-column': { ...MAIN },
  'layout-bleed': { ...MAIN },
  'layout-custom': { ...MAIN },
  logo: { ...MAIN },
}

/** 撮影時のコンテンツ viewport 高さ（chrome 合成分を差し引く） */
export function contentViewport(key) {
  const v = VIEWPORTS[key]
  if (!v) throw new Error(`未定義の撮影キー: ${key}`)
  const height = v.chrome && !v.fullPage ? v.height - CHROME_BAR_LOGICAL_HEIGHT : v.height
  return { width: v.width, height, fullPage: v.fullPage, chrome: v.chrome }
}
