/**
 * macOS ウィンドウ枠の合成ユーティリティ。
 *
 * ブラウザ撮影はコンテンツのみで、ネイティブのタイトルバー（信号機ボタン +
 * 中央タイトル）と角丸ウィンドウを描画できない。現行スクショの見た目に揃えるため、
 * 撮影後に以下を合成する:
 *   1. タイトルバーを WebKit で一度だけレンダリングして PNG 化（フォントを実機に合わせる）
 *   2. [タイトルバー; コンテンツ] を縦に連結
 *   3. 4 隅を角丸（外側を透過）にする
 */
/* global document */
import { PNG } from 'pngjs'

const TITLE = 'Slide Presentation App'
const BAR_LOGICAL_HEIGHT = 28 // 論理px
const CORNER_RADIUS = 22 // 出力画像のpx（DSF 適用後）

/** タイトルバー HTML を WebKit でレンダリングして PNG バッファを返す（DSF 適用済み実ピクセル） */
export async function renderTitleBar(browser, contentWidthPx, dsf = 2) {
  const logicalWidth = Math.round(contentWidthPx / dsf)
  const context = await browser.newContext({
    viewport: { width: logicalWidth, height: BAR_LOGICAL_HEIGHT },
    deviceScaleFactor: dsf,
  })
  const page = await context.newPage()
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: ${BAR_LOGICAL_HEIGHT}px; overflow: hidden; }
      .bar {
        height: ${BAR_LOGICAL_HEIGHT}px; display: flex; align-items: center;
        background: #ebebeb; border-bottom: 1px solid #d6d6d6;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
      }
      .lights { display: flex; gap: 8px; padding-left: 12px; }
      .lights span { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
      .r { background: #ff5f57; } .y { background: #febc2e; } .g { background: #28c840; }
      .title {
        position: absolute; left: 0; right: 0; text-align: center;
        font-size: 13px; color: #4a4a4a; font-weight: 500; pointer-events: none;
      }
    </style></head><body>
      <div class="bar">
        <div class="lights"><span class="r"></span><span class="y"></span><span class="g"></span></div>
        <div class="title">${TITLE}</div>
      </div>
    </body></html>`,
  )
  await page.evaluate(() => document.fonts.ready)
  // clip は CSS px 指定。出力は deviceScaleFactor 倍にスケールされる。
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: logicalWidth, height: BAR_LOGICAL_HEIGHT } })
  await context.close()
  return buf
}

/** [バー; コンテンツ] を縦連結し、4 隅を角丸（透過）にした PNG バッファを返す */
export function compositeChrome(contentBuffer, barBuffer, { radius = CORNER_RADIUS } = {}) {
  const content = PNG.sync.read(contentBuffer)
  const bar = PNG.sync.read(barBuffer)

  const width = content.width
  const barH = Math.round((bar.height * width) / bar.width) // バー幅をコンテンツ幅に合わせた高さ
  const out = new PNG({ width, height: barH + content.height })

  // バーを上部へ（幅が一致している前提。念のため最近傍でスケール）
  for (let y = 0; y < barH; y++) {
    const srcY = Math.min(bar.height - 1, Math.floor((y * bar.height) / barH))
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(bar.width - 1, Math.floor((x * bar.width) / width))
      const s = (bar.width * srcY + srcX) << 2
      const d = (out.width * y + x) << 2
      out.data[d] = bar.data[s]
      out.data[d + 1] = bar.data[s + 1]
      out.data[d + 2] = bar.data[s + 2]
      out.data[d + 3] = bar.data[s + 3]
    }
  }
  // コンテンツを下部へ
  for (let y = 0; y < content.height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (content.width * y + x) << 2
      const d = (out.width * (y + barH) + x) << 2
      out.data[d] = content.data[s]
      out.data[d + 1] = content.data[s + 1]
      out.data[d + 2] = content.data[s + 2]
      out.data[d + 3] = content.data[s + 3]
    }
  }

  // 4 隅を角丸（外側を透過）
  roundCorners(out, radius)
  return PNG.sync.write(out)
}

function roundCorners(png, radius) {
  const { width, height, data } = png
  const corners = [
    { cx: radius, cy: radius, sx: -1, sy: -1 }, // 左上
    { cx: width - radius, cy: radius, sx: 1, sy: -1 }, // 右上
    { cx: radius, cy: height - radius, sx: -1, sy: 1 }, // 左下
    { cx: width - radius, cy: height - radius, sx: 1, sy: 1 }, // 右下
  ]
  for (const { cx, cy, sx, sy } of corners) {
    for (let dy = 0; dy < radius; dy++) {
      for (let dx = 0; dx < radius; dx++) {
        const x = cx + sx * dx
        const y = cy + sy * dy
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        const dist = Math.hypot(dx, dy)
        if (dist > radius) {
          const idx = (width * y + x) << 2
          data[idx + 3] = 0 // 透過
        }
      }
    }
  }
}
