/**
 * 撮影キーごとの viewport / 出力設定。
 *
 * - width/height は論理px。deviceScaleFactor=2 で出力は 2 倍の実ピクセルになる。
 * - chrome=true の画面は撮影後に macOS ウィンドウ枠（高さ 28 論理px）を上部へ合成する。
 *   そのため非 fullPage の場合、コンテンツの撮影高さは (height - 28) とし、
 *   枠込みで最終的に height（×2 で現行PNG解像度）に揃える。
 * - setup 系も固定高さ（fullPage=false）で撮る。fullPage だとページ末尾の余白まで
 *   含めてしまい下部が白くなるため、描画可能な高さで切り取る（全体描画はしない）。
 */
export const DEVICE_SCALE_FACTOR = 2
export const CHROME_BAR_LOGICAL_HEIGHT = 28

/** main グループ共通（現行PNG 2254x1838 = 1127x919 論理） */
const MAIN = { width: 1127, height: 919, fullPage: false, chrome: true }

export const VIEWPORTS = {
  // --- main（ダッシュボード/チャット/AIツール系・ダイアログ系）---
  hero: { ...MAIN },
  dashboard: { ...MAIN },
  'ai-chat': { ...MAIN },
  'ai-tool-manager': { ...MAIN },
  'ai-tool-form-editor': { ...MAIN },
  'ai-tool-authoring': { ...MAIN },
  'ai-tool-jql-placeholder': { ...MAIN },
  'ai-tool-hint-dialog': { ...MAIN },
  'ai-tool-buttons': { ...MAIN },
  'ai-tool-sp': { ...MAIN },
  'ai-tool-pr': { ...MAIN },

  // --- setup（オンボーディングダイアログ：ダッシュボード背景＋中央オーバーレイ）---
  // OnboardingDialog 化（#384）に伴い、設定画面内の縦長キャプチャから
  // ダッシュボード背景＋中央ダイアログの構図へ変更。main グループと同じ枠に揃える。
  'setup-credentials': { ...MAIN },
  'setup-mcp': { ...MAIN },
  'setup-projects': { ...MAIN },
}

/** 撮影時のコンテンツ viewport 高さ（chrome 合成分を差し引く） */
export function contentViewport(key) {
  const v = VIEWPORTS[key]
  if (!v) throw new Error(`未定義の撮影キー: ${key}`)
  const height = v.chrome && !v.fullPage ? v.height - CHROME_BAR_LOGICAL_HEIGHT : v.height
  return { width: v.width, height, fullPage: v.fullPage, chrome: v.chrome }
}
